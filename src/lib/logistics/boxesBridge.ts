/**
 * boxesBridge.ts
 * Pure TypeScript bridge between Onyx-mx 3D crate coordinates and Boxes.py laser cutting parameters.
 * Zero external npm dependencies — runs seamlessly in browser and Node.js runtimes.
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

export interface BoxesGeneratorParams {
  generator: 'UniversalBox' | 'ABox' | 'TypeTray';
  x: number;
  y: number;
  h: number;
  thickness: number;
  burn: number;
  sx?: string;
  sy?: string;
  extraArgs?: Record<string, string | number>;
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
  const x = Math.round(crate.widthCm * 10 * 100) / 100;
  const y = Math.round(crate.lengthCm * 10 * 100) / 100;
  const h = Math.round(crate.heightCm * 10 * 100) / 100;
  const thickness = crate.thicknessMm ?? 6;
  const burn = crate.burnMm ?? 0.1;

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
    const startX = item.xCm;
    const endX = item.xCm + item.widthCm;
    if (startX > 0 && startX < crate.widthCm) xCuts.add(startX);
    if (endX > 0 && endX < crate.widthCm) xCuts.add(endX);
  }

  // Extract unique Z (length/depth) boundaries from items
  const zCuts = new Set<number>();
  for (const item of items) {
    const startZ = item.zCm;
    const itemLen = item.lengthCm ?? 0;
    const endZ = startZ + itemLen;
    if (startZ > 0 && startZ < crate.lengthCm) zCuts.add(startZ);
    if (endZ > 0 && endZ < crate.lengthCm) zCuts.add(endZ);
  }

  const sx = deriveIntervalsFromCuts(crate.widthCm, xCuts);
  const sy = deriveIntervalsFromCuts(crate.lengthCm, zCuts);

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

/**
 * Formats a ready-to-run Windows PowerShell CLI command for boxes.exe with $env:PYTHONUTF8=1.
 */
