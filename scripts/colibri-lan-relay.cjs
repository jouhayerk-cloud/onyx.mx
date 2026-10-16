#!/usr/bin/env node
/**
 * Colibrì LAN relay: a small forwarding proxy in front of a Colibrì server on another machine.
 *
 * Secure by default:
 *  - listens on 127.0.0.1 only. Listening on any other address needs BOTH --allow-lan and --token (a shared secret
 *    every client must send as "Authorization: Bearer <token>"), so there is no open proxy on the network;
 *  - CORS answers only for an explicit list of origins (never "*"); a browser page from any other origin gets 403;
 *  - only the calls the app needs are forwarded: GET /health, GET /v1/models, POST /v1/chat/completions (and the
 *    relay's own GET /relay-health). Everything else is 404;
 *  - the Host header must match the address the relay listens on (blocks DNS rebinding), bodies are capped at 4 MB.
 *
 * Why use it at all: a page served over HTTPS cannot call a plain-HTTP LAN address (mixed content / private network
 * access), but it can call http://127.0.0.1. Run the relay on the client machine, point it at the Colibrì server, and
 * set the app's Colibrì address to http://127.0.0.1:<port>.
 *
 * Usage (no address is built in; --upstream is required):
 *   node scripts/colibri-lan-relay.cjs --upstream http://<colibri-host>:8000 --port 8001
 *   node scripts/colibri-lan-relay.cjs --upstream http://<colibri-host>:8000 --host 0.0.0.0 --allow-lan --token <secret>
 *
 * Options:
 *   --upstream <url>        Colibrì server to forward to (or env COLIBRI_UPSTREAM). Required.
 *   --upstream-key <key>    Bearer key the Colibrì server expects (or env COLI_API_KEY). Optional.
 *   --port <n>              Listen port (default 8001).
 *   --host <addr>           Listen address (default 127.0.0.1).
 *   --allow-lan             Permit a non-loopback --host (needs --token).
 *   --token <secret>        Shared secret clients must send (or env COLIBRI_RELAY_TOKEN).
 *   --allow-origin <origin> Extra allowed browser origin (repeatable).
 *
 * Zero npm dependencies; Node.js >= 16.
 */
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_ORIGINS = [
    'https://jouhayerk-cloud.github.io',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://localhost:1001',
];
const MAX_BODY_BYTES = 4 * 1024 * 1024;
// the local model answers at about half a token per second, so a long upstream timeout is correct
const UPSTREAM_TIMEOUT_MS = 15 * 60 * 1000;

const args = process.argv.slice(2);
let listenPort = 8001;
let upstreamUrl = process.env.COLIBRI_UPSTREAM || '';
let upstreamKey = process.env.COLI_API_KEY || '';
let bindHost = '127.0.0.1';
let allowLan = false;
let token = process.env.COLIBRI_RELAY_TOKEN || '';
const allowedOrigins = new Set(DEFAULT_ORIGINS);

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if ((arg === '--port' || arg === '-p') && next) { listenPort = parseInt(next, 10) || listenPort; i++; }
    else if ((arg === '--upstream' || arg === '-u') && next) { upstreamUrl = next; i++; }
    else if (arg === '--upstream-key' && next) { upstreamKey = next; i++; }
    else if (arg === '--host' && next) { bindHost = next; i++; }
    else if (arg === '--allow-lan') { allowLan = true; }
    else if (arg === '--token' && next) { token = next; i++; }
    else if (arg === '--allow-origin' && next) { allowedOrigins.add(next.replace(/\/+$/, '')); i++; }
}

const isLoopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1';

if (!upstreamUrl) {
    console.error('Missing --upstream. Example: node scripts/colibri-lan-relay.cjs --upstream http://<colibri-host>:8000');
    process.exit(1);
}
if (!isLoopback(bindHost) && !(allowLan && token)) {
    console.error(`Refusing to listen on ${bindHost}: a non-loopback address needs both --allow-lan and --token <secret>.`);
    process.exit(1);
}

upstreamUrl = upstreamUrl.replace(/\/+$/, '');
let parsedUpstream;
try {
    parsedUpstream = new URL(upstreamUrl);
    if (!/^https?:$/.test(parsedUpstream.protocol)) throw new Error('not http(s)');
} catch {
    console.error(`Invalid --upstream: ${upstreamUrl}`);
    process.exit(1);
}

const ALLOWED = [
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/v1/models' },
    { method: 'POST', path: '/v1/chat/completions' },
];

