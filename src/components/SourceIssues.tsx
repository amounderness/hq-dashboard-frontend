export default function SourceIssues() {
  return <section className="card source-issues"><h2>Leeds result issues still open</h2>
    <p>These issues affect historical completeness. They remain flagged in the published package and its exports; missing votes are never shown as zero.</p>
    <ul>
      <li><strong>Farnley &amp; Wortley, 10 October 2024:</strong> the <a href="https://datamillnorth.org/download/20jwj/7f3/Farnley%20%26%20Wortley%20ward%20by-election%20-%2010%20October%202024.pdf" target="_blank" rel="noreferrer">council-hosted declaration</a> has zeros for all candidates and names no winner. Independent accounts indicate a Green win, but an authoritative corrected result or formal council clarification is needed before publishing candidate votes here.</li>
      <li><strong>Fifteen candidate-vote differences:</strong> four ward/year contests in 2021, 2023 and 2024 differ between council archive files and the Local Elections Handbook. The release uses Handbook figures, corroborated by its published PDFs, and marks each affected contest. A council correction or explanation is still sought.</li>
      <li><strong>By-election coverage:</strong> the imported event register has not been certified exhaustive. “Latest recorded” means the newest result in this package for a ward, not a confirmed current councillor or complete election history.</li>
    </ul>
    <p className="footnote">Full record: <a href="https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/leeds-source-issues-2026-09-26.md" target="_blank" rel="noreferrer">Leeds source-issue register</a>. The next release should only change results after the source decision is recorded and the new package passes validation.</p>
  </section>;
}
