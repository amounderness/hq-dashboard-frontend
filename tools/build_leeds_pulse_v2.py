"""Extend an audited Leeds Pulse release with council composition and research views.

Usage: python build_leeds_pulse_v2.py BASE_RELEASE COMPOSITION_JSON K7_KEY_CSV OUTPUT_ROOT
The output is staged only; no Cloudflare objects or active pointer are changed.
"""

import csv
import hashlib
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

RELEASE_ID = "leeds-pulse-v0.4.0"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def save(release, relative, data, checksums):
    payload = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    destination = release / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    checksums[relative] = digest(payload)


def build_sdp_results(base, profiles, wards):
    profile_by_ward = {item["ward_code"]: item for item in profiles}
    names = {item["ward_code"]: item["ward_name"] for item in wards}
    rows = []
    for year in range(2021, 2027):
        prefix = base / "elections" / str(year) / "local-council"
        contests = load(prefix / "contests.json")
        events = {item["event_id"]: item for item in load(prefix / "events.json")}
        parties = defaultdict(list)
        candidates = defaultdict(list)
        for item in load(prefix / "party-results.json"):
            parties[item["contest_id"]].append(item)
        for item in load(prefix / "candidates.json"):
            candidates[item["contest_id"]].append(item)
        for contest in contests:
            contest_parties = parties[contest["contest_id"]]
            sdp = next((item for item in contest_parties if item["party_label"] == "SDP"), None)
            if sdp is None:
                continue
            sdp_candidates = [item for item in candidates[contest["contest_id"]] if item["party_label"] == "SDP"]
            assert len(sdp_candidates) == sdp["candidates"]
            assert sum(item["votes"] for item in sdp_candidates) == sdp["candidate_votes"]
            assert sum(bool(item["elected"]) for item in sdp_candidates) == sdp["seats_won"]
            profile = profile_by_ward[contest["ward_code"]]
            rows.append({
                "year": year,
                "date": events[contest["event_id"]]["election_date"],
                "event_kind": events[contest["event_id"]]["event_kind"],
                "ward_code": contest["ward_code"],
                "ward_name": names[contest["ward_code"]],
                "contest_id": contest["contest_id"],
                "seats_available": contest["seats_available"],
                "turnout_rate": contest["turnout_rate"],
                "sdp_votes": sdp["candidate_votes"],
                "sdp_share": sdp["share_of_candidate_votes"],
                "sdp_seats_won": sdp["seats_won"],
                "sdp_candidates": [{"name": item["candidate_name"], "votes": item["votes"], "elected": item["elected"]}
                                   for item in sorted(sdp_candidates, key=lambda item: -item["votes"])],
                "winning_parties": sorted(item["party_label"] for item in contest_parties if item["seats_won"] > 0),
                "parties_contested": sorted(item["party_label"] for item in contest_parties),
                "dominant_tribe_id": profile["dominant_tribe_id"],
                "data_quality_note": contest.get("data_quality_note"),
            })
    rows.sort(key=lambda item: (item["year"], item["ward_name"], item["date"]))
    assert len(rows) == 76 and sum(len(item["sdp_candidates"]) for item in rows) == 78
    assert sum(item["sdp_seats_won"] for item in rows) == 4
    return {"definition": "SDP candidate votes divided by all candidate votes in that ward poll. Multi-seat polls are not a share of voters.",
            "scope": "Published Leeds council ward contests, 2021–2026; rejected or missing by-elections are excluded.",
            "rows": rows}


def build_research(key_csv, profiles):
    with key_csv.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert {int(item["cluster_id"]) for item in rows} == set(range(7))
    expected = {item["id"]: item["name"] for item in profiles[0]["tribes"]}
    assert all(expected[int(item["cluster_id"])] == item["cluster_name"] for item in rows)
    return {
        "model": "K=7 exploratory Census output-area grouping",
        "year": 2021,
        "basis": "Output-area Census characteristics, not votes, party support or individual profiles.",
        "selection_note": "The research compared K=5 through K=10 using group size, distinctiveness, near-duplicate profiles, split lineage, geography and stability checks. K=7 was retained for an interpretable atlas; the scorecard did not assess political usefulness and does not establish K=7 as uniquely optimal.",
        "ward_interpretation": "A ward share is the percentage of its allocated 2021 residents living in output areas assigned to that group. It is not the percentage of residents who personally match a label or vote for a party.",
        "political_limit": "Any association with election results is ecological and descriptive. Candidate, campaign, turnout and local-history differences may explain it; it cannot identify individual voter types or imply causation.",
        "source_file_sha256": digest(key_csv.read_bytes()),
        "clusters": [{"id": int(item["cluster_id"]), "name": item["cluster_name"],
                      "description": item["interpretation"], "confidence": item["confidence"],
                      "higher_features": [part.split(" (")[0].replace("_pct", "").replace("_", " ")
                                          for part in item["top_high_features"].split("; ")[:4]]}
                     for item in sorted(rows, key=lambda item: int(item["cluster_id"]))],
    }


