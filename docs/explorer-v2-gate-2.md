# Explorer v2: Gate 2 working plan and staging record

**Prepared:** 27 September 2026

**Gate 2 window:** 16 October–13 November 2026

**Status:** Local staging candidate. The live Leeds pilot is unchanged. This document does not approve publication of the regional results.

## What now works

- A canonical SQLite store indexes England's nine regions, 296 current local authorities, 21 separate county areas, 15 combined authorities, 6,826 2025 English wards, and 10,661 parish or non-civil-parished areas. Yorkshire and Humber has 15 authorities, 410 current wards, and 1,216 parish-area boundary records in local staging.
- Area identity is separate from dated boundary versions. The model can represent county and combined-authority membership, source-code aliases, historical wards without a current polygon, election events, contests, candidate results, source records, and authority-year coverage.
- Seven election categories are defined: council, parish, local-authority mayor, combined-authority mayor, London mayor, London Assembly constituency, and London Assembly list. Round and ballot-option tables allow future multi-round and party-list records. **Only council result ingestion and viewing are implemented today.** A defined type is not evidence that its historical results have been collected.
- The national local store has 17,670 council contests and 101,086 candidate records across 2021–2026. Of 835 council-year records in the pinned secondary database, 783 matched current English areas or explicit name aliases; 50 Scottish/Welsh 2022 records and two new Surrey authority records are quarantined for separate geography work. The store also retains the independently audited Leeds release, including its by-elections.
- The v2 pilot package releases **only Yorkshire and Humber**: 54 council-years, 1,278 contests and 7,809 candidate records. Six Leeds council-years come from the audited Leeds v0.6.0 release; 48 others are staged secondary-source records. Thirty-six Yorkshire and Humber council-years have *no record in the annual compilation*; that is not a statement that no ordinary poll or by-election occurred.
- The explorer shows England's regions with the eight non-pilot regions greyed out. Yorkshire and Humber opens to councils and current wards, with year selection, source links, status labels, candidate votes and explicit historical-boundary caveats. Unmapped historical wards remain selectable in a separate list but are not highlighted on the current map.
- The package has per-object SHA-256 checks, a verified manifest, a stable release ID and a local `staged_not_published` release record. The application reader also checks manifest and object hashes before serving an activated R2 package. The pilot feature flag is off in the live site.

## Source and interpretation rules

