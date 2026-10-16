/**
 * boxesBridge.ts
 * Pure TypeScript bridge between Onyx-mx 3D crate coordinates and Boxes.py laser cutting parameters.
 * Zero external npm dependencies — runs seamlessly in browser and Node.js runtimes.
 *
 * Two different things live here and must not be confused:
 *  - the Boxes.py CLI recipes (computeBoxesParams / formatBoxesCliCommand / buildBoxesCliArgs): text the
 *    operator pastes on the laser PC, restricted to the arguments each generator really accepts;
 *  - generateProceduralCrateSvg: an Onyx-drawn approximate preview. It is NOT Boxes.py output (no joint
 *    fit check, no kerf in the paths): verify the real cutfile from boxes.exe before cutting.
 */

export interface CrateDimensions {
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  thicknessMm?: number;
  burnMm?: number;
}

export interface PackedItemSpec {
  id: string;
  name?: string;
  xCm: number;
  yCm: number;
  zCm: number;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
}

/** Boxes.py generators the recipes can name. Each one has its own argument list (BOXES_GENERATOR_ARGS). */
export type BoxesGeneratorName = 'UniversalBox' | 'ABox' | 'TypeTray' | 'BinTray' | 'FlexBox' | 'ClosedBox';

export interface BoxesGeneratorParams {
  generator: BoxesGeneratorName;
  x: number;
  y: number;
  h: number;
  thickness: number;
  burn: number;
  sx?: string;
  sy?: string;
  sh?: string;
  extraArgs?: Record<string, string | number>;
}

// ─── Safety helpers ──────────────────────────────────────────────────────────

/**
 * Escapes a value for XML text and attribute content (&, <, >, ", '), and drops characters XML 1.0 forbids.
 * Every string that comes from data (item names, ids, labels) must go through this before it is written
 * into generated SVG / LightBurn XML.
 */
export function escapeXml(value: unknown): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Coerces untrusted input to a finite number inside [min, max]; returns the fallback otherwise. */
function safeNum(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Crate side in cm, clamped to a sane workshop range so a bad row cannot produce a huge or NaN drawing. */
function safeCm(value: unknown, fallback: number): number {
  return safeNum(value, fallback, 1, 1000);
}

/**
 * Quotes a value as a PowerShell single-quoted literal: nothing inside it expands ($(), backticks, variables).
 * PowerShell also treats the typographic single quotes as quote characters, so those are doubled too.
 */
export function psQuote(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  const clean = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ');
  return `'${clean.replace(/['\u2018\u2019\u201A\u201B]/g, m => m + m)}'`;
}

// ─── Real Boxes.py CLI arguments per generator ───────────────────────────────

/**
 * Arguments every generator inherits from Boxes.__init__ ("Default Settings" group).
 * Source: C:\boxes\boxes\__init__.py, the add_argument calls of Boxes.__init__.
 */
const BOXES_COMMON_ARGS = ['thickness', 'burn', 'format', 'labels', 'reference', 'tabs', 'qr_code', 'inner_corners', 'spacing', 'debug', 'output'] as const;

/**
 * Generator-specific arguments (buildArgParser + add_argument in generators/<name>.py). The recipe builder
 * emits only keys from this table: Boxes.py exits with "unrecognized arguments" for anything else
 * (for instance --x/--y on TypeTray, whose size comes from --sx/--sy).
 */
export const BOXES_GENERATOR_ARGS: Record<BoxesGeneratorName, readonly string[]> = {
  UniversalBox: ['x', 'y', 'h', 'outside', 'top_edge', 'bottom_edge', 'vertical_edges'],
  ABox: ['x', 'y', 'h', 'outside', 'bottom_edge'],
  ClosedBox: ['x', 'y', 'h', 'outside'],
  TypeTray: ['sx', 'sy', 'h', 'hi', 'outside', 'bottom_edge', 'top_edge', 'back_height', 'radius', 'gripheight', 'gripwidth', 'handle', 'fingerholes'],
  BinTray: ['sx', 'y', 'sh', 'outside', 'hole_dD', 'front'],
  FlexBox: ['sx', 'y', 'h', 'outside', 'radius', 'latchsize'],
};

/** Arguments a generator accepts, generator-specific first, then the shared ones. */
export function getBoxesAcceptedArgs(generator: string): string[] {
  const own = (BOXES_GENERATOR_ARGS as Record<string, readonly string[]>)[generator] ?? [];
  return [...own, ...BOXES_COMMON_ARGS];
}

export function isBoxesGeneratorName(value: unknown): value is BoxesGeneratorName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BOXES_GENERATOR_ARGS, value);
}

type ArgKind = 'number' | 'sections' | 'bool' | 'enum' | 'output';

const ARG_KINDS: Record<string, { kind: ArgKind; min?: number; choices?: readonly string[] }> = {
  x: { kind: 'number', min: 0.1 },
  y: { kind: 'number', min: 0.1 },
  h: { kind: 'number', min: 0.1 },
  hi: { kind: 'number', min: 0 },
  thickness: { kind: 'number', min: 0.1 },
  burn: { kind: 'number', min: 0 },
  reference: { kind: 'number', min: 0 },
  tabs: { kind: 'number', min: 0 },
  back_height: { kind: 'number', min: 0 },
  radius: { kind: 'number', min: 0 },
  gripheight: { kind: 'number', min: 0 },
  gripwidth: { kind: 'number', min: 0 },
  front: { kind: 'number', min: 0 },
  latchsize: { kind: 'number', min: 0 },
  sx: { kind: 'sections' },
  sy: { kind: 'sections' },
  sh: { kind: 'sections' },
  hole_dD: { kind: 'sections' },
  spacing: { kind: 'sections' },
  outside: { kind: 'bool' },
  labels: { kind: 'bool' },
  qr_code: { kind: 'bool' },
  debug: { kind: 'bool' },
  handle: { kind: 'bool' },
  top_edge: { kind: 'enum', choices: Array.from('efFhcESŠikvLtGyY') },
  bottom_edge: { kind: 'enum', choices: Array.from('Fhse') },
  vertical_edges: { kind: 'enum', choices: ['finger joints', 'finger holes'] },
  fingerholes: { kind: 'enum', choices: ['none', 'inside-only', 'front', 'back', 'front-and-back'] },
  format: { kind: 'enum', choices: ['svg', 'svg_Ponoko', 'ps', 'lbrn2'] },
  inner_corners: { kind: 'enum', choices: ['loop', 'corner', 'backarc'] },
  output: { kind: 'output' },
};

