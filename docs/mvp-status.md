# Initial MVP status · 25 September 2026

| Requirement | Current state | Evidence / next gate |
|---|---|---|
| Clean website repository | Existing frontend Git repository retained; app code and lockfile committed on feature/switchboard-leeds-explorer | The feature branch is pushed to GitHub; original starter changes remain in history. |
| Leeds historical results | Connected locally | 2021–2024 and 2026 scheduled ward results, 2025 Morley South by-election. October 2024 Farnley & Wortley source remains rejected. |
| Interactive Explorer | First slice working | 33 real ward polygons; year change, search, linked panel and table. Browser and API checks passed. |
| Dashboard | Basic Overview | Coverage figures and current imported release. Notes/history can expand. |
| Sign-in | Owner-only Access policy active | Entire Worker, including previews and assets, requires login by the owner's exact email. App JWT verification is configured. Owner one-time-code login succeeded on 25 September 2026; revocation testing remains. |
| Data storage / hosting | Private R2 path working with synthetic data | `switchboard-private-packages` has public access disabled; the protected Worker reads an immutable fictional release through its R2 binding. Signed-out page, API and favicon requests redirect to Access. The real Leeds package has not been uploaded or released. R2 was activated with $0 due now and usage charges above its free limits. |
| Source information | Basic view | Package limits shown; add direct source links and component dates to each result. |
| Pulse | Historical election observations only | Add other approved public reference layers once their source/method and presentation are checked. |
| Forecast | Research baseline backtested | 126 single-seat ward elections were evaluated without future inputs. Last-ward winner accuracy fell to 56.7% in the 2026 holdout; no prospective projection is published. See `forecast-backtest-2026-09-25.md`. |
| Reports and saved views | Pending | Fixed report template with date, source, boundaries and access-controlled export. |
| Administration | Pending | Owner-only import, validation preview, immutable publish, rollback, access control and audit trail. |
| Permissions | Viewer gate only | Dataset/role scopes and revocation tests needed before restricted party-fed data. |
| Pilot readiness | Not met | Exercise invited login, data refresh failure, rollback, backup restore, usable reports and forecast evaluation. |

The first release is deliberately a *local app slice*, not the operational MVP. No campaign targeting score or individual voter record is loaded.
