// Checks for BYOK AI providers (Anthropic, OpenAI, Compat).
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

    assert.strictEqual(PROVIDER_INFOS.length, 4, 'PROVIDER_INFOS must list all four providers');
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

    console.log('provider checks passed');
}

runTests().catch((err) => {
    console.error('Provider check failure:', err);
    process.exit(1);
});
