// Checks for the AI provider registry (Gemini, Anthropic, OpenAI, Compat, Companion, Colibri).
// Run: node scripts/check-ai-providers.cjs
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');

const root = path.join(__dirname, '..');
const esbuildBin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');
const entryPath = path.join(os.tmpdir(), 'check-ai-providers-entry.ts');
fs.mkdirSync(path.join(root, 'node_modules', '.cache'), { recursive: true });
const outPath = path.join(root, 'node_modules', '.cache', 'aiProviders.check.cjs');

fs.writeFileSync(entryPath, `
export * from '${path.join(root, 'src/lib/ai/providers/index.ts').replace(/\\/g, '/')}';
export * from '${path.join(root, 'src/lib/ai/providers/types.ts').replace(/\\/g, '/')}';
export * from '${path.join(root, 'src/lib/ai/providers/anthropic.ts').replace(/\\/g, '/')}';
export * from '${path.join(root, 'src/lib/ai/providers/openai.ts').replace(/\\/g, '/')}';
export * from '${path.join(root, 'src/lib/ai/providers/compat.ts').replace(/\\/g, '/')}';
export { providerAllowedForJob, TEXT_ONLY_PROVIDERS, IMAGE_JOBS } from '${path.join(root, 'src/lib/ai/routing.ts').replace(/\\/g, '/')}';
`);

execFileSync(process.execPath, [
    esbuildBin,
    entryPath,
    '--bundle',
    '--format=cjs',
    '--platform=node',
    '--packages=external',
    '--define:import.meta.env={"VITE_SUPABASE_URL":"https://check.invalid","VITE_SUPABASE_ANON_KEY":"check","MODE":"test","DEV":false}',
    '--outfile=' + outPath,
    '--log-level=error',
], { cwd: root, stdio: 'inherit' });

// Browser global stubs
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener: () => {} };

// Recorder for fetch
let recordedCalls = [];
let responseHandler = null;

globalThis.fetch = async function (url, options = {}) {
    let parsedBody = null;
    if (typeof options.body === 'string') {
        try {
            parsedBody = JSON.parse(options.body);
        } catch {
            parsedBody = options.body;
        }
    }
    const callRecord = {
        url: String(url),
        method: (options.method || 'GET').toUpperCase(),
        headers: options.headers || {},
        body: parsedBody,
        rawBody: options.body,
        signal: options.signal,
    };
    recordedCalls.push(callRecord);

    if (typeof responseHandler === 'function') {
        return responseHandler(callRecord);
    }
    throw new Error('No responseHandler configured for fetch');
};

const {
    PROVIDERS,
    PROVIDER_INFOS,
    getProvider,
    AiProviderError,
    anthropicProvider,
    openaiProvider,
    compatProvider,
    providerAllowedForJob,
} = require(outPath);

function makeCannedResponse(status, bodyObj, headers = {}) {
    const textBody = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (name) => headers[name.toLowerCase()] || null,
        },
        text: async () => textBody,
        json: async () => (typeof bodyObj === 'string' ? JSON.parse(bodyObj) : bodyObj),
    };
}

