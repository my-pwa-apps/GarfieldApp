# Garfield Comics PWA - AI Agent Instructions

## Workflow
**IMPORTANT**: Before implementing any code changes, always ask for confirmation first. Explain what you plan to do and wait for approval before making edits.

## Project Overview
Vanilla JavaScript Progressive Web App (PWA) for viewing daily Garfield comic strips. No frameworks—pure HTML, CSS, and modular JavaScript with service worker caching.

## Architecture

### Module System
- **ES6 modules** via `type="module"` in HTML; `index.html` loads `googleDriveSync.js` and `app.js` and `<link rel="modulepreload">`s every other module in the static graph
- `app.js` is the bootstrap: it imports feature modules and wires them to app-owned state with `configure…()` calls (`configureToolbarLayout`, `configureGestures`, `configureFavoritesApi`) placed after `UTILS` and before boot code
- Optional features load on first use with `import()` (currently `top10.js`)
- `init.js` performs early bootstrap, comic preload, and fullscreen setup before the DOM is ready
- Only a few globals are published for `googleDriveSync.js` and the native host (`window.UTILS`, `window.CONFIG`, `window.translations`, `window.showNotification`, sync preference hooks, `window.pictureUrl`). Do not add new `window.*` exports unless another script actually reads them
- `package.json` sets `"type": "module"`, so every Node-executed CommonJS file uses `.cjs` (Playwright configs, `tests/**/*.spec.cjs`, `tests/support/*.cjs`, `tools/*.cjs`)

### Key Files & Responsibilities
- **`app.js`**: Bootstrap and remaining UI glue—comic loading/navigation, date state, favorites, settings, shuffle, import/export, labels, install prompt
- **`config.js`**: Frozen `CONFIG` and the shared `safeJSONParse()`
- **`toolbarLayout.js`**: Toolbar placement, persisted positions, viewport clamping, rotation snapshot
- **`toolbar.js`**: `makeDraggable()` helper used by `toolbarLayout.js`
- **`settingsPanel.js`**: Settings dialog—centered modal + backdrop, accordion groups (one open at a time, last group remembered), focus trap/Escape
- **`dayFilter.js`**: "Days to show" preference (`all` / `sundays` / `no-sundays`), filter-aware date helpers (`stepToAllowedDate`, `snapToAllowedDate`, `randomAllowedDate`, `filterFavoritesByDay`), and `createForwardBoundaryTracker()`
- **`gestures.js`**: Tap/double-tap, swipe navigation, rotated/landscape fullscreen (`Rotate`, touch handlers)
- **`verticalComic.js`**: Tall-strip thumbnail and fullscreen view
- **`favoritesApi.js`**: Leaderboard votes, favorites migration, top list; **`top10.js`**: Top Favorites modal and browse mode (lazy); **`focusTrap.js`**: shared dialog focus helpers
- **`comicPresentation.js`**: Image load/decode contract, transitions (`transitionComicImage`), comic descriptions
- **`comicExtractor.js`**: Comic fetching via dedicated Cloudflare CORS proxy (`uClick` default → `Fandom` → `ArcaMax`)
- **`googleDriveSync.js`**: Google Identity sign-in and Drive appdata sync for favorites/preferences
- **`serviceworker.js`**: PWA caching (precache, runtime, image cache with LRU eviction)
- **`init.js`**: Early uClick preload, fullscreen state, service worker registration and update banner—runs before DOM ready
- **`main.css`**: Single stylesheet with CSS custom properties, mobile-first responsive

### Comic Fetching Strategy
1. Dedicated Cloudflare Worker CORS proxy (`garfieldapp-corsproxy.garfieldapp.workers.dev`)
2. Fallback chain: `uClick` (`picayune.uclick.com`, daily `.gif` / modern Sunday `.jpg`) → `Fandom Wiki` (`garfield.fandom.com` JSON API) → `ArcaMax` (last ~30 days) → Offline/bundled fallback
3. `getAuthenticatedComic(date, preferredSource, options)` in `comicExtractor.js`

## Critical Patterns

### CONFIG Object (config.js)
All magic numbers centralized in frozen `CONFIG`, imported with `import { CONFIG } from './config.js'`:
```javascript
const CONFIG = Object.freeze({
    SWIPE_MIN_DISTANCE: 50,
    GARFIELD_START_EN: '1978-06-19',
    STORAGE_KEYS: { FAVS: 'favs', LAST_DATE: 'lastdate', ... }
});
```

### UTILS Object (app.js)
Centralized helper functions—**always use these instead of inline code**:
```javascript
UTILS.getFavorites()           // Returns favorites array, never null
UTILS.getBrowsableFavorites()  // Favorites passing the "Days to show" filter (use for navigation)
UTILS.safeJSONParse(str, [])   // Safe JSON parse with fallback
UTILS.getOrCreateMessageContainer(className)  // For error/fallback messages
```

### Rotation & Fullscreen
Device-specific behavior in `initializeRotationGestures()` (`gestures.js`, called from `initApp()`):
- **Mobile PWA**: Physical device rotation triggers fullscreen (screen.orientation API)
- **Mobile Browser**: Click comic to enter fullscreen with CSS rotation
- **Tablet/Desktop**: No rotation feature (already landscape-capable)
- `Rotate(applyRotation, clickToExit)` handles overlay creation and CSS transforms