| Material | Edition or snapshot | Use | Important limit |
| --- | --- | --- | --- |
| [ONS regions](https://ckan.publishing.service.gov.uk/dataset/regions-december-2025-boundaries-en-bsc), [local authorities](https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_DEC_2025_Boundaries_UK_BSC/FeatureServer), [counties](https://ckan.publishing.service.gov.uk/dataset/counties-and-unitary-authorities-december-2025-boundaries-uk-bsc), [combined authorities](https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Combined_Authorities_December_2025_Boundaries_EN_BSC/FeatureServer) | December 2025 | Current-area catalogue and display boundaries | These polygons do not prove equivalence to older electoral boundaries. |
| [ONS wards](https://ckan.publishing.service.gov.uk/dataset/wards-may-2025-boundaries-uk-bsc-v2), [parish and non-parished areas](https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/PARNCP_DEC_2025_EW_BSC/FeatureServer) | Wards May 2025; parish-area layer December 2025 | Ward display and parish-area indexing | Parish geography is **not** a register of parish councils, wards or election events. |
| [Audited Leeds Pulse v0.6.0](leeds-source-decisions-v0.6.0-2026-09-26.md) | 2021–2026 | Leeds result records and by-elections | Preserve the release's candidate-level decisions and source caveats. |
| [Commons Library annual handbooks](https://commonslibrary.parliament.uk/2025-local-elections-handbook-and-dataset/) | 2021–2025 | Underlying annual source series | Direct workbook downloads were blocked by their host in this run; the imported rows were obtained from the attributed secondary compilation below, not independently re-imported from the workbooks. |
| [Democracy Club](https://democracyclub.org.uk/data_apis/data/) | 2026 | Underlying 2026 result source identified by the compilation | Candidate winners in the compilation can be recalculated from vote rank. Council declarations still need comparison. |
| [electionresults.uk pinned dataset](https://github.com/fsargent/electionresults.uk/blob/29f587a2e761357c34cb828b0204861d8ec1c015/data-export/results.sqlite) and [licensing notes](https://electionresults.uk/councils/data) | Repository commit `29f587a`; SHA-256 `941b75c76f9b448ce6d447a2d532f0f20d569b92df1a9daaed16f30d5709df7a` | Secondary council-result import | This is a compiled and transformed source, not a direct council return or a complete by-election register. Its 2026 source winner flag is not comparable to its recalculated winner field. Keep the attribution and licence review with any published release. |

The source register distinguishes a *record not found in the annual source* from a *confirmed no-election year*. No current-councillor composition or future forecast is inferred from these results. A source ward code is mapped to a 2025 ward only when the code matches, or when a unique name match is possible without a source code; the latter remains unverified. Thirty-two Yorkshire and Humber contest wards could not be linked safely to a 2025 shape. The full national store has 4,625 such unmatched source wards or divisions. Neither count should be silently resolved by a similar-looking name.

## Release workflow

The clean sequence is **ingest → validate → stage → review → approve → activate**. An active release pointer is a separate object, so a new build cannot replace what viewers see merely because files were uploaded. The current code prepares and validates packages; it does not yet provide the owner screen for approving and activating an Explorer v2 release in Cloudflare R2. Until that control and access test exist, keep `NEXT_PUBLIC_EXPLORER_V2_ENABLED` and `SWITCHBOARD_V2_ENABLED` disabled in production.

For a fresh local build, use a new empty staging directory rather than overwriting an existing audit. The commands below are run from the repository folder. `PATH_TO_LEEDS_RELEASE` means the already approved, local Leeds v0.6.0 package folder.

1. Run `python tools/explorer_v2/build_geography.py data/explorer-v2` to fetch and index the dated ONS regions, authorities and wards.
2. Run `python tools/explorer_v2/enrich_geography.py data/explorer-v2` to add counties, combined authorities, parish areas and their dated links.
3. Run `python tools/explorer_v2/import_leeds_release.py data/explorer-v2 PATH_TO_LEEDS_RELEASE` to verify and import the audited Leeds release.
4. Run `python tools/explorer_v2/fetch_annual_source.py data/explorer-v2` to download the pinned secondary results snapshot and verify its checksum.
5. Run `python tools/explorer_v2/import_annual_results.py data/explorer-v2` to import matched English council records; inspect `national-import-review.json` for unmapped records.
6. Run `python tools/explorer_v2/build_pilot_package.py data/explorer-v2` and then `python tools/explorer_v2/verify_pilot_package.py data/explorer-v2/pilot` to compile and check the Yorkshire and Humber release scope.
7. Run `python tools/explorer_v2/stage_release.py data/explorer-v2 explorer-v2-yh-YYYY-MM-DD-rcN` with a new ID. The immutable local copy and release audit row are staged, **not published**.

The working store, source downloads and release packages are under ignored `data/`; they are not placed in GitHub. The scripts, documentation, review rules and checks are versioned. To reproduce a particular release, retain its manifest hash, pinned raw-source hashes, the audited Leeds package and the code commit.

## Gate 2 exit checks and next work

| Check | Current position | Next action before wider viewer pilot |
| --- | --- | --- |
| National geography and dated relationships | Current ONS layers indexed; 2025 display edition only for most areas | Add 2021–2026 boundary editions and event-date crosswalks, especially redrawn wards and new authorities. |
| All local election types | Seven types and round/list tables modelled; only council ordinary results imported beyond Leeds | Implement generic import adapters for mayoral, parish and London Assembly results, with separate source and method rules. |
| Annual council results since 2021 | Matched English council records staged; secondary source and winner caveats visible | Compare sampled council declarations, resolve the two Surrey authority IDs and check the 4,625 national unmatched wards before any wider release. |
| By-elections and absence | Leeds audited; regional annual source is not exhaustive | Reconcile each pilot council's event list, mark verified no-poll years separately, and import missing by-elections. |
| Release safety | Checksummed package and local staging record pass | Add owner-only R2 staging, approval, activation and rollback controls; test protected assets and role visibility. |
| Explorer usability | Region → council → ward, year and source status work locally | Add council-tier filters, quick search, tested keyboard and narrow-screen behaviour, and faster map/record loading for larger regions. |
| February 2027 readiness | Yorkshire and Humber is the first expansion | Agree the councils campaigners need first, run source checks by priority, then release council/region slices incrementally instead of waiting until after the 2027 locals. |

**Gate 2 decision:** treat this as an early implementation and test asset, not a completed national product. The browser can use the staging package locally; the ongoing Leeds trial remains on its existing release until the regional source and release-control checks are completed.
