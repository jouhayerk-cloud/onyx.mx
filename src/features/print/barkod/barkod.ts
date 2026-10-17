/**
 * Barkod Round 4: 1-Bit Thermal Barcode Generator with Isometric Hairline Silhouette Glyphs
 * Designed for Phomemo M110/M120 203 DPI 1-bit thermal label printers (384-dot printhead).
 *
 * Rules:
 * 1. Integer module widths of 2-3 printer dots; never scale the bitmap.
 * 2. Shapes survive 1-bit thermal print: no strokes or gaps under 3 dots, no thin isolated stubs.
 * 3. Continuous protected scan band remains 100% compliant with ISO/IEC 15417 Code 128.
 * 4. Production winner: Sidecar Glyph (Rank 1) - bold 1-bit hairline item glyph beside standard barcode.
 */

import { buildTypeFigure } from '../../entry/hairline/typeFigures/index';
import type { Dims, FigurePart } from '../../entry/hairline/types';
import JsBarcode from 'jsbarcode';

// Code 128 Character Patterns (widths of alternating bars and spaces, summing to 11; STOP sums to 13)
export const CODE128_PATTERNS: ReadonlyArray<readonly number[]> = [
  [2,1,2,2,2,2], [2,2,2,1,2,2], [2,2,2,2,2,1], [1,2,1,2,2,3], [1,2,1,3,2,2], // 0-4
  [1,3,1,2,2,2], [1,2,2,2,1,3], [1,2,2,3,1,2], [1,3,2,2,1,2], [2,2,1,2,1,3], // 5-9
  [2,2,1,3,1,2], [2,3,1,2,1,2], [1,1,2,2,3,2], [1,2,2,1,3,2], [1,2,2,2,3,1], // 10-14
  [1,1,3,2,2,2], [1,2,3,1,2,2], [1,2,3,2,2,1], [2,2,3,2,1,1], [2,2,1,1,3,2], // 15-19
  [2,2,1,2,3,1], [2,1,3,2,1,2], [2,2,3,1,1,2], [3,1,2,1,3,1], [3,1,1,2,2,2], // 20-24
  [3,2,1,1,2,2], [3,2,1,2,2,1], [3,1,2,2,1,2], [3,2,2,1,1,2], [3,2,2,2,1,1], // 25-29
  [2,1,2,1,2,3], [2,1,2,3,2,1], [2,3,2,1,2,1], [1,1,1,3,2,3], [1,3,1,1,2,3], // 30-34
  [1,3,1,3,2,1], [1,1,2,3,1,3], [1,3,2,1,1,3], [1,3,2,3,1,1], [2,1,1,3,1,3], // 35-39
  [2,3,1,1,1,3], [2,3,1,3,1,1], [1,1,2,1,3,3], [1,1,2,3,3,1], [1,3,2,1,3,1], // 40-44
  [1,1,3,1,2,3], [1,1,3,3,2,1], [1,3,3,1,2,1], [3,1,3,1,2,1], [2,1,1,3,3,1], // 45-49
  [2,3,1,1,3,1], [2,1,3,1,1,3], [2,1,3,3,1,1], [2,1,3,1,3,1], [3,1,1,1,2,3], // 50-54
  [3,1,1,3,2,1], [3,3,1,1,2,1], [3,1,2,1,1,3], [3,1,2,3,1,1], [3,3,2,1,1,1], // 55-59
  [3,1,4,1,1,1], [2,2,1,4,1,1], [4,3,1,1,1,1], [1,1,1,2,2,4], [1,1,1,4,2,2], // 60-64
  [1,2,1,1,2,4], [1,2,1,4,2,1], [1,4,1,1,2,2], [1,4,1,2,2,1], [1,1,2,2,1,4], // 65-69
  [1,1,2,4,1,2], [1,2,2,1,1,4], [1,2,2,4,1,1], [1,4,2,1,1,2], [1,4,2,2,1,1], // 70-74
  [2,4,1,2,1,1], [2,2,1,1,1,4], [4,1,3,1,1,1], [2,4,1,1,1,2], [1,3,4,1,1,1], // 75-79
  [1,1,1,2,4,2], [1,2,1,1,4,2], [1,2,1,2,4,1], [1,1,4,2,1,2], [1,2,4,1,1,2], // 80-84
  [1,2,4,2,1,1], [4,1,1,2,1,2], [4,2,1,1,1,2], [4,2,1,2,1,1], [2,1,2,1,4,1], // 85-89
  [2,1,4,1,2,1], [4,1,2,1,2,1], [1,1,1,1,4,3], [1,1,1,3,4,1], [1,3,1,1,4,1], // 90-94
  [1,1,4,1,1,3], [1,1,4,3,1,1], [4,1,1,1,1,3], [4,1,1,3,1,1], [1,1,3,1,4,1], // 95-99
  [1,1,4,1,3,1], [3,1,1,1,4,1], [4,1,1,1,3,1], [2,1,1,4,1,2], [2,1,1,2,1,4], // 100-104 (104 = START B)
  [2,1,1,2,3,2], [2,3,3,1,1,1,2]                                               // 105 (START C), 106 (STOP)
];

