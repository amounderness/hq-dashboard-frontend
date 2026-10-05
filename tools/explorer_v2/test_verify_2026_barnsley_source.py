import copy
import json
import unittest

from verify_2026_barnsley_source import FIXTURE, check


class BarnsleySourceReviewTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_official_transcription_keeps_unknown_ballot_count(self):
        self.assertEqual(check(self.fixture), {
            "review_status": "2026-08-20:source_reviewed_not_imported",
            "valid_votes": 3346, "candidates": 8, "ballots_issued": None,
        })

    def test_adding_rejected_ballots_to_reported_votes_is_not_assumed(self):
        changed = copy.deepcopy(self.fixture)
        changed["events"][0]["ballots_issued"] = 3353
        with self.assertRaisesRegex(ValueError, "ambiguity"):
            check(changed)

    def test_changed_candidate_vote_fails_reconciliation(self):
        changed = copy.deepcopy(self.fixture)
        changed["events"][0]["candidates"][0]["votes"] += 1
        with self.assertRaisesRegex(ValueError, "Candidate votes"):
            check(changed)


if __name__ == "__main__":
    unittest.main()
