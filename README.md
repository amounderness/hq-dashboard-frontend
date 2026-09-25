# Switchboard: Leeds Explorer

This is the first working website slice inside the existing `hq-dashboard-frontend` Git repository. It keeps the original repository history and remote. The previous dashboard starter files that are not used by the new Explorer remain in place for now.

The app runs **locally** with the prepared Leeds package. Its map, ward search, year selector, result panel, table, Overview and Data & sources views use the real package. A separate Cloudflare Worker build can show **clearly labelled fictional data** for an owner-only interface trial. The real Leeds package is not in that build. Forecast, report export, saved views, owner publication and role administration are still outstanding.

## Run it locally

1. Open the `hq-dashboard-frontend` folder in VS Code.
2. Open **Terminal → New Terminal**. Check that Node.js 22 is available: `node --version`.
3. Install the recorded dependencies: `npm ci`. If your `npm` command is broken, run `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" ci` instead.
4. Copy `.env.example` to `.env.local` in the same folder. Set `SWITCHBOARD_PACKAGE_DIR` to the absolute path of the `leeds-local-elections-v0.1.0` folder, which contains `manifest.json`. Keep the `SWITCHBOARD_ALLOW_LOCAL_UNAUTHENTICATED=true` setting only for local development.
5. Run `npm run dev -- --hostname 127.0.0.1`. Open `http://127.0.0.1:3000` in a browser. If port 3000 is busy, Next.js will show its chosen port in the terminal.
6. Choose **2025**, search for **Morley South**, and confirm it shows the June by-election with unavailable turnout. Switch to **Table**, choose another ward, and confirm that the map returns to that ward.

The app reads the package from outside the Git repository. `.env.local`, generated output and local data folders are ignored by Git. Do not move the package into `public/` or commit it while the package's publication and licence checks remain open.

To test the synthetic mode locally, set `SWITCHBOARD_DEMO_MODE=true` in `.env.local` and restart the development server. The map and results will switch to three invented wards. Set it back to `false` for the local Leeds package.

## Code checks

From the same terminal, run `npm run lint`, `npm run typecheck`, then `npm run build`. The dependency lockfile is committed. The package was developed against Next.js 16.3.6 and React 19.3.0; run security updates before a live release.

## Sign-in and hosting

Production requests require a valid Cloudflare Access JWT with the configured application audience. When `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are absent, pages and API requests return HTTP 503; invalid or missing tokens are denied. The development bypass works only on localhost in development when explicitly enabled. Put Access in front of the entire deployed application, including assets and previews, and allow only invited email accounts. The server still verifies the JWT. This implementation provides a defensive gate but does **not** create or configure a Cloudflare account, an invite list or a login service.

The current package loader uses a local filesystem path, so it is a **development adapter**. The Cloudflare build uses `SWITCHBOARD_DEMO_MODE=true` and contains only fabricated records. Its `workers.dev` URL is protected by a Worker-level Access policy allowing only the owner's email address; the app also verifies Access JWTs using the public team domain and audience identifiers in `wrangler.jsonc`. Before serving real records, implement a private object-storage adapter and publish only a versioned package that has passed its release gates. The application must never serve the current Leeds package in production because its manifest has `publication_allowed=false`.

See [hosting and release plan](docs/hosting-and-release.md) and [MVP status](docs/mvp-status.md). The original Switchboard specification and Leeds readiness report remain in the separate project workspace.
