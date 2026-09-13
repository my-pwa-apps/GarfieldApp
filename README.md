# Daily Garfield Comics PWA

A static Progressive Web App for browsing Garfield comic strips by date. Users can navigate decades of comics, switch between English and Spanish when supported, choose a comic source (the shipped UI default is GoComics), save favorites locally, import/export favorites, sync favorites with Google Drive, browse community favorites, share the current strip, support development through Stripe, and install the app.

> **Windows Native App**: The WinUI 3 desktop wrapper for Windows lives in a separate `GarfieldNative` repository and references this PWA as a sibling dependency for web assets.

## Core Files

- `index.html` - static app shell and metadata, including the `<symbol>` SVG icon sprite used by the toolbar.
- `main.css` - app styling and responsive/mobile layout.
- `init.js` - pre-DOM bootstrap: fullscreen state, service worker registration, update banner.
- `app.js` - main UI, navigation, favorites, settings, shuffle, and modals.
- [favorites.js](favorites.js) - canonical favorite schema and published-date validation for every client ingestion path.
- [comicPresentation.js](comicPresentation.js) - bounded image load/decode contract, required before committing a comic.
- [sharing.js](sharing.js) - Web Share, clipboard, and native-host sharing from an explicit committed comic snapshot.
- [translations.js](translations.js) - matching English and Spanish message dictionaries.
- [driveSyncState.js](driveSyncState.js) and [driveFavorites.js](driveFavorites.js) - favorite tombstones/merge and the serialized account-scoped Drive coordinator.
- `toolbar.js` - shared draggable-element helper used by the toolbar and settings panel.
- `comicExtractor.js` - comic-source and CORS-proxy fallback logic.
- `googleDriveSync.js` - Google Drive app-data sync for favorites/settings; injects Google Identity Services on demand.
- `serviceworker.js` - PWA app-shell, runtime, and image caching.
- `worker/index.js` - Cloudflare CORS proxy worker.
- `worker/favorites-api/index.js` - community favorites API worker.
- `tools/verify-assets.cjs` - deploy guard: every manifest/precache/tile reference must exist, and no image may be orphaned.

## Local Development

Use Node.js 22.19 or newer for the test and audit tools. The shipped browser app still has no runtime npm dependencies or build step.

```powershell
npm install
npm run serve
```

Open `http://127.0.0.1:8000/`.

The app has no build step. It is deployed as static files plus the two Cloudflare Workers.

`package.json` declares `"type": "module"`, so Node-executed CommonJS files (Playwright configs, `tests/support/*`, `tools/*`, and `tests/**/*.spec.cjs`) use the `.cjs` extension.

## Test Commands

```powershell
npm run test:syntax
npm run test:lint
npm run test:assets
npm run test:unit
npm run test:e2e
npm run test:cross-browser
npm run test:lighthouse
npm run test:first-visit
npm run test:workers
```

For the full pre-deployment gate, run:

```powershell
npm run test:predeploy
```

`test:workers` checks live worker dependencies, so it requires network access and the deployed workers to be healthy.

`test:first-visit` uses deterministic provider fixtures on desktop and mobile Chromium. It checks a decoded, visible comic and records separate startup, discovery, image load/decode, and first-display milestones. The first-display mark runs after two animation frames; it is a render-readiness approximation, not a browser paint metric. No timing data is sent to an analytics service.

`test:lighthouse` audits live providers and reports performance, accessibility, best practices, SEO, LCP, Speed Index, and captured first-comic marks. It fails if the trace never observes a decoded comic, even when the logo gives the page a good LCP score. A successful trace is followed by a separate cold, unthrottled mobile-emulation timing probe; those timings are not Lighthouse's modeled mobile timings. Provider errors remain failures, not fixture results.

Run `npm run test:lighthouse -- --strict-performance` to additionally enforce R15's LCP <3 seconds, Speed Index <5.8 seconds, and performance >=0.80 targets. Require three comparable cold passes before closing R15; a single fast run is not sufficient.

Every push and pull request to `main` also runs syntax, lint, asset, unit and Chromium E2E checks through `.github/workflows/ci.yml`.

