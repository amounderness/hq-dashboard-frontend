# Switchboard MVP status · 25 September 2026

Switchboard is a private **owner-only Leeds Pulse pilot**. The Explorer is usable for reviewing published election results, 2021 Census ward aggregates and the project's exploratory Electoral Tribes. It is not yet the full volunteer MVP or a campaign operations system.

| Area | Current state | Next gate |
|---|---|---|
| Leeds election results | Six election years (2021–2026), 166 recorded contests, 938 candidate records. The 2025 view contains only the Morley South by-election. | Obtain a corrected 2024 Farnley & Wortley declaration; continue checking the by-election register. |
| Latest recorded result | Each ward shows its most recent imported poll; historical views show only polls from the selected year. | Do not present this as current council composition until vacancies and all subsequent by-elections are certified. |
| Explorer | Searchable 33-ward map, linked ward panel, table, turnout and winning-party colours, winner-by-party and SDP-contested filters, party-coloured result bars and selected-ward outline drawn above neighbouring wards. | Trial with invited viewers and check mobile usability. |
| Pulse context | Ward profiles include 17 Census measures and seven Electoral Tribe shares. Counts come from 2,607 2021 Census output areas assigned by the official best-fit 2025 ward lookup. | Review measure wording and accessibility with pilot users; maintain source and model-version lineage. |
| Data provenance | Release-level source links, attribution, boundary label and quality notes; contested rows and rejected/missing by-elections are visible in ward history. | Obtain council clarification for the 15 historical vote differences and any missing declarations. |
| Sign-in and storage | Owner-only Cloudflare Access on the whole Worker; private R2 package with immutable objects and SHA-256 checks. | Test invited viewer sign-in, revocation, rollback and backup restore. |
| Forecast | Historical test summary only. | Defer modelling and prospective projections, as requested. |
| Reports and administration | Not built. | Add controlled export/report template, owner-only import and publication workflow before operational pilot. |
| Permissions | Viewer gate only; no separate data or role scopes. | Add server-side roles before importing restricted party-fed data or inviting different access tiers. |

The current package does not include individual voter data, party-supplied information, live calculations or a validated future forecast. The Electoral Tribes are modelled neighbourhood groupings, not inferred voting intent. Historical elections are displayed on 2025 ward shapes; precise historical polygon equivalence is unverified.
