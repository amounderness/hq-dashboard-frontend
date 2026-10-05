"""Add the council's published Sheffield May 2026 ward turnout to a copied store.

Usage: python tools/explorer_v2/enrich_sheffield_2026_ordinary_turnout.py NEW_WORKING_DIR OFFICIAL_HTML
The source page is pinned; this command does not publish or activate a release.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from audit_sheffield_2026_ordinary import CouncilResults, POLL_DATE, SHEFFIELD, SNAPSHOT_SHA256, check


SOURCE_ID = "council:E08000039:2026-05-07:ordinary-turnout"
SOURCE_URL = "https://www.sheffield.gov.uk/your-city-council/elections/local-elections-results-2026"
NOTE = f"Council-reported ward turnout, Sheffield City Council, 7 May 2026 ({SOURCE_URL}); HTML SHA-256: {SNAPSHOT_SHA256}."
ARITHMETIC_DIFFERENCES = {"Gleadless Valley", "Graves Park", "Richmond", "Southey"}
MULTI_SEAT = {"Beighton", "Firth Park"}


def enrich(db: sqlite3.Connection, raw: bytes) -> dict:
    if hashlib.sha256(raw).hexdigest() != SNAPSHOT_SHA256:
        raise ValueError("Official Sheffield HTML snapshot checksum mismatch")
    db.execute("PRAGMA foreign_keys=ON")
    source = db.execute("SELECT publisher,url,vintage,sha256 FROM source_record WHERE source_id=?", (SOURCE_ID,)).fetchone()
    expected_source = ("Sheffield City Council (official turnout enrichment)", SOURCE_URL, POLL_DATE, SNAPSHOT_SHA256)
    if source is not None and source != expected_source:
        raise ValueError("Sheffield turnout source has changed; review a new source version")
    parser = CouncilResults()
    parser.feed(raw.decode("utf-8", errors="replace"))
    parser._finish_ward()
    official = {ward["name"]: ward for ward in parser.wards}
    if len(official) != 28 or len(parser.wards) != 28:
        raise ValueError("Expected 28 unique Sheffield council wards")
    staged = {name: (contest_id, turnout, quality_note) for contest_id, name, turnout, quality_note in db.execute(
        "SELECT c.contest_id,a.name,c.turnout_rate,c.quality_note FROM contest c "
        "JOIN area a ON a.area_id=c.area_id JOIN election_event e ON e.event_id=c.event_id "
        "WHERE e.authority_id=? AND e.election_date=? AND e.event_kind='ordinary_election'",
        (SHEFFIELD, POLL_DATE))}
    if set(official) != set(staged):
        raise ValueError("Sheffield council wards and staged contests differ")
    turnout = {}
    for name, ward in official.items():
        match = re.search(r"Turnouts?:\s*([\d.]+)%", " ".join(ward["paragraphs"]))
        if not match:
            raise ValueError(f"Published turnout absent: {name}")
        value = float(match.group(1)) / 100
        if not 0 <= value <= 1:
            raise ValueError(f"Invalid published turnout: {name}")
        turnout[name] = value
    if source is not None:
        audit = check(db, raw, allow_existing_turnout=True)
        if audit["mismatches"] or audit["candidate_rows_compared"] != 196:
            raise ValueError("Previously enriched Sheffield results no longer match the council source")
        for name, (_, current, note) in staged.items():
            if current is None or abs(current - turnout[name]) > 1e-12 or NOTE not in (note or ""):
                raise ValueError(f"Partially enriched Sheffield turnout: {name}")
        return {"updated_wards": 0, "unchanged_wards": 28}
    audit = check(db, raw)
    if (audit["official_wards"] != 28 or audit["staged_wards"] != 28
            or audit["candidate_rows_compared"] != 196
            or audit["official_turnout_rows_missing_from_staging"] != 28
            or audit["mismatches"] or set(audit["multi_seat_wards"]) != MULTI_SEAT
            or {row["ward"] for row in audit["single_seat_turnout_arithmetic_differences"]} != ARITHMETIC_DIFFERENCES
            or len(audit["name_differences"]) != 4):
        raise ValueError(f"Official Sheffield source audit did not meet reviewed contract: {audit}")
    now = datetime.now(timezone.utc).isoformat()
    with db:
        db.execute("INSERT INTO source_record VALUES (?,?,?,?,?,?)", (SOURCE_ID, *expected_source[:3], now, SNAPSHOT_SHA256))
        for name, (contest_id, _, quality_note) in staged.items():
            caveat = " Council figure; no ballot count inferred from a multi-seat candidate-vote total." if name in MULTI_SEAT else ""
            if name in ARITHMETIC_DIFFERENCES:
                difference = next(row for row in audit["single_seat_turnout_arithmetic_differences"] if row["ward"] == name)
                caveat += (f" Council stated {difference['council_percent']:.2f}%; candidate votes plus rejected papers "
                           f"imply {difference['derived_percent']:.5f}%; the published figure is retained.")
            db.execute("UPDATE contest SET turnout_rate=?,quality_note=? WHERE contest_id=?",
                       (turnout[name], (quality_note or "").rstrip() + " " + NOTE + caveat, contest_id))
        event_id = db.execute("SELECT event_id FROM election_event WHERE authority_id=? AND election_date=? "
                              "AND event_kind='ordinary_election'", (SHEFFIELD, POLL_DATE)).fetchone()[0]
        detail = db.execute("SELECT notes FROM event_detail WHERE event_id=?", (event_id,)).fetchone()
        if detail:
            db.execute("UPDATE event_detail SET notes=? WHERE event_id=?", ((detail[0] or "").rstrip() + " " + NOTE +
                       " Four source-name variants and four small turnout arithmetic differences remain documented.", event_id))
        coverage = db.execute("SELECT reason FROM coverage WHERE area_id=? AND election_type='local_council' AND year=2026",
                              (SHEFFIELD,)).fetchone()
        if coverage:
            db.execute("UPDATE coverage SET reason=?,checked_at=? WHERE area_id=? AND election_type='local_council' AND year=2026",
                       ((coverage[0] or "").rstrip() + " Council-reported 2026 ordinary ward turnout added from pinned official HTML; candidate results retain their staged source.", now, SHEFFIELD))
    return {"updated_wards": 28, "unchanged_wards": 0, "audit": audit}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    with sqlite3.connect(Path(sys.argv[1]).resolve() / "switchboard.sqlite3") as connection:
        print(json.dumps(enrich(connection, Path(sys.argv[2]).resolve().read_bytes()), ensure_ascii=False))
