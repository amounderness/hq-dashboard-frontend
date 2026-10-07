<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Switchboard agent coordination

## Owner-approved action and review rules
Adopted by Keenan on 29 September 2026; revised on 6 October to support a select England-wide pilot. These rules apply to the coordinator and every delegated agent. A technical Allow all actions setting does not expand project authorization.
- Within an agreed task, proceed with reading, source investigation, reversible local implementation, tests, commits, pushes and draft PRs. This includes exploratory architecture, dependencies and data schemas on an isolated branch. Present the concrete design, trade-offs and test evidence for owner review before adopting a material contract for a live release. Ask before implementing a change that itself alters privacy, security, spending, irreversible data migration or published Forecast methodology.
- Merge checked documentation, tests and routine reversible fixes into the active development branch when they are within the user's agreed task. An existing approval carries through non-material corrections; do not ask again for the same action. Obtain explicit owner approval for the exact tested candidate before merging to a protected/release branch, deploying code, activating a data pointer, or enabling a production capability. State the commit/package, checks, known limits and rollback route at that checkpoint.
- Obtain specific owner approval before changing access policy, credentials or billing, deleting or overwriting important data, or publishing a new model or restricted dataset. A request to audit alone authorizes investigation, not a release; a request to audit and fix authorizes the reversible fix work described above.
- Stage a package in private storage within an agreed release task only after checking its scope and hashes. Staging does not approve or activate it. Keep review, approval and activation separate, with an exact manifest and audit trail.
- Verify write outcomes. Never imply a commit, merge, deployment or activation occurred when it did not. The coordinator remains responsible for integration and reporting across agents.

## Read before work
Read the [current hand-off](docs/SWITCHBOARD-HANDOFF-2026-10-06.md) and the documents relevant to the task. For architecture or coverage work, include the [revised platform plan](../docs/switchboard-platform-plan-2026-09-27-revision.md) and Explorer v2 Gate 2 record; for publication, include the current MVP status and source/release decisions. Confirm remotes, branch and exact commit before repository writes. Missing material blocks only work that depends on it; never claim to have read it.
Distinguish released Leeds data, unpublished regional candidates, planned capabilities and independently verified behavior. Dated documents do not establish current deployment or Access policy.

## Delegation
When the owner explicitly requests parallel agents, use them for independent project tasks where they improve delivery. Keep one coordinator responsible for assignment, integration and final reporting. Suitable assignments are frontend, data/geography, and independent QA/release review. Give every agent the same verified base commit, explicit outcome, owned files, dependencies and definition of done.
Read-only agents may inspect shared files. Editing agents must have disjoint file ownership; use separate branches/worktrees for independent coding chats. The coordinator owns shared contracts, shared styles, Leeds regression surfaces and integration. Resolve overlaps before edits. Do not simultaneously mutate a shared SQLite store, release directory, active pointer or Git checkout.
Subagents return concise evidence, file references, findings, validation performed and blockers. Do not present their source inspection as a runtime test.

## Data and recovery
/data/, /public/data/ and /.local-data/ are ignored. GitHub is not a backup of those files. Inventory the approved Leeds package, staged regional release, database, raw-source snapshots and manifest hashes before promising recovery or reproducibility.
Use a new staging directory and release ID for rebuilds. Preserve original immutable releases and audit records. Verify manifests and object hashes. A new build is not the original release merely because counts match.
Do not infer no poll from a missing annual record, council composition from election winners, or historical geometry equivalence from a current/name-matched polygon. Keep secondary-source attribution and caveats visible. Forecast remains research until validated.

## Verification and release
Run checks proportionate to the change. For application code, use relevant package validators plus npm run typecheck, npm run lint, npm run build and npm run build:vinext; browser-test affected flows when an authorized environment is available. Documentation-only changes need review and link/consistency checks, not four application builds. Record blocked checks honestly.
Preserve Leeds behavior as the regression fixture. The approved Leeds viewer release has its viewer flags on; the unreleased Yorkshire/regional flags remain off until their source, access and release-control gates pass. Verify the effective build and Worker flags before each deployment so a rebuild cannot silently hide a released view or expose an unreleased one. Stage, validate, review, approve and activate remain separate steps.
Release work must retain package ID, manifest hash, code commit, source evidence, audit and rollback route. Verify owner/viewer API denial as well as UI visibility when permissions or release scope change. Do not merge or activate during an audit-only task.

## Logs and hand-off
Update relevant Gate2, source audit, MVP and development logs only for work actually checked or published. Label staged, source-reviewed, locally tested and live-verified evidence explicitly. Record remaining blockers and next owner. Keep user explanations practical and beginner-friendly.
