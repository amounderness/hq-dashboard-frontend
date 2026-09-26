"""Build Leeds Pulse v0.6.0 from the hash-checked v0.5.0 release.

Usage: python build_leeds_pulse_v4.py BASE_RELEASE OUTPUT_ROOT
Only immutable local staging is created; owner approval is required to publish.
"""

import hashlib
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

RELEASE_ID = "leeds-pulse-v0.6.0"
COUNCIL_ARCHIVE = "https://datamillnorth.org/dataset/local-election-results-20jwj"
COUNCIL_2021 = "https://datamillnorth.org/download/20jwj/773088bc-22fd-496b-9362-82235b230ced/Results_06May2021.CSV"
COUNCIL_2023 = "https://datamillnorth.org/download/20jwj/fd9656bf-6ffe-4148-93da-a14ac48a07cd/Results%20for%20Data%20Mill%20North.xlsx"
COUNCIL_2024 = "https://datamillnorth.org/download/20jwj/e3x/Results%20from%20LCC%20%26%20WYCA%20Elections%20held%20on%202%20May%202024.xlsx"
HANDBOOK_2021 = "https://www.electionscentre.co.uk/wp-content/uploads/2022/04/LEH2021-complete.pdf"
HANDBOOK_2023 = "https://www.electionscentre.co.uk/wp-content/uploads/2024/01/LEH-2023-Complete.pdf"
HANDBOOK_2024 = "https://www.electionscentre.co.uk/wp-content/uploads/2025/01/LEH2024-Complete.pdf"
COUNCIL_CYCLE = "https://www.leeds.gov.uk/elections/leeds-city-council-elections"
POLLCHECK = "https://www.pollcheck.co.uk/councils/leeds#by-elections"

DECISIONS = {
    (2021, "E05011402"): {
        "name": "Kirkstall", "source": "Leeds City Council CSV", "source_url": COUNCIL_2021,
        "other_url": HANDBOOK_2021, "changes": {"Capitano R.": (773, 733)},
        "note": "Source choice resolved: the Conservative candidate has 733 votes in the Leeds City Council CSV and 773 in the Local Elections Handbook. This release uses the council's 733; both sources are linked. The winner is unchanged.",
    },
    (2023, "E05011389"): {"name": "Calverley & Farsley", "source": "Local Elections Handbook", "source_url": HANDBOOK_2023, "other_url": COUNCIL_2023,
        "changes": {}, "note": "Source choice resolved: the council archive spreadsheet records zero for every candidate in this ward, while the Local Elections Handbook has the non-zero tally used here. The zero fields are not interpreted as zero votes."},
    (2023, "E05011397"): {"name": "Headingley & Hyde Park", "source": "Local Elections Handbook", "source_url": HANDBOOK_2023, "other_url": COUNCIL_2023,
        "changes": {}, "note": "Source choice resolved: the council archive spreadsheet records zero for every candidate in this ward, while the Local Elections Handbook has the non-zero tally used here. The zero fields are not interpreted as zero votes."},
    (2024, "E05011411"): {
        "name": "Roundhay", "source": "Leeds City Council spreadsheet", "source_url": COUNCIL_2024,
        "other_url": HANDBOOK_2024, "changes": {"Ahad, S.": (840, 839), "Martin, L.": (4040, 4039)},
        "note": "Source choice resolved: Leeds City Council records Lisa Martin on 4,039 and Shazar Ahad on 839, each one below the Local Elections Handbook. This release uses the council figures; both sources are linked. The winner is unchanged. The previously imported turnout estimate is retained separately and is not recalculated from candidate votes.",
    },
}


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(release, relative, value, hashes):
    payload = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    target = release / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    hashes[relative] = hashlib.sha256(payload).hexdigest()


def patch_year(release, year, hashes):
    base = f"elections/{year}/local-council/"
    contests = read(release / (base + "contests.json"))
    candidates = read(release / (base + "candidates.json"))
    parties = read(release / (base + "party-results.json"))
    for (decision_year, ward), decision in DECISIONS.items():
        if decision_year != year:
            continue
        matched = [row for row in contests if row["ward_code"] == ward]
        assert len(matched) == 1, (year, ward, len(matched))
        contest = matched[0]
        people = [row for row in candidates if row["contest_id"] == contest["contest_id"]]
        assert people
        for name, (before, after) in decision["changes"].items():
            person = next(row for row in people if row["candidate_name"] == name)
            assert person["votes"] == before
            person["votes"] = after
            person["vote_source_url"] = decision["source_url"]
            person["source_votes_effective"] = False
        total = sum(row["votes"] for row in people)
        contest["all_candidate_votes"] = total
        if decision["changes"]:
            contest["source_valid_votes"] = total
        contest["data_quality_note"] = decision["note"]
        contest["vote_source_url"] = decision["source_url"]
        contest["alternative_source_url"] = decision["other_url"]
        for person in people:
            person["share_of_candidate_votes"] = person["votes"] / total
        for party in [row for row in parties if row["contest_id"] == contest["contest_id"]]:
            party_people = [row for row in people if row["party_label"] == party["party_label"]]
            party["candidate_votes"] = sum(row["votes"] for row in party_people)
            party["share_of_candidate_votes"] = party["candidate_votes"] / total
    write(release, base + "contests.json", contests, hashes)
    write(release, base + "candidates.json", candidates, hashes)
    write(release, base + "party-results.json", parties, hashes)


