# Hosting and sign-in path

The candidate arrangement for 5–10 invited viewers is one Next.js web app behind Cloudflare Access, with private versioned packages in object storage. The site renders charts and maps from prepared records. Python processing remains local. The owner has a Cloudflare account; a purchased domain is not required for the private pilot.

## Private test address without buying a domain

Use the Worker's `<worker>.<account>.workers.dev` address for the first private test. Cloudflare permits Access protection on that address and on preview URLs. Protect the **entire Worker**, selecting **All traffic**, so its pages, APIs, assets, and previews use the same policy. A custom domain can be considered later if the pilot becomes a sustained service.

For the first owner-only test, allow the owner's exact email address. Add each volunteer's exact email address only when that person is invited; do not use an email-domain or `Everyone` rule. Cloudflare account sign-in can serve existing account members. For volunteers without Cloudflare accounts, enable One-time PIN under Zero Trust > Integrations > Identity providers, then keep the Access **Allow** policy restricted to the individual addresses. The login method by itself does not restrict who is allowed.

The dashboard path for the eventual deployment is Workers & Pages > the Switchboard Worker > Access > **Protect this Worker behind Access** > **All traffic**. Zero Trust must first be enabled. Record the Access team domain and application audience for server configuration, without putting them in Git. Run an unauthenticated browser test before sending any volunteer a link.

## Required order

1. Resolve the package's source, boundary and redistribution checks. Produce a new immutable Leeds version with `publication_allowed=true` only after review. Do not flip the flag on the current archive to bypass its gates.
2. Create a private storage bucket for released packages. Add a server-side storage adapter so browsers receive only authorized selections. Keep the active manifest/version and a previous known-good version for rollback.
3. Protect the entire Worker with Cloudflare Access, including previews and the `workers.dev` address. Restrict its Allow policy to invited email addresses. Record the Access team domain and application audience as server-only settings.
4. Deploy first to a private test environment. Verify unauthenticated page, API and asset denial; viewer access; revoked-user denial; no public bucket endpoint; package rollback; and a backup restore.
5. Compare the actual monthly bill and any tax or currency conversion with the £25 ceiling before committing to the live pilot. Domain cost is zero while using `workers.dev`.

The code verifies Access JWT signatures, issuer and audience for production requests. This does not yet enforce different role or dataset permissions: every account in the Access app would have the same viewer scope. Add server-side role checks before any restricted datasets or upload features are enabled.

Cloudflare documents Access protection for Workers and a free Workers tier. It currently recommends vinext for Next.js-on-Workers integrations. A read-only `vinext check` on 25 September 2026 rated this app 83% compatible: it identified a required package `type: module` setting and a PostCSS plugin form that vinext can adapt. The existing local filesystem data loader also requires replacement with a private storage binding before Worker deployment. These provider choices can still change if compatibility, cost or security checks warrant it.

References: [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/), [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
