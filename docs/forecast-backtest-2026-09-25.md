# First Leeds Forecast backtest · research only

`tools/backtest_leeds.py` reads the local development package and writes `forecast-research/report.json` and `ward-predictions.json`. It uses only **scheduled, single-seat** ward contests. Every prediction for a held-out poll uses results dated strictly earlier than that poll. It does not use the future candidate slate, polls, demographics, a party intention survey, or any private voter record.

The fixed baselines carry forward the latest ward party vote-share distribution, carry forward the latest citywide distribution, or blend those two 50:50. A party absent from prior results receives zero. Shares use *all candidate-votes* as their denominator. The metric below is mean total-variation distance: 0 is an exact party-share forecast, 1 is maximally wrong. Winner accuracy asks whether the top predicted party matched the actual top party; it is not a seat-count model.

| Holdout | Eligible wards | Last ward: share error | Last ward: winner accuracy | 50:50 blend: share error | Citywide: share error |
|---|---:|---:|---:|---:|---:|
| 2022 | 31 | 0.138 | 74.2% | 0.209 | 0.321 |
| 2023 | 32 | 0.124 | 81.3% | 0.184 | 0.308 |
| 2024 | 33 | 0.124 | 78.8% | 0.196 | 0.310 |
| 2026 | 30 | **0.350** | **56.7%** | 0.380 | 0.455 |

Across 126 eligible ward elections, last-ward mean share error was 0.181 and winner accuracy 73.0%. The much weaker 2026 result is the key stress test. Multi-seat polls, by-elections and the 2025 fallow scheduled year are excluded; the sample is Leeds only. The tested baselines do not establish reliable 2027 projections, seat totals, or council control. The production Forecast view should continue saying *No published forecast* until a stronger model beats these baselines on further time-respecting holdouts and its source package passes release checks.

To rerun locally from the Switchboard workspace: `python switchboard-app/tools/backtest_leeds.py packages/leeds-local-elections-v0.1.0 switchboard-app/forecast-research`. Run `python switchboard-app/tools/test_backtest_leeds.py` for the metric and future-leakage checks. The report records SHA-256 hashes of all election inputs.
