"""Stage reviewed council by-elections in the canonical local store.

Usage: python tools/explorer_v2/import_official_byelections.py data/explorer-v2

The versioned JSON file is a checked transcription of council declarations, not
an exhaustive register. Each source_record hash identifies its transcription,
not a downloaded council file. Source URLs and disagreements remain visible in
the resulting package. This command never stages or activates a public release.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from datetime import date, datetime, timezone
from pathlib import Path

FIXTURE = Path(__file__).with_name("official_byelections_2025.json")


def canonical_bytes(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def checked_event(db: sqlite3.Connection, item: dict) -> tuple[str, int, float | None]:
    event_date = date.fromisoformat(item["date"])
    if event_date.year != 2025:
        raise ValueError("Fixture contains an event outside 2025")
    authority = db.execute("SELECT area_type,region_area_id FROM area WHERE area_id=?", (item["authority_id"],)).fetchone()
    ward = db.execute("SELECT name,parent_area_id,area_type FROM area WHERE area_id=?", (item["ward_id"],)).fetchone()
    if not authority or authority[1] != "E12000003" or authority[0] != "local_authority":
        raise ValueError(f"Not a Yorkshire pilot council: {item['authority_id']}")
    if not ward or ward[1] != item["authority_id"] or ward[2] != "ward" or ward[0] != item["ward_name"]:
        raise ValueError(f"Ward and council do not match: {item['ward_id']}")
    if item["seats"] != 1 or not item["candidates"]:
        raise ValueError(f"Expected one contested principal-council seat: {item['ward_id']}")
    names = [candidate["name"] for candidate in item["candidates"]]
    if len(set(names)) != len(names) or any(not name.strip() for name in names):
        raise ValueError(f"Duplicate or empty candidate name: {item['ward_id']}")
    if any(not candidate["party"].strip() or type(candidate["votes"]) is not int or candidate["votes"] < 0
           or type(candidate["elected"]) is not bool for candidate in item["candidates"]):
        raise ValueError(f"Invalid candidate fields: {item['ward_id']}")
    if sum(candidate["elected"] for candidate in item["candidates"]) != item["seats"]:
        raise ValueError(f"Elected count differs from vacant seats: {item['ward_id']}")
    votes = sum(candidate["votes"] for candidate in item["candidates"])
    rejected, ballots, electorate = item["rejected"], item["ballots_issued"], item["electorate"]
    if type(rejected) is not int or rejected < 0:
        raise ValueError(f"Invalid rejected-ballot count: {item['ward_id']}")
    if ballots is not None and (type(ballots) is not int or votes + rejected != ballots):
        raise ValueError(f"Candidate votes and rejected ballots do not reconcile: {item['ward_id']}")
    if (ballots is None) != (electorate is None):
        raise ValueError(f"Ballots and electorate must be supplied together: {item['ward_id']}")
    turnout = None
    if ballots is not None:
        if type(electorate) is not int or electorate <= 0 or ballots > electorate:
            raise ValueError(f"Invalid electorate or ballots: {item['ward_id']}")
        turnout = ballots / electorate
        declared = item["declared_turnout_percent"]
        if declared is None:
            raise ValueError(f"Missing declared turnout: {item['ward_id']}")
        difference = abs(turnout * 100 - declared)
        if difference > 0.011 and not item.get("turnout_discrepancy_accepted", False):
            raise ValueError(f"Declared turnout differs from ballot-derived rate: {item['ward_id']}")
        if difference <= 0.011 and item.get("turnout_discrepancy_accepted", False):
            raise ValueError(f"Unnecessary turnout discrepancy waiver: {item['ward_id']}")
    elif item["declared_turnout_percent"] is not None:
        raise ValueError(f"Turnout without electorate or ballots: {item['ward_id']}")
    if not item["source_url"].startswith("https://") or not item["quality_note"].strip():
        raise ValueError(f"Source or quality note missing: {item['ward_id']}")
    return event_date.isoformat(), votes, turnout


def import_events(db: sqlite3.Connection, fixture: dict) -> dict:
    if fixture.get("schema_version") != 1 or not fixture.get("events"):
        raise ValueError("Expected nonempty official by-election fixture, schema 1")
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    skipped = 0
    with db:
        db.execute("PRAGMA foreign_keys=ON")
        for item in fixture["events"]:
            event_date, votes, turnout = checked_event(db, item)
            source_id = f"council:{event_date}:{item['ward_id']}"
            event_id = f"{source_id}:by-election"
            contest_id = f"{event_id}:contest"
            source_hash = hashlib.sha256(canonical_bytes(item)).hexdigest()
            existing = db.execute("SELECT sha256 FROM source_record WHERE source_id=?", (source_id,)).fetchone()
            if existing:
                if existing[0] != source_hash:
                    raise ValueError(f"Council transcription changed; review a new source version: {source_id}")
                recorded = db.execute("SELECT e.election_date,e.authority_id,e.source_url,c.area_id,c.candidate_votes "
                                      "FROM election_event e JOIN contest c ON c.event_id=e.event_id "
                                      "WHERE e.event_id=?", (event_id,)).fetchone()
                expected = (event_date, item["authority_id"], item["source_url"], item["ward_id"], votes)
                candidates = list(db.execute("SELECT candidate_name,party_label,votes,elected FROM candidate_result "
                                             "WHERE contest_id=? ORDER BY result_id", (contest_id,)))
                expected_candidates = [(person["name"], person["party"], person["votes"], int(person["elected"]))
                                       for person in item["candidates"]]
                if recorded != expected or candidates != expected_candidates:
                    raise ValueError(f"Existing event is incomplete: {event_id}")
                skipped += 1
                continue
            if db.execute("SELECT 1 FROM contest c JOIN election_event e ON e.event_id=c.event_id "
                          "WHERE c.area_id=? AND e.election_date=? AND e.election_type='local_council'",
                          (item["ward_id"], event_date)).fetchone():
                raise ValueError(f"Council contest already exists for {item['ward_id']} on {event_date}")
            coverage = db.execute("SELECT status,reason FROM coverage WHERE area_id=? AND election_type='local_council' AND year=2025",
                                  (item["authority_id"],)).fetchone()
            if not coverage:
                raise ValueError(f"No council-year coverage row: {item['authority_id']}")
            if coverage[0] not in {"no_record_in_annual_source", "secondary_source_staged"}:
                raise ValueError(f"Unexpected council-year coverage status: {item['authority_id']} {coverage[0]}")
            db.execute("INSERT INTO source_record VALUES (?,?,?,?,?,?)", (
                source_id, f"{item['publisher']} (reviewed transcription)", item["source_url"],
                event_date, now, source_hash))
            db.execute("INSERT INTO area_alias VALUES (?,?,?,?,?)", (
                source_id, item["ward_id"], item["ward_id"], "reviewed_ons_code", "map_link_unverified"))
            db.execute("INSERT INTO election_event VALUES (?,?,?,?,?,?,?)", (
                event_id, event_date, "local_council", "by_election", item["authority_id"],
                "council_source_staged", item["source_url"]))
            db.execute("INSERT INTO event_detail VALUES (?,?,?,?)", (
                event_id, "plurality", "local_authority", item["quality_note"] +
                (f" Corroborating council record: {item['corroboration_url']}" if item.get("corroboration_url") else "")))
            db.execute("INSERT INTO contest VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                contest_id, event_id, item["ward_id"], item["seats"], item["electorate"], turnout,
                votes, source_id, item["quality_note"], item["ward_id"],
                f"{item['ward_id']}:2025-05",
                "Linked to the 2025 display ward by reviewed code; exact event-date boundary equivalence remains unverified."))
            for index, candidate in enumerate(item["candidates"]):
                db.execute("INSERT INTO candidate_result VALUES (?,?,?,?,?,?,?)", (
                    f"{contest_id}:{index}", contest_id, candidate["name"], candidate["party"],
                    candidate["votes"], int(candidate["elected"]), source_id))
            status = "secondary_source_staged" if coverage[0] == "secondary_source_staged" else "partial_by_election_only"
            reason = ("Ordinary council results from a secondary annual source plus this council-sourced by-election; "
                      if status == "secondary_source_staged" else
                      "Council-sourced by-election recorded; no ordinary result in the annual source. ")
            reason += "The council-year event register has not been certified exhaustive. " + item["quality_note"]
            db.execute("UPDATE coverage SET status=?,reason=?,source_url=?,checked_at=? "
                       "WHERE area_id=? AND election_type='local_council' AND year=2025", (
                status, reason, item["source_url"], now, item["authority_id"]))
            inserted += 1
    return {"inserted_events": inserted, "unchanged_events": skipped,
            "candidates_in_fixture": sum(len(item["candidates"]) for item in fixture["events"])}


def main(root: Path) -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    db = sqlite3.connect(root / "switchboard.sqlite3")
    try:
        print(json.dumps(import_events(db, fixture)))
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve())
