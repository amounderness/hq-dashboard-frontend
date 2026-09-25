"""Build a limited public-results release from audited local inputs.

Usage: python build_leeds_public_release.py DEV_PACKAGE ONS_GEOJSON CROSSCHECK_JSON BACKTEST_JSON PULSE_JSON PULSE_AUDIT_JSON OUTPUT_ROOT
The output is a staged directory; this script never uploads or activates it.
"""

import collections
import hashlib
import json
import math
import re
import sys
from pathlib import Path

from party_labels import ALIASES, canonical_party

RELEASE_ID = "leeds-pulse-v0.3.0"
ONS_URL = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD_MAY_2025_UK_BFC_V2/FeatureServer/0/query?where=LAD25CD%3D%27E08000035%27&outFields=WD25CD%2CWD25NM%2CLAD25CD&outSR=4326&f=geojson"
EXPECTED_MATCHES = {"2021": 183, "2022": 167, "2023": 163, "2024": 183}
EXPECTED_DIFFERENCES = {
    "2021": {("council_only", "Kirkstall", 733, 1), ("package_only", "Kirkstall", 773, 1)},
    "2022": set(),
    "2023": {("council_only", "Calverley & Farsley", 0, 5), ("council_only", "Headingley & Hyde Park", 0, 7)}
        | {("package_only", "Calverley & Farsley", x, 1) for x in (3926, 2536, 251, 250, 205)}
        | {("package_only", "Headingley & Hyde Park", x, 1) for x in (2029, 1749, 145, 119, 52, 48, 27)},
    "2024": {("council_only", "Roundhay", 4039, 1), ("council_only", "Roundhay", 839, 1),
             ("package_only", "Roundhay", 4040, 1), ("package_only", "Roundhay", 840, 1)},
}


def norm(value):
    return re.sub(r"[^a-z0-9]", "", value.lower().replace("&", "and"))


def valid_geometry(geometry):
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        polygons = geometry["coordinates"]
    else:
        return False
    return bool(polygons) and all(
        len(ring) >= 4 and ring[0] == ring[-1]
        and all(len(point) >= 2 and all(math.isfinite(v) for v in point[:2])
                and -180 <= point[0] <= 180 and -90 <= point[1] <= 90 for point in ring)
        for polygon in polygons for ring in polygon
    )


def write(root, name, value, checksums):
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    file = root / name
    file.parent.mkdir(parents=True, exist_ok=True)
    payload = text.encode("utf-8")
    file.write_bytes(payload)
    checksums[name] = hashlib.sha256(payload).hexdigest()


def read(root, name):
    return json.loads((root / name).read_text(encoding="utf-8"))


