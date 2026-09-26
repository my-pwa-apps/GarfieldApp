const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const host = getArg('host', '127.0.0.1');
const port = Number(getArg('port', '8000'));
const root = path.resolve(__dirname, '../..');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8'
};
// Production (Cloudflare Pages) compresses text responses; mirror that so local audits see realistic transfer sizes.
const COMPRESSIBLE = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.webmanifest', '.xml']);
const compressedCache = new Map();

function compress(filePath, mtimeMs, content, ext, acceptEncoding = '') {
  if (!COMPRESSIBLE.has(ext)) return { body: content };
  const encoding = /\bbr\b/.test(acceptEncoding) ? 'br' : /\bgzip\b/.test(acceptEncoding) ? 'gzip' : null;
  if (!encoding) return { body: content };
  const key = `${filePath}:${mtimeMs}:${encoding}`;
  if (!compressedCache.has(key)) {
    compressedCache.set(key, encoding === 'br'
      ? zlib.brotliCompressSync(content, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
      : zlib.gzipSync(content));
  }
  return { body: compressedCache.get(key), encoding };
}

function handleRequest(request, response) {
  const requestUrl = new URL(request.url, 'http://localhost');
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^([/\\])+/, '');
  const requestedFile = normalizedPath === '' ? 'index.html' : normalizedPath;
  const filePath = path.resolve(root, requestedFile);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const { body, encoding } = compress(filePath, fs.statSync(filePath).mtimeMs, content, ext, request.headers['accept-encoding']);
    response.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      ...(encoding ? { 'Content-Encoding': encoding, 'Vary': 'Accept-Encoding' } : {})
    });
    response.end(body);
  });
}

module.exports = { handleRequest };

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(port, host, () => {
    console.log(`Serving ${root} at http://${host}:${port}/`);
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}