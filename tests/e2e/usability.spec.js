const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8WU3wAAAABJRU5ErkJggg==',
  'base64'
);

async function mockExternalServices(page, options = {}) {
  const context = page.context();
  const topFavorites = options.topFavorites || [
    { date: '1978/06/19', count: 10 },
    { date: '1978/06/20', count: 5 }
  ];

  const comicHtml = (url) => {
    const target = new URL(url);
    const [year = '2026', month = '04', day = '29'] = target.pathname.split('/').filter(Boolean).slice(-3);
    const imageUrl = `https://featureassets.gocomics.com/assets/${year}${month}${day}abcdef0123456789abcdef`;
    return `<!doctype html><html><head><meta property="og:image" content="${imageUrl}"></head><body></body></html>`;
  };

  await context.route('**/{favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png}', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await context.route('https://accounts.google.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  await context.route('https://favorites-api.garfieldapp.workers.dev/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topFavorites) });
  });
  await context.route('https://featureassets.gocomics.com/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await context.route('https://static.wikia.nocookie.net/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await context.route('https://assets.amuniversal.com/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await context.route('https://buymeacoffee.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body>Buy Me a Coffee</body></html>' });
  });
  await context.route('https://ko-fi.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body>Ko-fi</body></html>' });
  });
  await context.route('https://garfield.fandom.com/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ query: { pages: [{ imageinfo: [{ url: 'https://static.wikia.nocookie.net/garfield/images/mock.png' }] }] } })
    });
  });
  await context.route('https://corsproxy.garfieldapp.workers.dev/**', route => {
    const requestUrl = new URL(route.request().url());
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(decodeURIComponent(requestUrl.search.slice(1))) });
  });
  await context.route('https://api.codetabs.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(route.request().url()) });
  });
  await context.route('https://api.allorigins.win/**', route => {
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: comicHtml(route.request().url()) });
  });
}

async function openApp(page) {
  await mockExternalServices(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
}

async function setUsableMidRangeDate(page) {
  await page.locator('#DatePicker').fill('1978-06-20');
  await page.locator('#DatePicker').dispatchEvent('change');
  await expect(page.locator('#Previous')).toBeEnabled();
  await expect(page.locator('#Next')).toBeEnabled();
  await page.evaluate(() => document.activeElement?.blur());
}

async function expectNoSeriousAxeViolations(page, contextLabel) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severeViolations = results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  expect(severeViolations, contextLabel).toEqual([]);
}

async function clickSettingsControl(page, selector) {
  await page.locator('.settings-content').evaluate((container, targetSelector) => {
    container.querySelector(targetSelector)?.scrollIntoView({ block: 'center' });
  }, selector);
  await page.locator(selector).click();
}

test('core screens have no serious automated accessibility violations', async ({ page }) => {
  await openApp(page);
  await expectNoSeriousAxeViolations(page, 'main comic viewer');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
  await expectNoSeriousAxeViolations(page, 'settings dialog');

  await clickSettingsControl(page, '#top10Btn');
  await expect(page.locator('#top10Modal')).toHaveClass(/visible/);
  await expectNoSeriousAxeViolations(page, 'top favorites dialog');
  await page.locator('#top10CloseBtn').click();

  await page.locator('#settingsCloseBtn').click();
  await page.locator('#supportBtn').click();
  await expect(page.locator('#donationModal')).toHaveClass(/visible/);
  await expectNoSeriousAxeViolations(page, 'support dialog');
});

test('keyboard users can discover and activate the main workflow controls', async ({ page }) => {
  await openApp(page);
  await setUsableMidRangeDate(page);
  await page.locator('#First').focus();

  const focusedControls = ['First'];
  for (let step = 0; step < 13; step += 1) {
    focusedControls.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim() || ''));
    const focusVisible = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return false;
      const style = getComputedStyle(element);
      return style.boxShadow !== 'none' || style.outlineStyle !== 'none';
    });
    expect(focusVisible).toBe(true);
    await page.keyboard.press('Tab');
  }

  expect(focusedControls).toContain('First');
  expect(focusedControls).toContain('Previous');
  expect(focusedControls).toContain('Random');
  expect(focusedControls).toContain('DatePickerBtn');
  expect(focusedControls).toContain('Next');
  expect(focusedControls).toContain('Last');
  expect(focusedControls).toContain('supportBtn');
  expect(focusedControls).toContain('settingsBtn');
  expect(focusedControls).toContain('favheart');
  expect(focusedControls).toContain('Shuffle');
  expect(focusedControls).toContain('shareBtn');
  expect(focusedControls).not.toContain('DatePicker');

  await page.locator('#settingsBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsDIV')).not.toHaveClass(/visible/);
});

test('visible controls use understandable names for non-technical users', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#settingsCloseBtn').click();
  await page.locator('#supportBtn').click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await clickSettingsControl(page, '#top10Btn');

  const unnamedControls = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button, input, select, a[href]')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.disabled;
      });

    return controls
      .filter(element => {
        const text = element.textContent?.trim();
        const label = element.getAttribute('aria-label') || [...(element.labels || [])].map(item => item.textContent?.trim()).join(' ');
        const title = element.getAttribute('title');
        const labelledBy = element.getAttribute('aria-labelledby');
        return !text && !label && !title && !labelledBy;
      })
      .map(element => element.id || element.className || element.tagName);
  });

  expect(unnamedControls).toEqual([]);
});

test('mobile layout keeps important touch targets large enough and readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();

  const undersizedTargets = await page.evaluate(() => {
    const selectors = [
      '.toolbar-button:not(:disabled)',
      '.icon-button:not(:disabled)',
      '.backup-button:not(:disabled)',
      '.settings-close',
      '.source-select',
      '.setting-item'
    ];

    return [...document.querySelectorAll(selectors.join(','))]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map(element => ({
        name: element.id || element.textContent?.trim() || element.className,
        width: Math.round(element.getBoundingClientRect().width),
        height: Math.round(element.getBoundingClientRect().height)
      }))
      .filter(target => target.width < 44 || target.height < 44);
  });

  expect(undersizedTargets).toEqual([]);
  await expect(page.locator('#settingsDIV')).toBeInViewport();
  await expect(page.locator('#comic')).toBeInViewport();
});
