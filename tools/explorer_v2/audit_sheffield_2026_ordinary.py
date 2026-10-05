"""Compare a pinned Sheffield 2026 council-results page with the local store.

Usage: python tools/explorer_v2/audit_sheffield_2026_ordinary.py DATABASE OFFICIAL_HTML
This is a read-only source audit, not an importer or a release approval.
"""

import hashlib
import json
import re
import sqlite3
import sys
from html.parser import HTMLParser
from pathlib import Path


SNAPSHOT_SHA256 = "f16198bbee496174699561ee1daedf0ca1abdd5ba2c90072611c0755e3ca48ce"
SHEFFIELD = "E08000039"
POLL_DATE = "2026-05-07"


def normalized(text: str) -> str:
    return " ".join(text.split()).casefold()


def number(text: str) -> int:
    match = re.search(r"[\d,]+", text)
    if not match:
        raise ValueError(f"Missing number: {text}")
    return int(match.group().replace(",", ""))


class CouncilResults(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.div_depth = 0
        self.scope_depth = None
        self.wards = []
        self.ward = None
        self.capture = None
        self.buffer = []
        self.row = None
        self.emphasized = False

    def _finish_ward(self):
        if self.ward and self.ward["name"] and self.ward["candidates"]:
            self.wards.append(self.ward)
        self.ward = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "div":
            self.div_depth += 1
            if "field--name-localgov-text" in attributes.get("class", "").split():
                self.scope_depth = self.div_depth
        if self.scope_depth is None:
            return
        if tag == "h3":
            self._finish_ward()
            self.ward = {"name": "", "candidates": [], "paragraphs": []}
        if self.ward and tag in {"h3", "p", "td"}:
            self.capture, self.buffer = tag, []
            if tag == "td":
                self.emphasized = False
        if self.ward and tag == "tr":
            self.row = []
        if tag == "strong" and self.capture == "td" and self.row is not None and not self.row:
            self.emphasized = True

    def handle_data(self, data):
        if self.capture is not None:
            self.buffer.append(data)

    def handle_endtag(self, tag):
        if self.scope_depth is not None and self.capture == tag:
            value = " ".join("".join(self.buffer).split())
            if tag == "h3":
                self.ward["name"] = value
            elif tag == "p":
                self.ward["paragraphs"].append(value)
            elif tag == "td" and self.row is not None:
                self.row.append((value, self.emphasized))
            self.capture, self.buffer = None, []
        if self.scope_depth is not None and tag == "tr" and self.row is not None:
            if len(self.row) == 3:
                self.ward["candidates"].append({
                    "name": self.row[0][0], "votes": number(self.row[2][0]),
                    "elected": bool(self.row[0][1]),
                })
            self.row = None
        if tag == "div":
            if self.scope_depth == self.div_depth:
                self._finish_ward()
                self.scope_depth = None
            self.div_depth -= 1


def check(db: sqlite3.Connection, raw: bytes) -> dict:
    if hashlib.sha256(raw).hexdigest() != SNAPSHOT_SHA256:
        raise ValueError("Official Sheffield HTML snapshot checksum mismatch")
    parser = CouncilResults()
    parser.feed(raw.decode("utf-8", errors="replace"))
    parser._finish_ward()
    official = {ward["name"]: ward for ward in parser.wards}
    staged = {name: (contest_id, seats, electorate, turnout) for contest_id, name, seats, electorate, turnout in db.execute(
        "SELECT c.contest_id,a.name,c.seats_available,c.electorate,c.turnout_rate "
        "FROM contest c JOIN area a ON a.area_id=c.area_id JOIN election_event e ON e.event_id=c.event_id "
        "WHERE e.authority_id=? AND e.election_date=? AND e.event_kind='ordinary_election'",
        (SHEFFIELD, POLL_DATE))}
    mismatches = []
    aliases = []
    turnout_available = 0
    turnout_arithmetic_differences = []
    multi_seat_wards = []
    candidates = 0
    if set(official) != set(staged) or len(parser.wards) != len(official):
        mismatches.append({"kind": "ward set", "official_only": sorted(set(official) - set(staged)),
                           "staged_only": sorted(set(staged) - set(official))})
    for name in sorted(set(official) & set(staged)):
        ward = official[name]
        contest_id, seats, electorate, turnout = staged[name]
        people = ward["candidates"]
        candidates += len(people)
        rows = list(db.execute("SELECT candidate_name,votes,elected FROM candidate_result WHERE contest_id=?", (contest_id,)))
        if sorted((person["votes"], int(person["elected"])) for person in people) != sorted(
                (votes, elected) for _, votes, elected in rows):
            mismatches.append({"ward": name, "kind": "candidate votes or elected flags"})
        if seats != sum(person["elected"] for person in people):
            mismatches.append({"ward": name, "kind": "seats"})
        info = " ".join(ward["paragraphs"])
        electors = re.search(r"Electorate:\s*([\d,]+)", info)
        if not electors or electorate != number(electors.group(1)):
            mismatches.append({"ward": name, "kind": "electorate"})
        turnout_match = re.search(r"Turnouts?:\s*([\d.]+)%", info)
        if turnout_match:
            turnout_available += 1
            if turnout is not None:
                mismatches.append({"ward": name, "kind": "staged turnout already populated"})
            if seats > 1:
                multi_seat_wards.append(name)
            else:
                rejected = re.search(r"Rejected ballots:\s*([\d,]+)", info)
                if not rejected or not electors:
                    mismatches.append({"ward": name, "kind": "turnout inputs absent"})
                else:
                    derived = (sum(person["votes"] for person in people) + number(rejected.group(1))) / electorate * 100
                    stated = float(turnout_match.group(1))
                    decimals = len(turnout_match.group(1).partition(".")[2])
                    tolerance = 0.5 * 10 ** (-decimals)
                    if abs(derived - stated) > tolerance:
                        turnout_arithmetic_differences.append({"ward": name, "council_percent": stated,
                                                               "derived_percent": round(derived, 5)})
        else:
            mismatches.append({"ward": name, "kind": "official turnout absent"})
        staged_names = {normalized(candidate_name) for candidate_name, _, _ in rows}
        for person in people:
            if normalized(person["name"]) not in staged_names:
                counterpart = [(candidate_name, votes) for candidate_name, votes, elected in rows
                               if (votes, elected) == (person["votes"], int(person["elected"]))]
                aliases.append({"ward": name, "official": person["name"], "staged_match": counterpart})
    return {"official_wards": len(official), "staged_wards": len(staged), "candidate_rows_compared": candidates,
            "official_turnout_rows_missing_from_staging": turnout_available,
            "multi_seat_wards": multi_seat_wards, "single_seat_turnout_arithmetic_differences": turnout_arithmetic_differences,
            "name_differences": aliases, "mismatches": mismatches}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    with sqlite3.connect(f"file:{Path(sys.argv[1]).resolve().as_posix()}?mode=ro", uri=True) as db:
        print(json.dumps(check(db, Path(sys.argv[2]).read_bytes()), ensure_ascii=False))
