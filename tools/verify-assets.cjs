#!/usr/bin/env node
/**
 * Deploy guard: every asset referenced by the web app manifest, the service
 * worker precache list, and browserconfig.xml must exist on disk.
 *
 * A missing precache asset makes the service worker install fail (no offline
 * support); a missing manifest icon degrades install branding and produces
 * avoidable 404s for every manifest consumer.
 */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const problems = [];

function toRepoPath(reference) {
  return path.join(repoRoot, reference.replace(/^\.?\//, '').split(/[?#]/)[0]);
}

function checkReference(reference, source) {
  // Directory-style references ('./', '/') resolve to index.html.
  const normalized = reference === './' || reference === '/' ? './index.html' : reference;
  if (!fs.existsSync(toRepoPath(normalized))) {
    problems.push(`${source}: missing "${reference}"`);
  }
}

// --- Web app manifest -------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.webmanifest'), 'utf8'));
for (const icon of manifest.icons || []) checkReference(icon.src, 'manifest.icons');
for (const shot of manifest.screenshots || []) checkReference(shot.src, 'manifest.screenshots');
for (const shortcut of manifest.shortcuts || []) {
  for (const icon of shortcut.icons || []) checkReference(icon.src, 'manifest.shortcuts');
  if (shortcut.url?.startsWith('/')) {
    problems.push(`manifest.shortcuts: "${shortcut.url}" is root-absolute and breaks subpath deployments`);
  }
}

// --- Service worker precache ------------------------------------------------
const serviceWorker = fs.readFileSync(path.join(repoRoot, 'serviceworker.js'), 'utf8');
const precacheBlock = serviceWorker.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
if (!precacheBlock) {
  problems.push('serviceworker.js: PRECACHE_ASSETS list not found');
} else {
  for (const [, asset] of precacheBlock[1].matchAll(/'([^']+)'/g)) {
    checkReference(asset, 'serviceworker.PRECACHE_ASSETS');
  }
}

// --- Statically imported ES modules must be precached -----------------------
const appSource = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');
for (const [, specifier] of appSource.matchAll(/^\s*import[^'"]*['"](\.\/[^'"]+)['"]/gm)) {
  if (precacheBlock && !precacheBlock[1].includes(`'${specifier}'`)) {
    problems.push(`serviceworker.PRECACHE_ASSETS: "${specifier}" is statically imported by app.js but never precached`);
  }
}

// --- browserconfig ----------------------------------------------------------
const browserConfig = fs.readFileSync(path.join(repoRoot, 'browserconfig.xml'), 'utf8');
for (const [, src] of browserConfig.matchAll(/src="([^"]+)"/g)) {
  checkReference(src, 'browserconfig.xml');
}

// --- Reverse check: shipped images must actually be referenced ---------------
// Orphaned artwork is dead weight on every clone and deploy, and it silently
// grows because nothing fails when a reference is removed.
const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.ico']);
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'playwright-report-cross-browser', 'android', 'ios', '.venv']);
// Markdown is intentionally excluded: documentation that merely *mentions* an
// asset (for example a backlog entry about removing it) is not a live reference.
const REFERENCE_SOURCE_EXTENSIONS = new Set(['.html', '.js', '.cjs', '.mjs', '.css', '.webmanifest', '.json', '.xml', '.txt']);

function collectFiles(dir, predicate, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), predicate, found);
    } else if (predicate(entry.name)) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

const referenceHaystack = collectFiles(repoRoot, name => REFERENCE_SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase()))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');

for (const image of collectFiles(repoRoot, name => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))) {
  const basename = path.basename(image);
  if (!referenceHaystack.includes(basename)) {
    problems.push(`orphaned asset: "${path.relative(repoRoot, image).replace(/\\/g, '/')}" is not referenced by any source file`);
  }
}

if (problems.length) {
  console.error(`Asset verification failed (${problems.length} problem(s)):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('Asset verification passed: all manifest, precache and tile references exist, and no image is orphaned.');
