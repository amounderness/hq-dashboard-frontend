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
            area["ward_count"] = db.execute("SELECT COUNT(*) FROM area WHERE parent_area_id=?", (area["code"],)).fetchone()[0]
            area["coverage"] = {str(c["year"]): {
                "status": c["status"] if area["region_code"] == YORKSHIRE else "not_released",
                "reason": c["reason"] if area["region_code"] == YORKSHIRE else "Outside the Yorkshire and Humber pilot release.",
                "source_url": c["source_url"] if area["region_code"] == YORKSHIRE else None}
                                for c in db.execute("SELECT year,status,reason,source_url FROM coverage "
                                                    "WHERE area_id=? AND election_type='local_council'",
                                                    (area["code"],))}
            authorities.append(area)
        wards = [dict(row) for row in db.execute(
            "SELECT area_id AS code, name, parent_area_id AS authority_code "
            "FROM area WHERE area_type='ward' AND region_area_id=? ORDER BY name", (YORKSHIRE,))]
        sources = [dict(row) for row in db.execute(
            "SELECT source_id,publisher,url,vintage,sha256 FROM source_record ORDER BY source_id")]
        geography_summary = {row["area_type"]: row["count"] for row in db.execute(
            "SELECT area_type,COUNT(*) AS count FROM area GROUP BY area_type")}
        election_types = [dict(row) for row in db.execute(
            "SELECT type_id,label,elected_area_type,notes FROM election_type ORDER BY type_id")]
        object_hashes = {key: value for key, value in manifest["object_sha256"].items()
                         if not key.startswith("results/")}
        object_hashes["catalog.json"] = write(pilot / "catalog.json", {
            "schema_version": 1, "country": "England", "pilot_region": YORKSHIRE,
            "election_types": election_types, "years": YEARS,
            "geography_summary": geography_summary,
            "regions": regions, "authorities": authorities, "pilot_wards": wards,
            "sources": sources,
            "coverage_definition": {
                "not_audited": "No election result source has been audited for this authority and year; this is not evidence of no election.",
                "checked_published": "The audited Leeds release contains results for this year.",
                "partial_by_election_only": "Only an audited by-election appears for this year.",
                "secondary_source_staged": "Ordinary election records from a secondary compilation; council checks and by-election coverage remain open.",
                "no_record_in_annual_source": "No ordinary poll record was found in the pinned annual compilation; by-elections and scheduling still need verification.",
                "not_released": "The council is indexed nationally but its results are outside this pilot release.",
            },
        })
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
                "c.quality_note,c.display_boundary_id,c.comparability_note "
                "FROM contest c JOIN area a ON a.area_id=c.area_id "
                "JOIN election_event e ON e.event_id=c.event_id "
                "WHERE e.authority_id=? AND substr(e.election_date,1,4)=? ORDER BY a.name,e.election_date",
                (code, str(year)))]
            candidates = [dict(row) for row in db.execute(
                "SELECT cr.result_id,cr.contest_id,cr.candidate_name,cr.party_label,cr.votes,cr.elected,"
                "cr.source_id,s.url AS source_url FROM candidate_result cr "
                "JOIN contest c ON c.contest_id=cr.contest_id "
                "JOIN election_event e ON e.event_id=c.event_id "
                "LEFT JOIN source_record s ON s.source_id=cr.source_id "
                "WHERE e.authority_id=? AND substr(e.election_date,1,4)=?",
                (code, str(year)))]
            object_hashes[f"results/{code}/{year}.json"] = write(
                pilot / "results" / code / f"{year}.json", {
                    "authority_code": code, "year": year, "election_type": "local_council",
                    "coverage": coverage["status"], "explanation": coverage["reason"],
                    "events": events, "contests": contests, "candidates": candidates,
                    "source_release": "leeds-pulse-v0.6.0" if code == "E08000035" else "electionresults.uk 2026-06-04 secondary snapshot",
                })
            result_council_years += 1
            pilot_contests += len(contests)
        manifest["object_sha256"] = object_hashes
        manifest["release_status"] = "staged_not_published"
        manifest["limits"] = [
            "The 2025 geography is a display edition, not proof that historical contests used the same boundaries.",
            "The local store has a wider national ordinary-election source archive; this release exposes only Yorkshire and Humber results.",
            "Leeds uses its audited v0.6.0 release. Other Yorkshire and Humber results are secondary-source staging and need council-level checks.",
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
