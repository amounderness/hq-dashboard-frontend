# Proposed Leeds release workflow

The current pilot builds packages locally and activates them through a private R2 pointer. This is the controlled process to follow for each Leeds update until an owner interface exists. The proposed administration controls below are **not yet implemented**.

1. **Import into staging.** Keep original source files, URLs, retrieval dates, licences, and file hashes. Record which wards, dates and election types each source claims to cover. Do not put party-fed or individual voter data in a public-results release.
2. **Validate.** Check schema, ward and candidate identifiers, uniqueness, vote totals, turnout denominators, winner and seat consistency, geography joins, and comparison with already published records. Quarantine blank declarations and conflicts; never silently convert missing votes to zero.
3. **Review and approve.** Produce a human-readable difference report naming added, changed, missing and rejected records. The owner records a decision and reason for every exception and authorises an immutable package version. A later volunteer role should not gain this permission by default.
4. **Stage and test.** Build an immutable release, verify all object hashes, then open the exact staged version in the app. Check the map, tables, current snapshots, research context, and year transitions. Run the release validator and app checks.
5. **Publish.** Upload all new immutable objects to private R2; read each back and verify its hash. Preserve the old `active.json`. Change only `active.json` to the approved release when all checks pass. Verify signed-in use and signed-out denial before inviting viewers.
6. **Audit and rollback.** Record the source hashes, approver, time, version, test results, storage keys, and old/new pointer hashes in an append-only log. If the release is wrong, repoint `active.json` to the last verified package, then check the site. Never overwrite objects in place. Test backup restore separately.

The next administration milestone is an owner-only screen for import status, validation differences, approval, activation history and one-click rollback, backed by server-side roles and durable audit records. Reports and exports follow that control work and the first viewer trial.