export function formatBoxesCliCommand(
  params: BoxesGeneratorParams,
  outputFile?: string
): string {
  const parts: string[] = [
    '$env:PYTHONUTF8=1;',
    'boxes.exe',
    params.generator,
    `--x ${params.x}`,
    `--y ${params.y}`,
    `--h ${params.h}`,
    `--thickness ${params.thickness}`,
    `--burn ${params.burn}`,
  ];

  if (params.sx) {
    parts.push(`--sx "${params.sx}"`);
  }
  if (params.sy) {
    parts.push(`--sy "${params.sy}"`);
  }

  if (params.extraArgs) {
    for (const [key, value] of Object.entries(params.extraArgs)) {
      if (typeof value === 'string' && value.includes(' ')) {
        parts.push(`--${key} "${value}"`);
      } else {
        parts.push(`--${key} ${value}`);
      }
    }
  }

  if (outputFile) {
    parts.push(`--output "${outputFile}"`);
  }

  return parts.join(' ');
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
  const W = Math.round(crate.widthCm * 10 * 100) / 100;
  const L = Math.round(crate.lengthCm * 10 * 100) / 100;
  const H = Math.round(crate.heightCm * 10 * 100) / 100;
  const T = crate.thicknessMm ?? 6;
  const burn = crate.burnMm ?? 0.1;

  // Extract internal divider positions (in mm)
  const internalXCutsMm: number[] = [];
  const internalZCutsMm: number[] = [];

  if (items && items.length > 0) {
    const xSet = new Set<number>();
    const zSet = new Set<number>();
    for (const item of items) {
      if (item.xCm > 0 && item.xCm < crate.widthCm) xSet.add(item.xCm * 10);
      const endX = (item.xCm + item.widthCm) * 10;
      if (endX > 0 && endX < W) xSet.add(endX);

      if (item.zCm > 0 && item.zCm < crate.lengthCm) zSet.add(item.zCm * 10);
      const endZ = (item.zCm + (item.lengthCm ?? 0)) * 10;
      if (endZ > 0 && endZ < L) zSet.add(endZ);
    }
    internalXCutsMm.push(...Array.from(xSet).sort((a, b) => a - b));
    internalZCutsMm.push(...Array.from(zSet).sort((a, b) => a - b));
  }

  // Highlighted item calculation
  const highlightedItem = items?.find(it => String(it.id) === String(options?.highlightedItemId));
  const highXMin = highlightedItem ? Math.round(highlightedItem.xCm * 10 * 100) / 100 : null;
  const highXMax = highlightedItem ? Math.round((highlightedItem.xCm + highlightedItem.widthCm) * 10 * 100) / 100 : null;
  const highZMin = highlightedItem ? Math.round(highlightedItem.zCm * 10 * 100) / 100 : null;
  const highZMax = highlightedItem ? Math.round((highlightedItem.zCm + (highlightedItem.lengthCm ?? 0)) * 10 * 100) / 100 : null;

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

  const bedWidth = options?.bedWidthMm ?? Math.max(1200, Math.ceil(contentWidth));
  const bedHeight = options?.bedHeightMm ?? Math.max(900, Math.ceil(contentHeight));

  // Build panels
  const svgParts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bedWidth} ${bedHeight}" width="${bedWidth}mm" height="${bedHeight}mm">`,
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
    `  <text x="25" y="35" class="dim-text" font-weight="600">LASER BED BOUNDARY (${bedWidth} mm × ${bedHeight} mm) | Kerf: ${burn}mm | Thickness: ${T}mm</text>`,
    ``,
  ];

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
      svgParts.push(`    <text x="${(pocketX + pocketW / 2).toFixed(1)}" y="${(pocketY + pocketH / 2 + 4).toFixed(1)}" fill="#06b6d4" font-size="11" font-weight="700" text-anchor="middle">${highlightedItem.name || 'Slot'}</text>`);
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
  const W = Math.round(crate.widthCm * 10 * 100) / 100;
  const L = Math.round(crate.lengthCm * 10 * 100) / 100;
  const H = Math.round(crate.heightCm * 10 * 100) / 100;
  const T = crate.thicknessMm ?? 6;

  // Extract internal divider cuts
  const internalXCutsMm: number[] = [];
  const internalZCutsMm: number[] = [];

  if (items && items.length > 0) {
    const xSet = new Set<number>();
    const zSet = new Set<number>();
    for (const item of items) {
      if (item.xCm > 0 && item.xCm < crate.widthCm) xSet.add(item.xCm * 10);
      const endX = (item.xCm + item.widthCm) * 10;
      if (endX > 0 && endX < W) xSet.add(endX);

      if (item.zCm > 0 && item.zCm < crate.lengthCm) zSet.add(item.zCm * 10);
      const endZ = (item.zCm + (item.lengthCm ?? 0)) * 10;
      if (endZ > 0 && endZ < L) zSet.add(endZ);
    }
    internalXCutsMm.push(...Array.from(xSet).sort((a, b) => a - b));
    internalZCutsMm.push(...Array.from(zSet).sort((a, b) => a - b));
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
  const W = Math.round(crate.widthCm * 10 * 100) / 100;
  const L = Math.round(crate.lengthCm * 10 * 100) / 100;
  const H = Math.round(crate.heightCm * 10 * 100) / 100;

  const internalXCutsMm: number[] = [];
  const internalZCutsMm: number[] = [];
  if (items && items.length > 0) {
    const xSet = new Set<number>();
    const zSet = new Set<number>();
    for (const item of items) {
      if (item.xCm > 0 && item.xCm < crate.widthCm) xSet.add(item.xCm * 10);
      const endX = (item.xCm + item.widthCm) * 10;
      if (endX > 0 && endX < W) xSet.add(endX);

      if (item.zCm > 0 && item.zCm < crate.lengthCm) zSet.add(item.zCm * 10);
      const endZ = (item.zCm + (item.lengthCm ?? 0)) * 10;
      if (endZ > 0 && endZ < L) zSet.add(endZ);
    }
    internalXCutsMm.push(...Array.from(xSet).sort((a, b) => a - b));
    internalZCutsMm.push(...Array.from(zSet).sort((a, b) => a - b));
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
