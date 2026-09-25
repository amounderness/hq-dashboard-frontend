# Private package storage

Cloudflare R2 bucket `switchboard-private-packages` was created with Standard storage on 25 September 2026. The dashboard reported **Public Access: Disabled**. Only invented records have been uploaded. The Worker binding is `SWITCHBOARD_PACKAGES`; no R2 URL or credential is exposed to the browser. The existing Cloudflare Access policy still protects all pages, APIs, assets and preview traffic.

Objects use `releases/<package-id>/...`, with `active.json` at the bucket root. The active pointer contains a package ID and the SHA-256 of that release's `manifest.json`. The server rejects an invalid pointer, a mismatching manifest, or a manifest without `publication_allowed: true`. Upload all immutable release objects first, check them, then write `active.json` last. A rollback changes only the pointer to a previously validated version; do not overwrite release objects in place.

Today the pointer selects `synthetic-owner-preview-v0.1.0`. The development package `leeds-local-elections-v0.1.0` is **not** in R2 and must not be uploaded as a published release. It retains `publication_allowed: false`. The audit in `leeds-release-audit-2026-09-25.md` lists the remaining source and geometry work. No future release should be made by changing that flag alone.

Cloudflare's [R2 pricing](https://developers.cloudflare.com/r2/pricing/) lists 10 GB-month Standard storage, one million Class A operations and ten million Class B operations in its monthly free tier; usage above those amounts is billable. The account activation showed $0 due now and monthly overage charges. Check the actual billing page against the £25 monthly ceiling during the pilot.
