#!/usr/bin/env node
/**
 * Colibri Local MoE Inference Engine Dev Mock Server
 * Simulates JustVugg/colibri on Windows for development and automated testing.
 * 
 * Endpoints:
 * - GET  /health & /status       Health check & telemetry
 * - GET  /v1/models              Available local MoE and embedding models
 * - POST /v1/chat/completions    OpenAI format completions + SSE token streaming
 * - POST /v1/embeddings          768-dimensional float32 vector embeddings
 */

const http = require('http');
const url = require('url');

// Parse CLI arguments: --port <num>, --model-dir <path>
const args = process.argv.slice(2);
let port = 8082;
let modelDir = 'C:\\colibri\\models';

for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
        port = parseInt(args[i + 1], 10) || 8082;
        i++;
    } else if ((args[i] === '--model-dir' || args[i] === '-m' || args[i] === '--nvme-path') && args[i + 1]) {
        modelDir = args[i + 1];
        i++;
    }
}

// Allow environment variable overrides
if (process.env.COLIBRI_PORT) {
    port = parseInt(process.env.COLIBRI_PORT, 10) || port;
}

const MODELS = [
    {
        id: 'colibri-glm-5.2-moe',
        object: 'model',
        created: 1729000000,
        owned_by: 'colibri-local',
        permission: [],
        root: 'colibri-glm-5.2-moe',
        parent: null
    },
    {
        id: 'colibri-kimi-k3-moe',
        object: 'model',
        created: 1729000000,
        owned_by: 'colibri-local',
        permission: [],
        root: 'colibri-kimi-k3-moe',
        parent: null
    },
    {
        id: 'colibri-qwen-2.5-3b',
        object: 'model',
        created: 1729000000,
        owned_by: 'colibri-local',
        permission: [],
        root: 'colibri-qwen-2.5-3b',
        parent: null
    },
    {
        id: 'colibri-embed-v1',
        object: 'model',
        created: 1729000000,
        owned_by: 'colibri-local',
        permission: [],
        root: 'colibri-embed-v1',
        parent: null
    }
];

/**
 * Generates a deterministic 768-dimensional normalized float vector for a given string
 */
function generate768DimVector(text) {
    const dim = 768;
    const vec = new Float32Array(dim);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    let normSq = 0;
    for (let i = 0; i < dim; i++) {
        const val = Math.sin((hash + i * 37) * 0.001) * Math.cos((i + 17) * 0.013);
        vec[i] = val;
        normSq += val * val;
    }

    const norm = Math.sqrt(normSq) || 1.0;
    const result = new Array(dim);
    for (let i = 0; i < dim; i++) {
        result[i] = Number((vec[i] / norm).toFixed(6));
    }
    return result;
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
}

