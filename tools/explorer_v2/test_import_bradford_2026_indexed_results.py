import copy
import json
import sqlite3
import unittest

from build_geography import SCHEMA
from import_bradford_2026_indexed_results import FIXTURE, import_events


class BradfordDatedEventTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript(SCHEMA)
        self.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.db.execute("INSERT INTO source_record VALUES (?,?,?,?,?,?)", (
            "ons", "ONS", "https://example.org/wards", "2026-05", "2026-10-05", "hash"))
        self.db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
            "E08000032", "local_authority", "Bradford", "E92000001", None, None, "pilot"))
        for item in self.fixture["events"]:
            self.db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
                item["ward_id"], "ward", item["ward_name"], "E92000001", "E08000032", None, "pilot"))
            self.db.execute("INSERT INTO boundary_version VALUES (?,?,?,?,?,?)", (
                f"{item['ward_id']}:{item['boundary_edition']}", item["ward_id"],
                item["boundary_edition"], "ons", "{}", "hash"))
        self.db.execute("INSERT INTO coverage VALUES (?,?,?,?,?,?,?)", (
            "E08000032", "local_council", 2026, "secondary_source_staged", "May ordinary results.", None, None))
        self.db.commit()

    def test_february_old_ward_and_june_three_seat_new_ward(self):
        self.assertEqual(import_events(self.db, self.fixture)["inserted"], 2)
        self.assertEqual(import_events(self.db, self.fixture)["unchanged"], 2)
        rows = list(self.db.execute(
            "SELECT e.election_date,e.event_kind,c.seats_available,c.electorate,c.turnout_rate,"
            "c.display_boundary_id FROM contest c JOIN election_event e ON e.event_id=c.event_id ORDER BY e.election_date"))
        self.assertEqual(rows[0], ("2026-02-12", "by_election", 1, 10906, None, "E05001369:2025-05"))
        self.assertEqual(rows[1], ("2026-06-18", "postponed_ordinary_election", 3, None, None, "E05016466:2026-05"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM candidate_result").fetchone()[0], 21)

    def test_wrong_boundary_or_candidate_total_blocks_all_writes(self):
        for change in ("boundary_edition", "candidate_votes"):
            bad = copy.deepcopy(self.fixture)
            bad["events"][1][change] = "2025-05" if change == "boundary_edition" else 14649
            with self.assertRaises(ValueError):
                import_events(self.db, bad)
            self.assertEqual(self.db.execute("SELECT COUNT(*) FROM election_event").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
