"""Stage England-wide ordinary council results from a secondary compilation.

Usage: python tools/explorer_v2/import_annual_results.py data/explorer-v2

The pinned electionresults.uk snapshot combines Commons Library handbooks (2021–25)
and Democracy Club (2026). It is never labelled as a council-certified release.
This import does not assert that annual data include later by-elections.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SOURCE = "https://github.com/fsargent/electionresults.uk/blob/29f587a2e761357c34cb828b0204861d8ec1c015/data-export/results.sqlite"
EXPECTED_SHA256 = "941b75c76f9b448ce6d447a2d532f0f20d569b92df1a9daaed16f30d5709df7a"
HANDBOOK = {
    year: f"https://commonslibrary.parliament.uk/{year}-local-elections-handbook-and-dataset/"
    if year >= 2023 else
    f"https://commonslibrary.parliament.uk/data/parliament-elections-data/{year}-local-elections-handbook-and-dataset/"
    for year in range(2021, 2026)
}
HANDBOOK[2026] = "https://democracyclub.org.uk/data_apis/data/"
ALIASES = {
    "kingston-upon-hull-city-of": "E06000010", "southend-on-sea": "E06000033",
    "st-helens": "E08000013", "herefordshire": "E06000019",
    "king-s-lynn-and-west-norfolk": "E07000146", "stoke-on-trent": "E06000021",
    "stratford-on-avon": "E07000221", "county-durham": "E06000047",
}


def clean(name: str) -> str:
    return " ".join(name.casefold().replace("&", "and").replace(",", " ").split())


def main(root: Path) -> None:
    raw = root / "raw" / "electionresults-2026-06-04.sqlite"
    if not raw.is_file():
        raise FileNotFoundError(f"Download the documented secondary snapshot first: {raw}")
    source_hash = hashlib.sha256(raw.read_bytes()).hexdigest()
    if source_hash != EXPECTED_SHA256:
        raise ValueError("Secondary source snapshot has changed; review and pin a new import version")
    source = sqlite3.connect(f"file:{raw.as_posix()}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    db = sqlite3.connect(root / "switchboard.sqlite3")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    now = datetime.now(timezone.utc).isoformat()
    areas = {row["area_id"]: row for row in db.execute(
        "SELECT area_id,name,region_area_id,area_type FROM area "
        "WHERE area_type IN ('local_authority','county_or_unitary')")}
    by_name = {clean(row["name"]): code for code, row in areas.items()}
    by_slug = {"-".join(clean(row["name"]).split()): code for code, row in areas.items()}
    by_slug.update(ALIASES)
    counts = Counter()
    review = []
    unmatched_councils = []
    try:
        with db:
            db.execute("INSERT OR IGNORE INTO source_record VALUES (?,?,?,?,?,?)", (
                "secondary-electionresults-2026-06-04", "electionresults.uk (secondary compilation)",
                SOURCE, "2026-06-04", now, source_hash))
            dates = {row["year"]: row["election_date"] for row in source.execute(
                "SELECT year,election_date FROM cycles WHERE year BETWEEN 2021 AND 2026")}
            for council in source.execute("SELECT * FROM councils WHERE year BETWEEN 2021 AND 2026 ORDER BY year,council_slug"):
                year, slug = council["year"], council["council_slug"]
                code = by_slug.get(slug) or by_name.get(clean(council["council"]))
                if code not in areas:
                    unmatched_councils.append({"year": year, "council": council["council"],
                                               "slug": slug, "status": "unmapped_or_outside_england"})
                    continue
                if code == "E08000035":
                    continue  # Leeds stays on its separately audited release.
                event = f"secondary:{year}:{slug}:ordinary"
                if db.execute("SELECT 1 FROM election_event WHERE event_id=?", (event,)).fetchone():
                    continue
                db.execute("INSERT INTO election_event VALUES (?,?,?,?,?,?,?)", (
                    event, dates[year], "local_council", "ordinary_election", code,
                    "secondary_source_staged", HANDBOOK[year]))
                db.execute("INSERT INTO event_detail VALUES (?,?,?,?)", (
                    event, "plurality", council["authority_type"] or areas[code]["area_type"],
                    "Council election; single and multi-member contests may coexist. Original source type retained where supplied."))
                wards = {row["area_id"]: row["name"] for row in db.execute(
                    "SELECT area_id,name FROM area WHERE parent_area_id=? AND area_type='ward'", (code,))}
                names = {}
                for ward_code, name in wards.items():
                    names.setdefault(clean(name), []).append(ward_code)
                races = list(source.execute("SELECT * FROM races WHERE year=? AND council_slug=? ORDER BY ward_slug", (year, slug)))
                if len(races) != council["race_count"]:
                    raise ValueError(f"Race count mismatch: {year} {slug}")
                for race in races:
                    ward_code = race["ec_code"]
                    matched = ward_code in wards
                    match_method = "exact_ons_code" if matched else "historical_unmapped"
                    if not matched and (not ward_code or not ward_code.startswith("E")):
                        possibilities = names.get(clean(race["ward_name"]), [])
                        if len(possibilities) == 1:
                            ward_code = possibilities[0]
                            matched = True
                            match_method = "unique_name_only"
                    if not matched:
                        ward_code = f"historic:{year}:{slug}:{race['ward_slug']}"
                        db.execute("INSERT OR IGNORE INTO area VALUES (?,?,?,?,?,?,?)", (
                            ward_code, "historic_ward", race["ward_name"], "E92000001", code,
                            areas[code]["region_area_id"], "historical_boundary_unmapped"))
                        review.append({"year": year, "council": council["council"],
                                       "ward": race["ward_name"], "source_code": race["ec_code"]})
                    db.execute("INSERT INTO area_alias VALUES (?,?,?,?,?)", (
                        "secondary-electionresults-2026-06-04",
                        f"{year}:{slug}:{race['ward_slug']}", ward_code,
                        match_method, "map_link_unverified" if matched else "historical_boundary_unmapped"))
                    contest = f"secondary:{year}:{slug}:{race['ward_slug']}"
                    turnout = race["ballots"] / race["electorate"] if race["ballots"] is not None and race["electorate"] else None
                    note = ("Secondary compilation; candidate wins may be recalculated from rank. "
                            "Check the council declaration before public approval.")
                    boundary_note = ("Historical ward code not linked to the 2025 map."
                                     if not matched else
                                     "Displayed on a 2025 ward shape; historical boundary equivalence has not been certified.")
                    people = list(source.execute(
                        "SELECT * FROM candidates WHERE year=? AND council_slug=? AND ward_slug=? ORDER BY rank,candidate_name",
                        (year, slug, race["ward_slug"])))
                    if len(people) < race["seats"]:
                        raise ValueError(f"Too few candidates: {contest}")
                    db.execute("INSERT INTO contest VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                        contest, event, ward_code, race["seats"], race["electorate"], turnout,
                        sum(person["votes"] for person in people), "secondary-electionresults-2026-06-04", note,
                        race["ec_code"] if race["ec_code"] and race["ec_code"].startswith("E") else None,
                        f"{ward_code}:2025-05" if matched else None, boundary_note))
                    for index, person in enumerate(people):
                        db.execute("INSERT INTO candidate_result VALUES (?,?,?,?,?,?,?)", (
                            f"{contest}:{index}", contest, person["candidate_name"],
                            person["party"] or "Unspecified", person["votes"],
                            person["elected"], "secondary-electionresults-2026-06-04"))
                        if year < 2026 and person["elected"] != person["elected_source"]:
                            counts["source_winner_disagreements"] += 1
                    counts["contests"] += 1
                    counts["candidates"] += len(people)
                db.execute("UPDATE coverage SET status=?,reason=?,source_url=?,checked_at=? "
                           "WHERE area_id=? AND election_type='local_council' AND year=?", (
                    "secondary_source_staged",
                    "Annual ordinary-election results from a secondary compilation of "
                    + ("Commons Library handbook data" if year < 2026 else "Democracy Club data")
                    + "; not council-certified here and not an exhaustive by-election register.",
                    SOURCE, now, code, year))
                if areas[code]["area_type"] == "county_or_unitary":
                    db.execute("INSERT OR REPLACE INTO coverage VALUES (?,?,?,?,?,?,?)", (
                        code, "local_council", year, "secondary_source_staged",
                        "Annual ordinary county results from a secondary compilation; council checks and by-election coverage remain open.",
                        SOURCE, now))
                counts["council_years"] += 1
            for code in areas:
                for year in range(2021, 2027):
                    db.execute("INSERT OR IGNORE INTO coverage VALUES (?,?,?,?,?,?,?)", (
                        code, "local_council", year, "not_audited",
                        "No result source has been audited for this council and year.", None, None))
                db.execute("UPDATE coverage SET status=?,reason=?,source_url=?,checked_at=? "
                           "WHERE area_id=? AND election_type='local_council' AND status='not_audited'", (
                    "no_record_in_annual_source",
                    "No ordinary poll for this council-year appears in the pinned annual compilation. "
                    "This is not proof that no election or by-election occurred; check the council event list.",
                    SOURCE, now, code))
            counts["historical_wards_unmapped"] = len(review)
        report = {"source_sha256": source_hash, "source_url": SOURCE,
                  "counts": dict(counts), "unmapped_historical_wards": review,
                  "quarantined_councils": unmatched_councils,
                  "limitation": "England current-area name matches and explicit aliases only; no claim of exhaustive by-elections, parish or mayoral results."}
        (root / "national-import-review.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps(counts))
    finally:
        source.close()
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve())
