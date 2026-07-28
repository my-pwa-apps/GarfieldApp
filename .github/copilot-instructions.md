# Garfield Comics PWA - AI Agent Instructions

## Workflow
**IMPORTANT**: Before implementing any code changes, always ask for confirmation first. Explain what you plan to do and wait for approval before making edits.

## Project Overview
Vanilla JavaScript Progressive Web App (PWA) for viewing daily Garfield comic strips in English and Spanish. No frameworks—pure HTML, CSS, and modular JavaScript with service worker caching.

## Architecture

### Module System
- **ES6 modules** via `type="module"` in HTML
- `app.js` imports from `comicExtractor.js` using `import { getAuthenticatedComic } from './comicExtractor.js'`
- `init.js` performs early bootstrap and fullscreen setup before the DOM is ready; the actual language detection runs in `initApp()` inside `app.js`
- All functions exposed globally via `window.FunctionName = FunctionName` pattern
- `package.json` sets `"type": "module"`, so every Node-executed CommonJS file uses `.cjs` (Playwright configs, `tests/**/*.spec.cjs`, `tests/support/*.cjs`, `tools/*.cjs`)

### Key Files & Responsibilities
- **`app.js`**: Main app logic—UI, navigation, settings, toolbar positioning, translations, rotation/fullscreen, favorites, shuffle, community leaderboard
- **`toolbar.js`**: `makeDraggable()` helper shared by the toolbar and the settings panel
- **`comicExtractor.js`**: Comic fetching with CORS proxy fallback system, performance tracking
- **`googleDriveSync.js`**: Google Identity sign-in and Drive appdata sync for favorites/preferences
- **`serviceworker.js`**: PWA caching (precache, runtime, image cache with LRU eviction)
- **`init.js`**: Fullscreen state, service worker registration and update banner—runs before DOM ready. Language detection happens in `initApp()` in `app.js`
- **`main.css`**: Single stylesheet with CSS custom properties, mobile-first responsive

### Comic Fetching Strategy
1. Multiple CORS proxies with performance stats (`comicExtractor.js`)
2. Fallback chain: Best proxy → Next proxy → Error with user-friendly message
3. GoComics URLs: `https://assets.amuniversal.com/[hash]`
4. Language: `'en'` or `'es'` passed to `getAuthenticatedComic(date, language)`

## Critical Patterns

### CONFIG Object (app.js top)
All magic numbers centralized in frozen `CONFIG`:
```javascript
const CONFIG = Object.freeze({
    SWIPE_MIN_DISTANCE: 50,
    GARFIELD_START_EN: '1978-06-19',
    GARFIELD_START_ES: '1999-12-06',
    STORAGE_KEYS: { FAVS: 'favs', SPANISH: 'spanish', LAST_DATE: 'lastdate', ... }
});
```

### UTILS Object (app.js)
Centralized helper functions—**always use these instead of inline code**:
```javascript
UTILS.getFavorites()           // Returns favorites array, never null
UTILS.isSpanishMode()          // Returns boolean for Spanish checkbox
UTILS.safeJSONParse(str, [])   // Safe JSON parse with fallback
UTILS.getOrCreateMessageContainer(className)  // For error/paywall messages
```

### Rotation & Fullscreen
Device-specific behavior in `initApp()`:
- **Mobile PWA**: Physical device rotation triggers fullscreen (screen.orientation API)
- **Mobile Browser**: Click comic to enter fullscreen with CSS rotation
- **Tablet/Desktop**: No rotation feature (already landscape-capable)
- `Rotate(applyRotation, clickToExit)` handles overlay creation and CSS transforms

### Touch Handling
Native touch events with rotation-awareness:
- `handleTouchStart()`, `handleTouchMove()`, `handleTouchEnd()` in app.js
- In rotated mode: Swipe Up→Next, Swipe Down→Previous (remapped)
- Prevents click-after-swipe with `lastSwipeTime` (300ms debounce)

### Draggable Elements
`makeDraggable(element, dragHandle, storageKey, options)` in `toolbar.js`:
- **Toolbar**: Vertical-only, always horizontally centered
- **Settings panel**: Full 2D dragging
- Position persistence via localStorage under `storageKey` (default `onDrop`)

## Development Workflow

### Service Worker Versioning
**CRITICAL**: Bump the deploy version with every change. Never hand-edit it — `package.json` and `serviceworker.js` must stay in sync:
```powershell
npm run bump:version
```

### Asset & Precache Guard
Any new statically imported ES module must be added to `PRECACHE_ASSETS` **and** `REQUIRED_PRECACHE_ASSETS` in `serviceworker.js`, or the app breaks offline. `npm run test:assets` enforces this alongside manifest/tile references, and also fails on orphaned image assets that nothing references.

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
const isSpanish = UTILS.isSpanishMode();

// ❌ Bad - duplicates code, unsafe
const favs = JSON.parse(localStorage.getItem('favs'));
const isSpanish = document.getElementById('spanish')?.checked;
```

### 2. Storage Keys
Always use `CONFIG.STORAGE_KEYS.*`, never hardcode strings.

### 3. Swipe + Click Conflicts
Check `lastSwipeTime` before handling clicks on comic:
```javascript
if (Date.now() - lastSwipeTime < 300) return;
```

### 4. Spanish Comic Availability
Try loading first, then handle failure:
```javascript
const success = await loadComic(date, true); // silentMode=true
if (!success) { /* handle unavailable */ }
```

## UI Conventions
- SVG icons (no text labels in toolbar)
- Tooltips via `title` + CSS animation
- Mobile: `@media (max-width: 768px)`
- CSS variables: `--primary-gradient`, `--toolbar-gradient`
- Touch: `@media (hover: none)` disables hover effects

## External Dependencies
- GoComics (via CORS proxies)
- Stripe hosted payment link
- No npm packages—pure vanilla JS

---
*Key patterns: UTILS helpers, CONFIG constants, device-specific rotation. Run `npm run bump:version` for the deploy version — never hardcode it in docs.*
