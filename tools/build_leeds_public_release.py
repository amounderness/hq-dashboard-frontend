"""Build a limited public-results release from audited local inputs.

Usage: python build_leeds_public_release.py DEV_PACKAGE ONS_GEOJSON CROSSCHECK_JSON BACKTEST_JSON OUTPUT_ROOT
The output is a staged directory; this script never uploads or activates it.
"""

import collections
import hashlib
import json
import math
import re
import sys
from pathlib import Path


RELEASE_ID = "leeds-public-results-v0.2.1"
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


def main(dev_root, ons_file, crosscheck_file, backtest_file, output_root):
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
    for year in original["years"]:
        prefix = f"elections/{year}/local-council/"
        records = {key: read(dev_root, prefix + key + ".json")
                   for key in ("events", "contests", "candidates", "party-results")}
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
        assert all(c["contest_id"] in {x["contest_id"] for x in records["contests"]} for c in records["candidates"])
        total_candidates += len(records["candidates"])
        total_contests += len(records["contests"])
        for key, value in records.items():
            write(release, prefix + key + ".json", value, checksums)
    assert (total_candidates, total_contests) == (938, 166)

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
        "by_year": {year: {"single_seat_wards": row["single_seat_wards"], "models": row["models"]}
                    for year, row in backtest["by_year"].items()},
        "warning": "Historical tests only. The 2026 holdout was weak. No forecast for a future election has been validated or published.",
    }
    write(release, "forecast/backtest-summary.json", research, checksums)
    manifest = {
        "schema_version": "1.0.0", "package_id": RELEASE_ID, "status": "limited_public_results_release",
        "assembled_on": "2026-09-25", "authority": {"code": "E08000035", "name": "Leeds"},
        "years": original["years"], "candidate_records": total_candidates, "contests": total_contests, "wards": len(wards),
        "boundary": {"id": "wards-2025", "edition": 2025, "historical_polygon_equivalence_certified": False},
        "forecast": {"status": "retrospective_backtest_only", "file": "forecast/backtest-summary.json", "reason": "2026 holdout is weak; no validated prospective model"},
        "census": {"status": "not_included", "reason": "Upstream lineage remains incomplete"},
        "release_limits": [
            "2025 is the Morley South by-election only; no scheduled Leeds council poll took place that year.",
            "Farnley & Wortley October 2024 by-election omitted because the available declaration is blank.",
            "The by-election register is not certified complete. Latest imported poll is not current councillor composition.",
            "Results from 2021–2024 use the Local Elections Handbook. Fifteen candidate votes differ from the council archive; see Data & sources.",
            "All years use 2025 ward boundaries for display; historical polygon equivalence is not certified.",
            "No census, Electoral Tribe, party-supplied campaign data, or prospective Forecast outputs are included. Forecast shows historical tests only.",
        ],
        "attribution": ["House of Commons Library; Open Parliament Licence", "Leeds City Council; Open Government Licence v3.0", "Office for National Statistics and Ordnance Survey; Open Government Licence v3.0"],
        "source_links": [
            {"label": "Commons Library 2021 dataset", "url": source_manifest["historical_results"]["pages"][0]},
            {"label": "Commons Library 2022 dataset", "url": source_manifest["historical_results"]["pages"][1]},
            {"label": "Commons Library 2023 dataset", "url": source_manifest["historical_results"]["pages"][2]},
            {"label": "Commons Library 2024 dataset", "url": source_manifest["historical_results"]["pages"][3]},
            {"label": "Leeds City Council results archive", "url": "https://datamillnorth.org/dataset/local-election-results-20jwj"},
            {"label": "ONS 2025 ward boundaries", "url": "https://www.data.gov.uk/dataset/612b175b-987c-4acf-8ca4-1f93c6947928/wards-may-2025-boundaries-uk-bfc-v2"},
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
    if len(sys.argv) != 6:
        raise SystemExit(__doc__)
    main(*(Path(value) for value in sys.argv[1:]))
