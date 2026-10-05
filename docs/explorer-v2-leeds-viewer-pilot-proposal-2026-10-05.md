# Explorer v2 Leeds viewer pilot proposal · 5 October 2026

**Decision for owner review:** Release the tested Explorer v2 interface to existing invited viewers using only the approved Leeds Pulse v0.6.0 facts. Keep the Yorkshire rc9 candidate local and owner-only until its council-source checks pass. This proposal changes publication scope and server-side roles, so it is a design for review, not an implemented release.

## Evidence already available

- UI commit `f503b9d` adds a repeatable local headless Chrome check. The 5 October run passed V1/V2 map, table and composition comparison, Leeds year and ward selection, winner/turnout/Tribes layers, filters, history, Census and a 390px layout. See [the visual QA record](explorer-v2-visual-qa-2026-10-05.md).
- Leeds's six result objects in rc9 are byte-identical to the audited v0.6.0 imports. This does not approve the rc9 Yorkshire bundle, whose manifest says `council_source_review_pending`.
- The live Worker still has both v2 production flags off, no active v2 package, and an owner-only v2 API. The Leeds v1 site and its R2 pointer remain the viewer service.

## Proposed release boundary

1. Build a **new immutable Leeds viewer package**, rather than editing rc9 or its review flag. Copy the six already audited Leeds result objects from the verified import, retain their source decisions and byte hashes, and include the Leeds 2025 ward geometry plus the England/region/council navigation geometry. The catalogue names Leeds as the sole released authority. Other councils appear grey with an explicit “not released” label and cannot be selected as if their results were available. No non-Leeds candidate or contest object enters this package.
2. Add an audience/scope field to the manifest and a separate viewer release pointer. The viewer route reads only the approved Leeds pointer; the existing owner staging route can continue reading local Yorkshire packages. Package validation must reject non-Leeds result objects in the viewer package and mismatched scope or manifest hashes. A pointer swap must be audited and reversible without touching v1's Leeds pointer.
3. Verify the existing Cloudflare Access identity on every v2 request. Authorise the selected invited accounts as **viewer** for the Leeds package, with owner retained for release controls. Do not trust a visible navigation link or a client-supplied role. Direct viewer requests for non-Leeds results, owner release controls, staging files and exports must receive a denial; signed-out requests must remain behind Access. Responses use `private, no-store`.
4. Label the navigation **Explorer v2 · Leeds pilot** for viewers. Its England and Yorkshire levels show geographic context and release coverage; only Leeds opens ward-level data. Preserve the existing Explorer as the immediate fallback. Keep the wider Yorkshire label and package out of viewer-facing text.
5. Pin code commit, package ID, manifest hash, Leeds-source hashes, viewer Access rule and active-pointer versions in one release record. Run package validation, exact API permission tests, the Chrome visual test, build checks and an authenticated owner/viewer smoke test. Rehearse switching back to v1 by disabling the v2 viewer flag, and rehearse restoring the prior viewer pointer once a second v2 release exists.

## Explicit exclusions and follow-on

This does not publish Bradford or other Yorkshire records, add new role tiers, change Cloudflare billing, change the v1 release or certify national coverage. Yorkshire publication remains a separate release after candidate-level council reconciliation, event-list and historical-geography checks. The Leeds viewer pilot provides useful Explorer v2 feedback sooner while those checks continue.

**Approval checkpoint:** Owner reviews this audience-scoped package and pointer design before implementation, as required by `AGENTS.md` for architecture, schema and access changes. A later checkpoint will present exact tested code/package/access settings for merge, deployment and activation.
