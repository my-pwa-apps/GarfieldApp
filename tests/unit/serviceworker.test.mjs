import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../serviceworker.js', import.meta.url), 'utf8');

test('service worker version and caches use the same deploy version', () => {
  const version = source.match(/const VERSION = '([^']+)'/)?.[1];
  assert.match(version, /^v\d+\.\d+\.\d+$/);
  assert.match(source, /const CACHE_NAME = `garfield-\$\{VERSION\}`/);
  assert.match(source, /const RUNTIME_CACHE = `garfield-runtime-\$\{VERSION\}`/);
  assert.match(source, /const IMAGE_CACHE = `garfield-images-\$\{VERSION\}`/);
});

test('install precache bypasses the browser HTTP cache for fresh deploy assets', () => {
  assert.match(source, /new Request\(asset, \{ cache: 'reload' \}\)/);
  assert.match(source, /const REQUIRED_PRECACHE_ASSETS = new Set/);
  assert.match(source, /console\.error\(`Failed to precache \$\{asset\}`/);
  for (const asset of ['index.html', 'main.css', 'app.js', 'comicExtractor.js', 'googleDriveSync.js', 'manifest.webmanifest']) {
    assert.match(source, new RegExp(`'\\./${asset.replace('.', '\\.')}'`));
  }
});

test('activation removes stale Garfield caches while preserving the current cache set', () => {
  assert.match(source, /const currentCaches = \[CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE\]/);
  assert.match(source, /name\.startsWith\('garfield-'\) && !currentCaches\.includes\(name\)/);
  assert.match(source, /caches\.delete\(name\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
});

test('offline and cache limits are covered by service worker strategies', () => {
  assert.match(source, /const MAX_IMAGE_CACHE_SIZE = 50/);
  assert.match(source, /const MAX_RUNTIME_CACHE_SIZE = 30/);
  assert.match(source, /while \(keys\.length >= maxSize\)/);
  assert.match(source, /while \(keys\.length >= MAX_RUNTIME_CACHE_SIZE\)/);
  assert.match(source, /return caches\.match\('\.\/index\.html'\)/);
  assert.match(source, /Image not available offline/);
});

test('update flow supports skip waiting messages', () => {
  assert.match(source, /event\.data\?\.type === 'SKIP_WAITING'/);
  assert.match(source, /self\.skipWaiting\(\)/);
});