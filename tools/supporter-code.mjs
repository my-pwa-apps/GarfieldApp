import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { webcrypto, randomUUID } from 'node:crypto';
import path from 'node:path';

const PRIVATE_KEY_PATH = path.resolve('.wrangler/supporter-code-private-key.jwk');
const PUBLIC_KEY_PATH = path.resolve('.wrangler/supporter-code-public-key.jwk');

function base64UrlEncode(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function usage() {
  console.log(`Usage:
  node tools/supporter-code.mjs keygen
  node tools/supporter-code.mjs issue --name "Jane Doe" --email jane@example.com [--expires 2027-04-30]

The private key is stored in .wrangler/supporter-code-private-key.jwk and must stay private.`);
}

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

async function keygen() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);

  await mkdir(path.dirname(PRIVATE_KEY_PATH), { recursive: true });
  await writeFile(PRIVATE_KEY_PATH, JSON.stringify(privateJwk, null, 2));
  await writeFile(PUBLIC_KEY_PATH, JSON.stringify(publicJwk, null, 2));

  console.log(`Private key written to ${PRIVATE_KEY_PATH}`);
  console.log(`Public key written to ${PUBLIC_KEY_PATH}`);
  console.log('Copy this public key into SUPPORTER_CODE_PUBLIC_KEY_JWK in adIntegration.js if you rotate keys:');
  console.log(JSON.stringify(publicJwk));
}

async function issue() {
  const name = getArg('name').trim();
  const email = getArg('email').trim().toLowerCase();
  const expires = getArg('expires').trim() || '2031-12-31';

  if (!name || !email) {
    usage();
    process.exitCode = 1;
    return;
  }

  const privateJwk = JSON.parse(await readFile(PRIVATE_KEY_PATH, 'utf8'));
  const key = await webcrypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const payload = {
    v: 1,
    sub: name,
    email,
    iat: new Date().toISOString().slice(0, 10),
    exp: expires,
    nonce: randomUUID()
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(payloadPart));

  console.log(`GARFIELD.${payloadPart}.${base64UrlEncode(new Uint8Array(signature))}`);
}

const command = process.argv[2];
if (command === 'keygen') {
  await keygen();
} else if (command === 'issue') {
  await issue();
} else {
  usage();
  process.exitCode = 1;
}
