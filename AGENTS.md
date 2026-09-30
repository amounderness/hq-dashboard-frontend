<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Switchboard agent coordination

## Owner-approved action and review rules
Adopted by Keenan on 29 September 2026. These rules apply to the coordinator and every delegated agent. A technical Allow all actions setting does not expand project authorization.
- Proceed with reading, audits, source investigation and read-only delegation; report findings.
- Prepare fixes and run local checks within an agreed task; provide a reviewable diff.
- Create isolated development branches and draft PRs within the agreed task. Verify write outcomes and never imply changes were committed when blocked.
- Present architecture, dependency, data-schema and modelling-method changes for owner review before implementation.
- Obtain explicit owner approval for the exact tested change before merging, deploying, activating packages or enabling production flags.
- Obtain specific owner approval before changing access, credentials or billing, or deleting/overwriting important data. Routine task-scoped working edits are covered by the agreed development task.
- At each major-action checkpoint, present the concrete change, affected commit/package, completed checks, remaining limitations and rollback route. Approval applies to that result, not an unspecified later version; carry forward approval unless scope or material risk changes.
- The coordinator enforces these boundaries across all subagents and remains responsible for integration and reporting.

## Read before work
Read the latest hand-off, revised platform plan, docs/explorer-v2-gate-2.md, MVP status, and relevant source/release decisions. Confirm repository remotes, branch and exact commit. Missing files are blockers to their dependent tasks; never claim to have read them.
Distinguish live Leeds, locally staged Explorer v2, planned capabilities and independently verified behavior. Dated documents do not establish current deployment or Access policy.

## Delegation
When the owner explicitly requests parallel agents, use them for independent project tasks where they improve delivery. Keep one coordinator responsible for assignment, integration and final reporting. Suitable assignments are frontend, data/geography, and independent QA/release review. Give every agent the same verified base commit, explicit outcome, owned files, dependencies and definition of done.
Read-only agents may inspect shared files. Editing agents must have disjoint file ownership; use separate branches/worktrees for independent coding chats. The coordinator owns shared contracts, shared styles, Leeds regression surfaces and integration. Resolve overlaps before edits. Do not simultaneously mutate a shared SQLite store, release directory, active pointer or Git checkout.
Subagents return concise evidence, file references, findings, validation performed and blockers. Do not present their source inspection as a runtime test.

## Data and recovery
/data/, /public/data/ and /.local-data/ are ignored. GitHub is not a backup of those files. Inventory the approved Leeds package, staged regional release, database, raw-source snapshots and manifest hashes before promising recovery or reproducibility.
Use a new staging directory and release ID for rebuilds. Preserve original immutable releases and audit records. Verify manifests and object hashes. A new build is not the original release merely because counts match.
Do not infer no poll from a missing annual record, council composition from election winners, or historical geometry equivalence from a current/name-matched polygon. Keep secondary-source attribution and caveats visible. Forecast remains research until validated.

## Verification and release
Use relevant package validators plus npm run typecheck, npm run lint, npm run build and npm run build:vinext for code changes, following current repo commands. Browser-test the affected flow when data and an authorized environment are available. Record blocked checks honestly.
Preserve Leeds behavior as the regression fixture. Keep v2 production flags off until source, owner-access and release-control gates pass. Stage, validate, review, approve and activate are separate steps; uploading never implicitly approves a package.
Release work must retain package ID, manifest hash, code commit, source evidence, audit and rollback route. Verify owner/viewer API denial as well as UI visibility. Do not merge or activate during an audit task.

## Logs and hand-off
Update relevant Gate2, source audit, MVP and development logs only for work actually checked or published. Label staged, source-reviewed, locally tested and live-verified evidence explicitly. Record remaining blockers and next owner. Keep user explanations practical and beginner-friendly.
