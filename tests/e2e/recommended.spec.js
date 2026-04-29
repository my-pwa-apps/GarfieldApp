const { test, expect } = require('@playwright/test');

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8WU3wAAAABJRU5ErkJggg==',
  'base64'
);

async function mockExternalServices(page, options = {}) {
  const context = page.context();
  const proxyFailuresRemaining = { count: options.proxyFailures || 0 };
  const comicRequests = [];

  const comicHtml = (url, source = 'garfield') => {
    const target = url ? new URL(url) : null;
    const dateParts = target?.pathname.split('/').filter(Boolean).slice(-3) || [];
    const [year = '2026', month = '04', day = '29'] = dateParts;
    const hash = `${year}${month}${day}${source}abcdef0123456789`;
    const imageUrl = `https://featureassets.gocomics.com/assets/${hash}`;
    return `<!doctype html><html><head><meta property="og:image" content="${imageUrl}"><link rel="canonical" href="https://www.gocomics.com/garfield/${year}/${month}/${day}"></head><body></body></html>`;
  };

  await context.route('**/{favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png}', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await context.route('https://accounts.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await context.route('https://favorites-api.garfieldapp.workers.dev/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await context.route('https://featureassets.gocomics.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng }));
  await context.route('https://assets.amuniversal.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng }));
  await context.route('https://static.wikia.nocookie.net/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng }));
  await context.route('https://buymeacoffee.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html></html>' }));
  await context.route('https://ko-fi.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html></html>' }));
  await context.route('https://garfield.fandom.com/**', route => {
    comicRequests.push(route.request().url());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ query: { pages: [{ imageinfo: [{ url: 'https://static.wikia.nocookie.net/garfield/images/mock.png' }] }] } })
    });
  });
  await context.route('https://corsproxy.garfieldapp.workers.dev/**', route => {
    comicRequests.push(route.request().url());
    if (proxyFailuresRemaining.count > 0) {
      proxyFailuresRemaining.count -= 1;
      route.fulfill({ status: 502, contentType: 'text/plain; charset=utf-8', body: 'proxy failure' });
      return;
    }
    const targetUrl = decodeURIComponent(new URL(route.request().url()).search.slice(1));
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(targetUrl, 'worker') });
  });
  await context.route('https://api.codetabs.com/**', route => {
    comicRequests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(route.request().url(), 'codetabs') });
  });
  await context.route('https://api.allorigins.win/**', route => {
    comicRequests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(route.request().url(), 'allorigins') });
  });

  return { comicRequests };
}

async function openApp(page, options = {}) {
  const requestLog = await mockExternalServices(page, options);
  const errors = [];
  page.on('pageerror', error => {
    if (!error.message.includes('document is sandboxed')) errors.push(error.message);
  });
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.startsWith('Failed to load resource:') && !text.includes('document is sandboxed')) {
      errors.push(text);
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  return { ...requestLog, errors };
}

async function openSettings(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
}

test('comic source fallback recovers when the preferred proxy fails', async ({ page }) => {
  const result = await openApp(page, { proxyFailures: 1 });

  await expect(page.locator('#comic-message')).toHaveCount(0);
  await expect(page.locator('#comic')).not.toHaveAttribute('src', /^$/);
  expect(result.comicRequests.length).toBeGreaterThanOrEqual(2);
  expect(result.errors).toEqual([]);
});

test('explicit comic source choices route to their expected providers', async ({ page }) => {
  const result = await openApp(page);

  await openSettings(page);
  await page.locator('#comicSource').selectOption('fandom');
  await expect.poll(() => result.comicRequests.some(url => url.includes('garfield.fandom.com'))).toBe(true);

  await page.locator('#comicSource').selectOption('uclick');
  await expect.poll(() => result.comicRequests.some(url => url.includes('picayune.uclick.com') || url.includes('allorigins') || url.includes('codetabs'))).toBe(true);
  expect(result.errors).toEqual([]);
});

test('corrupt and unknown local storage preferences recover without breaking boot', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('favs', '{bad json');
    localStorage.setItem('comicSource', 'mystery-source');
    localStorage.setItem('gDriveToken', '{bad json');
    localStorage.setItem('showfavs', 'true');
    localStorage.setItem('lastdate', 'true');
  });
  const result = await openApp(page);

  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  await openSettings(page);
  await expect(page.locator('#comicSource')).toHaveValue('gocomics');
  await expect.poll(() => page.evaluate(() => window.UTILS.getFavorites())).toEqual([]);
  expect(result.errors).toEqual([]);
});

test('settings, support, and top favorites layouts do not overlap critical controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await openSettings(page);
  const settingsOverlap = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('#settingsDIV button:not([disabled]), #settingsDIV select, #settingsDIV .setting-item')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map(element => ({ element, id: element.id || element.textContent.trim(), rect: element.getBoundingClientRect() }));
    for (let outer = 0; outer < controls.length; outer += 1) {
      for (let inner = outer + 1; inner < controls.length; inner += 1) {
        if (controls[outer].element.contains(controls[inner].element) || controls[inner].element.contains(controls[outer].element)) continue;
        const a = controls[outer].rect;
        const b = controls[inner].rect;
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (overlapX > 8 && overlapY > 8) return [controls[outer].id, controls[inner].id];
      }
    }
    return [];
  });
  expect(settingsOverlap).toEqual([]);

  await page.locator('#settingsCloseBtn').click();
  await page.locator('#supportBtn').click();
  await expect(page.locator('#donationModal')).toBeInViewport();
  await page.keyboard.press('Escape');
});

test('basic performance budget stays within an app-shell threshold', async ({ page }) => {
  const startedAt = Date.now();
  await openApp(page);
  const loadDuration = Date.now() - startedAt;
  const resourceCount = await page.evaluate(() => performance.getEntriesByType('resource').length);

  expect(loadDuration).toBeLessThan(10_000);
  expect(resourceCount).toBeLessThan(80);
});