/** True when `s` is a Boxes.py "sections" string (argparseSections): numbers, N*count, N/count, split by ':' or space. */
export function isValidBoxesSections(s: unknown): s is string {
  if (typeof s !== 'string' || s.length === 0 || s.length > 300) return false;
  const parts = s.split(/[\s:]+/).filter(Boolean);
  return parts.length > 0 && parts.every(part => /^\d+(\.\d+)?([*/]\d+)?$/.test(part));
}

function formatArgValue(key: string, raw: unknown): string | null {
  const spec = ARG_KINDS[key];
  if (!spec || raw === undefined || raw === null) return null;
  switch (spec.kind) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n < (spec.min ?? -Infinity) || n > 100000) return null;
      return String(Math.round(n * 1000) / 1000);
    }
    case 'sections':
      return isValidBoxesSections(raw) ? psQuote(raw) : null;
    case 'bool':
      return raw === true || raw === 1 || raw === '1' ? '1' : raw === false || raw === 0 || raw === '0' ? '0' : null;
    case 'enum':
      return typeof raw === 'string' && spec.choices?.includes(raw) ? psQuote(raw) : null;
    case 'output':
      // File name or path for the laser PC: no control characters, bounded, never an option-looking value.
      return typeof raw === 'string' && /^[\w .\\:/()-]{1,200}$/.test(raw) && !raw.startsWith('-') ? psQuote(raw) : null;
    default:
      return null;
  }
}

/**
 * Builds the `--key value` list for one generator. Only arguments that generator accepts are emitted, every
 * value is validated (numbers, sections strings, fixed choices, file names) and quoted for PowerShell, so
 * item names or ids can never turn into extra shell syntax.
 * TypeTray / BinTray / FlexBox size themselves from sections: when sx / sy / sh are missing they default to
 * a single section equal to the box side (sections are outside measurements while `outside` stays at its default).
 */
export function buildBoxesCliArgs(generator: string, values: Record<string, unknown>): string[] {
  const accepted = getBoxesAcceptedArgs(generator);
  const v: Record<string, unknown> = { ...values };
  if (accepted.includes('sx') && v.sx === undefined && v.x !== undefined) v.sx = String(v.x);
  if (accepted.includes('sy') && v.sy === undefined && v.y !== undefined) v.sy = String(v.y);
  if (accepted.includes('sh') && v.sh === undefined && v.h !== undefined) v.sh = String(v.h);

  const out: string[] = [];
  for (const key of accepted) {
    const formatted = formatArgValue(key, v[key]);
    if (formatted !== null) out.push(`--${key} ${formatted}`);
  }
  return out;
}

/**
 * Helper to extract unique, sorted cut boundaries (in cm) and derive relative step intervals (in mm).
 */
function deriveIntervalsFromCuts(
  totalDimensionCm: number,
  cutsSet: Set<number>
): string {
  cutsSet.add(0);
  cutsSet.add(totalDimensionCm);

  // Sort ascending and filter out near-duplicates within floating-point tolerance
  const sorted = Array.from(cutsSet).sort((a, b) => a - b);
  const cleaned: number[] = [];
  for (const pt of sorted) {
    if (cleaned.length === 0 || Math.abs(pt - cleaned[cleaned.length - 1]) > 0.001) {
      cleaned.push(pt);
    }
  }

  const intervalsMm: number[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    const diffMm = (cleaned[i + 1] - cleaned[i]) * 10;
    // Format cleanly to max 2 decimals without floating point artifacts
    const rounded = Math.round(diffMm * 100) / 100;
    intervalsMm.push(rounded);
  }

  return intervalsMm.join(':');
}

/**
 * Computes Boxes.py generation parameters from Onyx-mx 3D crate dimensions and packed items.
 * Converts cm to mm (10x scaling).
 * When items are provided, extracts cut boundaries along X (width) and Z (length/depth)
 * to configure divider grid intervals (sx and sy) for Boxes.py TypeTray.
 */
