import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../adIntegration.js', import.meta.url), 'utf8');

test('ad integration is configured with the GarfieldAds AdSense unit', () => {
  assert.match(source, /ADSENSE_CLIENT: 'ca-pub-8199141612193910'/);
  assert.match(source, /ADSENSE_SLOT: '7960972415'/);
  assert.match(source, /SUPPORTER_KEY: 'supporterAdFree'/);
  assert.match(source, /SUPPORTER_CODE_PUBLIC_KEY_JWK/);
  assert.match(source, /function isAdSenseConfigured\(\)/);
});

test('ad integration can render a local placeholder when identifiers are not configured', () => {
  assert.match(source, /function renderPlaceholderAd\(frame\)/);
  assert.match(source, /showAdContainer\('placeholder'\)/);
});

test('supporter ad-free mode prevents ad loading', () => {
  assert.match(source, /function isSupporterAdFree\(\)/);
  assert.match(source, /function setSupporterAdFree\(enabled, details = \{\}\)/);
  assert.match(source, /async function verifySupporterCode\(code\)/);
  assert.match(source, /async function applySupporterCode\(code\)/);
  assert.match(source, /if \(isSupporterAdFree\(\)\) \{/);
  assert.match(source, /hideAdContainer\('supporter'\)/);
});

test('ad integration uses one responsive non-intrusive AdSense placement', () => {
  assert.match(source, /ad-placeholder-preview/);
  assert.match(source, /data-ad-format', 'auto'/);
  assert.match(source, /data-full-width-responsive', 'true'/);
  assert.match(source, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
  assert.doesNotMatch(source, /interstitial|popup|anchor/i);
});
