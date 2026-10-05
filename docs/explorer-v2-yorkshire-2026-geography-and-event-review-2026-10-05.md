# Explorer v2: 2026 Yorkshire geography and event review

**State, 5 October 2026:** Source and local-package audit, with a proposed architecture repair for owner review. No new results or geometry have been imported. The rc6 package remains local and unpublished; the live Leeds site and v2 production flags are unchanged. The owner's positive localhost smoke test confirms basic usability, but cannot establish that dated election results appear on the correct ward editions.

## Reproducible finding

The ignored research folder `data/explorer-v2/raw/ons-yorkshire-ward-editions-2026-10-05/` contains code-and-name query responses for all 15 Yorkshire and Humber councils from the official [ONS May 2025 ward boundaries](https://www.data.gov.uk/dataset/a51217aa-6849-4f57-80eb-2a4c2a45a415/wards-may-2025-boundaries-uk-bsc-v2) and [May 2026 ward boundaries](https://www.data.gov.uk/dataset/2130d92d-8593-4373-b0e5-347133e85dc2/wards-may-2026-boundaries-uk-bsc). The first snapshot contains 410 ward codes and has SHA-256 `78896a052920b8a6feaed1ee9312354c1e2c33ebd688d9722751da37772b0e91`; the second contains 411 and has SHA-256 `3fadaacf8b87d819cb2aeb539b6024a57c3966e97073d04fb955c32a0a9780b4`. These are **code-only snapshots**, not polygon backups; save them separately because ignored research files are not in GitHub.

Run the read-only [ward-edition audit](../tools/explorer_v2/audit_yorkshire_2026_ward_editions.py) against those files and `data/explorer-v2/work-2026-10-05-barnsley-sheffield-rc6/switchboard.sqlite3`. It compares the 2025 and 2026 ONS ward-code sets with rc6 contests dated 7 May–31 December 2026. The five councils below replaced **every** ward code. Ten other pilot councils retained their code sets; this does not prove that every polygon is identical.

| Council | 2025 → 2026 wards | May–December 2026 contests in rc6 | Linked to 2025 display boundary | No display boundary |
| --- | ---: | ---: | ---: | ---: |
| Bradford | 30 → 30 | 29 | 22 | 7 |
| Calderdale | 17 → 18 | 18 | 12 | 6 |
| Kirklees | 23 → 23 | 23 | 19 | 4 |
| Wakefield | 21 → 21 | 21 | 20 | 1 |
| Barnsley | 21 → 21 | 22 | 19 | 3 |
| **Total** | **112 → 113** | **113** | **92** | **21** |

Thus 92 results currently point at the previous ward *edition* and 21 cannot be highlighted. This is a release blocker, even where a familiar ward name happens to survive. For example, the [20 August Penistone East council by-election](https://www.barnsley.gov.uk/services/voting-and-elections/election-results/penistone-east-ward-by-election-20-august-2026/) is attached to 2025 code `E05016245`; ONS records 2026 Penistone East as `E05016581`. The council's [Bradford ward-map page](https://www.bradford.gov.uk/your-council/elections-and-voting/ward-maps/) explicitly dates its new boundaries to **7 May 2026** and retains a separate old-boundary layer. ONS ward-code change is a warning about historical comparability; it alone is not a measured polygon difference for every named ward.

## Missing Bradford events and the date problem

Bradford's [official 2026 results index](https://www.bradford.gov.uk/your-council/elections-and-voting/election-results/) lists a **12 February Worth Valley by-election**, the **7 May ordinary election**, and an **18 June Idle and Thackley poll**. rc6 holds only 29 Bradford contests dated 7 May. The February and June events therefore require separate source transcription and reconciliation. The council calls June a by-election on its index, but it is a postponed poll for the three available seats in the ward; review its declaration and classify it precisely rather than assuming a one-seat casual-vacancy election. Do not compute voter turnout from a multi-seat sum of candidate votes.

Bradford makes a year-only boundary selector unsafe: Worth Valley's February result belongs with the pre-7-May ward edition; the May and June polls belong with the new edition. A viewer asking for “2026” can legitimately need both. The event date and the result's own boundary version must decide the map and comparison rule. If the correct historical geometry is unavailable, the UI must say **unmapped for this poll** rather than paint a 2026 result on a 2025 polygon (or vice versa).

The present [Barnsley results index](https://www.barnsley.gov.uk/services/voting-and-elections/election-results/) shows its May council election and Penistone East council by-election, plus a separate parish by-election. Sheffield's [current election notices](https://www.sheffield.gov.uk/your-city-council/elections/election-notices) show Southey and Walkley, already staged. This is a useful reconciliation against the visible council indexes, not a certified exhaustive event register for the whole region or every historical year.

## Proposed contract for owner review

1. Add ONS May 2026 Yorkshire ward polygons and source records as a **separate dated edition**, while retaining May 2025 and all earlier immutable package files. Store the exact source URL, retrieval date, file hash and polygon hash. Where an election predates a newer edition, keep its earlier result boundary and its source caveat.
2. Give every contest an explicitly reviewed `result_boundary_id` and an event-date-correct `display_boundary_id`, or a null display ID with a visible reason. Build a source-reviewed old-to-new ward crosswalk per changed council; match by official code and election notice, not by name alone. Different code sets must remain different canonical area identities unless a documented relation proves their continuity.
3. Version the package contract **additively**: a v2 catalogue lists each ward edition with authority, effective period and geometry object; each event/result object identifies the edition it needs. The reader retains support for existing v1 packages and refuses an unknown contract version. In the Explorer, a year view may choose the latest ordinary poll as its default map, but selecting an event with another edition must switch the map or explicitly leave it unmapped. Map, table, composition and exports must describe the same selected poll and must not infer current councillors from winners.
4. Reconcile the 113 existing May–December contests against the relevant council declarations and their 2026 wards. Import Bradford's February and June events only after their original declarations, seat counts, candidate votes, turnout fields and boundary editions are recorded with hashes and notes. The new Barnsley Penistone East fixture must use its 2026 ward code; retain the original rc6 audit trail.
5. Make package validation fail if a post-change 2026 contest in these five councils is linked to a 2025 ward polygon, if a referenced geometry object or its hash is missing, or if an event's declared boundary edition conflicts with its effective date. Include a regression for Bradford's February/May/June transition, Calderdale's 17-to-18 change, Barnsley's August by-election, Leeds unchanged hashes, and unresolved historical wards.
6. Create a **new local rc7 working copy and release ID**. Preserve rc5 and rc6, verify candidate and object checksums, run package, API, visual and build checks, and review an explicit diff before any upload. The feature flags stay off; there is no active v2 pointer to roll back today. Later production rollback must restore both the prior package pointer and its compatible reader/feature flags.

This changes the data and package contract and the Explorer's geography-selection behavior, so it requires the owner review specified in `AGENTS.md` before implementation. It does **not** propose publishing any Yorkshire result or changing the live Leeds pilot.

**Owner decision and local follow-up (5 October):** The owner authorised this architecture and asked for a pre-commit review. The local [rc9 implementation record](explorer-v2-dated-wards-rc9-2026-10-05.md) describes the staged contract, tests and remaining source gates. Approval of the architecture is not approval to merge, upload, activate or deploy rc9.
