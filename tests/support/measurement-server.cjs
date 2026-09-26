/**
 * Local app server for performance measurements. Serves the repository through
 * the static-server handler (compressed) over HTTP/2 + TLS, as Cloudflare Pages
 * does, using a throwaway self-signed certificate. HTTP/1.1 would cap the
 * browser at six connections per host and distort any multi-module page load.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const http2 = require('node:http2');
const os = require('node:os');
const path = require('node:path');
const { handleRequest } = require('./static-server.cjs');

function findOpenssl() {
  for (const candidate of ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe']) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' });
      return candidate;
    } catch { /* try the next candidate */ }
  }
  throw new Error('HTTP/2 measurement needs openssl for a throwaway certificate; install it or use --protocol http1');
}

/**
 * @param {{ host: string, port: number, protocol?: 'http2'|'http1' }} options
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
async function startMeasurementServer({ host, port, protocol = 'http2' }) {
  let server;
  if (protocol === 'http1') {
    server = http.createServer(handleRequest);
  } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garfield-h2-'));
    try {
      execFileSync(findOpenssl(), ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
        '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { stdio: 'ignore' });
      server = http2.createSecureServer({
        key: fs.readFileSync(path.join(dir, 'key.pem')),
        cert: fs.readFileSync(path.join(dir, 'cert.pem')),
        allowHTTP1: true
      }, handleRequest);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  await new Promise(resolve => server.listen(port, host, resolve));
  const sessions = new Set();
  server.on('session', session => { sessions.add(session); session.on('close', () => sessions.delete(session)); });
  return {
    url: `${protocol === 'http1' ? 'http' : 'https'}://${host}:${port}/`,
    close: () => new Promise(resolve => {
      for (const session of sessions) session.destroy();
      server.close(() => resolve());
    })
  };
}

module.exports = { startMeasurementServer };
