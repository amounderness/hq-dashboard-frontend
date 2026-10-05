import copy
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from build_geography import SCHEMA
from import_reviewed_council_events import import_events


FIXTURE = Path(__file__).with_name("official_byelections_2026_sheffield.json")


class ReviewedCouncilImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.raw = Path(self.temp.name)
        self.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript(SCHEMA)
        self.db.execute("INSERT INTO source_record VALUES (?,?,?,?,?,?)", (
            "ons", "ONS", "https://example.org/ons", "2025-05", "earlier", "hash"))
        self.db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
            "E08000039", "local_authority", "Sheffield", "E92000001", None, None, "current"))
        for item in self.fixture["events"]:
            self.db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
                item["ward_id"], "ward", item["ward_name"], "E92000001", "E08000039", None, "current"))
            self.db.execute("INSERT INTO boundary_version VALUES (?,?,?,?,?,?)", (
                f"{item['ward_id']}:2025-05", item["ward_id"], "2025-05", "ons", "{}", "hash"))
            pdf = b"%PDF-1.4\nchecked fixture\n" + item["ward_id"].encode()
            (self.raw / item["source_document_file"]).write_bytes(pdf)
            item["source_document_sha256"] = hashlib.sha256(pdf).hexdigest()
        self.db.execute("INSERT INTO coverage VALUES (?,?,?,?,?,?,?)", (
            "E08000039", "local_council", 2026, "secondary_source_staged", "Existing ordinary source.",
            "https://example.org/ordinary", "earlier"))
        self.db.execute("INSERT INTO election_event VALUES (?,?,?,?,?,?,?)", (
            "ordinary", "2026-05-07", "local_council", "ordinary", "E08000039",
            "secondary_source_staged", "https://example.org/ordinary"))
        self.db.commit()

    def test_import_is_atomic_idempotent_and_preserves_ordinary_results(self):
        self.assertEqual(import_events(self.db, self.fixture, self.raw)["inserted_events"], 2)
        self.assertEqual(import_events(self.db, self.fixture, self.raw)["unchanged_events"], 2)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM election_event").fetchone()[0], 3)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM candidate_result").fetchone()[0], 11)
        status, reason, url = self.db.execute("SELECT status,reason,source_url FROM coverage").fetchone()
        self.assertEqual(status, "secondary_source_staged")
        self.assertEqual(url, "https://example.org/ordinary")
        self.assertIn("Southey (2026-08-27)", reason)
        self.assertIn("Walkley (2026-09-17)", reason)
        self.assertEqual(reason.count("Council-sourced by-elections added"), 1)
        details = self.db.execute("SELECT notes FROM event_detail WHERE event_id LIKE '%E05010882%'").fetchone()[0]
        self.assertIn("Labour and Co-operative Party", details)
        self.assertIn("Original declaration SHA-256", details)

    def test_bad_second_event_rolls_back_first(self):
        bad = copy.deepcopy(self.fixture)
        bad["events"][1]["candidates"][0]["votes"] += 1
        with self.assertRaisesRegex(ValueError, "Ballot count"):
            import_events(self.db, bad, self.raw)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM source_record").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM election_event").fetchone()[0], 1)

    def test_existing_second_contest_rolls_back_first_write(self):
        self.db.execute("INSERT INTO election_event VALUES (?,?,?,?,?,?,?)", (
            "already-recorded", "2026-09-17", "local_council", "by_election", "E08000039",
            "secondary_source_staged", "https://example.org/existing"))
        self.db.execute("INSERT INTO contest VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
            "already-recorded-contest", "already-recorded", "E05010882", 1, None, None,
            None, None, "Existing record", None, None, None))
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "already exists"):
            import_events(self.db, self.fixture, self.raw)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM source_record").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM election_event").fetchone()[0], 2)

    def test_pdf_mismatch_blocks_import(self):
        (self.raw / "walkley-declaration.pdf").write_bytes(b"%PDF-1.4\nchanged")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            import_events(self.db, self.fixture, self.raw)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM source_record").fetchone()[0], 1)

    def test_changed_transcription_requires_new_review(self):
        import_events(self.db, self.fixture, self.raw)
        changed = copy.deepcopy(self.fixture)
        changed["events"][1]["quality_note"] += " Changed note."
        with self.assertRaisesRegex(ValueError, "transcription changed"):
            import_events(self.db, changed, self.raw)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM candidate_result").fetchone()[0], 11)

    def test_partial_existing_event_is_not_silently_accepted(self):
        import_events(self.db, self.fixture, self.raw)
        self.db.execute("DELETE FROM event_detail WHERE event_id LIKE '%E05010882%'")
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "Existing event is incomplete"):
            import_events(self.db, self.fixture, self.raw)

    def test_duplicate_fixture_event_blocks_import(self):
        duplicate = copy.deepcopy(self.fixture)
        duplicate["events"].append(copy.deepcopy(duplicate["events"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate fixture event"):
            import_events(self.db, duplicate, self.raw)


if __name__ == "__main__":
    unittest.main()
