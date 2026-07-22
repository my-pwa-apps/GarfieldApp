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

## July 22, 2026 - Complete Pre-Deployment Review

- [x] [Priority: Critical] — RESOLVED July 22, 2026
  **Area:** Bug / Business Logic / Testing
  **File(s):** [app.js](app.js), [tests/e2e/cross-browser-smoke.spec.js](tests/e2e/cross-browser-smoke.spec.js)
  **Issue:** `Addfav()` calls asynchronous `showComic()` after every favorite toggle. If source fallback resolves to a different canonical date before the next click, `formattedComicDate` changes and the second click adds the fallback date instead of removing the original favorite. The core smoke test reproduced this in WebKit and mobile Safari: expected zero favorites after add/remove, but storage contained two.
  **Impact:** Safari users can save or vote for the wrong comic and cannot reliably undo a favorite, corrupting local favorites and community ranking intent.
  **Suggested fix:** Remove the unnecessary `showComic()` call from `Addfav()` and update only favorite-dependent UI. Before: `CompareDates(); showComic();`. After: `CompareDates();` with no comic reload. Add a regression test that waits between clicks and asserts the stored date remains stable.
  **Acceptance criteria:** `npm run test:cross-browser -- --workers=1` passes in Chromium, Firefox, WebKit, and mobile Safari; add/remove leaves zero favorites and does not change the selected comic date.

- [ ] [Priority: High]
  **Area:** UX / Accessibility
  **File(s):** [main.css](main.css)
  **Issue:** Both themes set `--focus-ring: none`, while button, link, and input `:focus-visible` rules also remove the native outline. Keyboard controls are reachable but have no visible focus indicator.
  **Impact:** Keyboard and switch-device users cannot tell which control will activate. This violates the visible-focus expectation of WCAG 2.4.7/2.4.11 even though automated accessibility checks score 100.
  **Suggested fix:** Keep pointer-click styling outline-free, but restore a high-contrast keyboard-only `:focus-visible` ring with sufficient offset and contrast in both themes.
  **Acceptance criteria:** Every interactive control has a clearly visible focus indicator when reached with Tab, no ring appears for ordinary pointer clicks, and a Playwright assertion verifies computed focus styling.

- [ ] [Priority: High]
  **Area:** Business Logic / Security
  **File(s):** [worker/favorites-api/index.js](worker/favorites-api/index.js), [tests/unit/worker-favorites-api.test.mjs](tests/unit/worker-favorites-api.test.mjs)
  **Issue:** Leaderboard writes validate only the `YYYY/MM/DD` shape. Impossible or non-Garfield dates such as `9999/99/99`, pre-1978 dates, and future dates are accepted by `/favorite` and `/migrate`.
  **Impact:** Any authenticated account can pollute Top Favorites with entries that cannot map to a comic, causing broken leaderboard navigation and undermining ranking integrity.
  **Suggested fix:** Centralize strict calendar validation: round-trip year/month/day through a UTC date, enforce the English Garfield start date, and reject dates after the current Eastern calendar date. Apply it to both endpoints.
  **Acceptance criteria:** Impossible, pre-launch, and future dates return `400`; valid historical/current dates still work; unit tests cover leap days and both boundaries.

- [ ] [Priority: High]
  **Area:** Bug / Offline / Reliability
  **File(s):** [serviceworker.js](serviceworker.js), [tests/e2e/pwa-offline.spec.js](tests/e2e/pwa-offline.spec.js)
  **Issue:** `cacheFirstStrategy`, `cacheFirstWithLimit`, and `networkFirstStrategy` start `cache.put(...)` without awaiting it or extending the event lifetime. The `respondWith` promise can resolve before persistence completes.
  **Impact:** The browser may terminate the service-worker task before a comic or runtime response is cached, producing intermittent offline misses after a page appears to load successfully.
  **Suggested fix:** Before: `cache.put(request, networkResponse.clone());`. After: `await cache.put(request, networkResponse.clone());`, or pass the write to `event.waitUntil()` while returning the response promptly.
  **Acceptance criteria:** All cache writes are awaited or registered with `waitUntil`; an offline E2E test loads a new comic, immediately disables networking, and successfully reloads the cached comic across repeated runs.

- [ ] [Priority: High]
  **Area:** Performance
  **File(s):** [app.js](app.js), [main.css](main.css), [index.html](index.html), [tests/support/lighthouse-audit.cjs](tests/support/lighthouse-audit.cjs)
  **Issue:** Fresh mobile Lighthouse measured LCP at 4.64 seconds (poor), Speed Index at 7.91 seconds, and performance at 0.72. Initial transfer includes 211 KB of unminified `app.js`; Lighthouse estimates 181 KB unused JavaScript, 93 KB minification savings, and 34 KB unused CSS.
  **Impact:** The core product, seeing the comic, is delayed on mobile and weak networks, increasing abandonment and making the PWA feel unreliable.
  **Suggested fix:** Split startup from settings, sharing, Google sync, and leaderboard code; lazy-load Google Identity only when sync is requested; minify deploy assets; preserve a small critical app shell. After: initial boot loads comic/navigation code, then imports optional features on demand.
  **Acceptance criteria:** Mobile Lighthouse LCP is below 3.0 seconds, Speed Index below 5.8 seconds, and performance score at least 0.80 on three consecutive local audits.

