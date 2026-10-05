# Explorer v2 browser review · 5 October 2026

**Status:** Local headless Chrome checks pass against the unpublished `explorer-v2-yh-2026-10-05-rc9` package. This is a visual and interaction check, not a council-source approval or live-site release. Leeds's audited result objects remain unchanged. The native desktop browser-control helpers failed before opening a page with `windows sandbox failed: helper_unknown_error: apply deny-read ACLs`; the repository now has a dependency-free Chrome DevTools Protocol test instead.

## What was checked

- A screenshot of the current Leeds Explorer establishes the visual baseline. Explorer v2 renders the England map, the 15 Yorkshire and Humber council areas, and Leeds's 33 wards in the same clean layout.
- Region, council and ward navigation; ward highlight; year change to Leeds's 2025 missing-poll explanation and back; the Leeds-only **Latest recorded** view; winning-party, turnout and seven-group Electoral Tribes map layers; SDP-contested and winner-party dimming.
- Ward Results, Census, Electoral Tribes and History panels; candidate-level Table with elected ticks; Leeds's dated 99-seat Composition chart.
- Bradford's February Worth Valley poll selects the 2025 ward edition, and June Idle and Thackley selects the 2026 edition. The map highlight follows each selected poll. The page shows the event kind, unknown turnout and original-source caveat.
- At 390 CSS pixels, the Bradford map is 356 pixels wide and the page has no horizontal overflow. Browser exceptions were absent in the completed run.

The screenshots from the completed run are in the ignored local directory `data/explorer-v2/browser-qa-2026-10-05T19-57-42-396Z/`. They are **not in GitHub** and need separate backup if required as long-term evidence. The test reports an absolute screenshot directory on each run and keeps failed-run captures for inspection. The screenshots were visually reviewed: v2's map, chart and composition presentation is comparable with v1, and the mobile map and detail panel remain readable. The 2025 year transition no longer loses the map in this local run.

## Repeat the check

From the repository folder in PowerShell:

1. Point the local app to the rc9 folder: `$env:SWITCHBOARD_V2_PACKAGE_DIR = (Resolve-Path -LiteralPath 'data/explorer-v2/work-2026-10-05-dated-wards-rc7/releases/explorer-v2-yh-2026-10-05-rc9').Path`.
2. Allow only this local development preview to skip Cloudflare sign-in: `$env:SWITCHBOARD_ALLOW_LOCAL_UNAUTHENTICATED = 'true'`.
3. Start the site: `npm run dev -- -p 3045`.
4. In a second PowerShell window opened in the same repository folder, run `npm run test:visual:explorer-v2`.
5. Look for `"result":"PASS"`, then inspect the printed screenshot folder. Stop the local site with Ctrl+C when finished.

The test uses the installed Chrome executable, starts it headlessly with an isolated profile, and requires no Playwright package or Cloudflare login. It exercises the local browser page, not the deployed Worker. The release package and its raw inputs remain Git-ignored.

## Remaining pilot gates

Visual parity does not certify the Yorkshire data. The 113 changed-council 2026 ward/result links still need candidate-level council reconciliation; Bradford's indexed official results need durable original-page or declaration evidence; other Yorkshire event lists and historical geography remain incomplete. Exact viewer API denial, live Access and private R2 release controls also need a recorded pass. Build a new immutable, source-reviewed package after those checks. The existing rc9 flag blocks owner approval, and both v2 production flags remain off. A wider viewer pilot requires owner approval of the exact tested package, code and access change before merge, activation or deployment.
