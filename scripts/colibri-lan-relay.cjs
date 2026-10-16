#!/usr/bin/env node
/**
 * Colibrì Local Network Relay Server (Mesh Gateway)
 * 
 * Allows secondary machines (e.g., second laptop) on the local G7 Wi-Fi network
 * to access the primary Colibrì MoE server running on Ramses's laptop (192.0.2.71:8082).
 * 
 * Why run this relay on a client machine?
 * 1. Bypasses browser Mixed Content & Private Network Access (PNA) security blocks:
 *    Modern browsers restrict web apps from querying raw LAN IPs directly from HTTPS,
 *    but treat http://127.0.0.1 (localhost) as a secure context!
 * 2. High-performance byte-level SSE streaming for token-by-token generation in Chan Chat.
 * 3. Transparent health pass-through with upstream latency measurement.
 * 4. Zero external npm dependencies; runs anywhere with Node.js >= 16.
 * 
 * Usage:
 *   node scripts/colibri-lan-relay.cjs --upstream http://192.0.2.71:8082 --port 8082
 * 
 * Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
 * Co-Authored-By: Antigravity <noreply@google.com>
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Parse CLI flags
const args = process.argv.slice(2);
let listenPort = 8082;
let upstreamUrl = process.env.COLIBRI_UPSTREAM || 'http://192.0.2.71:8082';
let bindHost = '0.0.0.0';

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--port' || arg === '-p') && args[i + 1]) {
        listenPort = parseInt(args[i + 1], 10) || 8082;
        i++;
    } else if ((arg === '--upstream' || arg === '-u') && args[i + 1]) {
        upstreamUrl = args[i + 1];
        i++;
    } else if ((arg === '--host' || arg === '-h') && args[i + 1]) {
        bindHost = args[i + 1];
        i++;
    }
}

// Clean up upstream URL
upstreamUrl = upstreamUrl.replace(/\/+$/, '');
const parsedUpstream = new URL(upstreamUrl);

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range, X-Client-Version');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, X-Relay-Latency-Ms');
}

const server = http.createServer((req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const startTime = Date.now();
    const reqUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const targetUrl = new URL(reqUrl.pathname + reqUrl.search, upstreamUrl);

    // Health interception: if user pings /relay-health, report relay status directly
    if (reqUrl.pathname === '/relay-health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            status: 'ok',
            relay: true,
            version: '1.0.0-mesh',
            listenPort,
            upstream: upstreamUrl,
            timestamp: new Date().toISOString()
        }, null, 2));
        return;
    }

    // Proxy request to upstream Colibrì host
    const clientModule = parsedUpstream.protocol === 'https:' ? https : http;
    const forwardHeaders = { ...req.headers };
    forwardHeaders.host = parsedUpstream.host;
    delete forwardHeaders['content-length']; // let client module recompute if needed

    const proxyReq = clientModule.request({
        protocol: parsedUpstream.protocol,
        hostname: parsedUpstream.hostname,
        port: parsedUpstream.port || (parsedUpstream.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: forwardHeaders,
        timeout: 60000,
    }, (proxyRes) => {
        const latencyMs = Date.now() - startTime;
        
        // Pass through headers
        const responseHeaders = { ...proxyRes.headers };
        responseHeaders['x-relay-latency-ms'] = String(latencyMs);
        responseHeaders['x-colibri-relay'] = 'mesh-gateway-v1';
        setCorsHeaders(res);

        // If this is a /health or /status request, enrich the JSON with relay metadata
        if ((reqUrl.pathname === '/health' || reqUrl.pathname === '/status') && proxyRes.statusCode === 200) {
            let bodyData = '';
            proxyRes.setEncoding('utf8');
            proxyRes.on('data', chunk => { bodyData += chunk; });
            proxyRes.on('end', () => {
                try {
                    const parsed = JSON.parse(bodyData);
                    parsed.relayGateway = {
                        active: true,
                        relayHost: `127.0.0.1:${listenPort}`,
                        upstreamHost: upstreamUrl,
                        latencyMs: latencyMs,
                    };
                    const enrichedBody = JSON.stringify(parsed, null, 2);
                    res.writeHead(200, {
                        ...responseHeaders,
                        'content-type': 'application/json; charset=utf-8',
                        'content-length': Buffer.byteLength(enrichedBody)
                    });
                    res.end(enrichedBody);
                } catch {
                    res.writeHead(proxyRes.statusCode || 200, responseHeaders);
                    res.end(bodyData);
                }
            });
            return;
        }

        // Direct stream pipe for SSE token streaming and chat completions
        res.writeHead(proxyRes.statusCode || 200, responseHeaders);
        proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                error: {
                    message: `Colibrì upstream server timed out: ${upstreamUrl}`,
                    type: 'upstream_timeout',
                    upstream: upstreamUrl
                }
            }));
        }
    });

    proxyReq.on('error', (err) => {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                error: {
                    message: `Colibrì relay failed to reach upstream host (${upstreamUrl}): ${err.message}`,
                    type: 'upstream_unreachable',
                    upstream: upstreamUrl,
                    hint: 'Verify Ramses laptop is awake and connected to G7 network, and Colibri server is active on port 8082.'
                }
            }, null, 2));
        }
    });

    req.pipe(proxyReq);
});

server.listen(listenPort, bindHost, () => {
    console.log(`================================================================`);
    console.log(` 🪶  Colibrì Mesh LAN Relay Server Active`);
    console.log(`================================================================`);
    console.log(` Local Listening Endpoint : http://127.0.0.1:${listenPort}`);
    console.log(` LAN Listening Endpoint   : http://${bindHost}:${listenPort}`);
    console.log(` Upstream Colibrì Host    : ${upstreamUrl}`);
    console.log(` Client Access Mode       : Secure Localhost proxy (bypasses browser PNA/Mixed Content)`);
    console.log(` Health Check             : http://127.0.0.1:${listenPort}/health`);
    console.log(` Relay Diagnostic         : http://127.0.0.1:${listenPort}/relay-health`);
    console.log(`================================================================`);
    console.log(`Ready to forward local network inference requests.`);
});