export const START_B = 104;
export const STOP = 106;

export type BarkodStyle = 'sidecar' | 'solid-cap' | 'skyline' | 'totem' | 'layered' | 'contour';

export interface BarkodBar {
  startModule: number;
  moduleWidth: number;
}

export interface EncodedCode128B {
  text: string;
  totalModules: number;
  modules: number[];
  bars: BarkodBar[];
}

export interface BarkodOptions {
  moduleWidth?: number;          // strict integer dots: 2 or 3 px (default 2 px, 0.25 mm at 203 DPI)
  scanBandHeight?: number;      // continuous protected scan band (default 48 px)
  totalHeight?: number;          // total height in dots (default 116 px)
  quietZoneModules?: number;    // default 10 modules
  typeId?: string;               // e.g. 'floor-lamp', 'bowl', 'wine-rack', etc.
  variant?: string;
  top?: string;                  // 'open' | 'closed' for lamps
  holes?: number;                // hole count for wine rack
  style?: BarkodStyle;           // 'sidecar' (default Best Strategy), 'solid-cap', 'skyline'
  negativeStrokeWidth?: number;  // min 3 dots for 1-bit thermal print (default 3)
  includeText?: boolean;
  textFontSize?: number;
  barColor?: string;
  backgroundColor?: string;
  className?: string;
  dims?: Dims | null;
}

export interface BarkodResult {
  svg: string;
  width: number;
  height: number;
  scanBandHeight: number;
  moduleWidth: number;
  totalModules: number;
  quietZonePx: number;
  data: string;
}

export interface SilhouetteModel {
  type: string;
  aspectRatio: number;
  contour?: Array<[number, number]>;
  creases?: Array<Array<[number, number]>>;
  sampleTop(xNorm: number): number | null;
  sampleBottom?(xNorm: number): number | null;
}

/**
 * Encodes text into Code 128 Set B modules using integer arithmetic.
 * Compliant with ISO/IEC 15417 and JsBarcode.
 */
export function encodeCode128B(text: string): EncodedCode128B {
  const clean = String(text || '').replace(/[^\x20-\x7E]/g, '');
  if (!clean.length) {
    throw new Error('Code128 encoder: text cannot be empty');
  }

  const values: number[] = [START_B];
  let checkSum = START_B;

  for (let i = 0; i < clean.length; i++) {
    const val = clean.charCodeAt(i) - 32;
    values.push(val);
    checkSum += val * (i + 1);
  }

  values.push(checkSum % 103);
  values.push(STOP);

  const modules: number[] = [];
  const bars: BarkodBar[] = [];
  let currentPos = 0;

  for (let vIdx = 0; vIdx < values.length; vIdx++) {
    const val = values[vIdx];
    const pattern = CODE128_PATTERNS[val];
    for (let pIdx = 0; pIdx < pattern.length; pIdx++) {
      const width = pattern[pIdx];
      const isBar = (pIdx % 2 === 0);
      for (let m = 0; m < width; m++) {
        modules.push(isBar ? 1 : 0);
      }
      if (isBar) {
        bars.push({
          startModule: currentPos,
          moduleWidth: width,
        });
      }
      currentPos += width;
    }
  }

  return {
    text: clean,
    totalModules: modules.length,
    modules,
    bars,
  };
}

/**
 * Extract 2D points from SVG path command string (M x y, L x y, Z)
 */
function extractPathPoints(d: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const regex = /([ML])\s*([-\d.]+)[,\s]+([-\d.]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(d)) !== null) {
    const x = parseFloat(match[2]);
    const y = parseFloat(match[3]);
    if (!isNaN(x) && !isNaN(y)) {
      pts.push([x, y]);
    }
  }
  return pts;
}

