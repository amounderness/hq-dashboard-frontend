"""Validate every object and cross-reference in an Explorer v2 staging package.

Usage: python tools/explorer_v2/verify_pilot_package.py data/explorer-v2/pilot
This is a gate for review, not an instruction to publish the package.
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

from build_pilot_package import party_name

YORKSHIRE = "E12000003"
YEARS = set(range(2021, 2027))


def read(root: Path, name: str, expected: str):
    if name.startswith("/") or ".." in Path(name).parts:
        raise ValueError(f"Invalid package path: {name}")
    raw = (root / name).read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError(f"Checksum mismatch: {name}")
    return json.loads(raw)


def check(root: Path) -> dict:
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1 or manifest.get("release_status") != "staged_not_published":
        raise ValueError("Expected a staged v2 package, schema 1")
    listed = set(manifest["object_sha256"])
    actual = {path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()}
    if actual != listed | {"manifest.json"}:
        raise ValueError(f"Unlisted or missing release objects: {sorted(actual ^ (listed | {'manifest.json'}))}")
    objects = {name: read(root, name, sha) for name, sha in manifest["object_sha256"].items()}
    catalog = objects["catalog.json"]
    activity = catalog.get("activity", {})
    if catalog["pilot_region"] != YORKSHIRE or set(catalog["years"]) != YEARS:
        raise ValueError("Pilot scope or years changed")
    regions = {item["code"] for item in catalog["regions"]}
    councils = {item["code"]: item for item in catalog["authorities"]}
    wards = {item["code"]: item for item in catalog["pilot_wards"]}
    if len(regions) != 9 or len(councils) != 296 or YORKSHIRE not in regions:
        raise ValueError("England region/council catalogue is incomplete")
    if len(wards) != 410:
        raise ValueError("Yorkshire ward catalogue is incomplete")
    for area in councils.values():
        if area["region_code"] not in regions:
            raise ValueError(f"Council has unknown region: {area['code']}")
        if set(area["coverage"]) != {str(year) for year in YEARS}:
            raise ValueError(f"Council has incomplete coverage register: {area['code']}")
    for ward in wards.values():
        if ward["authority_code"] not in councils or councils[ward["authority_code"]]["region_code"] != YORKSHIRE:
            raise ValueError(f"Ward lacks pilot council: {ward['code']}")
    for filename, keyset in (("regions.geojson", regions), ("authorities.geojson", set(councils)),
                             ("yorkshire-wards.geojson", set(wards))):
        actual = {item["properties"]["code"] for item in objects[filename]["features"]}
        if actual != keyset:
            raise ValueError(f"Geometry and catalogue mismatch: {filename}")
    summary = Counter()
    for code, area in councils.items():
        if area["region_code"] != YORKSHIRE:
            continue
        for year in YEARS:
            status = area["coverage"][str(year)]["status"]
            filename = f"results/{code}/{year}.json"
            if status in {"not_audited", "no_record_in_annual_source"}:
                if filename in objects:
                    raise ValueError(f"Unreviewed council-year has a published result object: {filename}")
                if str(year) in activity.get(code, {}):
                    raise ValueError(f"Unreviewed council-year has an activity summary: {filename}")
                continue
            if filename not in objects:
                raise ValueError(f"Covered council-year lacks result: {filename}")
            result = objects[filename]
            if result["authority_code"] != code or result["year"] != year or result["coverage"] != status:
                raise ValueError(f"Result identity or status mismatch: {filename}")
            events = {item["event_id"] for item in result["events"]}
            contests = {item["contest_id"]: item for item in result["contests"]}
            candidates = result["candidates"]
            stats = activity.get(code, {}).get(str(year))
            if not stats or stats["contest_count"] != len(contests):
                raise ValueError(f"Missing or incorrect activity summary: {filename}")
            if len(events) != len(result["events"]) or len(contests) != len(result["contests"]):
                raise ValueError(f"Duplicate event or contest: {filename}")
            votes = Counter()
            winners = Counter()
            for item in candidates:
                if item["contest_id"] not in contests or item["votes"] is not None and item["votes"] < 0:
                    raise ValueError(f"Bad candidate record: {filename}")
                votes[item["contest_id"]] += item["votes"] or 0
                winners[item["contest_id"]] += item["elected"]
            party_votes = Counter()
            elected_parties = Counter()
            sdp_wards = set()
            for item in candidates:
                party = party_name(item["party_label"])
                if item["votes"] is not None:
                    party_votes[party] += item["votes"]
                if item["elected"]:
                    elected_parties[party] += 1
                if party == "SDP":
                    sdp_wards.add(contests[item["contest_id"]]["ward_code"])
            turnout = [item["turnout_rate"] for item in contests.values() if item["turnout_rate"] is not None]
            if (stats["party_candidate_votes"] != dict(party_votes)
                    or stats["winner_counts"] != dict(elected_parties)
                    or stats["sdp_contested_wards"] != sorted(sdp_wards)
                    or stats["candidate_votes"] != sum(party_votes.values())
                    or stats["turnout_contests"] != len(turnout)
                    or stats["mean_recorded_turnout"] != (sum(turnout) / len(turnout) if turnout else None)):
                raise ValueError(f"Activity summary differs from candidate records: {filename}")
            for item in contests.values():
                if item["event_id"] not in events or item["seats_available"] < 1:
                    raise ValueError(f"Bad contest reference: {filename}")
                if item["candidate_votes"] is not None and votes[item["contest_id"]] != item["candidate_votes"]:
                    raise ValueError(f"Candidate vote total differs from contest: {item['contest_id']}")
                if winners[item["contest_id"]] > item["seats_available"]:
                    raise ValueError(f"Too many winners: {item['contest_id']}")
                if item["ward_code"] not in wards and not item["ward_code"].startswith("historic:"):
                    raise ValueError(f"Unmapped ward not identified as historical: {item['contest_id']}")
            summary["council_years"] += 1
            summary["contests"] += len(contests)
            summary["candidates"] += len(candidates)
            summary[status] += 1
    if summary["council_years"] != sum(1 for name in objects if name.startswith("results/")):
        raise ValueError("Result objects lie outside the pilot scope")
    return dict(summary)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    print(json.dumps(check(Path(sys.argv[1]).resolve())))
