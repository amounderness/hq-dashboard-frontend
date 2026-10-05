# Explorer v2 national coverage audit — 5 October 2026

**State:** Local audit of the rc4 working store. No package was built, approved, activated or deployed. Live Leeds and production v2 flags are unchanged.

## What this adds

`tools/explorer_v2/build_coverage_inventory.py` reads the canonical SQLite store without writing to it. It creates three ignored local review files: `council_year_coverage.csv`, `cycle_2027_review.csv`, and `summary.json`. The 2027 roster is a checked-in extract of the [GOV.UK election-cycle list](https://www.gov.uk/government/publications/election-timetable-in-england/election-timetable-in-england), pinned to the retrieved HTML SHA-256 `46b2d5ef6506348863140b96bd42e88e1b00c95ad51d5937940c71117aa63d07`. The roster itself is pinned to SHA-256 `2c343a08fb1875cdfe478f452659a54d3415f64a678b6ff3ee1000391555ebfd`. Eight name variants are mapped explicitly to canonical codes; unknown or duplicate matches stop the audit. A [dated Yorkshire schedule review](yorkshire-2027-schedule-review-2026-10-05.md) joins council or Boundary Commission evidence to the twelve regional entries without upgrading a year-only source to an exact poll date.

To rerun from the repository root, point the script at an existing local SQLite working store:

```powershell
python tools/explorer_v2/build_coverage_inventory.py --database data/explorer-v2/work-2026-10-01-byelections/switchboard.sqlite3 --output data/explorer-v2/work-2026-10-05-coverage-audit
```

If the original downloaded government HTML snapshot is present, add `--cycle-html data/explorer-v2/raw/england-election-cycles-2026-10-05.html` to cross-check it against both pins. The raw snapshot and working store are ignored local research files, not part of the GitHub repository; the checked-in extracted roster allows the cycle inventory to be rerun without the HTML.

## Findings from the rc4 store

| Measure | Count | Meaning |
| --- | ---: | --- |
| Council and county authorities | 317 | 296 local authorities and 21 county-tier authorities |
| Authority-year rows, 2021–2026 | 1,902 | One local-council coverage entry per authority and year |
| Checked and published | 5 | Leeds rows in this working store; not a national validation count |
| Secondary-source staged | 778 | Ordinary results imported; council reconciliation remains open |
| No record in annual source | 1,114 | **Does not mean no poll occurred** |
| Partial by-election only | 5 | A known event without exhaustive annual coverage |
| Ordinary election events | 778 | Staged ordinary events |
| By-election events | 8 | Recorded events, not an exhaustive by-election register |
| Historical contests with no ward link | 4,625 | Cannot be displayed as a verified historical ward polygon |
| Contests with an unverified boundary note | 13,049 | Current/display geometry cannot be treated as event-date geometry |
| Authorities on the provisional 2027 cycle list | 227 | Recurring cycle entry, **not a confirmed 2027 poll** |

The provisional 2027 list comprises 27 metropolitan thirds, 2 metropolitan whole, 2 metropolitan post-review, 103 district whole, 44 district thirds, 31 unitary whole, 4 newer unitary whole and 14 unitary thirds. Of these authorities, the 2026 coverage register has 80 secondary-source staged rows, one checked/published row and 146 with no annual-source record. The 2023 register has 222 secondary-source staged rows, one checked/published row and four without an annual-source record. These are source-coverage measures, not a judgement of whether each authority held an election in those years.

Within Yorkshire, seven council pages state the exact 2027 date, three state May 2027, one Boundary Commission source refers to a 2027 election, and Sheffield remains on the national cycle alone in this review. The remaining 215 national authorities have not received the same schedule-source check. The 2026 by-election count in this store includes an **upcoming**, result-free Leeds event; it is not eight completed by-elections. Two completed 2026 Sheffield by-elections were found but are not yet imported, as recorded in the Yorkshire schedule review.

## Critical source caveat

The government cycle page provides a general pattern, while [the Electoral Commission's 2027 timetable](https://www.electoralcommission.org.uk/guidance-returning-officers-administering-local-government-elections-england/starting-election-timetable/resources-returning-officers-starting-election-timetable) sets election-administration dates. Neither establishes that every listed council will actually poll in 2027. Local government reorganisation may alter the list; see the [Commons Library's reorganisation briefing](https://commonslibrary.parliament.uk/research-briefings/cbp-10494/). For example, the cycle page lists Tewkesbury under 2027, while [Tewkesbury's future-elections page](https://tewkesbury.gov.uk/about-the-council/voting-and-elections/current-and-future-elections/) describes a changed 2027 arrangement. This conflict is explicitly flagged in the CSV and needs a current council notice or returning-officer confirmation before we claim a poll. No 2027 election events were inserted into the canonical store.

## Next checks, in order

1. Confirm the actual 2027 poll schedule council by council, starting with the 12 Yorkshire and Humber authorities in the provisional list, and log reorganisation or boundary-review exceptions. Keep the source, retrieval date and decision for each.
2. Reconcile staged ordinary results against council declarations, especially the latest contested year for the councils selected for campaign planning. Mark a council-year checked only after its contests, candidates, turnout and sources have been reviewed.
3. Build an event-based by-election and member-change register from council notices; the eight current by-election events must not be presented as exhaustive.
4. Review historical ward equivalence before drawing past results on current polygons. Preserve an explicit unmapped or approximate display where a boundary cannot be certified.
5. Use this matrix to choose a small release cohort beyond Leeds, then repeat package validation and owner review before staging or enabling wider visibility.

This audit closes the **inventory tooling** task, not the source-reconciliation, 2027 schedule or release-readiness gates.

## Local verification

Seven focused audit tests and four existing by-election tests, TypeScript, ESLint, the Next.js build and the Cloudflare-target build passed after the schedule review. The rc4 package validator passed on a temporary copy of exactly the 62 manifest-listed files: 58 council-years, 1,283 contests and 7,842 candidates. The original ignored rc4 folder contains Windows-generated `desktop.ini` files that the strict validator correctly rejects as unlisted objects; the original was not modified. The Next.js and vinext builds share generated `.next` route files on this machine; stale generated files made an intermediate build and typecheck fail. The old caches were preserved in Windows Temp, then a clean Next.js build, TypeScript check and vinext build passed in that order. No browser, Cloudflare R2 or live owner/viewer permission test was run for this audit-only change.
