const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ORIGIN = 'https://garfieldapp.pages.dev';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY_FILE = 'indexnow-key.txt';

async function readDeployment(root = path.resolve(__dirname, '..')) {
  const worker = await fs.readFile(path.join(root, 'serviceworker.js'), 'utf8');
  const precache = worker.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
  if (!precache) throw new Error('Cannot identify the app files to verify');
  const names = new Set(['serviceworker.js', 'robots.txt', 'sitemap.xml', 'sitemap.txt', KEY_FILE]);
  for (const [, reference] of precache[1].matchAll(/'([^']+)'/g)) {
    const name = reference === './' ? 'index.html' : reference.replace(/^\.\//, '');
    if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.startsWith('/') || name.split('/').includes('..')) {
      throw new Error(`Invalid precache path: ${reference}`);
    }
    names.add(name);
  }
  if (!names.has('index.html') || !names.has('app.js')) throw new Error('Incomplete app precache list');
  return new Map(await Promise.all([...names].map(async name => [name, await fs.readFile(path.join(root, name))])));
}

function createPayload(files) {
  const key = files.get(KEY_FILE)?.toString('utf8').trim();
  if (!key || !/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('Invalid IndexNow key file');
  return {
    host: new URL(ORIGIN).host,
    key,
    keyLocation: `${ORIGIN}/${KEY_FILE}`,
    urlList: [`${ORIGIN}/`]
  };
}

async function notifyIndexNow(files, { submit = false, fetchImpl = fetch } = {}) {
  const payload = createPayload(files);
  if (!submit) return { mode: 'dry-run', payload, filesToVerify: files.size };
  if (!files.has('index.html') || !files.has('serviceworker.js')) throw new Error('Missing deployment files');

  const cacheToken = Date.now().toString();
  for (const [name, expected] of files) {
    const url = new URL(name === 'index.html' ? '/' : `/${name}`, ORIGIN);
    if (url.origin !== ORIGIN || /[?#\\]/.test(name) || name.split('/').includes('..')) {
      throw new Error(`Invalid deployment path: ${name}`);
    }
    url.searchParams.set('indexnow-check', cacheToken);
    const response = await fetchImpl(url.href, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (response.status !== 200) throw new Error(`Production check failed for ${name}: HTTP ${response.status}`);
    const actual = Buffer.from(await response.arrayBuffer());
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    if (digest(actual) !== digest(expected)) {
      throw new Error(`Production differs from this checkout: ${name}. No URLs submitted.`);
    }
  }

  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  });
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow rejected submission: HTTP ${response.status}`);
  return {
    mode: 'submitted', status: response.status,
    message: response.status === 202 ? 'Received; key validation pending. Indexing is not guaranteed.' : 'Received. Indexing is not guaranteed.',
    payload
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--dry-run', '--submit'].includes(arg))) {
    throw new Error('Usage: npm run indexnow -- [--dry-run|--submit]');
  }
  console.log(JSON.stringify(await notifyIndexNow(await readDeployment(), { submit: args.includes('--submit') }), null, 2));
}

module.exports = { readDeployment, createPayload, notifyIndexNow };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });