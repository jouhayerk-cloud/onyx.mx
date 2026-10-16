/**
 * check-boxes-bridge.ts
 * Locked test harness for boxesBridge logistics and math engine.
 * Run via: npx tsx scripts/check-boxes-bridge.ts
 *
 * Covers: parameter maths, SVG shape, XML escaping of data strings, the real Boxes.py argument names per
 * generator (read from C:\boxes\boxes\generators when that clone exists), PowerShell quoting and the
 * structure of the generated LightBurn project.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BOXES_GENERATOR_ARGS,
  buildBoxesCliArgs,
  combineCrateSvgs,
  computeBoxesParams,
  computeCutTelemetry,
  escapeXml,
  formatBoxesCliCommand,
  generateProceduralCrateSvg,
  getBoxesAcceptedArgs,
  getToolpathSegments,
  psQuote,
  svgToDataUri,
  CrateDimensions,
  PackedItemSpec,
} from '../src/lib/logistics/boxesBridge';
import { generateLightBurnProjectXml, getBoxesCliRecipe } from '../src/lib/logistics/boxesCliBridge';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

console.log('Running boxes-bridge verification harness...');

// 1. Test computeBoxesParams with standard crate (60x60x60cm) without items
const standardCrate: CrateDimensions = {
  widthCm: 60,
  lengthCm: 60,
  heightCm: 60,
};

const paramsStandard = computeBoxesParams(standardCrate);
console.log('  Testing computeBoxesParams (no items)...');
assert(paramsStandard.x === 600, `Expected x = 600 mm, got ${paramsStandard.x}`);
assert(paramsStandard.y === 600, `Expected y = 600 mm, got ${paramsStandard.y}`);
assert(paramsStandard.h === 600, `Expected h = 600 mm, got ${paramsStandard.h}`);
assert(paramsStandard.thickness === 6, `Expected default thickness = 6 mm, got ${paramsStandard.thickness}`);
assert(paramsStandard.burn === 0.1, `Expected default burn = 0.1 mm, got ${paramsStandard.burn}`);
assert(paramsStandard.generator === 'UniversalBox', `Expected UniversalBox, got ${paramsStandard.generator}`);
assert(paramsStandard.sx === undefined, `Expected sx to be undefined when no items, got ${paramsStandard.sx}`);
assert(paramsStandard.sy === undefined, `Expected sy to be undefined when no items, got ${paramsStandard.sy}`);

// 2. Test computeBoxesParams with packed items (verifies 600mm scaling and sx/sy intervals)
console.log('  Testing computeBoxesParams (with packed items)...');
const packedItems: PackedItemSpec[] = [
  {
    id: 'payload-01',
    name: 'Avionics Unit 1',
    xCm: 0,
    yCm: 0,
    zCm: 0,
    widthCm: 20,
    lengthCm: 30,
    heightCm: 20,
  },
  {
    id: 'payload-02',
    name: 'Battery Pack 2',
    xCm: 20,
    yCm: 0,
    zCm: 30,
    widthCm: 40,
    lengthCm: 30,
    heightCm: 20,
  },
];

const paramsWithItems = computeBoxesParams(standardCrate, packedItems);
assert(paramsWithItems.generator === 'TypeTray', `Expected TypeTray, got ${paramsWithItems.generator}`);
assert(paramsWithItems.x === 600, `Expected x = 600 mm, got ${paramsWithItems.x}`);
assert(paramsWithItems.y === 600, `Expected y = 600 mm, got ${paramsWithItems.y}`);
assert(paramsWithItems.h === 600, `Expected h = 600 mm, got ${paramsWithItems.h}`);
assert(paramsWithItems.thickness === 6, `Expected thickness = 6 mm, got ${paramsWithItems.thickness}`);
assert(paramsWithItems.burn === 0.1, `Expected burn = 0.1 mm, got ${paramsWithItems.burn}`);
assert(paramsWithItems.sx === '200:400', `Expected sx = '200:400', got '${paramsWithItems.sx}'`);
assert(paramsWithItems.sy === '300:300', `Expected sy = '300:300', got '${paramsWithItems.sy}'`);

// 3. Test custom thickness and burn parameters
console.log('  Testing custom material parameters...');
const customCrate: CrateDimensions = {
  widthCm: 45,
  lengthCm: 35,
  heightCm: 25,
  thicknessMm: 4.5,
  burnMm: 0.12,
};
const customParams = computeBoxesParams(customCrate);
assert(customParams.x === 450, `Expected x = 450, got ${customParams.x}`);
assert(customParams.y === 350, `Expected y = 350, got ${customParams.y}`);
assert(customParams.h === 250, `Expected h = 250, got ${customParams.h}`);
assert(customParams.thickness === 4.5, `Expected thickness = 4.5, got ${customParams.thickness}`);
assert(customParams.burn === 0.12, `Expected burn = 0.12, got ${customParams.burn}`);

// 4. Test formatBoxesCliCommand
console.log('  Testing formatBoxesCliCommand...');
const cliStandard = formatBoxesCliCommand(paramsStandard);
assert(cliStandard.startsWith('$env:PYTHONUTF8=1;'), `CLI command must start with $env:PYTHONUTF8=1;`);
assert(cliStandard.includes('boxes.exe'), `CLI command must invoke boxes.exe`);
assert(cliStandard.includes('UniversalBox'), `CLI command must specify UniversalBox`);
assert(cliStandard.includes('--x 600'), `CLI command missing --x 600`);
assert(cliStandard.includes('--y 600'), `CLI command missing --y 600`);
assert(cliStandard.includes('--h 600'), `CLI command missing --h 600`);
assert(cliStandard.includes('--thickness 6'), `CLI command missing --thickness 6`);
assert(cliStandard.includes('--burn 0.1'), `CLI command missing --burn 0.1`);

const cliWithItemsAndOutput = formatBoxesCliCommand(
  paramsWithItems,
  'C:\\boxes\\output_crate.svg'
);
assert(cliWithItemsAndOutput.startsWith('$env:PYTHONUTF8=1;'), `CLI command must start with $env:PYTHONUTF8=1;`);
assert(cliWithItemsAndOutput.includes('TypeTray'), `CLI command must specify TypeTray`);
assert(cliWithItemsAndOutput.includes("--sx '200:400'"), `CLI command missing --sx '200:400'`);
assert(cliWithItemsAndOutput.includes("--sy '300:300'"), `CLI command missing --sy '300:300'`);
assert(cliWithItemsAndOutput.includes("--output 'C:\\boxes\\output_crate.svg'"), `CLI command missing --output`);
// TypeTray sizes itself from sections: the real generator rejects --x / --y ("unrecognized arguments").
assert(!/ --x /.test(cliWithItemsAndOutput) && !/ --y /.test(cliWithItemsAndOutput), `TypeTray recipe must not carry --x/--y`);
assert(cliWithItemsAndOutput.includes('--h 600'), `TypeTray recipe missing --h`);

// 4b. Per-generator arguments: every emitted key must exist on that generator.
console.log('  Testing per-generator CLI arguments...');
const argNames = (cmd: string) => Array.from(cmd.matchAll(/ --([A-Za-z_]+) /g)).map(m => m[1]);
const generators = Object.keys(BOXES_GENERATOR_ARGS) as Array<keyof typeof BOXES_GENERATOR_ARGS>;
for (const gen of generators) {
  const cmd = formatBoxesCliCommand({ ...paramsStandard, generator: gen }, 'out.svg');
  const accepted = new Set(getBoxesAcceptedArgs(gen));
  for (const name of argNames(cmd + ' ')) {
    assert(accepted.has(name), `${gen}: recipe emits --${name}, which the generator does not accept`);
  }
}
const trayDefault = formatBoxesCliCommand({ ...paramsStandard, generator: 'TypeTray' });
assert(trayDefault.includes("--sx '600'") && trayDefault.includes("--sy '600'") && trayDefault.includes('--h 600'), `TypeTray without sections must default to one section per side: ${trayDefault}`);
const flex = formatBoxesCliCommand({ ...paramsStandard, generator: 'FlexBox' });
assert(flex.includes("--sx '600'") && flex.includes('--y 600') && flex.includes('--h 600') && !/ --x /.test(flex), `FlexBox takes --sx --y --h: ${flex}`);
const bin = formatBoxesCliCommand({ ...paramsStandard, generator: 'BinTray' });
assert(bin.includes("--sx '600'") && bin.includes('--y 600') && bin.includes("--sh '600'") && !/ --h /.test(bin), `BinTray takes --sx --y --sh: ${bin}`);
const abox = formatBoxesCliCommand({ ...paramsStandard, generator: 'ABox' });
assert(abox.includes('--x 600') && abox.includes('--y 600') && abox.includes('--h 600'), `ABox takes --x --y --h: ${abox}`);
const recipe = getBoxesCliRecipe('TypeTray', { x: 600, y: 400, h: 300, thickness: 6, burn: 0.1, outside: 1, sx: '200:400' }, 'crate_cutfile.svg', 'lbrn2');
assert(!/ --x /.test(recipe) && recipe.includes("--sx '200:400'") && recipe.includes("--sy '400'") && recipe.includes("--format 'lbrn2'"), `getBoxesCliRecipe(TypeTray) wrong: ${recipe}`);

// 4c. Names checked against the real generator sources (only when the clone is present).
const generatorsDir = 'C:\\boxes\\boxes\\generators';
const sourceFiles: Record<string, string> = {
  UniversalBox: 'universalbox.py',
  ABox: 'abox.py',
  ClosedBox: 'closedbox.py',
  TypeTray: 'typetray.py',
  BinTray: 'bintray.py',
  FlexBox: 'flexbox.py',
};
if (fs.existsSync(generatorsDir)) {
  console.log('  Verifying argument names against C:\\boxes generators...');
  const common = new Set(getBoxesAcceptedArgs('NoSuchGenerator'));
  for (const gen of generators) {
    const src = fs.readFileSync(path.join(generatorsDir, sourceFiles[gen]), 'utf8');
    const real = new Set<string>();
    const build = /buildArgParser\(([\s\S]*?)\)\s*\n/.exec(src);
    if (build) {
      for (const m of build[1].matchAll(/"([A-Za-z_]+)"(?!\s*=)/g)) real.add(m[1]);
      for (const m of build[1].matchAll(/\b([A-Za-z_]+)\s*=/g)) real.add(m[1]);
    }
    for (const m of src.matchAll(/add_argument\(\s*"--([A-Za-z_]+)"/g)) real.add(m[1]);
    for (const key of BOXES_GENERATOR_ARGS[gen]) {
      assert(real.has(key), `${gen}: --${key} is not an argument of ${sourceFiles[gen]} (found: ${Array.from(real).join(', ')})`);
    }
    for (const key of common) assert(key.length > 0, 'common arg');
  }
} else {
  console.log('  (C:\\boxes clone not found, skipping the generator source cross-check)');
}

// 4d. Shell safety: nothing from data may become shell syntax.
console.log('  Testing PowerShell quoting...');
assert(psQuote("a'b") === "'a''b'", `psQuote must double single quotes, got ${psQuote("a'b")}`);
assert(psQuote('$(calc)`x') === "'$(calc)`x'", `psQuote must keep $() and backticks inert inside single quotes`);
assert(psQuote('\u2019; calc') === "'\u2019\u2019; calc'", `psQuote must double typographic quotes too`);
assert(buildBoxesCliArgs('UniversalBox', { x: 1, output: '$(calc).svg' }).every(a => !a.includes('$(')), `output with $() must be rejected`);
assert(buildBoxesCliArgs('UniversalBox', { x: 'abc' }).length === 0, `non numeric x must be dropped`);
assert(buildBoxesCliArgs('TypeTray', { sx: "1'; calc; '" }).length === 0, `bad sections must be dropped`);
assert(buildBoxesCliArgs('TypeTray', { x: 100 }).some(a => a === "--sx '100'"), `TypeTray must derive sx from x`);
const hostileRecipe = getBoxesCliRecipe('UniversalBox', { x: 100, y: 100, h: 100, 'evil; calc': 1 } as Record<string, string | number>, "x'; calc; '.svg");
assert(!hostileRecipe.includes('calc'), `hostile output name / argument must not reach the recipe: ${hostileRecipe}`);

// 5. Test generateProceduralCrateSvg
console.log('  Testing generateProceduralCrateSvg...');
// A: With packed items and custom bed options
const svgWithItems = generateProceduralCrateSvg(standardCrate, packedItems, {
  bedWidthMm: 2400,
  bedHeightMm: 1600,
});
assert(typeof svgWithItems === 'string' && svgWithItems.length > 0, `SVG output must be a non-empty string`);
assert(svgWithItems.includes('<svg'), `SVG markup missing <svg tag`);
assert(svgWithItems.includes('</svg>'), `SVG markup missing </svg> tag`);
assert(svgWithItems.includes('<rect'), `SVG markup missing <rect tag`);
assert(svgWithItems.includes('viewBox="0 0 2400 1600"'), `SVG markup missing expected viewBox`);
assert(svgWithItems.includes('stroke: #ef4444'), `SVG markup missing red laser cutting stroke #ef4444`);
assert(svgWithItems.includes('600 mm × 600 mm'), `SVG markup missing 600 mm × 600 mm panel dimensions`);
assert(svgWithItems.includes('Bottom Panel'), `SVG markup missing Bottom Panel`);
assert(svgWithItems.includes('Front Panel'), `SVG markup missing Front Panel`);
assert(svgWithItems.includes('Back Panel'), `SVG markup missing Back Panel`);
assert(svgWithItems.includes('Left Panel'), `SVG markup missing Left Panel`);
assert(svgWithItems.includes('Right Panel'), `SVG markup missing Right Panel`);
assert(svgWithItems.includes('Divider X#1'), `SVG markup missing Divider X#1 slat`);
assert(svgWithItems.includes('Divider Z#1'), `SVG markup missing Divider Z#1 slat`);
assert(/approximate/i.test(svgWithItems) && !/Boxes\.py (engine|standard)/i.test(svgWithItems), `SVG must be labelled as an approximate preview`);

// C: With highlightedItemId
const svgHighlighted = generateProceduralCrateSvg(standardCrate, packedItems, {
  bedWidthMm: 2400,
  bedHeightMm: 1600,
  highlightedItemId: 'payload-01',
});
assert(svgHighlighted.includes('slot-highlight'), `SVG markup missing slot-highlight class for highlighted item`);
assert(svgHighlighted.includes('highlight-compartment'), `SVG markup missing highlight-compartment for highlighted item pocket`);

// D: item names are data: they must be XML-escaped, never markup
console.log('  Testing XML escaping of item names...');
const evilName = `<img src=x onerror=alert(1)>]]></text><script>alert(2)</script>"'&`;
const evilItems: PackedItemSpec[] = [{ ...packedItems[0], id: 'evil', name: evilName }, packedItems[1]];
const svgEvil = generateProceduralCrateSvg(standardCrate, evilItems, { highlightedItemId: 'evil' });
assert(!svgEvil.includes('<img') && !svgEvil.includes('<script') && !svgEvil.includes('onerror=alert(1)>'), `item name leaked as markup into the SVG`);
assert(svgEvil.includes('&lt;img src=x onerror=alert(1)&gt;'), `item name must appear escaped`);
assert(escapeXml(`<>&"'`) === '&lt;&gt;&amp;&quot;&apos;', `escapeXml wrong: ${escapeXml(`<>&"'`)}`);
const svgBadNumbers = generateProceduralCrateSvg({ widthCm: NaN, lengthCm: Infinity, heightCm: -5 } as CrateDimensions, undefined, { bedWidthMm: NaN });
assert(!/NaN|Infinity|undefined/.test(svgBadNumbers), `non finite dimensions must not reach the SVG`);
assert(svgToDataUri(svgEvil).startsWith('data:image/svg+xml;charset=utf-8,') && !svgToDataUri(svgEvil).includes('<'), `svgToDataUri must percent-encode markup`);

// E: several crates in one document
const combined = combineCrateSvgs([
  { label: 'Crate <A>', svg: generateProceduralCrateSvg(standardCrate) },
  { label: 'Crate B', svg: generateProceduralCrateSvg(customCrate) },
]);
assert(combined.includes('id="crate-1"') && combined.includes('id="crate-2"'), `combined SVG must hold both crates`);
assert(combined.includes('Crate &lt;A&gt;') && !combined.includes('Crate <A>'), `combined labels must be escaped`);
assert((combined.match(/<\?xml/g) ?? []).length === 1 && (combined.match(/<svg /g) ?? []).length === 1, `combined SVG must have one xml header and one root svg`);

// F: LightBurn project structure
console.log('  Testing LightBurn project structure...');
const lbrn = generateLightBurnProjectXml(svgWithItems, { materialThickness: 6, cutSpeed: 20, cutPower: 85 });
assert(lbrn.startsWith('<?xml') && lbrn.includes('<LightBurnProject ') && lbrn.trimEnd().endsWith('</LightBurnProject>'), `LightBurn root element wrong`);
assert(!lbrn.includes('RawSvgData') && !lbrn.includes('CDATA'), `LightBurn project must not embed raw SVG`);
const pathShapes = (lbrn.match(/<Shape Type="Path" CutIndex="0">/g) ?? []).length;
const slotShapes = (lbrn.match(/<Shape Type="Path" CutIndex="1">/g) ?? []).length;
assert(pathShapes === 7, `Expected 7 outline paths (5 panels + 2 dividers), got ${pathShapes}`);
assert(slotShapes === 2, `Expected 2 slot paths (1 x 1 divider crossings), got ${slotShapes}`);
assert((lbrn.match(/<VertList>V/g) ?? []).length === pathShapes + slotShapes, `Every shape needs a VertList`);
assert((lbrn.match(/<PrimList>LineClosed<\/PrimList>/g) ?? []).length === pathShapes + slotShapes, `Every shape needs a closed PrimList`);
assert(!/<script|onerror|<img/i.test(lbrn), `LightBurn project leaked markup`);
let threw = false;
try { generateLightBurnProjectXml('<svg xmlns="http://www.w3.org/2000/svg"></svg>'); } catch { threw = true; }
assert(threw, `LightBurn export must refuse an SVG without cut geometry`);
const lbrnCombined = generateLightBurnProjectXml(combined);
const ys = Array.from(lbrnCombined.matchAll(/V-?[\d.]+ (-?[\d.]+)c0x1c1x1/g)).map(m => Number(m[1]));
assert(Math.max(...ys) > 1200, `Second crate must be offset below the first one in the combined project (max y ${Math.max(...ys)})`);

// 6. Test computeCutTelemetry
console.log('  Testing computeCutTelemetry...');
const telemetryStandard = computeCutTelemetry(standardCrate);
assert(telemetryStandard.panelCount === 5, `Expected 5 panels without items, got ${telemetryStandard.panelCount}`);
assert(telemetryStandard.totalAreaMm2 === 1800000, `Expected totalAreaMm2 = 1800000, got ${telemetryStandard.totalAreaMm2}`);
assert(telemetryStandard.totalPerimeterMm > 12000, `Expected totalPerimeterMm > 12000, got ${telemetryStandard.totalPerimeterMm}`);
assert(telemetryStandard.estCutTimeSec > 600, `Expected estCutTimeSec > 600s, got ${telemetryStandard.estCutTimeSec}`);
assert(telemetryStandard.nestingEfficiencyPct > 0 && telemetryStandard.nestingEfficiencyPct <= 100, `Invalid nesting efficiency: ${telemetryStandard.nestingEfficiencyPct}`);

const telemetryWithItems = computeCutTelemetry(standardCrate, packedItems, 2400, 1600);
assert(telemetryWithItems.panelCount === 7, `Expected 7 panels (5 crate + 2 dividers), got ${telemetryWithItems.panelCount}`);
assert(telemetryWithItems.bedAreaMm2 === 2400 * 1600, `Expected bedAreaMm2 = 3840000, got ${telemetryWithItems.bedAreaMm2}`);
assert(telemetryWithItems.totalAreaMm2 === 1800000 + 2 * (600 * 600), `Expected totalAreaMm2 with 2 dividers = 2520000, got ${telemetryWithItems.totalAreaMm2}`);
assert(telemetryWithItems.estCutTimeSec > telemetryStandard.estCutTimeSec, `Cut time with dividers should exceed standard crate cut time`);

// 7. Test getToolpathSegments
console.log('  Testing getToolpathSegments...');
const segments = getToolpathSegments(standardCrate, packedItems);
assert(Array.isArray(segments) && segments.length > 0, `Expected non-empty toolpath segments array`);
const cutSegments = segments.filter(s => s.isCut);
const rapidSegments = segments.filter(s => !s.isCut);
assert(cutSegments.length === 7 * 4, `Expected 28 cut segments (7 panels x 4 edges), got ${cutSegments.length}`);
assert(rapidSegments.length >= 7, `Expected rapid segments for each panel jump, got ${rapidSegments.length}`);

console.log('boxes-bridge checks passed');
