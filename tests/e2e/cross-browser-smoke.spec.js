const { test, expect } = require('@playwright/test');

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8WU3wAAAABJRU5ErkJggg==',
  'base64'
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

async function mockExternalServices(page) {
  const context = page.context();
  const comicHtml = '<!doctype html><html><head><meta property="og:image" content="https://featureassets.gocomics.com/assets/cross-browser-smoke.png"><link rel="canonical" href="https://www.gocomics.com/garfield/2026/04/29"></head><body></body></html>';

  await context.route('**/{favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png}', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await context.route('https://accounts.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '', headers: corsHeaders }));
  await context.route('https://favorites-api.garfieldapp.workers.dev/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: corsHeaders }));
  await context.route('https://featureassets.gocomics.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng, headers: corsHeaders }));
  await context.route('https://assets.amuniversal.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng, headers: corsHeaders }));
  await context.route('https://static.wikia.nocookie.net/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng, headers: corsHeaders }));
  await context.route('https://buymeacoffee.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html></html>', headers: corsHeaders }));
  await context.route('https://ko-fi.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html></html>', headers: corsHeaders }));
  await context.route('https://garfield.fandom.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ query: { pages: [{ imageinfo: [{ url: 'https://static.wikia.nocookie.net/garfield/images/mock.png' }] }] } }),
    headers: corsHeaders
  }));
  await context.route('https://corsproxy.garfieldapp.workers.dev/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml, headers: corsHeaders }));
  await context.route('https://api.codetabs.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml, headers: corsHeaders }));
  await context.route('https://api.allorigins.win/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml, headers: corsHeaders }));
}

async function openApp(page) {
  const errors = [];
  page.on('pageerror', error => {
    if (!error.message.includes('document is sandboxed') && !error.message.includes('The operation is insecure') && !error.message.includes('access control checks')) {
      errors.push(error.message);
    }
  });
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.startsWith('Failed to load resource:') && !text.includes('Image corrupt or truncated') && !text.includes('Access-Control-Allow-Origin')) {
      errors.push(text);
    }
  });

  await mockExternalServices(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  return errors;
}

test('core comic workflow works across browser engines', async ({ page }) => {
  const errors = await openApp(page);

  await expect(page).toHaveTitle(/Daily Garfield Comics/);
  await expect(page.locator('#comic')).not.toHaveAttribute('src', /^$/);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
  await expect(page.locator('#comicSource')).toHaveValue('gocomics');
  await page.locator('#settingsCloseBtn').click();

  await page.locator('#favheart').click();
  await expect.poll(() => page.evaluate(() => window.UTILS.getFavorites().length)).toBe(1);
  await page.locator('#favheart').click();
  await expect.poll(() => page.evaluate(() => window.UTILS.getFavorites().length)).toBe(0);

  expect(errors).toEqual([]);
});