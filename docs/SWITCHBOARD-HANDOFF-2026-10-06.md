# Switchboard hand-off · 6 October 2026

This is the current starting point for development in local or cloud chats. Recheck live services, branches and election facts before acting. The [29 September hand-off](../../SWITCHBOARD-HANDOFF-2026-09-29.md) is historical and contains obsolete statements about Explorer v2 not being deployed.

## Product and direction

Switchboard is a private **Electoral Intelligence** workspace for selected SDP officers and campaigners. Pulse presents source-backed election results, by-elections, separately dated council composition, Census context, exploratory Electoral Tribes and SDP result analysis. Forecast is currently retrospective research, not a published 2027 prediction. Pages render precomputed, versioned data; opening a page does not run a new model.

The product is now a **select England-wide trial** in ongoing development. Leeds City Council is the first detailed release and regression example, not the limit of the product. England and Yorkshire geography can be indexed before detailed results are released. Viewer coverage expands area by area after source, geography, quality, access and release checks. The [revised platform plan](../../docs/switchboard-platform-plan-2026-09-27-revision.md) aims for broad, selectively publishable England coverage by the end of February 2027. That is a delivery target, not evidence that national results are already verified. Viewer feedback and expansion work run in parallel. Forecast modelling remains a later research lane.

The website has Overview, the existing Leeds Explorer, Explorer v2 (Map/Table/Composition and Results/Census/Tribes/History), SDP Results, Electoral Tribes research, Forecast explanation, reports and exports, data/source information, Development, and owner-only release controls. The visual identity is the lowercase `switchboard` wordmark, Ward Mosaic icon, **Electoral Intelligence** subtitle, deep petrol/graphite/white/pale turquoise interface and separate party result colours. See the [brand record](brand-direction.md) and [MVP status](mvp-status.md).

## Verified release state as recorded on 5 October

