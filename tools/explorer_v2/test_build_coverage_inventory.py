import sqlite3
import tempfile
import unittest
from pathlib import Path

from build_coverage_inventory import audit, map_cycle_names, parse_cycle_lists, read_pinned_roster


class CycleListTests(unittest.TestCase):
    SAMPLE = (
        "<p>These 1 district councils hold elections in 2027.</p><ol><li>Canterbury City</li></ol>"
        "<p>These 1 unitary authorities hold elections in 2027.</p><ol><li>Hull</li></ol>"
    )
    GROUPS = ((1, "district", "district councils hold"),
              (1, "unitary", "unitary authorities hold"))

    def test_extract_and_reviewed_aliases(self):
        rows = parse_cycle_lists(self.SAMPLE, self.GROUPS)
        areas = [dict(area_id="E07000106", name="Canterbury", area_type="local_authority"),
                 dict(area_id="E06000010", name="Kingston upon Hull, City of", area_type="local_authority")]
        mapped = map_cycle_names(rows, areas)
        self.assertEqual([row["area_id"] for row in mapped], ["E07000106", "E06000010"])
        self.assertTrue(all(row["schedule_status"] == "provisional_cycle_only" for row in mapped))

    def test_changed_group_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "Expected 2 2027 council groups"):
            parse_cycle_lists(self.SAMPLE.replace("<li>Canterbury City</li>", ""), self.GROUPS)

    def test_unknown_name_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "Unresolved or ambiguous"):
            map_cycle_names([{"source_name": "Unknown Council", "cycle_group": "district"}], [])

    def test_pinned_roster_rejects_changes(self):
        self.assertEqual(len(read_pinned_roster()), 227)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "changed.csv"
            path.write_text("source_name,cycle_group\nA,district_whole\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                read_pinned_roster(path)


class CoverageTests(unittest.TestCase):
    def test_missing_annual_record_does_not_mean_no_election(self):
        with sqlite3.connect(":memory:") as db:
            db.executescript("""
                CREATE TABLE area(area_id TEXT,area_type TEXT,name TEXT,region_area_id TEXT,status TEXT);
                CREATE TABLE coverage(area_id TEXT,election_type TEXT,year INTEGER,status TEXT,reason TEXT,source_url TEXT);
                CREATE TABLE election_event(event_id TEXT,election_date TEXT,election_type TEXT,event_kind TEXT,authority_id TEXT);
                CREATE TABLE contest(contest_id TEXT,event_id TEXT,comparability_note TEXT);
                CREATE TABLE candidate_result(result_id TEXT,contest_id TEXT);
            """)
            db.execute("INSERT INTO area VALUES ('A','local_authority','Test Council','R','catalogued')")
            db.executemany("INSERT INTO coverage VALUES ('A','local_council',?,'no_record_in_annual_source',"
                           "'No record in this secondary annual source',NULL)", [(year,) for year in range(2021, 2027)])
            db.execute("INSERT INTO election_event VALUES ('E','2025-06-01','local_council','by_election','A')")
            db.execute("INSERT INTO contest VALUES ('C','E','Historical ward code not linked to the 2025 map.')")
            db.execute("INSERT INTO candidate_result VALUES ('V','C')")
            matrix, result = audit(db, [])
        self.assertEqual(len(matrix), 6)
        row = next(row for row in matrix if row["year"] == 2025)
        self.assertEqual(row["coverage_status"], "no_record_in_annual_source")
        self.assertEqual(row["by_election_events"], 1)
        self.assertEqual(row["unlinked_historical_contests"], 1)
        self.assertEqual(result["summary"]["provisional_2027_cycle_authorities"], 0)


if __name__ == "__main__":
    unittest.main()
