"""Run with: python -m unittest tools/explorer_v2/test_import_official_byelections.py"""

from __future__ import annotations

import copy
import json
import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_geography import SCHEMA  # noqa: E402
from import_official_byelections import FIXTURE, import_events  # noqa: E402


class OfficialByElectionImportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SCHEMA)
        self.db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
            "E92000001", "country", "England", "E92000001", None, None, "catalogued"))
        self.db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
            "E12000003", "region", "Yorkshire and The Humber", "E92000001", "E92000001", None, "pilot"))
        for item in self.fixture["events"]:
            self.db.execute("INSERT OR IGNORE INTO area VALUES (?,?,?,?,?,?,?)", (
                item["authority_id"], "local_authority", item["authority_id"],
                "E92000001", "E12000003", "E12000003", "pilot"))
            self.db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
                item["ward_id"], "ward", item["ward_name"], "E92000001",
                item["authority_id"], "E12000003", "pilot"))
            status = "secondary_source_staged" if item["authority_id"] == "E08000017" else "no_record_in_annual_source"
            self.db.execute("INSERT INTO coverage VALUES (?,?,?,?,?,?,?)", (
                item["authority_id"], "local_council", 2025, status, "Initial annual-source review", None, None))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def test_import_and_retry_preserve_source_and_coverage(self) -> None:
        first = import_events(self.db, self.fixture)
        self.assertEqual(first["inserted_events"], 5)
        self.assertEqual(first["candidates_in_fixture"], 33)
        self.assertEqual(import_events(self.db, self.fixture)["unchanged_events"], 5)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM election_event").fetchone()[0], 5)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM candidate_result").fetchone()[0], 33)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM coverage WHERE status='partial_by_election_only'").fetchone()[0], 4)
        self.assertEqual(self.db.execute("SELECT status FROM coverage WHERE area_id='E08000017'").fetchone()[0],
                         "secondary_source_staged")
        self.assertAlmostEqual(self.db.execute("SELECT turnout_rate FROM contest WHERE area_id='E05010731'").fetchone()[0],
                               2432 / 12758)

    def test_bad_votes_roll_back_all_events(self) -> None:
        broken = copy.deepcopy(self.fixture)
        broken["events"][-1]["candidates"][0]["votes"] += 1
        with self.assertRaisesRegex(ValueError, "do not reconcile"):
            import_events(self.db, broken)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM election_event").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM source_record").fetchone()[0], 0)

    def test_changed_transcription_requires_review(self) -> None:
        import_events(self.db, self.fixture)
        changed = copy.deepcopy(self.fixture)
        changed["events"][0]["quality_note"] += " Updated"
        with self.assertRaisesRegex(ValueError, "review a new source version"):
            import_events(self.db, changed)

    def test_turnout_discrepancy_must_be_explicit(self) -> None:
        changed = copy.deepcopy(self.fixture)
        changed["events"][-1].pop("turnout_discrepancy_accepted")
        with self.assertRaisesRegex(ValueError, "Declared turnout differs"):
            import_events(self.db, changed)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM election_event").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