- [ ] [Priority: Medium]
  **Area:** UX / Testing
  **File(s):** [main.css](main.css), [app.js](app.js), [tests/e2e/usability.spec.js](tests/e2e/usability.spec.js)
  **Issue:** A visible notification toast switches to `pointer-events: auto` and can cover settings controls. The full mobile release gate failed when the Spanish-unavailable toast intercepted the Top Favorites button; the same journey passed in isolation, confirming a timing-dependent obstruction.
  **Impact:** Users can be temporarily blocked from acting on controls underneath transient feedback, and the predeployment gate is flaky.
  **Suggested fix:** Make only the toast close button interactive, position notifications outside active controls, or dismiss/replace the current toast when the next user action begins.
  **Acceptance criteria:** The full mobile suite passes repeatedly without forced clicks or sleeps, and visible toasts never intercept unrelated controls.

- [ ] [Priority: Medium]
  **Area:** Deployment / UX / Cleanup
  **File(s):** [manifest.webmanifest](manifest.webmanifest)
  **Issue:** The manifest declares 113 icons, but 80 referenced `windows11/` files do not exist. Valid Android and iOS icons remain, so installation is not universally blocked, but Windows-specific metadata is broken and bloats the manifest.
  **Impact:** Windows may ignore preferred tile variants or show fallback branding, and manifest consumers generate avoidable 404s/warnings.
  **Suggested fix:** Either generate and commit the declared Windows assets or remove stale Windows entries and retain a concise standards-based `192x192`, `512x512`, and maskable set.
  **Acceptance criteria:** Every manifest icon URL returns `200`, install branding is verified on Windows and Android, and an automated manifest asset check reports zero missing files.

- [ ] [Priority: Medium]
  **Area:** Reliability / UX
  **File(s):** [app.js](app.js)
  **Issue:** `favoritesApiFetch()` has no timeout. Top Favorites reads, favorite writes, and migration requests can remain pending indefinitely on a stalled connection.
  **Impact:** The leaderboard modal can remain in its loading state and signed-in favorite actions can appear stuck on poor networks.
  **Suggested fix:** Add an `AbortController`/`AbortSignal.timeout` with a documented limit, distinguish timeout errors from authentication failures, and retain retry UI for reads.
  **Acceptance criteria:** Stalled API requests abort within the configured limit, users receive localized recovery feedback, and E2E tests cover timeout plus retry.

- [ ] [Priority: Medium]
  **Area:** Security
  **File(s):** [worker/index.js](worker/index.js), [tests/unit/worker-favorites-api.test.mjs](tests/unit/worker-favorites-api.test.mjs)
  **Issue:** The CORS proxy validates only the initial target host and then uses `redirect: 'follow'`. A redirect from an allowed upstream is not revalidated against `ALLOWED_HOSTS`.
  **Impact:** An open redirect or compromised allowed host could turn the Worker into a proxy for an unintended destination, expanding SSRF/proxy-abuse exposure.
  **Suggested fix:** Use manual redirects, resolve each `Location`, enforce protocol and host allowlists on every hop, and cap redirect depth.
  **Acceptance criteria:** Redirects within the allowlist still work; redirects to any unlisted host return `403`; automated Worker tests cover both paths.

- [ ] [Priority: Medium]
  **Area:** Security / Reliability
  **File(s):** [worker/favorites-api/index.js](worker/favorites-api/index.js)
  **Issue:** `parseJson()` reads the entire authenticated request body without a size limit. The API expects only a tiny favorite object or at most 500 date strings.
  **Impact:** A valid account can force unnecessary Durable Object memory and CPU use with oversized JSON payloads, reducing availability for legitimate votes.
  **Suggested fix:** Reject an excessive `Content-Length` before parsing and enforce a bounded streaming/read limit for chunked bodies.
  **Acceptance criteria:** Bodies above the documented limit return `413` without JSON parsing; normal favorite and migration payloads continue to pass.

- [ ] [Priority: Medium]
  **Area:** Bug / Deployment
  **File(s):** [worker/favorites-api/index.js](worker/favorites-api/index.js)
  **Issue:** Favorites API responses vary `Access-Control-Allow-Origin` by request but do not emit `Vary: Origin`; `/top` is explicitly public-cacheable for 30 seconds.
  **Impact:** Shared caches can reuse a response carrying the wrong allowed origin, causing intermittent CORS failures when multiple configured deployment origins use the API.
  **Suggested fix:** Append `Origin` to the `Vary` header on all dynamic CORS responses and add a contract test.
  **Acceptance criteria:** All API and preflight responses include `Vary: Origin`; sequential requests from two allowed origins each receive the correct CORS header.

