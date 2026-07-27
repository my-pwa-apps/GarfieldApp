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

- [x] [Priority: High] — RESOLVED July 27, 2026
  **Area:** UX / Accessibility
  **File(s):** [main.css](main.css)
  **Issue:** Both themes set `--focus-ring: none`, while button, link, and input `:focus-visible` rules also remove the native outline. Keyboard controls are reachable but have no visible focus indicator.
  **Impact:** Keyboard and switch-device users cannot tell which control will activate. This violates the visible-focus expectation of WCAG 2.4.7/2.4.11 even though automated accessibility checks score 100.
  **Suggested fix:** Keep pointer-click styling outline-free, but restore a high-contrast keyboard-only `:focus-visible` ring with sufficient offset and contrast in both themes.
  **Acceptance criteria:** Every interactive control has a clearly visible focus indicator when reached with Tab, no ring appears for ordinary pointer clicks, and a Playwright assertion verifies computed focus styling.

- [x] [Priority: High] — RESOLVED July 27, 2026
  **Area:** Business Logic / Security
  **File(s):** [worker/favorites-api/index.js](worker/favorites-api/index.js), [tests/unit/worker-favorites-api.test.mjs](tests/unit/worker-favorites-api.test.mjs)
  **Issue:** Leaderboard writes validate only the `YYYY/MM/DD` shape. Impossible or non-Garfield dates such as `9999/99/99`, pre-1978 dates, and future dates are accepted by `/favorite` and `/migrate`.
  **Impact:** Any authenticated account can pollute Top Favorites with entries that cannot map to a comic, causing broken leaderboard navigation and undermining ranking integrity.
  **Suggested fix:** Centralize strict calendar validation: round-trip year/month/day through a UTC date, enforce the English Garfield start date, and reject dates after the current Eastern calendar date. Apply it to both endpoints.
  **Acceptance criteria:** Impossible, pre-launch, and future dates return `400`; valid historical/current dates still work; unit tests cover leap days and both boundaries.

- [x] [Priority: High] — RESOLVED July 27, 2026
  **Area:** Bug / Offline / Reliability
  **File(s):** [serviceworker.js](serviceworker.js), [tests/e2e/pwa-offline.spec.js](tests/e2e/pwa-offline.spec.js)
  **Issue:** `cacheFirstStrategy`, `cacheFirstWithLimit`, and `networkFirstStrategy` start `cache.put(...)` without awaiting it or extending the event lifetime. The `respondWith` promise can resolve before persistence completes.
  **Impact:** The browser may terminate the service-worker task before a comic or runtime response is cached, producing intermittent offline misses after a page appears to load successfully.
  **Suggested fix:** Before: `cache.put(request, networkResponse.clone());`. After: `await cache.put(request, networkResponse.clone());`, or pass the write to `event.waitUntil()` while returning the response promptly.
  **Acceptance criteria:** All cache writes are awaited or registered with `waitUntil`; an offline E2E test loads a new comic, immediately disables networking, and successfully reloads the cached comic across repeated runs.

- [ ] [Priority: High] — MERGED July 27, 2026 into "Mobile LCP is 4.64 s" below
  **Area:** Performance
  **File(s):** [app.js](app.js), [main.css](main.css), [index.html](index.html), [tests/support/lighthouse-audit.cjs](tests/support/lighthouse-audit.cjs)
  **Issue:** Fresh mobile Lighthouse measured LCP at 4.64 seconds (poor), Speed Index at 7.91 seconds, and performance at 0.72. Initial transfer includes 211 KB of unminified `app.js`; Lighthouse estimates 181 KB unused JavaScript, 93 KB minification savings, and 34 KB unused CSS.
  **Impact:** The core product, seeing the comic, is delayed on mobile and weak networks, increasing abandonment and making the PWA feel unreliable.
  **Suggested fix:** Split startup from settings, sharing, Google sync, and leaderboard code; lazy-load Google Identity only when sync is requested; minify deploy assets; preserve a small critical app shell. After: initial boot loads comic/navigation code, then imports optional features on demand.
  **Acceptance criteria:** Mobile Lighthouse LCP is below 3.0 seconds, Speed Index below 5.8 seconds, and performance score at least 0.80 on three consecutive local audits.

- [x] [Priority: Medium] — RESOLVED July 28, 2026
  **Area:** UX / Testing
  **File(s):** [main.css](main.css), [app.js](app.js), [tests/e2e/usability.spec.js](tests/e2e/usability.spec.js)
  **Issue:** A visible notification toast switches to `pointer-events: auto` and can cover settings controls. The full mobile release gate failed when the Spanish-unavailable toast intercepted the Top Favorites button; the same journey passed in isolation, confirming a timing-dependent obstruction.
  **Impact:** Users can be temporarily blocked from acting on controls underneath transient feedback, and the predeployment gate is flaky.
  **Suggested fix:** Make only the toast close button interactive, position notifications outside active controls, or dismiss/replace the current toast when the next user action begins.
  **Acceptance criteria:** The full mobile suite passes repeatedly without forced clicks or sleeps, and visible toasts never intercept unrelated controls.

- [x] [Priority: Medium] — RESOLVED July 27, 2026
  **Area:** Deployment / UX / Cleanup
  **File(s):** [manifest.webmanifest](manifest.webmanifest)
  **Issue:** The manifest declares 113 icons, but 80 referenced `windows11/` files do not exist. Valid Android and iOS icons remain, so installation is not universally blocked, but Windows-specific metadata is broken and bloats the manifest.
  **Impact:** Windows may ignore preferred tile variants or show fallback branding, and manifest consumers generate avoidable 404s/warnings.
  **Suggested fix:** Either generate and commit the declared Windows assets or remove stale Windows entries and retain a concise standards-based `192x192`, `512x512`, and maskable set.
  **Acceptance criteria:** Every manifest icon URL returns `200`, install branding is verified on Windows and Android, and an automated manifest asset check reports zero missing files.