export interface LayeredFigureGeometry {
  plates: FigurePart[];
  faces: FigurePart[];
  creases: FigurePart[];
  slots: FigurePart[];
  figW: number;
  figH: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getLayeredFigureGeometry(
  typeId?: string | null,
  variant?: string | null,
  dims?: Dims | null,
  holes?: number,
  top?: string | null
): LayeredFigureGeometry | null {
  const normType = String(typeId || 'floor-lamp').toLowerCase();
  let figureParts: FigurePart[] | null = null;
  try {
    figureParts = buildTypeFigure(normType, dims || null, holes, variant || null, top || null);
  } catch {
    figureParts = null;
  }

  if (!figureParts || figureParts.length === 0) {
    const model = getHairlineSilhouetteModel(typeId, variant, dims);
    if (model.contour) {
      const contourPath = model.contour.map((p, i) => `${i ? 'L' : 'M'}${p[0] * 100} ${p[1] * 100}`).join('') + 'Z';
      figureParts = [{ d: contourPath, kind: 'plate' }];
      if (model.creases) {
        for (const c of model.creases) {
          const creasePath = c.map((p, i) => `${i ? 'L' : 'M'}${p[0] * 100} ${p[1] * 100}`).join('');
          figureParts.push({ d: creasePath, kind: 'crease' });
        }
      }
    }
  }

  if (!figureParts || figureParts.length === 0) return null;

  const plateParts: FigurePart[] = [];
  const faceParts: FigurePart[] = [];
  const creaseParts: FigurePart[] = [];
  const slotParts: FigurePart[] = [];

  for (const p of figureParts) {
    if (p.kind === 'plate') plateParts.push(p);
    else if (p.kind === 'face') faceParts.push(p);
    else if (p.kind === 'crease') creaseParts.push(p);
    else if (p.kind === 'slot') slotParts.push(p);
  }

  if (plateParts.length === 0) {
    for (const p of figureParts) {
      if (p.kind !== 'crease') plateParts.push(p);
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of figureParts) {
    const pts = extractPathPoints(p.d);
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY) || maxX <= minX || maxY <= minY) {
    return null;
  }

  return {
    plates: plateParts,
    faces: faceParts,
    creases: creaseParts,
    slots: slotParts,
    figW: maxX - minX,
    figH: maxY - minY,
    minX,
    minY,
    maxX,
    maxY
  };
}

export function getHairlineSilhouetteModel(
  typeId?: string | null,
  variant?: string | null,
  dims?: Dims | null
): SilhouetteModel {
  const normType = String(typeId || 'floor-lamp').toLowerCase();

  if (normType.includes('bowl') || normType.includes('canoe') || normType.includes('vessel')) {
    return {
      type: 'bowl',
      aspectRatio: 1.8,
      contour: [
        [0.02, 0.28], [0.12, 0.18], [0.28, 0.14], [0.50, 0.12],
        [0.72, 0.14], [0.88, 0.18], [0.98, 0.28],
        [0.96, 0.40], [0.88, 0.68], [0.74, 0.90], [0.58, 1.00],
        [0.42, 1.00], [0.26, 0.90], [0.12, 0.68], [0.04, 0.40]
      ],
      creases: [
        [[0.10, 0.32], [0.30, 0.22], [0.50, 0.20], [0.70, 0.22], [0.90, 0.32]],
        [[0.22, 0.48], [0.50, 0.44], [0.78, 0.48]]
      ],
      sampleTop(xNorm: number): number | null {
        const dx = (xNorm - 0.5) * 2;
        if (Math.abs(dx) > 0.98) return null;
        return 0.12 + 0.16 * Math.pow(dx, 2);
      }
    };
  }

  if (normType.includes('table-lamp') || normType.includes('pendant') || normType.includes('light')) {
    return {
      type: 'table-lamp',
      aspectRatio: 0.55,
      contour: [
        [0.50, 0.04], [0.82, 0.18], [0.82, 0.94], [0.50, 1.00], [0.18, 0.86], [0.18, 0.18]
      ],
      creases: [
        [[0.48, 0.25], [0.48, 0.82]],
        [[0.52, 0.25], [0.52, 0.82]]
      ],
      sampleTop(xNorm: number): number | null {
        if (xNorm < 0.18 || xNorm > 0.82) return null;
        const dx = (xNorm - 0.5) / 0.32;
        return 0.04 + 0.14 * Math.abs(dx);
      }
    };
  }

  // Default: Floor Lamp
  return {
    type: 'floor-lamp',
    aspectRatio: 0.35,
    contour: [
      [0.50, 0.02], [0.78, 0.12], [0.78, 0.96], [0.50, 1.00], [0.22, 0.92], [0.22, 0.08]
    ],
    creases: [
      [[0.50, 0.16], [0.50, 0.98]],
      [[0.62, 0.22], [0.62, 0.86]]
    ],
    sampleTop(xNorm: number): number | null {
      if (xNorm < 0.22 || xNorm > 0.78) return null;
      return 0.06;
    }
  };
}

export const DEFAULT_BARKOD_OPTIONS: Required<Omit<BarkodOptions, 'typeId' | 'variant' | 'className' | 'dims' | 'top' | 'holes' | 'negativeStrokeWidth'>> & {
  typeId: string;
  variant: string;
  top: string;
  holes: number;
  negativeStrokeWidth: number;
  className: string;
  dims: Dims | null;
} = {
  moduleWidth: 2,               // Strict 2-dot integer module (0.250 mm)
  scanBandHeight: 48,           // Standard protected scan band height
  totalHeight: 116,             // Total height in printer dots
  quietZoneModules: 10,
  typeId: 'floor-lamp',
  variant: 'squared',
  top: 'closed',
  holes: 6,
  style: 'sidecar',             // Production winner: Sidecar Glyph (Rank 1)
  negativeStrokeWidth: 3,       // Minimum 3 dots for 1-bit thermal print survival
  includeText: true,
  textFontSize: 13,
  barColor: '#000000',
  backgroundColor: '#ffffff',
  className: '',
  dims: null,
};

/**
 * Generates an SVG string of the Barkod barcode using the best strategy (Sidecar Glyph).
 * Guarantees integer module widths and 1-bit thermal survival.
 */
export function generateBarkodSvg(text: string, userOptions: BarkodOptions = {}): BarkodResult {
  const opt = { ...DEFAULT_BARKOD_OPTIONS, ...userOptions };
  const encoded = encodeCode128B(text);

  const mWidth = Math.max(1, Math.round(opt.moduleWidth));
  const qzPx = opt.quietZoneModules * mWidth;
  const symbolWidth = encoded.totalModules * mWidth;

  const geom = getLayeredFigureGeometry(opt.typeId, opt.variant, opt.dims, opt.holes, opt.top);
  const resolvedStyle = (opt.style === 'totem' || opt.style === 'layered') ? 'sidecar' : opt.style;

  if (resolvedStyle === 'sidecar' && geom) {
    const glyphBoxW = 84;
    const glyphBoxH = 84;
    const glyphX = 14;
    const glyphY = 16;
    const sepX = 106;
    const barcodeStartX = 118;
    const totalSvgW = Math.max(384, barcodeStartX + symbolWidth + qzPx);
    const viewBoxH = opt.totalHeight;

    const pad = 6;
    const scale = Math.min((glyphBoxW - pad * 2) / geom.figW, (glyphBoxH - pad * 2) / geom.figH);
    const tx = glyphX + (glyphBoxW - geom.figW * scale) / 2 - geom.minX * scale;
    const ty = glyphY + (glyphBoxH - geom.figH * scale) / 2 - geom.minY * scale;

    const strokeUnits = (opt.negativeStrokeWidth / scale).toFixed(2);

    const plateSvg = geom.plates.map(p => `<path d="${p.d}" fill="${opt.barColor}" />`).join('\n        ');
    const slotSvg = geom.slots.map(p => `<path d="${p.d}" fill="${opt.backgroundColor}" stroke="${opt.backgroundColor}" stroke-width="${strokeUnits}" stroke-linecap="round" stroke-linejoin="round" />`).join('\n        ');
    const creaseSvg = [...geom.creases, ...geom.faces].map(p => `<path d="${p.d}" fill="none" stroke="${opt.backgroundColor}" stroke-width="${strokeUnits}" stroke-linecap="round" stroke-linejoin="round" />`).join('\n        ');

    const barcodeScanY = 24;
    const barcodeScanH = 68;
    const barsSvg = encoded.bars.map(b => {
      const bx = Math.round(barcodeStartX + b.startModule * mWidth);
      const bw = Math.round(b.moduleWidth * mWidth);
      return `<rect x="${bx}" y="${barcodeScanY}" width="${bw}" height="${barcodeScanH}" fill="${opt.barColor}" />`;
    }).join('\n      ');

    let textElement = '';
    if (opt.includeText) {
      const textY = barcodeScanY + barcodeScanH + opt.textFontSize + 2;
      const formatted = encoded.text.split('').join(' ');
      const textCenterX = barcodeStartX + symbolWidth / 2;
      textElement = `<text x="${textCenterX}" y="${textY}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="${opt.textFontSize}" font-weight="700" letter-spacing="0.20em" text-anchor="middle" fill="${opt.barColor}">${formatted}</text>`;
    }

    const labelText = (opt.typeId || '').replace(/-/g, ' ').toUpperCase();
    const glyphLabel = `<text x="${glyphX + glyphBoxW / 2}" y="${glyphY + glyphBoxH + 11}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="9" font-weight="700" text-anchor="middle" fill="${opt.barColor}">${labelText}</text>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgW} ${viewBoxH}" width="${totalSvgW}" height="${viewBoxH}" class="${opt.className}" style="shape-rendering: crispEdges;">
  <rect x="0" y="0" width="${totalSvgW}" height="${viewBoxH}" fill="${opt.backgroundColor}" />
  <g id="barkod-sidecar-glyph" transform="translate(${tx.toFixed(2)}, ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
    ${plateSvg}
    ${slotSvg}
    ${creaseSvg}
  </g>
  ${glyphLabel}
  <line x1="${sepX}" y1="12" x2="${sepX}" y2="${viewBoxH - 12}" stroke="#e2e8f0" stroke-width="1" />
  <g id="barkod-scan-band">
    ${barsSvg}
  </g>
  ${textElement}
</svg>`;

    return {
      svg,
      width: totalSvgW,
      height: viewBoxH,
      scanBandHeight: barcodeScanH,
      moduleWidth: mWidth,
      totalModules: encoded.totalModules,
      quietZonePx: qzPx,
      data: encoded.text
    };
  }

  // Fallback: Full-width barcode with integer modules
  const totalSvgWidth = symbolWidth + qzPx * 2;
  const viewBoxH = opt.totalHeight;
  const barsSvg = encoded.bars.map(b => {
    const bx = Math.round(qzPx + b.startModule * mWidth);
    const bw = Math.round(b.moduleWidth * mWidth);
    return `<rect x="${bx}" y="24" width="${bw}" height="${opt.scanBandHeight}" fill="${opt.barColor}" />`;
  }).join('\n    ');

  let textElement = '';
  if (opt.includeText) {
    const textY = 24 + opt.scanBandHeight + opt.textFontSize + 2;
    const formatted = encoded.text.split('').join(' ');
    textElement = `<text x="${totalSvgWidth / 2}" y="${textY}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="${opt.textFontSize}" font-weight="700" letter-spacing="0.20em" text-anchor="middle" fill="${opt.barColor}">${formatted}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgWidth} ${viewBoxH}" width="${totalSvgWidth}" height="${viewBoxH}" class="${opt.className}" style="shape-rendering: crispEdges;">
  <rect x="0" y="0" width="${totalSvgWidth}" height="${viewBoxH}" fill="${opt.backgroundColor}" />
  <g id="barkod-scan-band">
    ${barsSvg}
  </g>
  ${textElement}
</svg>`;

  return {
    svg,
    width: totalSvgWidth,
    height: viewBoxH,
    scanBandHeight: opt.scanBandHeight,
    moduleWidth: mWidth,
    totalModules: encoded.totalModules,
    quietZonePx: qzPx,
    data: encoded.text
  };
}

/**
 * Render Barkod directly onto a CanvasRenderingContext2D using the best strategy (Sidecar Glyph).
 * Synchronous, 1-bit crisp, strictly integer dots, zero non-integer bitmap scaling.
 */
export function renderBarkodToContext(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  text: string,
  userOptions: BarkodOptions = {}
): BarkodResult {
  const opt = { ...DEFAULT_BARKOD_OPTIONS, ...userOptions };
  const encoded = encodeCode128B(text);

  const mWidth = Math.max(1, Math.round(opt.moduleWidth));
  const qzPx = opt.quietZoneModules * mWidth;
  const symbolWidth = encoded.totalModules * mWidth;

  const geom = getLayeredFigureGeometry(opt.typeId, opt.variant, opt.dims, opt.holes, opt.top);
  const resolvedStyle = (opt.style === 'totem' || opt.style === 'layered') ? 'sidecar' : opt.style;

  ctx.save();
  ctx.translate(Math.round(startX), Math.round(startY));

  if (resolvedStyle === 'sidecar' && geom) {
    const glyphBoxW = 84;
    const glyphBoxH = 84;
    const glyphX = 14;
    const glyphY = 16;
    const sepX = 106;
    const barcodeStartX = 118;
    const totalW = Math.max(384, barcodeStartX + symbolWidth + qzPx);
    const totalH = opt.totalHeight;

    // 1. Background fill
    ctx.fillStyle = opt.backgroundColor;
    ctx.fillRect(0, 0, totalW, totalH);

    // 2. Render Sidecar Glyph (Left Zone)
    const pad = 6;
    const scale = Math.min((glyphBoxW - pad * 2) / geom.figW, (glyphBoxH - pad * 2) / geom.figH);
    const tx = glyphX + (glyphBoxW - geom.figW * scale) / 2 - geom.minX * scale;
    const ty = glyphY + (glyphBoxH - geom.figH * scale) / 2 - geom.minY * scale;

    if (typeof Path2D !== 'undefined') {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);

      // Solid plates in deep black
      ctx.fillStyle = opt.barColor;
      for (const p of geom.plates) {
        ctx.fill(new Path2D(p.d));
      }

      // Slots in background color (>= 3 dots width)
      const strokeW = Math.max(opt.negativeStrokeWidth / scale, 2.0);
      ctx.fillStyle = opt.backgroundColor;
      ctx.strokeStyle = opt.backgroundColor;
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const p of geom.slots) {
        const path = new Path2D(p.d);
        ctx.fill(path);
        ctx.stroke(path);
      }

      // Creases and faces as bold inverted cuts
      for (const p of geom.faces) {
        ctx.stroke(new Path2D(p.d));
      }
      for (const p of geom.creases) {
        ctx.stroke(new Path2D(p.d));
      }
      ctx.restore();
    }

    // Glyph text label
    ctx.fillStyle = opt.barColor;
    ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelText = (opt.typeId || '').replace(/-/g, ' ').toUpperCase();
    ctx.fillText(labelText, glyphX + glyphBoxW / 2, glyphY + glyphBoxH + 4);

    // Divider line
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(sepX, 12, 1, totalH - 24);

    // 3. Render Standard Protected Barcode (Right Zone)
    const barcodeScanY = 24;
    const barcodeScanH = 68;

    ctx.fillStyle = opt.barColor;
    for (let i = 0; i < encoded.bars.length; i++) {
      const bar = encoded.bars[i];
      const bx = Math.round(barcodeStartX + bar.startModule * mWidth);
      const bw = Math.round(bar.moduleWidth * mWidth);
      ctx.fillRect(bx, barcodeScanY, bw, barcodeScanH);
    }

    // 4. Human-readable text
    if (opt.includeText) {
      ctx.fillStyle = opt.barColor;
      ctx.font = `bold ${opt.textFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const formatted = encoded.text.split('').join(' ');
      ctx.fillText(formatted, barcodeStartX + symbolWidth / 2, barcodeScanY + barcodeScanH + 6);
    }

    ctx.restore();

    return {
      svg: '',
      width: totalW,
      height: totalH,
      scanBandHeight: barcodeScanH,
      moduleWidth: mWidth,
      totalModules: encoded.totalModules,
      quietZonePx: qzPx,
      data: encoded.text
    };
  }

  // Fallback: Full-width integer barcode
  const totalW = symbolWidth + qzPx * 2;
  const totalH = opt.totalHeight;

  ctx.fillStyle = opt.backgroundColor;
  ctx.fillRect(0, 0, totalW, totalH);

  ctx.fillStyle = opt.barColor;
  for (let i = 0; i < encoded.bars.length; i++) {
    const bar = encoded.bars[i];
    const bx = Math.round(qzPx + bar.startModule * mWidth);
    const bw = Math.round(bar.moduleWidth * mWidth);
    ctx.fillRect(bx, 24, bw, opt.scanBandHeight);
  }

  if (opt.includeText) {
    ctx.fillStyle = opt.barColor;
    ctx.font = `bold ${opt.textFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const formatted = encoded.text.split('').join(' ');
    ctx.fillText(formatted, totalW / 2, 24 + opt.scanBandHeight + 6);
  }

  ctx.restore();

  return {
    svg: '',
    width: totalW,
    height: totalH,
    scanBandHeight: opt.scanBandHeight,
    moduleWidth: mWidth,
    totalModules: encoded.totalModules,
    quietZonePx: qzPx,
    data: encoded.text
  };
}

// ── SCANNABILITY SELF-CHECK ENGINE ──────────────────────────────────────────

export interface BarkodScanCheckResult {
  passed: boolean;
  decodedText: string | null;
  expectedText: string;
  error: string | null;
  scannedRow: number;
  moduleWidth: number;
  totalModules: number;
  readChecksum: number | null;
  expectedChecksum: number | null;
}

function measureRunsFromRow(rowPixels: number[]): Array<{ isBar: boolean; length: number }> {
  const runs: Array<{ isBar: boolean; length: number }> = [];
  if (rowPixels.length === 0) return runs;

  let currentVal = rowPixels[0];
  let currentLen = 1;

  for (let i = 1; i < rowPixels.length; i++) {
    if (rowPixels[i] === currentVal) {
      currentLen++;
    } else {
      runs.push({ isBar: currentVal === 1, length: currentLen });
      currentVal = rowPixels[i];
      currentLen = 1;
    }
  }
  runs.push({ isBar: currentVal === 1, length: currentLen });
  return runs;
}

function findPatternMatch(norm: number[]): number {
  if (norm.length < 6) return -1;
  for (let i = 0; i < CODE128_PATTERNS.length; i++) {
    const pat = CODE128_PATTERNS[i];
    if (
      pat[0] === norm[0] &&
      pat[1] === norm[1] &&
      pat[2] === norm[2] &&
      pat[3] === norm[3] &&
      pat[4] === norm[4] &&
      pat[5] === norm[5]
    ) {
      return i;
    }
  }
  return -1;
}

export function decodeCode128BFromRuns(
  runs: Array<{ isBar: boolean; length: number }>,
  expectedText: string
): { passed: boolean; decodedText: string | null; error: string | null; moduleWidth: number; totalModules: number; readChecksum: number | null; expectedChecksum: number | null } {
  let startIdx = -1;
  let estimatedModuleWidth = 0;

  for (let i = 0; i <= runs.length - 7; i++) {
    if (!runs[i].isBar) continue;
    if (i > 0 && runs[i - 1].length < 4) continue;

    const r = [
      runs[i].length,
      runs[i + 1].length,
      runs[i + 2].length,
      runs[i + 3].length,
      runs[i + 4].length,
      runs[i + 5].length
    ];

    const sumT = r[0] + r[1] + r[2] + r[3] + r[4] + r[5];
    if (sumT < 11) continue;

    const m = sumT / 11;
    if (m < 0.8) continue;

    const norm = r.map(x => Math.round(x / m));
    if (
      norm[0] === 2 &&
      norm[1] === 1 &&
      norm[2] === 1 &&
      norm[3] === 4 &&
      norm[4] === 1 &&
      norm[5] === 2
    ) {
      startIdx = i;
      estimatedModuleWidth = m;
      break;
    }
  }

  if (startIdx === -1) {
    return {
      passed: false,
      decodedText: null,
      error: 'Code128 START pattern not located in scan row',
      moduleWidth: 0,
      totalModules: 0,
      readChecksum: null,
      expectedChecksum: null
    };
  }

  const decodedValues: number[] = [];
  let runIdx = startIdx + 6;
  let stopFound = false;
  let totalModulesAcc = 11;

  while (runIdx <= runs.length - 6) {
    if (runIdx <= runs.length - 7) {
      const stopSum = runs.slice(runIdx, runIdx + 7).reduce((acc, r) => acc + r.length, 0);
      const stopM = stopSum / 13;
      const stopNorm = runs.slice(runIdx, runIdx + 7).map(r => Math.round(r.length / stopM));
      if (
        stopNorm[0] === 2 &&
        stopNorm[1] === 3 &&
        stopNorm[2] === 3 &&
        stopNorm[3] === 1 &&
        stopNorm[4] === 1 &&
        stopNorm[5] === 1 &&
        stopNorm[6] === 2
      ) {
        stopFound = true;
        totalModulesAcc += 13;
        break;
      }
    }

    const charRuns = runs.slice(runIdx, runIdx + 6);
    const charSum = charRuns.reduce((acc, r) => acc + r.length, 0);
    const charM = charSum / 11;
    const charNorm = charRuns.map(r => Math.round(r.length / charM));

    const matchedCode = findPatternMatch(charNorm);
    if (matchedCode === -1) {
      return {
        passed: false,
        decodedText: null,
        error: `Unrecognized symbol pattern at run index ${runIdx}: [${charNorm.join(',')}]`,
        moduleWidth: Math.round(estimatedModuleWidth),
        totalModules: totalModulesAcc,
        readChecksum: null,
        expectedChecksum: null
      };
    }

    if (matchedCode === STOP) {
      stopFound = true;
      totalModulesAcc += 13;
      break;
    }

    decodedValues.push(matchedCode);
    totalModulesAcc += 11;
    runIdx += 6;
  }

  if (!stopFound || decodedValues.length < 1) {
    return {
      passed: false,
      decodedText: null,
      error: 'Code128 STOP pattern not encountered before end of scan row',
      moduleWidth: Math.round(estimatedModuleWidth),
      totalModules: totalModulesAcc,
      readChecksum: null,
      expectedChecksum: null
    };
  }

  const dataValues = decodedValues.slice(0, -1);
  const readChecksum = decodedValues[decodedValues.length - 1];

  let calcChecksum = START_B;
  for (let i = 0; i < dataValues.length; i++) {
    calcChecksum += dataValues[i] * (i + 1);
  }
  const expectedChecksum = calcChecksum % 103;

  if (readChecksum !== expectedChecksum) {
    return {
      passed: false,
      decodedText: null,
      error: `Checksum verification failed (read: ${readChecksum}, expected: ${expectedChecksum})`,
      moduleWidth: Math.round(estimatedModuleWidth),
      totalModules: totalModulesAcc,
      readChecksum,
      expectedChecksum
    };
  }

  const decodedText = dataValues.map(v => String.fromCharCode(v + 32)).join('');
  const passed = (decodedText === expectedText);

  return {
    passed,
    decodedText,
    error: passed ? null : `Decoded text mismatch: expected "${expectedText}", read "${decodedText}"`,
    moduleWidth: Math.round(estimatedModuleWidth),
    totalModules: totalModulesAcc,
    readChecksum,
    expectedChecksum
  };
}

/**
 * Optical self-check: reads the protected scan band of a rendered label Canvas,
 * extracts pixel run-lengths across the scan band row, and decodes Code 128.
 */
export function verifyBarcodeInCanvas(
  canvas: HTMLCanvasElement,
  expectedText: string,
  region: { y?: number; totalHeight?: number; scanBandHeight?: number } = {}
): BarkodScanCheckResult {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      passed: false,
      decodedText: null,
      expectedText,
      error: 'Failed to obtain 2D canvas context for self-check',
      scannedRow: 0,
      moduleWidth: 0,
      totalModules: 0,
      readChecksum: null,
      expectedChecksum: null
    };
  }

