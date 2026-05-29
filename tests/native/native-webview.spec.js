const { test, expect, chromium } = require('@playwright/test');
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const nativeDir = path.join(repoRoot, 'windows-native');
const buildScript = path.join(nativeDir, 'BuildAndRun.ps1');
const debugPort = Number(process.env.GARFIELD_NATIVE_TEST_PORT || 9223);
const nativeUrl = 'https://garfield.local/index.html';
const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8WU3wAAAABJRU5ErkJggg==',
  'base64'
);

let browser;
let page;
let launchProcess;
let consoleErrors = [];
let pageErrors = [];
let requestErrors = [];

function runPowerShell(command) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
}

function stopExistingApp() {
  runPowerShell("Get-Process GarfieldNative -ErrorAction SilentlyContinue | Stop-Process -Force");
}

async function waitForCdpEndpoint() {
  const deadline = Date.now() + 90_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for WebView2 CDP endpoint on port ${debugPort}: ${lastError?.message || 'no response'}`);
}

function launchNativeApp() {
  launchProcess = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    buildScript,
    '-Detach',
    '-RemoteDebuggingPort',
    String(debugPort)
  ], {
    cwd: nativeDir,
    env: {
      ...process.env,
      GARFIELD_NATIVE_REMOTE_DEBUGGING_PORT: String(debugPort)
    },
    windowsHide: true
  });

  launchProcess.stdout?.on('data', chunk => process.stdout.write(chunk));
  launchProcess.stderr?.on('data', chunk => process.stderr.write(chunk));
}

async function findNativePage() {
  await expect.poll(() => browser.contexts().flatMap(context => context.pages()).length, {
    timeout: 20_000
  }).toBeGreaterThan(0);

  const pages = browser.contexts().flatMap(context => context.pages());
  return pages.find(candidate => candidate.url().startsWith('https://garfield.local/')) || pages[0];
}

async function mockExternalServices(targetPage, options = {}) {
  const topFavorites = options.topFavorites || [
    { date: '1978/06/19', count: 10 },
    { date: '1978/06/20', count: 5 }
  ];

  const comicHtml = requestUrl => {
    const target = new URL(requestUrl);
    const [year = '2026', month = '04', day = '29'] = target.pathname.split('/').filter(Boolean).slice(-3);
    const imageUrl = `https://featureassets.gocomics.com/assets/${year}${month}${day}abcdef0123456789abcdef`;
    const canonical = `https://www.gocomics.com/garfield/${year}/${month}/${day}`;
    return `<!doctype html><html><head><link rel="canonical" href="${canonical}"><meta property="og:image" content="${imageUrl}"></head><body></body></html>`;
  };

  await targetPage.route('https://accounts.google.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  await targetPage.route('https://favorites-api.garfieldapp.workers.dev/**', route => {
    const requestUrl = new URL(route.request().url());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: requestUrl.pathname === '/top' ? JSON.stringify(topFavorites) : JSON.stringify({ ok: true, count: 1 })
    });
  });
  await targetPage.route('https://featureassets.gocomics.com/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await targetPage.route('https://static.wikia.nocookie.net/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await targetPage.route('https://assets.amuniversal.com/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await targetPage.route('https://buymeacoffee.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body>Buy Me a Coffee</body></html>' });
  });
  await targetPage.route('https://ko-fi.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body>Ko-fi</body></html>' });
  });
  await targetPage.route('https://garfield.fandom.com/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ query: { pages: [{ imageinfo: [{ url: 'https://static.wikia.nocookie.net/garfield/images/mock.png' }] }] } })
    });
  });
  await targetPage.route('https://corsproxy.garfieldapp.workers.dev/**', route => {
    const requestUrl = new URL(route.request().url());
    const targetUrl = decodeURIComponent(requestUrl.search.slice(1));
    if (targetUrl.includes('featureassets.gocomics.com') || targetUrl.includes('assets.amuniversal.com')) {
      route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
      return;
    }

    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(targetUrl) });
  });
  await targetPage.route('https://api.codetabs.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(route.request().url()) });
  });
  await targetPage.route('https://api.allorigins.win/**', route => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(route.request().url()) });
  });
}

