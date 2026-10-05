"""Audit existing council-year coverage and a pinned, provisional 2027 cycle list.

This is a read-only review tool. It does not change the canonical store or make
an election-event claim from a council's recurring election cycle.
"""

import argparse
import csv
import hashlib
import html
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


CYCLE_URL = "https://www.gov.uk/government/publications/election-timetable-in-england/election-timetable-in-england"
CYCLE_SHA256 = "46b2d5ef6506348863140b96bd42e88e1b00c95ad51d5937940c71117aa63d07"
ROSTER_SHA256 = "2c343a08fb1875cdfe478f452659a54d3415f64a678b6ff3ee1000391555ebfd"
ROSTER_PATH = Path(__file__).resolve().parent / "sources" / "england_2027_cycle_2026-10-05.csv"
EXPECTED_GROUPS = (
    (27, "metropolitan_thirds", "metropolitan district councils elect by thirds"),
    (2, "metropolitan_whole", "Metropolitan District Councils will hold whole council elections"),
    (2, "metropolitan_review", "Metropolitan District Councils will hold whole council elections following"),
    (103, "district_whole", "district councils hold whole council elections"),
    (44, "district_thirds", "district councils elect by thirds"),
    (31, "unitary_whole", "unitary authorities hold whole council elections"),
    (4, "new_unitary_whole", "unitary authorities hold whole council elections"),
    (14, "unitary_thirds", "unitary authorities elect by thirds"),
)
NAME_ALIASES = {
    "Canterbury City": "E07000106",
    "Lancaster City": "E07000121",
    "Stratford upon Avon": "E07000221",
    "Tewkesbury (North Gloucestershire from December 2024)": "E07000083",
    "Herefordshire": "E06000019",
    "Telford and The Wrekin": "E06000020",
    "Hull": "E06000010",
    "Southend": "E06000033",
}
REVIEW_NOTES = {
    "E07000083": (
        "Council future-elections page conflicts with this general cycle list; "
        "2027 poll and reorganisation require fresh confirmation. "
        "https://tewkesbury.gov.uk/about-the-council/voting-and-elections/current-and-future-elections/"
    ),
}
YEARS = range(2021, 2027)


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold()).replace("&", "and")
    return re.sub(r"[^a-z0-9]", "", value)


def parse_cycle_lists(document: str, expected=EXPECTED_GROUPS) -> list[dict[str, str]]:
    groups = []
    for match in re.finditer(r"<p[^>]*>(.*?)</p>\s*<ol>(.*?)</ol>", document, re.I | re.S):
        sentence = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", match[1])).split())
        if not (sentence.startswith("These ") and "2027" in sentence):
            continue
        names = [html.unescape(re.sub(r"<[^>]+>", "", item)).strip()
                 for item in re.findall(r"<li[^>]*>(.*?)</li>", match[2], re.I | re.S)]
        if names:
            groups.append((sentence, names))
    if len(groups) != len(expected):
        raise ValueError(f"Expected {len(expected)} 2027 council groups; found {len(groups)}")
    rows = []
    for (sentence, names), (count, label, phrase) in zip(groups, expected):
        if len(names) != count or phrase not in sentence:
            raise ValueError(f"Changed 2027 source group: {sentence} ({len(names)} names)")
        rows.extend({"source_name": name, "cycle_group": label} for name in names)
    if len({row["source_name"] for row in rows}) != len(rows):
        raise ValueError("A council occurs more than once in the 2027 cycle lists")
    return rows


def read_pinned_roster(path: Path = ROSTER_PATH) -> list[dict[str, str]]:
    source = path.read_bytes()
    if hashlib.sha256(source).hexdigest() != ROSTER_SHA256:
        raise ValueError("Reviewed 2027 roster differs from its SHA-256 pin")
    with path.open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))
    counts = Counter(row["cycle_group"] for row in rows)
    if counts != Counter({label: count for count, label, _ in EXPECTED_GROUPS}):
        raise ValueError("Reviewed 2027 roster has changed group counts")
    return rows


def map_cycle_names(rows: list[dict[str, str]], authorities: list[sqlite3.Row]) -> list[dict[str, str]]:
    by_id = {area["area_id"]: area for area in authorities}
    by_name = defaultdict(list)
    for area in authorities:
        if area["area_type"] == "local_authority":
            by_name[normalize(area["name"])].append(area)
    mapped = []
    for row in rows:
        source_name = row["source_name"]
        if source_name in NAME_ALIASES:
            area = by_id.get(NAME_ALIASES[source_name])
            method = "reviewed_name_alias"
            if area is None or area["area_type"] != "local_authority":
                raise ValueError(f"Invalid reviewed alias: {source_name}")
        else:
            matches = by_name[normalize(source_name)]
            if len(matches) != 1:
                raise ValueError(f"Unresolved or ambiguous council name: {source_name} ({len(matches)} matches)")
            area = matches[0]
            method = "normalized_exact_name"
        mapped.append({**row, "area_id": area["area_id"], "canonical_name": area["name"],
                       "match_method": method, "schedule_status": "provisional_cycle_only",
                       "review_note": REVIEW_NOTES.get(area["area_id"], "Confirm 2027 poll with the council and reorganisation decisions.")})
    if len({row["area_id"] for row in mapped}) != len(mapped):
        raise ValueError("Multiple cycle-list names mapped to one canonical authority")
    return mapped