| Surface | Recorded state | Limit |
| --- | --- | --- |
| Private site | [switchboard-owner-preview.keenanrclough.workers.dev](https://switchboard-owner-preview.keenanrclough.workers.dev/) on Worker `switchboard-owner-preview`, behind site-wide Cloudflare Access | Recheck the current Access allowlist and Worker version before a new release. |
| Pulse package | Private R2 `active.json` points to `leeds-pulse-v0.6.0` | Leeds City Council only: 33 wards, 2021–2026, 167 contests and 945 candidate records. |
| Explorer v2 viewer | Separate `v2/viewer/active.json` points to `explorer-v2-leeds-viewer-2026-10-05-rc2`, manifest SHA-256 `5475f40bd38f07081921e5a77554ad00aaf6ba8dc53335242db8fc1bb0a4bfd9` | England geography is visible, but detailed viewer results are Leeds-only and the API denies non-Leeds requests. The owner and a party test account reported the key Leeds views working. See the [release record](explorer-v2-leeds-viewer-rc2-2026-10-05.md). |
| Yorkshire regional candidate | Dated-ward rc9, 58 council-years, 1,288 contests and 7,882 candidates, is locally validated but source-review pending | It is **not** a regional viewer release. `v2/active.json` was absent. See [Gate 2](explorer-v2-gate-2.md). |
| Forecast | Research explanation and historical tests | No validated prospective vote-share, seat or council-control forecast is published. |

The last recorded Worker version is `d9a9ce9b-ccdf-4fd1-8c8e-c6a359cd007c`. Its Leeds viewer flags are on; Yorkshire regional flags are off. These technical flags enforce release scope and must **not** be removed merely because the user-facing “Leeds pilot” label is retired. This branch records `SWITCHBOARD_V2_VIEWER_ENABLED=true` and `SWITCHBOARD_V2_ENABLED=false` in `wrangler.jsonc` so the approved server-side Leeds state survives a rebuild. Before the next deployment, explicitly build with `NEXT_PUBLIC_EXPLORER_V2_VIEWER_ENABLED=true` and `NEXT_PUBLIC_EXPLORER_V2_ENABLED=false`, then verify those client values and the generated Worker configuration. An omitted client flag can still hide the approved Leeds view.

## Working locations and source of truth

- [GitHub application repository](https://github.com/amounderness/hq-dashboard-frontend): code, tools and versioned release records. The current active development base was `feature/switchboard-leeds-explorer` at `ce97c27` before this hand-off update. PR #1 and documentation PR #5 were merged. Check the branch, remote and new commits afresh.
- Local checkout: `C:\Users\keena\.codex\.chatgpt-projects\g-p-67d1a252ca0481919129c20f78ca76d8\switchboard-v2`. Its `github` remote is the actual GitHub repository; its `origin` remote is an older local checkout at `C:\Users\keena\Documents\Switchboard-Project\hq-dashboard-frontend`.
- ChatGPT project local mirror: `C:\Users\keena\.codex\.chatgpt-projects\g-p-67d1a252ca0481919129c20f78ca76d8`. Project ID `g-p-67d1a252ca0481919129c20f78ca76d8`. Files under `sources/` are read-only references. A file in the local mirror is **not** proof of cloud upload or sync.
- Ignored local `data/explorer-v2/`: SQLite working store, downloaded sources, generated packages and release candidates. These are **not in GitHub**. Never infer a recoverable source dataset from a committed tool alone.
- Private Cloudflare R2 bucket `switchboard-private-packages`, Worker binding `SWITCHBOARD_PACKAGES`, contains approved immutable release objects and active pointers. Do not expose its contents or credentials in Git.
- [Electoral_Intelligence research repository](https://github.com/amounderness/Electoral_Intelligence) and `C:\Users\keena\Documents\Electoral_Intelligence` are earlier research, not the live application or complete working-data backup.

Read the [revised platform plan](../../docs/switchboard-platform-plan-2026-09-27-revision.md), [Gate 2 record](explorer-v2-gate-2.md), [MVP status](mvp-status.md), [Leeds source decisions](leeds-source-decisions-v0.6.0-2026-09-26.md), [viewer release record](explorer-v2-leeds-viewer-rc2-2026-10-05.md), [viewer access guide](pilot-viewer-access.md) and repository [AGENTS.md](../AGENTS.md) as relevant. The older [MVP blueprint](../../switchboard-mvp.md) and [website design](../../switchboard-website-design.md) describe product intent, but some implementation status has changed since they were written.

## Data and release principles

Keep event, contest, candidate result, source assertion, seats filled, council composition and dated geography as separate facts. “Latest recorded” means the latest imported ward poll, not a current councillor roster. A missing annual record does not prove no election. A current polygon does not certify a historical poll boundary. Census and K7 are aggregated area context, not individual voter identity or verified vote intention. Keep source disagreements and secondary-source caveats visible.

Use **ingest → validate → stage → review → approve → activate**, with immutable objects, manifest hashes, audit entries and pointer rollback. England-wide geography, ingested records, audited results and viewer-released results are four different states. Keep approved Leeds behavior as a regression fixture while adding other areas. Restricted party-fed or individual voter data requires separately designed access rules; do not include it in a general viewer release.

Owner-only release actions require server-verified identity as well as Cloudflare Access. Invited viewers are allowed by exact email, not by public self-service request. Confirm viewer API denial and account revocation, not just hidden navigation. The [access guide](pilot-viewer-access.md) records the current small-trial procedure; the actual allowlist must be checked in Cloudflare before changes.

## Next delivery work

1. Continue the small viewer trial and record specific tasks, misunderstandings and bugs; test revocation and capture the exact owner-API denial status.
2. Make national area/version relationships, generic ingestion and coverage states reliable enough to stage more than one council without Leeds-specific tool copies. Keep a dated election-event register and source quality status.
3. Reconcile Yorkshire rc9 against council declarations and event lists, especially changed 2026 ward editions and remaining by-elections. Then test the exact package and access behavior before any regional viewer release.
4. Expand selected verified councils through the October–February window, with reports/exports and the Explorer checked at country, region, council and ward levels. Update the public-facing coverage explanation whenever release scope changes.
5. Develop prospective Forecast only after its output, time-ordered backtests, baseline comparisons and uncertainty reporting are agreed and tested.

The repository [AGENTS.md](../AGENTS.md) now allows reversible local development, commits, pushes and draft PRs within an agreed task. Exact owner approval remains necessary for a protected/release merge, deployment, data activation, production-capability enablement, access-policy change or other consequential action. A local project-settings replacement is in [Project instructions update](chatgpt-project-instructions-2026-10-06.md); ChatGPT project settings must be changed in the project UI to persist beyond this checkout.
