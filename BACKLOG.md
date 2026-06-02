# Garfield App Backlog

## May 20, 2026

- [x] [Priority: High] — RESOLVED May 29, 2026
  **Area:** Bug / Testing
  **File(s):** [tests/e2e/usability.spec.js](tests/e2e/usability.spec.js)
  **Issue:** In `tests/e2e/usability.spec.js`, the Mock Service Worker for `https://corsproxy.garfieldapp.workers.dev/**` returns text/html dynamically for all queries. During the "ordinary user can discover and use the main app features" E2E journey, the sharing step fetches the comic image through this same proxy to construct a same-origin image for canvas decoding. Because the mock returns raw HTML instead of the expected image content, the image element fails to load. This causes the test to fail on the notification toast assertion (`Failed to share...` instead of `Sharing is not supported on this device.`).
  **Impact:** Breaks E2E usability testing suite runner on Chromium/predeploy builds.
  **Suggested fix:** Enhance the `https://corsproxy.garfieldapp.workers.dev/**` interceptor in `tests/e2e/usability.spec.js` to inspect the nested destination URL and return `image/png` type content using `transparentPng` when fetching assets from GoComics, Wikia, or ArcaMax.
  **Acceptance criteria:** All tests pass green under `npx playwright test --project=chromium`.

- [x] [Priority: Medium] — RESOLVED June 2, 2026
  **Area:** Cleanup / DevOps
  **File(s):** [serviceworker.js](serviceworker.js), [tools/bump-version.cjs](tools/bump-version.cjs), [package.json](package.json)
  **Issue:** Manual Service Worker versioning constraint (`const VERSION = 'v1.12.96'`). Forgetting to bump the version can cause stale/cached index, stylesheet or application JS bundles to be served to production clients.
  **Impact:** Potential for stale application state, mismatched bundle caches, or skipped updates upon rapid deployments.
  **Suggested fix:** Integrate a build or pre-deployment task that automatically increments standard semver versions inside `serviceworker.js` and `package.json` dynamically (e.g. injecting the git short SHA or package.json version during CI/CD).
  **Acceptance criteria:** Version increments on every deploy commit, verified programmatically.

- [x] [Priority: Low] — RESOLVED June 2, 2026
  **Area:** Performance / UX
  **File(s):** [comicExtractor.js](comicExtractor.js)
  **Issue:** First-time load on and caching logic for Fandom fallback queries do not include standard cache headers on outbound JSON requests, which forces clients to do roundtrip fetches each time.
  **Impact:** Slower fallback fetching on poor connectivity zones.
  **Suggested fix:** Add short-duration memory caching or leverage runtime service worker storage for search results.
  **Acceptance criteria:** Cache subsequent lookups of the same query within the same session.

## May 29, 2026

