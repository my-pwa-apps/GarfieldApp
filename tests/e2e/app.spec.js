const { test, expect } = require('@playwright/test');

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8WU3wAAAABJRU5ErkJggg==',
  'base64'
);

async function mockExternalServices(page, options = {}) {
  const context = page.context();
  const topFavorites = options.topFavorites || [];
  const topFavoritesStatus = options.topFavoritesStatus || 200;
  const topFavoritesSequence = options.topFavoritesSequence?.slice() || [
    { status: topFavoritesStatus, favorites: topFavorites }
  ];
  const failComics = options.failComics || false;
  const failShareImage = options.failShareImage || false;
  const googleScriptBody = options.googleScriptBody || '';
  const donationResponses = {
    bmc: {
      status: options.donationResponses?.bmc?.status || 200,
      body: options.donationResponses?.bmc?.body || '<!doctype html><html><body>Buy Me a Coffee</body></html>'
    },
    kofi: {
      status: options.donationResponses?.kofi?.status || 200,
      body: options.donationResponses?.kofi?.body || '<!doctype html><html><body>Ko-fi</body></html>'
    }
  };

  const comicHtml = (url, source = 'garfield') => {
    const target = url ? new URL(url) : null;
    const pathParts = target?.pathname.split('/').filter(Boolean) || [];
    const dateParts = pathParts.slice(-3);
    const [year = '2026', month = '04', day = '29'] = dateParts;
    const comicSlug = pathParts[0] || source;
    const hash = `${year}${month}${day}abcdef0123456789abcdef`;
    const imageUrl = `https://featureassets.gocomics.com/assets/${hash}`;
    const canonical = `https://www.gocomics.com/${comicSlug}/${year}/${month}/${day}`;

    return `<!doctype html><html><head><link rel="canonical" href="${canonical}"><meta property="og:image" content="${imageUrl}"></head><body></body></html>`;
  };

  await context.route('**/{favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png}', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });

  await context.route('https://accounts.google.com/**', route => {
    route.fulfill({ status: 200, contentType: 'text/javascript', body: googleScriptBody });
  });

  await context.route('https://favorites-api.garfieldapp.workers.dev/**', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === '/top') {
      const response = topFavoritesSequence.length > 1 ? topFavoritesSequence.shift() : topFavoritesSequence[0];
      const status = response.status || 200;
      const favorites = response.favorites || [];
      route.fulfill({
        status,
        contentType: 'application/json',
        body: status >= 400 ? JSON.stringify({ error: 'failed' }) : JSON.stringify(favorites)
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, count: 1 })
    });
  });

  await context.route('https://featureassets.gocomics.com/**', route => {
    const imageUrl = route.request().url();
    if (options.heldImagePattern && imageUrl.includes(options.heldImagePattern)) {
      options.onHeldImageRequest?.(imageUrl);
      (options.imageHoldPromise || Promise.resolve()).then(() => {
        route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
      });
      return;
    }

    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });

  await context.route('https://static.wikia.nocookie.net/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });

  await context.route('https://assets.amuniversal.com/**', route => {
    route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });

  await context.route('https://buymeacoffee.com/**', route => {
    route.fulfill({ status: donationResponses.bmc.status, contentType: 'text/html; charset=utf-8', body: donationResponses.bmc.body });
  });

  await context.route('https://ko-fi.com/**', route => {
    route.fulfill({ status: donationResponses.kofi.status, contentType: 'text/html; charset=utf-8', body: donationResponses.kofi.body });
  });

  await context.route('https://garfield.fandom.com/**', route => {
    if (failComics) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: { pages: [] } }) });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: {
          pages: [{ imageinfo: [{ url: 'https://static.wikia.nocookie.net/garfield/images/mock.png' }] }]
        }
      })
    });
  });

  await context.route('https://corsproxy.garfieldapp.workers.dev/**', route => {
    if (failComics) {
      route.fulfill({ status: 500, contentType: 'text/plain; charset=utf-8', body: 'Comic source unavailable' });
      return;
    }

    const requestUrl = new URL(route.request().url());
    const targetUrl = decodeURIComponent(requestUrl.search.slice(1));
    options.onComicProxyRequest?.(targetUrl);
    if (targetUrl.includes('featureassets.gocomics.com') || targetUrl.includes('assets.amuniversal.com')) {
      route.fulfill({
        status: failShareImage ? 500 : 200,
        contentType: failShareImage ? 'text/plain; charset=utf-8' : 'image/png',
        body: failShareImage ? 'Image unavailable' : transparentPng
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: comicHtml(targetUrl)
    });
  });

  await context.route('https://api.codetabs.com/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: failComics ? '<!doctype html><html><body>No comic image here</body></html>' : comicHtml(route.request().url(), 'codetabs')
    });
  });

  await context.route('https://api.allorigins.win/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: failComics ? '<!doctype html><html><body>No comic image here</body></html>' : comicHtml(route.request().url(), 'allorigins')
    });
  });
}

