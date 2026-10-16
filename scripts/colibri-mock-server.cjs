#!/usr/bin/env node
/**
 * Colibrì DEV MOCK server. Not Colibrì: canned answers for developing and testing the app without the real engine.
 *
 * It follows the contract of the real server (colibri v2, `coli web` / `coli serve`), measured on the owner's PC:
 *   - OpenAI API on http://127.0.0.1:8000, text only
 *   - GET /health            -> { status, arch, scheduler{...}, input_modalities: ["text"], ... }
 *   - GET /v1/models         -> ONE model, input_modalities ["text"]
 *   - POST /v1/chat/completions (JSON or SSE). A model id other than the served one fails 404 model_not_found
 *     (so 'auto' is rejected here exactly as the real server rejects it)
 *   - NO /v1/embeddings (the real server has none): 404
 *   - NO invented telemetry: /health reports counters the mock really keeps, nothing else
 *
 * Safe by default: binds 127.0.0.1, answers CORS only for an explicit origin list (never "*").
 *
 * Usage:  node scripts/colibri-mock-server.cjs [--port 8000] [--model-id qwen3.6-colibri] [--delay-ms 20]
 *                                              [--allow-origin https://example.org]
 */
'use strict';

const http = require('http');

const args = process.argv.slice(2);
let port = 8000;
let modelId = 'qwen3.6-colibri';
let delayMs = 20;
const allowedOrigins = new Set([
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://localhost:1001',
    'http://localhost:1001',
    'https://192.0.2.71:1001',
    'http://192.0.2.71:1001',
    'https://jouhayerk-cloud.github.io',
]);

for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if ((args[i] === '--port' || args[i] === '-p') && next) { port = parseInt(next, 10) || port; i++; }
    else if (args[i] === '--model-id' && next) { modelId = next; i++; }
    else if (args[i] === '--delay-ms' && next) { delayMs = Math.max(0, parseInt(next, 10) || 0); i++; }
    else if (args[i] === '--allow-origin' && next) { allowedOrigins.add(next.replace(/\/+$/, '')); i++; }
}
if (process.env.COLIBRI_PORT) port = parseInt(process.env.COLIBRI_PORT, 10) || port;

const counters = { admitted: 0, completed: 0, failed: 0, active: 0 };

function corsHeaders(origin) {
    return origin && allowedOrigins.has(origin)
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Private-Network': 'true',
            'Vary': 'Origin',
        }
        : { 'Vary': 'Origin' };
}

function sendJson(res, status, body, cors) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...cors });
    res.end(JSON.stringify(body));
}

const apiError = (message, code, type) => ({ error: { message, type: type || 'invalid_request_error', code } });

function readBody(req, limit, cb) {
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
        body += chunk;
        if (body.length > limit) { tooLarge = true; req.destroy(); }
    });
    req.on('end', () => cb(tooLarge ? null : body));
}

