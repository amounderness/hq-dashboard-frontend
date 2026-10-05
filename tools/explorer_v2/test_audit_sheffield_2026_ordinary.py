import sqlite3
import unittest

from audit_sheffield_2026_ordinary import CouncilResults, check


class SheffieldOrdinaryAuditTests(unittest.TestCase):
    def test_ward_table_and_turnout_survive_html_line_breaks(self):
        parser = CouncilResults()
        parser.feed('<div class="field--name-localgov-text"><h3>Test Ward</h3>'
                    '<p>Elected: A Candidate</p><table><tbody><tr>'
                    '<td><strong>A Candidate</strong></td><td>Labour</td><td><strong>1,234</strong></td>'
                    '</tr></tbody></table><p>Electorate: 5,000<br/>Turnout: 25%</p></div>')
        self.assertEqual(len(parser.wards), 1)
        self.assertEqual(parser.wards[0]["candidates"], [
            {"name": "A Candidate", "votes": 1234, "elected": True}])
        self.assertIn("Turnout: 25%", parser.wards[0]["paragraphs"][-1])

    def test_unpinned_html_is_rejected(self):
        with sqlite3.connect(":memory:") as db, self.assertRaisesRegex(ValueError, "checksum mismatch"):
            check(db, b"<html><body>changed</body></html>")


if __name__ == "__main__":
    unittest.main()
