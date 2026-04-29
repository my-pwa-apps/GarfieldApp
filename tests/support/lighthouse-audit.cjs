const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const host = '127.0.0.1';
const port = '8020';
const chromeDebugPort = 9223;
const url = `http://${host}:${port}/`;
const outputPath = path.resolve(__dirname, '../lighthouse-report.json');
const thresholds = {
  performance: 0.6,
  accessibility: 0.9,
  'best-practices': 0.85
};

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

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not start at ${url}`);
}

async function main() {
  const server = spawn(process.execPath, ['tests/support/static-server.cjs', '--host', host, '--port', port], {
    stdio: 'ignore',
    shell: false
  });
  let browser;

  try {
    await waitForServer();
    browser = await chromium.launch({ args: [`--remote-debugging-port=${chromeDebugPort}`] });
    await run(process.execPath, [
      require.resolve('lighthouse/cli/index.js'),
      url,
      '--quiet',
      `--port=${chromeDebugPort}`,
      '--only-categories=performance,accessibility,best-practices',
      '--output=json',
      `--output-path=${outputPath}`
    ]);

    const report = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    const scores = Object.fromEntries(
      Object.entries(thresholds).map(([category]) => [category, report.categories[category].score])
    );

    for (const [category, minimum] of Object.entries(thresholds)) {
      const score = scores[category];
      if (score < minimum) {
        throw new Error(`${category} score ${score} is below ${minimum}`);
      }
    }

    console.log(`Lighthouse passed: ${JSON.stringify(scores)}`);
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});