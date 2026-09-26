"""Check v0.5.0 hashes, by-election lineage, published views and source caveats."""

import hashlib
import json
import sys
from pathlib import Path

FARNLEY = "E05012648"
CONTEST = "leeds-local-2024-10-10-E05012648"


def main(release):
    get = lambda name: json.loads((release / name).read_text(encoding="utf-8"))
    manifest = get("manifest.json")
    assert manifest["package_id"] == "leeds-pulse-v0.5.0"
    assert manifest["publication_allowed"] is True
    assert (manifest["contests"], manifest["candidate_records"]) == (167, 945)
    for name, expected in manifest["object_sha256"].items():
        assert hashlib.sha256((release / name).read_bytes()).hexdigest() == expected, name
    prefix = "elections/2024/local-council/"
    events = get(prefix + "events.json")
    event = next(row for row in events if row["event_id"] == "leeds-local-2024-10-10")
    assert event["status"] == "included" and event["source_kind"] == "secondary_local_report"
    contests = get(prefix + "contests.json")
    contest = next(row for row in contests if row["contest_id"] == CONTEST)
    assert contests[0] == contest and contest["ward_code"] == FARNLEY
    assert contest["all_candidate_votes"] == 3743 and contest["turnout_rate"] == 0.2015
    assert contest["electorate"] is None and contest["rejected_ballots"] is None
    assert "secondary local report" in contest["data_quality_note"]
    candidates = [row for row in get(prefix + "candidates.json") if row["contest_id"] == CONTEST]
    assert len(candidates) == 7 and sum(row["votes"] for row in candidates) == 3743
    assert [(row["candidate_name"], row["votes"]) for row in candidates if row["elected"]] == [("David Blackburn", 1450)]
    parties = [row for row in get(prefix + "party-results.json") if row["contest_id"] == CONTEST]
    assert len(parties) == 7 and sum(row["seats_won"] for row in parties) == 1
    assert sum(row["candidate_votes"] for row in parties) == 3743
    history = get("pulse/ward-history.json")[FARNLEY]
    assert any(row["date"] == "2024-10-10" and row["status"] == "included" and row["contest_id"] == CONTEST for row in history)
    assert not any(row["status"] == "source_rejected" for row in history)
    assert next(row for row in get("pulse/latest-results.json")["contests"] if row["ward_code"] == FARNLEY)["event_id"] == "leeds-local-2026-05-07"
    sdp = get("pulse/sdp-results.json")
    assert len(sdp["rows"]) == 77
    assert next(row for row in sdp["rows"] if row["contest_id"] == CONTEST)["sdp_votes"] == 26
    morley = get("elections/2025/local-council/contests.json")[0]
    assert morley["all_candidate_votes"] == 5755 and morley["turnout_rate"] == 0.317
    assert "approximate" in morley["data_quality_note"]
    composition = get("pulse/composition.json")
    assert all(sum(item["seats"].values()) == 99 for item in composition["snapshots"])
    print("Validated v0.5.0: 36 hashed objects, Farnley secondary result, 77 SDP polls, Morley and composition")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
