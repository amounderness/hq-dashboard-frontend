"""Compile the canonical local store into a scoped Explorer v2 staging package.

Usage: python tools/explorer_v2/build_pilot_package.py data/explorer-v2
This package cannot be served as a production release until explicitly activated.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from pathlib import Path

YORKSHIRE = "E12000003"
YEARS = list(range(2021, 2027))
REVISED_2026 = {"E08000032", "E08000033", "E08000034", "E08000036", "E08000038"}


def party_name(label: str) -> str:
    return {
        "Social Democratic Party": "SDP",
        "Labour Party": "Labour",
        "Conservative Party": "Conservative",
        "Liberal Democrats": "Liberal Democrat",
        "Green Party": "Green",
        "Trade Unionist and Socialist Coalition": "TUSC",
        "UK Independence Party (UKIP)": "UKIP",
    }.get(label, label)


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def write(path: Path, value) -> str:
    data = (compact(value) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def main(root: Path):
    pilot = root / "pilot"
    manifest = json.loads((pilot / "manifest.json").read_text(encoding="utf-8"))
    db = sqlite3.connect(root / "switchboard.sqlite3")
    db.row_factory = sqlite3.Row
    try:
        regions = [dict(row) for row in db.execute(
            "SELECT area_id AS code, name, status FROM area WHERE area_type='region' ORDER BY name")]
        authorities = []
        for row in db.execute("SELECT area_id AS code, name, region_area_id AS region_code, status "
                              "FROM area WHERE area_type='local_authority' ORDER BY name"):
            area = dict(row)
            latest_edition = "2026-05" if area["code"] in REVISED_2026 else "2025-05"
            area["ward_count"] = db.execute(
                "SELECT COUNT(*) FROM boundary_version b JOIN area w ON w.area_id=b.area_id "
                "WHERE w.parent_area_id=? AND b.vintage=?", (area["code"], latest_edition)).fetchone()[0]
            area["ward_edition_by_year"] = {str(year):
                ("2026-05" if year == 2026 and area["code"] in REVISED_2026 else "2025-05")
                for year in YEARS}
            area["coverage"] = {str(c["year"]): {
                "status": c["status"] if area["region_code"] == YORKSHIRE else "not_released",
                "reason": c["reason"] if area["region_code"] == YORKSHIRE else "Outside the Yorkshire and Humber pilot release.",
                "source_url": c["source_url"] if area["region_code"] == YORKSHIRE else None}
                                for c in db.execute("SELECT year,status,reason,source_url FROM coverage "
                                                    "WHERE area_id=? AND election_type='local_council'",
                                                    (area["code"],))}
            authorities.append(area)
        def edition_wards(vintage):
            return [dict(row) for row in db.execute(
                "SELECT w.area_id AS code,w.name,w.parent_area_id AS authority_code "
                "FROM area w JOIN boundary_version b ON b.area_id=w.area_id "
                "WHERE w.area_type='ward' AND w.region_area_id=? AND b.vintage=? ORDER BY w.name,w.area_id",
                (YORKSHIRE, vintage))]
        wards = edition_wards("2025-05")
        wards_2026 = edition_wards("2026-05")
        if len(wards) != 410 or len(wards_2026) != 411:
            raise ValueError("Both pinned Yorkshire ward editions are required for package schema 2")
        sources = [dict(row) for row in db.execute(
            "SELECT source_id,publisher,url,vintage,sha256 FROM source_record ORDER BY source_id")]
        geography_summary = {row["area_type"]: row["count"] for row in db.execute(
            "SELECT area_type,COUNT(*) AS count FROM area GROUP BY area_type")}
        election_types = [dict(row) for row in db.execute(
            "SELECT type_id,label,elected_area_type,notes FROM election_type ORDER BY type_id")]
        object_hashes = {key: value for key, value in manifest["object_sha256"].items()
                         if not key.startswith("results/")}
        if not (pilot / "yorkshire-wards-2026.geojson").is_file():
            raise ValueError("ONS May 2026 Yorkshire geometry object is missing")
        object_hashes["yorkshire-wards-2026.geojson"] = hashlib.sha256(
            (pilot / "yorkshire-wards-2026.geojson").read_bytes()).hexdigest()
        activity = {}
        result_council_years = 0
        pilot_contests = 0
        for authority in [a for a in authorities if a["region_code"] == YORKSHIRE]:
          code = authority["code"]
          for year in YEARS:
            coverage = authority["coverage"][str(year)]
            if coverage["status"] in {"not_audited", "no_record_in_annual_source"}:
                continue
            events = [dict(row) for row in db.execute(
                "SELECT event_id,election_date,election_type,event_kind,status,source_url FROM election_event "
                "WHERE authority_id=? AND substr(election_date,1,4)=? ORDER BY election_date",
                (code, str(year)))]
            contests = [dict(row) for row in db.execute(
                "SELECT c.contest_id,c.event_id,c.area_id AS ward_code,a.name AS ward_name,"
                "c.seats_available,c.electorate,c.turnout_rate,c.candidate_votes,c.source_id,"
                "c.quality_note,c.result_boundary_id,c.display_boundary_id,c.comparability_note "
                "FROM contest c JOIN area a ON a.area_id=c.area_id "
                "JOIN election_event e ON e.event_id=c.event_id "
                "WHERE e.authority_id=? AND substr(e.election_date,1,4)=? ORDER BY a.name,e.election_date",
                (code, str(year)))]
            if code not in REVISED_2026 or year != 2026:
                for contest in contests:
                    contest.pop("result_boundary_id")  # Preserve unchanged v1 result-object bytes, especially Leeds.
            candidates = [dict(row) for row in db.execute(
                "SELECT cr.result_id,cr.contest_id,cr.candidate_name,cr.party_label,cr.votes,cr.elected,"
                "cr.source_id,s.url AS source_url FROM candidate_result cr "
                "JOIN contest c ON c.contest_id=cr.contest_id "
                "JOIN election_event e ON e.event_id=c.event_id "
                "LEFT JOIN source_record s ON s.source_id=cr.source_id "
                "WHERE e.authority_id=? AND substr(e.election_date,1,4)=?",
                (code, str(year)))]
            contest_codes = {contest["contest_id"]: contest["ward_code"] for contest in contests}
            sdp_wards = sorted({contest_codes[candidate["contest_id"]] for candidate in candidates
                                if party_name(candidate["party_label"]) == "SDP"})
            winner_counts = {}
            party_candidate_votes = {}
            for candidate in candidates:
                party = party_name(candidate["party_label"])
                if candidate["votes"] is not None:
                    party_candidate_votes[party] = party_candidate_votes.get(party, 0) + candidate["votes"]
                if candidate["elected"]:
                    winner_counts[party] = winner_counts.get(party, 0) + 1
            known_turnout = [contest["turnout_rate"] for contest in contests if contest["turnout_rate"] is not None]
            activity.setdefault(code, {})[str(year)] = {
                "contest_count": len(contests),
                "sdp_contested_wards": sdp_wards,
                "winner_counts": winner_counts,
                "party_candidate_votes": party_candidate_votes,
                "candidate_votes": sum(party_candidate_votes.values()),
                "mean_recorded_turnout": sum(known_turnout) / len(known_turnout) if known_turnout else None,
                "turnout_contests": len(known_turnout),
            }
            object_hashes[f"results/{code}/{year}.json"] = write(
                pilot / "results" / code / f"{year}.json", {
                    "authority_code": code, "year": year, "election_type": "local_council",
                    "coverage": coverage["status"], "explanation": coverage["reason"],
                    "events": events, "contests": contests, "candidates": candidates,
                    "source_release": ("leeds-pulse-v0.6.0" if code == "E08000035" else
                                       "secondary annual source plus indexed Bradford council pages; original declaration review pending"
                                       if any(event["status"] == "council_index_transcription_pending" for event in events) else
                                       "secondary annual source plus council by-election return"
                                       if any(event["status"] == "council_source_staged" for event in events)
                                       and any(event["status"] == "secondary_source_staged" for event in events) else
                                       "council by-election return"
                                       if any(event["status"] == "council_source_staged" for event in events) else
                                       "electionresults.uk 2026-06-04 secondary snapshot"),
                })
            result_council_years += 1
            pilot_contests += len(contests)
        object_hashes["catalog.json"] = write(pilot / "catalog.json", {
            "schema_version": 2, "country": "England", "pilot_region": YORKSHIRE,
            "election_types": election_types, "years": YEARS,
            "geography_summary": geography_summary,
            "regions": regions, "authorities": authorities, "pilot_wards": wards,
            "ward_editions": [
                {"id": "2025-05", "object": "yorkshire-wards.geojson", "ward_count": 410},
                {"id": "2026-05", "object": "yorkshire-wards-2026.geojson", "ward_count": 411},
            ],
            "pilot_wards_by_edition": {"2025-05": wards, "2026-05": wards_2026},
            "activity": activity, "sources": sources,
            "coverage_definition": {
                "not_audited": "No election result source has been audited for this authority and year; this is not evidence of no election.",
                "checked_published": "The audited Leeds release contains results for this year.",
                "partial_by_election_only": "Only recorded by-election results appear for this year; event-list completeness is not certified.",
                "secondary_source_staged": "Ordinary election records from a secondary compilation; council checks and by-election coverage remain open.",
                "no_record_in_annual_source": "No ordinary poll record was found in the pinned annual compilation; by-elections and scheduling still need verification.",
                "not_released": "The council is indexed nationally but its results are outside this pilot release.",
            },
        })
        manifest["object_sha256"] = object_hashes
        manifest["schema_version"] = 2
        manifest["review_status"] = "council_source_review_pending"
        manifest["coverage"]["yorkshire_wards_2026_in_pilot"] = len(wards_2026)
        manifest["source_sha256"]["wards_2026_geometry"] = "48e49138e4c5c3f59ef1772d221b59f4c3d7d7bed418d58fa0fc78208db418c7"
        manifest["source_urls"]["wards_2026"] = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD_MAY_2026_UK_BSC/FeatureServer/0/query"
        manifest["release_status"] = "staged_not_published"
        manifest["limits"] = [
            "Yorkshire 2025 and 2026 ward editions are distinct. Earlier result-boundary equivalence is not certified.",
            "The five recoded councils' 2026 contest-to-ward mappings are ONS name/date proposals; council candidate-level reconciliation is still pending.",
            "The local store has a wider national ordinary-election source archive; this release exposes only Yorkshire and Humber results.",
            "Leeds uses its audited v0.6.0 release. Other Yorkshire and Humber ordinary results are secondary-source staging; selected by-elections have council-sourced transcriptions with visible caveats.",
            "The annual source is not an exhaustive by-election, mayoral, parish or current council-composition register.",
            "An absent annual record is not proof that no election or by-election occurred.",
        ]
        write(pilot / "manifest.json", manifest)
        print(compact({"regions": len(regions), "authorities": len(authorities),
                       "pilot_wards": len(wards),
                       "result_council_years": result_council_years,
                       "pilot_contests": pilot_contests,
                       "national_store_contests": db.execute("SELECT COUNT(*) FROM contest").fetchone()[0]}))
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve())
