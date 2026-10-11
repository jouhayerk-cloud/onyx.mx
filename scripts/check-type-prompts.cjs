// Checks for per-Type prompt guidance and finishDescription.
// Run: node scripts/check-type-prompts.cjs
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');

const root = path.join(__dirname, '..');
const esbuildBin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');
const entryPath = path.join(os.tmpdir(), 'check-type-prompts-entry.ts');
// Inside node_modules so the external packages resolve from the app.
fs.mkdirSync(path.join(root, 'node_modules', '.cache'), { recursive: true });
const outPath = path.join(root, 'node_modules', '.cache', 'typePrompts.check.cjs');

fs.writeFileSync(entryPath, `
export * from '${path.join(root, 'src/lib/ai/typePrompts.ts').replace(/\\/g, '/')}';
export * from '${path.join(root, 'src/lib/ai/finalize.ts').replace(/\\/g, '/')}';
export * from '${path.join(root, 'src/lib/ai/typePromptData.ts').replace(/\\/g, '/')}';
export * from '${path.join(root, 'src/lib/ai/typePromptSpec.ts').replace(/\\/g, '/')}';
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

// Some imported libraries touch browser globals when they load.
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.Worker === 'undefined') globalThis.Worker = function Worker() {};
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener: () => {} };

const {
    TYPE_PROMPT_SPECS,
    COPY_BANNED_CLAIMS,
    COPY_LIMITS,
    typeGuidanceFor,
    promptSpecFor,
    shopifyTypeFor,
    itemTypeId,
    finishDescription,
} = require(outPath);

assert.ok(Array.isArray(TYPE_PROMPT_SPECS) && TYPE_PROMPT_SPECS.length > 0, 'TYPE_PROMPT_SPECS must be a non-empty array');

for (const spec of TYPE_PROMPT_SPECS) {
    const sampleItem = {
        id: 'test-' + spec.typeId,
        itemId: 'TEST-001',
        vendorId: 'EM',
        workbook: 'v326',
        itemNumber: '1',
        shape: '',
        type: spec.noun,
        material: 'Onyx',
        vendorColor: 'Blue',
        vendorText: '',
        widthCm: 30,
        heightCm: 20,
        lengthCm: 15,
        weightKg: 0,
        quantity: 1,
        priceMxn: 1000,
        existing: { title: '', html: '', colors: [], genType: '' },
        mediaUrls: [],
    };

    const guidance = typeGuidanceFor(sampleItem, ['title', 'body', 'colors', 'type']);

    // 1. Guidance contains the noun
    assert.ok(guidance.includes(spec.noun), `Spec ${spec.typeId}: guidance must contain noun "${spec.noun}"`);

    // 2. Guidance contains the title pattern
    assert.ok(guidance.includes(spec.title.pattern), `Spec ${spec.typeId}: guidance must contain title pattern "${spec.title.pattern}"`);

    // 3. Guidance contains the shopifyType
    assert.ok(guidance.includes(spec.shopifyType), `Spec ${spec.typeId}: guidance must contain shopifyType "${spec.shopifyType}"`);

    // 4. Guidance contains the word ceiling
    const ceiling = Math.min(spec.description.maxWords, COPY_LIMITS.descriptionMaxWords);
    assert.ok(guidance.includes(String(ceiling)), `Spec ${spec.typeId}: guidance must contain word ceiling "${ceiling}"`);

    // 5. Guidance contains every forbidden word
    for (const word of spec.forbidden) {
        assert.ok(guidance.toLowerCase().includes(word.toLowerCase()), `Spec ${spec.typeId}: guidance must contain forbidden word "${word}"`);
    }

    // 6. No title example is over 70 characters
    for (const example of spec.title.examples) {
        assert.ok(example.length <= 70, `Spec ${spec.typeId}: title example "${example}" is ${example.length} chars (must be <= 70)`);
    }

    // 7. No title example contains a banned claim
    for (const example of spec.title.examples) {
        for (const banned of COPY_BANNED_CLAIMS) {
            const re = new RegExp('(?:^|[^a-z0-9])' + banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^a-z0-9])', 'i');
            assert.ok(!re.test(example), `Spec ${spec.typeId}: title example "${example}" contains banned claim "${banned}"`);
        }
    }

    // 8. Lit is respected: the guidance of an unlit Type does not mention light through the stone
    if (!spec.lit) {
        const lowerGuidance = guidance.toLowerCase();
        assert.ok(
            !lowerGuidance.includes('light through the stone') && !lowerGuidance.includes('light passing through'),
            `Spec ${spec.typeId}: guidance of unlit Type must not mention light through the stone`,
        );
    }
}

function checkEndsWithCompleteSentence(html, label) {
    const stripped = html.replace(/<[^>]+>/g, '').trim();
    assert.ok(/[.!?]['"”’\)]*$/.test(stripped), `${label}: must end with a complete sentence (. ! ?). Got: "${html}"`);
}

function checkBalancedTags(html, label) {
    const stack = [];
    const re = /<\/?([a-z0-9]+)[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[1].toLowerCase();
        if (m[0].startsWith('</')) {
            const popped = stack.pop();
            assert.strictEqual(popped, tag, `${label}: Mismatched closing tag </${tag}>, expected </${popped}> in "${html}"`);
        } else {
            stack.push(tag);
        }
    }
    assert.strictEqual(stack.length, 0, `${label}: Unclosed tags remaining: ${stack.join(', ')} in "${html}"`);
}

// Assert finishDescription on:
// (a) a text cut mid sentence
const cutInput = '<p>This is a complete sentence. This is an incomplete sentence that was cut';
const cutOut = finishDescription(cutInput, 100);
assert.strictEqual(cutOut, '<p>This is a complete sentence.</p>', 'Cut text must remove trailing incomplete sentence');
checkEndsWithCompleteSentence(cutOut, 'cutOut');
checkBalancedTags(cutOut, 'cutOut');

// (b) a text with a repeated sentence
const repeatInput = '<p>Handcrafted Mexican stone bowl. Handcrafted Mexican stone bowl. Features natural veining.</p>';
const repeatOut = finishDescription(repeatInput, 100);
assert.strictEqual(repeatOut, '<p>Handcrafted Mexican stone bowl. Features natural veining.</p>', 'Repeated sentence must be collapsed');
checkEndsWithCompleteSentence(repeatOut, 'repeatOut');
checkBalancedTags(repeatOut, 'repeatOut');

// (c) a text over the ceiling
const longInput = '<p>One two three. Four five six. Seven eight nine.</p>';
const longOut = finishDescription(longInput, 6);
assert.strictEqual(longOut, '<p>One two three. Four five six.</p>', 'Text over ceiling must cut at sentence boundary');
checkEndsWithCompleteSentence(longOut, 'longOut');
checkBalancedTags(longOut, 'longOut');

// (d) an unclosed <ul>
const unclosedInput = '<p>Intro paragraph.</p><ul><li>First bullet.</li><li>Second bullet was cut';
const unclosedOut = finishDescription(unclosedInput, 100);
assert.strictEqual(unclosedOut, '<p>Intro paragraph.</p><ul><li>First bullet.</li></ul>', 'Unclosed <ul> must remove cut item and close tags');
checkEndsWithCompleteSentence(unclosedOut, 'unclosedOut');
checkBalancedTags(unclosedOut, 'unclosedOut');

// (e) an unclosed <ul> with no prior paragraph ensures at least one paragraph
const unclosedListOnly = '<ul><li>First bullet.</li><li>Second bullet was cut';
const unclosedListOut = finishDescription(unclosedListOnly, 100);
assert.ok(unclosedListOut.includes('<p>'), 'Must ensure at least one paragraph exists');
checkEndsWithCompleteSentence(unclosedListOut, 'unclosedListOut');
checkBalancedTags(unclosedListOut, 'unclosedListOut');

console.log('type prompt checks passed');