- [x] [Priority: Medium] — RESOLVED July 27, 2026
  **Area:** Reliability / UX
  **File(s):** [app.js](app.js)
  **Issue:** `favoritesApiFetch()` has no timeout. Top Favorites reads, favorite writes, and migration requests can remain pending indefinitely on a stalled connection.
  **Impact:** The leaderboard modal can remain in its loading state and signed-in favorite actions can appear stuck on poor networks.
  **Suggested fix:** Add an `AbortController`/`AbortSignal.timeout` with a documented limit, distinguish timeout errors from authentication failures, and retain retry UI for reads.
  **Acceptance criteria:** Stalled API requests abort within the configured limit, users receive localized recovery feedback, and E2E tests cover timeout plus retry.

- [x] [Priority: Medium] — RESOLVED July 27, 2026
  **Area:** Security
  **File(s):** [worker/index.js](worker/index.js), [tests/unit/worker-favorites-api.test.mjs](tests/unit/worker-favorites-api.test.mjs)
  **Issue:** The CORS proxy validates only the initial target host and then uses `redirect: 'follow'`. A redirect from an allowed upstream is not revalidated against `ALLOWED_HOSTS`.
  **Impact:** An open redirect or compromised allowed host could turn the Worker into a proxy for an unintended destination, expanding SSRF/proxy-abuse exposure.
  **Suggested fix:** Use manual redirects, resolve each `Location`, enforce protocol and host allowlists on every hop, and cap redirect depth.
  **Acceptance criteria:** Redirects within the allowlist still work; redirects to any unlisted host return `403`; automated Worker tests cover both paths.

- [x] [Priority: Medium] — RESOLVED July 27, 2026
  **Area:** Security / Reliability
  **File(s):** [worker/favorites-api/index.js](worker/favorites-api/index.js)
  **Issue:** `parseJson()` reads the entire authenticated request body without a size limit. The API expects only a tiny favorite object or at most 500 date strings.
  **Impact:** A valid account can force unnecessary Durable Object memory and CPU use with oversized JSON payloads, reducing availability for legitimate votes.
  **Suggested fix:** Reject an excessive `Content-Length` before parsing and enforce a bounded streaming/read limit for chunked bodies.
  **Acceptance criteria:** Bodies above the documented limit return `413` without JSON parsing; normal favorite and migration payloads continue to pass.

- [x] [Priority: Medium] — RESOLVED July 27, 2026
  **Area:** Bug / Deployment
  **File(s):** [worker/favorites-api/index.js](worker/favorites-api/index.js)
  **Issue:** Favorites API responses vary `Access-Control-Allow-Origin` by request but do not emit `Vary: Origin`; `/top` is explicitly public-cacheable for 30 seconds.
  **Impact:** Shared caches can reuse a response carrying the wrong allowed origin, causing intermittent CORS failures when multiple configured deployment origins use the API.
  **Suggested fix:** Append `Origin` to the `Vary` header on all dynamic CORS responses and add a contract test.
  **Acceptance criteria:** All API and preflight responses include `Vary: Origin`; sequential requests from two allowed origins each receive the correct CORS header.

- [x] [Priority: Medium] — RESOLVED July 27, 2026
  **Area:** Deployment / Reliability
  **File(s):** [worker/wrangler.toml](worker/wrangler.toml), [worker/favorites-api/wrangler.toml](worker/favorites-api/wrangler.toml)
  **Issue:** Neither production Worker config enables Workers Logs/traces or structured request/error observability.
  **Impact:** Proxy failures, Google validation outages, rate-limit pressure, and Durable Object errors cannot be investigated reliably after the fact.
  **Suggested fix:** Enable sampled logs and traces in both configs, emit structured JSON for errors and route/status metadata, and define an operational retention/sampling policy.
  **Acceptance criteria:** Both Workers appear in Cloudflare Observability with searchable structured errors and sampled traces; no tokens or personal data are logged.

- [ ] [Priority: Medium] — MERGED July 27, 2026 into "`app.js` remains a 5,000-line monolith" below
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

- [x] [Priority: Low] — RESOLVED July 27, 2026
  **Area:** Documentation
  **File(s):** [README.md](README.md), [.github/copilot-instructions.md](.github/copilot-instructions.md)
  **Issue:** README links the native app to the placeholder `github.com/YOUR_ORG/GarfieldNative`; Copilot instructions still describe `init.js` as handling language detection in one section and pin stale Service Worker `v1.12.98` text while the app is `v1.0.3`.
  **Impact:** Contributors receive broken links and contradictory architecture/version guidance.
  **Suggested fix:** Replace or remove the placeholder repository link, correct `init.js` ownership consistently, and remove hardcoded current-version prose from instructions.
  **Acceptance criteria:** Every README link resolves and instruction descriptions match the current source without embedding a manually maintained version number.

- [x] [Priority: Low] — RESOLVED July 28, 2026 (`.cjs` renames + `"type": "module"`)
  **Area:** Cleanup / Documentation
  **File(s):** [package.json](package.json)
  **Issue:** The package description says the repository is only automated browser tests, and Node emits `MODULE_TYPELESS_PACKAGE_JSON` while importing browser ES modules in unit tests.
  **Impact:** Repository metadata misstates the product and test output contains avoidable module-format noise.
  **Suggested fix:** Describe the PWA product accurately. Resolve module typing deliberately without breaking CommonJS Playwright/support files, for example by renaming CommonJS configs/helpers to `.cjs` before adding `"type": "module"`, or by keeping package mode and loading browser modules through an explicit test harness.
  **Acceptance criteria:** Package metadata describes GarfieldApp, unit tests emit no module-type warning, and all Node/Playwright commands continue to run.

