# Hosting and sign-in path

The candidate arrangement for 5–10 invited viewers is one Next.js web app behind Cloudflare Access, with private versioned packages in object storage. The site renders charts and maps from prepared records. Python processing remains local. This stays a proposal until a real account, domain and budget check exist.

## Required order

1. Resolve the package's source, boundary and redistribution checks. Produce a new immutable Leeds version with `publication_allowed=true` only after review. Do not flip the flag on the current archive to bypass its gates.
2. Create a private storage bucket for released packages. Add a server-side storage adapter so browsers receive only authorized selections. Keep the active manifest/version and a previous known-good version for rollback.
3. Create a Cloudflare Access application covering the entire Worker or hostname, including previews. Restrict its Allow policy to invited emails. Record the Access team domain and application audience as server-only settings.
4. Deploy first to a private test environment. Verify unauthenticated page, API and asset denial; viewer access; revoked-user denial; no public bucket endpoint; package rollback; and a backup restore.
5. Compare the actual monthly bill, domain cost and any tax or currency conversion with the £25 ceiling before committing to the live pilot.

The code verifies Access JWT signatures, issuer and audience for production requests. This does not yet enforce different role or dataset permissions: every account in the Access app would have the same viewer scope. Add server-side role checks before any restricted datasets or upload features are enabled.

Cloudflare documents Access protection for Workers and a free Workers tier. It currently recommends the beta vinext adapter for new Next.js-on-Workers integrations; test compatibility before adopting it for this existing Next.js app. A private storage binding would avoid public package URLs. These provider choices can still change if compatibility, cost or security checks warrant it.

References: [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Access application controls](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).
