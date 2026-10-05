"""Check the reviewed Sheffield 2026 by-election transcription without importing it.

Usage: python tools/explorer_v2/verify_2026_sheffield_sources.py DATABASE RAW_PDF_DIR
Both inputs are local, ignored research files. This command never writes to them.
"""

import hashlib
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path


FIXTURE = Path(__file__).with_name("official_byelections_2026_sheffield.json")
EXPECTED = {
    ("2026-08-27", "E05010879", "Southey"): "southey-declaration.pdf",
    ("2026-09-17", "E05010882", "Walkley"): "walkley-declaration.pdf",
}
PARTIES = {"Labour", "Conservative", "Liberal Democrat", "Reform UK", "Green", "TUSC"}


def check(fixture: dict, db: sqlite3.Connection | None = None, raw_dir: Path | None = None) -> dict:
    if fixture.get("schema_version") != 1 or fixture.get("review_status") != "source_reviewed_not_imported":
        raise ValueError("Expected the unimported Sheffield source-review fixture")
    events = fixture.get("events")
    if not isinstance(events, list) or {(event.get("date"), event.get("ward_id"), event.get("ward_name"))
                                       for event in events} != set(EXPECTED) or len(events) != len(EXPECTED):
        raise ValueError("Expected exactly the Southey and Walkley 2026 events")
    candidates = 0
    for event in events:
        key = (event["date"], event["ward_id"], event["ward_name"])
        if date.fromisoformat(event["date"]).year != 2026 or event["authority_id"] != "E08000039" or event["seats"] != 1:
            raise ValueError(f"Invalid council event identity: {key}")
        if not event["source_url"].startswith("https://www.sheffield.gov.uk/") or not event["corroboration_url"].startswith("https://www.sheffield.gov.uk/"):
            raise ValueError(f"Non-council source: {key}")
        people = event["candidates"]
        names = [person["name"] for person in people]
        if len(people) < 2 or len(set(names)) != len(names) or any(not name.strip() for name in names):
            raise ValueError(f"Missing or duplicate candidate: {key}")
        if any(person["party"] not in PARTIES or not person["source_party_label"].strip()
               or type(person["votes"]) is not int or person["votes"] < 0
               or type(person["elected"]) is not bool for person in people):
            raise ValueError(f"Invalid candidate fields: {key}")
        elected = [person for person in people if person["elected"]]
        if len(elected) != 1 or elected[0]["votes"] != max(person["votes"] for person in people):
            raise ValueError(f"Winner does not match one-seat result: {key}")
        valid_votes = sum(person["votes"] for person in people)
        if (type(event["rejected"]) is not int or event["rejected"] < 0
                or valid_votes + event["rejected"] != event["ballots_issued"]
                or event["ballots_issued"] > event["electorate"]):
            raise ValueError(f"Ballot count does not reconcile: {key}")
        if abs(event["ballots_issued"] / event["electorate"] * 100 - event["declared_turnout_percent"]) > 0.011:
            raise ValueError(f"Turnout does not reconcile: {key}")
        if not event["quality_note"].strip() or len(event["source_document_sha256"]) != 64:
            raise ValueError(f"Missing provenance: {key}")
        if raw_dir is not None:
            if event.get("source_document_file") != EXPECTED[key]:
                raise ValueError(f"Unexpected declaration file: {key}")
            pdf = (raw_dir / event["source_document_file"]).read_bytes()
            if not pdf.startswith(b"%PDF-") or hashlib.sha256(pdf).hexdigest() != event["source_document_sha256"]:
                raise ValueError(f"Declaration PDF checksum mismatch: {key}")
        if db is not None:
            area = db.execute("SELECT name,parent_area_id,area_type FROM area WHERE area_id=?", (event["ward_id"],)).fetchone()
            if area != (event["ward_name"], event["authority_id"], "ward"):
                raise ValueError(f"Canonical ward mismatch: {key}")
            existing = db.execute("SELECT 1 FROM contest c JOIN election_event e ON e.event_id=c.event_id "
                                  "WHERE c.area_id=? AND e.election_date=? AND e.election_type='local_council'",
                                  (event["ward_id"], event["date"])).fetchone()
            if existing:
                raise ValueError(f"Event is already in the working store: {key}")
        candidates += len(people)
    return {"review_status": fixture["review_status"], "events": len(events), "candidates": candidates,
            "valid_candidate_votes": sum(sum(person["votes"] for person in event["candidates"]) for event in events)}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    with sqlite3.connect(f"file:{Path(sys.argv[1]).resolve().as_posix()}?mode=ro", uri=True) as db:
        print(json.dumps(check(fixture, db, Path(sys.argv[2]))))