- [x] [Priority: Low] — RESOLVED July 27, 2026
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

*Open items remaining from this review: 4 (12 resolved on July 27, 2026).*

---

## July 27, 2026 — Full-Stack Principal Review

Scope: complete repository review (product, architecture, code, performance, security, reliability, testing, maintainability, future-proofing). Items marked **FIXED IN THIS REVIEW** were implemented and verified before this section was written; they are retained for traceability. All other items are open.

### Fixed in this review

- [x] Statically imported ES module `toolbar.js` was never precached
  Priority: High
  Category: Bug
  Area: PWA / Offline / Reliability
  Affected files: [serviceworker.js](serviceworker.js), [tools/verify-assets.cjs](tools/verify-assets.cjs), [tests/unit/serviceworker.test.mjs](tests/unit/serviceworker.test.mjs)
  Problem: `app.js` is an ES module that statically imports `./toolbar.js`, but `PRECACHE_ASSETS` listed only `comicExtractor.js` and `googleDriveSync.js`. Immediately after a version bump the new cache contains no `toolbar.js`, so an offline first launch fails to resolve the module graph.
  Impact: A blank screen (not a degraded experience) for any user whose first post-update launch is offline. Module-graph failures are silent in `app.js` because the import error happens before any handler runs.
  Recommended solution: Add `./toolbar.js` to `PRECACHE_ASSETS` and `REQUIRED_PRECACHE_ASSETS`, and add an automated guard that derives the required set from `app.js` static imports.
  Acceptance criteria: `npm run test:assets` fails if any statically imported module is missing from the precache list; a unit test asserts the derived set matches.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] Timezone-edge-case favorite computed the wrong calendar day
  Priority: High
  Category: Bug
  Area: Favorites / Business Logic
  Affected files: [app.js](app.js)
  Problem: `Addfav()` parsed the current comic date with `new Date(formattedComicDate.replace(/\//g, '-'))`, which the ECMAScript spec parses as **UTC** midnight. The subsequent `getDate()`/`getMonth()` calls are local, so every user west of UTC read back the previous day and then subtracted another day.
  Impact: In the timezone edge case (today's strip not yet published), users in the Americas favorited a comic two days earlier than intended, and voted for it on the community leaderboard.
  Recommended solution: Use the existing `UTILS.dateFromFavoriteDateString()` helper, which builds a local calendar date.
  Acceptance criteria: Favoriting during the edge case stores the date of the comic actually displayed, in every timezone.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] No continuous integration on push or pull request
  Priority: High
  Category: Developer Experience
  Area: CI/CD
  Affected files: [.github/workflows/ci.yml](.github/workflows/ci.yml)
  Problem: The repository had a comprehensive test suite and a documented `test:predeploy` gate, but nothing enforced it. Cloudflare Pages deploys every push to `main` with no verification.
  Impact: A broken commit reaches production immediately. The quality of the test suite provided no actual protection.
  Recommended solution: A GitHub Actions workflow running syntax, asset, unit, production-dependency audit, and Chromium E2E checks on every push and pull request, uploading the Playwright report as an artifact.
  Acceptance criteria: CI runs on every push/PR to `main` and fails the check on any regression.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: High

- [x] The CORS proxy Worker had no automated tests
  Priority: High
  Category: Testing
  Area: Workers
  Affected files: [tests/unit/worker-cors-proxy.test.mjs](tests/unit/worker-cors-proxy.test.mjs)
  Problem: `worker/index.js` is the single point of failure for every comic fetch, yet it had zero test coverage. Only the favorites API was tested.
  Recommended solution: Behavioural tests with a stubbed `fetch`/`caches` covering allowlist enforcement, protocol rejection, method restriction, redirect validation, redirect-loop bounding, header sanitization, and upstream-failure handling.
  Acceptance criteria: `npm run test:unit` exercises all proxy branches without network access.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] Settings-panel drag position was never persisted
  Priority: Medium
  Category: Bug
  Area: UX
  Affected files: [toolbar.js](toolbar.js)
  Problem: `makeDraggable()` defaulted `onDrop` to a no-op and accepted `storageKey` without ever using it. The toolbar supplied its own persisting handler; the settings panel did not, so its position reset on every reload despite the documented behaviour.
  Recommended solution: Make persistence the default `onDrop` behaviour so every draggable surface survives a reload.
  Acceptance criteria: Dragging the settings panel and reloading restores the dropped position.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Dead toolbar collision-detection code
  Priority: Low
  Category: Cleanup
  Area: Toolbar
  Affected files: [app.js](app.js)
  Problem: `isInSnapZone()`, `getProtectedElementRects()`, and `checkToolbarOverlap()` (~85 lines) had no call sites anywhere in the codebase.
  Impact: Dead code inflates the largest file in the project, misleads readers into believing collision avoidance is active, and ships to every user.
  Recommended solution: Removed.
  Acceptance criteria: No references remain; the full suite still passes.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

### Open items

