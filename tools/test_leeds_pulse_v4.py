"""Focused checks for source choices and event coverage in Leeds Pulse v0.6.0."""

import hashlib
import json
import sys
from pathlib import Path


def load(root, relative):
    return json.loads((root / relative).read_text(encoding="utf-8"))


def check_contest(root, year, ward, expected_votes, expected_total, source_text):
    base = f"elections/{year}/local-council/"
    contest = next(row for row in load(root, base + "contests.json") if row["ward_code"] == ward)
    people = [row for row in load(root, base + "candidates.json") if row["contest_id"] == contest["contest_id"]]
    parties = [row for row in load(root, base + "party-results.json") if row["contest_id"] == contest["contest_id"]]
    assert contest["all_candidate_votes"] == expected_total == sum(row["votes"] for row in people)
    assert source_text in contest["data_quality_note"]
    assert sum(row["candidate_votes"] for row in parties) == expected_total
    for name, votes in expected_votes.items():
        assert next(row for row in people if row["candidate_name"] == name)["votes"] == votes
    for row in people:
        assert abs(row["share_of_candidate_votes"] - row["votes"] / expected_total) < 1e-12
    for row in parties:
        assert abs(row["share_of_candidate_votes"] - row["candidate_votes"] / expected_total) < 1e-12
    return contest


def main(root):
    manifest = load(root, "manifest.json")
    assert manifest["package_id"] == "leeds-pulse-v0.6.0"
    assert manifest["history_source_decisions_resolved"] is True
    for relative, expected in manifest["object_sha256"].items():
        assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == expected, relative
    kirkstall = check_contest(root, 2021, "E05011402", {"Capitano R.": 733}, 5758, "council's 733")
    roundhay = check_contest(root, 2024, "E05011411", {"Martin, L.": 4039, "Ahad, S.": 839}, 7296, "council figures")
    for ward in ("E05011389", "E05011397"):
        contest = next(row for row in load(root, "elections/2023/local-council/contests.json") if row["ward_code"] == ward)
        assert "council archive spreadsheet records zero" in contest["data_quality_note"]
        assert all(row["votes"] > 0 for row in load(root, "elections/2023/local-council/candidates.json") if row["contest_id"] == contest["contest_id"])
    history = load(root, "pulse/ward-history.json")
    assert any(row.get("contest_id") == kirkstall["contest_id"] and "council's 733" in row["data_quality_note"] for row in history["E05011402"])
    assert any(row.get("contest_id") == roundhay["contest_id"] and "council figures" in row["data_quality_note"] for row in history["E05011411"])
    sdp = load(root, "pulse/sdp-results.json")
    roundhay_sdp = next(row for row in sdp["rows"] if row["contest_id"] == roundhay["contest_id"])
    assert abs(roundhay_sdp["sdp_share"] - 132 / 7296) < 1e-12
    audit = load(root, "validation/council-event-reconciliation.json")
    assert {(row["date"], row["ward"]) for row in audit["standalone_by_elections"]} == {
        ("2024-10-10", "Farnley & Wortley"), ("2025-06-12", "Morley South")}
    assert [len(audit["same_day_extra_seats"][year]) for year in ("2021", "2022", "2026")] == [1, 2, 3]
    assert audit["forthcoming"]["date"] == "2026-10-22"
    assert sum(row["seats"].get("Labour", 0) for row in load(root, "pulse/composition.json")["snapshots"] if row["key"] == "latest") == 46
    print("Validated v0.6.0 source choices, shares, event register and dated composition")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