def audit(db: sqlite3.Connection, cycle_rows: list[dict[str, str]]) -> tuple[list[dict], dict]:
    db.row_factory = sqlite3.Row
    areas = list(db.execute("SELECT area_id,area_type,name,region_area_id,status FROM area "
                            "WHERE area_type IN ('local_authority','county_or_unitary') ORDER BY area_id"))
    mapped = map_cycle_names(cycle_rows, areas)
    by_area = {row["area_id"]: row for row in mapped}
    coverage = {(row["area_id"], row["year"]): row for row in db.execute(
        "SELECT area_id,year,status,reason,source_url FROM coverage "
        "WHERE election_type='local_council' AND year BETWEEN 2021 AND 2026")}
    activity = defaultdict(lambda: Counter())
    for row in db.execute(
        "SELECT e.authority_id,substr(e.election_date,1,4) AS year,e.event_kind,"
        "COUNT(DISTINCT e.event_id) AS events,COUNT(DISTINCT c.contest_id) AS contests,"
        "COUNT(DISTINCT r.result_id) AS candidates,"
        "COUNT(DISTINCT CASE WHEN c.comparability_note LIKE '%not linked%' THEN c.contest_id END) AS unlinked_contests,"
        "COUNT(DISTINCT CASE WHEN c.comparability_note LIKE '%not certified%' "
        "OR c.comparability_note LIKE '%not been certified%' "
        "OR c.comparability_note LIKE '%unverified%' THEN c.contest_id END) AS unverified_boundary_contests "
        "FROM election_event e LEFT JOIN contest c ON c.event_id=e.event_id "
        "LEFT JOIN candidate_result r ON r.contest_id=c.contest_id "
        "WHERE e.election_type='local_council' AND substr(e.election_date,1,4) BETWEEN '2021' AND '2026' "
        "GROUP BY e.authority_id,year,e.event_kind"):
        key = (row["authority_id"], int(row["year"]))
        kind = row["event_kind"]
        for field in ("events", "contests", "candidates"):
            activity[key][f"{kind}_{field}"] += row[field]
        activity[key]["unlinked_contests"] += row["unlinked_contests"]
        activity[key]["unverified_boundary_contests"] += row["unverified_boundary_contests"]
    result = []
    for area in areas:
        for year in YEARS:
            key = (area["area_id"], year)
            cov = coverage.get(key)
            if cov is None:
                raise ValueError(f"Missing coverage register: {key}")
            counts = activity[key]
            result.append({
                "area_id": area["area_id"], "authority": area["name"], "area_type": area["area_type"],
                "region_id": area["region_area_id"] or "", "year": year, "coverage_status": cov["status"],
                "coverage_reason": cov["reason"], "coverage_source_url": cov["source_url"] or "",
                "ordinary_events": counts["ordinary_election_events"],
                "ordinary_contests": counts["ordinary_election_contests"],
                "ordinary_candidate_results": counts["ordinary_election_candidates"],
                "by_election_events": counts["by_election_events"],
                "by_election_contests": counts["by_election_contests"],
                "by_election_candidate_results": counts["by_election_candidates"],
                "scheduled_poll_events": counts["scheduled_poll_events"],
                "unlinked_historical_contests": counts["unlinked_contests"],
                "unverified_boundary_contests": counts["unverified_boundary_contests"],
                "listed_2027_cycle": "yes" if area["area_id"] in by_area else "no",
            })
    totals = Counter(row["coverage_status"] for row in result)
    summary = {"authorities": len(areas), "local_authorities": sum(a["area_type"] == "local_authority" for a in areas),
               "county_authorities": sum(a["area_type"] == "county_or_unitary" for a in areas),
               "council_years": len(result), "coverage_status_counts": dict(sorted(totals.items())),
               "events": {kind: sum(r[f"{kind}_events"] for r in result)
                          for kind in ("ordinary", "by_election", "scheduled_poll")},
               "unlinked_historical_contests": sum(r["unlinked_historical_contests"] for r in result),
               "unverified_boundary_contests": sum(r["unverified_boundary_contests"] for r in result),
               "provisional_2027_cycle_authorities": len(mapped),
               "2027_cycle_group_counts": dict(sorted(Counter(r["cycle_group"] for r in mapped).items())),
               "cycle_source_url": CYCLE_URL, "cycle_snapshot_sha256": CYCLE_SHA256,
               "reviewed_roster_sha256": ROSTER_SHA256,
               "warning": "Cycle listing is not confirmation that a 2027 poll will occur; check council notices and reorganisation."}
    return result, {"summary": summary, "cycle_rows": mapped}


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--cycle-html", type=Path, help="Optional original source snapshot for cross-check")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cycles = read_pinned_roster()
    if args.cycle_html:
        source = args.cycle_html.read_bytes()
        if hashlib.sha256(source).hexdigest() != CYCLE_SHA256:
            raise ValueError("Official cycle snapshot differs from the reviewed SHA-256; review before updating the pin")
        if parse_cycle_lists(source.decode("utf-8")) != cycles:
            raise ValueError("Reviewed roster differs from the official HTML snapshot")
    with sqlite3.connect(f"file:{args.database.resolve().as_posix()}?mode=ro", uri=True) as db:
        matrix, result = audit(db, cycles)
    args.output.mkdir(parents=True, exist_ok=True)
    write_csv(args.output / "council_year_coverage.csv", matrix)
    write_csv(args.output / "cycle_2027_review.csv", result["cycle_rows"])
    (args.output / "summary.json").write_text(json.dumps(result["summary"], indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    main()
