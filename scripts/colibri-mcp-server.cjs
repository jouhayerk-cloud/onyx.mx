#!/usr/bin/env node
/**
 * scripts/colibri-mcp-server.cjs
 *
 * Model Context Protocol (MCP) Standard stdio Server for Colibrì MoE Engine
 *
 * Lets AI assistants talk to the local Colibrì server (OpenAI API on http://127.0.0.1:8000, text only).
 *
 * Tools:
 * - colibri_health: what the server's GET /health really reports.
 * - colibri_models: the model GET /v1/models reports (the server serves one model at a time).
 * - colibri_chat: one chat completion. Slow on a PC without a big GPU (about 0.5 tokens per second measured).
 * - colibri_relay_status: the Supabase Realtime relay is DISABLED until it is secured; this only says so.
 *
 * Environment: COLIBRI_BASE_URL (default http://127.0.0.1:8000) or COLIBRI_PORT, COLI_API_KEY (optional bearer).
 *
 * Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
 * Co-Authored-By: Antigravity <noreply@google.com>
 */

const http = require('http');
const readline = require('readline');
const path = require('path');

// Load environment variables if available silently (MCP stdout must only contain JSON-RPC)
try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
    dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });
} catch {
    // ignore
}

const COLIBRI_PORT = parseInt(process.env.COLIBRI_PORT || '8000', 10);
const COLIBRI_BASE_URL = (process.env.COLIBRI_BASE_URL || `http://127.0.0.1:${COLIBRI_PORT}`).replace(/\/+$/, '');
const COLIBRI_URL = new URL(COLIBRI_BASE_URL);
const COLIBRI_API_KEY = process.env.COLI_API_KEY || '';
// the local model answers at about half a token per second: a chat call needs minutes, a probe needs seconds
const PROBE_TIMEOUT_MS = 5000;
const CHAT_TIMEOUT_MS = 15 * 60 * 1000;

function makeHttpRequest(endpoint, method = 'GET', body = null, timeout = PROBE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : null;
        const client = COLIBRI_URL.protocol === 'https:' ? require('https') : http;
        const options = {
            hostname: COLIBRI_URL.hostname,
            port: COLIBRI_URL.port || (COLIBRI_URL.protocol === 'https:' ? 443 : 80),
            path: endpoint,
            method: method,
            headers: {
                'Accept': 'application/json',
                ...(COLIBRI_API_KEY ? { 'Authorization': `Bearer ${COLIBRI_API_KEY}` } : {}),
                ...(postData ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                } : {}),
            },
            timeout,
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, ok: res.statusCode < 400, data: parsed });
                } catch {
                    resolve({ status: res.statusCode, ok: res.statusCode < 400, data: { text: data } });
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`Colibrì connection error on ${COLIBRI_BASE_URL}: ${err.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Colibrì request to ${endpoint} timed out`));
        });

        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