const server = http.createServer((req, res) => {
    const cors = corsHeaders(req.headers.origin);
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
        return sendJson(res, 403, apiError('Origin not allowed', 'forbidden_origin'), cors);
    }
    if (req.method === 'OPTIONS') {
        res.writeHead(204, cors);
        res.end();
        return;
    }

    const pathname = new URL(req.url, 'http://mock.invalid').pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && pathname === '/health') {
        return sendJson(res, 200, {
            status: 'ok',
            mock: true,
            arch: 'mock',
            scheduler: { active: counters.active, queued: 0, capacity: 1, admitted: counters.admitted, completed: counters.completed, failed: counters.failed },
            input_modalities: ['text'],
            capabilities: ['chat'],
        }, cors);
    }

    if (req.method === 'GET' && pathname === '/v1/models') {
        return sendJson(res, 200, {
            object: 'list',
            data: [{ id: modelId, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'colibri-mock', input_modalities: ['text'], capabilities: ['chat'] }],
        }, cors);
    }

    if (req.method === 'POST' && pathname === '/v1/chat/completions') {
        readBody(req, 4 * 1024 * 1024, (body) => {
            if (body === null) return sendJson(res, 413, apiError('Request too large', 'request_too_large'), cors);
            let parsed;
            try { parsed = JSON.parse(body || '{}'); }
            catch (err) { return sendJson(res, 400, apiError('Invalid JSON body: ' + err.message, 'invalid_json'), cors); }

            // the real server serves one model and rejects every other id (404 model_not_found)
            if (parsed.model !== modelId) {
                counters.failed++;
                return sendJson(res, 404, apiError(`The model \`${parsed.model}\` does not exist`, 'model_not_found'), cors);
            }

            const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
            const last = messages[messages.length - 1] || { content: '' };
            const lastPrompt = typeof last.content === 'string' ? last.content : JSON.stringify(last.content || '');
            const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
            const hasTool = (name) => tools.some(t => (t.function && t.function.name) === name || t.name === name);

            let toolCall = null;
            const open = /open\s+(?:item\s+)?([A-Z0-9_-]+)/i.exec(lastPrompt);
            if (open && hasTool('open_item')) {
                toolCall = { id: 'call_' + Math.random().toString(36).slice(2, 9), type: 'function', function: { name: 'open_item', arguments: JSON.stringify({ item_id: open[1] }) } };
            }
            const responseText = toolCall
                ? '[mock] Opening the item.'
                : `[mock] No real model is running. You said: "${lastPrompt.slice(0, 80).replace(/\n/g, ' ')}"`;

            counters.admitted++;
            counters.active++;
            const done = () => { counters.active--; counters.completed++; };
            const id = 'chatcmpl-mock-' + Math.random().toString(36).slice(2, 10);
            const created = Math.floor(Date.now() / 1000);

            if (parsed.stream) {
                res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', ...cors });
                const chunk = (delta, finish) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: modelId, choices: [{ index: 0, delta, finish_reason: finish || null }] })}\n\n`);
                chunk({ role: 'assistant' });
                if (toolCall) chunk({ tool_calls: [{ index: 0, id: toolCall.id, type: 'function', function: toolCall.function }] });
                const words = responseText.split(' ');
                let i = 0;
                const timer = setInterval(() => {
                    if (i < words.length) {
                        chunk({ content: (i === 0 ? '' : ' ') + words[i++] });
                    } else {
                        clearInterval(timer);
                        chunk({}, toolCall ? 'tool_calls' : 'stop');
                        res.write('data: [DONE]\n\n');
                        res.end();
                        done();
                    }
                }, delayMs);
                // a client that goes away (Stop pressed) ends the generation
                res.on('close', () => { if (!res.writableEnded) { clearInterval(timer); counters.active--; counters.failed++; } });
                return;
            }

            done();
            sendJson(res, 200, {
                id, object: 'chat.completion', created, model: modelId,
                choices: [{ index: 0, message: { role: 'assistant', content: responseText, ...(toolCall ? { tool_calls: [toolCall] } : {}) }, finish_reason: toolCall ? 'tool_calls' : 'stop' }],
                usage: { prompt_tokens: Math.max(1, Math.round(lastPrompt.length / 4)), completion_tokens: Math.max(1, Math.round(responseText.length / 4)), total_tokens: Math.max(2, Math.round((lastPrompt.length + responseText.length) / 4)) },
            }, cors);
        });
        return;
    }

    // everything else, /v1/embeddings included: the real server has no such route
    sendJson(res, 404, apiError(`Endpoint ${req.method} ${pathname} not found on the Colibrì mock server`, 'not_found'), cors);
});

server.listen(port, '127.0.0.1', () => {
    console.log(`[colibri-mock] MOCK server (not Colibrì) on http://127.0.0.1:${port}, model id "${modelId}", text only`);
    console.log('[colibri-mock] Routes: GET /health, GET /v1/models, POST /v1/chat/completions. No embeddings. Loopback only.');
});
