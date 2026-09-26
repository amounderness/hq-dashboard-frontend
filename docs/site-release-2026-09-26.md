# Switchboard website release · 26 September 2026

This website-only update adds **Development & releases** to the private Leeds portal. It shows a six-stage plan with status and completion checks, plus a dated log of published site, data and research milestones. The Overview links to it. Future entries are maintained in `src/lib/development-log.ts` with each published website or data release. The page explicitly describes itself as an editorial record, not a live activity feed. No Leeds data package, Cloudflare Access policy or Forecast model changed; the active package remains `leeds-pulse-v0.4.0`.

The same change replaces a stale README that described the fictional preview as the live setup, and adds the Development page to the MVP status document.

Validation: lint passed; the Next.js build regenerated stale route types and passed; typecheck then passed; the Cloudflare Worker build passed. Local browser checks confirmed the roadmap, release entries, current package label and links back to Explorer and Data & sources. Final Worker version `0fa66e91-382c-4577-a594-c25df2c13afb` was deployed. The signed-in live page showed the new plan and release log, while signed-out page, package API and favicon requests all redirected to Cloudflare Access with HTTP 302. No storage pointer was changed.