export function computeBoxesParams(
  crate: CrateDimensions,
  items?: PackedItemSpec[]
): BoxesGeneratorParams {
  const widthCm = safeCm(crate.widthCm, 60);
  const lengthCm = safeCm(crate.lengthCm, 60);
  const heightCm = safeCm(crate.heightCm, 40);
  const x = Math.round(widthCm * 10 * 100) / 100;
  const y = Math.round(lengthCm * 10 * 100) / 100;
  const h = Math.round(heightCm * 10 * 100) / 100;
  const thickness = safeNum(crate.thicknessMm, 6, 0.5, 50);
  const burn = safeNum(crate.burnMm, 0.1, 0, 2);

  if (!items || items.length === 0) {
    return {
      generator: 'UniversalBox',
      x,
      y,
      h,
      thickness,
      burn,
    };
  }

  // Extract unique X boundaries from items
  const xCuts = new Set<number>();
  for (const item of items) {
    const startX = safeNum(item.xCm, 0);
    const endX = startX + safeNum(item.widthCm, 0);
    if (startX > 0 && startX < widthCm) xCuts.add(startX);
    if (endX > 0 && endX < widthCm) xCuts.add(endX);
  }

  // Extract unique Z (length/depth) boundaries from items
  const zCuts = new Set<number>();
  for (const item of items) {
    const startZ = safeNum(item.zCm, 0);
    const endZ = startZ + safeNum(item.lengthCm, 0);
    if (startZ > 0 && startZ < lengthCm) zCuts.add(startZ);
    if (endZ > 0 && endZ < lengthCm) zCuts.add(endZ);
  }

  const sx = deriveIntervalsFromCuts(widthCm, xCuts);
  const sy = deriveIntervalsFromCuts(lengthCm, zCuts);

  return {
    generator: 'TypeTray',
    x,
    y,
    h,
    thickness,
    burn,
    sx,
    sy,
  };
}

/** Default boxes.exe location of the laser PC (Windows venv install). An assumption, not something the web app can verify. */
export const BOXES_EXE_PATH = 'C:\\boxes\\.venv\\Scripts\\boxes.exe';

/**
 * Formats a ready-to-run Windows PowerShell CLI command for boxes.exe with $env:PYTHONUTF8=1.
 * Only arguments the chosen generator accepts are written (TypeTray: --sx --sy --h; FlexBox: --sx --y --h; ...),
 * and every value is validated and single-quoted, so the line is safe to paste whatever the data contained.
 */
export function formatBoxesCliCommand(
  params: BoxesGeneratorParams,
  outputFile?: string
): string {
  const generator = isBoxesGeneratorName(params.generator) ? params.generator : 'UniversalBox';
  const accepted = new Set(getBoxesAcceptedArgs(generator));
  const values: Record<string, unknown> = {
    x: params.x,
    y: params.y,
    h: params.h,
    sx: params.sx,
    sy: params.sy,
    sh: params.sh,
    thickness: params.thickness,
    burn: params.burn,
    output: outputFile,
  };
  if (params.extraArgs) {
    for (const [key, value] of Object.entries(params.extraArgs)) {
      // Extra arguments cannot override the computed geometry and must exist on this generator.
      if (accepted.has(key) && !(key in values && values[key] !== undefined)) values[key] = value;
    }
  }
  return ['$env:PYTHONUTF8=1;', BOXES_EXE_PATH, generator, ...buildBoxesCliArgs(generator, values)].join(' ');
}

/**
 * Generates an SVG path string for a finger-jointed panel rectangle.
 * Supports tabs (protruding outward by thickness), slots (notched inward), or flat edges.
 */
function generatePanelPath(
  x: number,
  y: number,
  w: number,
  h: number,
  thickness: number,
  edges: {
    top: 'flat' | 'tabs' | 'slots';
    right: 'flat' | 'tabs' | 'slots';
    bottom: 'flat' | 'tabs' | 'slots';
    left: 'flat' | 'tabs' | 'slots';
  }
): string {
  const targetPitch = Math.max(thickness * 3, 20);

  const buildEdge = (
    startX: number,
    startY: number,
    len: number,
    dx: number,
    dy: number,
    nx: number,
    ny: number,
    type: 'flat' | 'tabs' | 'slots'
  ): string => {
    if (type === 'flat') {
      const endX = startX + len * dx;
      const endY = startY + len * dy;
      return `L ${endX.toFixed(2)} ${endY.toFixed(2)}`;
    }

    const numTabs = Math.max(1, Math.round(len / (targetPitch * 2)));
    const numSegments = numTabs * 2 + 1;
    const segLen = len / numSegments;
    const offset = type === 'tabs' ? thickness : -thickness;

    let path = '';
    for (let i = 0; i < numSegments; i++) {
      const p1X = startX + i * segLen * dx;
      const p1Y = startY + i * segLen * dy;
      const p2X = startX + (i + 1) * segLen * dx;
      const p2Y = startY + (i + 1) * segLen * dy;

      if (i % 2 === 0) {
        // Baseline segment
        path += ` L ${p2X.toFixed(2)} ${p2Y.toFixed(2)}`;
      } else {
        // Tab or slot protrusion/recession
        const tab1X = p1X + nx * offset;
        const tab1Y = p1Y + ny * offset;
        const tab2X = p2X + nx * offset;
        const tab2Y = p2Y + ny * offset;
        path += ` L ${tab1X.toFixed(2)} ${tab1Y.toFixed(2)} L ${tab2X.toFixed(2)} ${tab2Y.toFixed(2)} L ${p2X.toFixed(2)} ${p2Y.toFixed(2)}`;
      }
    }
    return path;
  };

  // Top edge (dx=1, dy=0, normal pointing outward up: nx=0, ny=-1)
  const topD = buildEdge(x, y, w, 1, 0, 0, -1, edges.top);
  // Right edge (dx=0, dy=1, normal pointing outward right: nx=1, ny=0)
  const rightD = buildEdge(x + w, y, h, 0, 1, 1, 0, edges.right);
  // Bottom edge (dx=-1, dy=0, normal pointing outward down: nx=0, ny=1)
  const bottomD = buildEdge(x + w, y + h, w, -1, 0, 0, 1, edges.bottom);
  // Left edge (dx=0, dy=-1, normal pointing outward left: nx=-1, ny=0)
  const leftD = buildEdge(x, y + h, h, 0, -1, -1, 0, edges.left);

  return `M ${x.toFixed(2)} ${y.toFixed(2)} ${topD} ${rightD} ${bottomD} ${leftD} Z`;
}