const server = http.createServer((req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

    // 1. Health & Status
    if ((pathname === '/health' || pathname === '/status' || pathname === '/') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            status: 'ok',
            engine: 'colibri-mock',
            version: '1.2.0-win32-moe',
            port: port,
            nvmePath: modelDir,
            telemetry: {
                nvmeReadMBps: 2740.8,
                cacheHitRate: 0.894,
                tokensPerSecond: 26.5,
                activeExperts: 4,
                pinnedExperts: 128
            },
            modelsAvailable: MODELS.map(m => m.id),
            timestamp: new Date().toISOString()
        }, null, 2));
        return;
    }

    // 2. Models list
    if (pathname === '/v1/models' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            object: 'list',
            data: MODELS
        }, null, 2));
        return;
    }

    // 3. Chat Completions
    if (pathname === '/v1/chat/completions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            let parsed = {};
            try {
                parsed = JSON.parse(body || '{}');
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Invalid JSON body: ' + err.message } }));
                return;
            }

            const model = parsed.model || 'colibri-glm-5.2-moe';
            const messages = parsed.messages || [];
            const lastMsg = messages[messages.length - 1] || { content: '' };
            // 1. Gather all conversation text across all messages for full context
            let fullConversation = '';
            for (const msg of messages) {
                const c = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
                fullConversation += c + '\n';
            }
            const lastPrompt = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content || '');
            const isStream = Boolean(parsed.stream);
            const reqId = 'chatcmpl-colibri-' + Math.random().toString(36).substring(2, 10);
            const created = Math.floor(Date.now() / 1000);

            // 2. Extract any inventory context items from the conversation
            // Matches format: • [ID] Description Qty: N $Price
            const itemRegex = /•\s*\[([A-Z0-9_\-]+)\]\s+([^$\n]+?)(?:\s*Qty:\s*(\d+))?\s*\$([0-9,.]+)/gi;
            const parsedItems = [];
            let match;
            while ((match = itemRegex.exec(fullConversation)) !== null) {
                const id = match[1];
                const desc = match[2].trim();
                const qty = parseInt(match[3] || '1', 10);
                const price = parseFloat(match[4].replace(/,/g, ''));
                if (!parsedItems.some(i => i.id === id)) {
                    parsedItems.push({ id, desc, qty, price });
                }
            }

            // 3. Determine tool calls if requested
            const tools = parsed.tools || [];
            let toolCallToEmit = null;

            const wantsCutfile = /cutfile|crate|laser|box|stencil|pack/i.test(lastPrompt) && 
                tools.some(t => (t.function?.name === 'generate_crate_cutfile' || t.name === 'generate_crate_cutfile'));
            
            const wantsOpenItem = /open\s+(?:item\s+)?([A-Z0-9_\-]+)/i.test(lastPrompt) &&
                tools.some(t => (t.function?.name === 'open_item' || t.name === 'open_item'));
            
            const wantsSearch = /(?:search|find|lookup)\s+(?:in\s+app\s+)?(?:for\s+)?([a-zA-Z0-9_\- ]+)/i.test(lastPrompt) &&
                tools.some(t => (t.function?.name === 'search_in_app' || t.name === 'search_in_app'));

            if (wantsCutfile) {
                toolCallToEmit = {
                    id: 'call_' + Math.random().toString(36).substring(2, 9),
                    type: 'function',
                    function: {
                        name: 'generate_crate_cutfile',
                        arguments: JSON.stringify({
                            crate_id: 'CRATE-BLUE-BOWLS-01',
                            material_thickness_mm: 6,
                            burn_mm: 0.1,
                            output_format: 'svg'
                        })
                    }
                };
            } else if (wantsOpenItem) {
                const itemMatch = lastPrompt.match(/open\s+(?:item\s+)?([A-Z0-9_\-]+)/i);
                const targetId = itemMatch ? itemMatch[1] : (parsedItems[0]?.id || 'EM-003');
                toolCallToEmit = {
                    id: 'call_' + Math.random().toString(36).substring(2, 9),
                    type: 'function',
                    function: {
                        name: 'open_item',
                        arguments: JSON.stringify({ item_id: targetId })
                    }
                };
            } else if (wantsSearch) {
                const searchMatch = lastPrompt.match(/(?:search|find|lookup)\s+(?:in\s+app\s+)?(?:for\s+)?([a-zA-Z0-9_\- ]+)/i);
                const queryText = searchMatch ? searchMatch[1].trim() : 'blue onyx';
                toolCallToEmit = {
                    id: 'call_' + Math.random().toString(36).substring(2, 9),
                    type: 'function',
                    function: {
                        name: 'search_in_app',
                        arguments: JSON.stringify({ text: queryText })
                    }
                };
            }

            // 4. Generate intelligent contextual response
            let responseText = '';
            if (toolCallToEmit) {
                if (toolCallToEmit.function.name === 'generate_crate_cutfile') {
                    responseText = `I'll generate the parametric laser-cut crate stencil and divider cutfile for these blue bowls using Boxes.py.`;
                } else if (toolCallToEmit.function.name === 'open_item') {
                    responseText = `Opening item details in the Onyx workspace.`;
                } else {
                    responseText = `Executing ${toolCallToEmit.function.name} locally via Colibri MoE on Windows.`;
                }
            } else if (parsedItems.length > 0 && /how much|price|cost|worth|total|value|expensive|cheap|bowl|blue/i.test(lastPrompt)) {
                // Calculate pricing analytics from parsed items
                const totalVal = parsedItems.reduce((acc, i) => acc + (i.price * i.qty), 0);
                const totalQty = parsedItems.reduce((acc, i) => acc + i.qty, 0);
                const avgPrice = totalVal / (totalQty || 1);
                const sortedByPrice = [...parsedItems].sort((a, b) => a.price - b.price);
                const minItem = sortedByPrice[0];
                const maxItem = sortedByPrice[sortedByPrice.length - 1];

                const itemsListStr = parsedItems.map(i => 
                    `• **[${i.id}]** ${i.desc.replace(/\[|\]/g, '')} (Qty: ${i.qty}) — **$${i.price.toLocaleString('en-US')}**`
                ).join('\n');

                responseText = `Based on the ${parsedItems.length} matching blue onyx items in your active inventory, here is the price breakdown:\n\n${itemsListStr}\n\n📊 **Price & Valuation Summary**:\n- **Total Value**: **$${totalVal.toLocaleString('en-US')}** (${totalQty} piece${totalQty > 1 ? 's' : ''})\n- **Average Price**: **$${avgPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** per bowl\n- **Lowest Price**: **[${minItem.id}]** at **$${minItem.price.toLocaleString('en-US')}**\n- **Highest Price**: **[${maxItem.id}]** at **$${maxItem.price.toLocaleString('en-US')}**\n\nWould you like me to generate a laser-cut crate stencil to pack these bowls, or open one of the items?`;
            } else if (/cutfile|laser|crate|box|stencil|pack/i.test(lastPrompt)) {
                responseText = `I can generate parametric laser-cut crate stencils and finger-joint dividers for your inventory items directly on your Windows desktop. Just ask me to "generate crate cutfile" or specify crate dimensions (e.g. 60x40x35 cm).`;
            } else if (/who are you|colibri|moe|model/i.test(lastPrompt)) {
                responseText = `I am **Colibrì Local MoE** (${model}), running locally on your Windows machine via direct NVMe sparse expert streaming. I operate completely private, offline, with zero cloud latency.`;
            } else {
                responseText = `[Colibrì MoE (${model})]: I've analyzed your prompt ("${lastPrompt.slice(0, 80).replace(/\n/g, ' ')}..."). How would you like to proceed with your inventory or logistics?`;
            }

            if (isStream) {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive'
                });

                // First chunk: role
                res.write(`data: ${JSON.stringify({
                    id: reqId,
                    object: 'chat.completion.chunk',
                    created: created,
                    model: model,
                    choices: [{
                        index: 0,
                        delta: { role: 'assistant' },
                        finish_reason: null
                    }]
                })}\n\n`);

                // If tool call, emit it in chunk
                if (toolCallToEmit) {
                    res.write(`data: ${JSON.stringify({
                        id: reqId,
                        object: 'chat.completion.chunk',
                        created: created,
                        model: model,
                        choices: [{
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: toolCallToEmit.id,
                                        type: 'function',
                                        function: {
                                            name: toolCallToEmit.function.name,
                                            arguments: toolCallToEmit.function.arguments
                                        }
                                    }
                                ]
                            },
                            finish_reason: null
                        }]
                    })}\n\n`);
                }

                // Split response text into token words
                const words = responseText.split(' ');
                let wordIdx = 0;

                const timer = setInterval(() => {
                    if (wordIdx < words.length) {
                        const word = (wordIdx === 0 ? '' : ' ') + words[wordIdx];
                        res.write(`data: ${JSON.stringify({
                            id: reqId,
                            object: 'chat.completion.chunk',
                            created: created,
                            model: model,
                            choices: [{
                                index: 0,
                                delta: { content: word },
                                finish_reason: null
                            }]
                        })}\n\n`);
                        wordIdx++;
                    } else {
                        clearInterval(timer);
                        // Final stop chunk
                        res.write(`data: ${JSON.stringify({
                            id: reqId,
                            object: 'chat.completion.chunk',
                            created: created,
                            model: model,
                            choices: [{
                                index: 0,
                                delta: {},
                                finish_reason: toolCallToEmit ? 'tool_calls' : 'stop'
                            }]
                        })}\n\n`);
                        res.write('data: [DONE]\n\n');
                        res.end();
                    }
                }, 20); // 20ms token cadence (~50 tokens/sec simulated)
            } else {
                // Non-streaming response
                const messageObj = {
                    role: 'assistant',
                    content: responseText
                };
                if (toolCallToEmit) {
                    messageObj.tool_calls = [toolCallToEmit];
                }

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    id: reqId,
                    object: 'chat.completion',
                    created: created,
                    model: model,
                    choices: [
                        {
                            index: 0,
                            message: messageObj,
                            finish_reason: toolCallToEmit ? 'tool_calls' : 'stop'
                        }
                    ],
                    usage: {
                        prompt_tokens: Math.max(1, Math.round(lastPrompt.length / 4)),
                        completion_tokens: Math.max(1, Math.round(responseText.length / 4)),
                        total_tokens: Math.max(2, Math.round((lastPrompt.length + responseText.length) / 4))
                    }
                }, null, 2));
            }
        });
        return;
    }

    // 4. Embeddings (768 dimensions)
    if (pathname === '/v1/embeddings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            let parsed = {};
            try {
                parsed = JSON.parse(body || '{}');
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Invalid JSON body: ' + err.message } }));
                return;
            }

            const inputRaw = parsed.input;
            const inputs = Array.isArray(inputRaw) ? inputRaw : [String(inputRaw || '')];
            const model = parsed.model || 'colibri-embed-v1';

            const data = inputs.map((item, idx) => ({
                object: 'embedding',
                index: idx,
                embedding: generate768DimVector(typeof item === 'string' ? item : JSON.stringify(item))
            }));

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                object: 'list',
                data: data,
                model: model,
                usage: {
                    prompt_tokens: inputs.reduce((acc, str) => acc + Math.round(String(str).length / 4), 0),
                    total_tokens: inputs.reduce((acc, str) => acc + Math.round(String(str).length / 4), 0)
                }
            }, null, 2));
        });
        return;
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
        error: {
            message: `Endpoint ${req.method} ${pathname} not found on Colibri mock server.`,
            type: 'invalid_request_error',
            code: 404
        }
    }));
});

server.listen(port, '0.0.0.0', () => {
    console.log(`[colibri-mock] Listening on http://127.0.0.1:${port} (and 0.0.0.0:${port})`);
    console.log(`[colibri-mock] NVMe model directory: ${modelDir}`);
    console.log(`[colibri-mock] Ready for /health, /v1/models, /v1/chat/completions, and /v1/embeddings (768-dim)`);
});
