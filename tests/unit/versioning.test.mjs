import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

const bumpScript = await readFile(new URL('../../tools/bump-version.cjs', import.meta.url), 'utf8').catch(() => null);

test('deploy tooling exposes a version bump command', () => {
  assert.ok(packageJson.scripts['bump:version'], 'package.json should define a bump:version script');
  assert.ok(bumpScript, 'tools/bump-version.cjs should exist');
});

test('bump script updates package and service worker versions together', () => {
  assert.match(bumpScript, /package\.json/);
  assert.match(bumpScript, /serviceworker\.js/);
  assert.match(bumpScript, /patch/);
});
