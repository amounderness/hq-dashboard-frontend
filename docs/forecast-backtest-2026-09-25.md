# Leeds Forecast baseline audit · 25 September 2026

`tools/backtest_leeds.py` tests three simple baselines that Switchboard created for research; the project did not previously contain a finished Forecast model. Each held-out, scheduled, single-seat ward poll is predicted using only results dated before that poll: the latest result in that ward, the latest citywide result, or their fixed 50:50 average. Vote share means candidate votes divided by all candidate votes. By-elections and multi-seat contests are excluded. No future candidate slate, poll, census, private campaign data or other future result is used.

The first published run had a party-identity error. Source years abbreviate local parties differently, for example `MORL IND`/`MBI`/`MBOR IND`/`MB IND` and `GARF IND`/`G & S IND`/`G and S IND`. We now map those documented Handbook abbreviations to stable party names before scoring and display, while retaining original candidate source labels. The old numbers must not be cited. Mean share error below is total variation: 0 is exact, 1 is maximally wrong. Winner accuracy is the share of single-seat polls whose highest predicted party matched the actual highest party; it is not a seat-count forecast.

| Held-out election | Wards | Prior ward share error | Prior ward winner accuracy | 50:50 share error | Citywide share error | Votes for parties absent from prior ward |
|---|---:|---:|---:|---:|---:|---:|
| 2022 | 31 | 0.098 | 83.9% | 0.188 | 0.318 | 0.8% |
| 2023 | 32 | 0.098 | 87.5% | 0.169 | 0.306 | 1.5% |
| 2024 | 33 | 0.085 | 87.9% | 0.174 | 0.308 | 3.0% |
| 2026 | 30 | **0.321** | **60.0%** | 0.362 | 0.453 | **18.3%** |

Across all 126 tests, the prior-ward baseline has mean share error 0.148 and winner accuracy 80.2%. That aggregate hides the sharp 2026 failure. In the tested 2026 wards, Reform UK took an average 22.1% of votes, versus 1.2% in the prior-ward baseline; the Green average rose from 17.9% to 25.0%. Of the 12 incorrectly predicted winners in 2026, five were Reform UK and five Green. Party-entry and political shifts therefore need explicit modelling. Even with corrected identities, a simple carry-forward model is not suitable as a validated 2027 forecast.

## Next model gates

1. Establish an as-of-date input ledger: exact publication time and source for each historic result, candidate list, party presence, polling signal and demographic feature. Prevent later information from entering earlier backtests. Define 2027 pre-nomination and post-nomination forecast versions separately.
2. Build time-ordered holdouts across more councils and election cycles. Compare every challenger with the corrected prior-ward baseline, including party-share error, winner calibration and performance by party, ward type and year. Report uncertainty and zero/absent-party handling. Use 2026 as a stress test, not a tuned training target.
3. Start with aggregate ward-level features: candidate/party presence, prior local result, citywide and regional swing, incumbency when sourced, and geography. Evaluate census and Electoral Tribe inputs only after lineage, licence and historical availability are established. Avoid individual voter records.
4. Pre-register a 2027 freeze date and method. Publish prospective ward shares only after independent holdouts show a material and repeatable gain. Derive seat counts and council control only from calibrated contest-level probabilities, with separate evaluation.
5. After 6 May 2027, preserve the frozen predictions, ingest certified results, and score the same metrics plus uncertainty coverage and seat outcomes. Record deviations and missing races explicitly.

Leeds City Council lists the next scheduled election as **6 May 2027** and a Calverley and Farsley by-election for **22 October 2026**. The latter is not in this release; its future result must not enter any pre-poll forecast. Source: https://www.leeds.gov.uk/elections/leeds-city-council-elections .

To reproduce: run `python tools/backtest_leeds.py <development-package> forecast-research`, then `python tools/test_backtest_leeds.py`. `report.json` contains input SHA-256 hashes and the complete party-alias mapping; detailed ward predictions stay local. The owner-only site displays the aggregate historical figures, labelled retrospective.