const TOOLS_MANIFEST = [
    {
        name: 'colibri_health',
        description: 'Check the local Colibrì server: status, architecture, request queue counters (exactly what GET /health reports).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'colibri_models',
        description: 'List the model the local Colibrì server has loaded (it serves one at a time).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'colibri_chat',
        description: 'Send a chat prompt to the local Colibrì model. Slow (about 0.5 tokens per second on this PC): keep max_tokens small.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The user prompt or instruction to send to Colibrì',
                },
                model: {
                    type: 'string',
                    description: 'Optional model id. Omit it to use the loaded model; any id the server did not load fails with 404.',
                },
                system: {
                    type: 'string',
                    description: 'Optional system instructions for the MoE model',
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature between 0.0 and 1.0 (default 0.7)',
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum tokens to generate (default 256)',
                },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'colibri_relay_status',
        description: 'The Supabase Realtime relay to Colibrì is disabled until it is secured; returns that status plus whether the local server answers.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];

async function executeTool(name, args) {
    switch (name) {
        case 'colibri_health': {
            try {
                const res = await makeHttpRequest('/health', 'GET');
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                ok: res.ok,
                                status: res.status,
                                endpoint: `${COLIBRI_BASE_URL}/health`,
                                health: res.data,
                            }, null, 2),
                        },
                    ],
                };
            } catch (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                ok: false,
                                error: err.message,
                                hint: `Start the Colibrì server on this PC (START-HERE.bat or coli web); expected at ${COLIBRI_BASE_URL}.`,
                            }, null, 2),
                        },
                    ],
                    isError: true,
                };
            }
        }

        case 'colibri_models': {
            try {
                const res = await makeHttpRequest('/v1/models', 'GET');
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                ok: res.ok,
                                models: res.data?.data || res.data,
                            }, null, 2),
                        },
                    ],
                };
            } catch (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ ok: false, error: err.message }, null, 2),
                        },
                    ],
                    isError: true,
                };
            }
        }

        case 'colibri_chat': {
            const start = Date.now();
            const messages = [];
            if (args.system) {
                messages.push({ role: 'system', content: args.system });
            }
            messages.push({ role: 'user', content: args.prompt });

            try {
                // the server rejects any model id but the loaded one, so ask it which one that is
                let modelId = args.model;
                if (!modelId) {
                    const m = await makeHttpRequest('/v1/models', 'GET');
                    modelId = m.data?.data?.[0]?.id;
                    if (!modelId) throw new Error('Colibrì has no model loaded');
                }
                const payload = {
                    model: modelId,
                    messages,
                    temperature: args.temperature !== undefined ? args.temperature : 0.7,
                    max_tokens: args.max_tokens || 256,
                    stream: false,
                };
                const res = await makeHttpRequest('/v1/chat/completions', 'POST', payload, CHAT_TIMEOUT_MS);
                const latencyMs = Date.now() - start;
                const text = res.data?.choices?.[0]?.message?.content ?? '';
                const usage = res.data?.usage;
                const tps = usage?.completion_tokens ? Number((usage.completion_tokens / (latencyMs / 1000)).toFixed(1)) : null;

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                ok: res.ok,
                                response: text,
                                model: res.data?.model || modelId,
                                latencyMs,
                                tokensPerSecond: tps,
                                usage,
                            }, null, 2),
                        },
                    ],
                };
            } catch (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ ok: false, error: err.message }, null, 2),
                        },
                    ],
                    isError: true,
                };
            }
        }

        case 'colibri_relay_status': {
            let localAlive = false;
            try {
                const res = await makeHttpRequest('/health', 'GET');
                localAlive = res.ok;
            } catch {
                localAlive = false;
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            relay: 'disabled',
                            reason: 'The Supabase Realtime relay stays off until it is secured (private channel, RLS, allowlisted host, endpoint allowlist).',
                            localEngineAlive: localAlive,
                            localEngineUrl: COLIBRI_BASE_URL,
                        }, null, 2),
                    },
                ],
            };
        }

        default:
            return {
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                isError: true,
            };
    }
}

// Setup JSON-RPC 2.0 stdio loop
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
        req = JSON.parse(trimmed);
    } catch {
        // Invalid JSON ignored
        return;
    }

    const { id, method, params } = req;

    if (method === 'initialize') {
        const response = {
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: {
                    name: 'colibri-mcp-server',
                    version: '1.2.0',
                },
            },
        };
        process.stdout.write(JSON.stringify(response) + '\n');
        return;
    }

    if (method === 'notifications/initialized') {
        // No response needed for notification
        return;
    }

    if (method === 'tools/list') {
        const response = {
            jsonrpc: '2.0',
            id,
            result: {
                tools: TOOLS_MANIFEST,
            },
        };
        process.stdout.write(JSON.stringify(response) + '\n');
        return;
    }

    if (method === 'tools/call') {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        try {
            const toolResult = await executeTool(toolName, toolArgs);
            const response = {
                jsonrpc: '2.0',
                id,
                result: toolResult,
            };
            process.stdout.write(JSON.stringify(response) + '\n');
        } catch (err) {
            const response = {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: err.message,
                },
            };
            process.stdout.write(JSON.stringify(response) + '\n');
        }
        return;
    }

    // Ping / generic method
    if (method === 'ping') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result: {} }) + '\n');
        return;
    }

    // Default method not found
    if (id !== undefined) {
        process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method '${method}' not found` },
        }) + '\n');
    }
});
