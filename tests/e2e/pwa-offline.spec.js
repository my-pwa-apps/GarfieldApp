const { test, expect } = require('@playwright/test');

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8WU3wAAAABJRU5ErkJggg==',
  'base64'
);

async function mockExternalServices(page) {
  const context = page.context();
  const comicHtml = '<!doctype html><html><head><meta property="og:image" content="https://featureassets.gocomics.com/assets/offline-test-image"></head><body></body></html>';

  await context.route('**/{favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png}', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await context.route('https://accounts.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await context.route('https://favorites-api.garfieldapp.workers.dev/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await context.route('https://featureassets.gocomics.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng }));
  await context.route('https://corsproxy.garfieldapp.workers.dev/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml }));
  await context.route('https://api.codetabs.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml }));
  await context.route('https://api.allorigins.win/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml }));
  await context.route('https://garfield.fandom.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ query: { pages: [{ imageinfo: [{ url: 'https://featureassets.gocomics.com/assets/offline-test-image' }] }] } })
  }));
}

test('service worker precaches the app shell and serves it while offline', async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium', 'Offline service worker lifecycle is covered in the desktop Chromium project.');

  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  });

  await mockExternalServices(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    await registration.update();
  });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/Daily Garfield Comics/);
  await expect(page.locator('#settingsBtn')).toBeVisible();
  await expect(page.locator('#DatePicker')).toBeVisible();
  expect(errors.filter(error => !error.includes('net::ERR_INTERNET_DISCONNECTED'))).toEqual([]);
});