import copy
import json
import sqlite3
import unittest

from verify_2026_sheffield_sources import FIXTURE, check


class Sheffield2026SourceTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_transcription_reconciles(self):
        self.assertEqual(check(self.fixture), {
            "review_status": "source_reviewed_not_imported", "events": 2,
            "candidates": 11, "valid_candidate_votes": 6572,
        })

    def test_aggregated_walkley_typo_fails_ballot_check(self):
        changed = copy.deepcopy(self.fixture)
        walkley = next(item for item in changed["events"] if item["ward_name"] == "Walkley")
        next(person for person in walkley["candidates"] if person["party"] == "Reform UK")["votes"] = 258
        with self.assertRaisesRegex(ValueError, "Ballot count does not reconcile"):
            check(changed)

    def test_preexisting_contest_cannot_be_staged_again(self):
        with sqlite3.connect(":memory:") as db:
            db.executescript("""
                CREATE TABLE area(area_id TEXT,name TEXT,parent_area_id TEXT,area_type TEXT);
                CREATE TABLE election_event(event_id TEXT,election_date TEXT,election_type TEXT);
                CREATE TABLE contest(contest_id TEXT,event_id TEXT,area_id TEXT);
                INSERT INTO area VALUES ('E05010879','Southey','E08000039','ward');
                INSERT INTO area VALUES ('E05010882','Walkley','E08000039','ward');
                INSERT INTO election_event VALUES ('existing','2026-08-27','local_council');
                INSERT INTO contest VALUES ('existing-contest','existing','E05010879');
            """)
            with self.assertRaisesRegex(ValueError, "already in the working store"):
                check(self.fixture, db)


if __name__ == "__main__":
    unittest.main()
