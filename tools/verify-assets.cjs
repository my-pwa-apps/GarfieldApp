#!/usr/bin/env node
/**
 * Deploy guard: every asset referenced by the web app manifest, the service
 * worker precache list, and browserconfig.xml must exist on disk; every module
 * in the static ES module graph (from index.html's module scripts) must be
 * modulepreloaded, precached and required; lazily imported modules must be
 * precached; and no image may be orphaned.
 *
 * A missing precache asset makes the service worker install fail (no offline
 * support); a missing manifest icon degrades install branding and produces
 * avoidable 404s for every manifest consumer; a missing modulepreload adds a
 * network round trip per import level before the first comic can load.
 */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.ico']);
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'playwright-report-cross-browser', '.venv', '.wrangler']);
// Markdown is intentionally excluded: documentation that merely *mentions* an
// asset (for example a backlog entry about removing it) is not a live reference.
const REFERENCE_SOURCE_EXTENSIONS = new Set(['.html', '.js', '.cjs', '.mjs', '.css', '.webmanifest', '.json', '.xml', '.txt']);
const IMAGE_REFERENCE_PATTERN = /[^\s"'`()<>{},;=|\\]+\.(?:png|webp|jpe?g|gif|svg|ico)(?![A-Za-z0-9_-])/gi;

// Unreferenced images kept on purpose. Each entry needs a reason and is itself
// reported once the file no longer exists, so exceptions cannot silently go stale.
const RETAINED_UNREFERENCED_IMAGES = new Map([
  ['android/maskable_icon_x682.png', 'BACKLOG C01: confirm no separately deployed sibling app consumes this repository URL before removal.']
]);

function toPosix(file) {
  return file.split(path.sep).join('/');
}

/**
 * Resolve every image-like token in a source file to exact repository-relative
 * paths. Tokens are tried relative to the repository root and to the source
 * file's directory; URLs contribute their pathname.
 */
function collectImageReferences(text, sourcePath = '') {
  const references = new Set();
  const sourceDir = path.posix.dirname(sourcePath);
  for (const [token] of text.matchAll(IMAGE_REFERENCE_PATTERN)) {
    let reference = token;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(reference)) {
      try { reference = new URL(reference).pathname; } catch { continue; }
    }
    try { reference = decodeURIComponent(reference); } catch { /* keep the raw token */ }
    reference = reference.split(/[?#]/)[0];
    const candidates = [reference.replace(/^\.?\/+/, '')];
    if (!reference.startsWith('/')) candidates.push(path.posix.join(sourceDir, reference));
    for (const candidate of candidates) {
      const normalized = path.posix.normalize(candidate);
      if (normalized && !normalized.startsWith('..')) references.add(normalized);
    }
  }
  return references;
}

/**
 * @param {{ images: string[], sources: { path: string, text: string }[], retained?: Map<string, string> }} input
 *   Repository-relative POSIX image paths and reference source files.
 * @returns {{ orphaned: string[], staleExceptions: string[] }}
 */
function findOrphanedImages({ images, sources, retained = new Map() }) {
  const referenced = new Set();
  for (const source of sources) {
    for (const reference of collectImageReferences(source.text, source.path)) referenced.add(reference);
  }
  const imageSet = new Set(images);
  return {
    orphaned: images.filter(image => !referenced.has(image) && !retained.has(image)),
    staleExceptions: [...retained.keys()].filter(image => !imageSet.has(image))
  };
}

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

function toRepoPath(reference) {
  return path.join(repoRoot, reference.replace(/^\.?\//, '').split(/[?#]/)[0]);
}

function listImages(root) {
  return collectFiles(root, name => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .map(file => toPosix(path.relative(root, file)));
}

/**
 * Walk the ES module graph from the module scripts in index.html.
 * @returns {{ entries: string[], staticModules: Set<string>, dynamicModules: Set<string> }}
 */
function collectModuleGraph(root, html) {
  const entries = [...html.matchAll(/<script\b[^>]*>/g)]
    .map(([tag]) => /type="module"/.test(tag) && tag.match(/src="\.\/([^"]+)"/)?.[1])
    .filter(Boolean);
  const staticModules = new Set();
  const dynamicModules = new Set();
  const visit = file => {
    if (staticModules.has(file)) return;
    staticModules.add(file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, specifier] of source.matchAll(/^\s*import\s[^'"]*['"]\.\/([^'"]+)['"]/gm)) visit(specifier);
    for (const [, specifier] of source.matchAll(/\bimport\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)) dynamicModules.add(specifier);
  };
  entries.forEach(visit);
  for (const file of staticModules) dynamicModules.delete(file);
  return { entries, staticModules, dynamicModules };
}

function main() {
  const sharp = require('sharp');
  const problems = [];

  function checkReference(reference, source) {
    // Directory-style references ('./', '/') resolve to index.html.
    const normalized = reference === './' || reference === '/' ? './index.html' : reference;
    if (!fs.existsSync(toRepoPath(normalized))) {
      problems.push(`${source}: missing "${reference}"`);
    }
  }

  // --- Web app manifest -----------------------------------------------------
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons || []) checkReference(icon.src, 'manifest.icons');
  const screenshotRatios = new Map();
  const screenshotChecks = (manifest.screenshots || []).map(async shot => {
    checkReference(shot.src, 'manifest.screenshots');
    const filename = toRepoPath(shot.src);
    if (!fs.existsSync(filename)) return;
    const image = fs.readFileSync(filename);
    const { format, width, height } = await sharp(image).metadata();
    if (!['png', 'webp'].includes(format) || shot.type !== `image/${format}`) {
      problems.push(`manifest.screenshots: "${shot.src}" must be a PNG or WebP capture with a matching MIME type`);
      return;
    }
    if (shot.sizes !== `${width}x${height}` || Math.min(width, height) < 320 ||
        Math.max(width, height) > 3840 || Math.max(width, height) / Math.min(width, height) > 2.3) {
      problems.push(`manifest.screenshots: "${shot.src}" has incorrect sizes or unsupported dimensions`);
    }
    if (!shot.label?.trim() || !['wide', 'narrow'].includes(shot.form_factor) ||
        (shot.form_factor === 'wide' ? width <= height : width >= height)) {
      problems.push(`manifest.screenshots: "${shot.src}" needs a label and matching form factor`);
    }
    if (image.length > 600 * 1024) problems.push(`manifest.screenshots: "${shot.src}" exceeds 600 KiB`);
    const ratio = width / height;
    if (screenshotRatios.has(shot.form_factor) && screenshotRatios.get(shot.form_factor) !== ratio) {
      problems.push(`manifest.screenshots: use the same aspect ratio within each form factor`);
    }
    screenshotRatios.set(shot.form_factor, ratio);
  });
  for (const shortcut of manifest.shortcuts || []) {
    for (const icon of shortcut.icons || []) checkReference(icon.src, 'manifest.shortcuts');
    if (shortcut.url?.startsWith('/')) {
      problems.push(`manifest.shortcuts: "${shortcut.url}" is root-absolute and breaks subpath deployments`);
    }
  }

  // --- Service worker precache ----------------------------------------------
  const serviceWorker = fs.readFileSync(path.join(repoRoot, 'serviceworker.js'), 'utf8');
  const precacheBlock = serviceWorker.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
  if (!precacheBlock) {
    problems.push('serviceworker.js: PRECACHE_ASSETS list not found');
  } else {
    for (const [, asset] of precacheBlock[1].matchAll(/'([^']+)'/g)) {
      checkReference(asset, 'serviceworker.PRECACHE_ASSETS');
    }
  }

  // --- Module graph: preloaded, precached and required ---------------------
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const requiredBlock = serviceWorker.match(/const REQUIRED_PRECACHE_ASSETS = new Set\(\[([\s\S]*?)\]\)/);
  const precached = new Set([...(precacheBlock?.[1] || '').matchAll(/'\.\/([^']+)'/g)].map(m => m[1]));
  const required = new Set([...(requiredBlock?.[1] || '').matchAll(/'\.\/([^']+)'/g)].map(m => m[1]));
  const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map(m => m[1]));
  const { entries, staticModules, dynamicModules } = collectModuleGraph(repoRoot, html);
  for (const file of staticModules) {
    if (!precached.has(file)) problems.push(`serviceworker.PRECACHE_ASSETS: "./${file}" is in the static module graph but never precached`);
    if (!required.has(file)) problems.push(`serviceworker.REQUIRED_PRECACHE_ASSETS: "./${file}" is needed to boot but not required`);
    if (!entries.includes(file) && !preloaded.has(file)) problems.push(`index.html: "./${file}" is statically imported but has no <link rel="modulepreload">`);
  }
  for (const file of preloaded) {
    if (!staticModules.has(file)) problems.push(`index.html: modulepreload "./${file}" is not part of the static module graph`);
  }
  for (const file of dynamicModules) {
    if (!precached.has(file)) problems.push(`serviceworker.PRECACHE_ASSETS: lazily imported "./${file}" must be precached for offline use`);
  }

  // --- browserconfig --------------------------------------------------------
  const browserConfig = fs.readFileSync(path.join(repoRoot, 'browserconfig.xml'), 'utf8');
  for (const [, src] of browserConfig.matchAll(/src="([^"]+)"/g)) {
    checkReference(src, 'browserconfig.xml');
  }

  // --- Reverse check: shipped images must actually be referenced -------------
  // Orphaned artwork is dead weight on every clone and deploy, and it silently
  // grows because nothing fails when a reference is removed. This guard is
  // excluded as a source so its own exception list is not a reference.
  const relative = file => toPosix(path.relative(repoRoot, file));
  const { orphaned, staleExceptions } = findOrphanedImages({
    images: listImages(repoRoot),
    sources: collectFiles(repoRoot, name => REFERENCE_SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .filter(file => path.resolve(file) !== __filename)
      .map(file => ({ path: relative(file), text: fs.readFileSync(file, 'utf8') })),
    retained: RETAINED_UNREFERENCED_IMAGES
  });
  for (const image of orphaned) problems.push(`orphaned asset: "${image}" is not referenced by any source file`);
  for (const image of staleExceptions) problems.push(`stale exception: "${image}" no longer exists; remove it from RETAINED_UNREFERENCED_IMAGES`);

  Promise.all(screenshotChecks).then(() => {
    for (const formFactor of ['wide', 'narrow']) {
      if (!screenshotRatios.has(formFactor)) problems.push(`manifest.screenshots: missing ${formFactor} capture`);
    }
    if (problems.length) {
      console.error(`Asset verification failed (${problems.length} problem(s)):`);
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
      return;
    }
    console.log('Asset verification passed: all manifest, precache and tile references exist, and no image is orphaned.');
  }).catch(error => {
    console.error(`Asset verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { collectImageReferences, collectModuleGraph, findOrphanedImages, listImages, RETAINED_UNREFERENCED_IMAGES };

if (require.main === module) main();