def main(base, composition_file, key_csv, output_root):
    base_manifest = load(base / "manifest.json")
    assert base_manifest["package_id"] == "leeds-pulse-v0.3.0" and base_manifest["publication_allowed"] is True
    checksums = dict(base_manifest["object_sha256"])
    release = output_root / "releases" / RELEASE_ID
    assert not release.exists(), f"Release already exists: {release}"
    for relative, expected in checksums.items():
        source = base / relative
        assert digest(source.read_bytes()) == expected, relative
        destination = release / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)

    composition = load(composition_file)
    assert composition["seat_total"] == 99 and composition["retrieved_on"] == "2026-09-26"
    assert {item["key"] for item in composition["snapshots"]} == {"2021", "2022", "2023", "2024", "2026", "latest"}
    for item in composition["snapshots"]:
        assert sum(item["seats"].values()) == 99
        assert item["source_url"].startswith(("https://news.leeds.gov.uk/", "https://www.leeds.gov.uk/"))
        assert all(value >= 0 for value in item["seats"].values())
    save(release, "pulse/composition.json", composition, checksums)

    profiles = load(base / "pulse/ward-profiles.json")
    wards = load(base / "geography/wards.json")
    save(release, "pulse/sdp-results.json", build_sdp_results(base, profiles, wards), checksums)
    save(release, "pulse/tribes-research.json", build_research(key_csv, profiles), checksums)

    sources = load(base / "sources.json")
    sources["composition"] = {"type": "Leeds City Council dated composition snapshots",
                              "retrieved_on": composition["retrieved_on"],
                              "urls": [item["source_url"] for item in composition["snapshots"]],
                              "source_file_sha256": digest(composition_file.read_bytes())}
    sources["tribes_research"] = {"type": "Exploratory K7 interpretation key from local research",
                                   "source_file_sha256": digest(key_csv.read_bytes()),
                                   "political_validation": "not established"}
    save(release, "sources.json", sources, checksums)

    manifest = dict(base_manifest)
    manifest.update({"package_id": RELEASE_ID, "assembled_on": "2026-09-26", "object_sha256": checksums,
                     "composition": {"file": "pulse/composition.json", "latest_retrieved_on": "2026-09-26"},
                     "sdp_results": {"file": "pulse/sdp-results.json"},
                     "tribes_research": {"file": "pulse/tribes-research.json"}})
    manifest["source_links"] = base_manifest["source_links"] + [
        {"label": "Leeds current council composition", "url": "https://www.leeds.gov.uk/councillors-and-democracy/councillors-and-committees"},
        *({"label": f"Leeds post-{item['key']} election composition", "url": item["source_url"]}
          for item in composition["snapshots"] if item["key"] != "latest"),
    ]
    manifest["release_limits"] = base_manifest["release_limits"] + [
        "Council composition is a dated Leeds City Council snapshot, separate from ward election winners. The latest snapshot was retrieved 26 September 2026 and may subsequently change.",
        "No verified full-council snapshot is available for the 2025 by-election view; the 2024 post-election baseline is not presented as a 2025 total.",
        "SDP results summaries are descriptive across places where the party stood; selection of wards and candidate/campaign factors prevent causal conclusions.",
    ]
    save(release, "manifest.json", manifest, {})
    save(output_root, "active.json", {"package_id": RELEASE_ID,
                                      "manifest_sha256": digest((release / "manifest.json").read_bytes())}, {})
    print(f"Staged {RELEASE_ID}: {len(checksums) + 1} objects, {len(composition['snapshots'])} composition snapshots")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    main(*(Path(value) for value in sys.argv[1:]))
