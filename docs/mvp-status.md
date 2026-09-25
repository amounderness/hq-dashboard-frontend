# Initial MVP status · 25 September 2026

| Requirement | Current state | Evidence / next gate |
|---|---|---|
| Clean website repository | Existing frontend Git repository retained; app code and lockfile committed on feature/switchboard-leeds-explorer | The feature branch is pushed to GitHub; original starter changes remain in history. |
| Leeds historical results | Published in owner-only preview | Versioned `leeds-public-results-v0.2.1` includes 2021–2024 and 2026 scheduled ward results and the 2025 Morley South by-election. October 2024 Farnley & Wortley source remains rejected; the by-election register is not certified complete. |
| Interactive Explorer | First slice working | 33 real ward polygons; year change, search, linked panel and table. Browser and API checks passed. |
| Dashboard | Basic Overview | Coverage figures and current imported release. Notes/history can expand. |
| Sign-in | Owner-only Access policy active | Entire Worker, including previews and assets, requires login by the owner's exact email. App JWT verification is configured. Owner one-time-code login succeeded on 25 September 2026; revocation testing remains. |
| Data storage / hosting | Private R2 serving Leeds release | `switchboard-private-packages` has public access disabled. The protected Worker reads an immutable Leeds public-results release through its R2 binding, verifying the manifest and each data object's SHA-256. All 30 release objects were read back and matched. Signed-out page, Forecast API and favicon requests redirect to Access. The fictional and previous Leeds releases remain available for pointer rollback. R2 usage above its free limits is billable. |
| Source information | Release-level audit and links visible | Source documents, credits, limits and the 2025 boundary label are shown. Add candidate/contest-level lineage and dates before broader rollout. |
| Pulse | Historical election observations only | Add other approved public reference layers once their source/method and presentation are checked. |
| Forecast | Retrospective test summary visible | 126 single-seat ward elections were evaluated without future inputs. The owner site shows per-year errors and winner accuracy; the 2026 holdout fell to 56.7% accuracy. No prospective projection is published. See `forecast-backtest-2026-09-25.md`. |
| Reports and saved views | Pending | Fixed report template with date, source, boundaries and access-controlled export. |
| Administration | Pending | Owner-only import, validation preview, immutable publish, rollback, access control and audit trail. |
| Permissions | Viewer gate only | Dataset/role scopes and revocation tests needed before restricted party-fed data. |
| Pilot readiness | Not met | Exercise invited login, data refresh failure, rollback, backup restore, usable reports and forecast evaluation. |

This is an owner-only, public-results pilot, not the operational MVP. No campaign targeting score or individual voter record is loaded. Census and Electoral Tribe layers are withheld pending source checks. Volunteer access, revocation, rollback, backup restore, reports and a stronger prospective model still require testing.