async function installMockClock(context, fixedIso) {
  await context.addInitScript(iso => {
    const fixedTime = new Date(iso).getTime();
    const RealDate = Date;

    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedTime]));
      }

      static now() {
        return fixedTime;
      }

      static parse(value) {
        return RealDate.parse(value);
      }

      static UTC(...args) {
        return RealDate.UTC(...args);
      }
    }

    Object.setPrototypeOf(MockDate, RealDate);
    MockDate.prototype = RealDate.prototype;
    globalThis.Date = MockDate;
  }, fixedIso);
}

async function openApp(page, url = '/', options = {}) {
  if (!options.allowPrefetch) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true },
        configurable: true
      });
    });
  }

  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      consoleErrors.push(message.text());
    }
  });

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const requestErrors = [];
  page.on('response', response => {
    if (response.status() >= 400) {
      requestErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    requestErrors.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`);
  });

  await mockExternalServices(page, options);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (options.failComics) {
    await expect(page.locator('#comic-message')).toBeVisible();
  } else {
    await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  }

  return { consoleErrors, pageErrors, requestErrors };
}

async function setComicDate(page, dateValue) {
  await page.locator('#DatePicker').fill(dateValue);
  await page.locator('#DatePicker').dispatchEvent('input');
  await page.waitForTimeout(500);
  await expect(page.locator('#DatePicker')).toHaveValue(dateValue);
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
}

async function openSettings(page) {
  if (!(await page.locator('#settingsDIV').evaluate(element => element.classList.contains('visible')))) {
    await page.getByRole('button', { name: 'Settings' }).click();
  }
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
}

async function importFavoritesFile(page, name, content) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('#importFavs').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(content)
  });
}

async function clickSettingsControl(page, selector) {
  await page.locator('.settings-content').evaluate((container, targetSelector) => {
    container.querySelector(targetSelector)?.scrollIntoView({ block: 'center' });
  }, selector);
  await page.locator(selector).click();
}

async function dispatchTouchGesture(page, selector, points) {
  await page.locator(selector).evaluate((element, gesturePoints) => {
    const createTouch = point => {
      if (typeof Touch === 'function') {
        return new Touch({
          identifier: 1,
          target: element,
          clientX: point.x,
          clientY: point.y,
          screenX: point.x,
          screenY: point.y,
          pageX: point.x,
          pageY: point.y
        });
      }

      return {
        identifier: 1,
        target: element,
        clientX: point.x,
        clientY: point.y,
        screenX: point.x,
        screenY: point.y,
        pageX: point.x,
        pageY: point.y
      };
    };

    const [start, end] = gesturePoints;
    const startTouch = createTouch(start);
    const endTouch = createTouch(end);
    element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [startTouch], targetTouches: [startTouch], changedTouches: [startTouch] }));
    element.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [endTouch], targetTouches: [endTouch], changedTouches: [endTouch] }));
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [endTouch] }));
  }, points);
}

test('boots and loads the current comic without runtime errors', async ({ page }) => {
  const errors = await openApp(page);

  await expect(page).toHaveTitle(/Daily Garfield Comics/);
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  await expect(page.locator('#comic')).not.toHaveAttribute('src', /^$/);
  await expect(page.locator('#Next')).toBeDisabled();
  await expect(page.locator('#Last')).toBeDisabled();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('ad placement shows a local placeholder until AdSense identifiers are configured', async ({ page }) => {
  const adRequests = [];
  page.on('request', request => {
    if (request.url().includes('googlesyndication.com') || request.url().includes('doubleclick.net')) {
      adRequests.push(request.url());
    }
  });

  const errors = await openApp(page);

  await expect(page.locator('#adSupportSlot')).toBeVisible();
  await expect(page.locator('#adSupportSlot')).toHaveAttribute('data-ad-state', 'placeholder');
  await expect(page.locator('.ad-placeholder-preview')).toBeVisible();
  await expect(page.locator('.ad-placeholder-preview')).toContainText('GarfieldApp Sponsor');
  await expect(page.locator('#adsenseScript')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.GarfieldAds?.isConfigured())).toBe(false);
  expect(adRequests).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('supporter code flow rejects invalid codes and stored supporters hide ads', async ({ page }) => {
  const errors = await openApp(page);

  await page.getByRole('button', { name: 'Support this App' }).click();
  await expect(page.locator('#donationModal')).toHaveClass(/visible/);
  await expect(page.locator('#donationSupporterHelp')).toContainText('garfieldapp@outlook.com');
  await page.getByLabel('Personal supporter code').fill('GARFIELD.invalid.code');
  await page.getByRole('button', { name: 'Apply code' }).click();

  await expect(page.locator('#donationSupporterStatus')).toContainText('not valid');
  await expect(page.locator('#adSupportSlot')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('supporterAdFree'))).toBeNull();

  await page.evaluate(() => {
    localStorage.setItem('supporterAdFree', 'true');
    localStorage.setItem('supporterLabel', 'Test Supporter');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);

  await expect(page.locator('#adSupportSlot')).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('supporterAdFree'))).toBe('true');
  await expect.poll(() => page.evaluate(() => window.GarfieldAds?.isSupporterAdFree())).toBe(true);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('settings and Spanish mode update labels and date boundaries', async ({ page }) => {
  const errors = await openApp(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);

  await page.locator('#spanish').check();
  await expect(page.locator('#spanish')).toBeChecked();
  await expect(page.locator('#Previous')).toHaveAttribute('aria-label', 'Anterior');
  await expect(page.locator('#DatePicker')).toHaveAttribute('min', '1999-12-06');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('spanish'))).toBe('true');

  await page.locator('#spanish').uncheck();
  await expect(page.locator('#Previous')).toHaveAttribute('aria-label', 'Previous');
  await expect(page.locator('#DatePicker')).toHaveAttribute('min', '1978-06-19');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('favorites update local storage and the heart state', async ({ page }) => {
  const errors = await openApp(page);

  const currentDate = await page.locator('#DatePicker').inputValue();
  const storedDate = currentDate.replaceAll('-', '/');
  const heartButton = page.locator('#favheart');
  const heartPath = page.locator('#favheart svg path');

  await heartButton.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).toContain(storedDate);
  await expect(heartButton).toHaveAttribute('aria-pressed', 'true');
  await expect(heartButton).toHaveAttribute('aria-label', 'Remove from favorites');
  await expect(heartPath).toHaveAttribute('fill', 'currentColor');
  await expect.poll(() => heartButton.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
  await expect.poll(() => heartButton.evaluate(element => getComputedStyle(element).backgroundPositionX)).toBe('0%');
  await expect.poll(() => heartButton.evaluate(element => getComputedStyle(element).transform)).toBe('none');

  await heartButton.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).not.toContain(storedDate);
  await expect(heartButton).toHaveAttribute('aria-pressed', 'false');
  await expect(heartButton).toHaveAttribute('aria-label', 'Add to favorites');
  await expect(heartPath).toHaveAttribute('fill', 'none');
  await expect.poll(() => heartButton.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
  await expect.poll(() => heartButton.evaluate(element => getComputedStyle(element).backgroundPositionX)).toBe('0%');
  await expect.poll(() => heartButton.evaluate(element => getComputedStyle(element).transform)).toBe('none');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('date navigation and shuffle mode update control state', async ({ page }) => {
  const errors = await openApp(page);

  await page.locator('#DatePicker').fill('1978-06-19');
  await page.locator('#DatePicker').dispatchEvent('change');
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await expect(page.locator('#First')).toBeDisabled();
  await expect(page.locator('#Previous')).toBeDisabled();
  await expect(page.locator('#Next')).toBeEnabled();

  await page.locator('#Shuffle').click();
  await expect(page.locator('#Shuffle')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('shuffle'))).toBe('true');
  await expect(page.locator('#Random')).toBeDisabled();
  await expect(page.locator('#DatePicker')).toBeDisabled();
  await expect(page.locator('#DatePickerBtn')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => {
    const shuffle = getComputedStyle(document.getElementById('Shuffle'));
    const share = getComputedStyle(document.getElementById('shareBtn'));
    const shuffleIcon = getComputedStyle(document.querySelector('#Shuffle svg path'));
    return {
      backgroundColor: shuffle.backgroundColor,
      iconStroke: shuffleIcon.stroke,
      transform: shuffle.transform,
      borderRadius: shuffle.borderRadius === share.borderRadius,
      width: shuffle.width === share.width,
      height: shuffle.height === share.height
    };
  })).toEqual({
    backgroundColor: 'rgb(47, 38, 27)',
    iconStroke: 'rgb(240, 152, 25)',
    transform: 'none',
    borderRadius: true,
    width: true,
    height: true
  });

  await page.locator('#Shuffle').click();
  await expect(page.locator('#Shuffle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#DatePicker')).toBeEnabled();
  await expect(page.locator('#DatePickerBtn')).toBeEnabled();
  await expect(page.locator('#Random')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => {
    const shuffle = getComputedStyle(document.getElementById('Shuffle'));
    const share = getComputedStyle(document.getElementById('shareBtn'));
    const shuffleIcon = getComputedStyle(document.querySelector('#Shuffle svg path'));
    const shareIcon = getComputedStyle(document.querySelector('#shareBtn svg circle'));
    return {
      backgroundImage: shuffle.backgroundImage === share.backgroundImage,
      backgroundSize: shuffle.backgroundSize === share.backgroundSize,
      backgroundPosition: shuffle.backgroundPosition === share.backgroundPosition,
      noSelectedGlow: !shuffle.boxShadow.includes('0px 0px 0px 2px'),
      transform: shuffle.transform === 'none',
      iconStroke: shuffleIcon.stroke === shareIcon.stroke
    };
  })).toEqual({
    backgroundImage: true,
    backgroundSize: true,
    backgroundPosition: true,
    noSelectedGlow: true,
    transform: true,
    iconStroke: true
  });
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('filmstrip navigation waits for the preloaded target image before swapping comics', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true
    });
  });

  let releaseNextImage;
  let nextImageRequested;
  const nextImageReleased = new Promise(resolve => {
    releaseNextImage = resolve;
  });
  const nextImageRequestSeen = new Promise(resolve => {
    nextImageRequested = resolve;
  });

  const errors = await openApp(page, '/', {
    heldImagePattern: '19780621',
    imageHoldPromise: nextImageReleased,
    onHeldImageRequest: nextImageRequested
  });

  await setComicDate(page, '1978-06-20');
  await expect(page.locator('#comic')).toHaveAttribute('src', /19780620/);

  await page.locator('#Next').click();
  await nextImageRequestSeen;
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-21');
  await page.waitForTimeout(150);
  await expect(page.locator('#comic')).toHaveAttribute('src', /19780620/);

  releaseNextImage();
  await expect(page.locator('#comic')).toHaveAttribute('src', /19780621/);
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test('preloads multiple adjacent comics around the current date for smoother swiping', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Prefetch behavior is viewport-independent and covered in desktop Chromium.');

  const requestedComicDates = [];
  const errors = await openApp(page, '/', {
    allowPrefetch: true,
    onComicProxyRequest: targetUrl => {
      const match = targetUrl.match(/garfield\/(\d{4})\/(\d{2})\/(\d{2})/);
      if (match) requestedComicDates.push(`${match[1]}-${match[2]}-${match[3]}`);
    }
  });

  await setComicDate(page, '1978-06-21');

  await expect.poll(() => requestedComicDates).toEqual(expect.arrayContaining([
    '1978-06-19',
    '1978-06-20',
    '1978-06-22',
    '1978-06-23'
  ]));

  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test('toolbar navigation walks normal date boundaries', async ({ page }) => {
  const errors = await openApp(page);

  await setComicDate(page, '1978-06-20');
  await expect(page.locator('#Previous')).toBeEnabled();
  await expect(page.locator('#Next')).toBeEnabled();

  await page.locator('#Next').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-21');

  await setComicDate(page, '1978-06-20');
  await expect(page.locator('#Last')).toBeEnabled();
  await page.locator('#Last').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('2026-04-29');
  await expect(page.locator('#Next')).toBeDisabled();
  await expect(page.locator('#Last')).toBeDisabled();

  await setComicDate(page, '1978-06-20');
  await expect(page.locator('#First')).toBeEnabled();
  await page.locator('#First').click();
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await expect(page.locator('#First')).toBeDisabled();
  await expect(page.locator('#Previous')).toBeDisabled();

  await setComicDate(page, '1978-06-20');
  await expect(page.locator('#Previous')).toBeEnabled();

  await page.locator('#Previous').click();
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await expect(page.locator('#First')).toBeDisabled();
  await expect(page.locator('#Previous')).toBeDisabled();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('favorites-only mode navigates stored favorites and empty state', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('favs', JSON.stringify(['1978/06/19', '1978/06/20', '1978/06/21']));
    } catch {
      // Sandboxed iframes cannot access localStorage.
    }
  });

  const errors = await openApp(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#showfavs').check();
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await expect(page.locator('#DatePicker')).toBeDisabled();
  await expect(page.locator('#First')).toBeDisabled();
  await expect(page.locator('#Previous')).toBeDisabled();
  await page.locator('#settingsCloseBtn').click();

  await page.locator('#Next').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');

  await page.locator('#Last').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-21');
  await expect(page.locator('#Next')).toBeDisabled();
  await expect(page.locator('#Last')).toBeDisabled();

  await page.locator('#favheart').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).not.toContain('1978/06/21');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#showfavs').uncheck();
  await expect(page.locator('#DatePicker')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('showfavs'))).toBe('false');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('support and top favorites modals open, switch, and close cleanly', async ({ page }) => {
  const errors = await openApp(page, '/', {
    topFavorites: [
      { date: '1978/06/19', count: 42 },
      { date: '1978/06/20', count: 17 }
    ]
  });

  await page.locator('#supportBtn').click();
  await expect(page.locator('#donationModal')).toHaveClass(/visible/);
  await expect(page.locator('#donationFrame')).toHaveAttribute('src', /buymeacoffee/);
  await page.getByRole('button', { name: 'Ko-fi' }).click();
  await expect(page.locator('#donationFrame')).toHaveAttribute('src', /ko-fi/);
  await page.getByRole('button', { name: 'Stripe' }).click();
  await expect(page.locator('#donationStripeOverlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#donationModal')).not.toHaveClass(/visible/);

  await page.getByRole('button', { name: 'Settings' }).click();
  await clickSettingsControl(page, '#top10Btn');
  await expect(page.locator('#top10Modal')).toHaveClass(/visible/);
  await expect(page.locator('.top10-entry')).toHaveCount(2);

  await page.locator('.top10-entry').first().click();
  await expect(page.locator('#top10Modal')).not.toHaveClass(/visible/);
  await expect(page.locator('#top10Indicator')).toBeVisible();
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await expect(page.locator('#DatePicker')).toBeDisabled();

  await page.locator('#Next').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');
  await page.locator('#top10ExitBtn').click();
  await expect(page.locator('#top10Indicator')).toHaveCount(0);
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');
  await expect(page.locator('#DatePicker')).toBeEnabled();
  await expect(page.locator('#Previous')).toBeEnabled();
  await expect(page.locator('#Next')).toBeEnabled();
  await page.locator('#Previous').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('donation providers load their embedded content and failed provider responses stay contained', async ({ page }) => {
  const errors = await openApp(page, '/', {
    donationResponses: {
      kofi: { status: 503, body: '<!doctype html><html><body>Ko-fi temporarily unavailable</body></html>' }
    }
  });

  await page.locator('#supportBtn').click();
  await expect(page.locator('#donationModal')).toHaveClass(/visible/);
  await expect(page.locator('#donationFrame')).toHaveAttribute('sandbox', /allow-same-origin/);
  await expect(page.frameLocator('#donationFrame').locator('body')).toContainText('Buy Me a Coffee');
  await expect(page.locator('#donationLoading')).toHaveCSS('display', 'none');

  await page.getByRole('button', { name: 'Ko-fi' }).click();
  await expect(page.locator('#donationFrame')).toHaveAttribute('src', /ko-fi/);
  await expect(page.frameLocator('#donationFrame').locator('body')).toContainText('Ko-fi temporarily unavailable');
  await expect(page.locator('#donationLoading')).toHaveCSS('display', 'none');

  await page.getByRole('button', { name: 'Stripe' }).click();
  await expect(page.locator('#donationStripeOverlay')).toBeVisible();
  await expect(page.locator('#donationFrame')).toHaveCSS('display', 'none');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors.some(error => error.includes('503') && error.includes('ko-fi.com'))).toBe(true);
});

test('share fallback notifies when Web Share is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  const errors = await openApp(page);

  await page.locator('#shareBtn').click();
  await expect(page.locator('#notificationToast')).toHaveClass(/show/);
  await expect(page.locator('#notificationContent')).toHaveText('Sharing is not supported on this device.');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('share sends the comic image when Web Share accepts files', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shareCalls = [];
    Object.defineProperty(navigator, 'share', {
      value: async data => {
        window.__shareCalls.push({
          title: data.title,
          text: data.text,
          url: data.url,
          files: data.files?.map(file => ({ name: file.name, type: file.type, size: file.size })) || []
        });
      },
      configurable: true
    });
  });
  const errors = await openApp(page);

  await page.locator('#shareBtn').click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);
  const shareCall = await page.evaluate(() => window.__shareCalls[0]);
  expect(shareCall.title).toMatch(/^Garfield \d{4}\/\d{2}\/\d{2}$/);
  expect(shareCall.text).toContain('Shared from GarfieldApp');
  expect(shareCall.files).toHaveLength(1);
  expect(shareCall.files[0].name).toBe('garfield.jpg');
  expect(shareCall.files[0].type).toBe('image/jpeg');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('share falls back to text-only when image preparation fails', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shareCalls = [];
    Object.defineProperty(navigator, 'share', {
      value: async data => { window.__shareCalls.push({ text: data.text, url: data.url, files: data.files?.length || 0 }); },
      configurable: true
    });
  });
  await openApp(page, '/', { failShareImage: true });

  await page.locator('#shareBtn').click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);
  const shareCall = await page.evaluate(() => window.__shareCalls[0]);
  expect(shareCall.files).toBe(0);
  expect(shareCall.url).toBe('http://127.0.0.1:8010/');
  expect(shareCall.text).toContain('Shared from GarfieldApp');
});

test('share cancellation stays quiet but real share errors notify the user', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shareMode = 'abort';
    Object.defineProperty(navigator, 'share', {
      value: async () => {
        if (window.__shareMode === 'abort') throw new DOMException('Share canceled', 'AbortError');
        throw new Error('Share target failed');
      },
      configurable: true
    });
  });
  await openApp(page, '/', { failShareImage: true });

  await page.locator('#shareBtn').click();
  await expect(page.locator('#notificationToast')).not.toHaveClass(/show/);

  await page.evaluate(() => { window.__shareMode = 'error'; });
  await page.locator('#shareBtn').click();
  await expect(page.locator('#notificationToast')).toHaveClass(/show/);
  await expect(page.locator('#notificationContent')).toHaveText('Failed to share the comic. Please try again.');
});

test('does not auto-start Google sign-in on unauthorized local origin', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('gDriveUser', 'Test User');
      localStorage.setItem('gDriveUserEmail', 'test@example.com');
    } catch {
      // Sandboxed iframes cannot access localStorage.
    }
  });

  const googleScriptBody = `
    window.__googleInitCount = 0;
    window.__googleTokenRequests = [];
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            window.__googleInitCount += 1;
            return {
              requestAccessToken(options) {
                window.__googleTokenRequests.push(options || {});
                config.error_callback && config.error_callback({ type: 'popup_failed_to_open' });
              }
            };
          }
        }
      }
    };
  `;
  const errors = await openApp(page, '/', { googleScriptBody });

  await expect.poll(() => page.evaluate(() => window.__googleInitCount)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__googleTokenRequests)).toEqual([]);

  await page.getByRole('button', { name: 'Settings' }).click();
  await clickSettingsControl(page, '#googleSignInBtn');
  await expect(page.locator('#notificationToast')).toHaveClass(/show/);
  await expect(page.locator('#notificationContent')).toHaveText('Google sign-in is not available on this test URL.');
  await expect.poll(() => page.evaluate(() => window.__googleTokenRequests)).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('comic fetch failures show a user-facing error without runtime failures', async ({ page }) => {
  const errors = await openApp(page, '/', { failComics: true });

  await expect(page.locator('#comic-message')).toBeVisible();
  await expect(page.locator('#comic-message')).toContainText('Failed to load comic. Please try again.');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors.length).toBeGreaterThan(0);
});

test('uses Eastern calendar date across far-ahead time zones', async ({ browser }) => {
  test.setTimeout(60_000);

  const cases = [
    { instant: '2026-04-29T03:30:00.000Z', expected: '2026-04-28' },
    { instant: '2026-04-29T04:30:00.000Z', expected: '2026-04-29' }
  ];
  const zones = [
    'America/New_York',
    'America/Los_Angeles',
    'Europe/Amsterdam',
    'Asia/Tokyo',
    'Pacific/Kiritimati'
  ];

  for (const testCase of cases) {
    for (const zone of zones) {
      const context = await browser.newContext({ timezoneId: zone });
      try {
        await installMockClock(context, testCase.instant);

        const page = await context.newPage();
        const errors = await openApp(page, 'http://127.0.0.1:8010/');

        await expect(page.locator('#DatePicker'), `${zone} at ${testCase.instant}`).toHaveValue(testCase.expected);
        await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
        expect(errors.consoleErrors).toEqual([]);
        expect(errors.pageErrors).toEqual([]);
        expect(errors.requestErrors).toEqual([]);
      } finally {
        await context.close();
      }
    }
  }
});

test('random, date picker button, and keyboard navigation update dates', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.__showPickerCalls = 0;
    HTMLInputElement.prototype.showPicker = function showPicker() {
      window.__showPickerCalls += 1;
    };
  });
  const errors = await openApp(page);

  await page.locator('#DatePickerBtn').click();
  await expect.poll(() => page.evaluate(() => window.__showPickerCalls)).toBe(1);

  await setComicDate(page, '1978-06-20');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-21');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');

  await page.locator('#Random').click();
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('settings options persist and change dependent UI state', async ({ page }) => {
  const errors = await openApp(page);

  await openSettings(page);
  await page.locator('#swipe').uncheck();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('stat'))).toBe('false');
  await page.locator('#swipe').check();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('stat'))).toBe('true');

  await page.locator('#comicSource').selectOption('fandom');
  await expect(page.locator('#spanish-setting-row')).toHaveCSS('display', 'none');
  await expect(page.locator('#spanish')).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('comicSource'))).toBe('fandom');

  await page.locator('#comicSource').selectOption('uclick');
  await expect(page.locator('#spanish-setting-row')).toHaveCSS('display', 'none');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('comicSource'))).toBe('uclick');

  await page.locator('#comicSource').selectOption('gocomics');
  await expect(page.locator('#spanish-setting-row')).not.toHaveCSS('display', 'none');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('comicSource'))).toBe('gocomics');

  await page.locator('#lastdate').check();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lastdate'))).toBe('true');
  await page.locator('#settingsCloseBtn').click();
  await setComicDate(page, '1978-06-20');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('shuffle mode keeps deterministic favorites history across next previous first and last', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Shuffle history behavior is viewport-independent and covered in desktop Chromium.');

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true
    });
    const picks = [0, 0.99, 0.99, 0.99, 0.99];
    Math.random = () => picks.length ? picks.shift() : 0.99;
    try {
      localStorage.setItem('favs', JSON.stringify(['1978/06/19', '1978/06/20', '1978/06/21']));
    } catch {
      // Sandboxed iframes cannot access localStorage.
    }
  });
  const errors = await openApp(page);

  await openSettings(page);
  await page.locator('#showfavs').check();
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await page.locator('#settingsCloseBtn').click();

  await page.locator('#Shuffle').click();
  await expect(page.locator('#Shuffle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#DatePicker')).toBeDisabled();
  await expect(page.locator('#DatePickerBtn')).toBeDisabled();
  await expect(page.locator('#Random')).toBeDisabled();
  await expect(page.locator('#Next')).toHaveAttribute('aria-label', 'Next random shuffle comic');

  await page.locator('#Next').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');
  await expect(page.locator('#Previous')).toBeEnabled();
  await expect(page.locator('#First')).toBeEnabled();

  await page.locator('#Next').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-21');

  await page.locator('#Previous').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');
  await expect(page.locator('#Next')).toHaveAttribute('aria-label', 'Next shuffle comic');

  await page.locator('#Last').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-21');

  await page.locator('#First').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('shuffle mode preloads a small queue of random comics for faster swiping', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Shuffle prefetch behavior is viewport-independent and covered in desktop Chromium.');

  const requestedComicDates = [];
  await page.addInitScript(() => {
    const picks = [0.25, 0.5, 0.75, 0.9, 0.1];
    Math.random = () => picks.length ? picks.shift() : 0.33;
  });

  const errors = await openApp(page, '/', {
    allowPrefetch: true,
    onComicProxyRequest: targetUrl => {
      const match = targetUrl.match(/garfield\/(\d{4})\/(\d{2})\/(\d{2})/);
      if (match) requestedComicDates.push(`${match[1]}-${match[2]}-${match[3]}`);
    }
  });

  await page.locator('#Shuffle').click();
  await expect(page.locator('#Shuffle')).toHaveAttribute('aria-pressed', 'true');

  await expect.poll(() => new Set(requestedComicDates).size).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#Next')).toHaveAttribute('aria-label', 'Next random shuffle comic');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
});

test('mobile landscape viewing opens rotated comic, supports swipe navigation, and exits cleanly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Mobile browser rotation behavior is covered in the mobile Chrome project.');

  const errors = await openApp(page);
  await setComicDate(page, '1978-06-20');

  await page.locator('#comic').tap();
  await expect(page.locator('#comic-overlay')).toBeVisible();
  await expect(page.locator('#rotated-comic')).toHaveClass(/rotate/);
  await expect(page.locator('#settingsBtn')).not.toBeVisible();

  await dispatchTouchGesture(page, '#rotated-comic', [{ x: 200, y: 650 }, { x: 200, y: 250 }]);
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-21');

  await dispatchTouchGesture(page, '#rotated-comic', [{ x: 200, y: 250 }, { x: 200, y: 650 }]);
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');

  await page.waitForTimeout(400);
  await page.locator('#comic-overlay').click({ force: true });
  await expect(page.locator('#comic-overlay')).toHaveCount(0);
  await expect(page.locator('#rotated-comic')).toHaveCount(0);
  await expect(page.locator('#settingsBtn')).toBeVisible();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('top favorites empty, error, retry, and toolbar navigation states work', async ({ page }) => {
  const errors = await openApp(page, '/', {
    topFavoritesSequence: [
      { status: 200, favorites: [] },
      { status: 500, favorites: [] },
      {
        status: 200,
        favorites: [
          { date: '1978/06/19', count: 3 },
          { date: '1978/06/20', count: 2 },
          { date: '1978/06/21', count: 1 }
        ]
      }
    ]
  });

  await openSettings(page);
  await clickSettingsControl(page, '#top10Btn');
  await expect(page.locator('#top10Modal')).toHaveClass(/visible/);
  await expect(page.locator('#top10List')).toContainText('No favorites yet. Be the first!');
  await page.locator('#top10CloseBtn').click();
  await expect(page.locator('#top10Modal')).not.toHaveClass(/visible/);

  await page.locator('#top10Btn').click();
  await expect(page.locator('#top10List')).toContainText('Could not load leaderboard. Try again later.');
  await page.locator('#top10RetryBtn').click();
  await expect(page.locator('.top10-entry')).toHaveCount(3);

  await page.locator('.top10-entry').nth(1).click();
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');
  await page.locator('#Previous').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await page.locator('#Last').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-21');
  await page.locator('#First').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await page.locator('#top10ExitBtn').click();
  await expect(page.locator('#top10Indicator')).toHaveCount(0);
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-19');
  await expect(page.locator('#DatePicker')).toBeEnabled();
  await expect(page.locator('#Previous')).toBeDisabled();
  await expect(page.locator('#Next')).toBeEnabled();
  await page.locator('#Next').evaluate(element => element.click());
  await expect(page.locator('#DatePicker')).toHaveValue('1978-06-20');
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors.some(error => error.includes('500') && error.includes('/top'))).toBe(true);
});

test('favorites export, import, duplicate, invalid, and notification close paths work', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('favs', JSON.stringify(['1978/06/19']));
    } catch {
      // Sandboxed iframes cannot access localStorage.
    }
  });
  const errors = await openApp(page);

  await openSettings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportFavs').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^garfield-favorites-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator('#notificationContent')).toHaveText('Exported 1 favorite.');

  await importFavoritesFile(page, 'favorites.json', JSON.stringify({ favorites: ['1978/06/20', '1978/06/19'] }));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).toEqual(['1978/06/19', '1978/06/20']);
  await expect(page.locator('#notificationContent')).toContainText('Imported 1 new favorite');

  await importFavoritesFile(page, 'duplicates.json', JSON.stringify({ favorites: ['1978/06/19', '1978/06/20'] }));
  await expect(page.locator('#notificationContent')).toHaveText('All favorites already exist.');

  await importFavoritesFile(page, 'invalid.json', JSON.stringify({ nope: true }));
  await expect(page.locator('#notificationContent')).toHaveText('Invalid favorites file format.');
  await page.locator('#notificationClose').click();
  await expect(page.locator('#notificationToast')).not.toHaveClass(/show/);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});

test('install prompt button uses deferred PWA prompt', async ({ page }) => {
  const errors = await openApp(page);

  await page.evaluate(() => {
    window.__installPromptCalls = 0;
    const event = new Event('beforeinstallprompt');
    event.preventDefault = () => {};
    event.prompt = () => { window.__installPromptCalls += 1; };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });

  await expect(page.locator('#installBtn')).toBeVisible();
  await page.locator('#installBtn').click();
  await expect.poll(() => page.evaluate(() => window.__installPromptCalls)).toBe(1);
  await expect(page.locator('#installBtn')).not.toBeVisible();
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.requestErrors).toEqual([]);
});