- [x] [Priority: High] — RESOLVED May 29, 2026
  **Area:** Bug / UX
  **File(s):** [app.js](app.js#L3908)
  **Issue:** In `importFavorites()`, the `reader.onload` handler declares `const t = translations[lang]` *inside* the `try` block, but the `catch (error)` block calls `showNotification(t.errorReadingFile, ...)`. Because `t` is block-scoped to the `try`, a malformed/non-JSON file (which makes `JSON.parse` throw) causes the catch to hit a `ReferenceError` on `t`, so the user gets **no** error toast and the failure is swallowed.
  **Impact:** Silent failure when a user imports a corrupt favorites file — no feedback, looks like a frozen/no-op button.
  **Suggested fix:** Hoist `const isSpanish/lang/t` above the `try` (or resolve `t` independently inside the `catch`).
  **Acceptance criteria:** Importing an invalid `.json` file shows the "error reading file" toast; add a unit/e2e case covering malformed import input.

- [x] [Priority: Medium] — RESOLVED June 2, 2026
  **Area:** Refactor / Maintainability
  **File(s):** [app.js](app.js), [toolbar.js](toolbar.js)
  **Issue:** `app.js` is a ~5,140-line monolith mixing config, utils, toolbar drag/positioning (~600 lines), comic loading, navigation, favorites, sharing, settings, translations, shuffle, leaderboard, and rotation/fullscreen. Comic-transition animation logic is duplicated for the main and rotated comic views.
  **Impact:** High cognitive load, harder onboarding, higher regression risk, merge friction; the toolbar positioning subsystem in particular is over-engineered for its UX value.
  **Suggested fix:** Extract cohesive ES modules (e.g. `toolbar.js`, `comicLoader.js`, `favorites.js`, `shuffle.js`, `rotation.js`) and de-duplicate the transition animation into a shared helper. No behavior change.
  **Acceptance criteria:** `app.js` materially reduced; modules import cleanly; existing Playwright + unit suites stay green.

- [x] [Priority: Medium] — RESOLVED June 2, 2026
  **Area:** Documentation
  **File(s):** [README.md](README.md), [comicExtractor.js](comicExtractor.js)
  **Issue:** README and the `comicExtractor.js` header/comments describe Fandom as the "primary"/default comic source, but the actual default is **GoComics** — both the `comicSource` `<select>` in [index.html](index.html) and `getValidComicSource()` ([app.js](app.js#L4456)) default to `'gocomics'`. The Fandom-first performance rationale in the docs therefore does not reflect runtime behavior.
  **Impact:** Misleading docs for contributors; wrong mental model when debugging source/fallback issues.
  **Suggested fix:** Update README and the `comicExtractor.js` comment to state GoComics is the default and describe the real fallback ordering, or change the default if Fandom-first is actually intended.
  **Acceptance criteria:** Docs match the shipped default source and `FALLBACK_ORDER`.

- [x] [Priority: Low] — RESOLVED June 2, 2026
  **Area:** Documentation
  **File(s):** [.github/copilot-instructions.md](.github/copilot-instructions.md)
  **Issue:** Instructions claim `init.js` performs language detection (it does not — language detection happens in `initApp()` in [app.js](app.js#L3364) via `navigator.language`), and reference Service Worker `v1.2.7` while the actual version is `v1.12.96`.
  **Impact:** Stale guidance misleads future AI/contributor edits.
  **Suggested fix:** Correct the `init.js` responsibility description and remove/auto-generate the hardcoded SW version reference.
  **Acceptance criteria:** Instructions accurately describe `init.js` and do not pin a stale version number.

- [x] [Priority: Low] — RESOLVED June 2, 2026
  **Area:** Cleanup
  **File(s):** [googleDriveSync.js](googleDriveSync.js)
  **Issue:** `updateGoogleUI(signedIn)` is defined with a single parameter but is called with a second argument (e.g. `updateGoogleUI(true, 'restore')`) throughout; the second arg is silently ignored. `_getStoredTokenData()` is also invoked as a bare statement with its return value discarded (relying only on a side effect).
  **Impact:** Dead/confusing API surface; signals unfinished refactor.
  **Suggested fix:** Drop the unused call arguments (or implement the intended behavior) and make the `_getStoredTokenData()` side-effect explicit.
  **Acceptance criteria:** Callers and signature agree; no discarded-result calls without a clarifying comment.

- [x] [Priority: Low] — RESOLVED June 2, 2026
  **Area:** Security
  **File(s):** [index.html](index.html), [googleDriveSync.js](googleDriveSync.js)
  **Issue:** The donation iframe uses `sandbox="allow-scripts allow-same-origin"` (this combination lets framed content remove its own sandboxing), and the Google OAuth access token is persisted in `localStorage` (`gDriveToken`), which is readable by any successful XSS.
  **Impact:** Low given third-party donation widgets and a restrictive CSP, but both are standard hardening gaps worth tracking.
  **Suggested fix:** Tighten the iframe sandbox to the minimum needed; consider in-memory token storage with silent refresh instead of `localStorage`. Keep CSP strict.
  **Acceptance criteria:** Donation widget still works with a narrower sandbox; token-at-rest exposure reduced or risk explicitly accepted/documented.

---

### Backlog Summary

| Priority | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

*Open items: 0 total.*

## June 2, 2026

- [x] [Priority: High] — RESOLVED June 2, 2026
  **Area:** Bug / Testing
  **File(s):** [tests/e2e/app.spec.js](tests/e2e/app.spec.js), [comicExtractor.js](comicExtractor.js)
  **Issue:** The Chromium E2E suite currently fails on a `net::ERR_ABORTED` request to the Fandom API during the settings/source-selection path. The same fallback path is also the most likely place where real users will see noisy source failures when the provider is unavailable or the page reloads mid-fetch.
  **Impact:** The current release gate is not clean (`24 passed, 1 failed` in `npx playwright test tests/e2e/app.spec.js --project=chromium`), and real users can see failed comic-source requests instead of graceful fallback behavior.
  **Suggested fix:** Make Fandom fetches abort-safe and retry/ignore aborted requests during source fallback, then add a regression case that simulates an aborted or unavailable Fandom lookup.
  **Acceptance criteria:** `npx playwright test tests/e2e/app.spec.js --project=chromium` passes with no `requestErrors`, and the Fandom fallback path degrades gracefully under aborts/unavailable responses.
