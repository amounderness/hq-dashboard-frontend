# Hosting and sign-in path

The candidate arrangement for 5–10 invited viewers is one Next.js web app behind Cloudflare Access, with private versioned packages in object storage. The site renders charts and maps from prepared records. Python processing remains local. The owner has a Cloudflare account; a purchased domain is not required for the private pilot.

The owner-only Worker is deployed at `https://switchboard-owner-preview.keenanrclough.workers.dev`. On 25 September 2026, Worker-level Access was enabled for all traffic, with an Allow policy for the owner's exact email, and the app's team domain and audience settings were configured. The owner completed a one-time-code sign-in. The Worker now serves immutable `leeds-public-results-v0.2.1` from a private R2 bucket. Browser checks confirmed the real Leeds map, Morley South 2025 by-election, source credits and aggregate historical Forecast tests. Signed-out requests for the page, Forecast API and favicon redirect to Access. Bucket public access is disabled. The site is a limited public-results pilot, not an operational campaign portal.

## Private test address without buying a domain

Use the Worker's `<worker>.<account>.workers.dev` address for the first private test. Cloudflare permits Access protection on that address and on preview URLs. Protect the **entire Worker**, selecting **All traffic**, so its pages, APIs, assets, and previews use the same policy. A custom domain can be considered later if the pilot becomes a sustained service.

For the first owner-only test, allow the owner's exact email address. Add each volunteer's exact email address only when that person is invited; do not use an email-domain or `Everyone` rule. Cloudflare account sign-in can serve existing account members. For volunteers without Cloudflare accounts, enable One-time PIN under Zero Trust > Integrations > Identity providers, then keep the Access **Allow** policy restricted to the individual addresses. The login method by itself does not restrict who is allowed.

The dashboard path for the eventual deployment is Workers & Pages > the Switchboard Worker > Access > **Protect this Worker behind Access** > **All traffic**. Zero Trust must first be enabled. Record the Access team domain and application audience for server configuration, without putting them in Git. Run an unauthenticated browser test before sending any volunteer a link.

## Required order

1. The limited Leeds release used a new immutable version after source comparison, explicit conflict disclosure, official ONS geometry and removal of unverified census data. Do not flip the flag on the original development package to bypass its gates.
2. The private R2 bucket and server-side reader serve the validated Leeds version. Release files were read back and hash-checked before the `active.json` pointer was switched. Keep a known-good previous pointer for rollback.
3. Protect the entire Worker with Cloudflare Access, including previews and the `workers.dev` address. Restrict its Allow policy to invited email addresses. Record the Access team domain and application audience as server-only settings.
4. Continue testing in this private environment. Unauthenticated page, API and asset denial and owner viewer access passed. Revoked-user denial, package rollback and backup restore remain to be exercised.
5. Compare the actual monthly bill and any tax or currency conversion with the £25 ceiling before committing to the live pilot. Domain cost is zero while using `workers.dev`.

The code verifies Access JWT signatures, issuer and audience for production requests. This does not yet enforce different role or dataset permissions: every account in the Access app would have the same viewer scope. Add server-side role checks before any restricted datasets or upload features are enabled.

Cloudflare documents Access protection for Workers and a free Workers tier. The app now uses vinext for deployment and the Worker R2 binding for private package reads. Provider choices can change if compatibility, cost or security checks warrant it.

References: [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/), [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