- [ ] `app.js` remains a 5,000-line monolith with module-scoped mutable state — STILL OPEN (July 28, 2026: dead code, duplicated icon markup, and the toolbar timer ladder were removed, but no module extraction has happened yet)
  Priority: High
  Category: Architecture
  Area: Client application
  Affected files: [app.js](app.js)
  Problem: Beyond raw size, the file relies on module-scoped mutable globals (`year`, `month`, `day`, `formattedDate`, `formattedComicDate`, `currentComicUrl`, `nextComicUrl`, `_top10Entries`, `_isTop10Mode`) that are written by one function and read by unrelated ones. `formatDate()` mutates three module globals as its real return value; the four-line block that calls it and re-derives `formattedComicDate`/`formattedDate`/`DatePicker.value` is repeated six times inside `showComic()` alone. `isShuffleEnabled()` reads `aria-pressed` off the DOM as the source of truth.
  Impact: Every feature can corrupt every other feature's state. The Safari duplicate-favorite defect resolved on July 22 was a direct symptom. Regression risk and merge-conflict rate stay high indefinitely.
  Recommended solution: Incrementally extract cohesive modules with explicit inputs/outputs. Start where coupling is weakest: `leaderboard.js` (Top-10 modal, indicator, browse mode), then `favorites.js`, `share.js`, `rotation.js`. Replace `formatDate()` with a pure function returning `{ year, month, day, iso, slash }`. Replace DOM-as-state reads with a single `appState` object that renders to the DOM rather than reading from it.
  Acceptance criteria: `app.js` drops below 3,000 lines; each extracted module has its own unit tests; the number of module-scoped `let` bindings decreases measurably; `npm run test:predeploy` stays green after each extraction.
  Estimated effort: Large
  Business value: Medium
  Technical debt reduction: High

- [x] Unit tests assert on source text instead of behaviour — RESOLVED July 28, 2026
  Priority: High
  Category: Testing
  Area: Test strategy
  Affected files: [tests/unit/app-contracts.test.mjs](tests/unit/app-contracts.test.mjs), [tests/unit/serviceworker.test.mjs](tests/unit/serviceworker.test.mjs), [tests/unit/comicExtractor.test.mjs](tests/unit/comicExtractor.test.mjs)
  Problem: Most unit tests read the file as a string and `assert.match` a regex against it, for example `assert.match(appSource, /catch \(e\)/)` and `assert.match(source, /while \(keys\.length >= maxSize\)/)`. These assert that specific characters exist, not that the code works. `worker-favorites-api.test.mjs` is the only suite that actually executes the code under test.
  Impact: False confidence. A regex-passing refactor can be functionally broken, and a harmless rename fails the suite. The suite resists exactly the refactoring the codebase most needs.
  Recommended solution: Progressively replace source-text assertions with executable tests. `serviceworker.js` and `comicExtractor.js` can both be imported into Node with stubbed `caches`, `fetch`, and `self`, exactly as `worker-favorites-api.test.mjs` already does for the Durable Object. Keep source-text checks only for genuine static invariants (version format, precache/import-graph consistency).
  Acceptance criteria: No `assert.match(<source>, ...)` assertion remains except for documented static invariants; cache strategies, LRU eviction, proxy scoring, and source fallback ordering are covered by executing the real functions.
  Estimated effort: Large
  Business value: Medium
  Technical debt reduction: High

- [ ] Mobile LCP is 4.64 s; 211 KB of unminified, largely unused JavaScript blocks first paint — PARTIALLY RESOLVED July 28, 2026 (Google Identity Services is no longer an eager page dependency and the CORS proxy origin is now preconnected; module splitting and minification remain)
  Priority: High
  Category: Performance
  Area: Startup
  Affected files: [app.js](app.js), [index.html](index.html), [main.css](main.css)
  Problem: Carried forward from July 22 and still open. The single `app.js` bundle contains settings, sharing, Google sync, rotation, install prompt, and the leaderboard, none of which are needed to display the first comic. Lighthouse reports 181 KB unused JS, 93 KB minification headroom, and 34 KB unused CSS.
  Impact: The core product — seeing today's strip — is delayed on mobile and weak networks.
  Recommended solution: This is unlocked by the `app.js` extraction item above. Once optional features are separate modules, load them with dynamic `import()` on first use (settings panel open, share click, leaderboard open, sign-in). Add a minification step for deploy only, keeping the no-build local workflow.
  Acceptance criteria: Mobile Lighthouse LCP below 3.0 s, Speed Index below 5.8 s, performance score at least 0.80 on three consecutive audits.
  Estimated effort: Large
  Business value: High
  Technical debt reduction: Medium

