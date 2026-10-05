"""Stage two explicitly caveated Bradford events in an isolated working store.

Usage: python tools/explorer_v2/import_bradford_2026_indexed_results.py WORK_ROOT
Council pages were search-indexed but direct downloads returned HTTP 403.
This importer does not certify the source or approve the resulting package.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from build_geography import compact

FIXTURE = Path(__file__).with_name("bradford_2026_indexed_results_review.json")
WARNING = ("Council result indexed publicly; original Moderngov page could not be downloaded "
           "for a source checksum. Treat candidate values as a transcription pending declaration check. "
           "Ballots issued and turnout are not inferred from candidate votes.")


def validated(db: sqlite3.Connection, fixture: dict) -> list[dict]:
    if fixture.get("schema_version") != 1 or fixture.get("review_status") != "indexed_official_pages_original_download_blocked":
        raise ValueError("Expected the indexed, unverified Bradford fixture")
    events = fixture.get("events")
    if not isinstance(events, list) or len(events) != 2 or {item["date"] for item in events} != {"2026-02-12", "2026-06-18"}:
        raise ValueError("Expected exactly the February and June Bradford polls")
    for item in events:
        if item["authority_id"] != "E08000032" or item["source_url"][:8] != "https://":
            raise ValueError("Unexpected Bradford authority or source")
        if item["date"] == "2026-02-12":
            expected = ("E05001369", "2025-05", 1, "by_election", 3514, 6)
        else:
            expected = ("E05016466", "2026-05", 3, "postponed_ordinary_election", 14650, 15)
        if (item["ward_id"], item["boundary_edition"], item["seats"], item["kind"],
                item["candidate_votes"], len(item["candidates"])) != expected:
            raise ValueError("Bradford poll identity, edition or seat count changed")
        boundary_id = f"{item['ward_id']}:{item['boundary_edition']}"
        row = db.execute("SELECT w.name,w.parent_area_id FROM boundary_version b "
                         "JOIN area w ON w.area_id=b.area_id WHERE b.boundary_id=?", (boundary_id,)).fetchone()
        if not row or row[1] != "E08000032":
            raise ValueError(f"Missing event-date ONS ward: {boundary_id}")
        if item["turnout_rate"] is not None or item["electorate"] is not None and item["electorate"] <= 0:
            raise ValueError("Turnout or electorate lacks source support")
        people = item["candidates"]
        if len({person["name"] for person in people}) != len(people) or sum(person["votes"] for person in people) != item["candidate_votes"]:
            raise ValueError("Candidate names or votes do not reconcile")
        if sum(person["elected"] for person in people) != item["seats"] or any(type(person["votes"]) is not int or person["votes"] < 0 for person in people):
            raise ValueError("Elected count or candidate votes invalid")
    return events


def import_events(db: sqlite3.Connection, fixture: dict) -> dict:
    db.execute("PRAGMA foreign_keys=ON")
    events = validated(db, fixture)
    inserted = 0
    now = datetime.now(timezone.utc).isoformat()
    with db:
        for item in events:
            source_id = f"bradford:indexed:{item['date']}:{item['ward_id']}"
            event_id = f"{source_id}:{item['kind']}"
            contest_id = f"{event_id}:contest"
            source_hash = hashlib.sha256((compact(item) + "\n").encode("utf-8")).hexdigest()
            if db.execute("SELECT 1 FROM election_event WHERE event_id=?", (event_id,)).fetchone():
                existing = db.execute("SELECT source_id,area_id,seats_available,candidate_votes FROM contest WHERE contest_id=?", (contest_id,)).fetchone()
                stored_hash = db.execute("SELECT sha256 FROM source_record WHERE source_id=?", (source_id,)).fetchone()
                stored_candidates = {row[0]: row[1:] for row in db.execute(
                    "SELECT result_id,candidate_name,party_label,votes,elected FROM candidate_result WHERE contest_id=?",
                    (contest_id,))}
                expected_candidates = {f"{contest_id}:{index}":
                                       (person["name"], person["party"], person["votes"], int(person["elected"]))
                                       for index, person in enumerate(item["candidates"])}
                if existing != (source_id, item["ward_id"], item["seats"], item["candidate_votes"]):
                    raise ValueError(f"Existing Bradford event differs: {event_id}")
                if stored_hash != (source_hash,) or stored_candidates != expected_candidates:
                    raise ValueError(f"Existing Bradford source or candidate rows differ: {event_id}")
                continue
            if db.execute("SELECT 1 FROM contest c JOIN election_event e ON e.event_id=c.event_id "
                          "WHERE c.area_id=? AND e.election_date=?", (item["ward_id"], item["date"])).fetchone():
                raise ValueError("Duplicate poll at this ward and date")
            db.execute("INSERT INTO source_record VALUES (?,?,?,?,?,?)", (
                source_id, "Bradford Council (indexed page transcription; original download blocked)",
                item["source_url"], item["date"], now, source_hash))
            db.execute("INSERT INTO area_alias VALUES (?,?,?,?,?)", (
                source_id, item["ward_id"], item["ward_id"], "ons_event_date_code", "original_declaration_pending"))
            db.execute("INSERT INTO election_event VALUES (?,?,?,?,?,?,?)", (
                event_id, item["date"], "local_council", item["kind"], item["authority_id"],
                "council_index_transcription_pending", item["source_url"]))
            db.execute("INSERT INTO event_detail VALUES (?,?,?,?)", (
                event_id, "plurality", "local_authority",
                f"{WARNING} Council index calls the June event a by-election; the council result lists three seats and this fixture classifies it as a postponed ordinary poll."))
            boundary_id = f"{item['ward_id']}:{item['boundary_edition']}"
            db.execute("INSERT INTO contest VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                contest_id, event_id, item["ward_id"], item["seats"], item["electorate"], None,
                item["candidate_votes"], source_id, WARNING, boundary_id, boundary_id,
                f"Mapped to ONS {item['boundary_edition']} ward for the {item['date']} poll. Original council declaration still needs a saved source check."))
            for index, person in enumerate(item["candidates"]):
                db.execute("INSERT INTO candidate_result VALUES (?,?,?,?,?,?,?)", (
                    f"{contest_id}:{index}", contest_id, person["name"], person["party"],
                    person["votes"], int(person["elected"]), source_id))
            inserted += 1
        if inserted:
            db.execute("UPDATE coverage SET reason=reason||?,checked_at=? WHERE area_id='E08000032' "
                       "AND election_type='local_council' AND year=2026", (
                           " Two additional Bradford polls are staged from indexed council result pages; original declarations need saved source verification.", now))
    return {"inserted": inserted, "unchanged": len(events) - inserted,
            "candidate_records": sum(len(item["candidates"]) for item in events)}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    root = Path(sys.argv[1]).resolve()
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    with sqlite3.connect(root / "switchboard.sqlite3") as connection:
        print(json.dumps(import_events(connection, fixture)))
