"use client";

import { developmentLog } from "@/lib/development-log";

const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

export default function DevelopmentPage({ currentPackage, onExplore, onSources }: { currentPackage?: string; onExplore: () => void; onSources: () => void }) {
  return <>
    <div className="eyebrow">Switchboard / development</div><h1>Development &amp; releases</h1>
    <p className="muted development-intro">Follow what has been built, what is being checked, and what comes next for the Leeds pilot. This is an editorial record updated when a site or data release is published, not a live activity feed.</p>
    <div className="development-summary card"><div><span className="eyebrow">Current data package</span><strong>{currentPackage ?? "Loading…"}</strong></div><div><span className="eyebrow">Plan reviewed</span><strong>{dateLabel(developmentLog.reviewedOn)}</strong></div></div>
    <section className="development-section" aria-labelledby="development-stages"><div className="development-section-heading"><div><h2 id="development-stages">Planned stages</h2><p>Sequence and completion checks; target dates will be added when agreed.</p></div><button className="link-button" onClick={onExplore}>Open Explorer</button></div>
      <ol className="stage-list">{developmentLog.stages.map((stage, index) => <li className="card stage-card" key={stage.id}><div className="stage-top"><span className="stage-index">{String(index + 1).padStart(2, "0")}</span><div><span className="stage-period">{stage.period}</span><h3>{stage.title}</h3></div><span className={`stage-status stage-status-${stage.status.toLowerCase().replace(" ", "-")}`}>{stage.status}</span></div><p>{stage.purpose}</p><p className="stage-done"><strong>Complete when:</strong> {stage.doneWhen}</p></li>)}</ol>
    </section>
    <section className="development-section" aria-labelledby="release-log"><div className="development-section-heading"><div><h2 id="release-log">Release log</h2><p>Published changes, newest first. Proposed work stays in the plan above.</p></div><button className="link-button" onClick={onSources}>Data &amp; sources</button></div>
      <ol className="release-list">{developmentLog.releases.map(release => <li className="release-entry" key={`${release.date}-${release.title}`}><time dateTime={release.date}>{dateLabel(release.date)}</time><div className="release-content"><div className="release-title"><h3>{release.title}</h3><span className="release-category">{release.category}</span></div><p>{release.summary}</p>{release.recordUrl && <a href={release.recordUrl} target="_blank" rel="noreferrer">Read the release record</a>}</div></li>)}</ol>
    </section>
    <p className="footnote development-footer">The plan describes intended work, not a commitment that a feature is already available. Data gaps and research limits remain visible in Data &amp; sources.</p>
  </>;
}