- [ ] [Priority: Medium]
  **Area:** Deployment / Reliability
  **File(s):** [worker/wrangler.toml](worker/wrangler.toml), [worker/favorites-api/wrangler.toml](worker/favorites-api/wrangler.toml)
  **Issue:** Neither production Worker config enables Workers Logs/traces or structured request/error observability.
  **Impact:** Proxy failures, Google validation outages, rate-limit pressure, and Durable Object errors cannot be investigated reliably after the fact.
  **Suggested fix:** Enable sampled logs and traces in both configs, emit structured JSON for errors and route/status metadata, and define an operational retention/sampling policy.
  **Acceptance criteria:** Both Workers appear in Cloudflare Observability with searchable structured errors and sampled traces; no tokens or personal data are logged.

- [ ] [Priority: Medium]
  **Area:** Refactor / Maintainability
  **File(s):** [app.js](app.js), [toolbar.js](toolbar.js)
  **Issue:** The May 29 monolith item is marked resolved, but `app.js` remains 5,063 lines/211 KB and still owns navigation, rendering, favorites, settings, sharing, shuffle, rotation, offline state, and leaderboard behavior. Its acceptance criteria were not met.
  **Impact:** Cross-feature state mutation, including the Safari favorite defect, is difficult to isolate; changes carry broad regression and merge-conflict risk.
  **Suggested fix:** Reopen the incremental extraction. Before: optional features share mutable globals in `app.js`. After: move leaderboard, favorites, sharing, and rotation into focused modules with explicit state inputs, one module at a time, preserving behavior.
  **Acceptance criteria:** `app.js` is materially reduced, extracted modules have focused unit tests, global `window.*` dependencies decrease, and the full predeploy gate stays green after each extraction.

- [ ] [Priority: Low]
  **Area:** Security / Cleanup
  **File(s):** [package-lock.json](package-lock.json), [package.json](package.json)
  **Issue:** `npm audit` reports 22 development-only vulnerabilities (17 moderate, 5 high) through Lighthouse/Wrangler tooling; `npm audit --omit=dev` reports zero production vulnerabilities.
  **Impact:** Shipped static code is not exposed, but local/CI tooling processes repository and network data with vulnerable transitive packages.
  **Suggested fix:** Apply non-breaking audit updates where available, track upstream Wrangler/Lighthouse releases for the remaining advisories, and do not use the suggested forced Wrangler downgrade.
  **Acceptance criteria:** `npm audit` is clean or remaining dev-only advisories are explicitly documented with compensating controls; `npm audit --omit=dev` remains clean.

- [ ] [Priority: Low]
  **Area:** Documentation
  **File(s):** [README.md](README.md), [.github/copilot-instructions.md](.github/copilot-instructions.md)
  **Issue:** README links the native app to the placeholder `github.com/YOUR_ORG/GarfieldNative`; Copilot instructions still describe `init.js` as handling language detection in one section and pin stale Service Worker `v1.12.98` text while the app is `v1.0.3`.
  **Impact:** Contributors receive broken links and contradictory architecture/version guidance.
  **Suggested fix:** Replace or remove the placeholder repository link, correct `init.js` ownership consistently, and remove hardcoded current-version prose from instructions.
  **Acceptance criteria:** Every README link resolves and instruction descriptions match the current source without embedding a manually maintained version number.

- [ ] [Priority: Low]
  **Area:** Cleanup / Documentation
  **File(s):** [package.json](package.json)
  **Issue:** The package description says the repository is only automated browser tests, and Node emits `MODULE_TYPELESS_PACKAGE_JSON` while importing browser ES modules in unit tests.
  **Impact:** Repository metadata misstates the product and test output contains avoidable module-format noise.
  **Suggested fix:** Describe the PWA product accurately. Resolve module typing deliberately without breaking CommonJS Playwright/support files, for example by renaming CommonJS configs/helpers to `.cjs` before adding `"type": "module"`, or by keeping package mode and loading browser modules through an explicit test harness.
  **Acceptance criteria:** Package metadata describes GarfieldApp, unit tests emit no module-type warning, and all Node/Playwright commands continue to run.

- [ ] [Priority: Low]
  **Area:** Deployment
  **File(s):** [manifest.webmanifest](manifest.webmanifest), [README.md](README.md)
  **Issue:** Manifest `id`, `start_url`, and `scope` are relative, but all three shortcuts use root-absolute URLs (`/`, `/?action=random`, `/?view=favorites`).
  **Impact:** Shortcut launches break when deployed under a subpath such as GitHub Pages, contrary to the documented portability goal.
  **Suggested fix:** Use scope-relative shortcut URLs (`./`, `./?action=random`, `./?view=favorites`) and test a subpath deployment.
  **Acceptance criteria:** Installed shortcuts open the correct route at the domain root and under a non-root base path.

### July 22, 2026 Backlog Summary

| Priority | Count |
|---|---:|
| Critical | 0 |
| High | 4 |
| Medium | 8 |
| Low | 4 |

*Open items remaining from this review: 16 total.*