function corsHeaders(origin) {
    return origin && allowedOrigins.has(origin)
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Expose-Headers': 'x-relay-latency-ms',
            'Vary': 'Origin',
        }
        : { 'Vary': 'Origin' };
}

function sendJson(res, status, body, extra) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...(extra || {}) });
    res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const cors = corsHeaders(origin);

    // a browser page from an origin that is not on the list gets nothing, not even a preflight answer
    if (origin && !allowedOrigins.has(origin)) {
        return sendJson(res, 403, { error: { message: 'Origin not allowed', type: 'forbidden_origin' } }, cors);
    }

    // DNS-rebinding guard: the Host header must be the address we listen on
    const hostName = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    const hostOk = isLoopback(bindHost) ? isLoopback(hostName) : (hostName === bindHost || isLoopback(hostName));
    if (!hostOk) {
        return sendJson(res, 403, { error: { message: 'Host not allowed', type: 'forbidden_host' } }, cors);
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204, cors);
        res.end();
        return;
    }

    if (token) {
        const auth = String(req.headers.authorization || '');
        if (auth !== `Bearer ${token}`) {
            return sendJson(res, 401, { error: { message: 'Missing or wrong relay token', type: 'unauthorized' } }, cors);
        }
    }

    const startTime = Date.now();
    const reqUrl = new URL(req.url, 'http://relay.invalid');
    const pathname = reqUrl.pathname;

    if (req.method === 'GET' && pathname === '/relay-health') {
        return sendJson(res, 200, { status: 'ok', relay: true, listenPort, upstream: parsedUpstream.host }, cors);
    }

    if (!ALLOWED.some(a => a.method === req.method && a.path === pathname)) {
        return sendJson(res, 404, { error: { message: 'Not found', type: 'not_found' } }, cors);
    }

    const clientModule = parsedUpstream.protocol === 'https:' ? https : http;
    const forwardHeaders = {
        host: parsedUpstream.host,
        accept: req.headers.accept || 'application/json',
    };
    if (req.headers['content-type']) forwardHeaders['content-type'] = req.headers['content-type'];
    if (upstreamKey) forwardHeaders.authorization = `Bearer ${upstreamKey}`;

    const proxyReq = clientModule.request({
        protocol: parsedUpstream.protocol,
        hostname: parsedUpstream.hostname,
        port: parsedUpstream.port || (parsedUpstream.protocol === 'https:' ? 443 : 80),
        path: pathname,   // no query string and no caller-chosen host: only the fixed upstream
        method: req.method,
        headers: forwardHeaders,
        timeout: UPSTREAM_TIMEOUT_MS,
    }, (proxyRes) => {
        const responseHeaders = {};
        for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (!k.toLowerCase().startsWith('access-control-')) responseHeaders[k] = v;   // CORS is decided here, not upstream
        }
        Object.assign(responseHeaders, cors, { 'x-relay-latency-ms': String(Date.now() - startTime) });
        res.writeHead(proxyRes.statusCode || 502, responseHeaders);
        proxyRes.pipe(res);   // byte-level pipe keeps token-by-token SSE streaming
    });

    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) sendJson(res, 504, { error: { message: 'Colibrì upstream timed out', type: 'upstream_timeout' } }, cors);
    });
    proxyReq.on('error', (err) => {
        if (!res.headersSent) {
            sendJson(res, 502, { error: { message: `Relay could not reach the Colibrì server: ${err.message}`, type: 'upstream_unreachable' } }, cors);
        }
    });
    // a client that goes away (Stop pressed) must not leave the upstream generating for nobody
    res.on('close', () => { if (!res.writableEnded) proxyReq.destroy(); });

    let received = 0;
    req.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_BODY_BYTES) {
            proxyReq.destroy();
            if (!res.headersSent) sendJson(res, 413, { error: { message: 'Request too large', type: 'payload_too_large' } }, cors);
            req.destroy();
        }
    });
    req.pipe(proxyReq);
});

server.listen(listenPort, bindHost, () => {
    console.log('Colibrì relay listening');
    console.log(`  Listen   : http://${bindHost}:${listenPort}${isLoopback(bindHost) ? ' (this machine only)' : ' (token required)'}`);
    console.log(`  Upstream : ${parsedUpstream.protocol}//${parsedUpstream.host}`);
    console.log(`  Origins  : ${[...allowedOrigins].join(', ')}`);
    console.log('  Allowed  : GET /health, GET /v1/models, POST /v1/chat/completions');
});
