#!/usr/bin/env node
// Serves the production build (`dist/`) on http://localhost:4400 the way Caddy does on the VPS:
// the files exactly as built (the service worker checks their hashes, so `ng serve` cannot be
// used), index.html for deep links, and /api/* forwarded to the proxy and the backend as in
// `proxy.conf.json`. Used by `npm run start:prod`, which builds first.
//
// Own port on purpose: a service worker stays registered for its origin, and on :4200 it would
// keep serving this build to `npm start`. The backend must allow the origin (FRONTEND_URL).

import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist/crociata_nera/browser');
const PORT = Number(process.env.PORT ?? 4400);
const PROXY = Object.entries(JSON.parse(readFileSync(join(ROOT, 'proxy.conf.json'), 'utf8'))).map(
  ([prefix, { target }]) => ({ prefix, target: new URL(target) }),
);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
};
// Same rule as deploy/Caddyfile: hashed bundles are immutable, everything else is revalidated.
const HASHED = /-[0-9a-zA-Z_-]{8}\.(js|css)$/;

function forward(req, res, target) {
  const upstream = request(
    {
      host: target.hostname,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: target.host },
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}

function serveFile(res, path) {
  res.writeHead(200, {
    'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
    'Cache-Control': HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(path).pipe(res);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const proxy = PROXY.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
  if (proxy) return forward(req, res, proxy.target);

  const file = join(DIST, normalize(path));
  if (file.startsWith(DIST) && isFile(file)) return serveFile(res, file);
  serveFile(res, join(DIST, 'index.html'));
}).listen(PORT, () => {
  console.log(
    `Production build on http://localhost:${PORT} (APIs: ${PROXY.map((p) => `${p.prefix} → ${p.target.host}`).join(', ')})`,
  );
});
