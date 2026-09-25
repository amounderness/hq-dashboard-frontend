"""Validate a staged Leeds release before publication."""

import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path


def load(path):
    return json.loads(path.read_bytes())


def main(release):
    manifest = load(release / "manifest.json")
    for name, expected in manifest["object_sha256"].items():
        assert hashlib.sha256((release / name).read_bytes()).hexdigest() == expected, name
    total_candidates = total_contests = 0
    for year in manifest["years"]:
        prefix = release / "elections" / str(year) / "local-council"
        contests = load(prefix / "contests.json")
        candidates = load(prefix / "candidates.json")
        parties = load(prefix / "party-results.json")
        by_contest = defaultdict(list)
        by_party = defaultdict(list)
        for row in candidates:
            assert "party_label_raw" in row
            if year in (2021, 2022, 2023, 2024):
                assert "source_party_label_standard" in row
            by_contest[row["contest_id"]].append(row)
            by_party[(row["contest_id"], row["party_label"])].append(row)
        for contest in contests:
            cid = contest["contest_id"]
            assert sum(row["votes"] for row in by_contest[cid]) == contest["all_candidate_votes"]
            assert sorted({row["party_label"] for row in by_contest[cid]}) == contest["party_labels_contested"]
        for row in parties:
            group = by_party[(row["contest_id"], row["party_label"])]
            assert row["candidate_votes"] == sum(candidate["votes"] for candidate in group)
            assert row["candidates"] == len(group)
            assert row["seats_won"] == sum(candidate["elected"] for candidate in group)
        assert len(parties) == len(by_party)
        total_candidates += len(candidates)
        total_contests += len(contests)
    assert (total_candidates, total_contests) == (manifest["candidate_records"], manifest["contests"])
    if manifest.get("pulse"):
        profiles = load(release / "pulse/ward-profiles.json")
        history = load(release / "pulse/ward-history.json")
        latest = load(release / "pulse/latest-results.json")
        wards = {row["ward_code"] for row in load(release / "geography/wards.json")}
        assert len(profiles) == len(wards) == 33
        assert {row["ward_code"] for row in profiles} == set(history) == wards
        assert sum(row["population"] for row in profiles) == 811964
        for row in profiles:
            assert row["census_year"] == 2021 and row["display_boundary_id"] == "wards-2025"
            assert len(row["tribes"]) == 7 and sum(t["residents"] for t in row["tribes"]) == row["population"]
            assert abs(sum(t["share"] for t in row["tribes"]) - 1) < 1e-10
            assert all(m["count"] <= m["denominator"] and m["denominator"] > 0 for m in row["metrics"])
        assert len(latest["contests"]) == 33
        assert {row["ward_code"] for row in latest["contests"]} == wards
        assert any(row["status"] == "source_rejected" for row in history["E05012648"])
        assert any(row["status"] == "upcoming" and row["date"] == "2026-10-22" for row in history["E05011389"])
        assert all(not row["contest_id"].startswith("leeds-local-2026-10-22") for row in latest["contests"])
    print(f"Validated {manifest['package_id']}: {len(manifest['object_sha256']) + 1} objects, "
          f"{total_candidates} candidate records, {total_contests} contests")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