- [x] Escape-key handler leaks on every non-Escape rotation exit — RESOLVED July 28, 2026
  Priority: Medium
  Category: Bug
  Area: Rotation / Fullscreen
  Affected files: [app.js](app.js)
  Problem: `Rotate()` registers `handleEscapeKey` on `document` when entering rotated view, but only removes it inside the Escape branch of that same handler. Exiting by clicking the comic, tapping the overlay, or rotating the device back leaves the listener attached. Each subsequent entry adds another.
  Impact: Listener accumulation over a long session; after N rotate cycles a single Escape press runs N teardown paths. Also a memory leak in installed PWAs, which are rarely reloaded.
  Recommended solution: Extract a single `exitRotatedView()` teardown that always calls `document.removeEventListener('keydown', handleEscapeKey)`, and call it from every exit path. `Rotate()` currently duplicates its full teardown sequence twice — collapse both copies into that function.
  Acceptance criteria: After ten enter/exit cycles through each exit path, `getEventListeners(document).keydown` (or an instrumented counter) shows no growth.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Settings listeners are registered at module scope with no null guards — RESOLVED July 28, 2026
  Priority: Medium
  Category: Bug
  Area: Bootstrap
  Affected files: [app.js](app.js)
  Problem: `document.getElementById('swipe').addEventListener(...)`, `document.getElementById('showfavs').addEventListener(...)`, and `document.getElementById('lastdate').addEventListener(...)` execute at module top level with no optional chaining. `handleTouchStart()` likewise dereferences `document.getElementById("swipe").checked` unguarded (and the guard it wraps is a no-op `return` at the end of the function).
  Impact: Any change to `index.html` that renames or conditionally renders a settings control throws a `TypeError` during module evaluation, which aborts the rest of `app.js` and leaves the app blank. There is no error boundary.
  Recommended solution: Move these registrations into the existing DOM-ready bootstrap and use optional chaining. Remove the dead trailing guard in `handleTouchStart()`.
  Acceptance criteria: Removing any single settings control from `index.html` degrades that feature only; the app still boots and shows a comic.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] `updateDateDisplay()` is dead code called from nine sites — RESOLVED July 28, 2026
  Priority: Medium
  Category: Cleanup
  Area: Date display
  Affected files: [app.js](app.js)
  Problem: The function early-returns because it queries `.date-center-wrapper`, an element that does not exist in `index.html`. It is nevertheless invoked from nine locations, including hot navigation paths.
  Impact: Misleading code — a reader reasonably assumes a localized date label is rendered somewhere. Nine wasted calls plus a dead ~40-line function.
  Recommended solution: Either implement the localized date label the function was written for (a genuine UX improvement — the date picker currently shows the browser's raw date-input format), or delete the function and its nine call sites.
  Acceptance criteria: No function in `app.js` short-circuits on a selector absent from `index.html`.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Top-10 thumbnails ignore the user's comic source and language — RESOLVED July 28, 2026
  Priority: Medium
  Category: Bug
  Area: Community leaderboard
  Affected files: [app.js](app.js)
  Problem: `showTop10Modal()` hardcodes `getAuthenticatedComic(date, 'en', 'fandom', { maxSources: 1 })`. A user whose source preference is GoComics or uClick, or who is browsing in Spanish, still gets single-attempt Fandom lookups.
  Impact: Thumbnails silently fail for users whose preferred source works while Fandom does not, and the whole grid aborts after three consecutive failures. The leaderboard looks broken rather than degraded.
  Recommended solution: Read the stored source preference and language, and pass them through. Keep `maxSources: 1` for speed but fall back to the app default source rather than a fixed one.
  Acceptance criteria: With source set to GoComics, leaderboard thumbnails load from GoComics; with Fandom unavailable, thumbnails still render.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Settings panel is a dialog without a focus trap or Escape handling — RESOLVED July 28, 2026
  Priority: Medium
  Category: Accessibility
  Area: Settings
  Affected files: [index.html](index.html), [app.js](app.js)
  Problem: The panel is `role="dialog" aria-modal="false"`, but keyboard focus can leave it while it is open and Escape does not close it. The Top-10 modal, by contrast, has a proper `trapTop10ModalFocus()` implementation.
  Impact: Keyboard and screen-reader users can tab into content hidden behind the panel and lose track of context.
  Recommended solution: Reuse the Top-10 focus-trap implementation for the settings panel, restore focus to the settings button on close, and close on Escape. Extract the trap into a shared helper rather than duplicating it.
  Acceptance criteria: Tab cycles within the open panel, Escape closes it, focus returns to the trigger, and a Playwright assertion covers the cycle.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Leaderboard markup is built with `innerHTML` from remote data — RESOLVED July 28, 2026
  Priority: Medium
  Category: Security
  Area: Community leaderboard
  Affected files: [app.js](app.js)
  Problem: `showTop10Modal()` and `updateTop10Indicator()` interpolate API-supplied values into `innerHTML`, including into an unquoted-context `aria-label="${ariaLabel}"` attribute. The Worker currently validates dates strictly, so there is no live exploit, but the client trusts the server completely.
  Impact: The client-side XSS defence depends entirely on a remote service continuing to validate. A future API field (a nickname, a title, a source label) would be injected without escaping, and the app's CSP does not block inline event handlers injected into attributes.
  Recommended solution: Build entries with `document.createElement` + `textContent`/`setAttribute`, or add an `escapeHtml()` helper applied to every interpolation. Prefer the DOM API for the entry list, which is already the pattern used for thumbnails.
  Acceptance criteria: No remote value reaches `innerHTML` unescaped; a unit test feeds a hostile `date`/`count` payload and asserts no script executes.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] uClick source downloads each image twice — RESOLVED July 28, 2026
  Priority: Medium
  Category: Performance
  Area: Comic fetching
  Affected files: [comicExtractor.js](comicExtractor.js)
  Problem: `_getComicFromUClick()` issues a full proxied `GET` with `cache: 'no-cache'` purely to confirm the strip exists, then returns the same proxied URL for the `<img>` element to fetch again.
  Impact: Doubles bytes and latency for every uClick comic, on the mobile networks where it matters most.
  Recommended solution: Either switch the existence probe to `HEAD` (the proxy Worker already allows `HEAD`), or drop the probe entirely and treat the `<img>` `onerror` event as the not-found signal, which is how GoComics results are already handled.
  Acceptance criteria: A single network request per uClick comic; not-found still falls through to the next source.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Fandom lookup issues up to eight sequential proxied requests — RESOLVED July 28, 2026
  Priority: Medium
  Category: Performance
  Area: Comic fetching
  Affected files: [comicExtractor.js](comicExtractor.js)
  Problem: The Fandom resolver tries four file extensions across two hyphenation variants, one at a time, each through the CORS proxy. Fandom is the default fallback source and the source used for every leaderboard thumbnail.
  Impact: Worst-case first-comic latency is eight serial round-trips before falling through to the next source.
  Recommended solution: Probe the variants concurrently with `Promise.any` and cancel the losers via `AbortController`, or resolve the real filename once through the Fandom API instead of guessing extensions.
  Acceptance criteria: Fandom resolution completes within one round-trip in the common case and never exceeds two serial hops.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: Medium

