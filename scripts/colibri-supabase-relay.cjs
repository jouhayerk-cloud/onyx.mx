#!/usr/bin/env node
/**
 * scripts/colibri-supabase-relay.cjs
 *
 * Standalone G7 Node Daemon: Supabase Realtime wss:// <-> Colibrì MoE Loopback Relay
 *
 * Bridges incoming Colibrì requests from remote devices (iPhone / iPad / Second Laptop)
 * arriving over Supabase Realtime (colibri_relay_global) to the local Colibrì engine
 * at http://127.0.0.1:8082, streaming tokens back via COLIBRI_STREAM SSE broadcasts.
 *
 * Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
 * Co-Authored-By: Antigravity <noreply@google.com>
 */

const path = require('path');
const http = require('http');

// Load environment variables from .env.local or .env
try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch {
    // If dotenv is unavailable, rely on process.env
}

const { createClient } = require('@supabase/supabase-js');

// Parse CLI flags: --colibri-port <num>
let colibriPort = 8082;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '--colibri-port') && args[i + 1]) {
        colibriPort = parseInt(args[i + 1], 10) || 8082;
        i++;
    }
}
if (process.env.COLIBRI_PORT) {
    colibriPort = parseInt(process.env.COLIBRI_PORT, 10) || colibriPort;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ [colibri-relay] Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from environment.');
    console.error('   Please verify .env.local or set environment variables before starting.');
    process.exit(1);
}

const CHANNEL_NAME = 'colibri_relay_global';
const DAEMON_ID = `g7_daemon_${process.pid}_${Date.now().toString(36)}`;
const COLIBRI_BASE_URL = `http://127.0.0.1:${colibriPort}`;

console.log('='.repeat(70));
console.log('   COLIBRI SUPABASE REALTIME RELAY DAEMON (G7 Host)');
console.log(`   * Local Engine:     ${COLIBRI_BASE_URL}`);
console.log(`   * Supabase Channel: ${CHANNEL_NAME}`);
console.log(`   * Daemon Node ID:   ${DAEMON_ID}`);
console.log('='.repeat(70));

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
});

let channel = null;
let isColibriAlive = false;
let modelsCache = ['colibri-glm-5.2-moe', 'colibri-kimi-k3-moe', 'colibri-qwen-2.5-3b'];
let telemetryCache = { tokensPerSecond: 26.5, nvmeReadMBps: 2740.8 };

/**
 * Checks local Colibrì daemon health
 */
