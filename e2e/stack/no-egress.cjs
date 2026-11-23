// Network guard of the e2e stack, preloaded (`--require`) into the servers the stack starts (backend
// and frontend), never into development or production processes.
//
// Every outgoing TCP connection (net, tls, http, https, fetch/undici, the MongoDB driver, nodemailer:
// they all end in `net.Socket.prototype.connect`) is refused unless it goes to a loopback address
// AND a port listed in E2E_EGRESS_ALLOW. Host names other than `localhost` are refused before any
// DNS lookup, DNS queries for them are refused, UDP is refused. A refused connection fails like a
// network error (code E2E_EGRESS_BLOCKED) and is logged as `[e2e-egress] blocked …`: the stack
// counts those lines and the run fails if any appears (playwright.config.ts → global teardown).
//
// Environment:
//   E2E_EGRESS_ALLOW     comma-separated loopback ports the process may connect to (required)
//   E2E_EGRESS_SELFTEST  `1`: at start-up, try three forbidden connections (a documentation-only
//                        address, an `.invalid` name, fetch) and log `[e2e-egress] self-test passed`
//                        only if the guard refused all three. The targets are unroutable/unresolvable
//                        on purpose, so even a broken guard sends nothing anywhere.
//
// Limits: it guards Node's own network APIs in this process and in the Node processes it starts
// (NODE_OPTIONS is inherited). A native program started by the process would not be covered; the
// backend starts none.

'use strict';

// Patched in place: typed loosely, their signatures are overloaded.
/** @type {any} */
const net = require('node:net');
/** @type {any} */
const dns = require('node:dns');
/** @type {any} */
const dgram = require('node:dgram');

const TAG = '[e2e-egress]';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
const allowedPorts = new Set(
  (process.env.E2E_EGRESS_ALLOW ?? '')
    .split(',')
    .map((port) => Number(port.trim()))
    .filter((port) => Number.isInteger(port) && port > 0),
);
const SELF_TEST_HOSTS = new Set(['192.0.2.1', 'egress-check.invalid']);

function log(message) {
  process.stderr.write(`${TAG} ${message}\n`);
}

function blockedError(what) {
  return Object.assign(
    new Error(`${TAG} blocked ${what}: the e2e stack allows no outbound connection`),
    { code: 'E2E_EGRESS_BLOCKED' },
  );
}

function report(what, host) {
  log(`blocked ${what}${SELF_TEST_HOSTS.has(host) ? ' (self-test)' : ''} pid=${process.pid}`);
}

/** Target of the arguments of `Socket#connect` (every form Node accepts, normalized or not). */
function targetOf(args) {
  const list = Array.isArray(args[0]) ? args[0] : args;
  const first = list[0];
  if (first && typeof first === 'object') {
    if (first.path !== undefined) return { path: String(first.path) };
    return { host: first.host ?? 'localhost', port: Number(first.port) };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { path: first };
  return { host: typeof list[1] === 'string' ? list[1] : 'localhost', port: Number(first) };
}

/** Loopback host and an approved port. Unix sockets are local by nature. */
function isAllowed(target) {
  if (target.path !== undefined) return true;
  return LOOPBACK_HOSTS.has(String(target.host).toLowerCase()) && allowedPorts.has(target.port);
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const target = targetOf(args);
  if (isAllowed(target)) return originalConnect.apply(this, args);
  const what = `connection to ${target.host}:${target.port}`;
  report(what, target.host);
  const error = blockedError(what);
  // Fails the way a refused connection does: asynchronously, as an `error` of the socket.
  process.nextTick(() => this.destroy(error));
  return this;
};

/** DNS: only `localhost` resolves; any other name would be a query leaving the machine. */
const isLocalName = (hostname) => LOOPBACK_HOSTS.has(String(hostname).toLowerCase());
const originalLookup = dns.lookup;
dns.lookup = function guardedLookup(hostname, ...rest) {
  if (isLocalName(hostname)) return originalLookup.apply(this, [hostname, ...rest]);
  const callback = rest.at(-1);
  report(`DNS lookup of ${hostname}`, hostname);
  process.nextTick(() => callback(blockedError(`DNS lookup of ${hostname}`)));
  return {};
};
const originalPromisesLookup = dns.promises.lookup;
dns.promises.lookup = async function guardedPromisesLookup(hostname, ...rest) {
  if (isLocalName(hostname)) return originalPromisesLookup.apply(this, [hostname, ...rest]);
  report(`DNS lookup of ${hostname}`, hostname);
  throw blockedError(`DNS lookup of ${hostname}`);
};
for (const name of Object.keys(dns)) {
  if ((name.startsWith('resolve') || name === 'reverse') && typeof dns[name] === 'function') {
    dns[name] = (query, ...rest) => {
      const callback = rest.at(-1);
      report(`DNS query ${name}(${query})`, query);
      process.nextTick(() => callback(blockedError(`DNS query ${name}(${query})`)));
    };
  }
}
for (const name of Object.keys(dns.promises)) {
  if (
    (name.startsWith('resolve') || name === 'reverse') &&
    typeof dns.promises[name] === 'function'
  ) {
    dns.promises[name] = async (query) => {
      report(`DNS query ${name}(${query})`, query);
      throw blockedError(`DNS query ${name}(${query})`);
    };
  }
}

/** UDP: nothing in the stack needs it. */
dgram.createSocket = function guardedCreateSocket() {
  report('UDP socket', '');
  throw blockedError('UDP socket');
};

log(`active pid=${process.pid} allowed loopback ports=${[...allowedPorts].join(',') || 'none'}`);

if (process.env.E2E_EGRESS_SELFTEST === '1') {
  const attempt = (connect) =>
    new Promise((resolve) => {
      const socket = connect();
      socket.once('connect', () => {
        socket.destroy();
        resolve('connected');
      });
      socket.once('error', (error) => resolve(error.code));
    });
  Promise.all([
    attempt(() => net.connect(443, '192.0.2.1')),
    attempt(() => net.connect(443, 'egress-check.invalid')),
    fetch('http://192.0.2.1/', { signal: AbortSignal.timeout(5000) }).then(
      () => 'connected',
      (error) => error?.cause?.code ?? error?.code ?? String(error),
    ),
  ]).then((results) => {
    if (results.every((code) => code === 'E2E_EGRESS_BLOCKED')) log('self-test passed');
    else log(`self-test FAILED: ${results.join(', ')}`);
  });
}
