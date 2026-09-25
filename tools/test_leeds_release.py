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
    print(f"Validated {manifest['package_id']}: {len(manifest['object_sha256']) + 1} objects, "
          f"{total_candidates} candidate records, {total_contests} contests")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
