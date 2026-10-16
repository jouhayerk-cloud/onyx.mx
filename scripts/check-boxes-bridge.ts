/**
 * check-boxes-bridge.ts
 * Locked test harness for boxesBridge logistics and math engine.
 * Run via: npx tsx scripts/check-boxes-bridge.ts
 */

import {
  computeBoxesParams,
  formatBoxesCliCommand,
  generateProceduralCrateSvg,
  computeCutTelemetry,
  getToolpathSegments,
  CrateDimensions,
  PackedItemSpec,
} from '../src/lib/logistics/boxesBridge';

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
assert(cliWithItemsAndOutput.includes('--sx "200:400"'), `CLI command missing --sx "200:400"`);
assert(cliWithItemsAndOutput.includes('--sy "300:300"'), `CLI command missing --sy "300:300"`);
assert(cliWithItemsAndOutput.includes('--output "C:\\boxes\\output_crate.svg"'), `CLI command missing --output`);

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

// C: With highlightedItemId
const svgHighlighted = generateProceduralCrateSvg(standardCrate, packedItems, {
  bedWidthMm: 2400,
  bedHeightMm: 1600,
  highlightedItemId: 'payload-01',
});
assert(svgHighlighted.includes('slot-highlight'), `SVG markup missing slot-highlight class for highlighted item`);
assert(svgHighlighted.includes('highlight-compartment'), `SVG markup missing highlight-compartment for highlighted item pocket`);

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
