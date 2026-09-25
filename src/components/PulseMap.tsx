"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoArea, geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import type { MapLayer, Ward, WardProfile, YearData } from "@/lib/pulse-types";
import { partyColor, tribeColors, winningParties } from "@/lib/pulse-colors";

type Props = {
  wards: Ward[];
  geometry: FeatureCollection<Geometry>;
  data: YearData;
  profiles: WardProfile[];
  layer: MapLayer;
  winningParty: string;
  sdpContestedOnly: boolean;
  selected: string;
  onSelect: (code: string) => void;
};

const pct = (value: number | null | undefined) => value == null ? "unavailable" : `${(value * 100).toFixed(1)}%`;

export default function PulseMap({ wards, geometry, data, profiles, layer, winningParty, sdpContestedOnly, selected, onSelect }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 660, height: 490 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize({ width: Math.max(node.clientWidth, 250), height: Math.max(node.clientHeight, 300) }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The released ONS rings already have suitable winding. Correct only a ring
  // that d3 would interpret as the complement of the intended ward.
  const displayed = useMemo<FeatureCollection<Geometry>>(() => ({
    ...geometry,
    features: geometry.features.map(feature => {
      if (geoArea(feature) <= 2 * Math.PI) return feature;
      const shape = feature.geometry;
      if (shape.type === "Polygon") return { ...feature, geometry: { ...shape, coordinates: shape.coordinates.map(ring => [...ring].reverse()) } };
      if (shape.type === "MultiPolygon") return { ...feature, geometry: { ...shape, coordinates: shape.coordinates.map(poly => poly.map(ring => [...ring].reverse())) } };
      return feature;
    }),
  }), [geometry]);
  const projection = useMemo(() => geoMercator().fitExtent([[18, 18], [size.width - 18, size.height - 18]], displayed), [displayed, size]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const names = useMemo(() => new Map(wards.map(ward => [ward.ward_code, ward.ward_name])), [wards]);
  const contests = useMemo(() => new Map(data.contests.map(contest => [contest.ward_code, contest])), [data]);
  const profileByWard = useMemo(() => new Map(profiles.map(profile => [profile.ward_code, profile])), [profiles]);
  const turnout = data.contests.map(contest => contest.turnout_rate).filter((value): value is number => value !== null);
  const min = turnout.length ? Math.min(...turnout) : 0;
  const max = turnout.length ? Math.max(...turnout) : 1;
  const selectedFeature = displayed.features.find(feature => String(feature.id ?? feature.properties?.ward_code) === selected);

  function fillFor(code: string): string {
    const contest = contests.get(code);
    if (layer === "winners") {
      const winners = winningParties(contest, data);
      if (winners.length === 0) return "#c9d3dc";
      return winners.length > 1 ? "url(#mixed-winners)" : partyColor(winners[0]);
    }
    if (layer === "tribes") {
      const profile = profileByWard.get(code);
      return profile ? tribeColors[profile.dominant_tribe_id] : "#c9d3dc";
    }
    if (contest?.turnout_rate == null) return "#c9d3dc";
    const fraction = max === min ? 0.5 : (contest.turnout_rate - min) / (max - min);
    const low = [213, 229, 247], high = [47, 100, 191];
    return `rgb(${low.map((value, index) => Math.round(value + fraction * (high[index] - value))).join(",")})`;
  }

  function description(code: string): string {
    const name = names.get(code) ?? code;
    const contest = contests.get(code);
    if (layer === "turnout") return `${name}, turnout ${pct(contest?.turnout_rate)}`;
    if (layer === "tribes") return `${name}, dominant neighbourhood group ${profileByWard.get(code)?.tribes.find(tribe => tribe.id === profileByWard.get(code)?.dominant_tribe_id)?.name ?? "unavailable"}`;
    const winners = winningParties(contest, data);
    return `${name}, ${winners.length ? `elected ${winners.join(" and ")}` : "no imported result"}`;
  }

  return <svg ref={ref} className="ward-map" viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`Leeds wards coloured by ${layer === "winners" ? "winning party" : layer === "tribes" ? "dominant neighbourhood group" : "turnout"}; select a ward for details`}>
    <defs><pattern id="mixed-winners" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#8d9cab" /><rect width="5" height="10" fill="#eef2f6" /></pattern></defs>
    {displayed.features.map(feature => {
      const code = String(feature.id ?? feature.properties?.ward_code);
      const descriptionText = description(code);
      const dimmed = (layer === "winners" && winningParty !== "" && !winningParties(contests.get(code), data).includes(winningParty)) ||
        (sdpContestedOnly && !contests.get(code)?.party_labels_contested.includes("SDP"));
      return <path key={code} d={path(feature) ?? ""} fill={fillFor(code)} opacity={dimmed ? 0.2 : 1}
        stroke="#f5f8fc" strokeWidth={0.85} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        tabIndex={0} role="button" aria-label={descriptionText} aria-pressed={code === selected}
        onClick={() => onSelect(code)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(code); } }}>
        <title>{descriptionText}</title>
      </path>;
    })}
    {selectedFeature && <g className="selected-ward-outline" pointerEvents="none" aria-hidden="true">
      <path d={path(selectedFeature) ?? ""} fill="none" stroke="#fff" strokeWidth={5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={path(selectedFeature) ?? ""} fill="none" stroke="#15283b" strokeWidth={2.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </g>}
  </svg>;
}
