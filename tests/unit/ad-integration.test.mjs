import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../adIntegration.js', import.meta.url), 'utf8');

test('ad integration stays disabled until real AdSense identifiers are configured', () => {
  assert.match(source, /ADSENSE_CLIENT: ''/);
  assert.match(source, /ADSENSE_SLOT: ''/);
  assert.match(source, /SUPPORTER_KEY: 'supporterAdFree'/);
  assert.match(source, /function isAdSenseConfigured\(\)/);
  assert.match(source, /hideAdContainer\(\)/);
});

test('supporter ad-free mode prevents ad loading', () => {
  assert.match(source, /function isSupporterAdFree\(\)/);
  assert.match(source, /function setSupporterAdFree\(enabled\)/);
  assert.match(source, /if \(isSupporterAdFree\(\)\) \{/);
  assert.match(source, /hideAdContainer\('supporter'\)/);
});

test('ad integration uses one responsive non-intrusive AdSense placement', () => {
  assert.match(source, /data-ad-format', 'auto'/);
  assert.match(source, /data-full-width-responsive', 'true'/);
  assert.match(source, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
  assert.doesNotMatch(source, /interstitial|popup|anchor/i);
});