export interface CutTelemetry {
  totalPerimeterMm: number;
  totalAreaMm2: number;
  bedAreaMm2: number;
  nestingEfficiencyPct: number;
  estCutTimeSec: number;
  panelCount: number;
}

export interface ToolpathSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthMm: number;
  isCut: boolean;
  panelId?: string;
}

/** Crate geometry in mm, sanitised: every drawing / telemetry function starts from this. */
interface CrateGeometry {
  W: number;
  L: number;
  H: number;
  T: number;
  burn: number;
  widthCm: number;
  lengthCm: number;
}

function resolveCrateGeometry(crate: CrateDimensions): CrateGeometry {
  const widthCm = safeCm(crate.widthCm, 60);
  const lengthCm = safeCm(crate.lengthCm, 60);
  const heightCm = safeCm(crate.heightCm, 40);
  return {
    W: Math.round(widthCm * 10 * 100) / 100,
    L: Math.round(lengthCm * 10 * 100) / 100,
    H: Math.round(heightCm * 10 * 100) / 100,
    T: safeNum(crate.thicknessMm, 6, 0.5, 50),
    burn: safeNum(crate.burnMm, 0.1, 0, 2),
    widthCm,
    lengthCm,
  };
}

/** Unique internal divider positions in mm along the width (x) and length (z), from the item edges. */
function computeInternalCutsMm(geo: CrateGeometry, items?: PackedItemSpec[]): { x: number[]; z: number[] } {
  if (!items || items.length === 0) return { x: [], z: [] };
  const xSet = new Set<number>();
  const zSet = new Set<number>();
  for (const item of items) {
    const xCm = safeNum(item.xCm, 0);
    const zCm = safeNum(item.zCm, 0);
    if (xCm > 0 && xCm < geo.widthCm) xSet.add(xCm * 10);
    const endX = (xCm + safeNum(item.widthCm, 0)) * 10;
    if (endX > 0 && endX < geo.W) xSet.add(endX);

    if (zCm > 0 && zCm < geo.lengthCm) zSet.add(zCm * 10);
    const endZ = (zCm + safeNum(item.lengthCm, 0)) * 10;
    if (endZ > 0 && endZ < geo.L) zSet.add(endZ);
  }
  return {
    x: Array.from(xSet).sort((a, b) => a - b),
    z: Array.from(zSet).sort((a, b) => a - b),
  };
}

/**
 * Generates complete, valid SVG markup representing 2D unfolded crate panels
 * (Bottom, Left, Right, Front, Back, and divider slats).
 * Includes laser cutting paths (red stroke #ef4444), finger joint tabs, dimension callouts,
 * laser bed boundary, and optional highlighted item pocket/slots.
 */
