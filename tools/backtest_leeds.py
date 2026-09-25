"""Time-ordered, aggregate Leeds ward vote-share baselines.

Uses only scheduled, single-seat contests. Outputs research evidence, not a
published forecast or a campaign recommendation. Standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

from party_labels import ALIASES, canonical_vote_counts


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_polls(root: Path):
    manifest = read_json(root / "manifest.json")
    polls = []
    input_hashes = {}
    for year in manifest["years"]:
        prefix = root / "elections" / str(year) / "local-council"
        files = {name: prefix / f"{name}.json" for name in ("events", "contests", "party-results")}
        for path in files.values():
            input_hashes[str(path.relative_to(root)).replace("\\", "/")] = hashlib.sha256(path.read_bytes()).hexdigest()
        events = {e["event_id"]: e for e in read_json(files["events"])}
        parties = defaultdict(list)
        for party in read_json(files["party-results"]):
            parties[party["contest_id"]].append(party)
        for contest in read_json(files["contests"]):
            event = events[contest["event_id"]]
            if event["status"] != "included" or event["event_kind"] != "scheduled_poll" or contest["seats_available"] != 1:
                continue
            rows = parties[contest["contest_id"]]
            total = sum(row["candidate_votes"] for row in rows)
            if total <= 0 or total != contest["all_candidate_votes"]:
                raise ValueError(f"Invalid party vote total: {contest['contest_id']}")
            raw_votes = {row["party_label"]: row["candidate_votes"] for row in rows}
            if len(raw_votes) != len(rows):
                raise ValueError(f"Duplicate party: {contest['contest_id']}")
            party_votes = canonical_vote_counts(raw_votes)
            shares = {party: votes / total for party, votes in party_votes.items()}
            polls.append({"ward_code": contest["ward_code"], "contest_id": contest["contest_id"],
                          "date": event["election_date"], "year": year, "votes": total, "shares": shares,
                          "party_votes": party_votes})
    polls.sort(key=lambda p: (p["date"], p["ward_code"]))
    return polls, input_hashes


def winner(shares):
    return sorted(shares, key=lambda party: (-shares[party], party))[0]


def city_shares(polls):
    votes = defaultdict(int)
    for poll in polls:
        for party, count in poll["party_votes"].items():
            votes[party] += count
    total = sum(votes.values())
    return {party: count / total for party, count in votes.items()}


def blend(ward, city):
    return {party: (ward.get(party, 0) + city.get(party, 0)) / 2
            for party in sorted(set(ward) | set(city))}


def score(prediction, actual):
    parties = set(prediction) | set(actual)
    return {"total_variation": sum(abs(prediction.get(p, 0) - actual.get(p, 0)) for p in parties) / 2,
            "winner_correct": winner(prediction) == winner(actual),
            "predicted_winner": winner(prediction), "actual_winner": winner(actual)}


def evaluate(polls):
    rows = []
    for target in polls:
        prior = [p for p in polls if p["date"] < target["date"]]
        own = [p for p in prior if p["ward_code"] == target["ward_code"]]
        if not own:
            continue
        own_latest = max(own, key=lambda p: p["date"])
        latest_city_date = max(p["date"] for p in prior)
        latest_city = [p for p in prior if p["date"] == latest_city_date]
        city = city_shares(latest_city)
        predictions = {"last_ward": own_latest["shares"], "last_city": city,
                       "fixed_half_blend": blend(own_latest["shares"], city)}
        rows.append({"target_contest": target["contest_id"], "target_date": target["date"],
                     "ward_code": target["ward_code"], "training_cutoff": latest_city_date,
                     "ward_training_contest": own_latest["contest_id"],
                     "new_party_vote_share": sum(share for party, share in target["shares"].items()
                                                 if party not in own_latest["shares"]),
                     "actual": target["shares"],
                     "models": {model: {"predicted": prediction, **score(prediction, target["shares"])}
                                for model, prediction in predictions.items()}})
    return rows


def summarize(rows):
    by_year = defaultdict(list)
    for row in rows:
        by_year[row["target_date"][:4]].append(row)
    result = {}
    for year, records in sorted(by_year.items()):
        result[year] = {"single_seat_wards": len(records), "models": {}}
        result[year]["mean_new_party_vote_share"] = round(
            sum(r["new_party_vote_share"] for r in records) / len(records), 6)
        for model in ("last_ward", "last_city", "fixed_half_blend"):
            result[year]["models"][model] = {
                "mean_total_variation": round(sum(r["models"][model]["total_variation"] for r in records) / len(records), 6),
                "winner_accuracy": round(sum(r["models"][model]["winner_correct"] for r in records) / len(records), 6)}
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    polls, hashes = load_polls(args.package)
    rows = evaluate(polls)
    if not rows or any(row["training_cutoff"] >= row["target_date"] for row in rows):
        raise ValueError("No valid strictly time-ordered backtest rows")
    summary = summarize(rows)
    report = {"generated_on": date.today().isoformat(), "package_id": read_json(args.package / "manifest.json")["package_id"],
              "purpose": "Research backtest only; no forecast published", "scope": "Leeds scheduled single-seat ward polls only",
              "method": "Normalize source party abbreviations using the Local Elections Handbook abbreviation tables, then predict each party's share of all candidate-votes using the latest prior ward result, latest prior city result, or a fixed 50:50 blend. Absent parties get zero; no future candidate slate is used.",
              "party_aliases": ALIASES,
              "exclusions": "By-elections, multi-seat contests, and 2025 (no scheduled poll). Incomplete or rejected sources are not training data.",
              "metrics": {"mean_total_variation": "Mean half-sum of absolute party share errors (0 best, 1 worst)",
                          "winner_accuracy": "Fraction whose highest predicted party equals the highest actual party; single-seat only"},
              "input_sha256": hashes, "by_year": summary, "evaluated_wards": len(rows),
              "publication_allowed": False}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (args.output / "ward-predictions.json").write_text(json.dumps(rows, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"evaluated_wards": len(rows), "by_year": summary}, indent=2))


if __name__ == "__main__":
    main()
