"""Compare a Leeds package with the council's 2021-24 candidate result files.

Usage: python official_history_crosscheck.py PACKAGE_DIR OFFICIAL_DIR REPORT_JSON
The official files must be named leeds-official-2021.csv through 2024.xlsx.
Requires openpyxl for the two Excel files. No input files are modified.
"""

import collections
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook


def normalized(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower().replace("&", "and"))


def official_rows(year, path):
    if year < 2023:
        encoding = "utf-8-sig" if year == 2021 else "cp1252"
        with path.open(encoding=encoding, newline="") as stream:
            rows = list(csv.DictReader(stream))
        return [
            (r["AreaName"], r["CandidateSurname"], r["CandidateForename"], int(r["Votes"]))
            for r in rows
        ]
    sheet = load_workbook(path, read_only=True, data_only=True).active
    records = iter(sheet.values)
    header = next(records)
    rows = (dict(zip(header, row)) for row in records)
    if year == 2023:
        return [
            (r["AreaNameOriginal"], r["CandidateSurname"], r["CandidateForename"], int(r["CandidateVotes"]))
            for r in rows
            if r["AreaTypeDescription"] == "Ward" and r["CandidateVotes"] is not None
        ]
    return [
        (r["AreaNameOriginal"], r["CandidateSurname"], r["CandidateForename"], int(r["NumberOfVotes"]))
        for r in rows
        if r["ElectionDate"] == "Thursday 2 May 2024"
        and r["AreaNameOriginal"] != "West Yorkshire"
        and r["NumberOfVotes"] is not None
    ]


def main(package_dir, official_dir, report_path):
    wards = json.loads((package_dir / "geography/wards.json").read_text(encoding="utf-8"))
    codes = {normalized(w["ward_name"]): w["ward_code"] for w in wards}
    report = {"scope": "Leeds scheduled local-council candidate votes, 2021-2024", "years": {}}
    for year in range(2021, 2025):
        path = official_dir / f"leeds-official-{year}.{('csv' if year < 2023 else 'xlsx')}"
        source_rows = official_rows(year, path)
        unknown = sorted({area for area, _, _, _ in source_rows if normalized(area) not in codes})
        if unknown:
            raise ValueError(f"Unmatched {year} wards: {unknown}")
        package_rows = json.loads(
            (package_dir / f"elections/{year}/local-council/candidates.json").read_text(encoding="utf-8")
        )
        source_votes = collections.Counter((codes[normalized(area)], votes) for area, _, _, votes in source_rows)
        package_votes = collections.Counter((r["ward_code"], r["votes"]) for r in package_rows)
        ward_names = {w["ward_code"]: w["ward_name"] for w in wards}
        discrepancies = []
        for (code, votes), count in (source_votes - package_votes).items():
            matching = [
                {"surname": surname, "forename": forename}
                for area, surname, forename, n in source_rows
                if codes[normalized(area)] == code and n == votes
            ]
            discrepancies.append({"side": "council_only", "ward": ward_names[code], "votes": votes, "count": count, "candidates": matching})
        for (code, votes), count in (package_votes - source_votes).items():
            matching = [
                {"name": r["candidate_name"], "party": r["party_label"]}
                for r in package_rows
                if r["ward_code"] == code and r["votes"] == votes
            ]
            discrepancies.append({"side": "package_only", "ward": ward_names[code], "votes": votes, "count": count, "candidates": matching})
        report["years"][str(year)] = {
            "official_url": {
                2021: "https://datamillnorth.org/download/20jwj/773088bc-22fd-496b-9362-82235b230ced/Results_06May2021.CSV",
                2022: "https://datamillnorth.org/download/20jwj/3d356930-2678-44d8-8d64-cc339e051aa3/Results_05May2022.csv",
                2023: "https://datamillnorth.org/download/20jwj/fd9656bf-6ffe-4148-93da-a14ac48a07cd/Results%20for%20Data%20Mill%20North.xlsx",
                2024: "https://datamillnorth.org/download/20jwj/e3x/Results%20from%20LCC%20%26%20WYCA%20Elections%20held%20on%202%20May%202024.xlsx",
            }[year],
            "official_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "official_candidate_rows": len(source_rows),
            "package_candidate_rows": len(package_rows),
            "ward_vote_rows_matching": sum((source_votes & package_votes).values()),
            "discrepancies": discrepancies,
        }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for year, detail in report["years"].items():
        print(year, detail["ward_vote_rows_matching"], "/", detail["official_candidate_rows"], "ward-vote rows matched")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*(Path(arg) for arg in sys.argv[1:]))
