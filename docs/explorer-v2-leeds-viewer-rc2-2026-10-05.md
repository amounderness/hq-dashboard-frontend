# Explorer v2 Leeds viewer release candidate · 5 October 2026

**Status:** Implemented and locally tested, **not merged, uploaded, approved, activated or deployed**. The existing Leeds Explorer and its live pointer are unchanged. Yorkshire rc9 remains local with council review pending.

The isolated package is `explorer-v2-leeds-viewer-2026-10-05-rc2`, under ignored local `data/explorer-v2/viewer-releases/`. Its manifest SHA-256 is `5475f40bd38f07081921e5a77554ad00aaf6ba8dc53335242db8fc1bb0a4bfd9`. It contains ten objects: England regions, 296 English council shapes and catalogue entries, 33 Leeds ward shapes, and **only** six Leeds result objects (8 events, 167 contests, 945 candidate records). Non-Leeds councils are grey, labelled not released and cannot be selected. The six Leeds result hashes are pinned to the audited Pulse v0.6.0 import in the unchanged rc9 source package, whose manifest hash is `5e50816f9f6c5e72f6236c06d172665a2556c3fd4fd18e253a41109010d3e660`. The original v0.6.0 folder was not found in this checkout; the pre-existing import and [source decision record](leeds-source-decisions-v0.6.0-2026-09-26.md) establish the lineage, and rc9's Leeds objects were already confirmed byte-identical to rc6.

The proposed viewer route reads a **separate** `v2/viewer/active.json` pointer and `v2/viewer/releases/` namespace in private R2. Its owner-only control panel stages immutable files, checks scope, hashes and election references, records source-review approval, and changes the viewer pointer with a storage-version check and audit trail. It rejects modified Leeds result hashes and any non-Leeds result object. The existing Yorkshire owner pointer and the v1 Leeds pointer use other keys. An authenticated Cloudflare Access account can read the Leeds viewer route only when the server flag is enabled; the owner-only release API retains owner JWT checks. The UI is separately gated by a viewer flag. Both new production flags are **off** until an exact release approval.

## Local verification

- In-memory private-storage checks passed stage → validate → approve → activate, no-approval rejection, exact-source-hash rejection, non-Leeds-object rejection, pointer isolation and first-activation rollback behaviour. Existing Yorkshire release tests still pass, including rc9's refusal to approve while its source review is pending.
- 30 Explorer Python regression tests, TypeScript, lint, Next.js production build and Cloudflare-target Worker build passed. The builds included the new owner-only viewer-release route; the final builds passed with the viewer flags on locally, without deploying them.
- Headless Chrome passed the Leeds viewer journey, v1 baseline, Map/Table/Composition, year changes, Census/Tribes/History, party and SDP filters, and a 390px mobile viewport. A direct browser request for Bradford results returned **403** in the local viewer preview. The final run after correcting the viewer badge and notice passed, and its screenshots were reviewed in ignored `data/explorer-v2/browser-qa-2026-10-05T20-27-29-996Z/`.
- The final Next.js and Worker builds also passed with both viewer flags **on** in the local build environment. A local production server with non-secret placeholder Access settings returned `401 Sign-in required` for the page, v2 catalogue, Leeds results and owner viewer-release API when signed out. Without even the placeholder settings, its proxy fails closed with `503 Access is not configured`. These do **not** prove a signed-in viewer session or the live Access policy; no authenticated production test has been recorded.
- The unpublished Yorkshire owner preview was rerun after the viewer changes: England/Yorkshire/Leeds navigation, both Bradford ward editions, filters and mobile layout still pass. rc9 remains blocked from source approval.

## Release sequence after exact owner approval

1. Merge the reviewed code commit and deploy it with `NEXT_PUBLIC_EXPLORER_V2_VIEWER_ENABLED=false` and `SWITCHBOARD_V2_VIEWER_ENABLED=false`. Leave the Yorkshire v2 flags off.
2. In the owner release page, stage the **rc2 viewer folder** in the separate Leeds viewer panel. Check the returned package ID and manifest checksum against those above, validate all ten objects, then record the Leeds source-review approval reason.
3. Activate the viewer pointer and confirm its R2 object/version and audit entry. Confirm `v2/active.json` and the live `active.json` remain unchanged. A first activation has no prior viewer pointer to restore.
4. Confirm the existing Cloudflare Access rule includes only the intended invited pilot accounts. Then deploy the same reviewed code with **both viewer flags on**. The old Explorer remains the immediate fallback.
5. Immediately test a signed-in owner and a separate invited viewer: Leeds pages and candidate requests work; Bradford results and both owner release APIs are denied to the viewer; signed-out requests redirect to Access. Check desktop and mobile map, table, composition, Census/Tribes and year changes. Capture exact statuses and the Access rule used. If this fails, redeploy with viewer flags off; after a later release exists, the viewer pointer can also be rolled back through its audited control.

This record is a preparation checklist. None of its post-approval release steps have occurred.

## Repeat the Leeds viewer check on this PC

Open PowerShell in the repository folder, then run these lines in order:

1. `$env:SWITCHBOARD_V2_PACKAGE_DIR = (Resolve-Path 'data/explorer-v2/viewer-releases/explorer-v2-leeds-viewer-2026-10-05-rc2').Path`
2. `$env:SWITCHBOARD_ALLOW_LOCAL_UNAUTHENTICATED = 'true'`
3. `$env:SWITCHBOARD_V2_LOCAL_VIEWER = 'true'`
4. `$env:NEXT_PUBLIC_EXPLORER_V2_VIEWER_ENABLED = 'true'`
5. `npm run dev -- -p 3045`

Open `http://localhost:3045/#explorerV2`. In a **second** PowerShell window in the same repository folder, run `$env:SWITCHBOARD_VISUAL_SCOPE = 'viewer'` and then `npm run test:visual:explorer-v2`. The test prints `PASS` and a folder of screenshots when it succeeds. Stop the local site with Ctrl+C. If Next.js reports a corrupt generated `.next` database after switching between production build and development, stop all local servers, verify that `.next` is the generated folder inside this repository, remove only that folder, and restart the development command.
