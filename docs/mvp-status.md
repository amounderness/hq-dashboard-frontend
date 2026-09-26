# Switchboard MVP status · 26 September 2026

Switchboard is a private **owner-only Leeds Pulse pilot**, not yet a complete volunteer or campaign operations MVP. It presents prepared records; the site does not calculate new results or forecasts on demand.

| Area | Current state | Next gate |
|---|---|---|
| Leeds election results | Six election years (2021–2026), 166 recorded contests and 938 candidate records. The 2025 result view contains only the Morley South by-election. | Correct or corroborate the rejected 2024 Farnley & Wortley official declaration, check the by-election register, and resolve 15 historic candidate-vote differences. |
| Council composition | A 99-seat semicircle and party counts from dated official council snapshots for 2021–2024, 2026 and the page captured 26 September 2026. No verified full-council 2025 snapshot is published. | Refresh the current snapshot on a defined schedule and document changes between snapshots. |
| Explorer | A 33-ward map and table with an alphabetical ward dropdown, turnout and winning-party colours, winner-by-party and SDP-contested filters, ward histories, Census and Tribes context. | Trial with invited viewers; check accessibility and smaller screens. |
| SDP Results | Descriptive filters, year chart and candidate table for 76 published SDP-contested ward polls, linked to the Explorer. | Review wording and anomalies with pilot users; expand to other geographies only after their source audits. |
| Electoral Tribes | Seven K7 descriptions and methods/limitations page, with ward-level resident-weighted shares. | Validate any proposed party association before publishing it; do not infer individual voter types. |
| Development and releases | A portal page shows the current stage plan and dated release history. Its editorial record is updated with each published change. | Keep release notes and stage status aligned with evidence, tests and actual publication. |
| Sign-in and storage | Owner-only Cloudflare Access on the whole Worker; immutable private R2 release objects with SHA-256 checks. | Exercise invited viewer sign-in and revocation, rollback and backup restore. |
| Forecast | Historical test summary only. | Defer prospective modelling as requested. |
| Reports and administration | Proposed release workflow documented; no owner import/approval screen, audit log or exports yet. | Build server-side roles and owner release controls before restricted data or operational releases. |

“Latest recorded” for a ward means the latest **imported poll**. The council composition tab is a separate **dated council snapshot**, not a derivation from those ward polls. A vacant seat is counted as a vacancy. Historical election results are displayed on 2025 ward shapes; exact historical polygon equivalence has not been verified. The package contains no individual voter or party-supplied data.

See [the v0.4.0 release audit](leeds-pulse-v0.4.0-audit-2026-09-26.md) for sources and remaining gaps, and [the publishing workflow](leeds-publishing-workflow.md) for the planned owner controls.
