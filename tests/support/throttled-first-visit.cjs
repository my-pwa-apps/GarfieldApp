/**
 * Deterministic first-visit measurement under Lighthouse's mobile throttling
 * profile. App files are served compressed over HTTP/2 (as Cloudflare Pages
 * does) and throttled; comic providers are instant local fixtures. This
 * isolates the client's own path to the first comic from live-provider latency
 * and bot challenges, which `test:lighthouse` measures separately.
 *
 * HTTP/2 needs TLS, so a throwaway self-signed certificate is generated with
 * openssl. Use `--protocol http1` to compare against a 6-connection HTTP/1.1 server.
 *
 * Usage: node tests/support/throttled-first-visit.cjs [--runs 5] [--protocol http2|http1] [--json out.json]
 */
const fs = require('node:fs');
const { startMeasurementServer } = require('./measurement-server.cjs');
const { chromium, devices } = require('playwright');
const sharp = require('sharp');

const host = '127.0.0.1';
const port = 8030;
const args = process.argv.slice(2);
const argValue = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const protocol = argValue('protocol', 'http2');
let url;
const runs = Number(argValue('runs', 5));
const jsonPath = argValue('json', null);

// Lighthouse's default mobile profile expressed as DevTools throttling.
const NETWORK = { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 };
const CPU_SLOWDOWN = 4;

async function routeProviders(context, comicPng) {
  const html = `<!doctype html><html><head><meta property="og:image" content="https://featureassets.gocomics.com/assets/fixture"></head><body></body></html>`;
  await context.route('https://garfieldapp-corsproxy.garfieldapp.workers.dev/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await context.route('https://featureassets.gocomics.com/**', route => route.fulfill({ contentType: 'image/png', body: comicPng }));
  await context.route('https://favorites-api.garfieldapp.workers.dev/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await context.route(/garfield\.fandom\.com|static\.wikia\.nocookie\.net|resources\.arcamax\.com/, route => route.abort());
}

async function measureOnce(browser, comicPng) {
  const context = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block', locale: 'en-US', ignoreHTTPSErrors: true });
  try {
    await routeProviders(context, comicPng);
    const page = await context.newPage();
    page.on('crash', () => console.error('Page crashed during measurement'));
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__lcp = entry.renderTime || entry.loadTime || entry.startTime; })
        .observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', NETWORK);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => performance.getEntriesByName('comic:first-display').length > 0, null, { timeout: 60_000 });
    await page.waitForTimeout(500);
    return await page.evaluate(() => {
      const mark = name => performance.getEntriesByName(`comic:${name}`)[0]?.startTime ?? null;
      const resources = performance.getEntriesByType('resource');
      const own = resources.filter(entry => entry.name.startsWith(location.origin));
      const scripts = own.filter(entry => entry.initiatorType === 'script' || /\.js(\?|$)/.test(entry.name));
      return {
        firstComicDisplayMs: mark('first-display'),
        discoveryStartMs: mark('discovery-start'),
        lcpMs: window.__lcp,
        domContentLoadedMs: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
        scriptRequests: scripts.length,
        protocol: performance.getEntriesByType('navigation')[0].nextHopProtocol,
        scriptTransferKiB: Math.round(scripts.reduce((sum, entry) => sum + entry.transferSize, 0) / 102.4) / 10,
        ownTransferKiB: Math.round(own.reduce((sum, entry) => sum + entry.transferSize, 0) / 102.4) / 10
      };
    });
  } finally {
    await context.close();
  }
}

const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

async function main() {
  const server = await startMeasurementServer({ host, port, protocol });
  url = server.url;
  let browser;
  try {
    browser = await chromium.launch();
    const comicPng = await sharp({ create: { width: 900, height: 270, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const samples = [];
    for (let i = 0; i < runs; i++) samples.push(await measureOnce(browser, comicPng));
    const numeric = Object.keys(samples[0]).filter(key => typeof samples[0][key] === 'number');
    const summary = { protocol: samples[0].protocol, ...Object.fromEntries(numeric.map(key => [key, Math.round(median(samples.map(sample => sample[key])) * 10) / 10])) };
    const result = { profile: { ...NETWORK, cpuSlowdown: CPU_SLOWDOWN }, runs, median: summary, samples };
    console.log(`Throttled fixture first visit (median of ${runs}): ${JSON.stringify(summary)}`);
    if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