async function runTests() {
    // ── Registry and Provider Infos ──
    assert.strictEqual(getProvider('gemini'), undefined, 'getProvider("gemini") must return undefined');
    assert.strictEqual(getProvider('anthropic'), anthropicProvider, 'getProvider("anthropic") matches anthropicProvider');
    assert.strictEqual(getProvider('openai'), openaiProvider, 'getProvider("openai") matches openaiProvider');
    assert.strictEqual(getProvider('compat'), compatProvider, 'getProvider("compat") matches compatProvider');

    assert.deepStrictEqual(
        PROVIDER_INFOS.map(p => p.id),
        ['gemini', 'anthropic', 'openai', 'compat', 'companion', 'colibri'],
        'PROVIDER_INFOS must list all six providers, in this order',
    );
    const geminiInfo = PROVIDER_INFOS.find(p => p.id === 'gemini');
    assert.ok(geminiInfo, 'Gemini info must be in PROVIDER_INFOS');
    assert.strictEqual(geminiInfo.label, 'Google Gemini');
    assert.strictEqual(geminiInfo.docsUrl, 'https://ai.google.dev');
    assert.deepStrictEqual(geminiInfo.capabilities, { vision: true, json: true, image: true, video: true });

    const antInfo = PROVIDER_INFOS.find(p => p.id === 'anthropic');
    assert.strictEqual(antInfo.label, 'Anthropic Claude');
    assert.strictEqual(antInfo.keyHint, 'sk-ant-...');
    assert.deepStrictEqual(antInfo.capabilities, { vision: true, json: true, image: false, video: false });
    assert.strictEqual(antInfo.docsUrl, 'https://docs.anthropic.com');

    const oaiInfo = PROVIDER_INFOS.find(p => p.id === 'openai');
    assert.strictEqual(oaiInfo.label, 'OpenAI');
    assert.strictEqual(oaiInfo.keyHint, 'sk-...');
    assert.strictEqual(oaiInfo.capabilities.vision, true);
    assert.strictEqual(oaiInfo.capabilities.json, true);

    const compatInfo = PROVIDER_INFOS.find(p => p.id === 'compat');
    assert.strictEqual(compatInfo.label, 'OpenAI-compatible (custom URL)');
    assert.strictEqual(compatInfo.needsBaseUrl, true);
    assert.strictEqual(compatInfo.keyHint, 'key, or empty for a local server');

    // Companion (on-device iOS) and Colibri (local Windows server) are registry entries too
    assert.strictEqual(getProvider('companion'), PROVIDERS.companion, 'getProvider("companion") matches the registry');
    assert.strictEqual(getProvider('colibri'), PROVIDERS.colibri, 'getProvider("colibri") matches the registry');
    const colibriInfo = PROVIDER_INFOS.find(p => p.id === 'colibri');
    assert.strictEqual(colibriInfo.defaultBaseUrl, 'http://127.0.0.1:8000', 'Colibri defaults to the real server port');
    assert.strictEqual(colibriInfo.needsBaseUrl, false);
    assert.strictEqual(colibriInfo.capabilities.vision, false, 'Colibri is text only');
    assert.strictEqual(typeof PROVIDERS.colibri.chat, 'function', 'Colibri can run the agent chat');

    // A text-only provider is never usable for the picture job (segmentation), but is for text jobs
    assert.strictEqual(providerAllowedForJob('colibri', 'segmentation'), false);
    assert.strictEqual(providerAllowedForJob('colibri', 'chat'), true);
    assert.strictEqual(providerAllowedForJob('colibri', 'translate'), true);
    assert.strictEqual(providerAllowedForJob('anthropic', 'segmentation'), true);

    // ── ANTHROPIC ──
    const antKey = 'sk-ant-testkey123456';
    const antModel = 'claude-3-5-sonnet-20241022';

    // 1. Anthropic generateText: URL, method, headers, body shape, canned success
    responseHandler = () => makeCannedResponse(200, {
        id: 'msg_01',
        model: antModel,
        content: [{ type: 'text', text: 'Anthropic text answer' }],
        usage: { input_tokens: 12, output_tokens: 24 },
    });
    recordedCalls = [];
    const antTextRes = await anthropicProvider.generateText(
        { key: antKey, model: antModel },
        {
            prompt: 'Explain Mexican onyx',
            system: 'You are an onyx expert',
            images: [{ mimeType: 'image/jpeg', base64: 'ANT_IMG_BASE64' }],
            timeoutMs: 5000,
        }
    );
    assert.strictEqual(recordedCalls.length, 1);
    const antCall = recordedCalls[0];
    assert.strictEqual(antCall.url, 'https://api.anthropic.com/v1/messages', 'Anthropic URL must match');
    assert.strictEqual(antCall.method, 'POST', 'Anthropic method must be POST');
    assert.strictEqual(antCall.headers['x-api-key'], antKey, 'x-api-key header must match');
    assert.strictEqual(antCall.headers['anthropic-version'], '2023-06-01', 'anthropic-version header must match');
    assert.strictEqual(antCall.headers['anthropic-dangerous-direct-browser-access'], 'true', 'direct browser access header must be true');

    // Body shape: image parts first, then text part
    assert.strictEqual(antCall.body.model, antModel);
    assert.strictEqual(antCall.body.system, 'You are an onyx expert');
    assert.strictEqual(antCall.body.messages[0].content[0].type, 'image', 'Image part must precede text part in Anthropic body');
    assert.strictEqual(antCall.body.messages[0].content[0].source.data, 'ANT_IMG_BASE64');
    assert.strictEqual(antCall.body.messages[0].content[0].source.media_type, 'image/jpeg');
    assert.strictEqual(antCall.body.messages[0].content[1].type, 'text');
    assert.strictEqual(antCall.body.messages[0].content[1].text, 'Explain Mexican onyx');

    // Canned success parsing
    assert.strictEqual(antTextRes.text, 'Anthropic text answer');
    assert.strictEqual(antTextRes.model, antModel);
    assert.strictEqual(antTextRes.usage.inputTokens, 12);
    assert.strictEqual(antTextRes.usage.outputTokens, 24);

    // 2. Anthropic generateJson: tool_choice and parsing tool_use
    responseHandler = () => makeCannedResponse(200, {
        id: 'msg_02',
        model: antModel,
        content: [
            {
                type: 'tool_use',
                id: 'toolu_01',
                name: 'return_json',
                input: { title: 'Mexican Onyx Bowl', dominantColors: ['White', 'Amber'] },
            },
        ],
    });
    recordedCalls = [];
    const antJsonRes = await anthropicProvider.generateJson(
        { key: antKey, model: antModel },
        {
            prompt: 'Return item JSON',
            schema: { type: 'object', properties: { title: { type: 'string' } } },
            timeoutMs: 5000,
        }
    );
    assert.strictEqual(recordedCalls.length, 1);
    const antJsonCall = recordedCalls[0];
    assert.deepStrictEqual(antJsonCall.body.tool_choice, { type: 'tool', name: 'return_json' }, 'tool_choice must force return_json');
    assert.strictEqual(antJsonCall.body.tools[0].name, 'return_json');
    assert.strictEqual(antJsonRes.json.title, 'Mexican Onyx Bowl');
    assert.strictEqual(JSON.parse(antJsonRes.text).title, 'Mexican Onyx Bowl');

    // 3. Anthropic Errors: 401, 429, 500, thrown fetch, and key is never leaked
    const testAntError = async (handler, expectedKind) => {
        responseHandler = handler;
        let caught = null;
        try {
            await anthropicProvider.generateText({ key: antKey, model: antModel }, { prompt: 'fail', timeoutMs: 5000 });
        } catch (err) {
            caught = err;
        }
        assert.ok(caught instanceof AiProviderError, 'Must throw AiProviderError');
        assert.strictEqual(caught.kind, expectedKind, `Expected kind ${expectedKind}, got ${caught?.kind}`);
        assert.ok(!caught.message.includes(antKey), `Error message must never contain the key: "${caught.message}"`);
    };

    await testAntError(() => makeCannedResponse(401, { error: { message: `Unauthorized with ${antKey}` } }), 'auth');
    await testAntError(() => makeCannedResponse(403, { error: { message: `Forbidden for ${antKey}` } }), 'auth');
    await testAntError(() => makeCannedResponse(429, { error: { message: `Rate limit on ${antKey}` } }), 'rate');
    await testAntError(() => makeCannedResponse(500, { error: { message: `Server error for ${antKey}` } }), 'server');
    await testAntError(() => { throw new TypeError('Failed to fetch (CORS block)'); }, 'cors');

    // 400 bad_request includes API message, never key
    responseHandler = () => makeCannedResponse(400, { error: { message: `Invalid parameter for key ${antKey}` } });
    let ant400 = null;
    try {
        await anthropicProvider.generateText({ key: antKey, model: antModel }, { prompt: 'fail', timeoutMs: 5000 });
    } catch (err) {
        ant400 = err;
    }
    assert.ok(ant400 instanceof AiProviderError);
    assert.strictEqual(ant400.kind, 'bad_request');
    assert.ok(ant400.message.includes('Invalid parameter'), 'bad_request must include API message');
    assert.ok(!ant400.message.includes(antKey), 'bad_request must not leak key');

    // Empty model throws config error
    let antNoModel = null;
    try {
        await anthropicProvider.generateText({ key: antKey, model: '' }, { prompt: 'hi', timeoutMs: 5000 });
    } catch (err) {
        antNoModel = err;
    }
    assert.ok(antNoModel instanceof AiProviderError);
    assert.strictEqual(antNoModel.kind, 'config');
    assert.strictEqual(antNoModel.message, 'Pick a model in Settings');

    // ── OPENAI ──
    const oaiKey = 'sk-proj-testkey789012';
    const oaiModel = 'gpt-4o';

    // 1. OpenAI generateText: URL, method, headers, body shape, canned success
    responseHandler = () => makeCannedResponse(200, {
        id: 'chatcmpl_01',
        model: oaiModel,
        choices: [{ message: { role: 'assistant', content: 'OpenAI text answer' } }],
        usage: { prompt_tokens: 15, completion_tokens: 30 },
    });
    recordedCalls = [];
    const oaiTextRes = await openaiProvider.generateText(
        { key: oaiKey, model: oaiModel },
        {
            prompt: 'Explain Mexican travertine',
            system: 'You are a stone specialist',
            images: [{ mimeType: 'image/png', base64: 'OAI_IMG_BASE64' }],
            timeoutMs: 5000,
        }
    );
    assert.strictEqual(recordedCalls.length, 1);
    const oaiCall = recordedCalls[0];
    assert.strictEqual(oaiCall.url, 'https://api.openai.com/v1/chat/completions', 'OpenAI URL must match');
    assert.strictEqual(oaiCall.method, 'POST');
    assert.strictEqual(oaiCall.headers['Authorization'], `Bearer ${oaiKey}`, 'Authorization Bearer header must match');

    // Body shape: text first, then image parts
    assert.strictEqual(oaiCall.body.model, oaiModel);
    assert.strictEqual(oaiCall.body.messages[0].role, 'system');
    assert.strictEqual(oaiCall.body.messages[0].content, 'You are a stone specialist');
    assert.strictEqual(oaiCall.body.messages[1].role, 'user');
    assert.strictEqual(oaiCall.body.messages[1].content[0].type, 'text', 'Text part must precede image parts in OpenAI body');
    assert.strictEqual(oaiCall.body.messages[1].content[0].text, 'Explain Mexican travertine');
    assert.strictEqual(oaiCall.body.messages[1].content[1].type, 'image_url');
    assert.strictEqual(oaiCall.body.messages[1].content[1].image_url.url, 'data:image/png;base64,OAI_IMG_BASE64');

    // Canned success parsing
    assert.strictEqual(oaiTextRes.text, 'OpenAI text answer');
    assert.strictEqual(oaiTextRes.model, oaiModel);
    assert.strictEqual(oaiTextRes.usage.inputTokens, 15);
    assert.strictEqual(oaiTextRes.usage.outputTokens, 30);

    // 2. OpenAI generateJson: first try json_schema and parse fenced JSON
    responseHandler = () => makeCannedResponse(200, {
        id: 'chatcmpl_02',
        model: oaiModel,
        choices: [{ message: { role: 'assistant', content: '```json\n{"shape": "cylinder"}\n```' } }],
    });
    recordedCalls = [];
    const oaiJsonRes = await openaiProvider.generateJson(
        { key: oaiKey, model: oaiModel },
        {
            prompt: 'Return stone shape',
            schema: { type: 'object', properties: { shape: { type: 'string' } } },
            timeoutMs: 5000,
        }
    );
    assert.strictEqual(recordedCalls.length, 1);
    assert.strictEqual(recordedCalls[0].body.response_format.type, 'json_schema');
    assert.strictEqual(recordedCalls[0].body.response_format.json_schema.name, 'answer');
    assert.strictEqual(recordedCalls[0].body.response_format.json_schema.strict, false);
    assert.strictEqual(oaiJsonRes.json.shape, 'cylinder', 'Must parse code fence around JSON');

    // 3. OpenAI retry with json_object on canned 400 mentioning response_format / json_schema
    let retryAttempt = 0;
    responseHandler = () => {
        retryAttempt++;
        if (retryAttempt === 1) {
            return makeCannedResponse(400, {
                error: { message: "Invalid parameter: 'response_format.json_schema' is not supported on this endpoint." },
            });
        }
        return makeCannedResponse(200, {
            choices: [{ message: { role: 'assistant', content: '{"retry": "success"}' } }],
        });
    };
    recordedCalls = [];
    const retryRes = await openaiProvider.generateJson(
        { key: oaiKey, model: oaiModel },
        {
            prompt: 'Return object',
            schema: { type: 'object' },
            timeoutMs: 5000,
        }
    );
    assert.strictEqual(recordedCalls.length, 2, 'Must retry on 400 mentioning response_format');
    assert.strictEqual(recordedCalls[0].body.response_format.type, 'json_schema');
    assert.strictEqual(recordedCalls[1].body.response_format.type, 'json_object');
    assert.ok(
        recordedCalls[1].body.messages.find(m => m.role === 'user').content[0].text.includes('Answer with one JSON object matching this JSON schema:'),
        'Retry prompt must append schema instruction'
    );
    assert.strictEqual(retryRes.json.retry, 'success');

    // 4. OpenAI Errors: 401, 429, 500, thrown fetch, and key is never leaked
    const testOaiError = async (handler, expectedKind) => {
        responseHandler = handler;
        let caught = null;
        try {
            await openaiProvider.generateText({ key: oaiKey, model: oaiModel }, { prompt: 'fail', timeoutMs: 5000 });
        } catch (err) {
            caught = err;
        }
        assert.ok(caught instanceof AiProviderError);
        assert.strictEqual(caught.kind, expectedKind);
        assert.ok(!caught.message.includes(oaiKey), `Error message must never contain the key: "${caught.message}"`);
    };

    await testOaiError(() => makeCannedResponse(401, { error: { message: `Unauthorized key ${oaiKey}` } }), 'auth');
    await testOaiError(() => makeCannedResponse(429, { error: { message: `Rate limit on key ${oaiKey}` } }), 'rate');
    await testOaiError(() => makeCannedResponse(500, { error: { message: `Server error on key ${oaiKey}` } }), 'server');
    await testOaiError(() => { throw new TypeError('Failed to fetch (CORS block)'); }, 'cors');

    // ── OPENAI-COMPATIBLE (COMPAT) ──
    // 1. Compat with no key: Authorization header must be omitted, trailing slashes trimmed
    responseHandler = () => makeCannedResponse(200, {
        choices: [{ message: { role: 'assistant', content: 'Local Ollama answer' } }],
    });
    recordedCalls = [];
    const compatRes = await compatProvider.generateText(
        { baseUrl: 'http://localhost:11434/v1///', model: 'llama3:latest' },
        { prompt: 'Compat prompt', timeoutMs: 5000 }
    );
    assert.strictEqual(recordedCalls.length, 1);
    assert.strictEqual(recordedCalls[0].url, 'http://localhost:11434/v1/chat/completions', 'Base URL trailing slashes must be trimmed');
    assert.strictEqual(recordedCalls[0].headers['Authorization'], undefined, 'Authorization header must be omitted when key is empty');
    assert.strictEqual(compatRes.text, 'Local Ollama answer');

    // 2. Compat with no base URL throws config error
    let compatNoBase = null;
    try {
        await compatProvider.generateText({ model: 'llama3' }, { prompt: 'hi', timeoutMs: 5000 });
    } catch (err) {
        compatNoBase = err;
    }
    assert.ok(compatNoBase instanceof AiProviderError);
    assert.strictEqual(compatNoBase.kind, 'config');

    // 3. Compat with key sets Authorization header
    const compatKey = 'compat-secret-key-333';
    recordedCalls = [];
    await compatProvider.generateText(
        { key: compatKey, baseUrl: 'https://api.together.xyz/v1', model: 'mistralai/Mixtral-8x7B' },
        { prompt: 'Together prompt', timeoutMs: 5000 }
    );
    assert.strictEqual(recordedCalls.length, 1);
    assert.strictEqual(recordedCalls[0].headers['Authorization'], `Bearer ${compatKey}`);

    // Compat error tests ensure no key leakage
    responseHandler = () => makeCannedResponse(401, { error: { message: `Unauthorized for key ${compatKey}` } });
    let compat401 = null;
    try {
        await compatProvider.generateText(
            { key: compatKey, baseUrl: 'https://api.together.xyz/v1', model: 'mistralai/Mixtral-8x7B' },
            { prompt: 'fail', timeoutMs: 5000 }
        );
    } catch (err) {
        compat401 = err;
    }
    assert.ok(compat401 instanceof AiProviderError);
    assert.strictEqual(compat401.kind, 'auth');
    assert.ok(!compat401.message.includes(compatKey));

    // ── CHAT (tool-calling turns) ──
    const chatTools = [
        {
            name: 'list_vendors',
            description: 'List vendors',
            parameters: { type: 'object', properties: { limit: { type: 'number' } } },
        },
        { name: 'ping' },
    ];
    const chatTurns = [
        { role: 'user', text: 'List the vendors' },
        { role: 'assistant', text: 'Checking', toolCalls: [{ id: 'call_a', name: 'list_vendors', args: { limit: 3 } }] },
        { role: 'tool', callId: 'call_a', name: 'list_vendors', result: { vendors: ['A', 'B'] } },
        { role: 'user', text: 'Thanks, now count them' },
    ];

    const expectChatError = async (provider, cfg, handler, expectedKind, secret, req) => {
        responseHandler = handler;
        let caught = null;
        try {
            await provider.chat(cfg, req || { turns: [{ role: 'user', text: 'fail' }], timeoutMs: 5000 });
        } catch (err) {
            caught = err;
        }
        assert.ok(caught instanceof AiProviderError, `chat must throw AiProviderError, got ${caught}`);
        assert.strictEqual(caught.kind, expectedKind, `chat: expected kind ${expectedKind}, got ${caught.kind}`);
        if (secret) assert.ok(!caught.message.includes(secret), `chat error message must never contain the key: "${caught.message}"`);
        return caught;
    };

    // Every provider that can drive the agent exposes chat
    assert.strictEqual(typeof anthropicProvider.chat, 'function', 'anthropic must implement chat');
    assert.strictEqual(typeof openaiProvider.chat, 'function', 'openai must implement chat');
    assert.strictEqual(typeof compatProvider.chat, 'function', 'compat must implement chat');

    // ── OPENAI chat ──
    // 1. Request shape for user -> assistant(toolCalls) -> tool -> user
    responseHandler = () => makeCannedResponse(200, {
        model: 'gpt-4o-2024-08-06',
        choices: [{
            message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_xyz', type: 'function', function: { name: 'list_vendors', arguments: '{"limit":5}' } }],
            },
        }],
    });
    recordedCalls = [];
    const oaiChatTool = await openaiProvider.chat(
        { key: oaiKey, model: oaiModel },
        { system: 'You are the Onyx agent', turns: chatTurns, tools: chatTools, temperature: 0.2, maxTokens: 512, timeoutMs: 5000 }
    );
    assert.strictEqual(recordedCalls.length, 1);
    const oaiChat = recordedCalls[0];
    assert.strictEqual(oaiChat.url, 'https://api.openai.com/v1/chat/completions');
    assert.strictEqual(oaiChat.method, 'POST');
    assert.strictEqual(oaiChat.headers['Authorization'], `Bearer ${oaiKey}`);
    assert.strictEqual(oaiChat.body.model, oaiModel);
    assert.strictEqual(oaiChat.body.temperature, 0.2);
    assert.strictEqual(oaiChat.body.max_tokens, 512);
    assert.deepStrictEqual(oaiChat.body.messages, [
        { role: 'system', content: 'You are the Onyx agent' },
        { role: 'user', content: 'List the vendors' },
        {
            role: 'assistant',
            content: 'Checking',
            tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'list_vendors', arguments: '{"limit":3}' } }],
        },
        { role: 'tool', tool_call_id: 'call_a', content: '{"vendors":["A","B"]}' },
        { role: 'user', content: 'Thanks, now count them' },
    ], 'OpenAI chat messages must map user, assistant(tool_calls) and tool turns');

    // 2. Tool schema mapping, defaults for missing parameters
    assert.deepStrictEqual(oaiChat.body.tools[0], {
        type: 'function',
        function: {
            name: 'list_vendors',
            description: 'List vendors',
            parameters: { type: 'object', properties: { limit: { type: 'number' } } },
        },
    });
    assert.strictEqual(oaiChat.body.tools[1].type, 'function');
    assert.strictEqual(oaiChat.body.tools[1].function.name, 'ping');
    assert.deepStrictEqual(oaiChat.body.tools[1].function.parameters, { type: 'object', properties: {} }, 'Missing parameters default to an empty object schema');

    // 3. Canned tool call response parsing
    assert.strictEqual(oaiChatTool.text, '');
    assert.strictEqual(oaiChatTool.model, oaiModel);
    assert.deepStrictEqual(oaiChatTool.toolCalls, [{ id: 'call_xyz', name: 'list_vendors', args: { limit: 5 } }]);

    // 4. Plain-text answer, no tools key when the list is empty, assistant with calls but no text sends null content
    responseHandler = () => makeCannedResponse(200, {
        model: oaiModel,
        choices: [{ message: { role: 'assistant', content: 'There are 2 vendors.' } }],
    });
    recordedCalls = [];
    const oaiChatText = await openaiProvider.chat(
        { key: oaiKey, model: oaiModel },
        {
            turns: [
                { role: 'user', text: 'hi' },
                { role: 'assistant', toolCalls: [{ id: 'call_b', name: 'ping', args: {} }] },
                { role: 'tool', callId: 'call_b', name: 'ping', result: 'pong' },
            ],
            tools: [],
            timeoutMs: 5000,
        }
    );
    assert.strictEqual(oaiChatText.text, 'There are 2 vendors.');
    assert.deepStrictEqual(oaiChatText.toolCalls, []);
    assert.strictEqual('tools' in recordedCalls[0].body, false, 'tools must be omitted when the list is empty');
    assert.strictEqual('temperature' in recordedCalls[0].body, false);
    assert.strictEqual('max_tokens' in recordedCalls[0].body, false);
    assert.strictEqual(recordedCalls[0].body.messages[0].role, 'user', 'No system message when system is absent');
    assert.strictEqual(recordedCalls[0].body.messages[1].content, null, 'Assistant turn with only tool calls sends null content');
    assert.strictEqual(recordedCalls[0].body.messages[2].content, 'pong', 'A string tool result stays as is');

    // An assistant turn without tool calls has no tool_calls key
    recordedCalls = [];
    await openaiProvider.chat(
        { key: oaiKey, model: oaiModel },
        { turns: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }, { role: 'user', text: 'c' }], timeoutMs: 5000 }
    );
    assert.strictEqual('tool_calls' in recordedCalls[0].body.messages[1], false, 'tool_calls must be omitted when there are none');

    // 5. <think> stripping and null content
    responseHandler = () => makeCannedResponse(200, {
        choices: [{ message: { role: 'assistant', content: '<think>The user wants a count.\nTwo vendors.</think>\n\nThere are 2 vendors.' } }],
    });
    const oaiThink = await openaiProvider.chat({ key: oaiKey, model: oaiModel }, { turns: [{ role: 'user', text: 'count' }], timeoutMs: 5000 });
    assert.strictEqual(oaiThink.text, 'There are 2 vendors.', '<think> block must be stripped');
    responseHandler = () => makeCannedResponse(200, { choices: [{ message: { role: 'assistant', content: null } }] });
    const oaiNull = await openaiProvider.chat({ key: oaiKey, model: oaiModel }, { turns: [{ role: 'user', text: 'x' }], timeoutMs: 5000 });
    assert.strictEqual(oaiNull.text, '', 'null content becomes an empty string');
    assert.deepStrictEqual(oaiNull.toolCalls, []);

    // Unparseable arguments fall back to {}
    responseHandler = () => makeCannedResponse(200, {
        choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'call_bad', type: 'function', function: { name: 'ping', arguments: '{not json' } }] } }],
    });
    const oaiBadArgs = await openaiProvider.chat({ key: oaiKey, model: oaiModel }, { turns: [{ role: 'user', text: 'x' }], timeoutMs: 5000 });
    assert.deepStrictEqual(oaiBadArgs.toolCalls, [{ id: 'call_bad', name: 'ping', args: {} }]);

    // 6. Errors: mapped like generateText, key never leaks
    await expectChatError(openaiProvider, { key: oaiKey, model: oaiModel }, () => makeCannedResponse(401, { error: { message: `Unauthorized key ${oaiKey}` } }), 'auth', oaiKey);
    await expectChatError(openaiProvider, { key: oaiKey, model: oaiModel }, () => makeCannedResponse(429, { error: { message: `Rate limit on key ${oaiKey}` } }), 'rate', oaiKey);
    await expectChatError(openaiProvider, { key: oaiKey, model: oaiModel }, () => makeCannedResponse(500, { error: { message: `Server error on key ${oaiKey}` } }), 'server', oaiKey);
    await expectChatError(openaiProvider, { key: oaiKey, model: oaiModel }, () => { throw new TypeError('Failed to fetch (CORS block)'); }, 'cors', oaiKey);
    const oaiChat400 = await expectChatError(openaiProvider, { key: oaiKey, model: oaiModel }, () => makeCannedResponse(400, { error: { message: `Invalid tools for key ${oaiKey}` } }), 'bad_request', oaiKey);
    assert.ok(oaiChat400.message.includes('Invalid tools'), 'chat bad_request must include the API message');
    const oaiChatNoModel = await expectChatError(openaiProvider, { key: oaiKey, model: '' }, () => makeCannedResponse(200, {}), 'config', oaiKey);
    assert.strictEqual(oaiChatNoModel.message, 'Pick a model in Settings');
    await expectChatError(openaiProvider, { model: oaiModel }, () => makeCannedResponse(200, {}), 'auth', oaiKey);

    // External abort is wired to the request signal
    const oaiAbort = new AbortController();
    await expectChatError(openaiProvider, { key: oaiKey, model: oaiModel }, (call) => new Promise((_, reject) => {
        call.signal.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), { once: true });
        setTimeout(() => oaiAbort.abort(), 10);
    }), 'timeout', oaiKey, { turns: [{ role: 'user', text: 'slow' }], timeoutMs: 5000, signal: oaiAbort.signal });

    // ── COMPAT chat (Ollama style) ──
    responseHandler = () => makeCannedResponse(200, {
        model: 'qwen2.5:7b',
        choices: [{
            message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                    { type: 'function', function: { name: 'list_vendors', arguments: { limit: 5 } } },
                    { type: 'function', function: { name: 'ping', arguments: {} } },
                ],
            },
        }],
    });
    recordedCalls = [];
    const ollamaTool = await compatProvider.chat(
        { baseUrl: 'http://localhost:11434/v1/', model: 'qwen2.5:7b' },
        { system: 'You are the Onyx agent', turns: chatTurns, tools: chatTools, timeoutMs: 5000 }
    );
    assert.strictEqual(recordedCalls.length, 1);
    assert.strictEqual(recordedCalls[0].url, 'http://localhost:11434/v1/chat/completions');
    assert.strictEqual(recordedCalls[0].headers['Authorization'], undefined, 'Ollama chat must not send Authorization without a key');
    assert.strictEqual(recordedCalls[0].body.model, 'qwen2.5:7b');
    assert.strictEqual(recordedCalls[0].body.messages[2].tool_calls[0].function.arguments, '{"limit":3}');
    assert.strictEqual(recordedCalls[0].body.tools.length, 2);
    assert.strictEqual(ollamaTool.text, '');
    assert.strictEqual(ollamaTool.model, 'qwen2.5:7b');
    assert.deepStrictEqual(ollamaTool.toolCalls.map(c => ({ name: c.name, args: c.args })), [
        { name: 'list_vendors', args: { limit: 5 } },
        { name: 'ping', args: {} },
    ], 'Object arguments are kept');
    assert.ok(ollamaTool.toolCalls.every(c => /^call_\d+$/.test(c.id)) && new Set(ollamaTool.toolCalls.map(c => c.id)).size === 2, 'Missing ids get unique call_<n> ids');

    // Ollama reasoning model: <think> stripped from a plain answer
    responseHandler = () => makeCannedResponse(200, {
        choices: [{ message: { role: 'assistant', content: '<think>\nreasoning\n</think>Two vendors.' } }],
    });
    const ollamaText = await compatProvider.chat({ baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b' }, { turns: [{ role: 'user', text: 'count' }], timeoutMs: 5000 });
    assert.strictEqual(ollamaText.text, 'Two vendors.');
    assert.deepStrictEqual(ollamaText.toolCalls, []);

    // Compat config and key handling
    const compatChatNoBase = await expectChatError(compatProvider, { model: 'llama3' }, () => makeCannedResponse(200, {}), 'config', null);
    assert.ok(compatChatNoBase.message.length > 0);
    await expectChatError(compatProvider, { key: compatKey, baseUrl: 'https://api.together.xyz/v1', model: 'mistralai/Mixtral-8x7B' }, () => makeCannedResponse(401, { error: { message: `Unauthorized for key ${compatKey}` } }), 'auth', compatKey);
    responseHandler = () => makeCannedResponse(200, { choices: [{ message: { role: 'assistant', content: 'ok' } }] });
    recordedCalls = [];
    await compatProvider.chat({ key: compatKey, baseUrl: 'https://api.together.xyz/v1', model: 'mistralai/Mixtral-8x7B' }, { turns: [{ role: 'user', text: 'hi' }], timeoutMs: 5000 });
    assert.strictEqual(recordedCalls[0].headers['Authorization'], `Bearer ${compatKey}`);

    // ── ANTHROPIC chat ──
    responseHandler = () => makeCannedResponse(200, {
        id: 'msg_03',
        model: antModel,
        content: [
            { type: 'text', text: 'Looking those up. ' },
            { type: 'tool_use', id: 'toolu_77', name: 'list_vendors', input: { limit: 2 } },
            { type: 'tool_use', id: 'toolu_78', name: 'ping', input: {} },
        ],
    });
    recordedCalls = [];
    const antChatTool = await anthropicProvider.chat(
        { key: antKey, model: antModel },
        { system: 'You are the Onyx agent', turns: chatTurns, tools: chatTools, timeoutMs: 5000 }
    );
    assert.strictEqual(recordedCalls.length, 1);
    const antChat = recordedCalls[0];
    assert.strictEqual(antChat.url, 'https://api.anthropic.com/v1/messages');
    assert.strictEqual(antChat.method, 'POST');
    assert.strictEqual(antChat.headers['x-api-key'], antKey);
    assert.strictEqual(antChat.headers['anthropic-version'], '2023-06-01');
    assert.strictEqual(antChat.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.strictEqual(antChat.body.model, antModel);
    assert.strictEqual(antChat.body.system, 'You are the Onyx agent');
    assert.strictEqual(antChat.body.max_tokens, 2048, 'max_tokens defaults to 2048');
    assert.strictEqual('tool_choice' in antChat.body, false, 'chat must leave tool_choice on auto');
    assert.deepStrictEqual(antChat.body.messages, [
        { role: 'user', content: [{ type: 'text', text: 'List the vendors' }] },
        {
            role: 'assistant',
            content: [
                { type: 'text', text: 'Checking' },
                { type: 'tool_use', id: 'call_a', name: 'list_vendors', input: { limit: 3 } },
            ],
        },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_a', content: '{"vendors":["A","B"]}' }] },
        { role: 'user', content: [{ type: 'text', text: 'Thanks, now count them' }] },
    ], 'Anthropic chat messages must map user, assistant(tool_use) and tool_result turns');

    // Tool schema mapping
    assert.deepStrictEqual(antChat.body.tools[0], {
        name: 'list_vendors',
        description: 'List vendors',
        input_schema: { type: 'object', properties: { limit: { type: 'number' } } },
    });
    assert.strictEqual(antChat.body.tools[1].name, 'ping');
    assert.deepStrictEqual(antChat.body.tools[1].input_schema, { type: 'object', properties: {} }, 'Missing parameters default to an empty object schema');

    // Canned tool call response parsing
    assert.strictEqual(antChatTool.text, 'Looking those up. ');
    assert.strictEqual(antChatTool.model, antModel);
    assert.deepStrictEqual(antChatTool.toolCalls, [
        { id: 'toolu_77', name: 'list_vendors', args: { limit: 2 } },
        { id: 'toolu_78', name: 'ping', args: {} },
    ]);

    // Parallel tool calls: consecutive tool turns merge into ONE user message that follows the assistant turn
    responseHandler = () => makeCannedResponse(200, {
        model: antModel,
        content: [{ type: 'text', text: 'Both done.' }],
    });
    recordedCalls = [];
    const antChatText = await anthropicProvider.chat(
        { key: antKey, model: antModel },
        {
            maxTokens: 300,
            temperature: 0.1,
            turns: [
                { role: 'user', text: 'do both' },
                { role: 'assistant', toolCalls: [{ id: 'c1', name: 'list_vendors', args: {} }, { id: 'c2', name: 'ping', args: {} }] },
                { role: 'tool', callId: 'c1', name: 'list_vendors', result: ['A'] },
                { role: 'tool', callId: 'c2', name: 'ping', result: 'pong' },
            ],
            timeoutMs: 5000,
        }
    );
    const antMerged = recordedCalls[0].body;
    assert.strictEqual(antMerged.max_tokens, 300);
    assert.strictEqual(antMerged.temperature, 0.1);
    assert.strictEqual('system' in antMerged, false, 'No system field when system is absent');
    assert.strictEqual('tools' in antMerged, false, 'tools must be omitted when there are none');
    assert.strictEqual(antMerged.messages.length, 3, 'Two consecutive tool turns must merge into one message');
    assert.deepStrictEqual(antMerged.messages[1].content, [
        { type: 'tool_use', id: 'c1', name: 'list_vendors', input: {} },
        { type: 'tool_use', id: 'c2', name: 'ping', input: {} },
    ], 'Assistant turn without text has no text block');
    assert.strictEqual(antMerged.messages[2].role, 'user');
    assert.deepStrictEqual(antMerged.messages[2].content, [
        { type: 'tool_result', tool_use_id: 'c1', content: '["A"]' },
        { type: 'tool_result', tool_use_id: 'c2', content: 'pong' },
    ]);
    assert.strictEqual(antChatText.text, 'Both done.');
    assert.deepStrictEqual(antChatText.toolCalls, []);

    // Anthropic chat errors: mapped like generateText, key never leaks
    await expectChatError(anthropicProvider, { key: antKey, model: antModel }, () => makeCannedResponse(401, { error: { message: `Unauthorized with ${antKey}` } }), 'auth', antKey);
    await expectChatError(anthropicProvider, { key: antKey, model: antModel }, () => makeCannedResponse(429, { error: { message: `Rate limit on ${antKey}` } }), 'rate', antKey);
    await expectChatError(anthropicProvider, { key: antKey, model: antModel }, () => makeCannedResponse(500, { error: { message: `Server error for ${antKey}` } }), 'server', antKey);
    await expectChatError(anthropicProvider, { key: antKey, model: antModel }, () => { throw new TypeError('Failed to fetch (CORS block)'); }, 'cors', antKey);
    const antChat400 = await expectChatError(anthropicProvider, { key: antKey, model: antModel }, () => makeCannedResponse(400, { error: { message: `tools.0.input_schema invalid for key ${antKey}` } }), 'bad_request', antKey);
    assert.ok(antChat400.message.includes('input_schema invalid'), 'chat bad_request must include the API message');
    const antChatNoModel = await expectChatError(anthropicProvider, { key: antKey, model: '' }, () => makeCannedResponse(200, {}), 'config', antKey);
    assert.strictEqual(antChatNoModel.message, 'Pick a model in Settings');
    await expectChatError(anthropicProvider, { model: antModel }, () => makeCannedResponse(200, {}), 'auth', antKey);

    const antAbort = new AbortController();
    await expectChatError(anthropicProvider, { key: antKey, model: antModel }, (call) => new Promise((_, reject) => {
        call.signal.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), { once: true });
        setTimeout(() => antAbort.abort(), 10);
    }), 'timeout', antKey, { turns: [{ role: 'user', text: 'slow' }], timeoutMs: 5000, signal: antAbort.signal });

    console.log('provider checks passed');
}

runTests().catch((err) => {
    console.error('Provider check failure:', err);
    process.exit(1);
});