- [x] Google Drive sync cannot be exercised outside production — RESOLVED July 28, 2026
  Priority: Medium
  Category: Developer Experience
  Area: Google sync
  Affected files: [googleDriveSync.js](googleDriveSync.js)
  Problem: `GOOGLE_AUTH_ALLOWED_ORIGINS` contains only the production origin, so sign-in reports `unsupported-origin` on `127.0.0.1:8000`. The OAuth client ID is also duplicated verbatim in `worker/favorites-api/index.js` with only a comment linking the two.
  Impact: Sync and the entire authenticated leaderboard path can only be tested by deploying. A client-ID rotation silently breaks the leaderboard if only one copy is updated.
  Recommended solution: Allow `http://127.0.0.1:*` and `http://localhost:*` (matching the Worker's own local origins), and derive the client ID from one place — either a small shared constants module consumed by both, or a `GOOGLE_CLIENT_ID` Worker variable plus a build-free `window.__GARFIELD_CONFIG__` block in `index.html`.
  Acceptance criteria: Sign-in works against a local server with the appropriate Google console origin configured; the client ID appears exactly once in the repository, with a unit test enforcing it.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: Medium

- [x] Leaderboard is a single Durable Object rewriting the full counts map per vote — RESOLVED July 28, 2026
  Priority: Medium
  Category: Scalability
  Area: Favorites API
  Affected files: [worker/favorites-api/index.js](worker/favorites-api/index.js)
  Problem: Every write reads and rewrites the entire `counts` and `updated-at` maps and recomputes the top list — O(n) storage traffic per vote against one globally serialized object. `rate:<identity>` keys are written but never deleted.
  Impact: Write latency grows linearly with the number of distinct favorited dates (~17,000 possible), and rate-limit records accumulate without bound. Fine at current traffic; a hard ceiling if the feature succeeds.
  Recommended solution: Use the Durable Object's SQLite storage with a `counts(date, count, updated_at)` table and an index on `count DESC`, replacing whole-map serialization with row updates and a `LIMIT 50` query. Give rate-limit keys a TTL or sweep them from the existing alarm.
  Acceptance criteria: Write latency is independent of the number of tracked dates; rate-limit storage is bounded; existing counts are migrated without loss.
  Estimated effort: Medium
  Business value: Low
  Technical debt reduction: Medium

- [x] Toolbar initialization depends on layered timers rather than layout events — RESOLVED July 28, 2026
  Priority: Medium
  Category: Refactor
  Area: Toolbar
  Affected files: [app.js](app.js)
  Problem: Positioning is driven by `setTimeout` at 0/50/100/250/300 ms, a double `requestAnimationFrame`, and two `ResizeObserver` instances. `calculateOptimalToolbarPosition()` also mutates `comicContainer.style.marginTop`, a layout side effect inside a function named "calculate".
  Impact: Position is correct by luck of timing. Slow devices and font-load delays produce visible jumps; the behaviour is effectively untestable and any change risks regressions nobody can reproduce.
  Recommended solution: Position once from a `ResizeObserver` on the comic container plus `document.fonts.ready`, and remove the timer ladder. Split measurement from mutation: `calculateOptimalToolbarPosition()` returns coordinates only; a separate `applyToolbarLayout()` writes styles.
  Acceptance criteria: No `setTimeout`-based positioning remains; the toolbar settles in a single frame after layout; a Playwright test asserts a stable position across a viewport resize and a slow-font simulation.
  Estimated effort: Medium
  Business value: Low
  Technical debt reduction: High

- [x] Shuffle history stacks grow without bound — RESOLVED July 28, 2026
  Priority: Low
  Category: Bug
  Area: Shuffle
  Affected files: [app.js](app.js)
  Problem: `_shuffleBackStack` and `_shuffleForwardStack` are pushed to on every shuffle navigation and never truncated.
  Impact: Slow memory growth in installed PWAs, which can stay open for days.
  Recommended solution: Cap both stacks at a documented depth (for example 200 entries) and drop the oldest, mirroring the existing `CONFIG` constant style.
  Acceptance criteria: Stack length never exceeds the configured cap; back navigation still works to that depth.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] Windows Store review prompt is dead code — RESOLVED July 28, 2026
  Priority: Low
  Category: Cleanup
  Area: Platform integration
  Affected files: [app.js](app.js)
  Problem: `initStoreReview()` and `requestStoreReview()` target `window.Windows.Services.Store` (WinRT), which is unreachable from a browser or Cloudflare-hosted PWA. The Windows wrapper now lives in the separate `GarfieldNative` repository.
  Impact: Dead code plus a `setTimeout` scheduled on every startup, and a misleading impression that the PWA integrates with the Microsoft Store.
  Recommended solution: Remove both functions and the startup call, or move them into `GarfieldNative` where the WinRT API actually exists.
  Acceptance criteria: No WinRT references remain in the PWA source.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] `showInstallButton()` attaches a duplicate click listener on each call — RESOLVED July 28, 2026
  Priority: Low
  Category: Bug
  Area: Install prompt
  Affected files: [app.js](app.js)
  Problem: The function calls `installBtn.addEventListener('click', ...)` every time it runs, with no removal or once-guard.
  Impact: If `beforeinstallprompt` fires more than once, the install flow runs multiple times per click and `deferredPrompt` is consumed by the first handler while the rest no-op.
  Recommended solution: Register the handler once during bootstrap and let `showInstallButton()` only toggle visibility, or pass `{ once: true }`.
  Acceptance criteria: Exactly one click listener exists on the install button regardless of how many times the prompt event fires.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] Settings footer version is scraped from `serviceworker.js` source at runtime — RESOLVED July 28, 2026
  Priority: Low
  Category: Architecture
  Area: Settings
  Affected files: [app.js](app.js), [serviceworker.js](serviceworker.js)
  Problem: `initApp()` fetches `./serviceworker.js` with `cache: 'no-store'` and regex-matches `const VERSION = '...'` to populate the settings footer.
  Impact: An extra uncached network request on every startup, and a hard coupling between UI text and the literal source formatting of another file. `npm run bump:version` would break the footer if it ever changed the declaration style.
  Recommended solution: Ask the active service worker for its version over `postMessage`/`MessageChannel`, or have the service worker expose `GET ./version` from its own constant. The registration is already available in `init.js`.
  Acceptance criteria: The footer version is obtained without fetching or parsing source code, and no extra network request occurs at startup.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Unused image assets ship with every deployment — RESOLVED July 28, 2026
  Priority: Low
  Category: Cleanup
  Area: Assets
  Affected files: [garscreenshot1.png](garscreenshot1.png), [garlogo.png](garlogo.png), [screenshot1.webp](screenshot1.webp)
  Problem: `garscreenshot1.png` (995 KB), `garlogo.png` (117 KB), and `screenshot1.webp` (110 KB) are referenced by nothing — not `index.html`, `main.css`, `manifest.webmanifest`, `serviceworker.js`, or `browserconfig.xml`.
  Impact: ~1.2 MB of dead weight in the repository and in every Pages deployment; slower clones and deploys.
  Recommended solution: Delete them (they remain recoverable through git history) after confirming the `GarfieldNative` repository does not reference them as sibling assets. Extend `tools/verify-assets.cjs` with a reverse check that reports unreferenced binaries.
  Acceptance criteria: No unreferenced image assets remain; the asset guard reports orphans.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] `TOOLBAR_ICONS` duplicates SVG markup already present in `index.html` — RESOLVED July 28, 2026
  Priority: Low
  Category: Technical Debt
  Area: Toolbar
  Affected files: [app.js](app.js), [index.html](index.html)
  Problem: The same icon paths exist twice — inline in the HTML and as strings in `app.js`.
  Impact: Icon changes must be made in two places; the two copies can silently diverge.
  Recommended solution: Keep one source. Either build the toolbar entirely from `TOOLBAR_ICONS` and remove the inline SVGs, or use an SVG sprite (`<symbol>` + `<use>`) referenced from both.
  Acceptance criteria: Each toolbar icon path appears exactly once in the repository.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] `SKIP_WAITING` message handling is unreachable — RESOLVED July 28, 2026
  Priority: Low
  Category: Cleanup
  Area: Service worker
  Affected files: [serviceworker.js](serviceworker.js), [init.js](init.js)
  Problem: The install handler already calls `self.skipWaiting()` unconditionally, so a new worker never waits and the `SKIP_WAITING` message handler never has anything to do. The update banner in `init.js` is correspondingly cosmetic.
  Impact: Updates activate immediately and can swap the app shell under an active session, which is the opposite of what the update banner implies to the user.
  Recommended solution: Decide on one model. Either drop the unconditional `skipWaiting()` and let the banner drive activation via the message (recommended — it prevents mid-session asset swaps), or remove the message handler and the banner.
  Acceptance criteria: The chosen update model is implemented end to end and covered by the offline E2E test.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Hard-coded English strings bypass the translation dictionary — RESOLVED July 28, 2026
  Priority: Low
  Category: Bug
  Area: Internationalization
  Affected files: [app.js](app.js)
  Problem: `UTILS.updateHeartIcon()` sets `aria-label` to the literal `'Remove from favorites'`/`'Add to favorites'`, and `checkImageOrientation()` uses the literal `'Click to view full size'`. Both bypass `translations`.
  Impact: Spanish screen-reader users hear English labels on the most-used control in the app. `app-contracts.test.mjs` verifies key parity between dictionaries but cannot detect strings that never reach them.
  Recommended solution: Add the missing keys to both dictionaries and read them through the existing lookup. Add a lint-style test that flags user-facing string literals passed to `aria-label`/`title`/`textContent` outside the `translations` object.
  Acceptance criteria: No user-facing literal string is assigned outside `translations`; the Spanish UI has no English labels.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] `.vscode/tasks.json` references a path that no longer exists — RESOLVED July 28, 2026
  Priority: Low
  Category: Developer Experience
  Area: Tooling
  Affected files: `.vscode/tasks.json`
  Problem: The "Serve GarfieldApp" task invokes `c:/Users/<user>/OneDrive - Microsoft/Documents/Git Repos/GarfieldApp/.venv/Scripts/python.exe`, an absolute path from a previous machine layout. The repository also has a first-class `npm run serve` (Node) that the task ignores.
  Impact: The task fails for every contributor, and it introduces a Python dependency the project does not otherwise have.
  Recommended solution: Replace the task with `npm run serve`, or delete it.
  Acceptance criteria: Every task in `.vscode/tasks.json` runs successfully from a fresh clone.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [ ] 22 development-only dependency advisories — STILL OPEN (accepted risk; `npm audit --omit=dev` is clean and CI enforces it)
  Priority: Low
  Category: Security
  Area: Tooling
  Affected files: [package.json](package.json), [package-lock.json](package-lock.json)
  Problem: Carried forward from July 22. `npm audit` reports 17 moderate and 5 high advisories through Lighthouse and Wrangler transitives; `npm audit --omit=dev` is clean.
  Impact: Shipped code is unaffected, but local and CI tooling processes network data with vulnerable transitive packages.
  Recommended solution: Track upstream Lighthouse/Wrangler releases and apply non-breaking updates. Do not accept the suggested Wrangler downgrade. CI now enforces `npm audit --omit=dev --audit-level=high` so production regressions are caught.
  Acceptance criteria: `npm audit` is clean, or remaining dev-only advisories are documented with compensating controls.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] `MODULE_TYPELESS_PACKAGE_JSON` warning during unit tests — RESOLVED July 28, 2026
  Priority: Low
  Category: Developer Experience
  Area: Tooling
  Affected files: [package.json](package.json)
  Problem: Carried forward from July 22; the package description was corrected on July 27 but the module-type warning remains. Node emits it because `.mjs` tests import browser ES modules from a package with no `"type"` field.
  Impact: Avoidable noise in every test run, which trains contributors to ignore warnings.
  Recommended solution: Rename the CommonJS Playwright configs and support helpers to `.cjs`, then set `"type": "module"`.
  Acceptance criteria: Unit tests emit no module-type warning and all Node/Playwright commands still run.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

