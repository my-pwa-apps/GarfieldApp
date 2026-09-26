const { spawn } = require('node:child_process');
const { startMeasurementServer } = require('./measurement-server.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const host = '127.0.0.1';
const port = '8020';
const chromeDebugPort = 9223;
// The local app is served over HTTP/1.1 because the production proxy only accepts
// plain-http loopback origins. Lighthouse then models six connections per host,
// which overstates the cost of the app's multi-module graph compared with
// production HTTP/2; pass --url https://garfieldapp.pages.dev/ to audit a
// deployed revision over its real protocol instead.
const urlArgIndex = process.argv.indexOf('--url');
const deployedUrl = urlArgIndex === -1 ? null : process.argv[urlArgIndex + 1];
let url;
const outputPath = path.resolve(__dirname, '../lighthouse-report.json');
const thresholds = {
  performance: 0.6,
  accessibility: 0.9,
  'best-practices': 0.85,
  seo: 0.9
};

async function readFirstVisit(page) {
  await page.waitForFunction(() => {
    const image = document.getElementById('comic');
    return image?.complete && image.naturalWidth > 0 && performance.getEntriesByName('comic:first-display').length > 0;
  }, null, { timeout: 45000 });
  return page.evaluate(async () => {
    const image = document.getElementById('comic');
    await image.decode();
    const timing = name => {
      const entry = performance.getEntriesByName(`comic:${name}`)[0];
      if (!entry) throw new Error(`Missing first-visit timing: ${name}`);
      return entry.startTime;
    };
    return {
      bootMs: timing('discovery-start'),
      discoveryMs: timing('discovery-end') - timing('discovery-start'),
      imageLoadAndDecodeMs: timing('decoded') - timing('decode-start'),
      displayAfterDecodeMs: timing('first-display') - timing('decoded'),
      navigationToFirstDisplayMs: timing('first-display'),
      imageWidth: image.naturalWidth,
      isFallback: performance.getEntriesByName('comic:fallback-display').length > 0,
      imageUrl: image.currentSrc
    };
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.stdio || 'pipe', shell: false, env: options.env || process.env });
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk; });
    child.stderr?.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `${command} exited with ${code}`));
    });
  });
}

async function main() {
  const server = deployedUrl ? null : await startMeasurementServer({ host, port: Number(port), protocol: 'http1' });
  url = deployedUrl || server.url;
  let browser;

  try {
    browser = await chromium.launch({ args: [`--remote-debugging-port=${chromeDebugPort}`] });
    await run(process.execPath, [
      require.resolve('lighthouse/cli/index.js'),
      url,
      '--quiet',
      `--port=${chromeDebugPort}`,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json',
      `--output-path=${outputPath}`
    ]);

    const report = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    const scores = Object.fromEntries(
      Object.entries(thresholds).map(([category]) => [category, report.categories[category].score])
    );

    const lcpMs = report.audits['largest-contentful-paint'].numericValue;
    const speedIndexMs = report.audits['speed-index'].numericValue;
    const comicMarks = Object.fromEntries((report.audits['user-timings']?.details?.items || [])
      .filter(item => item.name.startsWith('comic:')).map(item => [item.name, item.startTime]));
    const decodedComicObserved = Object.hasOwn(comicMarks, 'comic:first-display');
    const fallbackObserved = Object.hasOwn(comicMarks, 'comic:fallback-display');
    const targetsMet = decodedComicObserved && !fallbackObserved && lcpMs < 3000 && speedIndexMs < 5800 && scores.performance >= 0.8;
    console.log(`Live-provider Lighthouse: ${JSON.stringify({ scores, lcpMs, speedIndexMs, decodedComicObserved, comicMarks, targetsMet })}`);
    if (!decodedComicObserved) throw new Error('Live-provider audit did not observe a decoded first comic; do not treat logo-only scores as a passing visit');
    if (fallbackObserved) throw new Error('A fallback comic displayed; live-provider loading remains unverified');

    const { devices } = require('playwright');
    const context = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block', locale: 'en-US' });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const visit = await readFirstVisit(page);
      console.log(`Separate live-provider first visit (unthrottled mobile emulation): ${JSON.stringify(visit)}`);
      if (visit.isFallback) throw new Error('Mobile first visit displayed a fallback rather than a live-provider comic');
    } finally {
      await context.close();
    }

    if (process.argv.includes('--strict-performance') && !targetsMet) {
      throw new Error('R15 performance targets were not met; require three comparable passing cold runs before closing R15');
    }

    for (const [category, minimum] of Object.entries(thresholds)) {
      const score = scores[category];
      if (score < minimum) {
        throw new Error(`${category} score ${score} is below ${minimum}`);
      }
    }

    console.log(`Lighthouse passed: ${JSON.stringify(scores)}`);
  } finally {
    if (browser) await browser.close();
    await server?.close();
  }
}

module.exports = { readFirstVisit };
if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}