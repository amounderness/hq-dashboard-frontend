"use client";

import { tribeColors } from "@/lib/pulse-colors";
import type { TribeResearch } from "@/lib/pulse-insight-types";

export default function TribesResearchPage({ research, onExplore }: { research: TribeResearch; onExplore: () => void }) {
  return <><div className="eyebrow">Electoral Tribes / research</div><h1>Understanding the seven groups</h1>
    <p className="muted research-intro">The project groups 2021 Census output areas by similar neighbourhood characteristics. These are descriptions of places, not labels for individual residents or measured political preferences.</p>
    <div className="card research-method"><h2>How the groups were made</h2><p>{research.basis}</p><p>{research.selection_note}</p><p>{research.ward_interpretation}</p>
      <button className="button" onClick={onExplore}>Explore the ward map</button></div>
    <div className="research-grid">{research.clusters.map(cluster => <section className="card tribe-card" key={cluster.id}>
      <div className="tribe-card-heading"><span className="tribe-dot" style={{ background: tribeColors[cluster.id] }} aria-hidden="true" /><h2>{cluster.name}</h2></div>
      <p>{cluster.description}</p><p className="footnote"><strong>Distinguishing features:</strong> {cluster.higher_features.join(", ")}.</p><p className="footnote"><strong>Project note on this profile:</strong> {cluster.confidence}</p>
    </section>)}</div>
    <div className="notice"><strong>What the percentages cannot tell us.</strong> {research.political_limit} The project has not validated an SDP “voter type” for these groups.</div>
    <p className="footnote">Interpretation key: project K7 research, version 2. Census source and geography references appear on Data &amp; sources. Source-file SHA-256: {research.source_file_sha256}.</p>
  </>;
}
