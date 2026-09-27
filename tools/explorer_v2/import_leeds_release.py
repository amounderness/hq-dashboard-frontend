"""Import the audited Leeds v0.6.0 release into the generic v2 staging store.

Usage: python tools/explorer_v2/import_leeds_release.py data/explorer-v2 PATH_TO_LEEDS_RELEASE
This compatibility import does not publish data or infer national coverage.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

LEEDS = "E08000035"


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify(release: Path) -> tuple[dict, str]:
    manifest_path = release / "manifest.json"
    raw = manifest_path.read_bytes()
    manifest = json.loads(raw)
    if manifest["package_id"] != "leeds-pulse-v0.6.0" or not manifest["publication_allowed"]:
        raise ValueError("Expected the audited, publishable Leeds v0.6.0 release")
    for relative, expected in manifest["object_sha256"].items():
        actual = hashlib.sha256((release / relative).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Leeds source object changed: {relative}")
    return manifest, hashlib.sha256(raw).hexdigest()


def source_rows(value):
    if isinstance(value, dict):
        if value.get("source_id") and value.get("url"):
            yield value
        for nested in value.values():
            yield from source_rows(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from source_rows(nested)


def main(staging: Path, release: Path) -> None:
    manifest, digest = verify(release)
    db = sqlite3.connect(staging / "switchboard.sqlite3")
    db.execute("PRAGMA foreign_keys = ON")
    now = datetime.now(timezone.utc).isoformat()
    if not db.execute("SELECT 1 FROM area WHERE area_id=?", (LEEDS,)).fetchone():
        raise ValueError("ONS geography has not been imported or Leeds authority is absent")
    try:
        with db:
            db.execute("INSERT INTO source_record VALUES (?,?,?,?,?,?)", (
                manifest["package_id"], "Switchboard audited Leeds release",
                "urn:switchboard:release:leeds-pulse-v0.6.0", "2026-09-26", now, digest,
            ))
            for source in source_rows(read(release / "sources.json")):
                sid = source["source_id"]
                db.execute("INSERT OR IGNORE INTO source_record VALUES (?,?,?,?,?,?)", (
                    sid, source.get("note", "Leeds published source"), source["url"],
                    source.get("retrieved_on", "2026-09"), now,
                    source.get("sha256") or digest,
                ))
            for year in manifest["years"]:
                base = release / "elections" / str(year) / "local-council"
                events = read(base / "events.json")
                contests = read(base / "contests.json")
                candidates = read(base / "candidates.json")
                for item in events:
                    db.execute("INSERT INTO election_event VALUES (?,?,?,?,?,?,?)", (
                        item["event_id"], item["election_date"], item["election_type"],
                        item["event_kind"], item["authority_code"], item["status"],
                        item.get("source_url"),
                    ))
                    db.execute("INSERT INTO event_detail VALUES (?,?,?,?)", (
                        item["event_id"], "plurality", "metropolitan_district",
                        "Leeds City Council single or multi-seat ward contest; see audited release for election-specific rules."))
                for item in contests:
                    ward = item["ward_code"]
                    if not db.execute("SELECT 1 FROM area WHERE area_id=?", (ward,)).fetchone():
                        raise ValueError(f"Leeds ward absent from ONS 2025 register: {ward}")
                    db.execute("INSERT INTO contest VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                        item["contest_id"], item["event_id"], ward,
                        item["seats_available"], item.get("electorate"), item.get("turnout_rate"),
                        item.get("all_candidate_votes"), item.get("source_id"),
                        item.get("data_quality_note"), None, f"{ward}:2025-05",
                        item.get("boundary_match", "Historical boundary equivalence not certified."),
                    ))
                for index, item in enumerate(candidates):
                    db.execute("INSERT INTO candidate_result VALUES (?,?,?,?,?,?,?)", (
                        item.get("candidate_result_id") or f"{item['contest_id']}:{index}",
                        item["contest_id"], item["candidate_name"], item["party_label"],
                        item.get("votes"), int(item["elected"]), item.get("source_id"),
                    ))
                status = "partial_by_election_only" if year == 2025 else "checked_published"
                reason = ("Only the Morley South by-election is recorded; Leeds had no scheduled 2025 council poll."
                          if year == 2025 else "Audited Leeds Pulse v0.6.0 release; see its source decisions and caveats.")
                db.execute("UPDATE coverage SET status=?, reason=?, source_url=?, checked_at=? "
                           "WHERE area_id=? AND election_type='local_council' AND year=?", (
                    status, reason, "https://datamillnorth.org/dataset/local-election-results-20jwj",
                    now, LEEDS, year,
                ))
        count = db.execute("SELECT COUNT(*) FROM candidate_result").fetchone()[0]
        contests_count = db.execute("SELECT COUNT(*) FROM contest").fetchone()[0]
        if count != manifest["candidate_records"] or contests_count != manifest["contests"]:
            raise ValueError(f"Leeds count mismatch: candidates {count}, contests {contests_count}")
        print(json.dumps({"events": db.execute("SELECT COUNT(*) FROM election_event").fetchone()[0],
                          "contests": contests_count, "candidates": count}))
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
