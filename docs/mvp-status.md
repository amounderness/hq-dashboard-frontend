# Initial MVP status · 25 September 2026

| Requirement | Current state | Evidence / next gate |
|---|---|---|
| Clean website repository | Existing frontend Git repository retained; app code and lockfile ready to commit | Review diff, commit and push when appropriate; original starter changes are preserved in history. |
| Leeds historical results | Connected locally | 2021–2024 and 2026 scheduled ward results, 2025 Morley South by-election. October 2024 Farnley & Wortley source remains rejected. |
| Interactive Explorer | First slice working | 33 real ward polygons; year change, search, linked panel and table. Browser and API checks passed. |
| Dashboard | Basic Overview | Coverage figures and current imported release. Notes/history can expand. |
| Sign-in | Defensive server gate implemented | Cloudflare Access tenant, invitation policy, audience settings, account recovery and real-user checks remain. No production account has been configured. |
| Data storage / hosting | Candidate design only | Local filesystem adapter now; private hosted storage and provider deployment still needed. No billable service ordered. |
| Source information | Basic view | Package limits shown; add direct source links and component dates to each result. |
| Pulse | Historical election observations only | Add other approved public reference layers once their source/method and presentation are checked. |
| Forecast | Unavailable state | Define forecast quantity and evaluate a time-respecting baseline before publishing projections. |
| Reports and saved views | Pending | Fixed report template with date, source, boundaries and access-controlled export. |
| Administration | Pending | Owner-only import, validation preview, immutable publish, rollback, access control and audit trail. |
| Permissions | Viewer gate only | Dataset/role scopes and revocation tests needed before restricted party-fed data. |
| Pilot readiness | Not met | Exercise invited login, data refresh failure, rollback, backup restore, usable reports and forecast evaluation. |

The first release is deliberately a *local app slice*, not the operational MVP. No campaign targeting score or individual voter record is loaded.
