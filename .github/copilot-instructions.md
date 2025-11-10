# Garfield Comics PWA - AI Agent Instructions

## Project Overview
Vanilla JavaScript Progressive Web App (PWA) for viewing daily Garfield comic strips in English and Spanish. No frameworks—pure HTML, CSS, and modular JavaScript with service worker caching.

## Architecture

### Module System
- **ES6 modules** via `type="module"` in HTML
- `app.js` imports from `comicExtractor.js` using `import { getAuthenticatedComic } from './comicExtractor.js'`
- `init.js` runs before DOM load for language detection
- All functions exposed globally via `window.FunctionName = FunctionName` pattern

### Key Files & Responsibilities
- **`app.js`** (2000+ lines): Main app logic—UI interactions, navigation, settings, draggable elements, translations
- **`comicExtractor.js`**: Comic fetching with CORS proxy fallback system, authentication handling
- **`serviceworker.js`**: PWA caching strategy (precache assets, runtime cache, image cache with LRU eviction)
- **`init.js`**: Language detection and fullscreen management—runs before DOM ready
- **`auth.js`**: Empty placeholder for future authentication features
- **`main.css`**: Single stylesheet with CSS custom properties and mobile-first responsive design

### Comic Fetching Strategy
1. Try multiple CORS proxies in order (`comicExtractor.js` maintains proxy performance stats)
2. Fallback chain: Best proxy → Next proxy → Final proxy → Error
3. GoComics URLs: `https://assets.amuniversal.com/[hash]` for English, Spanish has separate endpoint
4. Language parameter: `'en'` or `'es'` passed to `getAuthenticatedComic(date, language)`

## Critical Patterns

### Configuration Object
All magic numbers centralized in `CONFIG` frozen object at top of `app.js`:
```javascript
const CONFIG = Object.freeze({
    SWIPE_MIN_DISTANCE: 50,
    GARFIELD_START_EN: '1978-06-19',
    GARFIELD_START_ES: '1999-12-06',
    STORAGE_KEYS: { FAVS: 'favs', SPANISH: 'spanish', ... }
});
```

### Touch Handling (Native Implementation)
- **DirkJan-style swipe detection** using native touch events (replaced `swiped-events` library)
- Rotation-aware: In rotated mode (90° clockwise), swipe directions map differently:
  - Swipe Up → Next comic (visually moves right)
  - Swipe Down → Previous comic (visually moves left)
- Prevents click-after-swipe with `lastSwipeTime` tracking (300ms debounce)
- See `handleTouchStart()`, `handleTouchMove()`, `handleTouchEnd()` in `app.js`

### Draggable UI Elements
`makeDraggable(element, dragHandle, storageKey)` function handles both toolbar and settings panel:
- **Toolbar**: Vertical-only dragging, always horizontally centered (saved position = `{ top }` only)
- **Settings panel**: Full 2D dragging (saved position = `{ top, left }`)
- Auto-reset when toolbar dragged to default zone (between logo and comic)
- Storage keys distinguish behavior: `'toolbarPosition'` vs `'settings_pos'`

### Translation System
- `translations` object with `en` and `es` keys in `app.js`
- `translateInterface(lang)` updates all UI elements (button tooltips, labels, aria-labels)
- Icon buttons (Settings, Share, Favorites) identified by `onclick` attribute matching
- Called on Spanish checkbox toggle and page load

### Date Handling
- Spanish comics: Start Dec 6, 1999; Sundays often unavailable (check actual availability)
- English comics: Start Jun 19, 1978
- When switching to Spanish, attempt to load comic—if fails, switch to today with notification
- `currentselectedDate` is global date state, compared against `CONFIG.GARFIELD_START_*`

## Development Workflow

### Service Worker Versioning
**CRITICAL**: Bump `VERSION` constant in `serviceworker.js` with every deployment:
```javascript
const VERSION = 'v35'; // Increment on each change
```
This triggers cache invalidation and forces clients to update.

### Testing Locally
No build step required. Use any HTTP server:
```powershell
python -m http.server 8000
```
Access at `http://localhost:8000`

### Deployment
Hosted on Cloudflare Pages: `garfieldapp.pages.dev`
- Direct push to `main` branch triggers auto-deploy
- No build process—static files served as-is

## Common Pitfalls

### 1. Swipe + Click Conflicts
When adding click handlers to comic image, check `lastSwipeTime`:
```javascript
function Rotate() {
    if (Date.now() - lastSwipeTime < 300) return; // Ignore clicks after swipes
    // ... rotation logic
}
```

### 2. localStorage Namespace
Use `CONFIG.STORAGE_KEYS` constants, never hardcode keys:
```javascript
localStorage.setItem(CONFIG.STORAGE_KEYS.SPANISH, "true"); // Good
localStorage.setItem('spanish', "true"); // Bad
```

### 3. Spanish Comic Availability
Don't assume all dates/Sundays unavailable—always try loading first:
```javascript
const loaded = await loadComic(date, true); // silentMode = true
if (!loaded) { /* then handle unavailability */ }
```

### 4. Horizontal Centering
Toolbar horizontal position is always calculated—never save or apply `left` from localStorage for toolbar.

## UI Conventions
- Buttons use SVG icons (no text labels in toolbar)
- Tooltips via `title` attribute + custom CSS animation
- Mobile: `@media (max-width: 768px)` for responsive breakpoints
- Gradients: `--primary-gradient`, `--toolbar-gradient` CSS variables
- Touch devices: Disable hover effects with `@media (hover: none)`

## External Dependencies
- GoComics for comic images (requires CORS proxy)
- Ko-fi integration for donations (CDN loaded)
- No npm packages—everything is vanilla JS

---
*Last updated: Service Worker v35 | Main patterns: Native touch handling, vertical-only toolbar dragging, Spanish availability checking*
