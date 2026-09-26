"""Validate the added Pulse views against the published election objects and council snapshot."""

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main(release):
    manifest = read(release / "manifest.json")
    assert manifest["package_id"] == "leeds-pulse-v0.4.0" and manifest["publication_allowed"] is True
    for relative, expected in manifest["object_sha256"].items():
        assert hashlib.sha256((release / relative).read_bytes()).hexdigest() == expected, relative
    composition = read(release / "pulse/composition.json")
    assert composition["seat_total"] == 99
    assert {row["key"] for row in composition["snapshots"]} == {"2021", "2022", "2023", "2024", "2026", "latest"}
    for row in composition["snapshots"]:
        assert sum(row["seats"].values()) == 99
        assert row["source_url"].startswith(("https://news.leeds.gov.uk/", "https://www.leeds.gov.uk/"))
    current = next(row for row in composition["snapshots"] if row["key"] == "latest")
    assert current["seats"]["Labour"] == 46 and current["seats"]["SDP"] == 3 and current["seats"]["Vacancy"] == 1
    assert current["as_of"] == "2026-09-26"
    sdp = read(release / "pulse/sdp-results.json")
    assert len(sdp["rows"]) == 76
    assert Counter(row["year"] for row in sdp["rows"]) == {2021: 17, 2022: 7, 2023: 13, 2024: 19, 2026: 20}
    for year in range(2021, 2027):
        prefix = release / "elections" / str(year) / "local-council"
        contests = {row["contest_id"]: row for row in read(prefix / "contests.json")}
        candidates = read(prefix / "candidates.json")
        parties = read(prefix / "party-results.json")
        for row in (item for item in sdp["rows"] if item["year"] == year):
            contest = contests[row["contest_id"]]
            sdp_candidates = [item for item in candidates if item["contest_id"] == row["contest_id"] and item["party_label"] == "SDP"]
            sdp_party = next(item for item in parties if item["contest_id"] == row["contest_id"] and item["party_label"] == "SDP")
            assert sum(item["votes"] for item in sdp_candidates) == row["sdp_votes"] == sdp_party["candidate_votes"]
            assert row["sdp_share"] == sdp_party["share_of_candidate_votes"]
            assert contest["ward_code"] == row["ward_code"]
            assert len(row["sdp_candidates"]) == len(sdp_candidates)
    research = read(release / "pulse/tribes-research.json")
    profiles = read(release / "pulse/ward-profiles.json")
    assert len(research["clusters"]) == 7
    assert {row["id"]: row["name"] for row in research["clusters"]} == {row["id"]: row["name"] for row in profiles[0]["tribes"]}
    print("Validated 36-object Pulse release, six 99-seat composition snapshots, 76 SDP ward polls and seven research groups")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
