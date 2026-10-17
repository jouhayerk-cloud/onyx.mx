/**
 * Barkod: Code128-B Barcode Generator with Isometric Hairline Silhouette Extensions
 * Designed for Phomemo M110/M120 203 DPI 1-bit thermal label printers.
 *
 * Typed, pure TypeScript, zero dependencies.
 * Compliant with ISO/IEC 15417 Code 128 specifications.
 * Integrates with app hairline type figures (src/features/entry/hairline/typeFigures/).
 */

import { buildTypeFigure } from '../../entry/hairline/typeFigures/index';
import type { Dims, FigurePart } from '../../entry/hairline/types';

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

export type BarkodStyle = 'totem' | 'skyline' | 'contour';

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
  moduleWidth?: number;          // default 2 px (0.25 mm at 203 DPI)
  scanBandHeight?: number;      // default 48 px (6.0 mm continuous protected scan band)
  totalHeight?: number;          // default 110 px
  quietZoneModules?: number;    // default 10 modules
  typeId?: string;               // e.g. 'floor-lamp', 'bowl', etc.
  variant?: string;
  style?: BarkodStyle;
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
 * Encodes an ASCII string into Code 128 Set B modules.
 * Returns array of bars and raw module bits.
 */
export function encodeCode128B(text: string): EncodedCode128B {
  const clean = String(text || '').replace(/[^\x20-\x7E]/g, '');
  if (!clean.length) {
    throw new Error('Code128-B encoder: text cannot be empty');
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

/**
 * Derive hairline silhouette model from app type figures (src/features/entry/hairline/typeFigures/).
 * If not recognized, falls back to the curated models.
 */
export function getHairlineSilhouetteModel(
  typeId?: string | null,
  variant?: string | null,
  dims?: Dims | null
): SilhouetteModel {
  const normType = String(typeId || 'floor-lamp').toLowerCase();

  // 1. Attempt to build actual hairline figure from the app's type figures module
  try {
    const figureParts: FigurePart[] | null = buildTypeFigure(normType, dims || null, undefined, variant || null);
    if (figureParts && figureParts.length > 0) {
      const platePoints: Array<Array<[number, number]>> = [];
      const creases: Array<Array<[number, number]>> = [];

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const part of figureParts) {
        const pts = extractPathPoints(part.d);
        if (pts.length < 2) continue;

        if (part.kind === 'plate' || part.kind === 'face') {
          platePoints.push(pts);
          for (const [x, y] of pts) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        } else if (part.kind === 'crease' || part.kind === 'slot') {
          creases.push(pts);
        }
      }

      const w = maxX - minX;
      const h = maxY - minY;

      if (w > 10 && h > 10 && isFinite(w) && isFinite(h)) {
        // Normalize creases to [0..1] coordinate space
        const normalizedCreases: Array<Array<[number, number]>> = creases.map(poly =>
          poly.map(([x, y]) => [
            Math.max(0, Math.min(1, (x - minX) / w)),
            Math.max(0, Math.min(1, (y - minY) / h))
          ] as [number, number])
        );

        // Build segment list for top contour raycasting
        const segments: Array<[[number, number], [number, number]]> = [];
        for (const poly of platePoints) {
          for (let i = 0; i < poly.length; i++) {
            const p1 = poly[i];
            const p2 = poly[(i + 1) % poly.length];
            segments.push([p1, p2]);
          }
        }

        return {
          type: normType,
          aspectRatio: Math.max(0.3, Math.min(2.5, w / h)),
          creases: normalizedCreases,
          sampleTop(xNorm: number): number | null {
            if (xNorm < 0 || xNorm > 1) return null;
            const targetX = minX + xNorm * w;
            let topY = Infinity;

            for (const [p1, p2] of segments) {
              const segMinX = Math.min(p1[0], p2[0]);
              const segMaxX = Math.max(p1[0], p2[0]);
              if (targetX >= segMinX && targetX <= segMaxX && p1[0] !== p2[0]) {
                const t = (targetX - p1[0]) / (p2[0] - p1[0]);
                const y = p1[1] + t * (p2[1] - p1[1]);
                if (y < topY) {
                  topY = y;
                }
              }
            }

            if (topY === Infinity) return null;
            const normalizedY = (topY - minY) / h;
            return Math.max(0, Math.min(1, normalizedY));
          }
        };
      }
    }
  } catch {
    // Fall back to curated geometry models below if figure generation fails
  }

  // 2. Curated geometry models
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
        [[0.22, 0.48], [0.50, 0.44], [0.78, 0.48]],
        [[0.20, 0.74], [0.50, 0.78], [0.80, 0.74]]
      ],
      sampleTop(xNorm: number): number | null {
        const dx = (xNorm - 0.5) * 2;
        if (Math.abs(dx) > 0.98) return null;
        return 0.12 + 0.16 * Math.pow(dx, 2) - 0.02 * Math.cos(dx * Math.PI * 4);
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
        [[0.52, 0.25], [0.52, 0.82]],
        [[0.18, 0.86], [0.50, 0.94], [0.82, 0.88]]
      ],
      sampleTop(xNorm: number): number | null {
        if (xNorm < 0.18 || xNorm > 0.82) return null;
        const dx = (xNorm - 0.5) / 0.32;
        return 0.04 + 0.14 * Math.abs(dx);
      }
    };
  }

  // Default: Squared Floor Lamp (Column)
  return {
    type: 'floor-lamp',
    aspectRatio: 0.35,
    contour: [
      [0.50, 0.02],
      [0.78, 0.12],
      [0.78, 0.96],
      [0.50, 1.00],
      [0.22, 0.92],
      [0.22, 0.08]
    ],
    creases: [
      [[0.50, 0.16], [0.50, 0.98]],
      [[0.62, 0.22], [0.62, 0.86]],
      [[0.22, 0.38], [0.50, 0.44], [0.78, 0.38]],
      [[0.22, 0.68], [0.50, 0.74], [0.78, 0.68]],
      [[0.50, 0.02], [0.78, 0.12], [0.50, 0.16], [0.22, 0.08]]
    ],
    sampleTop(xNorm: number): number | null {
      if (xNorm < 0.22 || xNorm > 0.78) return null;
      if (xNorm <= 0.50) {
        const t = (xNorm - 0.22) / (0.50 - 0.22);
        return 0.08 - 0.06 * t;
      } else {
        const t = (xNorm - 0.50) / (0.78 - 0.50);
        return 0.02 + 0.10 * t;
      }
    }
  };
}

