# Garfield App Backlog

Last reconciled against the repository on September 13, 2026.

This file contains only work that still needs implementation, live verification, or an explicit operational decision. Completed findings and their validation history are recorded in [REPAIR-2026-09-07.md](REPAIR-2026-09-07.md) and [REVIEW-2026-09-07.md](REVIEW-2026-09-07.md).

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
### R06: Resolve Spanish proxy parity and representative health checks

**Priority:** High
**Category:** Deployment / reliability
**Affected files:** [worker/index.js](worker/index.js), [worker/wrangler.toml](worker/wrangler.toml), [tests/support/live-worker-health.cjs](tests/support/live-worker-health.cjs)

The September 13 production-browser check confirms the live homepage already uses the dedicated proxy and decodes the English comic. Earlier checks showed a September 7 Spanish comic decoded through the shared proxy but returned `403` through the dedicated proxy; an April 29 Spanish request returned `403` through both. Those Spanish results have not been revalidated on the current deployment. The custom-user-agent health probe also returned `403` for an English request that succeeds with a browser-style user agent.

**Decision required:** Recheck Spanish parity on the currently published endpoint. Resolve any confirmed regression, or explicitly accept and document the degraded behavior; the former hold-publication instruction is obsolete.

**Acceptance criteria:**

- Compare deployed revisions, request headers, redirect handling, and cache state between both proxies.
- Verify at least one known-working English and Spanish comic through the dedicated endpoint in a real browser.
- Make the live health check validate extraction and decoded image bytes with representative browser behavior.
- Keep proxy identity, origin restrictions, and host/redirect allowlists covered separately.
- Do not weaken security controls to bypass upstream challenges.

## Engineering Work

<a id="r14"></a>
### R14: Extract client features behind explicit state contracts

**Priority:** High
**Category:** Architecture
**Affected files:** [app.js](app.js), [serviceworker.js](serviceworker.js), [tools/verify-assets.cjs](tools/verify-assets.cjs)

Several cohesive modules have been extracted, but [app.js](app.js) remains above 4,800 lines and still owns coupled navigation, date, image, prefetch, shuffle, rotation, settings, and leaderboard state. `formatDate()` still mutates shared globals, and date commits remain duplicated.

**Implementation:** Establish visual baselines, then extract one feature at a time behind explicit inputs, outputs, and state ownership. Prefer the canonical displayed-comic state and pure date formatting first, followed by the leaderboard, rotation/gestures, shuffle, and settings. Do not introduce a framework rewrite.

**Acceptance criteria:**

- `app.js` is fewer than 3,000 lines without moving the monolith unchanged into another file.
- Shared mutable bindings and duplicated date/image commits are materially reduced.
- Each extracted module remains below the repository's 800-line limit and has focused behavior tests.
- Static imports are present in both service-worker precache lists.
- Navigation, native messages, translations, offline updates, and responsive interactions retain visual and behavioral coverage.

<a id="r15"></a>
### R15: Reduce time to the first usable comic

**Priority:** High
**Category:** Performance
**Affected files:** [app.js](app.js), [comicExtractor.js](comicExtractor.js), [index.html](index.html), [main.css](main.css), [tests/support/lighthouse-audit.cjs](tests/support/lighthouse-audit.cjs)

The September 7 comparable audit measured LCP 4.66 seconds, Speed Index 8.32 seconds, and performance 0.71. GIS lazy loading, preconnects, image prioritization, and formatter reuse are already implemented, but the target remains unmet. A September 13 unthrottled production visit loaded English quickly, while a local live-provider Lighthouse run spent about 30 seconds discovering an image and did not capture a decoded comic. Its logo-based LCP is not a valid successful-comic baseline.

First-visit timing marks, deterministic desktop/mobile checks, SEO auditing, and an optional strict performance gate are now implemented. Use `npm run test:first-visit` for fixtures and `npm run test:lighthouse -- --strict-performance` for live measurements; do not combine their results or close this item based on instrumentation alone.

**Implementation:** Measure source discovery and fallback timing separately from client startup. Use that evidence to lazy-load optional extracted features and assess deploy-only minification while preserving no-build local development and offline support.

**Acceptance criteria:**

- Mobile LCP is below 3.0 seconds.
- Speed Index is below 5.8 seconds.
- Lighthouse performance is at least 0.80.
- All targets pass in three consecutive comparable cold audits with a decoded comic.
- Deterministic fixture measurements are reported separately from live-provider latency.

## Repository Cleanup

### C01: Remove confirmed dead assets

**Priority:** Low
**Category:** Cleanup
**Affected files:** [screenshot1.webp](screenshot1.webp), [android/maskable_icon_x682.png](android/maskable_icon_x682.png)

Neither image is referenced by the manifest, HTML, CSS, JavaScript, service worker, browser configuration, tests, or documentation as a live asset. Together they add 242,522 bytes to the repository and static deployment.

**Acceptance criteria:** Remove both files after confirming no separately deployed sibling application consumes their repository URLs, then run the asset guard and browser smoke tests.

### C02: Remove dead application bindings

**Priority:** Low
**Category:** Cleanup
**Affected files:** [app.js](app.js)

`previousUrl` is declared and assigned but never read. The module-scoped `pictureUrl` declaration is unused and is unrelated to the live `window.pictureUrl` property.

**Acceptance criteria:** Remove the `previousUrl` declaration and assignment plus the local `pictureUrl` declaration; syntax, lint, unit, and browser tests remain green.

### C03: Make orphaned-asset validation exact and complete

**Priority:** Medium
**Category:** Tooling
**Affected files:** [tools/verify-assets.cjs](tools/verify-assets.cjs), [tests/unit/app-contracts.test.mjs](tests/unit/app-contracts.test.mjs)

The current reverse check uses substring matching, so `screenshot1.webp` is falsely considered referenced by `garscreenshot1.webp`. It also skips the complete `android` and `ios` directories, which hides `android/maskable_icon_x682.png`.

**Implementation:** Compare normalized asset references exactly and include platform asset directories in orphan detection. Preserve exclusions only for generated or external-project content with a documented reason.

**Acceptance criteria:**

- The guard reports an asset whose basename is only a substring of another reference.
- The guard reports an unreferenced platform image.
- Every currently referenced manifest, tile, screenshot, HTML, CSS, and service-worker image still passes.
- Regression tests cover both false-negative cases.

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
| High | 2 | 2 | 4 |
| Medium | 1 | 0 | 1 |
| Low | 2 | 1 | 3 |
| **Total** | **5** | **3** | **8** |