New client feature modules must stay below 800 lines; the existing app has a temporary no-growth cap while the remaining extraction is tracked in [BACKLOG.md](BACKLOG.md#r14). Put favorite validation, presentation readiness, sharing, translations, and Drive state in their owning modules above, not back into the bootstrap/UI file. Keep browser globals enabled in the test lint environment because Playwright `page.evaluate` callbacks execute in the browser.

## Deployment Notes

Primary production URL: `https://garfieldapp.pages.dev/`.

Before deploying to another origin, update these environment-specific surfaces:

- Search/social metadata, canonical link, `robots.txt`, `sitemap.xml`, and `sitemap.txt`.
- Google OAuth authorized JavaScript origins and `GOOGLE_AUTH_ALLOWED_ORIGINS` in `googleDriveSync.js`.
- `ALLOWED_ORIGINS` for `worker/favorites-api/wrangler.toml`.
- Any shared URLs intentionally shown to users.

The manifest uses relative `id`, `start_url`, and `scope` so PWA install/open behavior works at either a domain root or a subpath.

## Search and IndexNow

The homepage is the only canonical indexable page currently listed in the sitemaps. Its language adapts to browser and saved preferences; do not add `hreflang` alternatives until distinct language URLs with appropriate initial HTML exist. Comic-date pages and their content permissions remain a separate publishing decision.

Verify the production URL-prefix property in Google Search Console and the site in Bing Webmaster Tools, then submit the existing sitemap. Repository verification tokens alone do not establish current account ownership. Preserve both Google verification methods until ownership has been checked.

[IndexNow](https://www.indexnow.org/documentation) notifies participating search engines about changed URLs; it is not advertising or a ranking guarantee. The verification file is [indexnow-key.txt](indexnow-key.txt). It is publicly served by design, not a Google, Bing, or Cloudflare account credential. Google does not currently participate in IndexNow.

Preview the homepage notification without making any network requests:

```powershell
npm run indexnow
```

After a meaningful homepage change has been deployed, use the **Notify IndexNow after publication** workflow from `main`. Enter the full published main-branch commit SHA. Leave `submit` unchecked to preview; explicitly enable it to notify. The workflow does not deploy anything or need account secrets, and does not run automatically on pushes or pull requests.

The submission command compares production bytes with the selected checkout's service worker, all precached app files, both sitemaps, robots file, and IndexNow key. Redirects, missing files, mismatches, or request failures prevent submission. This verifies the app payload, not a Cloudflare deployment ID; commits with identical deployed app files are indistinguishable. Prefer the Linux workflow to avoid local line-ending differences. Once those checks pass, only `https://garfieldapp.pages.dev/` is submitted. HTTP 202 means key validation is pending; neither 200 nor 202 guarantees indexing. Repeated retries on 429 are intentionally not automatic.

For an equivalent explicit submission from a clean checkout of the published revision:

```powershell
npm run indexnow -- --submit
```

Do not notify for documentation-only commits, assets, query-string settings, or unchanged URLs. A Pages deployment-success trigger can be added later once its production environment and revision signal are verified. The local implementation and dry-run checks do not publish the key or send notifications.

## Service Worker Versioning

Run `npm run bump:version` for every production change so users receive a fresh app shell; it keeps `package.json` and the `VERSION` constant in `serviceworker.js` in sync. The service worker treats the core shell as required and logs optional precache failures instead of silently leaving the update unexplained.

A new worker does **not** call `skipWaiting()` on install. It parks in `waiting` until the user accepts the in-app update banner, which posts `SKIP_WAITING`; `init.js` then reloads once on `controllerchange`. The settings footer reads the active worker's version by posting `GET_VERSION` over a `MessageChannel`.

Any new statically imported ES module must be added to both `PRECACHE_ASSETS` and `REQUIRED_PRECACHE_ASSETS` in `serviceworker.js`, or the app breaks on an offline first launch. `npm run test:assets` and the unit suite enforce this.

Comic bytes use a stable, bounded image cache across shell versions. A displayed comic enters the offline index only after a worker cache acknowledgment; entries without resident image bytes are removed before offline navigation.

## Drive Sync Release Check

The sync coordinator stores versioned add/remove records and keeps failed operations pending locally. Conditional updates require a server-provided ETag; it intentionally refuses an unguarded overwrite when no validator is available. Before releasing this protocol, verify Google Drive's real ETag/If-Match contract with two signed-in devices, including concurrent additions, deletion followed by stale-device reconnect, and first-file creation races. Automated conflict fixtures do not prove that external contract. Account changes during a request must never commit to the other account.

## Worker Configuration

Garfield's dedicated proxy is **garfieldapp-corsproxy**, deployed at https://garfieldapp-corsproxy.garfieldapp.workers.dev. Its deployment configuration pins the Garfield account and enables its workers.dev endpoint.

Deploy only this proxy with:

```powershell
npx wrangler deploy --config worker/wrangler.toml
```

The older `corsproxy` Worker at https://corsproxy.garfieldapp.workers.dev is shared with other apps and remains untouched for their clients and older installed Garfield versions. Do not rename this repository's Worker back to `corsproxy` or deploy over that shared service. New fetches and sharing use the dedicated endpoint; the image CSP retains the legacy origin for cached comics, and sharing translates legacy proxy URLs to the dedicated endpoint.

The dedicated Worker was deployed on September 7, 2026; Pages was not published as part of that operation. A September 13 production-browser check now confirms the homepage uses the dedicated proxy and decodes the English comic, so the endpoint migration is already live. Earlier comparisons found September 7 Spanish worked through the shared proxy but returned 403 through the dedicated proxy; April 29 Spanish returned 403 on both. Recheck Spanish parity on the current deployment and resolve any regression or explicitly accept it. Cache state and upstream variability have not been isolated as causes. The custom-user-agent health probe is not representative of successful browser reads. See R06 in [BACKLOG.md](BACKLOG.md#r06) for remaining validation requirements.

The CORS proxy allowlist is configured through `worker/wrangler.toml` via `ALLOWED_HOSTS`.

The favorites API accepts its built-in production/local origins plus any comma-separated origins in `worker/favorites-api/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://garfieldapp.pages.dev,https://example.github.io"
```

Keep the Google OAuth client ID in `googleDriveSync.js` aligned with the validation client ID in `worker/favorites-api/index.js`.

Community rankings are public to read, but adding, removing, or migrating votes requires a verified Google access token issued for this app. Signed-out users can still manage favorites locally; those changes do not affect Top Favorites.

