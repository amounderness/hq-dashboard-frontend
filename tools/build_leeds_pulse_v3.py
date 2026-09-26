"""Build an immutable Leeds Pulse release from the verified v0.4.0 package.

Usage: python build_leeds_pulse_v3.py BASE_RELEASE OUTPUT_ROOT
The output is local staging only. Publication requires owner validation and approval.
"""

import hashlib
import json
import shutil
import sys
from pathlib import Path

RELEASE_ID = "leeds-pulse-v0.5.0"
FARNLEY = "E05012648"
EVENT_ID = "leeds-local-2024-10-10"
CONTEST_ID = f"{EVENT_ID}-{FARNLEY}"
NEWS = "https://westleedsdispatch.com/farnley-wortley-by-election-result-green-partys-david-blackburn-retakes-seat/"
WIKI = "https://en.wikipedia.org/wiki/2024_Leeds_City_Council_election#Changes_between_2024_and_2026"
COUNCIL = "https://datamillnorth.org/download/20jwj/7f3/Farnley%20%26%20Wortley%20ward%20by-election%20-%2010%20October%202024.pdf"
NOTE = ("Candidate votes and 20.15% turnout are from West Leeds Dispatch, a secondary local report; "
        "the council-hosted declaration is blank. The result is provisional for source quality, "
        "not an official certified transcription. Candidate votes total 3,743; ballot count and "
        "rejected ballots are not established from the usable sources.")


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(release, relative, value, hashes):
    payload = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    path = release / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    hashes[relative] = hashlib.sha256(payload).hexdigest()


