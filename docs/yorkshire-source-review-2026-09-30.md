# Yorkshire source review — 30 September 2026

This is a source-check record for a future Yorkshire release. It does not change or approve the immutable `explorer-v2-yh-2026-09-29-rc3` package.

## 2025 council-year coverage queue

The catalogue's `no_record_in_annual_source` means the secondary annual compilation has no row; it is **not** an assertion that no election occurred. This queue covers the 15 Yorkshire and Humber authorities in the pilot. “Unchecked” means the council's ordinary-election and by-election lists have not yet been reconciled here.

| Authority | rc3 2025 label | Official-event review as of 30 September |
| --- | --- | --- |
| Barnsley | No annual-source record | Ordinary poll not listed; by-election index has no 2025 entry. Exhaustiveness still to confirm. |
| Bradford | No annual-source record | Council calls 2025 a scheduled fallow year; unscheduled events still to check. |
| Calderdale | No annual-source record | **Skircoat council by-election found; missing from rc3.** |
| Doncaster | Secondary source staged | Candidate and event comparison unchecked. |
| East Riding of Yorkshire | No annual-source record | Unchecked. |
| Kingston upon Hull | No annual-source record | Unchecked. |
| Kirklees | No annual-source record | Unchecked. |
| Leeds | Partial by-election only | Audited separately in Leeds v0.6.0; check its release record. |
| North East Lincolnshire | No annual-source record | Unchecked. |
| North Lincolnshire | No annual-source record | Unchecked. |
| North Yorkshire | No annual-source record | Unchecked. |
| Rotherham | No annual-source record | Unchecked. |
| Sheffield | No annual-source record | Unchecked. |
| Wakefield | No annual-source record | Unchecked. |
| York | No annual-source record | Unchecked. |

## Barnsley Metropolitan Borough Council

The [council election-results index](https://www.barnsley.gov.uk/services/voting-and-elections/election-results/) lists ordinary local polls in 2021, 2022, 2023, 2024 and 2026, with no 2025 ordinary poll listed. Its by-election index lists Dodworth on 12 December 2024 and Penistone East on 20 August 2026, with no 2025 council by-election listed on the page when checked on 30 September 2026. The [council's election-types page](https://www.barnsley.gov.uk/services/voting-and-elections/types-of-elections/) says Barnsley moved to whole-council elections from May 2026, with 21 wards electing three councillors each every four years. The [council's transition notice](https://www.barnsley.gov.uk/media/usxn0rhj/changes-to-whole-council-elections.pdf) supports the change from elections by thirds.

The rc3 catalogue currently labels Barnsley 2025 `no_record_in_annual_source`. The official index is evidence that no ordinary council poll was listed for that year; it is stronger than the annual-source absence alone. Before changing coverage to a certified no-poll status, confirm the council index covers every relevant local council event in 2025 or obtain a direct council confirmation. Retain the page URL and access date with the decision. Do not treat the lack of an annual-source row as proof of no by-election for other councils.

The rc3 Barnsley 2026 package contains 21 ward contests and 63 elected places, three per contest. That structure matches the council's whole-council election description. The [council's 2026 results announcement](https://www.barnsley.gov.uk/news/barnsley-s-local-elections-results-2026-announced/) reports the 7 May poll, 188,414 electors, 70,182 voters, 37.25% turnout and resulting council composition of 42 Reform UK, 11 Labour, eight Liberal Democrats and two independents. These aggregate figures are cross-check targets; candidate-level votes and winners still require comparison with the council declarations before release approval.

## Calderdale Metropolitan Borough Council

The [council's election-results data portal](https://dataworks.calderdale.gov.uk/dataset/election-results-e1qn8) lists a **Skircoat Ward by-election on 8 May 2025**. The [council meeting's official return](https://calderdale.moderngov.co.uk/ieListDocuments.aspx?CId=172&MId=3416&Ver=4) confirms that Paul Hawkaluk was appointed as a Calderdale councillor for Skircoat. The [council dataset preview](https://www.data.gov.uk/dataset/9774f538-9be5-42fc-b679-004b70f4dfb1/election-results2/datafile/cd3cbf6a-aff4-4487-a62f-844135f7fc53/preview) identifies him as elected with 1,392 votes but labels its `ELECTION_TYPE` field `Parish`. **That field conflicts with the council's own meeting record and must not be used to classify this as a parish election.** The portal separately lists two parish/township contests on 6 February 2025. The rc3 catalogue labels Calderdale 2025 `no_record_in_annual_source`; that label is accurate as a description of the imported annual compilation, but the package is missing a known council by-election. Import and reconcile the full official Skircoat return in a new release candidate before treating 2025 Calderdale council coverage as complete. Keep the parish/township elections separate from the council result type.

The [council's boundary-review notice](https://new.calderdale.gov.uk/council/elections-and-voting/review-polling-districts-places-and-stations) describes 18 new wards for the May 2026 election, replacing the earlier 17-ward pattern. The present v2 map uses 2025 display boundaries. Check every 2026 ward-result link against an event-date boundary edition before presenting a 2026 Calderdale ward shape as exact.

## City of Bradford Metropolitan District Council

The [council's scheduled-elections page](https://www.bradford.gov.uk/your-council/elections-and-voting/scheduled-elections/) explicitly calls 2025 a fallow year for scheduled elections and says all 90 district seats were elected in May 2026. That page says the highest-voted elected candidate in each ward serves four years, the second serves two years, and the third serves one year, yielding one seat per ward due in May 2027. This term assignment matters for any current-seat or upcoming-contest view; winning an all-out 2026 seat does not imply every elected member remains in office until 2030. The [council's ward-map page](https://www.bradford.gov.uk/your-council/elections-and-voting/ward-maps/) confirms new ward boundaries took effect at the 7 May 2026 poll and provides access to pre-2026 boundaries. Use the correct dated shape for each result year. The scheduled-election statement does not, by itself, certify that no unscheduled 2025 by-election occurred; check the event list separately.

## Next source checks

Check each Yorkshire council's official ordinary-election and by-election event lists against the staged 2021–2026 coverage rows. For sampled result years, compare contest dates, ward names, candidate votes, elected flags and turnout with official declarations. Record any secondary-source substitution with a URL, access date and field-level caveat. Keep historical boundary matches separate from current 2025 display polygons.
