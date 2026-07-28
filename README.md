# Daily Garfield Comics PWA

A static Progressive Web App for browsing Garfield comic strips by date. Users can navigate decades of comics, switch between English and Spanish when supported, choose a comic source (the shipped UI default is GoComics), save favorites locally, import/export favorites, sync favorites with Google Drive, browse community favorites, share the current strip, support development through Stripe, and install the app.

> **Windows Native App**: The WinUI 3 desktop wrapper for Windows lives in a separate `GarfieldNative` repository and references this PWA as a sibling dependency for web assets.

## Core Files

- `index.html` - static app shell and metadata, including the `<symbol>` SVG icon sprite used by the toolbar.
- `main.css` - app styling and responsive/mobile layout.
- `init.js` - pre-DOM bootstrap: fullscreen state, service worker registration, update banner.
- `app.js` - main UI, navigation, favorites, sharing, settings, shuffle, and modals.
- `toolbar.js` - shared draggable-element helper used by the toolbar and settings panel.
- `comicExtractor.js` - comic-source and CORS-proxy fallback logic.
- `googleDriveSync.js` - Google Drive app-data sync for favorites/settings; injects Google Identity Services on demand.
- `serviceworker.js` - PWA app-shell, runtime, and image caching.
- `worker/index.js` - Cloudflare CORS proxy worker.
- `worker/favorites-api/index.js` - community favorites API worker.
- `tools/verify-assets.cjs` - deploy guard: every manifest/precache/tile reference must exist, and no image may be orphaned.

## Local Development

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
npm run test:assets
npm run test:unit
npm run test:e2e
npm run test:cross-browser
npm run test:lighthouse
npm run test:workers
```

For the full pre-deployment gate, run:

```powershell
npm run test:predeploy
```

`test:workers` checks live worker dependencies, so it requires network access and the deployed workers to be healthy.

Every push and pull request to `main` also runs syntax, asset, unit and Chromium E2E checks through `.github/workflows/ci.yml`.

## Deployment Notes

Primary production URL: `https://garfieldapp.pages.dev/`.

Before deploying to another origin, update these environment-specific surfaces:

- Search/social metadata, canonical link, `robots.txt`, `sitemap.xml`, and `sitemap.txt`.
- Google OAuth authorized JavaScript origins and `GOOGLE_AUTH_ALLOWED_ORIGINS` in `googleDriveSync.js`.
- `ALLOWED_ORIGINS` for `worker/favorites-api/wrangler.toml`.
- Any shared URLs intentionally shown to users.

The manifest uses relative `id`, `start_url`, and `scope` so PWA install/open behavior works at either a domain root or a subpath.

## Service Worker Versioning

Run `npm run bump:version` for every production change so users receive a fresh app shell; it keeps `package.json` and the `VERSION` constant in `serviceworker.js` in sync. The service worker treats the core shell as required and logs optional precache failures instead of silently leaving the update unexplained.

A new worker does **not** call `skipWaiting()` on install. It parks in `waiting` until the user accepts the in-app update banner, which posts `SKIP_WAITING`; `init.js` then reloads once on `controllerchange`. The settings footer reads the active worker's version by posting `GET_VERSION` over a `MessageChannel`.

Any new statically imported ES module must be added to both `PRECACHE_ASSETS` and `REQUIRED_PRECACHE_ASSETS` in `serviceworker.js`, or the app breaks on an offline first launch. `npm run test:assets` and the unit suite enforce this.

## Worker Configuration

The CORS proxy allowlist is configured through `worker/wrangler.toml` via `ALLOWED_HOSTS`.

The favorites API accepts its built-in production/local origins plus any comma-separated origins in `worker/favorites-api/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://garfieldapp.pages.dev,https://example.github.io"
```

Keep the Google OAuth client ID in `googleDriveSync.js` aligned with the validation client ID in `worker/favorites-api/index.js`.

Community rankings are public to read, but adding, removing, or migrating votes requires a verified Google access token issued for this app. Signed-out users can still manage favorites locally; those changes do not affect Top Favorites.