### Touch Handling
Native touch events with rotation-awareness:
- `handleTouchStart()`, `handleTouchMove()`, `handleTouchEnd()` in `gestures.js`
- In rotated mode: Swipe Up→Next, Swipe Down→Previous (remapped)
- Prevents click-after-swipe with `lastSwipeTime` (300ms debounce)

### Draggable Elements
`makeDraggable(element, dragHandle, storageKey, options)` in `toolbar.js`:
- **Toolbar**: Vertical-only, always horizontally centered
- Position persistence via localStorage under `storageKey` (default `onDrop`)
- The settings panel is **not** draggable; it is a centered modal (`settingsPanel.js`)

### Day Filter
Date navigation must go through `dayFilter.js` helpers rather than `setDate(±1)`: `stepToAllowedDate()` for Previous/Next, `getAllowedDateRange()` (app.js) for First/Last bounds, `randomAllowedDate()` for Random/Shuffle, and `UTILS.getBrowsableFavorites()` in favorites-only mode. Top Favorites browsing is intentionally unfiltered.

## Development Workflow

### Service Worker Versioning
**CRITICAL**: Bump the deploy version with every change. Never hand-edit it — `package.json` and `serviceworker.js` must stay in sync:
```powershell
npm run bump:version
```

### Asset & Precache Guard
Every module in the static import graph must be in `PRECACHE_ASSETS` **and** `REQUIRED_PRECACHE_ASSETS` in `serviceworker.js` (or the app breaks offline) and have a `<link rel="modulepreload">` in `index.html` (or the first comic loads a round trip later per import level). Modules loaded with `import()` go in `PRECACHE_ASSETS` only. `npm run test:assets` enforces this alongside manifest/tile references, and also fails on orphaned image assets that nothing references by exact path (platform icons included; intentional exceptions go in `RETAINED_UNREFERENCED_IMAGES` with a reason).

### Module Size
Client modules stay under 800 lines; `app.js` is capped at 2,750 (`tests/unit/module-boundaries.test.mjs`). Add features as cohesive modules wired with a `configure…()` call instead of growing `app.js`.

### Performance Measurement
`npm run test:first-visit:throttled` measures the client path under Lighthouse's mobile throttling over HTTP/2 with fixture providers. `npm run test:lighthouse` audits live providers on a local HTTP/1.1 origin (the proxy only allows plain-http loopback); use `-- --url https://garfieldapp.pages.dev/` for a deployed revision.

### Sitemap Maintenance
- We maintain both a static `sitemap.xml` and a `sitemap.txt` as a fallback for Search Console parsing bugs.
- Update `sitemap.xml` `<lastmod>` when a deployment includes a meaningful site change. Do not change it only to appear fresh.
- Only update `sitemap.txt` if new indexable pages are added.

### Service Worker Update Model
- Install does **not** call `skipWaiting()`. A new worker waits until the user accepts the update banner in `init.js`, which posts `{ type: 'SKIP_WAITING' }`; `init.js` reloads once on `controllerchange`.
- The settings footer reads the active worker's version via `postMessage({ type: 'GET_VERSION' })` over a `MessageChannel` — never by fetching and regex-scraping `serviceworker.js`.

### Icons
- Toolbar glyphs live once in the `<svg class="icon-sprite">` `<symbol>` block at the top of `index.html`.
- Markup and JS both reference them with `<use href="#icon-...">`; `TOOLBAR_ICONS` in `app.js` maps logical keys to sprite ids. Never inline a duplicate path.
- CSS cannot select into the `<use>` shadow tree — style icons through inherited `stroke`/`fill`/`color` on `.toolbar-svg`.

### Google Identity Services
- Loaded on demand by `googleDriveSync.js`, not as a `<script>` tag in `index.html`. Returning users get it during bootstrap; first-time visitors only when they press Sign in.

### Testing Locally
No build step. Any HTTP server works:
```powershell
npm run serve
```

### Deployment
Cloudflare Pages: `garfieldapp.pages.dev`
- Push to `main` → auto-deploy
- No build process—static files

## Common Pitfalls

### 1. Use UTILS Helpers
```javascript
// ✅ Good
const favs = UTILS.getFavorites();

// ❌ Bad - duplicates code, unsafe
const favs = JSON.parse(localStorage.getItem('favs'));
```

### 2. Storage Keys
Always use `CONFIG.STORAGE_KEYS.*`, never hardcode strings.

### 3. Swipe + Click Conflicts
Check `lastSwipeTime` before handling clicks on comic:
```javascript
if (Date.now() - lastSwipeTime < 300) return;
```

## UI Conventions
- SVG icons (no text labels in toolbar)
- Tooltips via `title` + CSS animation
- Mobile: `@media (max-width: 768px)`
- CSS variables: `--primary-gradient`, `--toolbar-gradient`
- Touch: `@media (hover: none)` disables hover effects

## External Dependencies
- uClick (`picayune.uclick.com`), Fandom Wiki, and ArcaMax (via dedicated Cloudflare CORS proxy)
- Stripe hosted payment link
- No npm packages—pure vanilla JS

---
*Key patterns: UTILS helpers, CONFIG constants, device-specific rotation. Run `npm run bump:version` for the deploy version — never hardcode it in docs.*