### July 27, 2026 Backlog Summary

| Priority | Fixed in this review | Still open |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 4 | 3 |
| Medium | 1 | 11 |
| Low | 1 | 10 |
| **Total** | **6** | **24** |

*Also closed in this review: 12 carried-over items from the July 22, 2026 section.*
*Total open items across all reviews: 26 (24 new + 2 carried over: the app.js monolith and the mobile-performance item are merged into this section; the notification-toast obstruction and dev-dependency advisories remain from July 22).*

## July 28, 2026 — Remediation Pass (`opus5`)

Scope: implement every finding left open by the July 27 review. Work was done on the `opus5` branch and verified against the full gate (`test:syntax`, `verify-assets`, `test:unit`, Chromium + mobile-chrome Playwright, cross-browser Playwright).

### Closed in this pass

| Item | Area | Where |
|---|---|---|
| Escape-key handler leak on rotation exit | Bug / Rotation | [app.js](app.js) |
| Settings listeners without null guards | Bug / Bootstrap | [app.js](app.js) |
| `updateDateDisplay()` dead code | Cleanup | [app.js](app.js), [main.css](main.css) |
| Unbounded shuffle history stacks | Bug / Shuffle | [app.js](app.js) |
| Duplicate install-button listener | Bug / Install | [app.js](app.js) |
| Windows Store review dead code | Cleanup | [app.js](app.js) |
| Hard-coded English `aria-label`/`title` strings | i18n | [app.js](app.js) |
| Top-10 `innerHTML` from remote data | Security | [app.js](app.js) |
| Top-10 thumbnails ignoring source/language | Bug / Leaderboard | [app.js](app.js) |
| Settings dialog without focus trap or Escape | Accessibility | [app.js](app.js), [index.html](index.html) |
| Notification toast intercepting controls | UX | [main.css](main.css) |
| `TOOLBAR_ICONS` duplicated SVG markup | Tech debt | [index.html](index.html), [app.js](app.js) |
| Toolbar timer ladder + impure `calculateOptimalToolbarPosition()` | Refactor | [app.js](app.js) |
| uClick double download | Performance | [comicExtractor.js](comicExtractor.js) |
| Fandom eight-request lookup + transient-error caching | Performance | [comicExtractor.js](comicExtractor.js) |
| `SKIP_WAITING` unreachable / incoherent update model | Service worker | [serviceworker.js](serviceworker.js), [init.js](init.js) |
| Settings version scraped from source | Architecture | [app.js](app.js), [serviceworker.js](serviceworker.js) |
| Durable Object rewriting the whole counts map per vote | Scalability | [worker/favorites-api/index.js](worker/favorites-api/index.js) |
| Google sync untestable outside production + duplicated client id | DX / Security | [googleDriveSync.js](googleDriveSync.js), [worker/favorites-api/wrangler.toml](worker/favorites-api/wrangler.toml) |
| Orphaned image assets | Cleanup | [tools/verify-assets.cjs](tools/verify-assets.cjs) |
| Stale `.vscode/tasks.json` Python path | Tooling | `.vscode/tasks.json` |
| `MODULE_TYPELESS_PACKAGE_JSON` warning | Tooling | [package.json](package.json) |
| Source-text unit tests | Testing | [tests/unit/app-contracts.test.mjs](tests/unit/app-contracts.test.mjs), [tests/unit/serviceworker.test.mjs](tests/unit/serviceworker.test.mjs) |

