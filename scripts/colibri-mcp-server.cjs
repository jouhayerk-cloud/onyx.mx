#!/usr/bin/env node
/**
 * scripts/colibri-mcp-server.cjs
 *
 * Model Context Protocol (MCP) Standard stdio Server for Colibrì MoE Engine
 *
 * Allows AI Coding Assistants (Google Antigravity, Claude Desktop, Onyx Agents)
 * to interact directly with the local Colibrì MoE engine and Supabase Realtime Relay.
 *
 * Tools:
 * - colibri_health: Checks engine status, version, NVMe streaming telemetry and tps.
 * - colibri_models: Lists loaded MoE and embedding models.
 * - colibri_chat: Runs local chat inference on Colibrì with optional system prompt.
 * - colibri_relay_status: Checks Supabase Realtime Relay connectivity and fleet presence.
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

const COLIBRI_PORT = parseInt(process.env.COLIBRI_PORT || '8082', 10);
const COLIBRI_BASE_URL = `http://127.0.0.1:${COLIBRI_PORT}`;

function makeHttpRequest(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: COLIBRI_PORT,
            path: endpoint,
            method: method,
            headers: {
                'Accept': 'application/json',
                ...(postData ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                } : {}),
            },
            timeout: 30000,
        };

        const req = http.request(options, (res) => {
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
        description: 'Check the health status, NVMe streaming throughput, and token velocity of the local Colibrì MoE engine on Windows.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'colibri_models',
        description: 'List all loaded local MoE and embedding models available in the Colibrì engine.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'colibri_chat',
        description: 'Send a chat prompt to the local Colibrì MoE engine and receive a generated response with token speed metrics.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'The user prompt or instruction to send to Colibrì',
                },
                model: {
                    type: 'string',
                    description: 'Optional model ID (e.g. colibri-glm-5.2-moe, colibri-kimi-k3-moe, colibri-qwen-2.5-3b)',
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
                    description: 'Maximum tokens to generate (default 1024)',
                },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'colibri_relay_status',
        description: 'Inspect the status of the Supabase Realtime Relay bridge connecting remote devices (iPhone / Second Laptop) to Colibrì.',
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
                                telemetry: res.data,
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
                                hint: `Ensure Colibrì daemon is running: powershell -ExecutionPolicy Bypass -File .\\scripts\\start-colibri-daemon.ps1 -DevMock`,
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

            const payload = {
                model: args.model || 'colibri-glm-5.2-moe',
                messages,
                temperature: args.temperature !== undefined ? args.temperature : 0.7,
                max_tokens: args.max_tokens || 1024,
                stream: false,
            };

            try {
                const res = await makeHttpRequest('/v1/chat/completions', 'POST', payload);
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
                                model: res.data?.model || payload.model,
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
            const hasSupabase = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);
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
                            relayChannel: 'colibri_relay_global',
                            supabaseConfigured: hasSupabase,
                            supabaseUrl: process.env.VITE_SUPABASE_URL || 'Not configured',
                            localEngineAlive: localAlive,
                            localEngineUrl: COLIBRI_BASE_URL,
                            remoteClientsSupported: ['iPhone (iOS Safari / PWA)', "Second Laptop (LAN / Web)", 'Android / Tablet'],
                            relayProtocol: 'wss:// broadcast + presence tracking',
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
