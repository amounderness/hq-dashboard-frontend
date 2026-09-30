# Explorer v2 display corrections — 29 September 2026

Status: prepared for review on fix/explorer-v2-display-states-2026-09-29. Not merged or deployed. Code commit: 47aab6ab44dd9316a34482b517cc57c25572ba74. Base: 9d4fe7e613a13a5ec1ef528f2cefd512da1e1667.

## Changed behavior
- Non-Leeds poll seats show the count without an invented total ward-position denominator. Leeds retains its established three-position reference.
- England Table shows region rows; Yorkshire and Humber has recorded aggregates and other regions explicitly show unavailable values outside the release.
- Pending and failed result/history requests are distinct from confirmed missing records. Failures are keyed to their authority/year scope; cancelled-effect guards retain stale-response protection. Map descriptions also distinguish pending/failed requests.

## Validation
- Read bundled Next.js 16.3.6 client-component and App fetching documentation.
- TypeScript and repository ESLint passed on the final replacement.
- Cloudflare-target vinext build exited 0 and emitted build output; Wrangler log-path warnings and route classification warnings remain.
- Default Next.js build blocked by a process/port permission restriction (Operation not permitted) including the escalated attempt. Webpack fallback also failed parsing TypeScript --showConfig. A production Next.js build has NOT passed in this environment.
- npm ci failed because the existing lockfile omits Rolldown platform bindings. Temporary npm install --package-lock=false installed dependencies for checks; package.json and lockfile are unchanged. Clean locked installation remains unresolved and outside this patch.
- Independent source review found no blockers. No authenticated browser acceptance, release-package validator or real-data flow tests were run. Leeds v0.6.0 and Explorer v2 rc3 are absent from this checkout.

## Before merge/release
Run the required production builds in a working environment and browser-test country/region/authority table navigation, filters, slow requests, failed requests, empty years, history and Leeds regression behavior using validated packages. No production flags, package pointers, Access policies or live deployment were changed.

## Access remaining
GitHub branch/file writes now work. For real-data local testing recover validated Leeds v0.6.0 and staged regional rc3 with manifests/hashes. For live tests use owner-authorized Cloudflare Access sign-in. For deployment/recovery establish an authorized Cloudflare CLI/API or plugin connection with the necessary Worker/R2 scope; no Cloudflare session was configured or tested here. Production activation, merges and access changes require explicit owner approval under the agreed rules.

## Integration check — 30 September 2026
The display branch was updated with the current Explorer v2 baseline, including the repaired lockfile and recovered local Leeds v0.6.0 and Yorkshire rc3 packages. TypeScript, ESLint, the Next.js production build, and the vinext Worker build passed. Local Chrome showed nine region rows in the England Table and 15 council rows in the Yorkshire Table; Leeds 2026 loaded 33 contests. A delayed, simulated 2025 API failure showed a loading state followed by a clear error, and returning to 2026 cleared the error. No browser page errors appeared. These checks address the earlier clean-build and local-browser blockers for this patch; live Cloudflare Access and regional release gates are still pending. The previous sections remain a record of the original 29 September review conditions.
