# Garfield Comics PWA - AI Agent Instructions

## Workflow
**IMPORTANT**: Before implementing any code changes, always ask for confirmation first. Explain what you plan to do and wait for approval before making edits.

## Project Overview
Vanilla JavaScript Progressive Web App (PWA) for viewing daily Garfield comic strips in English and Spanish. No frameworks—pure HTML, CSS, and modular JavaScript with service worker caching.

## Architecture

### Module System
- **ES6 modules** via `type="module"` in HTML
- `app.js` imports from `comicExtractor.js` using `import { getAuthenticatedComic } from './comicExtractor.js'`
- `init.js` runs before DOM load for language detection
- All functions exposed globally via `window.FunctionName = FunctionName` pattern

### Key Files & Responsibilities
- **`app.js`** (~2900 lines): Main app logic—UI, navigation, settings, draggables, translations, rotation/fullscreen
- **`comicExtractor.js`**: Comic fetching with CORS proxy fallback system, performance tracking
- **`serviceworker.js`**: PWA caching (precache, runtime, image cache with LRU eviction)
- **`init.js`**: Language detection and fullscreen management—runs before DOM ready
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
- `Rotate(applyRotation)` handles overlay creation and CSS transforms

### Touch Handling
Native touch events with rotation-awareness:
- `handleTouchStart()`, `handleTouchMove()`, `handleTouchEnd()` in app.js
- In rotated mode: Swipe Up→Next, Swipe Down→Previous (remapped)
- Prevents click-after-swipe with `lastSwipeTime` (300ms debounce)

### Draggable Elements
`makeDraggable(element, dragHandle, storageKey)`:
- **Toolbar**: Vertical-only, always horizontally centered
- **Settings panel**: Full 2D dragging
- Position persistence via localStorage

## Development Workflow

### Service Worker Versioning
**CRITICAL**: Bump `VERSION` in `serviceworker.js` with every deployment:
```javascript
const VERSION = 'v1.2.7';  // Current version - increment on changes
```

### Testing Locally
No build step. Any HTTP server works:
```powershell
python -m http.server 8000
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
- Ko-fi widget (CDN loaded)
- No npm packages—pure vanilla JS

---
*Service Worker v1.2.7 | Key patterns: UTILS helpers, CONFIG constants, device-specific rotation*
