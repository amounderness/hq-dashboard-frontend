"""Read-only check of Barnsley's reviewed Penistone East 2026 result.

Usage: python tools/explorer_v2/verify_2026_barnsley_source.py DATABASE RAW_HTML_DIR
This does not import the result or assume a ballots-issued figure.
"""

import hashlib
import json
import sqlite3
import sys
from pathlib import Path


FIXTURE = Path(__file__).with_name("official_byelections_2026_barnsley_review.json")


def check(fixture: dict, db: sqlite3.Connection | None = None, raw_dir: Path | None = None) -> dict:
    if fixture.get("schema_version") != 1 or fixture.get("review_status") != "source_reviewed_not_imported":
        raise ValueError("Expected an unimported Barnsley source-review fixture")
    events = fixture.get("events")
    if not isinstance(events, list) or len(events) != 1:
        raise ValueError("Expected exactly one Penistone East event")
    item = events[0]
    if (item["date"], item["authority_id"], item["ward_id"], item["ward_name"], item["seats"]) != (
            "2026-08-20", "E08000038", "E05016245", "Penistone East", 1):
        raise ValueError("Incorrect Barnsley event identity")
    if (item["source_document_type"] != "text/html" or item["source_document_file"] != "penistone-east-result.html"
            or not item["source_url"].startswith("https://www.barnsley.gov.uk/")):
        raise ValueError("Incorrect official source")
    people = item["candidates"]
    if len(people) != 8 or len({person["name"] for person in people}) != 8:
        raise ValueError("Expected eight unique candidates")
    if any(type(person["votes"]) is not int or person["votes"] < 0
           or type(person["elected"]) is not bool or not person["source_party_label"].strip()
           or not person["party"].strip() for person in people):
        raise ValueError("Invalid candidate fields")
    valid = sum(person["votes"] for person in people)
    winners = [person for person in people if person["elected"]]
    if valid != item["reported_votes_cast"] or valid != 3346 or len(winners) != 1 or winners[0]["name"] != "John Roberts" or winners[0]["votes"] != 1728:
        raise ValueError("Candidate votes or winner do not match the council page")
    if (item["electorate"] != 8674 or item["rejected"] != 7 or item["ballots_issued"] is not None
            or abs(valid / item["electorate"] * 100 - item["declared_turnout_percent"]) > 0.011
            or "Do not infer ballots issued" not in item["quality_note"]):
        raise ValueError("Turnout or ballot ambiguity was lost")
    if raw_dir is not None:
        raw = (raw_dir / item["source_document_file"]).read_bytes()
        if b"<html" not in raw[:1000].lower() or hashlib.sha256(raw).hexdigest() != item["source_document_sha256"]:
            raise ValueError("Council HTML snapshot checksum mismatch")
    if db is not None:
        area = db.execute("SELECT name,parent_area_id,area_type FROM area WHERE area_id=?", (item["ward_id"],)).fetchone()
        if area != ("Penistone East", "E08000038", "ward"):
            raise ValueError("Canonical ward mismatch")
        existing = db.execute("SELECT 1 FROM contest c JOIN election_event e ON e.event_id=c.event_id "
                              "WHERE c.area_id=? AND e.election_date=? AND e.election_type='local_council'",
                              (item["ward_id"], item["date"])).fetchone()
        if existing:
            raise ValueError("Council event already staged")
    return {"review_status": item["date"] + ":source_reviewed_not_imported", "valid_votes": valid,
            "candidates": len(people), "ballots_issued": None}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    with sqlite3.connect(f"file:{Path(sys.argv[1]).resolve().as_posix()}?mode=ro", uri=True) as db:
        print(json.dumps(check(fixture, db, Path(sys.argv[2]))))