async function openNativeApp() {
  consoleErrors = [];
  pageErrors = [];
  requestErrors = [];

  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) {
      requestErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    requestErrors.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`);
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true
    });

    window.__showPickerCalls = 0;
    HTMLInputElement.prototype.showPicker = function showPicker() {
      window.__showPickerCalls += 1;
    };
  });

  await mockExternalServices(page);
  await page.goto(nativeUrl, { waitUntil: 'load' });
  await expect(page.locator('#comic')).toBeVisible();
  await expect.poll(() => page.locator('#comic').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
}

async function resetNativeAppState() {
  consoleErrors = [];
  pageErrors = [];
  requestErrors = [];

  await page.goto(nativeUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.__showPickerCalls = 0;
  });
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#comic')).toBeVisible();
  await expect.poll(() => page.locator('#comic').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
}

async function setUsableMidRangeDate() {
  await page.locator('#DatePicker').fill('1978-06-20');
  await page.locator('#DatePicker').dispatchEvent('change');
  await expect(page.locator('#Previous')).toBeEnabled();
  await expect(page.locator('#Next')).toBeEnabled();
  await page.evaluate(() => document.activeElement?.blur());
}

async function clickSettingsControl(selector) {
  await page.locator('.settings-content').evaluate((container, targetSelector) => {
    container.querySelector(targetSelector)?.scrollIntoView({ block: 'center' });
  }, selector);
  await page.locator(selector).click();
}

test.describe.serial('native WinUI WebView2 app parity', () => {
  test.beforeAll(async () => {
    stopExistingApp();
    launchNativeApp();
    await waitForCdpEndpoint();
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    page = await findNativePage();
    await openNativeApp();
  });

  test.beforeEach(async () => {
    await resetNativeAppState();
  });

  test.afterAll(async () => {
    await browser?.close().catch(() => {});
    stopExistingApp();
    launchProcess?.kill();
  });

  test('boots from the native WebView host without runtime errors', async () => {
    await expect(page).toHaveURL(/https:\/\/garfield\.local\/index\.html/);
    await expect(page).toHaveTitle(/Daily Garfield Comics/);

    for (const selector of ['#First', '#Previous', '#Random', '#DatePickerBtn', '#Next', '#Last', '#supportBtn', '#settingsBtn', '#favheart', '#Shuffle', '#shareBtn']) {
      await expect(page.locator(selector)).toBeVisible();
      await expect(page.locator(selector)).toHaveAttribute('aria-label', /\S/);
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(requestErrors).toEqual([]);
  });

  test('keeps date navigation and favorites behavior working in WebView2', async () => {
    await setUsableMidRangeDate();
    const startDate = await page.locator('#DatePicker').inputValue();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#DatePicker')).not.toHaveValue(startDate);

    const favoriteDate = (await page.locator('#DatePicker').inputValue()).replaceAll('-', '/');
    await page.locator('#favheart').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).toContain(favoriteDate);
    await expect(page.locator('#favheart svg path')).toHaveAttribute('fill', 'currentColor');
  });

  test('keeps settings, localization, favorites-only, and top favorites usable', async () => {
    await setUsableMidRangeDate();
    await page.locator('#favheart').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]').length)).toBe(1);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);

    await page.locator('#spanish').check();
    await expect(page.getByRole('button', { name: 'Anterior' })).toBeVisible();
    await page.locator('#spanish').uncheck();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();

    await page.locator('#comicSource').selectOption('fandom');
    await expect(page.locator('#spanish-setting-row')).toHaveCSS('display', 'none');
    await page.locator('#comicSource').selectOption('gocomics');
    await expect(page.locator('#spanish-setting-row')).not.toHaveCSS('display', 'none');

    await page.locator('#showfavs').check();
    await expect(page.locator('#DatePicker')).toBeDisabled();
    await page.locator('#showfavs').uncheck();
    await expect(page.locator('#DatePicker')).toBeEnabled();

    await clickSettingsControl('#top10Btn');
    await expect(page.locator('#top10Modal')).toHaveClass(/visible/);
    await expect(page.locator('.top10-entry')).toHaveCount(2);
    await page.locator('.top10-entry').first().click();
    await expect(page.locator('#top10Indicator')).toBeVisible();
    await expect(page.locator('#DatePicker')).toBeDisabled();
    await page.locator('#top10ExitBtn').click();
    await expect(page.locator('#top10Indicator')).toHaveCount(0);
    await expect(page.locator('#DatePicker')).toBeEnabled();
  });

  test('keeps native-origin app shell and date picker affordance available', async () => {
    if (await page.locator('#top10ExitBtn').isVisible()) {
      await page.locator('#top10ExitBtn').click();
    }
    if (await page.locator('#top10CloseBtn').isVisible()) {
      await page.locator('#top10CloseBtn').click();
    }
    if (await page.locator('#settingsDIV.visible').isVisible()) {
      await page.locator('#settingsCloseBtn').click();
    }

    await page.locator('#DatePickerBtn').scrollIntoViewIfNeeded();
    await page.locator('#DatePickerBtn').click();
    await expect.poll(() => page.evaluate(() => window.__showPickerCalls)).toBe(1);

    await expect.poll(() => page.evaluate(() => window.isSecureContext)).toBe(true);
    await expect.poll(() => page.evaluate(async () => {
      const response = await fetch('./serviceworker.js', { cache: 'no-store' });
      return response.ok;
    })).toBe(true);
  });
});