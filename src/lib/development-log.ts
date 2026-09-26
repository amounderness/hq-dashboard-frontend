export type DevelopmentStage = {
  id: string;
  title: string;
  period: string;
  status: "In progress" | "Next" | "Planned" | "Later" | "Deferred";
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
      title: "Close the Leeds source gaps",
      period: "Now",
      status: "In progress",
      purpose: "Check the rejected Farnley & Wortley 2024 by-election declaration, the 15 historical vote differences, and the completeness of the by-election register. Keep uncertain records visibly flagged.",
      doneWhen: "Each issue has a recorded source decision; a corrected package passes validation and is published with a dated audit.",
    },
    {
      id: "viewer-pilot",
      title: "Run a small viewer pilot",
      period: "Next",
      status: "Next",
      purpose: "Invite a small group of named viewers to try the Explorer, SDP Results and Electoral Tribes explanations. Gather feedback on clarity, missing information and usability.",
      doneWhen: "Invited viewers complete agreed tasks, access and revocation are tested, and feedback is logged and prioritised.",
    },
    {
      id: "release-controls",
      title: "Build owner release controls",
      period: "Before routine data updates",
      status: "Planned",
      purpose: "Add owner-only import staging, validation differences, approval, activation, rollback and a durable audit trail. Test backup restore and role boundaries.",
      doneWhen: "An owner can review and reverse a test release through the interface, with the original sources and decisions traceable.",
    },
    {
      id: "reports",
      title: "Add reports and exports",
      period: "After viewer feedback",
      status: "Planned",
      purpose: "Create useful ward and council summaries from the approved package, with clear source dates, definitions and release version on every export.",
      doneWhen: "Pilot users can export the agreed summaries, and permissions and figures are checked against the on-screen view.",
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
      period: "After the Pulse MVP",
      status: "Deferred",
      purpose: "Keep historical tests available as research; prospective vote-share, seat and council-control projections need separate design and validation.",
      doneWhen: "Any future forecast has time-ordered tests, uncertainty and a clear publication decision before users rely on it.",
    },
  ] satisfies DevelopmentStage[],
  releases: [
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