export function generateProceduralCrateSvg(
  crate: CrateDimensions,
  items?: PackedItemSpec[],
  options?: { bedWidthMm?: number; bedHeightMm?: number; highlightedItemId?: string }
): string {
  const geo = resolveCrateGeometry(crate);
  const { W, L, H, T, burn } = geo;

  // Extract internal divider positions (in mm)
  const internalXCutsMm: number[] = [];
  const internalZCutsMm: number[] = [];

  {
    const cuts = computeInternalCutsMm(geo, items);
    internalXCutsMm.push(...cuts.x);
    internalZCutsMm.push(...cuts.z);
  }

  // Highlighted item calculation
  const highlightedItem = items?.find(it => String(it.id) === String(options?.highlightedItemId));
  const hxCm = highlightedItem ? safeNum(highlightedItem.xCm, 0) : 0;
  const hzCm = highlightedItem ? safeNum(highlightedItem.zCm, 0) : 0;
  const highXMin = highlightedItem ? Math.round(hxCm * 10 * 100) / 100 : null;
  const highXMax = highlightedItem ? Math.round((hxCm + safeNum(highlightedItem.widthCm, 0)) * 10 * 100) / 100 : null;
  const highZMin = highlightedItem ? Math.round(hzCm * 10 * 100) / 100 : null;
  const highZMax = highlightedItem ? Math.round((hzCm + safeNum(highlightedItem.lengthCm, 0)) * 10 * 100) / 100 : null;

  // Panel layout positioning
  const gap = 30;
  const margin = 50;

  // Column 1: Left and Right panels (Length x Height)
  const col1X = margin;
  const leftPanelY = margin;
  const rightPanelY = margin + H + gap;

  // Column 2: Front, Bottom, Back panels (Width x Height, Width x Length, Width x Height)
  const col2X = col1X + L + gap;
  const frontPanelY = margin;
  const bottomPanelY = margin + H + gap;
  const backPanelY = bottomPanelY + L + gap;

  // Column 3: Divider slats (if any)
  const col3X = col2X + W + gap;
  let dividerY = margin;
  const dividerHeight = H;

  // Compute total layout dimensions
  const col1Height = margin + 2 * H + gap + margin;
  const col2Height = backPanelY + H + margin;
  let maxDividerWidth = 0;
  let col3Height = margin;

  const totalDividers = internalXCutsMm.length + internalZCutsMm.length;
  if (totalDividers > 0) {
    maxDividerWidth = Math.max(W, L);
    col3Height = margin + totalDividers * (dividerHeight + gap) + margin;
  }

  const contentWidth = totalDividers > 0 ? col3X + maxDividerWidth + margin : col2X + W + margin;
  const contentHeight = Math.max(col1Height, col2Height, col3Height);

  const bedWidth = Math.round(safeNum(options?.bedWidthMm, Math.max(1200, Math.ceil(contentWidth)), 100, 20000));
  const bedHeight = Math.round(safeNum(options?.bedHeightMm, Math.max(900, Math.ceil(contentHeight)), 100, 20000));

  // Build panels
  const svgParts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bedWidth} ${bedHeight}" width="${bedWidth}mm" height="${bedHeight}mm">`,
    `  <title>Onyx crate cutfile preview</title>`,
    `  <desc>Approximate drawing generated by Onyx from the crate size. Not Boxes.py output: no joint fit check and no kerf compensation in the paths. Verify with a real Boxes.py cutfile before cutting.</desc>`,
    `  <defs>`,
    `    <style>`,
    `      .laser-cut { stroke: #ef4444; fill: none; stroke-width: 1.0; stroke-linecap: round; stroke-linejoin: round; }`,
    `      .panel-card { fill: #f8fafc; stroke: #e2e8f0; stroke-width: 0.8; }`,
    `      .laser-bed { fill: #0f172a; fill-opacity: 0.02; stroke: #94a3b8; stroke-width: 1.5; stroke-dasharray: 8 4; }`,
    `      .title-text { font-family: system-ui, -apple-system, sans-serif; font-size: 15px; font-weight: 700; fill: #1e293b; }`,
    `      .dim-text { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; fill: #64748b; }`,
    `      .slot-cut { fill: #fee2e2; stroke: #ef4444; stroke-width: 0.9; }`,
    `      .slot-highlight { fill: #06b6d4 !important; stroke: #38bdf8 !important; stroke-width: 2.0 !important; filter: drop-shadow(0 0 6px #06b6d4); }`,
    `      .divider-highlight { stroke: #f59e0b !important; stroke-width: 1.8 !important; filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.7)); }`,
    `      .highlight-compartment { fill: rgba(6, 182, 212, 0.14); stroke: #06b6d4; stroke-width: 1.6; stroke-dasharray: 4 3; }`,
    `    </style>`,
    `  </defs>`,
    ``,
    `  <!-- Laser Bed Boundary -->`,
    `  <rect class="laser-bed" id="laser-bed" x="10" y="10" width="${bedWidth - 20}" height="${bedHeight - 20}" rx="6" />`,
    `  <text x="25" y="35" class="dim-text" font-weight="600">ONYX PREVIEW, approximate (not Boxes.py output) | Bed ${bedWidth} mm × ${bedHeight} mm | Kerf label: ${burn}mm | Thickness: ${T}mm</text>`,
  ];
  if (contentWidth > bedWidth || contentHeight > bedHeight) {
    svgParts.push(
      `  <text x="25" y="55" class="dim-text" font-weight="700" fill="#dc2626">WARNING: layout ${Math.ceil(contentWidth)} mm × ${Math.ceil(contentHeight)} mm is larger than the bed. Split the parts or use a bigger bed.</text>`
    );
  }
  svgParts.push(``);

  // Helper to render panel with card, laser path, and dimension text
  const renderPanel = (
    id: string,
    label: string,
    px: number,
    py: number,
    pw: number,
    ph: number,
    edges: {
      top: 'flat' | 'tabs' | 'slots';
      right: 'flat' | 'tabs' | 'slots';
      bottom: 'flat' | 'tabs' | 'slots';
      left: 'flat' | 'tabs' | 'slots';
    }
  ) => {
    const pathD = generatePanelPath(px, py, pw, ph, T, edges);
    svgParts.push(`  <!-- Panel: ${label} -->`);
    svgParts.push(`  <g id="panel-${id}">`);
    svgParts.push(`    <rect class="panel-card" x="${px}" y="${py}" width="${pw}" height="${ph}" rx="3" />`);
    svgParts.push(`    <path class="laser-cut" d="${pathD}" />`);
    svgParts.push(`    <text class="title-text" x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2 - 8).toFixed(1)}" text-anchor="middle">${label}</text>`);
    svgParts.push(`    <text class="dim-text" x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2 + 14).toFixed(1)}" text-anchor="middle">${pw} mm × ${ph} mm</text>`);
    if (id === 'bottom' && highlightedItem && highXMin !== null && highXMax !== null && highZMin !== null && highZMax !== null) {
      const pocketX = px + highXMin;
      const pocketY = py + highZMin;
      const pocketW = Math.max(10, highXMax - highXMin);
      const pocketH = Math.max(10, highZMax - highZMin);
      svgParts.push(`    <!-- Highlighted Item Pocket -->`);
      svgParts.push(`    <rect class="highlight-compartment" x="${pocketX.toFixed(2)}" y="${pocketY.toFixed(2)}" width="${pocketW.toFixed(2)}" height="${pocketH.toFixed(2)}" rx="2" />`);
      svgParts.push(`    <text x="${(pocketX + pocketW / 2).toFixed(1)}" y="${(pocketY + pocketH / 2 + 4).toFixed(1)}" fill="#06b6d4" font-size="11" font-weight="700" text-anchor="middle">${escapeXml(String(highlightedItem.name || 'Slot').slice(0, 60))}</text>`);
    }
    svgParts.push(`  </g>`);
    svgParts.push(``);
  };

  // 1. Bottom Panel (W x L) - tabs on all 4 sides
  renderPanel('bottom', 'Bottom Panel', col2X, bottomPanelY, W, L, {
    top: 'tabs',
    right: 'tabs',
    bottom: 'tabs',
    left: 'tabs',
  });

  // 2. Front Panel (W x H) - top flat, sides tabs, bottom slots (into bottom panel)
  renderPanel('front', 'Front Panel', col2X, frontPanelY, W, H, {
    top: 'flat',
    right: 'tabs',
    bottom: 'slots',
    left: 'tabs',
  });

  // 3. Back Panel (W x H) - top flat, sides tabs, bottom slots (into bottom panel)
  renderPanel('back', 'Back Panel', col2X, backPanelY, W, H, {
    top: 'flat',
    right: 'tabs',
    bottom: 'slots',
    left: 'tabs',
  });

  // 4. Left Panel (L x H) - top flat, sides slots, bottom slots
  renderPanel('left', 'Left Panel', col1X, leftPanelY, L, H, {
    top: 'flat',
    right: 'slots',
    bottom: 'slots',
    left: 'slots',
  });

  // 5. Right Panel (L x H) - top flat, sides slots, bottom slots
  renderPanel('right', 'Right Panel', col1X, rightPanelY, L, H, {
    top: 'flat',
    right: 'slots',
    bottom: 'slots',
    left: 'slots',
  });

  // 6. Divider Slats (if items provided)
  // X-cut dividers: slat runs along length L, with height H, slotted where Z cuts intersect
  internalXCutsMm.forEach((xPos, idx) => {
    const slatW = L;
    const slatH = H;
    const slatX = col3X;
    const slatY = dividerY;
    dividerY += slatH + gap;

    const isDividerHighlighted = highXMin !== null && highXMax !== null && (
      Math.abs(xPos - highXMin) < 2 || Math.abs(xPos - highXMax) < 2
    );

    svgParts.push(`  <!-- Divider along length at X = ${xPos}mm -->`);
    svgParts.push(`  <g id="divider-x-${idx + 1}">`);
    svgParts.push(`    <rect class="panel-card" x="${slatX}" y="${slatY}" width="${slatW}" height="${slatH}" rx="3" />`);
    // Outer perimeter of slat
    const pathD = generatePanelPath(slatX, slatY, slatW, slatH, T, {
      top: 'flat',
      right: 'slots',
      bottom: 'slots',
      left: 'slots',
    });
    const cutClass = isDividerHighlighted ? 'laser-cut divider-highlight' : 'laser-cut';
    svgParts.push(`    <path class="${cutClass}" d="${pathD}" />`);

    // Interlocking half-height slots from top down for orthogonal Z dividers
    for (const zPos of internalZCutsMm) {
      const slotX = slatX + zPos - T / 2;
      const slotHeight = slatH / 2;
      const isSlotHighlighted = highZMin !== null && highZMax !== null && (
        Math.abs(zPos - highZMin) < 2 || Math.abs(zPos - highZMax) < 2
      );
      const slotClass = isSlotHighlighted ? 'slot-cut slot-highlight' : 'slot-cut';
      svgParts.push(`    <rect class="${slotClass}" x="${slotX.toFixed(2)}" y="${slatY.toFixed(2)}" width="${T}" height="${slotHeight.toFixed(2)}" />`);
    }

    svgParts.push(`    <text class="title-text" x="${(slatX + slatW / 2).toFixed(1)}" y="${(slatY + slatH * 0.75).toFixed(1)}" text-anchor="middle">Divider X#${idx + 1} (Pos: ${xPos} mm)</text>`);
    svgParts.push(`    <text class="dim-text" x="${(slatX + slatW / 2).toFixed(1)}" y="${(slatY + slatH * 0.75 + 18).toFixed(1)}" text-anchor="middle">${slatW} mm × ${slatH} mm</text>`);
    svgParts.push(`  </g>`);
    svgParts.push(``);
  });

  // Z-cut dividers: slat runs along width W, with height H, slotted from bottom up where X cuts intersect
  internalZCutsMm.forEach((zPos, idx) => {
    const slatW = W;
    const slatH = H;
    const slatX = col3X;
    const slatY = dividerY;
    dividerY += slatH + gap;

    const isDividerHighlighted = highZMin !== null && highZMax !== null && (
      Math.abs(zPos - highZMin) < 2 || Math.abs(zPos - highZMax) < 2
    );

    svgParts.push(`  <!-- Divider along width at Z = ${zPos}mm -->`);
    svgParts.push(`  <g id="divider-z-${idx + 1}">`);
    svgParts.push(`    <rect class="panel-card" x="${slatX}" y="${slatY}" width="${slatW}" height="${slatH}" rx="3" />`);
    // Outer perimeter of slat
    const pathD = generatePanelPath(slatX, slatY, slatW, slatH, T, {
      top: 'flat',
      right: 'slots',
      bottom: 'slots',
      left: 'slots',
    });
    const cutClass = isDividerHighlighted ? 'laser-cut divider-highlight' : 'laser-cut';
    svgParts.push(`    <path class="${cutClass}" d="${pathD}" />`);

    // Interlocking half-height slots from bottom up for orthogonal X dividers
    for (const xPos of internalXCutsMm) {
      const slotX = slatX + xPos - T / 2;
      const slotHeight = slatH / 2;
      const slotY = slatY + slatH - slotHeight;
      const isSlotHighlighted = highXMin !== null && highXMax !== null && (
        Math.abs(xPos - highXMin) < 2 || Math.abs(xPos - highXMax) < 2
      );
      const slotClass = isSlotHighlighted ? 'slot-cut slot-highlight' : 'slot-cut';
      svgParts.push(`    <rect class="${slotClass}" x="${slotX.toFixed(2)}" y="${slotY.toFixed(2)}" width="${T}" height="${slotHeight.toFixed(2)}" />`);
    }

    svgParts.push(`    <text class="title-text" x="${(slatX + slatW / 2).toFixed(1)}" y="${(slatY + slatH * 0.25).toFixed(1)}" text-anchor="middle">Divider Z#${idx + 1} (Pos: ${zPos} mm)</text>`);
    svgParts.push(`    <text class="dim-text" x="${(slatX + slatW / 2).toFixed(1)}" y="${(slatY + slatH * 0.25 + 18).toFixed(1)}" text-anchor="middle">${slatW} mm × ${slatH} mm</text>`);
    svgParts.push(`  </g>`);
    svgParts.push(``);
  });

  svgParts.push(`</svg>`);

  return svgParts.join('\n');
}