def main(base, output):
    original = read(base / "manifest.json")
    assert original["package_id"] == "leeds-pulse-v0.5.0" and original["publication_allowed"]
    release = output / "releases" / RELEASE_ID
    assert not release.exists(), release
    hashes = dict(original["object_sha256"])
    for relative, expected in hashes.items():
        payload = (base / relative).read_bytes()
        assert hashlib.sha256(payload).hexdigest() == expected, relative
        target = release / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(base / relative, target)

    for year in (2021, 2023, 2024):
        patch_year(release, year, hashes)

    history = read(release / "pulse/ward-history.json")
    sdp = read(release / "pulse/sdp-results.json")
    for (year, ward), decision in DECISIONS.items():
        contest = next(row for row in read(release / f"elections/{year}/local-council/contests.json") if row["ward_code"] == ward)
        timeline = next(row for row in history[ward] if row.get("contest_id") == contest["contest_id"])
        timeline["data_quality_note"] = decision["note"]
        timeline["source_url"] = decision["source_url"]
        for row in sdp["rows"]:
            if row["contest_id"] == contest["contest_id"]:
                row["sdp_share"] = row["sdp_votes"] / contest["all_candidate_votes"]
                row["data_quality_note"] = decision["note"]
    write(release, "pulse/ward-history.json", history, hashes)
    write(release, "pulse/sdp-results.json", sdp, hashes)

    validation = read(release / "validation/official-history-crosscheck.json")
    validation["decision_status"] = "Resolved for publication by the documented source choices; original source files remain unchanged."
    validation["source_decisions"] = [
        {"year": year, "ward": value["name"], "selected_source": value["source"],
         "selected_url": value["source_url"], "alternative_url": value["other_url"],
         "selected_candidate_votes": {name: after for name, (_, after) in value["changes"].items()},
         "note": value["note"]}
        for (year, _), value in DECISIONS.items()
    ]
    for year in (2021, 2024):
        value = validation["years"][str(year)]
        value["original_discrepancies"] = value["discrepancies"]
        value["discrepancies"] = []
        value["ward_vote_rows_matching"] = value["package_candidate_rows"]
    write(release, "validation/official-history-crosscheck.json", validation, hashes)

    # The council's election-results hub directs readers to this archive.
    # It contains two distinct stand-alone by-election files during 2021-2026.
    event_audit = {
        "checked_on": "2026-09-26", "scope": "Leeds City Council ward polls, 2021 through 26 September 2026",
        "council_results_hub": "https://www.leeds.gov.uk/elections/election-results",
        "council_archive": COUNCIL_ARCHIVE,
        "standalone_by_elections": [
            {"date": "2024-10-10", "ward": "Farnley & Wortley", "status": "included; secondary tally due to blank council PDF"},
            {"date": "2025-06-12", "ward": "Morley South", "status": "included; council candidate tally"},
        ],
        "same_day_extra_seats": {
            "2021": ["Roundhay"], "2022": ["Horsforth", "Roundhay"],
            "2026": ["Adel & Wharfedale", "Morley North", "Temple Newsam"],
        },
        "forthcoming": {"date": "2026-10-22", "ward": "Calverley & Farsley", "status": "announced; no result as of check"},
        "secondary_crosscheck_url": POLLCHECK,
        "secondary_note": "PollCheck lists Farnley twice, on 10 and 18 October 2024, with the same winner. The council archive and local report both date the poll 10 October; this is one event, not two.",
        "conclusion": "No omitted stand-alone city-council by-election identified in the council's published result archive for this interval. This does not certify current councillor membership or future archive completeness.",
    }
    write(release, "validation/council-event-reconciliation.json", event_audit, hashes)

    sources = read(release / "sources.json")
    sources["history_source_decisions"] = validation["source_decisions"]
    sources["event_reconciliation"] = event_audit
    write(release, "sources.json", sources, hashes)

    forecast = read(release / "forecast/backtest-summary.json")
    forecast["warning"] += " This benchmark was prepared on 25 September 2026 from its stated earlier source package; it has not been rerun for the v0.6.0 source choices."
    write(release, "forecast/backtest-summary.json", forecast, hashes)

    manifest = dict(original)
    manifest.update(package_id=RELEASE_ID, assembled_on="2026-09-26", object_sha256=hashes,
                    history_source_decisions_resolved=True,
                    event_reconciliation={"file": "validation/council-event-reconciliation.json", "checked_on": "2026-09-26"})
    manifest["release_limits"] = [item for item in original["release_limits"]
                                  if "Fifteen candidate votes differ" not in item and "by-election register is not certified" not in item]
    manifest["release_limits"] += [
        "Four historical ward contests have documented source disagreements. Kirkstall 2021 and Roundhay 2024 use council candidate votes; Calverley & Farsley and Headingley & Hyde Park 2023 use the Handbook because council rows are zero. Both sources and each decision are linked.",
        "The published council results archive was reconciled through 26 September 2026: two stand-alone by-elections are included; extra seats filled at ordinary polls are recorded. Latest ward poll does not identify all three serving councillors or subsequent party changes.",
    ]
    manifest["source_links"] = original["source_links"] + [
        {"label": "Leeds council results hub and archive", "url": "https://www.leeds.gov.uk/elections/election-results"},
        {"label": "2021 Kirkstall council result file", "url": COUNCIL_2021},
        {"label": "2023 zero-field council result file", "url": COUNCIL_2023},
        {"label": "2024 Roundhay council result file", "url": COUNCIL_2024},
    ]
    write(release, "manifest.json", manifest, {})
    print(f"Staged {RELEASE_ID}: {len(hashes)} data objects, {manifest['contests']} contests, {manifest['candidate_records']} candidates")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
