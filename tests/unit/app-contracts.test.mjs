import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../../app.js', import.meta.url), 'utf8');

function extractTranslations() {
  const startToken = 'const translations = ';
  const start = appSource.indexOf(startToken);
  assert.notEqual(start, -1, 'translations object should be discoverable');

  const objectStart = appSource.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = objectStart; index < appSource.length; index += 1) {
    const char = appSource[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return Function(`return (${appSource.slice(objectStart, index + 1)});`)();
    }
  }

  throw new Error('translations object did not close');
}

test('translation dictionaries expose the same application keys in English and Spanish', () => {
  const translations = extractTranslations();
  const enKeys = Object.keys(translations.en).sort();
  const esKeys = Object.keys(translations.es).sort();
  assert.deepEqual(esKeys, enKeys);
});

test('date-only helpers are used for all favorites and ISO date parsing paths', () => {
  assert.match(appSource, /dateFromISODateString\(dateString\)/);
  assert.match(appSource, /dateFromFavoriteDateString\(dateString\)/);
  assert.doesNotMatch(appSource, /new Date\(favs\[/);
  assert.doesNotMatch(appSource, /new Date\(CONFIG\.GARFIELD_START/);
  assert.doesNotMatch(appSource, /new Date\('1978-06-19'\)/);
});

test('localStorage reads use safe helpers for favorites and corrupt JSON protection', () => {
  assert.match(appSource, /safeJSONParse\(str, fallback\)/);
  assert.match(appSource, /getFavorites\(\)/);
  assert.match(appSource, /localStorage\.getItem\(CONFIG\.STORAGE_KEYS\.FAVS\)/);
  assert.match(appSource, /catch \(e\)/);
});

test('settings sync preferences cover user-facing configuration state', () => {
  const match = appSource.match(/window\.getSyncPreferences = function getSyncPreferences\(\) \{[\s\S]*?\n\};/);
  assert.ok(match, 'getSyncPreferences should be exported');
  for (const key of ['comicSource', 'spanish', 'swipeEnabled', 'shuffle']) {
    assert.match(match[0], new RegExp(`${key}:`));
  }
});