/**
 * Calculates fabrication telemetry for laser cut crate stencils:
 * total cut perimeter (mm), panel area (mm²), bed area (mm²),
 * nesting efficiency (%), estimated cut time (sec at 20 mm/s standard feed rate), and panel count.
 */
export function computeCutTelemetry(
  crate: CrateDimensions,
  items?: PackedItemSpec[],
  bedWidthMm?: number,
  bedHeightMm?: number
): CutTelemetry {
  const geo = resolveCrateGeometry(crate);
  const { W, L, H, T } = geo;

  // Extract internal divider cuts
  const internalXCutsMm: number[] = [];
  const internalZCutsMm: number[] = [];

  {
    const cuts = computeInternalCutsMm(geo, items);
    internalXCutsMm.push(...cuts.x);
    internalZCutsMm.push(...cuts.z);
  }

  const numXDividers = internalXCutsMm.length;
  const numZDividers = internalZCutsMm.length;
  const panelCount = 5 + numXDividers + numZDividers;

  // Panel areas (bounding mm²)
  const bottomArea = W * L;
  const wallFrontBackArea = 2 * (W * H);
  const wallLeftRightArea = 2 * (L * H);
  const xDividersArea = numXDividers * (L * H);
  const zDividersArea = numZDividers * (W * H);
  const totalAreaMm2 = Math.round(bottomArea + wallFrontBackArea + wallLeftRightArea + xDividersArea + zDividersArea);

  // Helper for finger-joint edge cut length
  const computeEdgeLength = (len: number, type: 'flat' | 'tabs' | 'slots') => {
    if (type === 'flat') return len;
    const targetPitch = Math.max(T * 3, 20);
    const numTabs = Math.max(1, Math.round(len / (targetPitch * 2)));
    return len + numTabs * 2 * T;
  };

  // Perimeter for bottom (4 tabbed edges: 2 W, 2 L)
  const bottomPerimeter = 2 * computeEdgeLength(W, 'tabs') + 2 * computeEdgeLength(L, 'tabs');

  // Perimeter for front & back (top flat, bottom slots, sides tabs)
  const frontBackPerimeter = 2 * (
    W + computeEdgeLength(W, 'slots') + 2 * computeEdgeLength(H, 'tabs')
  );

  // Perimeter for left & right (top flat, bottom slots, sides slots)
  const leftRightPerimeter = 2 * (
    L + computeEdgeLength(L, 'slots') + 2 * computeEdgeLength(H, 'slots')
  );

  // Perimeter for X dividers (slat L x H, top flat with Z-slots, 3 slotted edges)
  const xDividerSinglePerimeter = L + computeEdgeLength(L, 'slots') + 2 * computeEdgeLength(H, 'slots') + (numZDividers * H);
  const xDividersPerimeter = numXDividers * xDividerSinglePerimeter;

  // Perimeter for Z dividers (slat W x H, top flat with X-slots, 3 slotted edges)
  const zDividerSinglePerimeter = W + computeEdgeLength(W, 'slots') + 2 * computeEdgeLength(H, 'slots') + (numXDividers * H);
  const zDividersPerimeter = numZDividers * zDividerSinglePerimeter;

  const totalPerimeterMm = Math.round(
    bottomPerimeter + frontBackPerimeter + leftRightPerimeter + xDividersPerimeter + zDividersPerimeter
  );

  // Layout bounds to calculate bed area
  const gap = 30;
  const margin = 50;
  const col1Height = margin + 2 * H + gap + margin;
  const backPanelY = margin + H + gap + L + gap;
  const col2Height = backPanelY + H + margin;
  const totalDividers = numXDividers + numZDividers;
  let maxDividerWidth = 0;
  let col3Height = margin;
  if (totalDividers > 0) {
    maxDividerWidth = Math.max(W, L);
    col3Height = margin + totalDividers * (H + gap) + margin;
  }
  const col1X = margin;
  const col2X = col1X + L + gap;
  const col3X = col2X + W + gap;
  const contentWidth = totalDividers > 0 ? col3X + maxDividerWidth + margin : col2X + W + margin;
  const contentHeight = Math.max(col1Height, col2Height, col3Height);

  const bedW = bedWidthMm ?? Math.max(1200, Math.ceil(contentWidth));
  const bedH = bedHeightMm ?? Math.max(900, Math.ceil(contentHeight));
  const bedAreaMm2 = Math.round(bedW * bedH);

  const nestingEfficiencyPct = bedAreaMm2 > 0
    ? Math.min(100, Math.round((totalAreaMm2 / bedAreaMm2) * 1000) / 10)
    : 0;

  // Standard 20 mm/s laser cut feed rate
  const standardFeedRate = 20;
  const estCutTimeSec = Math.round(totalPerimeterMm / standardFeedRate);

  return {
    totalPerimeterMm,
    totalAreaMm2,
    bedAreaMm2,
    nestingEfficiencyPct,
    estCutTimeSec,
    panelCount,
  };
}

