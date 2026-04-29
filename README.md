# Daily Garfield Comics PWA

A static Progressive Web App for browsing Garfield comic strips by date. Users can navigate decades of comics, switch between English and Spanish when supported, choose a comic source, save favorites locally, import/export favorites, sync favorites with Google Drive, browse community favorites, share the current strip, and install the app.

## Core Files

- `index.html` - static app shell and metadata.
- `main.css` - app styling and responsive/mobile layout.
- `app.js` - main UI, navigation, favorites, sharing, settings, shuffle, and modals.
- `comicExtractor.js` - comic-source and CORS-proxy fallback logic.
- `googleDriveSync.js` - Google Drive app-data sync for favorites/settings.
- `serviceworker.js` - PWA app-shell, runtime, and image caching.
- `worker/index.js` - Cloudflare CORS proxy worker.
- `worker/favorites-api/index.js` - community favorites API worker.

## Local Development

```powershell
npm install
npm run serve
```

Open `http://127.0.0.1:8000/`.

The app has no build step. It is deployed as static files plus the two Cloudflare Workers.

## Test Commands

```powershell
npm run test:syntax
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

## Deployment Notes

Primary production URL: `https://garfieldapp.pages.dev/`.

Before deploying to another origin, update these environment-specific surfaces:

- Search/social metadata, canonical link, `robots.txt`, `sitemap.xml`, and `sitemap.txt`.
- Google OAuth authorized JavaScript origins and `GOOGLE_AUTH_ALLOWED_ORIGINS` in `googleDriveSync.js`.
- `ALLOWED_ORIGINS` for `worker/favorites-api/wrangler.toml`.
- Any shared URLs intentionally shown to users.

The manifest uses relative `id`, `start_url`, and `scope` so PWA install/open behavior works at either a domain root or a subpath.

## Service Worker Versioning

Bump `VERSION` in `serviceworker.js` for every production change so users receive a fresh app shell. The service worker treats the core shell as required and logs optional precache failures instead of silently leaving the update unexplained.

## Worker Configuration

The CORS proxy allowlist is configured through `worker/wrangler.toml` via `ALLOWED_HOSTS`.

The favorites API accepts its built-in production/local origins plus any comma-separated origins in `worker/favorites-api/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://garfieldapp.pages.dev,https://example.github.io"
```

Keep the Google OAuth client ID in `googleDriveSync.js` aligned with the validation client ID in `worker/favorites-api/index.js`.

