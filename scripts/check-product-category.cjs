// Checks for src/lib/productCategory.ts (whole-word matching). Run: node scripts/check-product-category.cjs
// The regression that started it: "Blue Argentina" contains "tina" (Spanish for bathtub), so Argentina bowls were exported as bathtubs.
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const assert = require('assert');
const root = path.join(__dirname, '..');
const out = path.join(os.tmpdir(), 'productCategory.check.cjs');
execFileSync(process.execPath, [path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'), 'src/lib/productCategory.ts', '--bundle', '--format=cjs', '--platform=node', '--outfile=' + out, '--log-level=error'], { cwd: root, stdio: 'inherit' });
const { getProductCategoryAndType, hasWord, foldText } = require(out);

const bowl = { shape: 'Large', shortDescription: 'Bowl', description: 'Artisanal Blue Argentina Onyx Large Wavy Sculptural Decorative Bowl', type: 'Home Decor > Decorative Bowls' };
assert.deepStrictEqual(getProductCategoryAndType(bowl), { category: 'Home & Garden > Decor > Decorative Bowls', type: 'Home Decor > Decorative Bowls' });
assert.strictEqual(getProductCategoryAndType({ description: 'Blue Argentina' }).type, 'Home Decor > Sculptures', 'Argentina alone is not a bathtub');
assert.strictEqual(getProductCategoryAndType({ description: 'Blue Argentina Decorative Bowl' }).type, 'Home Decor > Decorative Bowls');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Tina de onyx' }).type, 'Bathtubs', 'the Spanish word still works');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Bathtub' }).type, 'Bathtubs');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Tower Lamp' }).type, 'Home Decor > Floor Lamps');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Pendant Lamp' }).type, 'Home Decor > Pendant Lights');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Table Lamps' }).type, 'Home Decor > Table Lamps');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Canoe' }).type, 'Home Decor > Decorative Trays', 'owner rule: canoes are Decorative Trays');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Canoe', type: 'Home Decor > Decorative Bowls' }).type, 'Home Decor > Decorative Trays', 'the staff Type Canoe beats a model type of bowls');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Cofee Table' }).type, 'Home Decor > Tables');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Wall Panel Pair' }).type, 'Home Decor > Wall Panels');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Fountain Set' }).type, 'Outdoor Decor > Fountains');
assert.strictEqual(getProductCategoryAndType({ shape: 'Rustic Wine Rack' }).type, 'Home Decor > Wine Racks');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Bowl', description: 'sink style vessel' }).type, 'Home Decor > Decorative Bowls', 'the typed Type beats the free text');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Platinum Finish' }).type, 'Home Decor > Sculptures', 'plate is not found inside platinum');
assert.strictEqual(getProductCategoryAndType({ shortDescription: 'Rock' }).type, 'Home Decor > Sculptures');
assert.ok(hasWord(foldText('Mirrors'), 'mirror') && !hasWord(foldText('Argentina'), 'tina') && hasWord(foldText('Tazon'), 'tazon'));
assert.strictEqual(foldText('  Té   Ámbar '), 'te ambar');
console.log('product category checks passed');
