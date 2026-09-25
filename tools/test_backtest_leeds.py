import unittest

from backtest_leeds import blend, evaluate, score


def poll(year, ward, shares):
    return {"year": year, "date": f"{year}-05-01", "ward_code": ward,
            "contest_id": f"{year}-{ward}", "shares": shares,
            "party_votes": {party: round(value * 100) for party, value in shares.items()},
            "votes": 100}


class BacktestTests(unittest.TestCase):
    def test_share_error_and_winner(self):
        result = score({"A": .6, "B": .4}, {"A": .3, "B": .7})
        self.assertAlmostEqual(result["total_variation"], .3)
        self.assertFalse(result["winner_correct"])

    def test_blend_preserves_share_sum(self):
        result = blend({"A": .8, "B": .2}, {"A": .4, "C": .6})
        self.assertAlmostEqual(sum(result.values()), 1)
        for party, expected in {"A": .6, "B": .1, "C": .3}.items():
            self.assertAlmostEqual(result[party], expected)

    def test_future_result_cannot_change_earlier_prediction(self):
        base = [poll(2021, "W1", {"A": .6, "B": .4}),
                poll(2021, "W2", {"A": .4, "B": .6}),
                poll(2022, "W1", {"A": .5, "B": .5})]
        original = evaluate(base)[0]
        changed = evaluate(base + [poll(2026, "W1", {"A": .01, "B": .99})])[0]
        self.assertEqual(original, changed)
        self.assertLess(original["training_cutoff"], original["target_date"])


if __name__ == "__main__":
    unittest.main()