/**
 * Returns sequential CNC toolpath segments (cutting perimeters and rapid traverse moves)
 * for animating laser head trace simulation across bed layout.
 */
export function getToolpathSegments(
  crate: CrateDimensions,
  items?: PackedItemSpec[]
): ToolpathSegment[] {
  const geo = resolveCrateGeometry(crate);
  const { W, L, H } = geo;

  const internalXCutsMm: number[] = [];
  const internalZCutsMm: number[] = [];
  {
    const cuts = computeInternalCutsMm(geo, items);
    internalXCutsMm.push(...cuts.x);
    internalZCutsMm.push(...cuts.z);
  }

  const gap = 30;
  const margin = 50;

  const col1X = margin;
  const leftPanelY = margin;
  const rightPanelY = margin + H + gap;

  const col2X = col1X + L + gap;
  const frontPanelY = margin;
  const bottomPanelY = margin + H + gap;
  const backPanelY = bottomPanelY + L + gap;

  const col3X = col2X + W + gap;
  let dividerY = margin;

  const panels: { id: string; x: number; y: number; w: number; h: number }[] = [
    { id: 'left', x: col1X, y: leftPanelY, w: L, h: H },
    { id: 'right', x: col1X, y: rightPanelY, w: L, h: H },
    { id: 'front', x: col2X, y: frontPanelY, w: W, h: H },
    { id: 'bottom', x: col2X, y: bottomPanelY, w: W, h: L },
    { id: 'back', x: col2X, y: backPanelY, w: W, h: H },
  ];

  internalXCutsMm.forEach((_, idx) => {
    panels.push({ id: `div-x-${idx + 1}`, x: col3X, y: dividerY, w: L, h: H });
    dividerY += H + gap;
  });

  internalZCutsMm.forEach((_, idx) => {
    panels.push({ id: `div-z-${idx + 1}`, x: col3X, y: dividerY, w: W, h: H });
    dividerY += H + gap;
  });

  const segments: ToolpathSegment[] = [];
  let currentHead = { x: 10, y: 10 };

  for (const p of panels) {
    // Rapid move to panel top-left
    const rapidLen = Math.hypot(p.x - currentHead.x, p.y - currentHead.y);
    if (rapidLen > 1) {
      segments.push({
        x1: currentHead.x,
        y1: currentHead.y,
        x2: p.x,
        y2: p.y,
        lengthMm: Math.round(rapidLen),
        isCut: false,
        panelId: p.id,
      });
    }

    // Top edge: (x, y) -> (x + w, y)
    segments.push({ x1: p.x, y1: p.y, x2: p.x + p.w, y2: p.y, lengthMm: p.w, isCut: true, panelId: p.id });
    // Right edge: (x + w, y) -> (x + w, y + h)
    segments.push({ x1: p.x + p.w, y1: p.y, x2: p.x + p.w, y2: p.y + p.h, lengthMm: p.h, isCut: true, panelId: p.id });
    // Bottom edge: (x + w, y + h) -> (x, y + h)
    segments.push({ x1: p.x + p.w, y1: p.y + p.h, x2: p.x, y2: p.y + p.h, lengthMm: p.w, isCut: true, panelId: p.id });
    // Left edge: (x, y + h) -> (x, y)
    segments.push({ x1: p.x, y1: p.y + p.h, x2: p.x, y2: p.y, lengthMm: p.h, isCut: true, panelId: p.id });

    currentHead = { x: p.x, y: p.y };
  }

  // Rapid return home
  const returnLen = Math.hypot(10 - currentHead.x, 10 - currentHead.y);
  if (returnLen > 1) {
    segments.push({
      x1: currentHead.x,
      y1: currentHead.y,
      x2: 10,
      y2: 10,
      lengthMm: Math.round(returnLen),
      isCut: false,
    });
  }

  return segments;
}

