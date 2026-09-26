# Leeds Pulse v0.4.0 release audit · 26 September 2026

This immutable release extends the audited `leeds-pulse-v0.3.0` package. All 33 prior data objects retain their hashes. Three new objects add council composition snapshots, a descriptive SDP results index, and the K7 interpretation key. There are 36 objects in total. No Forecast model or prospective prediction changes.

## Council composition

The chart shows 99 positions and is a **dated council snapshot**, not a count inferred from the most recent ward results. The 2021, 2022, 2023, 2024 and 2026 choices use [Leeds City Council's post-election releases](https://news.leeds.gov.uk/news/new-political-make-up-of-leeds-city-council-5) for those years. The “Latest recorded” choice uses the [council's composition page](https://www.leeds.gov.uk/councillors-and-democracy/councillors-and-committees), retrieved 26 September 2026: Labour 46, Conservative 14, Green 10, Reform UK 10, Liberal Democrat 6, Garforth & Swillington Independents 3, Morley Borough Independents 3, SDP 3, Independent 3, and one vacancy. It may change after that date. No verified full-council 2025 snapshot was found, so that selection explicitly says the composition is unavailable. Source URL and snapshot date travel with each view.

The historical sources are:

- [2021](https://news.leeds.gov.uk/news/new-political-make-up-of-leeds-city-council-1)
- [2022](https://news.leeds.gov.uk/news/new-political-make-up-of-leeds-city-council-2)
- [2023](https://news.leeds.gov.uk/news/new-political-make-up-of-leeds-city-council-3)
- [2024](https://news.leeds.gov.uk/news/new-political-make-up-of-leeds-city-council-4)
- [2026](https://news.leeds.gov.uk/news/new-political-make-up-of-leeds-city-council-5)

## SDP results and Electoral Tribes

The SDP index is generated from the same released candidate, party, contest and event records as the Explorer. It contains 76 SDP-contested ward polls and 78 SDP candidate rows across 2021–2026; the recorded wins across those polls total four. Its vote share is SDP **candidate votes / all candidate votes in a ward poll**. In a multi-seat poll that is not a share of voters. The year bars use unweighted ward-poll averages; changing candidate slates and contested wards prevents reading them as a like-for-like trend. Filters describe which published contests met a condition. They do not establish why a candidate performed well or predict future support.

The project's `k7_cluster_interpretation_key_v2.csv` supplies seven descriptive group profiles. The research compared K=5 through K=10 using distinctiveness, size, split lineage, geography and stability; it did not establish an optimal political model. Ward percentages are resident-weighted shares of Census output areas assigned to each group. They are not percentages of individual “voter types.” Existing SDP/group comparison research has incomplete candidate matching, so no party-correlation claim is published. The current site keeps the explanatory Research page separate from result filters.

## Unresolved result sources

The [official 10 October 2024 Farnley & Wortley declaration](https://datamillnorth.org/dataset/local-election-results-20jwj) still has zeroes for every candidate and no winner. Independent records, including [WhoCanIVoteFor](https://whocanivotefor.co.uk/elections/local.leeds.farnley-wortley.by.2024-10-10/farnley-wortley/) and [the local report](https://westleedsdispatch.com/farnley-wortley-by-election-result-green-partys-david-blackburn-retakes-seat/), corroborate a Green win and nonzero votes, but they do not repair the official declaration. The release continues to flag this poll as rejected, excludes its votes from charts, and does not treat missing data as zero. The 15 2021–2024 Commons Handbook versus council candidate-vote differences also remain open; four affected ward/year records carry visible notes. See the [previous election audit](leeds-release-audit-2026-09-25.md). The by-election register is not yet certified exhaustive.

## Checks and publication

`tools/test_leeds_pulse_v2.py` checks every object hash, all six 99-seat composition snapshots, source metadata, SDP rows against original candidate records, and the seven research profiles. Interactive local checks covered year switching with a selected ward, 2025 composition absence, current 99-seat composition, SDP filters and result drilldown. Typecheck, lint and the production Worker build passed. All 36 private R2 objects were downloaded again and hash-checked before `active.json` was switched. The previous v0.3.0 pointer was saved locally for rollback. Final Worker version `f449dca3-53c5-4df4-9116-0ed8d7878266` deployed successfully. Signed-out page, composition API, SDP API and favicon requests all redirected to Cloudflare Access with HTTP 302. The owner confirmed all three new pages load after a fresh sign-in. A signed-in live browser check also switched Farnley & Wortley from 2024 to Latest recorded, opened the 99-seat current composition, and confirmed that the 2025 composition displays its missing-snapshot explanation.

The browser's “Failed to fetch” after changing election years was reproduced when an already-open page's Cloudflare Access session had expired: the protected API request redirected to the sign-in page. The app now describes that state and offers “Reload and sign in,” so the entire page can navigate through Access again. This recovery must also be checked in the live protected Worker.
