# Switchboard · Leeds Pulse pilot

Switchboard is a private Leeds electoral information portal. The live owner preview is at [switchboard-owner-preview.keenanrclough.workers.dev](https://switchboard-owner-preview.keenanrclough.workers.dev/) behind Cloudflare Access. Its Explorer, SDP Results, Electoral Tribes and Development pages read prepared information; they do not run new election models when a viewer opens a page. The current private data package is `leeds-pulse-v0.4.0`. Forecast contains retrospective research only.

The repository contains the website, package builders and audit documents. Validated Leeds release files are kept in private R2 storage and in the local audit workspace, not in Git. The original `leeds-local-elections-v0.1.0` development package remains unpublished.

## Run the site locally

1. Open the `hq-dashboard-frontend` folder in VS Code.
2. Open **Terminal → New Terminal** and check Node.js: `node --version`. This project uses Node.js 22.
3. Install the recorded dependencies with `npm ci`.
4. Copy `.env.example` to `.env.local`. To see fictional sample data, set `SWITCHBOARD_DEMO_MODE=true`. To inspect the factual Leeds package locally, set it to `false` and set `SWITCHBOARD_PACKAGE_DIR` to the absolute path of a validated release folder containing `manifest.json`, for example the locally staged `leeds-pulse-v0.4.0` release. Keep `SWITCHBOARD_ALLOW_LOCAL_UNAUTHENTICATED=true` only for localhost development.
5. Run `npm run dev -- --hostname 127.0.0.1`, then open the local address printed in the terminal. If port 3000 is busy, use the port Next.js reports.
6. Open **Development** to see the stage plan and release log. For a factual package, select a ward and change Election view between 2024 and Latest recorded; the map and ward detail should both update. Open **Composition** to see the separate dated council snapshot.

The Development page also has a shareable address: append `#development` to the site's URL. Cloudflare Access still checks the viewer before the page opens.

`.env.local`, local data and build output are ignored by Git. Do not put release files in `public/` or commit them. The fictional mode is for interface testing and is clearly labelled in the site.

## Check and publish a change

1. Run `npm run lint`, then `npm run build`, then `npm run typecheck` in the project terminal. The Next.js build regenerates route types that a local development run may have left stale.
2. Run `npm run build:vinext` for the Cloudflare Worker build. When changing package data, run the relevant Python release validator too.
3. Test the changed views in a browser and document any data or access limitations.
4. For a new factual package, follow the [publishing workflow](docs/leeds-publishing-workflow.md): validate, stage, approve, upload immutable objects, read them back, preserve the old pointer, then activate.
5. Update `src/lib/development-log.ts` whenever a website or data release is published. Record the date and actual changes in the release log; update stage status only when its completion check is met. Update the [MVP status](docs/mvp-status.md) and audit documents as needed.

The production Worker uses a private R2 binding and verifies Cloudflare Access JWTs. The whole Worker, including assets and APIs, is protected. Deployment configuration is in `wrangler.jsonc`; do not place Access credentials or private data in the repository. See [hosting and release](docs/hosting-and-release.md) and [private package storage](docs/private-package-storage.md) for the current setup and remaining access tests.