// ─── Preview + multi-crate helpers ───────────────────────────────────────────

/**
 * Wraps SVG markup in a data URI for `<img src>`. An image never runs scripts or event handlers, so this is
 * the way to show generated SVG in the UI: never put SVG strings in dangerouslySetInnerHTML.
 */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Stacks several crate drawings (each from generateProceduralCrateSvg) in one SVG, one under the other,
 * each in its own translated group with a label. Labels are XML-escaped; ids are prefixed per crate so they
 * stay unique. Returns an empty-bed SVG for an empty list.
 */
export function combineCrateSvgs(entries: Array<{ label: string; svg: string }>): string {
  const gap = 40;
  const parts: string[] = [];
  let maxWidth = 100;
  let totalHeight = 0;
  let sharedDefs = '';

  entries.forEach((entry, index) => {
    const body = entry.svg.replace(/^\s*<\?xml[^>]*\?>/, '').trim();
    const open = /^<svg\b[^>]*>/.exec(body);
    const vb = open ? /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(open[0]) : null;
    if (!open || !vb) return;
    const width = Number(vb[1]);
    const height = Number(vb[2]);
    let inner = body.slice(open[0].length);
    const closeAt = inner.lastIndexOf('</svg>');
    if (closeAt >= 0) inner = inner.slice(0, closeAt);

    const defs = /<defs>[\s\S]*?<\/defs>/.exec(inner);
    if (defs && !sharedDefs) sharedDefs = defs[0];
    inner = inner
      .replace(/<defs>[\s\S]*?<\/defs>/g, '')
      .replace(/<title>[\s\S]*?<\/title>/g, '')
      .replace(/<desc>[\s\S]*?<\/desc>/g, '')
      .replace(/\bid="/g, `id="c${index + 1}-`);

    parts.push(
      `  <g id="crate-${index + 1}" transform="translate(0 ${totalHeight})">`,
      `    <text class="title-text" x="25" y="24">${escapeXml(entry.label)}</text>`,
      inner,
      `  </g>`
    );
    maxWidth = Math.max(maxWidth, width);
    totalHeight += height + gap;
  });

  totalHeight = Math.max(100, totalHeight - gap);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxWidth} ${totalHeight}" width="${maxWidth}mm" height="${totalHeight}mm">`,
    `  <title>Onyx crate cutfiles preview</title>`,
    `  <desc>Approximate drawings generated by Onyx from the crate sizes. Not Boxes.py output: verify with a real Boxes.py cutfile before cutting.</desc>`,
    sharedDefs,
    ...parts,
    `</svg>`,
  ].join('\n');
}