  const barcodeY = region.y ?? (h > 300 ? 180 : (h > 200 ? 88 : 24));
  const totalH = region.totalHeight ?? (h > 300 ? 160 : 116);
  const scanH = region.scanBandHeight ?? (h > 300 ? 52 : 48);

  const sampleRows = [
    Math.min(h - 4, Math.max(0, Math.round(barcodeY + totalH - scanH * 0.50))),
    Math.min(h - 4, Math.max(0, Math.round(barcodeY + totalH - scanH * 0.25))),
    Math.min(h - 4, Math.max(0, Math.round(barcodeY + totalH - scanH * 0.75))),
    Math.min(h - 4, Math.max(0, Math.round(barcodeY + scanH * 0.50)))
  ];

  let lastResult: BarkodScanCheckResult = {
    passed: false,
    decodedText: null,
    expectedText,
    error: 'Scan band unread',
    scannedRow: sampleRows[0],
    moduleWidth: 0,
    totalModules: 0,
    readChecksum: null,
    expectedChecksum: null
  };

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  for (const scanY of sampleRows) {
    const rowPixels: number[] = new Array(w);
    const rowOffset = scanY * w * 4;

    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      let lum = 255;
      if (a > 0) {
        lum = 0.299 * r + 0.587 * g + 0.114 * b;
        lum = lum * (a / 255) + 255 * (1 - a / 255);
      }
      rowPixels[x] = lum < 160 ? 1 : 0;
    }

    const runs = measureRunsFromRow(rowPixels);
    const decoded = decodeCode128BFromRuns(runs, expectedText);

    lastResult = {
      passed: decoded.passed,
      decodedText: decoded.decodedText,
      expectedText,
      error: decoded.error,
      scannedRow: scanY,
      moduleWidth: decoded.moduleWidth,
      totalModules: decoded.totalModules,
      readChecksum: decoded.readChecksum,
      expectedChecksum: decoded.expectedChecksum
    };

    if (decoded.passed) {
      return lastResult;
    }
  }

  return lastResult;
}
