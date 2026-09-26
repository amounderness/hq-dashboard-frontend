# Private package storage

Cloudflare R2 bucket `switchboard-private-packages` was created with Standard storage on 25 September 2026. The dashboard reported **Public Access: Disabled**. It holds a fictional preview release and immutable Leeds releases. The Worker binding is `SWITCHBOARD_PACKAGES`; no R2 URL or credential is exposed to the browser. The existing Cloudflare Access policy still protects all pages, APIs, assets and preview traffic.

Objects use `releases/<package-id>/...`, with `active.json` at the bucket root. The active pointer contains a package ID and the SHA-256 of that release's `manifest.json`. The server rejects an invalid pointer, a mismatching manifest, a manifest without `publication_allowed: true`, or any factual release object whose SHA-256 does not match the manifest. Upload all immutable release objects first, read them back and check hashes, then write `active.json` last. A rollback changes only the pointer to a previously validated version; do not overwrite release objects in place.

The pointer now selects `leeds-pulse-v0.6.0`. It retains the 2021 Census, 2025 ward geometry, Electoral Tribes, dated composition, SDP index and unchanged retrospective Forecast tests. v0.5.0 added the labelled 2024 Farnley & Wortley by-election and approximate 2025 Morley turnout. v0.6.0 closes four historical result-source decisions and adds a council-archive event reconciliation record. Owner validation checked all 36 manifest-hashed objects and election invariants before activation. Prior releases remain intact for rollback. No party-supplied or individual voter data is published. See [the v0.6.0 source decisions](leeds-source-decisions-v0.6.0-2026-09-26.md).

Cloudflare's [R2 pricing](https://developers.cloudflare.com/r2/pricing/) lists 10 GB-month Standard storage, one million Class A operations and ten million Class B operations in its monthly free tier; usage above those amounts is billable. The account activation showed $0 due now and monthly overage charges. Check the actual billing page against the £25 monthly ceiling during the pilot.

On 26 September 2026, v0.5.0 was approved and activated through owner controls, rolled back to v0.4.0, then reactivated. The audit trail records all three pointer changes. See [the v0.5.0 audit](leeds-pulse-v0.5.0-audit-2026-09-26.md).

Later on 26 September 2026, v0.6.0 was staged as 37 private files (the manifest plus 36 hashed objects), validated, approved with a source-choice reason and activated through the same owner controls. The audit trail shows the v0.5.0 → v0.6.0 pointer change.