def main(dev_root, ons_file, crosscheck_file, backtest_file, pulse_file, pulse_audit_file, output_root):
    original = read(dev_root, "manifest.json")
    assert original["package_id"] == "leeds-local-elections-v0.1.0"
    assert original["publication_allowed"] is False
    crosscheck = json.loads(crosscheck_file.read_text(encoding="utf-8"))
    for year, expected in EXPECTED_MATCHES.items():
        result = crosscheck["years"][year]
        assert result["ward_vote_rows_matching"] == expected
        actual = {(d["side"], d["ward"], d["votes"], d["count"]) for d in result["discrepancies"]}
        assert actual == EXPECTED_DIFFERENCES[year], (year, actual ^ EXPECTED_DIFFERENCES[year])

    wards = read(dev_root, "geography/wards.json")
    assert len(wards) == 33
    ward_names = {w["ward_code"]: norm(w["ward_name"]) for w in wards}
    pulse_profiles = json.loads(pulse_file.read_text(encoding="utf-8"))
    pulse_audit = json.loads(pulse_audit_file.read_text(encoding="utf-8"))
    assert pulse_audit["ward_count"] == 33 and pulse_audit["oa_count"] == 2607
    assert {p["ward_code"] for p in pulse_profiles} == set(ward_names)
    response = json.loads(ons_file.read_text(encoding="utf-8"))
    features = []
    for feature in response["features"]:
        source = feature["properties"]
        code = source["WD25CD"]
        assert source["LAD25CD"] == "E08000035"
        assert ward_names[code] == norm(source["WD25NM"])
        geometry = feature["geometry"]
        assert valid_geometry(geometry)
        features.append({"type": "Feature", "id": code,
                         "properties": {"ward_code": code, "ward_name": source["WD25NM"], "boundary_id": "wards-2025"},
                         "geometry": geometry})
    assert len(features) == 33 and {f["id"] for f in features} == set(ward_names)
    features.sort(key=lambda f: f["id"])

    release = output_root / "releases" / RELEASE_ID
    assert not release.exists(), f"Release already exists: {release}"
    checksums = {}
    write(release, "geography/wards.json", wards, checksums)
    write(release, "geography/wards.geojson", {"type": "FeatureCollection", "features": features}, checksums)
    total_candidates = total_contests = 0
    all_year_records = []
    for year in original["years"]:
        prefix = f"elections/{year}/local-council/"
        records = {key: read(dev_root, prefix + key + ".json")
                   for key in ("events", "contests", "candidates", "party-results")}
        if year == 2024:
            for event in records["events"]:
                if event["event_id"] == "leeds-local-2024-10-10":
                    event["source_url"] = "https://datamillnorth.org/download/20jwj/7f3/Farnley%20%26%20Wortley%20ward%20by-election%20-%2010%20October%202024.pdf"
        if year == 2026:
            records["events"].append({
                "event_id": "leeds-local-2026-10-22", "election_date": "2026-10-22", "election_year": 2026,
                "election_type": "local_council", "authority_code": "E08000035", "event_kind": "by_election",
                "status": "upcoming", "ward_code": "E05011389",
                "source_url": "https://www.leeds.gov.uk/elections/leeds-city-council-elections",
                "reason": "Calverley and Farsley by-election announced; no result yet."
            })
        candidates_by_contest = collections.defaultdict(list)
        parties_by_contest = collections.defaultdict(list)
        for row in records["candidates"]:
            candidates_by_contest[row["contest_id"]].append(row)
        for row in records["party-results"]:
            parties_by_contest[row["contest_id"]].append(row)
        for contest in records["contests"]:
            cid = contest["contest_id"]
            candidate_total = sum(x["votes"] for x in candidates_by_contest[cid])
            party_total = sum(x["candidate_votes"] for x in parties_by_contest[cid])
            assert candidate_total == party_total == contest["all_candidate_votes"] and candidate_total > 0, cid
            assert contest["ward_code"] in ward_names
            quality_notes = {
                (2021, "Kirkstall"): "Commons Handbook gives the Conservative candidate 773 votes; council archive CSV gives 733. Handbook value is used.",
                (2023, "Calverley & Farsley"): "Council archive spreadsheet gives zero for all five candidates; Commons Handbook records non-zero votes. Handbook values are used.",
                (2023, "Headingley & Hyde Park"): "Council archive spreadsheet gives zero for all seven candidates; Commons Handbook records non-zero votes. Handbook values are used.",
                (2024, "Roundhay"): "Two candidate totals differ by one vote between the council spreadsheet and Commons Handbook. Handbook values are used.",
            }
            ward_name = next(w["ward_name"] for w in wards if w["ward_code"] == contest["ward_code"])
            if (year, ward_name) in quality_notes:
                contest["data_quality_note"] = quality_notes[(year, ward_name)]
        assert all(c["contest_id"] in {x["contest_id"] for x in records["contests"]} for c in records["candidates"])
        # Preserve source labels on candidates but use one party identity in every
        # public result, including the contest summary and aggregated party rows.
        for candidate in records["candidates"]:
            candidate["party_label"] = canonical_party(candidate["party_label"])
        normalized_parties = collections.defaultdict(lambda: {"candidate_votes": 0, "candidates": 0, "seats_won": 0})
        for candidate in records["candidates"]:
            group = normalized_parties[(candidate["contest_id"], candidate["party_label"])]
            group["candidate_votes"] += candidate["votes"]
            group["candidates"] += 1
            group["seats_won"] += int(candidate["elected"])
        totals = {contest["contest_id"]: contest["all_candidate_votes"] for contest in records["contests"]}
        records["party-results"] = [
            {"contest_id": cid, "party_label": party, **group,
             "share_of_candidate_votes": group["candidate_votes"] / totals[cid]}
            for (cid, party), group in sorted(normalized_parties.items())
        ]
        for contest in records["contests"]:
            contest["party_labels_contested"] = sorted({candidate["party_label"] for candidate in candidates_by_contest[contest["contest_id"]]})
        assert all(sum(p["candidate_votes"] for p in records["party-results"] if p["contest_id"] == cid) == total
                   for cid, total in totals.items())
        total_candidates += len(records["candidates"])
        total_contests += len(records["contests"])
        for key, value in records.items():
            write(release, prefix + key + ".json", value, checksums)
        all_year_records.append(records)
    assert (total_candidates, total_contests) == (938, 166)
    write(release, "pulse/ward-profiles.json", pulse_profiles, checksums)

    history = collections.defaultdict(list)
    latest = {}
    for records in all_year_records:
        events = {event["event_id"]: event for event in records["events"]}
        for event in events.values():
            if event["status"] in ("source_rejected", "upcoming") and event.get("ward_code"):
                history[event["ward_code"]].append({
                    "date": event["election_date"], "event_kind": event["event_kind"], "status": event["status"],
                    "reason": event.get("reason"), "source_url": event.get("source_url")})
        for contest in records["contests"]:
            event = events[contest["event_id"]]
            cid = contest["contest_id"]
            winner_rows = [candidate for candidate in records["candidates"] if candidate["contest_id"] == cid and candidate["elected"]]
            assert len(winner_rows) == contest["seats_available"], cid
            entry = {"date": event["election_date"], "event_kind": event["event_kind"], "status": "included",
                     "contest_id": cid, "seats_available": contest["seats_available"],
                     "winners": [{"candidate_name": candidate["candidate_name"], "party_label": candidate["party_label"]} for candidate in winner_rows],
                     "data_quality_note": contest.get("data_quality_note")}
            history[contest["ward_code"]].append(entry)
            if contest["ward_code"] not in latest or entry["date"] > latest[contest["ward_code"]][0]["date"]:
                latest[contest["ward_code"]] = (entry, contest, records)
    assert set(history) == set(ward_names) and set(latest) == set(ward_names)
    write(release, "pulse/ward-history.json", {ward: sorted(rows, key=lambda row: row["date"], reverse=True)
                                                  for ward, rows in sorted(history.items())}, checksums)
    latest_contests = [latest[ward][1] for ward in sorted(latest)]
    latest_cids = {contest["contest_id"] for contest in latest_contests}
    latest_events = {record["event_id"]: record for _, contest, records in latest.values()
                     for record in records["events"] if record["event_id"] == contest["event_id"]}
    latest_data = {"events": list(latest_events.values()), "contests": latest_contests,
                   "candidates": [row for records in all_year_records for row in records["candidates"] if row["contest_id"] in latest_cids],
                   "parties": [row for records in all_year_records for row in records["party-results"] if row["contest_id"] in latest_cids]}
    write(release, "pulse/latest-results.json", latest_data, checksums)

    source_manifest = {
        "historical_results": {
            "main_source": "House of Commons Library Local Elections Handbook, 2021-2024; Open Parliament Licence",
            "pages": [
                "https://commonslibrary.parliament.uk/data/parliament-elections-data/2021-local-elections-handbook-and-dataset/",
                "https://commonslibrary.parliament.uk/data/parliament-elections-data/2022-local-elections-handbook-and-dataset/",
                "https://commonslibrary.parliament.uk/2023-local-elections-handbook-and-dataset/",
                "https://commonslibrary.parliament.uk/2024-local-elections-handbook-and-dataset/",
            ],
            "secondary_check": "Leeds City Council archive under OGL v3; 696 of 711 ward/vote pairs matched; 15 source discrepancies disclosed in validation report and release audit",
            "workbook_byte_equality_with_upstream": "not_established",
        },
        "boundary": {"source": ONS_URL, "source_sha256": hashlib.sha256(ons_file.read_bytes()).hexdigest(),
                     "credit": "Contains public sector information licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2025."},
        "other_results": [s for s in read(dev_root, "sources.json") if s["source_id"] in ("official-2026-workbook", "official-2026-page", "official-morley-south-2025", "rejected-farnley-2024")],
        "pulse_census_and_tribes": {
            "description": "Ward-level 2021 Census OA counts and exploratory K=7 neighbourhood classification, allocated to 2025 wards; not current estimates or individual profiles",
            "audit": pulse_audit,
            "ons_census": "https://www.ons.gov.uk/census/aboutcensus/censusproducts/topicsummaries",
            "ons_lookup": "https://www.data.gov.uk/dataset/4cb87107-de5a-4ee5-bc78-d7bd3fb86f67/output-area-2021-to-ward-2025-to-lad-may-2025-best-fit-lookup-in-ew-v3",
            "licence": "ONS standard Census data and geography: Open Government Licence v3.0; Electoral Tribes K=7 labels and aggregation are project-derived",
            "upstream_raw_byte_equality": "not_established",
        },
        "upcoming_by_election": "https://www.leeds.gov.uk/elections/leeds-city-council-elections",
        "party_aliases": {"mapping": ALIASES,
                          "basis": "Local Elections Handbook party abbreviation tables, 2021-2024; original candidate party_label_raw and source_party_label_standard retained"},
    }
    write(release, "sources.json", source_manifest, checksums)
    write(release, "validation/official-history-crosscheck.json", crosscheck, checksums)
    backtest = json.loads(backtest_file.read_text(encoding="utf-8"))
    assert backtest["package_id"] == original["package_id"]
    assert backtest["evaluated_wards"] == 126
    assert set(backtest["by_year"]) == {"2022", "2023", "2024", "2026"}
    research = {
        "status": "retrospective_backtest_only", "model": "Latest prior result in the same ward",
        "source_package_id": original["package_id"], "generated_on": backtest["generated_on"],
        "method": backtest["method"], "scope": backtest["scope"], "exclusions": backtest["exclusions"],
        "evaluated_wards": backtest["evaluated_wards"], "metrics": backtest["metrics"],
        "by_year": {year: {"single_seat_wards": row["single_seat_wards"],
                           "mean_new_party_vote_share": row["mean_new_party_vote_share"], "models": row["models"]}
                    for year, row in backtest["by_year"].items()},
        "party_aliases": backtest["party_aliases"],
        "warning": "Historical tests only. The 2026 holdout was weak. No forecast for a future election has been validated or published.",
    }
    write(release, "forecast/backtest-summary.json", research, checksums)
    manifest = {
        "schema_version": "1.1.0", "package_id": RELEASE_ID, "status": "leeds_pulse_pilot_release",
        "assembled_on": "2026-09-25", "authority": {"code": "E08000035", "name": "Leeds"},
        "years": original["years"], "candidate_records": total_candidates, "contests": total_contests, "wards": len(wards),
        "boundary": {"id": "wards-2025", "edition": 2025, "historical_polygon_equivalence_certified": False},
        "forecast": {"status": "retrospective_backtest_only", "file": "forecast/backtest-summary.json", "reason": "2026 holdout is weak; no validated prospective model"},
        "census": {"status": "included_ward_aggregate", "year": 2021, "boundary_id": "wards-2025", "file": "pulse/ward-profiles.json"},
        "tribes": {"status": "exploratory_ward_aggregate", "model": "K=7", "file": "pulse/ward-profiles.json"},
        "pulse": {"latest": "pulse/latest-results.json", "history": "pulse/ward-history.json"},
        "release_limits": [
            "2025 is the Morley South by-election only; no scheduled Leeds council poll took place that year.",
            "Farnley & Wortley October 2024 by-election omitted because the available declaration is blank.",
            "The by-election register is not certified complete. Latest imported poll is not current councillor composition.",
            "Farnley & Wortley 10 October 2024 declaration is blank; no candidate votes or winner are published from that source.",
            "Calverley and Farsley 22 October 2026 by-election is upcoming; no result is included.",
            "Results from 2021–2024 use the Local Elections Handbook. Fifteen candidate votes differ from the council archive; see Data & sources.",
            "Historical party abbreviations are harmonised for comparison and display; source labels remain on candidate records.",
            "All years use 2025 ward boundaries for display; historical polygon equivalence is not certified.",
            "Census figures are 2021 counts best-fit to 2025 wards, not 2026 population estimates. The small difference from native Leeds totals reflects the geography assignment and Census perturbation.",
            "Electoral Tribes are an exploratory seven-group classification of Census output areas, aggregated to wards. They describe neighbourhoods, not individuals or voting intentions.",
            "No party-supplied campaign data or prospective Forecast outputs are included. Forecast shows historical tests only.",
        ],
        "attribution": ["House of Commons Library; Open Parliament Licence", "Leeds City Council; Open Government Licence v3.0", "Office for National Statistics and Ordnance Survey; Open Government Licence v3.0"],
        "source_links": [
            {"label": "Commons Library 2021 dataset", "url": source_manifest["historical_results"]["pages"][0]},
            {"label": "Commons Library 2022 dataset", "url": source_manifest["historical_results"]["pages"][1]},
            {"label": "Commons Library 2023 dataset", "url": source_manifest["historical_results"]["pages"][2]},
            {"label": "Commons Library 2024 dataset", "url": source_manifest["historical_results"]["pages"][3]},
            {"label": "Leeds City Council results archive", "url": "https://datamillnorth.org/dataset/local-election-results-20jwj"},
            {"label": "ONS 2025 ward boundaries", "url": "https://www.data.gov.uk/dataset/612b175b-987c-4acf-8ca4-1f93c6947928/wards-may-2025-boundaries-uk-bfc-v2"},
            {"label": "ONS Census 2021 topic summaries", "url": source_manifest["pulse_census_and_tribes"]["ons_census"]},
            {"label": "ONS OA-to-2025-ward best-fit lookup", "url": source_manifest["pulse_census_and_tribes"]["ons_lookup"]},
            {"label": "Calverley and Farsley by-election notice", "url": source_manifest["upcoming_by_election"]},
            {"label": "Local Elections Handbook 2021", "url": "https://www.electionscentre.co.uk/wp-content/uploads/2022/04/LEH2021-complete.pdf"},
            {"label": "Local Elections Handbook 2023", "url": "https://www.electionscentre.co.uk/wp-content/uploads/2024/01/LEH-2023-Complete.pdf"},
            {"label": "Local Elections Handbook 2024", "url": "https://www.electionscentre.co.uk/wp-content/uploads/2025/01/LEH2024-Complete.pdf"},
        ],
        "object_sha256": checksums,
        "publication_allowed": True,
    }
    write(release, "manifest.json", manifest, {})
    digest = hashlib.sha256((release / "manifest.json").read_bytes()).hexdigest()
    write(output_root, "active.json", {"package_id": RELEASE_ID, "manifest_sha256": digest}, {})
    print(f"Staged {RELEASE_ID}: {len(checksums) + 1} release objects; manifest SHA-256 {digest}")


if __name__ == "__main__":
    if len(sys.argv) != 8:
        raise SystemExit(__doc__)
    main(*(Path(value) for value in sys.argv[1:]))
