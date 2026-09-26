export type DevelopmentStage = {
  id: string;
  title: string;
  period: string;
  status: "Completed" | "In progress" | "Next" | "Planned" | "Later" | "Deferred";
  purpose: string;
  doneWhen: string;
};

export type DevelopmentRelease = {
  date: string;
  title: string;
  category: "Website" | "Data release" | "Research";
  summary: string;
  recordUrl?: string;
};

// Update this record with each published website or data release. Keep future
// work in stages until it has actually shipped and passed its release checks.
export const developmentLog = {
  reviewedOn: "2026-09-26",
  stages: [
    {
      id: "leeds-quality",
      title: "Close Leeds source gaps and clarify Forecast",
      period: "Pilot foundation",
      status: "Completed",
      purpose: "Publish both recorded by-elections with source labels, close the four historical vote-source choices, reconcile events against the council's published archive, and explain Forecast's research status.",
      doneWhen: "The pilot package passes validation; each chosen source, remaining caveat and event check is visible in results, exports and a dated audit.",
    },
    {
      id: "release-controls",
      title: "Build owner release controls",
      period: "Pilot foundation",
      status: "Completed",
      purpose: "Give the owner immutable package staging, hash and election validation, reviewable differences, approval, activation, rollback and an audit trail.",
      doneWhen: "A live checked release can be activated, rolled back and restored through the owner screen; unsigned requests remain behind Access.",
    },
    {
      id: "reports",
      title: "Add reports and exports",
      period: "Pilot foundation",
      status: "Completed",
      purpose: "Create useful ward and council summaries from the approved package, with clear source dates, definitions and release version on every export.",
      doneWhen: "Ward, composition and SDP summaries can be printed or exported as CSV with package, source and quality context; figures match the published views.",
    },
    {
      id: "viewer-pilot",
      title: "Run a small viewer pilot",
      period: "Next",
      status: "Next",
      purpose: "Invite a small group of named viewers to try the Explorer, SDP Results, Electoral Tribes, reports and exports. Gather feedback on clarity, missing information and usability.",
      doneWhen: "Invited viewers complete agreed tasks, access and revocation are tested, and feedback is logged and prioritised.",
    },
    {
      id: "coverage",
      title: "Expand beyond Leeds",
      period: "Later",
      status: "Later",
      purpose: "Add further areas and election tiers in stages, only after their results, boundaries, context data and release checks are ready.",
      doneWhen: "Each new area has a documented source audit, validated package and viewer-tested presentation.",
    },
    {
      id: "forecast",
      title: "Develop Forecast models",
      period: "After the Leeds pilot and expansion work",
      status: "Deferred",
      purpose: "Develop and backtest prospective party vote-share models, assess party-specific error and uncertainty, then investigate vote counts, seats and council control.",
      doneWhen: "Any future forecast has time-ordered tests, calibrated uncertainty and an agreed accuracy measure before users rely on it.",
    },
  ] satisfies DevelopmentStage[],
  releases: [
    {
      date: "2026-09-26",
      title: "Pilot landing page and party colours",
      category: "Website",
      summary: "The private site now opens on Overview when no page is specified. SDP uses its rose shade across maps and charts; Labour uses a deeper red so the two parties remain easier to distinguish.",
    },
    {
      date: "2026-09-26",
      title: "Viewer pilot preparation and page alignment",
      category: "Website",
      summary: "Moved short-page content to the top of the workspace and prepared a simple pilot task and feedback form plus an exact-email viewer invitation and revocation guide. Viewer invitations and the pilot itself remain to be tested.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/pilot-viewer-access.md",
    },
    {
      date: "2026-09-26",
      title: "Composition CSV numbers",
      category: "Website",
      summary: "Verified the downloaded latest-composition CSV against the approved 99-seat snapshot and changed the export so signed seat changes remain usable as numbers in spreadsheets.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/hosting-and-release.md",
    },
    {
      date: "2026-09-26",
      title: "Leeds Pulse v0.6.0 source decisions and seat context",
      category: "Data release",
      summary: "Closed four historical source-choice cases with cited council or Handbook figures, checked by-election coverage against the published council archive, and labelled seats filled per ward poll. Council composition now shows dated changes between saved snapshots, including vacancies and switches, without presenting them as election-only gains.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/leeds-source-decisions-v0.6.0-2026-09-26.md",
    },
    {
      date: "2026-09-26",
      title: "Leeds Pulse v0.5.0 and pilot release rehearsal",
      category: "Data release",
      summary: "Published the Farnley & Wortley 2024 by-election from a clearly labelled local secondary report and approximate Morley South 2025 turnout. Added both 2024 Farnley polls to the Explorer and reports. Validated 35 data objects, exercised owner approval, activation and rollback, and restored v0.5.0 as the live package.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/leeds-pulse-v0.5.0-audit-2026-09-26.md",
    },
    {
      date: "2026-09-26",
      title: "Forecast clarity, owner releases and reports",
      category: "Website",
      summary: "Reordered the six stages; clarified retrospective Forecast research; added a Leeds source-issue register, owner-only package release controls and three printable/CSV report views. Historical source gaps remain open and the active data package is unchanged.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/site-release-2026-09-26-stages-01-03.md",
    },
    {
      date: "2026-09-26",
      title: "Development plan and release log",
      category: "Website",
      summary: "Added a visible stage plan and dated release history to the private portal. The page distinguishes completed work from proposed features.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/site-release-2026-09-26.md",
    },
    {
      date: "2026-09-26",
      title: "Leeds Pulse v0.4.0",
      category: "Data release",
      summary: "Added dated council composition snapshots, a 99-seat chart, descriptive SDP result exploration and the Electoral Tribes research guide. Improved ward selection and expired sign-in recovery.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/leeds-pulse-v0.4.0-audit-2026-09-26.md",
    },
    {
      date: "2026-09-25",
      title: "Leeds Pulse v0.3.0",
      category: "Data release",
      summary: "Published audited 2021 Census ward aggregates and exploratory seven-group Electoral Tribes shares; improved map colours, ward highlighting and result context.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/leeds-pulse-release-audit-2026-09-25.md",
    },
    {
      date: "2026-09-25",
      title: "Audited Leeds results and retrospective tests",
      category: "Research",
      summary: "Published a limited Leeds election-results package and historical benchmark tests, with source disagreements and missing by-election results disclosed.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/leeds-release-audit-2026-09-25.md",
    },
    {
      date: "2026-09-25",
      title: "Private owner preview",
      category: "Website",
      summary: "Put the first Explorer online behind owner-only Cloudflare Access, then connected it to versioned private package storage.",
      recordUrl: "https://github.com/amounderness/hq-dashboard-frontend/blob/feature/switchboard-leeds-explorer/docs/hosting-and-release.md",
    },
  ] satisfies DevelopmentRelease[],
};