export const DEFAULT_BARKOD_OPTIONS: Required<Omit<BarkodOptions, 'typeId' | 'variant' | 'className' | 'dims'>> & {
  typeId: string;
  variant: string;
  className: string;
  dims: Dims | null;
} = {
  moduleWidth: 2,
  scanBandHeight: 48,
  totalHeight: 110,
  quietZoneModules: 10,
  typeId: 'floor-lamp',
  variant: 'squared',
  style: 'totem',
  includeText: true,
  textFontSize: 13,
  barColor: '#000000',
  backgroundColor: '#ffffff',
  className: '',
  dims: null,
};

/**
 * Generates an SVG string of the Barkod-style Code128 barcode with isometric silhouette top.
 */
export function generateBarkodSvg(text: string, userOptions: BarkodOptions = {}): BarkodResult {
  const opt = { ...DEFAULT_BARKOD_OPTIONS, ...userOptions };
  const encoded = encodeCode128B(text);

  const mWidth = opt.moduleWidth;
  const qzPx = opt.quietZoneModules * mWidth;
  const symbolWidth = encoded.totalModules * mWidth;
  const totalSvgWidth = symbolWidth + qzPx * 2;

  const scanBandH = opt.scanBandHeight;
  const totalH = opt.totalHeight;
  const silhouetteMaxH = totalH - scanBandH;

  const textH = opt.includeText ? (opt.textFontSize + 6) : 0;
  const viewBoxH = totalH + textH;

  const model = getHairlineSilhouetteModel(opt.typeId, opt.variant, opt.dims);

  const silWidth = Math.min(symbolWidth * 0.72, silhouetteMaxH * model.aspectRatio);
  const silStartX = qzPx + (symbolWidth - silWidth) / 2;
  const silEndX = silStartX + silWidth;

  const rects: string[] = [];
  const whiteMasks: string[] = [];

  const scanBandTopY = silhouetteMaxH;
  const scanBandBottomY = totalH;

  for (let i = 0; i < encoded.bars.length; i++) {
    const bar = encoded.bars[i];
    const barX = qzPx + bar.startModule * mWidth;
    const barW = bar.moduleWidth * mWidth;
    const barCenterX = barX + barW / 2;

    let barTopY = scanBandTopY;
    const barBottomY = scanBandBottomY;

    const isInSilZone = (barCenterX >= silStartX && barCenterX <= silEndX);

    if (isInSilZone) {
      const normX = (barCenterX - silStartX) / silWidth;
      const topSample = model.sampleTop(normX);
      if (topSample !== null) {
        if (opt.style === 'contour') {
          const rawTop = topSample * silhouetteMaxH;
          barTopY = Math.floor(rawTop / 4) * 4;
        } else {
          barTopY = Math.max(2, topSample * silhouetteMaxH);
        }
      }
    } else {
      barTopY = scanBandTopY;
    }

    const barHeight = barBottomY - barTopY;
    rects.push(`<rect x="${barX}" y="${barTopY.toFixed(1)}" width="${barW}" height="${barHeight.toFixed(1)}" fill="${opt.barColor}" />`);
  }

  if (opt.style === 'totem' && model.creases) {
    for (let c = 0; c < model.creases.length; c++) {
      const crease = model.creases[c];
      const pts = crease.map(([nx, ny]) => {
        const px = silStartX + nx * silWidth;
        const py = ny * silhouetteMaxH;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      }).join(' ');
      whiteMasks.push(`<polyline points="${pts}" fill="none" stroke="${opt.backgroundColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`);
    }
  }

  let textElement = '';
  if (opt.includeText) {
    const textY = totalH + opt.textFontSize + 1;
    const formatted = encoded.text.split('').join(' ');
    textElement = `<text x="${totalSvgWidth / 2}" y="${textY}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="${opt.textFontSize}" font-weight="700" letter-spacing="0.22em" text-anchor="middle" fill="${opt.barColor}">${formatted}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgWidth} ${viewBoxH}" width="${totalSvgWidth}" height="${viewBoxH}" class="${opt.className}" style="shape-rendering: crispEdges;">
  <rect x="0" y="0" width="${totalSvgWidth}" height="${viewBoxH}" fill="${opt.backgroundColor}" />
  <g id="barkod-bars">
    ${rects.join('\n    ')}
  </g>
  <g id="barkod-creases">
    ${whiteMasks.join('\n    ')}
  </g>
  ${textElement}
</svg>`;

  return {
    svg,
    width: totalSvgWidth,
    height: viewBoxH,
    scanBandHeight: scanBandH,
    moduleWidth: mWidth,
    totalModules: encoded.totalModules,
    quietZonePx: qzPx,
    data: encoded.text
  };
}

/**
 * Render Barkod directly onto a CanvasRenderingContext2D.
 * Synchronous, 1-bit crisp, zero external DOM Image/Blob overhead.
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

  const mWidth = opt.moduleWidth;
  const qzPx = opt.quietZoneModules * mWidth;
  const symbolWidth = encoded.totalModules * mWidth;
  const totalSvgWidth = symbolWidth + qzPx * 2;

  const scanBandH = opt.scanBandHeight;
  const totalH = opt.totalHeight;
  const silhouetteMaxH = totalH - scanBandH;

  const textH = opt.includeText ? (opt.textFontSize + 6) : 0;
  const viewBoxH = totalH + textH;

  const model = getHairlineSilhouetteModel(opt.typeId, opt.variant, opt.dims);

  const silWidth = Math.min(symbolWidth * 0.72, silhouetteMaxH * model.aspectRatio);
  const silStartX = qzPx + (symbolWidth - silWidth) / 2;
  const silEndX = silStartX + silWidth;

  const scanBandTopY = silhouetteMaxH;
  const scanBandBottomY = totalH;

  ctx.save();
  ctx.translate(startX, startY);

  // Background
  ctx.fillStyle = opt.backgroundColor;
  ctx.fillRect(0, 0, totalSvgWidth, viewBoxH);

  // Bars
  ctx.fillStyle = opt.barColor;
  for (let i = 0; i < encoded.bars.length; i++) {
    const bar = encoded.bars[i];
    const barX = qzPx + bar.startModule * mWidth;
    const barW = bar.moduleWidth * mWidth;
    const barCenterX = barX + barW / 2;

    let barTopY = scanBandTopY;
    const barBottomY = scanBandBottomY;

    const isInSilZone = (barCenterX >= silStartX && barCenterX <= silEndX);
    if (isInSilZone) {
      const normX = (barCenterX - silStartX) / silWidth;
      const topSample = model.sampleTop(normX);
      if (topSample !== null) {
        if (opt.style === 'contour') {
          const rawTop = topSample * silhouetteMaxH;
          barTopY = Math.floor(rawTop / 4) * 4;
        } else {
          barTopY = Math.max(2, topSample * silhouetteMaxH);
        }
      }
    }

    const barHeight = barBottomY - barTopY;
    ctx.fillRect(barX, barTopY, barW, barHeight);
  }

  // Creases
  if (opt.style === 'totem' && model.creases) {
    ctx.strokeStyle = opt.backgroundColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const crease of model.creases) {
      if (crease.length < 2) continue;
      ctx.beginPath();
      const p0x = silStartX + crease[0][0] * silWidth;
      const p0y = crease[0][1] * silhouetteMaxH;
      ctx.moveTo(p0x, p0y);
      for (let i = 1; i < crease.length; i++) {
        const px = silStartX + crease[i][0] * silWidth;
        const py = crease[i][1] * silhouetteMaxH;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // Human-readable text
  if (opt.includeText) {
    ctx.fillStyle = opt.barColor;
    ctx.font = `bold ${opt.textFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const spaced = encoded.text.split('').join(' ');
    ctx.fillText(spaced, totalSvgWidth / 2, totalH + 2);
  }

  ctx.restore();

  return {
    svg: '',
    width: totalSvgWidth,
    height: viewBoxH,
    scanBandHeight: scanBandH,
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

/**
 * Measures run lengths of alternating black/white pixels in a row.
 * Returns array of { isBar: boolean, length: number }.
 */
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

/**
 * Matches a 6-element normalized run pattern against CODE128_PATTERNS.
 */
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

/**
 * Decodes Code 128 Set B from runs of pixels.
 */
export function decodeCode128BFromRuns(
  runs: Array<{ isBar: boolean; length: number }>,
  expectedText: string
): { passed: boolean; decodedText: string | null; error: string | null; moduleWidth: number; totalModules: number; readChecksum: number | null; expectedChecksum: number | null } {
  // 1. Search for START B pattern: [2, 1, 1, 4, 1, 2] (length 6, sums to 11 modules)
  let startIdx = -1;
  let estimatedModuleWidth = 0;

  for (let i = 0; i <= runs.length - 7; i++) {
    if (!runs[i].isBar) continue; // Must start with a black bar
    // Preceding run should be a space (quiet zone)
    if (i > 0 && runs[i - 1].length < 6) continue;

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
      error: 'Code128 START B pattern not found in scan row',
      moduleWidth: 0,
      totalModules: 0,
      readChecksum: null,
      expectedChecksum: null
    };
  }

  // 2. Decode characters sequentially
  const decodedValues: number[] = [];
  let runIdx = startIdx + 6;
  let stopFound = false;
  let totalModulesAcc = 11;

  while (runIdx <= runs.length - 6) {
    // Check if next 7 runs match STOP (106: [2, 3, 3, 1, 1, 1, 2], sums to 13)
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

  // 3. Separate data characters and checksum
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

  // 4. Map values to Code128 Set B ASCII characters (value + 32)
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
 * extracts pixel run-lengths across the scan band row, and decodes Code 128-B.
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

  const barcodeY = region.y ?? (h > 300 ? 180 : 84);
  const totalH = region.totalHeight ?? (h > 300 ? 160 : 120);
  const scanH = region.scanBandHeight ?? (h > 300 ? 52 : 48);

  // Scan multiple rows within the protected scan band
  const sampleRows = [
    Math.min(h - 4, Math.max(0, Math.round(barcodeY + totalH - scanH * 0.50))),
    Math.min(h - 4, Math.max(0, Math.round(barcodeY + totalH - scanH * 0.25))),
    Math.min(h - 4, Math.max(0, Math.round(barcodeY + totalH - scanH * 0.75)))
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