def main(base, output):
    original = load(base / "manifest.json")
    assert original["package_id"] == "leeds-pulse-v0.4.0" and original["publication_allowed"]
    release = output / "releases" / RELEASE_ID
    assert not release.exists(), f"Release already exists: {release}"
    hashes = dict(original["object_sha256"])
    for relative, expected in hashes.items():
        payload = (base / relative).read_bytes()
        assert hashlib.sha256(payload).hexdigest() == expected, relative
        path = release / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)

    prefix = "elections/2024/local-council/"
    events = load(release / (prefix + "events.json"))
    rejected = next(item for item in events if item["event_id"] == EVENT_ID)
    assert rejected["status"] == "source_rejected"
    rejected.update(status="included", source_id="secondary-farnley-2024", source_url=NEWS,
                    source_kind="secondary_local_report", data_quality_note=NOTE)
    rejected.pop("reason", None)
    save(release, prefix + "events.json", events, hashes)

    contest = {
        "contest_id": CONTEST_ID, "event_id": EVENT_ID, "ward_code": FARNLEY,
        "seats_available": 1, "electorate": None, "turnout_rate": 0.2015,
        "turnout_raw": 20.15, "turnout_raw_unit": "percent", "rejected_ballots": None,
        "source_valid_votes": None, "source_ballots": None, "source_id": "secondary-farnley-2024",
        "turnout_source_id": "secondary-farnley-2024", "display_boundary_id": "wards-2025",
        "boundary_match": "ward_code_match; historical polygons not certified",
        "additional_vacancies_included": False, "all_candidate_votes": 3743,
        "party_labels_contested": ["Conservative", "Green", "Independent", "Labour", "Liberal Democrat", "Reform UK", "SDP"],
        "share_definition": "votes_divided_by_sum_of_all_candidate_votes", "data_quality_note": NOTE,
    }
    contests = load(release / (prefix + "contests.json"))
    contests.insert(0, contest)  # The year view defaults to the most recent poll in a ward.
    save(release, prefix + "contests.json", contests, hashes)

    tally = [
        ("Peter Allison", "Independent", 70), ("Peter Andrews", "Liberal Democrat", 118),
        ("David Blackburn", "Green", 1450), ("David Dresser", "Reform UK", 912),
        ("Al Garthwaite", "Labour", 965), ("Richard Riley", "SDP", 26),
        ("Lalit Suryawanshi", "Conservative", 202),
    ]
    assert sum(votes for _, _, votes in tally) == 3743
    candidates = load(release / (prefix + "candidates.json"))
    for index, (name, party, votes) in enumerate(tally, 1):
        candidates.append({"candidate_result_id": f"secondary-farnley-2024-{index}",
                           "event_id": EVENT_ID, "contest_id": CONTEST_ID, "ward_code": FARNLEY,
                           "candidate_name": name, "party_label_raw": party, "party_label": party,
                           "votes": votes, "elected": name == "David Blackburn",
                           "source_id": "secondary-farnley-2024",
                           "source_party_label_standard": party,
                           "share_of_candidate_votes": votes / 3743})
    save(release, prefix + "candidates.json", candidates, hashes)
    parties = load(release / (prefix + "party-results.json"))
    for _, party, votes in tally:
        parties.append({"contest_id": CONTEST_ID, "party_label": party, "candidate_votes": votes,
                        "candidates": 1, "seats_won": int(party == "Green"),
                        "share_of_candidate_votes": votes / 3743})
    save(release, prefix + "party-results.json", parties, hashes)

    # The candidate tally is from the signed council declaration. A secondary
    # account supplies turnout only; its ballot count differs by one, so label it.
    morley_path = "elections/2025/local-council/contests.json"
    morley_contests = load(release / morley_path)
    assert len(morley_contests) == 1 and morley_contests[0]["all_candidate_votes"] == 5755
    morley_contests[0].update(
        turnout_rate=0.317, turnout_raw=31.7, turnout_raw_unit="percent",
        turnout_source_id="secondary-morley-turnout-2025",
        data_quality_note=("Candidate votes and 13 rejected ballots are from the Leeds City Council declaration. "
                           "Turnout 31.7% is a rounded secondary-source figure from Wikipedia; its listed "
                           "ballot count differs by one from candidate votes plus rejected ballots. Treat turnout as approximate."),
    )
    save(release, morley_path, morley_contests, hashes)

    history = load(release / "pulse/ward-history.json")
    row = next(item for item in history[FARNLEY] if item["date"] == "2024-10-10")
    row.update(status="included", contest_id=CONTEST_ID, seats_available=1,
               winners=[{"candidate_name": "David Blackburn", "party_label": "Green"}],
               data_quality_note=NOTE, source_url=NEWS)
    row.pop("reason", None)
    morley_row = next(item for item in history["E05011407"] if item["date"] == "2025-06-12")
    morley_row["data_quality_note"] = morley_contests[0]["data_quality_note"]
    save(release, "pulse/ward-history.json", history, hashes)

    # 2026 is still the newest poll in this ward; the current latest view is unchanged.
    latest = load(release / "pulse/latest-results.json")
    assert next(item for item in latest["contests"] if item["ward_code"] == FARNLEY)["event_id"] == "leeds-local-2026-05-07"

    sdp = load(release / "pulse/sdp-results.json")
    profiles = {item["ward_code"]: item for item in load(release / "pulse/ward-profiles.json")}
    sdp["rows"].append({
        "year": 2024, "date": "2024-10-10", "event_kind": "by_election", "ward_code": FARNLEY,
        "ward_name": "Farnley and Wortley", "contest_id": CONTEST_ID, "seats_available": 1,
        "turnout_rate": 0.2015, "sdp_votes": 26, "sdp_share": 26 / 3743,
        "sdp_seats_won": 0, "sdp_candidates": [{"name": "Richard Riley", "votes": 26, "elected": False}],
        "winning_parties": ["Green"], "parties_contested": contest["party_labels_contested"],
        "dominant_tribe_id": profiles[FARNLEY]["dominant_tribe_id"], "data_quality_note": NOTE,
    })
    sdp["rows"].sort(key=lambda item: (item["year"], item["ward_name"], item["date"]))
    sdp["scope"] = "Published Leeds council ward contests, 2021–2026. Farnley & Wortley 2024 uses labelled secondary-source figures."
    save(release, "pulse/sdp-results.json", sdp, hashes)

    sources = load(release / "sources.json")
    sources["other_results"].append({"source_id": "secondary-farnley-2024", "url": NEWS,
                                     "cross_check_url": WIKI, "official_blank_url": COUNCIL,
                                     "note": NOTE, "source_tier": "secondary", "retrieved_on": "2026-09-26"})
    sources["other_results"].append({"source_id": "secondary-morley-turnout-2025", "url": WIKI,
                                     "note": "Wikipedia reports 31.7% turnout. Its 5,767 ballot count conflicts by one with the official declaration's 5,755 candidate votes plus 13 rejected ballots. The percentage is imported as approximate, not as a certified council turnout.",
                                     "source_tier": "secondary", "retrieved_on": "2026-09-26"})
    save(release, "sources.json", sources, hashes)

    manifest = dict(original)
    manifest.update(package_id=RELEASE_ID, assembled_on="2026-09-26", object_sha256=hashes,
                    contests=original["contests"] + 1, candidate_records=original["candidate_records"] + 7)
    manifest["release_limits"] = [item for item in original["release_limits"]
                                  if "Farnley & Wortley October 2024 by-election omitted" not in item
                                  and "Farnley & Wortley 10 October 2024 declaration is blank" not in item]
    manifest["release_limits"].insert(1, "Farnley & Wortley 10 October 2024 candidate votes and 20.15% turnout use a labelled secondary local report because the council-hosted declaration is blank. The council's corrected declaration is still sought.")
    manifest["release_limits"].insert(2, "Morley South 12 June 2025 candidate votes are from the council declaration; 31.7% turnout is an approximate secondary-source value, with a one-ballot source discrepancy.")
    manifest["source_links"] = original["source_links"] + [
        {"label": "Farnley & Wortley 2024 result, secondary local report", "url": NEWS},
        {"label": "Farnley & Wortley 2024 blank council-hosted declaration", "url": COUNCIL},
        {"label": "Morley South 2025 turnout, secondary account", "url": WIKI},
    ]
    save(release, "manifest.json", manifest, {})
    print(f"Staged {RELEASE_ID}: {manifest['contests']} contests, {manifest['candidate_records']} candidates")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
