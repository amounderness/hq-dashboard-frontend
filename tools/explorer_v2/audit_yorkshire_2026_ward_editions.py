"""Read-only comparison of pinned ONS ward-code snapshots and a local store.

Usage: python tools/explorer_v2/audit_yorkshire_2026_ward_editions.py \
    STORE.sqlite3 MAY_2025_CODES.json MAY_2026_CODES.json

The source snapshots contain ward codes and names only, not polygons. This
audit therefore detects edition mismatches; it does not compare geometry.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path


SNAPSHOT_SHA256 = {
    2025: "78896a052920b8a6feaed1ee9312354c1e2c33ebd688d9722751da37772b0e91",
    2026: "3fadaacf8b87d819cb2aeb539b6024a57c3966e97073d04fb955c32a0a9780b4",
}


def read_wards(path: Path, year: int) -> dict[str, dict[str, str]]:
    content = path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if digest != SNAPSHOT_SHA256[year]:
        raise ValueError(f"{year} ONS snapshot hash mismatch: {digest}")
    payload = json.loads(content)
    result: dict[str, dict[str, str]] = defaultdict(dict)
    for feature in payload["features"]:
        attrs = feature["attributes"]
        result[attrs[f"LAD{year % 100}CD"]][attrs[f"WD{year % 100}CD"]] = attrs[f"WD{year % 100}NM"]
    return dict(result)


def audit(store: Path, snapshot_2025: Path, snapshot_2026: Path) -> dict:
    old = read_wards(snapshot_2025, 2025)
    new = read_wards(snapshot_2026, 2026)
    if old.keys() != new.keys() or len(old) != 15 or sum(map(len, old.values())) != 410 or sum(map(len, new.values())) != 411:
        raise ValueError("Unexpected Yorkshire authority or ward count in snapshots")
    revised = sorted(code for code in old if set(old[code]) != set(new[code]))
    with sqlite3.connect(f"file:{store.resolve().as_posix()}?mode=ro", uri=True) as db:
        rows = db.execute(
            "SELECT e.authority_id, c.display_boundary_id, count(*) "
            "FROM contest c JOIN election_event e ON e.event_id=c.event_id "
            "WHERE e.election_date >= '2026-05-07' AND e.election_date < '2027-01-01' "
            "AND e.authority_id IN ({}) GROUP BY e.authority_id,c.display_boundary_id".format(
                ",".join("?" for _ in revised)
            ),
            revised,
        ).fetchall()
    counts = {code: {"contests": 0, "linked_2025": 0, "unmapped": 0, "other": 0} for code in revised}
    for code, boundary_id, count in rows:
        counts[code]["contests"] += count
        if boundary_id is None:
            counts[code]["unmapped"] += count
        elif boundary_id.endswith(":2025-05"):
            counts[code]["linked_2025"] += count
        else:
            counts[code]["other"] += count
    return {
        "snapshot_sha256": SNAPSHOT_SHA256,
        "ward_counts": {"2025": sum(map(len, old.values())), "2026": sum(map(len, new.values()))},
        "revised_authorities": {
            code: {
                "wards_2025": len(old[code]),
                "wards_2026": len(new[code]),
                "retained_codes": len(set(old[code]) & set(new[code])),
                **counts[code],
            }
            for code in revised
        },
    }


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: audit_yorkshire_2026_ward_editions.py STORE 2025_JSON 2026_JSON")
    print(json.dumps(audit(*(Path(value) for value in sys.argv[1:])), indent=2))
