# Switchboard MVP status · 26 September 2026

Switchboard is a private **owner-only Leeds Pulse pilot**, not yet a complete volunteer or campaign operations MVP. It presents prepared records; the site does not calculate new results or forecasts on demand.

The separate Yorkshire and Humber Explorer v2 [rc9 candidate](explorer-v2-dated-wards-rc9-2026-10-05.md) was validated locally on 5 October with dated ward editions and two caveated Bradford poll transcriptions. [Local automated browser checks](explorer-v2-visual-qa-2026-10-05.md) now cover the main desktop and mobile flows; council-source and live access checks remain open. It has not been published or made visible to Leeds pilot viewers; it does not change the Leeds MVP status below.

A distinct [Leeds-only Explorer v2 viewer candidate](explorer-v2-leeds-viewer-rc2-2026-10-05.md) now passes local package, permission-scope and browser tests. It uses only the audited Leeds result import and keeps other councils unavailable. It is not merged, uploaded, activated or visible on the live site; authenticated viewer checks and exact release approval remain.

| Area | Current state | Next gate |
|---|---|---|
| Leeds election results | Six election years (2021–2026), 167 recorded contests and 945 candidate records. The 2025 result view contains only the Morley South by-election. Four historical source-choice cases and the defined published council-archive event check are closed and cited. Each ward poll identifies the number of its three seats filled. | Seek a corrected Farnley declaration and official Morley turnout; keep both secondary figures visibly labelled. A complete person-by-person councillor history is a separate future data set. |
| Council composition | A 99-seat semicircle and party counts from dated official council snapshots for 2021–2024, 2026 and the page captured 26 September 2026. The table shows change since the previous saved snapshot, with its baseline date. No verified full-council 2025 snapshot is published. | Refresh the current snapshot on a defined schedule and document intervening events; do not present snapshot differences as election-only gains. |
| Explorer | A 33-ward map and table with an alphabetical ward dropdown, turnout and winning-party colours, winner-by-party and SDP-contested filters, ward histories, Census and Tribes context. | Trial with invited viewers; check accessibility and smaller screens. |
| SDP Results | Descriptive filters, year chart and candidate table for 77 published SDP-contested ward polls, linked to the Explorer. | Review wording and anomalies with pilot users; expand to other geographies only after their source audits. |
| Electoral Tribes | Seven K7 descriptions and methods/limitations page, with ward-level resident-weighted shares. | Validate any proposed party association before publishing it; do not infer individual voter types. |
| Development and releases | A portal page shows the current stage plan and dated release history. Its editorial record is updated with each published change. | Keep release notes and stage status aligned with evidence, tests and actual publication. |
| Sign-in and storage | Owner-only Cloudflare Access on the whole Worker; immutable private R2 release objects with SHA-256 checks. | Exercise invited viewer sign-in and revocation; independent backup restore remains a later resilience check. |
| Forecast | Historical test summary only. | Defer prospective modelling as requested. |
| Reports and administration | Owner-only package-folder staging, hash and election validation, approval, activation, rollback for screen-managed releases and private audit records are implemented. Ward, council-composition and SDP report views can be printed or downloaded as CSV. | Owner validation, approval, activation and rollback were exercised live. Invited-viewer role checks, source-file ingestion, record-level differences and independent backup restore remain. |

“Latest recorded” for a ward means the latest **imported poll**. The council composition tab is a separate **dated council snapshot**, not a derivation from those ward polls. A vacant seat is counted as a vacancy. Historical election results are displayed on 2025 ward shapes; exact historical polygon equivalence has not been verified. The package contains no individual voter or party-supplied data.

See [the v0.6.0 source decisions](leeds-source-decisions-v0.6.0-2026-09-26.md) for choices and the event check, and [the publishing workflow](leeds-publishing-workflow.md) for owner controls.
