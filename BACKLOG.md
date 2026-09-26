# Garfield App Backlog

Last reconciled against the repository on September 26, 2026.

This file contains only work that still needs implementation, live verification, or an explicit operational decision. Completed findings and their validation history are recorded in [REPAIR-2026-09-07.md](REPAIR-2026-09-07.md) and [REVIEW-2026-09-07.md](REVIEW-2026-09-07.md).

## September 26, 2026 Review

Syntax, lint, asset, unit, deterministic first-visit, Chromium/mobile Chromium E2E, and Chromium/Firefox/WebKit/mobile Safari smoke checks passed. The production dependency audit found no vulnerabilities. The live Favorites API check passed. The GoComics proxy check's HTTP 403 was traced to GoComics' user-agent-dependent bot challenge, not to the proxy or the local origin (see R06). A live-provider Lighthouse run decoded a comic and passed the non-strict audit, but its 0.76 performance score and 5.03-second LCP remained below R15's targets.

Resolved the same day, with every acceptance criterion validated:

- **C02 (dead bindings):** removed `previousUrl` and the unused module-scoped `pictureUrl` from [app.js](app.js).
- **C03 (orphan-asset guard):** [tools/verify-assets.cjs](tools/verify-assets.cjs) now resolves references to exact repository paths (root-relative, file-relative, URL pathnames, query strings, srcset candidates), scans `android/` and `ios/`, and allows unreferenced images only through documented exceptions that are themselves reported once stale. [tests/unit/verify-assets.test.mjs](tests/unit/verify-assets.test.mjs) covers the substring and platform-directory false negatives.
- **C04 (comic transitions):** transition clones are created by `createTransitionClone()` in [comicPresentation.js](comicPresentation.js) with `aria-hidden="true"` and empty `alt`; when `prefers-reduced-motion: reduce` is set, `loadComic()` swaps the comic immediately, including in rotated/fullscreen view, with no clones or 500–600 ms timers. New Playwright tests cover adjacent, jump, rapid, rotated, and reduced-motion navigation. They fail against the previous implementation. After a race in the rotated test was fixed (it now waits for each comic to commit before the next swipe), they passed 75 of 75 stress runs with 8 workers.
- **C05 (remaining dead bindings, found during this review):** removed `getPrimaryComicElement()`, an unused fallback `toolbarHeight`, the write-only `_shuffleNextDate`, and the write-only `swipeDetected` from [app.js](app.js). `npx eslint app.js` now reports no warnings.
- **Mixed-language alt text (found while investigating R06):** with the Spanish interface, the English fallback strip's alt text mixed languages ("Garfield for 19 de junio de 1978 (English)"). `describeComic()` in [comicPresentation.js](comicPresentation.js) now writes the sentence in the interface language and names the strip's language inside it ("Garfield del 19 de junio de 1978 (inglés)"). English-on-English and Spanish-on-Spanish descriptions are unchanged. The existing Spanish fallback E2E test now asserts the exact string; an equivalent test failed against the old code with the mixed string.
- **R14 (split `app.js` into feature modules):** `app.js` went from 4,823 to about 2,690 lines; the no-growth cap is now 2,750. Extracted modules, each under 800 lines and wired with explicit `configure?()` dependencies:
  - [config.js](config.js)
  - [toolbarLayout.js](toolbarLayout.js)
  - [gestures.js](gestures.js)
  - [verticalComic.js](verticalComic.js)
  - [favoritesApi.js](favoritesApi.js)
  - [top10.js](top10.js), loaded lazily
  - [focusTrap.js](focusTrap.js)

  Shared state removed or narrowed:
  - `formatDate()` and the `year`/`month`/`day` globals were removed, and seven duplicated date commits became one `commitSelectedDate()`.
  - The duplicated slide/morph animations for the page and rotated comics became one `transitionComicImage()`.
  - The duplicated boot sequence, and the two canvas conversions in `sharing.js`, were merged.
  - Top Favorites browse state, toolbar placement state and gesture/rotation state are now private to their modules.

  Dead code removed: `_canAutoSync()`, three unused `window.*Top10*` exports, three translation keys, four `CONFIG` entries, and CSS for `dissolve`, `morph-in`, `morph-resolve`, `landscape-toolbar` and `toolbar-datepicker-btn`.

  Validation: temporary visual baselines of 17 UI states matched after every step. The contract tests for voting and migration now exercise `favoritesApi.js` directly instead of slicing `app.js` source.
- **R15 (time to first comic):**
  - `<link rel="modulepreload">` now covers the whole static module graph, and the asset guard enforces it with the precache lists.
  - In [tests/support/throttled-first-visit.cjs](tests/support/throttled-first-visit.cjs) (HTTP/2, mobile throttling, median of 7), first comic display went from 2,917 ms (before) to about 2,200 ms, and LCP from 2,980 ms to about 2,230 ms.
  - Three consecutive strict live Lighthouse runs passed: performance 0.94?0.95, LCP 2,929?2,958 ms, Speed Index about 1,560 ms, each with a decoded live comic and no fallback. The previous code measured LCP 3,218 ms under the same conditions.
  - The LCP margin is only about 50 ms, and live results depend on GoComics' bot protection (see R06).
  - Minification was measured (about ?55 ms, script transfer 68 ? 40 KiB) and not adopted, because it would need a build step.
  - Re-audit the deployed site with `npm run test:lighthouse -- --url https://garfieldapp.pages.dev/ --strict-performance`.