function probeLocalColibri() {
    return new Promise((resolve) => {
        const req = http.get(`${COLIBRI_BASE_URL}/health`, { timeout: 1200 }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.telemetry?.tokensPerSecond) {
                            telemetryCache.tokensPerSecond = parsed.telemetry.tokensPerSecond;
                        }
                        if (parsed.telemetry?.nvmeReadMBps) {
                            telemetryCache.nvmeReadMBps = parsed.telemetry.nvmeReadMBps;
                        }
                    } catch {
                        // ignore JSON parse
                    }
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

/**
 * Updates Presence on the Supabase Realtime channel
 */
async function updatePresence() {
    if (!channel) return;
    try {
        if (isColibriAlive) {
            await channel.track({
                role: 'colibri-host',
                hostName: 'G7-Daemon',
                node: 'G7-Host-PC',
                url: COLIBRI_BASE_URL,
                models: modelsCache,
                tps: telemetryCache.tokensPerSecond,
                nvmeMBps: telemetryCache.nvmeReadMBps,
                timestamp: Date.now(),
            });
        } else {
            await channel.untrack();
        }
    } catch (err) {
        console.warn('[colibri-relay] Presence track error:', err.message);
    }
}

/**
 * Forwards an incoming request from Realtime to http://127.0.0.1:8082
 */
async function handleRelayRequest(reqPayload) {
    const { reqId, endpoint, method, body, stream } = reqPayload;
    if (!reqId || !endpoint) return;

    const requestMethod = method || (body ? 'POST' : 'GET');
    const url = new URL(endpoint, COLIBRI_BASE_URL);

    const postData = body ? JSON.stringify(body) : null;
    const headers = {
        'Accept': stream ? 'text/event-stream' : 'application/json',
    };
    if (postData) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
        hostname: '127.0.0.1',
        port: colibriPort,
        path: url.pathname + url.search,
        method: requestMethod,
        headers,
        timeout: 90000,
    };

    const clientReq = http.request(options, (res) => {
        if (stream) {
            let buffer = '';
            let chunkIdx = 0;

            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data:')) {
                        const dataStr = trimmed.slice(5).trim();
                        if (dataStr === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(dataStr);
                            channel.send({
                                type: 'broadcast',
                                event: 'COLIBRI_STREAM',
                                payload: {
                                    reqId,
                                    delta: parsed,
                                    chunkIndex: chunkIdx++,
                                    timestamp: Date.now(),
                                },
                            });
                        } catch {
                            // ignore raw chunk
                        }
                    }
                }
            });

            res.on('end', () => {
                channel.send({
                    type: 'broadcast',
                    event: 'COLIBRI_RES',
                    payload: {
                        reqId,
                        ok: res.statusCode < 400,
                        status: res.statusCode || 200,
                        timestamp: Date.now(),
                    },
                });
            });
        } else {
            let rawData = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                let parsed = {};
                try {
                    parsed = JSON.parse(rawData);
                } catch {
                    parsed = { text: rawData };
                }

                channel.send({
                    type: 'broadcast',
                    event: 'COLIBRI_RES',
                    payload: {
                        reqId,
                        ok: res.statusCode < 400,
                        status: res.statusCode || 200,
                        data: parsed,
                        timestamp: Date.now(),
                    },
                });
            });
        }
    });

    clientReq.on('error', (err) => {
        channel.send({
            type: 'broadcast',
            event: 'COLIBRI_RES',
            payload: {
                reqId,
                ok: false,
                status: 502,
                error: `Local Colibrì engine unreachable on port ${colibriPort}: ${err.message}`,
                timestamp: Date.now(),
            },
        });
    });

    clientReq.on('timeout', () => {
        clientReq.destroy();
        channel.send({
            type: 'broadcast',
            event: 'COLIBRI_RES',
            payload: {
                reqId,
                ok: false,
                status: 504,
                error: `Local Colibrì engine timed out`,
                timestamp: Date.now(),
            },
        });
    });

    if (postData) {
        clientReq.write(postData);
    }
    clientReq.end();
}

/**
 * Main daemon startup routine
 */
async function startDaemon() {
    console.log('[colibri-relay] Connecting to Supabase Realtime channel...');

    channel = supabase.channel(CHANNEL_NAME, {
        config: {
            broadcast: { self: false, ack: false },
            presence: { key: DAEMON_ID },
        },
    });

    channel
        .on('broadcast', { event: 'COLIBRI_REQ' }, ({ payload }) => {
            if (isColibriAlive) {
                void handleRelayRequest(payload);
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ [colibri-relay] Connected and subscribed to colibri_relay_global!');
                isColibriAlive = await probeLocalColibri();
                if (isColibriAlive) {
                    console.log('⚡ [colibri-relay] Local Colibrì engine is ONLINE. Tracking presence as G7-Daemon.');
                } else {
                    console.log('⏳ [colibri-relay] Local Colibrì engine not responding yet. Waiting for start on port', colibriPort);
                }
                await updatePresence();
            }
        });

    // Health-check loop every 5 seconds
    setInterval(async () => {
        const wasAlive = isColibriAlive;
        isColibriAlive = await probeLocalColibri();
        if (isColibriAlive !== wasAlive) {
            console.log(`[colibri-relay] Engine status changed: ${wasAlive ? 'ONLINE -> OFFLINE' : 'OFFLINE -> ONLINE'}`);
            await updatePresence();
        }
    }, 5000);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[colibri-relay] Shutting down daemon...');
    if (channel) {
        await channel.untrack();
        supabase.removeChannel(channel);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (channel) {
        await channel.untrack();
        supabase.removeChannel(channel);
    }
    process.exit(0);
});

startDaemon().catch((err) => {
    console.error('Fatal relay daemon error:', err);
    process.exit(1);
});
