"""Stage 2026 council contests against the new ward edition in a working copy.

Usage: python tools/explorer_v2/map_2026_yorkshire_contests.py WORK_ROOT
This is a name-and-date mapping proposal, not candidate-level council source
reconciliation. The package must remain unpublished until that review is done.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

from import_ons_2026_wards import CODES_SHA256, SOURCE_ID, verified_json

REVISED = {"E08000032", "E08000033", "E08000034", "E08000036", "E08000038"}
EXPECTED = {"E08000032": 29, "E08000033": 18, "E08000034": 23,
            "E08000036": 21, "E08000038": 22}


def key(name: str) -> str:
    return " ".join(name.casefold().replace("&", "and").split())


def main(root: Path, raw_root: Path) -> dict:
    codes = verified_json(raw_root / "yorkshire-wards-2026-codes.json", CODES_SHA256)
    by_name: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
    for row in codes["features"]:
        props = row["attributes"]
        if props["LAD26CD"] in REVISED:
            by_name[props["LAD26CD"], key(props["WD26NM"])].append((props["WD26CD"], props["WD26NM"]))
    db = sqlite3.connect(root / "switchboard.sqlite3")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        rows = list(db.execute(
            "SELECT c.contest_id,c.area_id,a.name,e.authority_id,e.election_date,c.display_boundary_id "
            "FROM contest c JOIN election_event e ON e.event_id=c.event_id "
            "JOIN area a ON a.area_id=c.area_id "
            "WHERE e.authority_id IN ({}) AND e.election_date BETWEEN '2026-05-07' AND '2026-12-31' "
            "ORDER BY e.authority_id,c.contest_id".format(",".join("?" for _ in REVISED)), sorted(REVISED)))
        found = Counter(row["authority_id"] for row in rows)
        if dict(found) != EXPECTED:
            raise ValueError(f"Unexpected staged 2026 contest counts: {dict(found)}")
        proposals = []
        for row in rows:
            matches = by_name[row["authority_id"], key(row["name"])]
            if len(matches) != 1:
                raise ValueError(f"Ambiguous 2026 ward name: {row['contest_id']} {row['name']}")
            code, official_name = matches[0]
            boundary_id = f"{code}:2026-05"
            if not db.execute("SELECT 1 FROM boundary_version WHERE boundary_id=? AND area_id=?", (boundary_id, code)).fetchone():
                raise ValueError(f"Missing new ONS ward geometry: {code}")
            proposals.append({"contest_id": row["contest_id"], "authority_id": row["authority_id"],
                              "election_date": row["election_date"], "source_area_id": row["area_id"],
                              "source_name": row["name"], "ons_2026_name": official_name,
                              "new_ward_code": code, "boundary_id": boundary_id,
                              "review_status": "ons_name_and_date_match; council_candidate_check_pending"})
        with db:
            for item in proposals:
                note = ("2026 ward code selected from the official ONS edition by unique ward name and poll date; "
                        "candidate-level council reconciliation remains open. Original staged area: "
                        f"{item['source_area_id']} ({item['source_name']}).")
                db.execute("UPDATE contest SET area_id=?,result_boundary_id=?,display_boundary_id=?,"
                           "comparability_note=? WHERE contest_id=?", (
                               item["new_ward_code"], item["boundary_id"], item["boundary_id"],
                               note, item["contest_id"]))
                db.execute("INSERT INTO area_alias VALUES (?,?,?,?,?)", (
                    SOURCE_ID, item["contest_id"], item["new_ward_code"],
                    "unique_ons_name_and_poll_date", "council_candidate_check_pending"))
        review = root / "2026-ward-crosswalk-review.json"
        review.write_text(json.dumps({"status": "source_name_mapping_not_council_certified",
                                      "items": proposals}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return {"mapped": len(proposals), "by_council": dict(found), "review_file": str(review)}
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    working_root = Path(sys.argv[1]).resolve()
    source_root = (Path(sys.argv[2]).resolve() if len(sys.argv) == 3 else
                   working_root.parent / "raw" / "ons-yorkshire-ward-editions-2026-10-05")
    print(json.dumps(main(working_root, source_root)))
