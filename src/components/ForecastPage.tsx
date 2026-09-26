"use client";

type Backtest = {
  status: string;
  model: string;
  exclusions: string;
  evaluated_wards: number;
  warning: string;
  by_year: Record<string, {
    single_seat_wards: number;
    models: Record<string, { mean_total_variation: number; winner_accuracy: number }>;
  }>;
};

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function ForecastPage({ backtest, error, demo }: { backtest: Backtest | null; error: string | null; demo: boolean }) {
  return <>
    <div className="eyebrow">Switchboard / research</div><h1>Forecast</h1>
    <p className="muted research-intro">Forecast is being developed to estimate party vote shares in future local elections. The figures below are retrospective tests against elections that have already happened. They are not a prediction for 2027.</p>
    <div className="notice"><strong>Current status:</strong> historical benchmark only. The published Explorer and Pulse results describe recorded elections; no prospective Forecast output is available for campaign decisions.</div>
    <div className="research-grid">
      <section className="card"><h2>What is tested now</h2><p>A simple benchmark carries a ward&apos;s last recorded party shares forward. The test uses only earlier results to estimate a later election, then compares that estimate with the actual vote shares. This gives us a baseline that any future model needs to improve on.</p></section>
      <section className="card"><h2>How development will proceed</h2><p>We will test each proposed model on held-out election years, inspect errors separately by party and place, and check whether uncertainty ranges cover the observed results. Repeated simulations with plausible variation may help describe a range of outcomes; that method has not yet been built or validated.</p></section>
    </div>
    <section className="card forecast-results"><h2>Historical benchmark</h2>
      {demo ? <p>The fictional preview has no model tests.</p> : error ? <p role="alert">Unable to load historical tests: {error}</p> : !backtest ? <p role="status">Loading historical tests…</p> : <>
        <p>{backtest.evaluated_wards} single-seat ward polls were tested. “Average share error” is total variation: half the sum of absolute differences between predicted and actual party vote shares, averaged over the tested wards. It is a descriptive score for this benchmark, not a promise of future accuracy.</p>
        <div className="table-wrap"><table className="results-table"><thead><tr><th>Election</th><th>Wards</th><th>Average share error</th><th>Winner correct</th></tr></thead><tbody>
          {Object.entries(backtest.by_year).map(([year, result]) => <tr key={year}><td>{year}</td><td>{result.single_seat_wards}</td><td>{pct(result.models.last_ward.mean_total_variation)}</td><td>{pct(result.models.last_ward.winner_accuracy)}</td></tr>)}
        </tbody></table></div>
        <p className="notice">{backtest.warning}</p><p className="footnote">{backtest.exclusions}</p>
      </>}
    </section>
    <section className="card forecast-next"><h2>Planned Forecast outputs</h2><p>The first prospective output would be party vote-share ranges with a clear election date, data cut-off, method, backtest record and uncertainty. We will agree how accuracy is measured, including differences between parties, before setting a numerical target. Later work may turn vote shares into vote counts, seat ranges and council-control scenarios; those need their own assumptions and checks.</p></section>
  </>;
}