Notable implementation details:

- **Leaderboard storage** now keeps one `count:<version>:<date>` record per date plus a cached `top:<version>` window, migrates the legacy aggregate map on first write, and sweeps expired `rate:` records from a Durable Object alarm.
- **Service worker updates** no longer `skipWaiting()` on install. A new worker parks in `waiting` until the user accepts the in-app banner, which posts `SKIP_WAITING`; `init.js` reloads on the resulting `controllerchange`. The settings footer asks the active worker for its version over a `MessageChannel` (`GET_VERSION`) instead of refetching and regex-scraping the worker source.
- **Google Identity Services** is injected on demand by `googleDriveSync.js` rather than shipped as an eager `<script>` in `index.html`. Returning users (stored profile or enabled sync flag) still get it during bootstrap; first-time visitors never download it.
- **Unit tests** for `serviceworker.js` and `app.js` now execute the real code in a `vm`/stubbed-DOM harness instead of matching regexes against the source.

### Still open

- [ ] `app.js` module extraction (see the July 27 item) — the largest remaining architectural debt.
- [ ] Mobile LCP target of 3.0 s — unblocked by the extraction above plus a deploy-only minification step.
- [ ] 22 development-only `npm audit` advisories — accepted; `npm audit --omit=dev` is clean and enforced in CI.

### July 28, 2026 Backlog Summary

| Priority | Closed in this pass | Still open |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 3 | 2 |
| Medium | 12 | 0 |
| Low | 9 | 1 |
| **Total** | **24** | **3** |


