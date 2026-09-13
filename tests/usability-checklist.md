# Non-Technical User Usability Checklist

Use this script with someone who has not worked on the app. Do not coach them unless they are blocked; note where they hesitate, misclick, or ask what something means.

## Setup

- Open the app on desktop and mobile-sized browser windows.
- Include 1440x900 desktop, 390x844 phone, 320x568 small phone, and 844x390 landscape viewports.
- Use actual weekday and Sunday comics for visual checks; the automated workflow fixtures use tiny placeholder images.
- Start with a clean browser profile or clear site data.
- Ask the tester to think out loud while completing each task.

## Tasks

1. Find yesterday's Garfield comic.
2. Jump to a comic from a specific date.
3. Add the current comic to favorites, then remove it.
4. Turn on Spanish comics and explain what changed.
5. Change the comic source and describe whether the choice is understandable.
6. Show only favorites, then return to normal browsing.
7. Turn on remember-last-comic, reload the page, and confirm where the app opens.
8. Open Top Favorites, pick one, browse within that list, then exit Top Favorites.
9. Export favorites and import a favorites file.
10. Find the support/donation options and close the dialog.
11. Use the app with only the keyboard: Tab, Enter, Space, and Escape.
12. On mobile, use touch controls and try swiping between comics.
13. Open settings and resize between portrait, landscape, and desktop. Confirm the entire panel, close button, and footer remain visible, and scroll to activate Top Favorites.
14. On a desktop viewport shorter than a Sunday comic, scroll to the bottom using the scrollbar and then back to the top. The navigation toolbar must scroll with the page without covering the comic or changing its saved position.

## What To Record

- First place the tester hesitated.
- Any icon or label they did not understand.
- Any control that looked disabled or unclickable but was needed.
- Any text that was too small, clipped, or hard to read.
- Any step where they needed help.
- Any setting whose effect was unclear after changing it.

## Pass Criteria

- The tester can complete core browsing, favorites, settings, and Top Favorites tasks without written instructions.
- Keyboard-only use reaches every important control and provides visible focus feedback.
- Mobile controls are comfortable to tap and do not overlap.
- Error or empty states explain what happened and what to do next.

## Automated And Visual Audit: 2026-09-13

- Fixed the settings panel extending below short viewports: an extra top margin displaced the fixed, centered panel. Added full-panel bounds and reachable-control regression coverage at all four sizes above.
- Fixed desktop Sunday-comic scrolling: the navigation toolbar now follows page scrolling, and its saved position uses page coordinates. Added a tall-comic scroll regression for both Chromium profiles and verified the live Sunday comic at 1440x700.
- Lint, syntax, asset verification, and all 106 unit tests passed.
- Desktop Chromium: 43 passed, 2 intentionally skipped. Mobile Chromium (Pixel 5 emulation): 40 passed, 5 intentionally skipped.
- Cross-browser smoke checks passed in Chromium, Firefox, WebKit, and iPhone 13 Safari emulation.
- Covered navigation, favorites, language settings, import/export, sharing fallbacks, keyboard focus, mobile rotation/swipes, and desktop offline caching. Automated accessibility checks found no serious or critical violations on the tested screens.
- Visually inspected a live Sunday comic at desktop, phone, small-phone, and landscape sizes, including light and dark themes. Checked 44px main touch targets and no horizontal page overflow on the small phone.
- Live readiness is not verified: the dedicated CORS proxy health check received HTTP 403 from the GoComics request. The favorites API health check passed.
- The live Lighthouse gate failed because it did not observe a decoded first comic after roughly 30 seconds of discovery. Its headline scores must not be treated as a successful comic-viewing visit. Repeat the live-provider checks before deployment.
- Physical Android/iOS devices, native share sheets, real Google sign-in, and an independent non-technical user session remain manual checks. Browser emulation and mocked workflows do not replace these checks.