## Release Verification

<a id="r02"></a>
### R02: Verify Drive favorites convergence with the live API

**Priority:** High
**Category:** Data / release verification
**Affected files:** [driveFavorites.js](driveFavorites.js), [driveSyncState.js](driveSyncState.js), [googleDriveSync.js](googleDriveSync.js), [tests/unit/drive-coordinator.test.mjs](tests/unit/drive-coordinator.test.mjs), [tests/unit/drive-state.test.mjs](tests/unit/drive-state.test.mjs)

The repository now has versioned favorite state, tombstones, deterministic merging, serialized/coalesced writes, account isolation, duplicate-file reconciliation, conditional writes, and failure tests. The remaining gap is live verification of Google Drive's ETag and `If-Match` behavior.

**Decision required:** Do not sign off multi-device sync until the live contract is verified, or explicitly accept the residual risk and document it.

**Acceptance criteria:**

- Two browsers signed into one test account converge after independent additions.
- A deletion is not resurrected when a stale browser reconnects.
- Reversed upload completion preserves the latest intent.
- Concurrent first sync creates one canonical app-data file.
- Missing or conflicting validators retain local changes and leave sync visibly pending.

**Validation:** Run two-device add/remove, offline reconnect, interrupted sync, account-switch, and concurrent-first-creation scenarios against a non-production test account.

<a id="r06"></a>
### R06: Decide how the live health check treats GoComics bot challenges

**Priority:** Medium (lowered from High on September 26: real-browser users are unaffected)
**Category:** Deployment / reliability decision
**Affected files:** [tests/support/live-worker-health.cjs](tests/support/live-worker-health.cjs), [worker/index.js](worker/index.js)

**Root cause (September 26, CONFIRMED):** the 403 does not come from the proxy's origin checks. `http://127.0.0.1` and `http://localhost` are explicitly allowed, and a foreign origin is rejected with a different, JSON response. The 403 is GoComics' own "Establishing a secure connection" bot challenge to the worker's request to GoComics, passed through unchanged. The worker forwards the caller's `User-Agent`, and the challenge follows it:

- A normal Chrome user agent and Node's default user agent returned 200 every time, from both origins.
- `HeadlessChrome` was challenged 4 of 4 times, so headless automation (Playwright production runs) falls back to other sources.
- The self-identifying health-check user agent varies over time: 25 of 25 passed in one window and 4 of 4 were challenged an hour later.

**Resolved in this review:**

- **Spanish parity:** verified through the dedicated proxy for 2026-09-07, 2026-04-29 (both previously 403) and 2026-09-25. Each page and its GIF image bytes were returned.
- **Health check rebuilt:** [tests/support/live-worker-health.cjs](tests/support/live-worker-health.cjs) now checks English and Spanish comics and fetches the comic image through the proxy, verifying real image bytes. It retries twice with backoff and reports an upstream challenge separately from proxy faults. Missing proxy identity or wrong CORS headers still fail immediately. [tests/unit/live-worker-health.test.mjs](tests/unit/live-worker-health.test.mjs) covers this offline.
- **Proxy security:** origin restrictions and host/redirect allowlists remain covered by `tests/unit/worker-cors-proxy.test.mjs`.

**Decision required:** while GoComics challenges the self-identifying probe, `npm run test:workers` (and therefore `test:predeploy`) fails with "GoComics returned its bot challenge… not an origin or proxy fault". Choose one:

1. Keep failing (current behavior).
2. Report a persistent upstream challenge as a warning while proxy and API faults still fail.
3. Change the probe's user agent.

Do not disguise the probe or the worker as a browser to evade the challenge.

## Repository Cleanup

### C01: Remove confirmed dead assets

**Priority:** Low
**Category:** Cleanup
**Affected files:** [android/maskable_icon_x682.png](android/maskable_icon_x682.png)

The unused legacy screenshot was removed during the September 13, 2026 screenshot refresh. The remaining icon is not referenced by the manifest, HTML, CSS, JavaScript, service worker, browser configuration, tests, or documentation as a live asset. The asset guard now detects it and keeps it only through a documented `RETAINED_UNREFERENCED_IMAGES` exception in [tools/verify-assets.cjs](tools/verify-assets.cjs).

**Acceptance criteria:** Remove the remaining icon and its guard exception after confirming no separately deployed sibling application consumes its repository URL, then run the asset guard and browser smoke tests.

## Operational Decision

### D01: Confirm the active Google Search Console verification method

**Priority:** Low
**Category:** Operations / cleanup
**Affected files:** [googledd48f5e8f45ab4e2.html](googledd48f5e8f45ab4e2.html), [index.html](index.html)

The standalone HTML verification file is not referenced by the application, while `index.html` contains a different Google verification meta token. Either method may still grant ownership to a different Search Console user.

**Decision required:** Check Search Console ownership details. Remove the HTML file only if no active owner depends on file-based verification; otherwise document why both methods are retained.

## Summary

| Priority | Implementation | Verification / decision | Total |
|---|---:|---:|---:|
| High | 0 | 1 | 1 |
| Medium | 0 | 1 | 1 |
| Low | 1 | 1 | 2 |
| **Total** | **1** | **3** | **4** |