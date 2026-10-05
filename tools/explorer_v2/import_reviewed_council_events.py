"""Import reviewed English principal-council by-elections into a local working copy.

Usage: python tools/explorer_v2/import_reviewed_council_events.py FIXTURE_JSON NEW_WORKING_DIR RAW_SOURCE_DIR
The working directory must already contain a copied switchboard.sqlite3. This
command does not build, upload, approve, or activate a release.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path


SHA256 = re.compile(r"^[0-9a-f]{64}$")


def canonical_bytes(item: dict) -> bytes:
    return json.dumps(item, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def checked_item(db: sqlite3.Connection, item: dict, raw_dir: Path) -> tuple[str, int, float]:
    event_date = date.fromisoformat(item["date"]).isoformat()
    authority = db.execute("SELECT area_type,country_code FROM area WHERE area_id=?", (item["authority_id"],)).fetchone()
    ward = db.execute("SELECT name,parent_area_id,area_type FROM area WHERE area_id=?", (item["ward_id"],)).fetchone()
    if authority != ("local_authority", "E92000001") or ward != (item["ward_name"], item["authority_id"], "ward"):
        raise ValueError(f"Not a canonical English council ward: {item['ward_id']}")
    if type(item["seats"]) is not int or item["seats"] != 1:
        raise ValueError(f"Expected a one-seat principal-council by-election: {item['ward_id']}")
    people = item["candidates"]
    names = [person["name"] for person in people]
    if len(people) < 2 or len(set(names)) != len(names) or any(not name.strip() for name in names):
        raise ValueError(f"Missing or duplicate candidate: {item['ward_id']}")
    if any(not person["party"].strip() or not person["source_party_label"].strip()
           or type(person["votes"]) is not int or person["votes"] < 0
           or type(person["elected"]) is not bool for person in people):
        raise ValueError(f"Invalid candidate fields: {item['ward_id']}")
    winners = [person for person in people if person["elected"]]
    if len(winners) != 1 or winners[0]["votes"] != max(person["votes"] for person in people):
        raise ValueError(f"Winner does not match one-seat result: {item['ward_id']}")
    valid_votes = sum(person["votes"] for person in people)
    rejected, ballots, electorate = item["rejected"], item["ballots_issued"], item["electorate"]
    if type(rejected) is not int or rejected < 0 or type(electorate) is not int or electorate <= 0:
        raise ValueError(f"Invalid election counts: {item['ward_id']}")
    declared = item["declared_turnout_percent"]
    if type(declared) not in (int, float) or not 0 <= declared <= 100:
        raise ValueError(f"Invalid declared turnout: {item['ward_id']}")
    document_type = item.get("source_document_type", "application/pdf")
    if document_type == "application/pdf":
        if type(ballots) is not int or ballots < 0 or ballots > electorate or valid_votes + rejected != ballots:
            raise ValueError(f"Ballot count does not reconcile: {item['ward_id']}")
        turnout = ballots / electorate
    elif document_type == "text/html":
        if ballots is not None or type(item.get("reported_votes_cast")) is not int or item["reported_votes_cast"] != valid_votes:
            raise ValueError(f"Council HTML votes cast do not reconcile: {item['ward_id']}")
        turnout = item["declared_turnout_percent"] / 100
    else:
        raise ValueError(f"Unsupported council source type: {document_type}")
    if document_type == "application/pdf" and abs(turnout * 100 - declared) > 0.011:
        raise ValueError(f"Turnout does not reconcile: {item['ward_id']}")
    if document_type == "text/html" and abs(valid_votes / electorate * 100 - declared) > 0.011:
        raise ValueError(f"Published votes cast and turnout disagree: {item['ward_id']}")
    filename = item["source_document_file"]
    extension = ".pdf" if document_type == "application/pdf" else ".html"
    if Path(filename).name != filename or filename in ("", ".", "..") or not filename.lower().endswith(extension):
        raise ValueError(f"Unsafe declaration file name: {item['ward_id']}")
    expected_hash = item["source_document_sha256"]
    if not SHA256.fullmatch(expected_hash):
        raise ValueError(f"Invalid declaration hash: {item['ward_id']}")
    source_bytes = (raw_dir / filename).read_bytes()
    signature_ok = (source_bytes.startswith(b"%PDF-") if document_type == "application/pdf"
                    else b"<html" in source_bytes[:2048].lower() or b"<!doctype html" in source_bytes[:2048].lower())
    if not signature_ok or hashlib.sha256(source_bytes).hexdigest() != expected_hash:
        raise ValueError(f"Council source checksum mismatch: {item['ward_id']}")
    if (not item["source_url"].startswith("https://") or not item["publisher"].strip()
            or not item["quality_note"].strip()):
        raise ValueError(f"Missing source review: {item['ward_id']}")
    boundary = db.execute("SELECT 1 FROM boundary_version WHERE boundary_id=? AND area_id=?",
                          (f"{item['ward_id']}:2025-05", item["ward_id"])).fetchone()
    if not boundary:
        raise ValueError(f"No explicit display boundary: {item['ward_id']}")
    coverage = db.execute("SELECT status FROM coverage WHERE area_id=? AND election_type='local_council' AND year=?",
                          (item["authority_id"], int(event_date[:4]))).fetchone()
    if not coverage or coverage[0] not in {"secondary_source_staged", "no_record_in_annual_source", "partial_by_election_only"}:
        raise ValueError(f"Unexpected council-year coverage: {item['authority_id']} {event_date[:4]}")
    return event_date, valid_votes, turnout


def _ids(item: dict, event_date: str) -> tuple[str, str, str]:
    source_id = f"council:{item['authority_id']}:{event_date}:{item['ward_id']}"
    return source_id, f"{source_id}:by-election", f"{source_id}:by-election:contest"


def _notes(item: dict) -> str:
    printed_labels = "; ".join(f"{person['name']}: {person['source_party_label']} → {person['party']}"
                               for person in item["candidates"])
    source_label = ("Original declaration" if item.get("source_document_type", "application/pdf") == "application/pdf"
                    else "Original council HTML")
    return (f"{item['quality_note']} {source_label} SHA-256: {item['source_document_sha256']}. "
            f"Printed party labels → display labels: {printed_labels}. "
            f"Corroborating council record: {item.get('corroboration_url', item['source_url'])}")


def _check_existing(db: sqlite3.Connection, item: dict, event_date: str, votes: int, turnout: float) -> bool:
    source_id, event_id, contest_id = _ids(item, event_date)
    source = db.execute("SELECT publisher,url,vintage,sha256 FROM source_record WHERE source_id=?", (source_id,)).fetchone()
    if source is None:
        if db.execute("SELECT 1 FROM election_event WHERE event_id=?", (event_id,)).fetchone():
            raise ValueError(f"Council event already exists without its source: {source_id}")
        if db.execute("SELECT 1 FROM contest c JOIN election_event e ON e.event_id=c.event_id "
                      "WHERE c.area_id=? AND e.election_date=? AND e.election_type='local_council'",
                      (item["ward_id"], event_date)).fetchone():
            raise ValueError(f"Council contest already exists: {source_id}")
        return False
    expected_hash = hashlib.sha256(canonical_bytes(item)).hexdigest()
    expected_source = (f"{item['publisher']} (reviewed transcription)", item["source_url"], event_date, expected_hash)
    if source != expected_source:
        raise ValueError(f"Council transcription changed; review a new source version: {source_id}")
    event = db.execute("SELECT election_date,election_type,event_kind,authority_id,status,source_url "
                       "FROM election_event WHERE event_id=?", (event_id,)).fetchone()
    detail = db.execute("SELECT voting_system,authority_tier,notes FROM event_detail WHERE event_id=?",
                        (event_id,)).fetchone()
    alias = db.execute("SELECT canonical_area_id,match_method,status FROM area_alias WHERE source_id=? AND source_code=?",
                       (source_id, item["ward_id"])).fetchone()
    contest = db.execute("SELECT event_id,area_id,seats_available,electorate,turnout_rate,candidate_votes,source_id,"
                         "quality_note,result_boundary_id,display_boundary_id,comparability_note "
                         "FROM contest WHERE contest_id=?", (contest_id,)).fetchone()
    candidates = list(db.execute("SELECT result_id,candidate_name,party_label,votes,elected,source_id FROM candidate_result "
                                 "WHERE contest_id=? ORDER BY result_id", (contest_id,)))
    expected_candidates = [(f"{contest_id}:{index}", person["name"], person["party"], person["votes"],
                            int(person["elected"]), source_id) for index, person in enumerate(item["candidates"])]
    if (event != (event_date, "local_council", "by_election", item["authority_id"], "council_source_staged", item["source_url"])
            or detail != ("plurality", "local_authority", _notes(item))
            or alias != (item["ward_id"], "reviewed_ons_code", "map_link_unverified")
            or contest is None or contest[:4] != (event_id, item["ward_id"], 1, item["electorate"])
            or contest[4] is None or abs(contest[4] - turnout) > 1e-12
            or contest[5:] != (votes, source_id, item["quality_note"], None, f"{item['ward_id']}:2025-05",
                               "Shown on the 2025 display ward by reviewed code; exact event-date boundary equivalence remains unverified.")
            or candidates != expected_candidates):
        raise ValueError(f"Existing event is incomplete: {event_id}")
    return True


def import_events(db: sqlite3.Connection, fixture: dict, raw_dir: Path) -> dict:
    if fixture.get("schema_version") != 1 or fixture.get("review_status") != "source_reviewed_not_imported":
        raise ValueError("Expected a reviewed, unimported fixture, schema 1")
    items = fixture.get("events")
    if not isinstance(items, list) or not items:
        raise ValueError("Expected nonempty council-event fixture")
    db.execute("PRAGMA foreign_keys=ON")
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    unchanged = 0
    affected: dict[tuple[str, int], list[str]] = defaultdict(list)
    seen = set()
    with db:
        # Validate the entire fixture, including its pinned source files, before the first write.
        prepared = []
        for item in items:
            event_date, votes, turnout = checked_item(db, item, raw_dir)
            identity = (item["authority_id"], event_date, item["ward_id"])
            if identity in seen:
                raise ValueError(f"Duplicate fixture event: {identity}")
            seen.add(identity)
            prepared.append((item, event_date, votes, turnout))
        for item, event_date, votes, turnout in prepared:
            if _check_existing(db, item, event_date, votes, turnout):
                unchanged += 1
                continue
            source_id, event_id, contest_id = _ids(item, event_date)
            source_hash = hashlib.sha256(canonical_bytes(item)).hexdigest()
            db.execute("INSERT INTO source_record VALUES (?,?,?,?,?,?)", (
                source_id, f"{item['publisher']} (reviewed transcription)", item["source_url"],
                event_date, now, source_hash))
            db.execute("INSERT INTO area_alias VALUES (?,?,?,?,?)", (
                source_id, item["ward_id"], item["ward_id"], "reviewed_ons_code", "map_link_unverified"))
            db.execute("INSERT INTO election_event VALUES (?,?,?,?,?,?,?)", (
                event_id, event_date, "local_council", "by_election", item["authority_id"],
                "council_source_staged", item["source_url"]))
            db.execute("INSERT INTO event_detail VALUES (?,?,?,?)", (
                event_id, "plurality", "local_authority", _notes(item)))
            db.execute("INSERT INTO contest VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                contest_id, event_id, item["ward_id"], 1, item["electorate"], turnout,
                votes, source_id, item["quality_note"], None, f"{item['ward_id']}:2025-05",
                "Shown on the 2025 display ward by reviewed code; exact event-date boundary equivalence remains unverified."))
            for index, person in enumerate(item["candidates"]):
                db.execute("INSERT INTO candidate_result VALUES (?,?,?,?,?,?,?)", (
                    f"{contest_id}:{index}", contest_id, person["name"], person["party"],
                    person["votes"], int(person["elected"]), source_id))
            affected[(item["authority_id"], int(event_date[:4]))].append(f"{item['ward_name']} ({event_date})")
            inserted += 1
        for (authority_id, year), event_names in affected.items():
            status, reason, source_url = db.execute(
                "SELECT status,reason,source_url FROM coverage WHERE area_id=? AND election_type='local_council' AND year=?",
                (authority_id, year)).fetchone()
            if status == "no_record_in_annual_source":
                status = "partial_by_election_only"
            addition = (" Council-sourced by-elections added: " + ", ".join(event_names)
                        + ". The council-year event register is not certified exhaustive.")
            db.execute("UPDATE coverage SET status=?,reason=?,source_url=?,checked_at=? "
                       "WHERE area_id=? AND election_type='local_council' AND year=?", (
                           status, reason + addition, source_url, now, authority_id, year))
    return {"inserted_events": inserted, "unchanged_events": unchanged,
            "candidates_in_fixture": sum(len(item["candidates"]) for item in items)}


def main(fixture_path: Path, root: Path, raw_dir: Path) -> None:
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    db_path = root / "switchboard.sqlite3"
    if not db_path.is_file():
        raise FileNotFoundError(f"Create a new working copy first: {db_path}")
    with sqlite3.connect(db_path) as db:
        print(json.dumps(import_events(db, fixture, raw_dir)))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve())
