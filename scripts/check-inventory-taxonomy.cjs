// Checks for src/lib/inventoryTaxonomy.ts and src/lib/entrySuggestions.ts.
// Run: node scripts/check-inventory-taxonomy.cjs
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');

const root = path.join(__dirname, '..');
const esbuildPath = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');
const taxOut = path.join(os.tmpdir(), 'inventoryTaxonomy.check.cjs');
const suggOut = path.join(os.tmpdir(), 'entrySuggestions.check.cjs');

// Bundle taxonomy module
execFileSync(
    process.execPath,
    [
        esbuildPath,
        'src/lib/inventoryTaxonomy.ts',
        '--bundle',
        '--format=cjs',
        '--platform=node',
        '--outfile=' + taxOut,
        '--log-level=error',
    ],
    { cwd: root, stdio: 'inherit' }
);

// Bundle suggestions module
execFileSync(
    process.execPath,
    [
        esbuildPath,
        'src/lib/entrySuggestions.ts',
        '--bundle',
        '--format=cjs',
        '--platform=node',
        '--outfile=' + suggOut,
        '--log-level=error',
    ],
    { cwd: root, stdio: 'inherit' }
);

const taxonomy = require(taxOut);
const suggestions = require(suggOut);

const aliasMapPath = path.join(root, 'docs', 'inventory', 'taxonomy_alias_map.json');
const aliasMap = JSON.parse(fs.readFileSync(aliasMapPath, 'utf8'));

// Owner decisions & binding directives (11 Oct 2026):
// (a) Tower Lamp is a Floor Lamp (tower-lamp -> floor-lamp)
// (b) Luminary is a Wall Panel (luminary -> wall-panel)
// Exception: Rock is preserved as its own canonical Type 'rock' (owner decision pending)
const OWNER_TYPE_OVERRIDES = {
    'Rock': 'rock',
    'Tower Lamp': 'floor-lamp',
    'Luminary': 'wall-panel',
};

let disagreements = 0;

// 1. Check type section
let typeAgreed = 0;
const typeTotal = Object.keys(aliasMap.type).length;

for (const [raw, entry] of Object.entries(aliasMap.type)) {
    const expected = OWNER_TYPE_OVERRIDES[raw] ?? entry.canonical;
    const actual = taxonomy.canonicalTypeId(raw);
    if (actual !== expected) {
        console.error(`Disagreement in type: "${raw}" -> code gives "${actual}", expected "${expected}"`);
        disagreements++;
    } else {
        typeAgreed++;
    }
}

// 2. Check material section
let materialAgreed = 0;
const materialTotal = Object.keys(aliasMap.material).length;

for (const [raw, entry] of Object.entries(aliasMap.material)) {
    const expected = entry.canonical;
    const actual = taxonomy.canonicalMaterial(raw);
    if (actual !== expected) {
        console.error(`Disagreement in material: "${raw}" -> code gives "${actual}", expected "${expected}"`);
        disagreements++;
    } else {
        materialAgreed++;
    }
}

// 3. Check vendor_color section
let colorAgreed = 0;
const colorTotal = Object.keys(aliasMap.vendor_color).length;

for (const [raw, entry] of Object.entries(aliasMap.vendor_color)) {
    const expected = entry.canonical;
    const actual = taxonomy.canonicalVendorColour(raw);
    if (actual !== expected) {
        console.error(`Disagreement in vendor_color: "${raw}" -> code gives "${actual}", expected "${expected}"`);
        disagreements++;
    } else {
        colorAgreed++;
    }
}

if (disagreements > 0) {
    console.error(`Found ${disagreements} disagreements between taxonomy code and alias map.`);
    process.exit(1);
}

// 4. Unit assertions from prompt specification
// Assertion: canonicalColour("Green Talan") is "Green"
assert.strictEqual(taxonomy.canonicalColour('Green Talan'), 'Green');

// Assertion: splitVendorColour("Blue Argentina").variety is "Blue Argentina"
const blueArgSplit = taxonomy.splitVendorColour('Blue Argentina');
assert.strictEqual(blueArgSplit.variety, 'Blue Argentina');
assert.strictEqual(blueArgSplit.colour, 'Blue');

// Assertion: cleanSuggestions("shape", ["Squared","squared","SQUARED","Large","Horses"]) has no duplicates
const shapeSuggs = suggestions.cleanSuggestions('shape', ['Squared', 'squared', 'SQUARED', 'Large', 'Horses']);
assert.deepStrictEqual(shapeSuggs, ['Squared', 'Large', 'Horses']);
assert.strictEqual(new Set(shapeSuggs.map(s => s.toLowerCase())).size, shapeSuggs.length, 'shape suggestions must have no duplicates');

// Open / Closed top assertions (Update c)
const openTop = taxonomy.classifyShapeValue('Squared Open Top');
assert.deepStrictEqual(openTop, { kind: 'form', value: 'squared', top: 'open' });

const plainSquared = taxonomy.classifyShapeValue('Squared');
assert.deepStrictEqual(plainSquared, { kind: 'form', value: 'squared' });

const topSuggs = suggestions.cleanSuggestions('shape', ['Squared Open Top', 'Squared Closed Top', 'squared open top']);
assert.deepStrictEqual(topSuggs, ['Squared Open Top', 'Squared Closed Top']);

// Variety & Colour verification
assert.strictEqual(taxonomy.canonicalVariety('Blue Argentina'), 'Blue Argentina');
assert.strictEqual(taxonomy.canonicalVariety('Tehuacan'), 'Tehuacan');
assert.strictEqual(taxonomy.canonicalVariety('Green Talan'), 'Talan');
assert.strictEqual(taxonomy.canonicalVariety('White Amber'), null);
assert.strictEqual(taxonomy.canonicalColour('Amber'), 'Amber');
assert.strictEqual(taxonomy.canonicalColour('Pearlescent'), 'Pearlescent');
assert.strictEqual(taxonomy.canonicalColour('Tehuacan'), null);

// Name filtering verification
const nameFiltered = suggestions.cleanSuggestions('shape', ['Laura McNabb', 'Squared', 'Client Jan Dunn']);
assert.deepStrictEqual(nameFiltered, ['Squared']);

console.log(`Type checks passed: ${typeAgreed}/${typeTotal} agreed (reconciled with 3 owner overrides: Rock -> rock, Tower Lamp -> floor-lamp, Luminary -> wall-panel).`);
console.log(`Material checks passed: ${materialAgreed}/${materialTotal} agreed.`);
console.log(`Vendor color checks passed: ${colorAgreed}/${colorTotal} agreed.`);
console.log('All unit assertions passed.');
