import { classifyExtra, drawExtra, extractHolesCount, isFreeFormPanel, isPanelPair, PANEL_PAIR_GAP_RATIO } from './axoExtra';
import { classifyMirror, drawMirror } from './axoMirrors';
import type { AxoMirrorClass } from './axoMirrors';
import type { AxoExtraClass } from './axoExtra';
import { classifyGeometry } from './geometry';
import type { Geometry } from './geometry';
import { resolveStonePalette, resolveItemColor, enhanceStoneColor, boostAquaBandInMap } from './canonicalColors';
import type { StonePalette } from './canonicalColors';

export { resolveStonePalette, resolveItemColor };
export type { StonePalette };

export type AxoGeom = Geometry | 'diamond-table';

export interface AxoBoundingBoxOptions {
    showBoundingBox?: boolean;
    showDimensionLabels?: boolean;
    showMeasurementTicks?: boolean;
    hairlineColor?: string;
    unit?: string;
    rawDimensions?: { w?: number; h?: number; d?: number };
}

export function parseHexMapString(hexMapString?: string): string[] {
    if (!hexMapString) return [];
    const trimmed = hexMapString.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((s: any) => String(s).trim())
                    .filter(s => /^#?[0-9A-Fa-f]{3,8}$/.test(s))
                    .map(s => s.startsWith('#') ? s : `#${s}`);
            }
        } catch {}
    }
    return trimmed
        .replace(/[\[\]"']/g, '')
        .split(',')
        .map(s => s.trim())
        .filter(s => /^#?[0-9A-Fa-f]{3,8}$/.test(s))
        .map(s => s.startsWith('#') ? s : `#${s}`);
}

/** Mean saturation of a hex-map string's STONE pixels (near-white backdrop cells
 * excluded) -- used to pick the "lights on" photo angle among several, since no
 * explicit lit flag exists per photo. Backlit shots read as vivid saturated
 * ambers/oranges; ambient ones as desaturated gray-tan. Plain mean brightness
 * doesn't work here: every angle's grid is 60-80% identical white backdrop
 * padding, which swamps the difference between the stone pixels themselves. */
function avgHexMapVividness(hexMapString: string): number {
    const colors = parseHexMapString(hexMapString.replace(/^\d+x\d+:/, ''));
    let total = 0;
    let stoneCount = 0;
    for (const c of colors) {
        const h = c.replace('#', '');
        const r = parseInt(h.slice(0, 2), 16) || 0;
        const g = parseInt(h.slice(2, 4), 16) || 0;
        const b = parseInt(h.slice(4, 6), 16) || 0;
        if (r >= 240 && g >= 240 && b >= 240) continue; // backdrop, not stone
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max > 0 ? (max - min) / max : 0;
        total += saturation;
        stoneCount++;
    }
    return stoneCount > 0 ? total / stoneCount : 0;
}

/**
 * Normalises a hex map matrix extracted from cutout images.
 * Detects empty/white background cells, computes the bounding box of genuine onyx stone pixels,
 * crops out the background, infills internal holes with nearest-neighbor stone sampling,
 * and resamples the resulting dense stone matrix to targetCols x targetRows.
 */
export function normalizeHexMapTexture(
    hexList: string[],
    srcCols: number,
    srcRows: number,
    targetCols = 20,
    targetRows = 20
): string[] {
    if (!hexList || hexList.length === 0) return [];

    const toOpaqueHex = (h: string): string => {
        if (!h) return '#CCCCCC';
        const clean = String(h).trim().replace(/^#/, '');
        if (clean.length >= 6) {
            return `#${clean.slice(0, 6)}`;
        }
        if (clean.length === 3 || clean.length === 4) {
            return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
        }
        return `#${clean}`;
    };

    // If small palette (from vein colors or canonical stone palette fallback), generate natural mineral strata
    if (hexList.length < 16) {
        const palette = hexList.map(s => toOpaqueHex(s));
        const veined: string[] = [];
        for (let r = 0; r < targetRows; r++) {
            for (let c = 0; c < targetCols; c++) {
                const u = c / targetCols;
                const v = r / targetRows;
                const wave = Math.sin(v * Math.PI * 3.5 + Math.sin(u * Math.PI * 2.0) * 0.8) * 0.5 + 0.5;
                const idx = Math.min(palette.length - 1, Math.floor(wave * palette.length));
                veined.push(palette[idx]);
            }
        }
        return veined;
    }

    // Helper: Parse any hex string to RGBA numbers
    const parseRgba = (hex: string): { r: number; g: number; b: number; a: number } | null => {
        if (!hex) return null;
        let s = String(hex).trim().replace(/^#/, '');
        if (s.length === 3) {
            s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2] + 'ff';
        } else if (s.length === 6) {
            s += 'ff';
        } else if (s.length === 4) {
            s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
        } else if (s.length === 8) {
            // ok
        } else {
            return null;
        }
        const num = parseInt(s, 16);
        if (Number.isNaN(num)) return null;
        return {
            r: (num >> 24) & 0xff,
            g: (num >> 16) & 0xff,
            b: (num >> 8) & 0xff,
            a: num & 0xff,
        };
    };

    // Helper: Detect cutout white / empty / transparent background cell
    const isStoneCell = (hex: string): boolean => {
        const rgba = parseRgba(hex);
        if (!rgba) return false;
        // Transparent or low opacity cutout
        if (rgba.a < 32) return false;
        // Background white / near-white cutout
        if (rgba.r >= 248 && rgba.g >= 248 && rgba.b >= 248) return false;
        return true;
    };

    // 1. Build 2D matrix
    const grid: string[][] = [];
    for (let r = 0; r < srcRows; r++) {
        const row: string[] = [];
        for (let c = 0; c < srcCols; c++) {
            row.push(hexList[r * srcCols + c] || '');
        }
        grid.push(row);
    }

    // 2. Find bounding box of real stone
    let minX = srcCols;
    let maxX = -1;
    let minY = srcRows;
    let maxY = -1;
    let stoneCoords: { r: number; c: number; hex: string }[] = [];

    for (let r = 0; r < srcRows; r++) {
        for (let c = 0; c < srcCols; c++) {
            if (isStoneCell(grid[r][c])) {
                stoneCoords.push({ r, c, hex: grid[r][c] });
                if (c < minX) minX = c;
                if (c > maxX) maxX = c;
                if (r < minY) minY = r;
                if (r > maxY) maxY = r;
            }
        }
    }

    // Fallback if image was all white or empty (e.g. pure white marble or uniform stone)
    if (stoneCoords.length === 0 || minX > maxX || minY > maxY) {
        minX = 0;
        maxX = srcCols - 1;
        minY = 0;
        maxY = srcRows - 1;
        for (let r = 0; r < srcRows; r++) {
            for (let c = 0; c < srcCols; c++) {
                const rgba = parseRgba(grid[r][c]);
                if (rgba && rgba.a >= 32) {
                    stoneCoords.push({ r, c, hex: grid[r][c] });
                }
            }
        }
    }

    // 3. Crop matrix to stone bounding box
    const cropW = Math.max(1, maxX - minX + 1);
    const cropH = Math.max(1, maxY - minY + 1);
    const cropped: string[][] = [];
    for (let r = minY; r <= maxY; r++) {
        const row: string[] = [];
        for (let c = minX; c <= maxX; c++) {
            row.push(grid[r] && grid[r][c] ? grid[r][c] : '');
        }
        cropped.push(row);
    }

    // 4. Fill internal empty/background cells with nearest valid stone neighbor
    if (stoneCoords.length > 0) {
        for (let r = 0; r < cropH; r++) {
            for (let c = 0; c < cropW; c++) {
                if (!cropped[r][c] || !isStoneCell(cropped[r][c])) {
                    let bestDist = Infinity;
                    let bestHex = stoneCoords[0].hex;
                    for (let k = 0; k < stoneCoords.length; k++) {
                        const sc = stoneCoords[k];
                        const d = (sc.r - (minY + r)) * (sc.r - (minY + r)) + (sc.c - (minX + c)) * (sc.c - (minX + c));
                        if (d < bestDist) {
                            bestDist = d;
                            bestHex = sc.hex;
                        }
                    }
                    cropped[r][c] = bestHex;
                }
            }
        }
    }

    // 5. Resample / scale to targetCols x targetRows
    const result: string[] = [];
    for (let tr = 0; tr < targetRows; tr++) {
        const srcR = Math.min(cropH - 1, Math.floor((tr / targetRows) * cropH));
        for (let tc = 0; tc < targetCols; tc++) {
            const srcC = Math.min(cropW - 1, Math.floor((tc / targetCols) * cropW));
            const hex = (cropped[srcR] && cropped[srcR][srcC]) || (stoneCoords[0] && stoneCoords[0].hex) || '#CCCCCC';
            result.push(toOpaqueHex(hex));
        }
    }

    // Aqua Serpentine's teal band gets extra vibrance before the general stone enhancement.
    return boostAquaBandInMap(result).map(enhanceStoneColor);
}

/**
 * Blends multiple hex map strings (e.g. from lights-on and lights-off states, or multiple photo angles)
 * into a single unified average hex map matrix.
 */
export function blendHexMapStrings(mapStrings: string[]): string | undefined {
    if (!mapStrings || mapStrings.length === 0) return undefined;
    const valid = mapStrings.filter(s => s && typeof s === 'string' && s.trim().length > 0);
    if (valid.length === 0) return undefined;
    if (valid.length === 1) return valid[0];

    interface ParsedMap {
        cols: number;
        rows: number;
        list: string[];
    }

    const parsedMaps: ParsedMap[] = [];
    for (const str of valid) {
        let cols = 20, rows = 20;
        let hexStr = str;
        const dimMatch = str.match(/^(\d+)x(\d+):([\s\S]+)$/);
        if (dimMatch) {
            cols = parseInt(dimMatch[1], 10);
            rows = parseInt(dimMatch[2], 10);
            hexStr = dimMatch[3];
        }
        const list = parseHexMapString(hexStr);
        if (list.length > 0) {
            if (!dimMatch) {
                if (list.length === 180) { cols = 9; rows = 20; }
                else if (list.length === 300) { cols = 20; rows = 15; }
                else if (list.length === 160) { cols = 20; rows = 8; }
                else {
                    cols = Math.max(1, Math.round(Math.sqrt(list.length)));
                    rows = Math.ceil(list.length / cols);
                }
            }
            parsedMaps.push({ cols, rows, list });
        }
    }

    if (parsedMaps.length === 0) return undefined;
    if (parsedMaps.length === 1) {
        return `${parsedMaps[0].cols}x${parsedMaps[0].rows}:${parsedMaps[0].list.join(',')}`;
    }

    // Common target dimensions from first valid map
    const targetCols = parsedMaps[0].cols;
    const targetRows = parsedMaps[0].rows;
    const totalCells = targetCols * targetRows;

    const resampledMaps: string[][] = parsedMaps.map(m => {
        if (m.cols === targetCols && m.rows === targetRows && m.list.length === totalCells) {
            return m.list;
        }
        return normalizeHexMapTexture(m.list, m.cols, m.rows, targetCols, targetRows);
    });

    const parseRgb = (hex: string): { r: number; g: number; b: number } | null => {
        let s = (hex || '').trim().replace(/^#/, '');
        if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
        if (s.length >= 6) {
            const num = parseInt(s.slice(0, 6), 16);
            if (!isNaN(num)) return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
        }
        return null;
    };
    const isStone = (rgb: { r: number; g: number; b: number } | null) => {
        if (!rgb) return false;
        return !(rgb.r >= 248 && rgb.g >= 248 && rgb.b >= 248);
    };

    const blendedList: string[] = [];
    for (let i = 0; i < totalCells; i++) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;

        for (const m of resampledMaps) {
            const hex = m[i] || '';
            const rgb = parseRgb(hex);
            if (isStone(rgb)) {
                sumR += rgb!.r;
                sumG += rgb!.g;
                sumB += rgb!.b;
                count++;
            }
        }

        if (count > 0) {
            const r = Math.round(sumR / count).toString(16).padStart(2, '0');
            const g = Math.round(sumG / count).toString(16).padStart(2, '0');
            const b = Math.round(sumB / count).toString(16).padStart(2, '0');
            blendedList.push(`#${r}${g}${b}`.toUpperCase());
        } else {
            blendedList.push('#FFFFFF');
        }
    }

    return `${targetCols}x${targetRows}:${blendedList.join(',')}`;
}

/**
 * Extracts a hex map or texture string from an item across all known database fields:
 * spatial_points (with cols/rows), processed_media_urls._pixel_map_hex, item.hexMap,
 * item.hex_map, vein_svg_urls, or vein colors/palette.
 *
 * Returns the FIRST valid source found, in the priority order below -- it does not blend
 * multiple photo angles or states together. Cell-wise averaging of different angles has no
 * spatial meaning (different angles = different silhouettes and positions), and the
 * per-angle processed_media_urls._pixel_map_hex_N strings carry no stored dimensions, so
 * blending them with the correctly-dimensioned spatial_points grid silently reshaped and
 * corrupted it for every non-square/portrait item (Chief review, 25 Oct 2026 -- this used
 * to blend everything via blendHexMapStrings; reverted to first-found precedence, matching
 * the comment on persist.ts's hero-grid write).
 */
export function extractItemHexMapString(item: any): string | undefined {
    if (!item) return undefined;
    const it = item.data ? { ...item.data, ...item } : item;

    // 1. Direct fields
    if (it.hexMap && typeof it.hexMap === 'string') return it.hexMap;
    if (it.hex_map && typeof it.hex_map === 'string') return it.hex_map;
    if (Array.isArray(it.hexMap) && it.hexMap.length > 0) return JSON.stringify(it.hexMap);
    if (Array.isArray(it.hex_map) && it.hex_map.length > 0) return JSON.stringify(it.hex_map);
    if (it.hexString && typeof it.hexString === 'string') return it.hexString;
    if (it.hex_string && typeof it.hex_string === 'string') return it.hex_string;
    if (it.hexMap && typeof it.hexMap === 'object' && it.hexMap.hexString) return String(it.hexMap.hexString);

    // 2. spatial_points -- the most vivid (saturated) entry wins (an array can hold
    // multiple photo angles/states; a backlit "lights on" shot reads as saturated
    // ambers/oranges where an ambient one reads as desaturated gray-tan, which is
    // the only lit/unlit signal this schema stores -- there is no explicit lit flag
    // per photo). Single-entry items are unaffected. Entries are not blended.
    const sp = it.spatial_points || it.spatialPoints;
    if (sp) {
        let parsedSp = sp;
        if (typeof parsedSp === 'string') {
            try { parsedSp = JSON.parse(parsedSp); } catch {}
        }
        if (Array.isArray(parsedSp)) {
            let best: { hex: string; dims?: string; vividness: number } | undefined;
            for (const p of parsedSp) {
                if (p && (p.type === 'pixel_map' || p.hex_string || p.hexString || p.hex_map)) {
                    const hex = p.hex_string || p.hexString || p.hex_map || (Array.isArray(p.hexList) ? JSON.stringify(p.hexList) : undefined);
                    if (hex) {
                        const dims = (p.cols && p.rows) ? `${p.cols}x${p.rows}` : p.dimensions;
                        const vividness = avgHexMapVividness(hex);
                        if (!best || vividness > best.vividness) best = { hex, dims, vividness };
                    }
                }
            }
            if (best) return best.dims ? `${best.dims}:${best.hex}` : best.hex;
        } else if (parsedSp && typeof parsedSp === 'object') {
            if (parsedSp.hex_string || parsedSp.hexString || parsedSp.hex_map) {
                const hex = parsedSp.hex_string || parsedSp.hexString || parsedSp.hex_map;
                const dims = (parsedSp.cols && parsedSp.rows) ? `${parsedSp.cols}x${parsedSp.rows}` : parsedSp.dimensions;
                return dims ? `${dims}:${hex}` : hex;
            }
        }
    }

    // 3. processed_media_urls._pixel_map_hex -- the master/hero key only. The _pixel_map_hex_0,
    // _pixel_map_hex_1... keys are raw per-angle duplicates of the same spatial_points data
    // with no stored dimensions; they are kept in the DB as a record, not read here.
    const pmu = it.processed_media_urls || it.processedMediaUrls;
    let parsedPmu: any = pmu;
    if (pmu) {
        if (typeof parsedPmu === 'string') {
            try { parsedPmu = JSON.parse(parsedPmu); } catch {}
        }
        if (parsedPmu && typeof parsedPmu === 'object') {
            const val = parsedPmu._pixel_map_hex || parsedPmu.pixel_map_hex;
            if (typeof val === 'string' && val.length > 0) {
                const dims = parsedPmu.dimensions;
                return dims ? `${dims}:${val}` : val;
            }
        }
    }

    // 4. media or photos array -- first hit wins
    const media = it.media || it.photos;
    if (Array.isArray(media)) {
        for (const m of media) {
            if (m && typeof m === 'object') {
                const mHex = m.hex_string || m.hexString || m.hex_map || m.pixel_map_hex;
                if (mHex && typeof mHex === 'string') return mHex;
                if (m.spatial_points) {
                    const subHex = extractItemHexMapString(m);
                    if (subHex) return subHex;
                }
            }
        }
    }

    // 5. vein_svg_urls / vein colors fallback
    const vUrls = it.vein_svg_urls || it.veinSvgUrls || (parsedPmu && typeof parsedPmu === 'object' ? parsedPmu.vein_svg_urls : undefined);
    if (vUrls) {
        let parsedV = vUrls;
        if (typeof parsedV === 'string') {
            try { parsedV = JSON.parse(parsedV); } catch { parsedV = [parsedV]; }
        }
        if (Array.isArray(parsedV) && parsedV.length > 0) {
            const colorMatches: string[] = [];
            for (const u of parsedV) {
                if (typeof u === 'string') {
                    const matches = u.match(/(?:%23|[#])([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})/g);
                    if (matches) {
                        for (const m of matches) {
                            colorMatches.push(m.replace('%23', '#'));
                        }
                    }
                }
            }
            if (colorMatches.length > 0) {
                return JSON.stringify(colorMatches);
            }
        }
    }

    // 6. Direct vein_colors or vein_palette fallback
    const vc = it.vein_colors || it.veinColors || it.vein_palette || (parsedPmu && typeof parsedPmu === 'object' ? (parsedPmu.vein_colors || parsedPmu.vein_palette) : undefined);
    if (vc) {
        if (typeof vc === 'string') return vc;
        if (Array.isArray(vc) && vc.length > 0) return JSON.stringify(vc);
    }

    return undefined;
}

export function draw3DBoundingDimensionFrame(
    ctx: CanvasRenderingContext2D,
    geo: { W: number; H: number; D: number },
    helpers: {
        project: (x: number, y: number, z: number) => { u: number; v: number };
        scale: number;
        cx: number;
        cy: number;
        isDark?: boolean;
        wireframeColor?: string;
        /** Canvas resolution relative to the 400px baseline this frame's pixel constants were tuned for. */
        pxScale?: number;
    },
    options?: AxoBoundingBoxOptions,
    pass?: 'back' | 'front' | 'all'
): void {
    const { W, H, D } = geo;
    const { project, scale, cx, cy } = helpers;
    const pxScale = helpers.pxScale ?? 1;

    const toCanvas = (x: number, y: number, z: number) => {
        const p = project(x, y, z);
        return { x: cx + p.u * scale, y: cy + p.v * scale };
    };

    const b0 = toCanvas(0, 0, 0);     // front bottom
    const b1 = toCanvas(W, 0, 0);     // right bottom
    const b2 = toCanvas(W, 0, D);     // back bottom
    const b3 = toCanvas(0, 0, D);     // left bottom

    const t0 = toCanvas(0, H, 0);     // front top
    const t1 = toCanvas(W, H, 0);     // right top
    const t2 = toCanvas(W, H, D);     // back top
    const t3 = toCanvas(0, H, D);     // left top

    const isLight = helpers.wireframeColor === '#000000' || helpers.wireframeColor === 'black' || !helpers.isDark;
    const frontColor = options?.hairlineColor || (isLight ? 'rgba(30, 41, 59, 0.75)' : 'rgba(255, 255, 255, 0.70)');
    const backColor = options?.hairlineColor ? frontColor : (isLight ? 'rgba(100, 116, 139, 0.35)' : 'rgba(255, 255, 255, 0.28)');
    const tickColor = isLight ? 'rgba(15, 23, 42, 0.90)' : 'rgba(255, 255, 255, 0.92)';
    const textColor = isLight ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    const unit = options?.unit || 'cm';
    const isInch = unit === 'in' || unit === '"' || unit === 'inch';
    const rawW = options?.rawDimensions?.w !== undefined && options.rawDimensions.w !== null ? options.rawDimensions.w : W;
    const rawH = options?.rawDimensions?.h !== undefined && options.rawDimensions.h !== null ? options.rawDimensions.h : H;
    const rawD = options?.rawDimensions?.d !== undefined && options.rawDimensions.d !== null ? options.rawDimensions.d : D;

    const formatDim = (cmVal: number) => {
        if (!cmVal || isNaN(cmVal)) return `0 ${unit}`;
        if (isInch) {
            const inVal = cmVal / 2.54;
            const rounded = Math.round(inVal * 10) / 10;
            return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} ${unit}`;
        }
        return `${Math.round(cmVal)} ${unit}`;
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Back / occluded edges (dashed hairline)
    if (pass === 'back' || pass === 'all' || !pass) {
        ctx.beginPath();
        ctx.setLineDash([3 * pxScale, 3 * pxScale]);
        ctx.lineWidth = 1.0 * pxScale;
        ctx.strokeStyle = backColor;

        // b1 -> b2 -> b3
        ctx.moveTo(b1.x, b1.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.lineTo(b3.x, b3.y);
        // vertical back edge: b2 -> t2
        ctx.moveTo(b2.x, b2.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.stroke();
    }

    // 2. Front visible edges, hairline ticks, and dimension labels
    if (pass === 'front' || pass === 'all' || !pass) {
        ctx.setLineDash([]);
        ctx.lineWidth = 2.0 * pxScale;
        ctx.strokeStyle = frontColor;

        // Bottom visible: b3 -> b0 -> b1
        ctx.beginPath();
        ctx.moveTo(b3.x, b3.y);
        ctx.lineTo(b0.x, b0.y);
        ctx.lineTo(b1.x, b1.y);

        // Top face: t0 -> t1 -> t2 -> t3 -> t0
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.closePath();

        // Front / side verticals: b0 -> t0, b1 -> t1, b3 -> t3
        ctx.moveTo(b0.x, b0.y);
        ctx.lineTo(t0.x, t0.y);
        ctx.moveTo(b1.x, b1.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.moveTo(b3.x, b3.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.stroke();

        // Precision corner tick points (2.0px dot)
        const corners = [b0, b1, b3, t0, t1, t2, t3];
        ctx.fillStyle = tickColor;
        for (const pt of corners) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2.0 * pxScale, 0, 2 * Math.PI);
            ctx.fill();
        }

        const showTicks = options?.showMeasurementTicks !== false;
        const showLabels = options?.showDimensionLabels !== false;

        if (showTicks) {
            ctx.lineWidth = 1.6 * pxScale;
            ctx.strokeStyle = tickColor;

            const drawAxisTicks = (
                pStart: { x: number; y: number },
                pEnd: { x: number; y: number },
                outNormal: { x: number; y: number },
                fractions: number[]
            ) => {
                const dx = pEnd.x - pStart.x;
                const dy = pEnd.y - pStart.y;
                for (const f of fractions) {
                    const isMajor = f === 0 || f === 0.5 || f === 1;
                    const len = (isMajor ? 6.5 : 3.8) * pxScale;
                    const px = pStart.x + f * dx;
                    const py = pStart.y + f * dy;
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(px + outNormal.x * len, py + outNormal.y * len);
                    ctx.stroke();
                }
            };

            // Width ticks along b0 -> b1 (normal points outward down-right)
            const wDx = b1.x - b0.x;
            const wDy = b1.y - b0.y;
            const wLen = Math.hypot(wDx, wDy) || 1;
            let wNx = -wDy / wLen;
            let wNy = wDx / wLen;
            if (wNy < 0) { wNx = -wNx; wNy = -wNy; }
            drawAxisTicks(b0, b1, { x: wNx, y: wNy }, [0, 0.25, 0.5, 0.75, 1]);

            // Depth ticks along b0 -> b3 (normal points outward down-left)
            const dDx = b3.x - b0.x;
            const dDy = b3.y - b0.y;
            const dLen = Math.hypot(dDx, dDy) || 1;
            let dNx = dDy / dLen;
            let dNy = -dDx / dLen;
            if (dNy < 0) { dNx = -dNx; dNy = -dNy; }
            drawAxisTicks(b0, b3, { x: dNx, y: dNy }, [0, 0.25, 0.5, 0.75, 1]);

            // Height ticks along b1 -> t1 (vertical right, normal points right)
            drawAxisTicks(b1, t1, { x: 1, y: 0 }, [0, 0.25, 0.5, 0.75, 1]);
        }

        if (showLabels) {
            // 32px at the 400px baseline (vs. the old 13px) -- readable at the small
            // sizes these icons render at in cards, not just proportional to canvasSize.
            const labelFontPx = Math.round(32 * pxScale);
            ctx.font = `700 ${labelFontPx}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", monospace, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const drawHaloText = (text: string, x: number, y: number) => {
                ctx.save();
                ctx.strokeStyle = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.95)';
                ctx.lineWidth = 7 * pxScale;
                ctx.lineJoin = 'round';
                ctx.strokeText(text, x, y);
                ctx.fillStyle = textColor;
                ctx.fillText(text, x, y);
                ctx.restore();
            };

            // Width label (b0 -> b1)
            const wMidX = (b0.x + b1.x) / 2;
            const wMidY = (b0.y + b1.y) / 2;
            const wDx = b1.x - b0.x;
            const wDy = b1.y - b0.y;
            const wLen = Math.hypot(wDx, wDy) || 1;
            let wNx = -wDy / wLen;
            let wNy = wDx / wLen;
            if (wNy < 0) { wNx = -wNx; wNy = -wNy; }
            drawHaloText(formatDim(rawW), wMidX + wNx * 26 * pxScale, wMidY + wNy * 26 * pxScale);

            // Depth label (b0 -> b3)
            const dMidX = (b0.x + b3.x) / 2;
            const dMidY = (b0.y + b3.y) / 2;
            const dDx = b3.x - b0.x;
            const dDy = b3.y - b0.y;
            const dLen = Math.hypot(dDx, dDy) || 1;
            let dNx = dDy / dLen;
            let dNy = -dDx / dLen;
            if (dNy < 0) { dNx = -dNx; dNy = -dNy; }
            drawHaloText(formatDim(rawD), dMidX + dNx * 26 * pxScale, dMidY + dNy * 26 * pxScale);

            // Height label (b1 -> t1)
            const hMidX = (b1.x + t1.x) / 2;
            const hMidY = (b1.y + t1.y) / 2;
            drawHaloText(formatDim(rawH), hMidX + 30 * pxScale, hMidY);
        }
    }

    ctx.restore();
}

export interface ResolvedAxoGeometry {
    W: number;
    H: number;
    D: number;
    geom: AxoGeom;
    isMirror: boolean;
    /** One of the extra classes (lamps, hull, panel, wine rack, table) drawn by axoExtra.ts, else null. */
    extra?: AxoExtraClass | null;
    /** One of the stone slab mirror classes drawn by axoMirrors.ts, else null. */
    mirrorClass?: AxoMirrorClass | null;
    /** Wall panels only: single/pair and rect/free outline, which change the drawing at equal W/H/D. */
    panelVariant?: string;
}

/**
 * Resolves an item to the mesh the rasteriser will draw: its CLASS (delegated to
 * geometry.ts, which the tag filters share) plus the DIMENSIONS that class
 * implies.
 *
 * Split out of generateAxonometricDataUrl so callers can build a cache key from
 * what actually drives the drawing rather than from the raw row. Shape and
 * description are free text — ~500 rows carry a few hundred distinct strings, but
 * they collapse to 8 geometries and a normalised W/H/D triple here. Keying a
 * cache on the *resolved* output is what turns "one 400x400 canvas per card" into
 * "one per distinct silhouette".
 *
 * The two dimension adjustments below stay here rather than in geometry.ts
 * because they are about mesh proportions, not class, and no other consumer of
 * the taxonomy wants them.
 *
 * Pure — no canvas, no DOM. Safe to call on every render.
 */
export function resolveAxoGeometry(
    w_cm: number, h_cm: number, d_cm: number,
    shapeStr: string = '', descStr: string = ''
): ResolvedAxoGeometry {
    let W = w_cm;
    let H = h_cm;
    let D = d_cm;

    const s = (shapeStr || '').toLowerCase();
    const t = (descStr || '').toLowerCase();

    const isDiamondTable =
        t.includes('diamond table') ||
        s.includes('diamond table') ||
        t === 'diamond-table' ||
        s === 'diamond-table' ||
        ((t.includes('table') || t.includes('mesa')) && (s.includes('diamond') || s.includes('diamante') || t.includes('diamond') || t.includes('diamante')));

    if (isDiamondTable) {
        if (!W) W = 96;
        if (!H) H = 50;
        if (!D) D = 96;
    } else {
        if (!W) W = D || H || 10;
        // Plates are forced shallow and round regardless of what was measured, so this
        // test cannot be folded into classifyGeometry — it rewrites dimensions, and it
        // runs before classification because the mirror pass below reads the result.
        if (s.includes('plate') || t.includes('plate') || s.includes('plato') || t.includes('plato') || s.includes('tray') || t.includes('tray') || s.includes('dish') || t.includes('dish')) {
            if (!H) H = 5;
            // Force shallow round shape
            H = 5;
            W = Math.max(W, D);
            D = W;
        } else {
            if (!H) H = W;
        }
        if (!D) D = W;
    }

    const { geom: baseGeom, isMirror: baseIsMirror } = classifyGeometry(shapeStr, descStr);
    const geom: AxoGeom = isDiamondTable ? 'diamond-table' : baseGeom;
    const isMirror = isDiamondTable ? false : baseIsMirror;

    // Mirrors are thick stone slabs: round and squared ones need a square face, a rectangular one keeps its sides.
    const mirrorClass = isDiamondTable ? null : classifyMirror(shapeStr, descStr);
    if (mirrorClass === 'mirror-round' || mirrorClass === 'mirror-square') {
        const maxVal = Math.max(W, H);
        W = maxVal;
        H = maxVal;
    } else if (mirrorClass === 'mirror-rect') {
        D = Math.min(D, 12);
    } else if (geom === 'mirror') {
        const maxVal = Math.max(W, H, D);
        const minVal = Math.min(W, H, D);
        W = maxVal;
        H = maxVal;
        D = minVal;
    }

    const extra = isDiamondTable ? null : classifyExtra(shapeStr, descStr);
    let panelVariant: string | undefined;
    if (extra === 'tube') {
        D = W;
    } else if (extra === 'panel') {
        D = Math.min(D, Math.min(W, H) * 0.15, 8);
        const text = `${shapeStr} ${descStr}`;
        const pair = isPanelPair(text);
        // A pair's recorded width is per slab; the mesh and its frame cover both slabs and the seam.
        if (pair) W = W * (2 + PANEL_PAIR_GAP_RATIO);
        panelVariant = `${pair ? 'pair' : 'single'}-${isFreeFormPanel(text) ? 'free' : 'rect'}`;
    } else if (extra === 'hull') {
        W = Math.max(W, D * 2.5);
        H = Math.min(H, W * 0.25, 20);
    } else if (extra === 'wine-rack') {
        D = Math.min(D, 20);
    }

    return { W, H, D, geom, isMirror, extra, mirrorClass, panelVariant };
}

export async function generateAxonometricDataUrl(
    w_cm: number, h_cm: number, d_cm: number,
    shapeStr: string = '', descStr: string = '',
    wireframeColor?: string,
    asJpeg: boolean = false,
    hexMapString?: string,
    boundingBoxOptions?: boolean | AxoBoundingBoxOptions
): Promise<string> {
    return new Promise((resolve) => {
        const { W, H, D, geom, isMirror, extra, mirrorClass } = resolveAxoGeometry(w_cm, h_cm, d_cm, shapeStr, descStr);

        const cos30 = Math.cos(Math.PI / 6);
        const sin30 = Math.sin(Math.PI / 6);

        function project(x: number, y: number, z: number) {
            return {
                u: (x - z) * cos30,
                v: -y - (x + z) * sin30
            };
        }

        const v3d_box = [
            {x:0, y:0, z:0}, {x:W, y:0, z:0}, {x:W, y:0, z:D}, {x:0, y:0, z:D},
            {x:0, y:H, z:0}, {x:W, y:H, z:0}, {x:W, y:H, z:D}, {x:0, y:H, z:D}
        ];
        const projected_box = v3d_box.map(p => project(p.x, p.y, p.z));
        const uVals = projected_box.map(p => p.u);
        const vVals = projected_box.map(p => p.v);
        const minU = Math.min(...uVals), maxU = Math.max(...uVals);
        const minV = Math.min(...vVals), maxV = Math.max(...vVals);

        // Canvas bumped from the old 400px baseline -- cards now show this icon
        // free-floating at up to 210 CSS px (no frame to crop into), and at that
        // size the old resolution went soft. pxScale keeps every hairline/tick/
        // label pixel constant below proportional to the new size.
        const BASE_CANVAS = 400;
        const canvasSize = 640;
        const pxScale = canvasSize / BASE_CANVAS;
        const padding = 60 * pxScale;
        const scaleU = (canvasSize - padding * 2) / (maxU - minU || 1);
        const scaleV = (canvasSize - padding * 2) / (maxV - minV || 1);
        const scale = Math.min(scaleU, scaleV);

        const cx = canvasSize / 2 - ((minU + maxU) / 2) * scale;
        const cy = canvasSize / 2 - ((minV + maxV) / 2) * scale;

        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(''); return; }
        
        if (asJpeg) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const isWireframe = wireframeColor === 'black' || wireframeColor === 'wireframe' || wireframeColor === 'transparent' || wireframeColor === '#000000';

        const palette = resolveStonePalette({
            color: (wireframeColor && !wireframeColor.startsWith('rgba') && !wireframeColor.startsWith('#ef4444') && !wireframeColor.startsWith('#22c55e') && !wireframeColor.startsWith('#38bdf8') && !wireframeColor.startsWith('#eab308')) ? wireframeColor : undefined,
            shape: shapeStr,
            description: descStr,
            shortDescription: descStr,
        });

        // Canonical stone face tints (defaulting to the item's canonical stone colors, transparent if wireframe)
        const COLOR_TOP = isWireframe ? 'rgba(0,0,0,0)' : (palette.gradientColors[0] || palette.primary || '#F0F0F0');
        const COLOR_RIGHT = isWireframe ? 'rgba(0,0,0,0)' : (palette.gradientColors[1] || palette.secondary || '#D4D4D4');
        const COLOR_LEFT = isWireframe ? 'rgba(0,0,0,0)' : (palette.gradientColors[palette.gradientColors.length - 1] || palette.primary || '#9E9E9E');

        const strokeGradient = ctx.createLinearGradient(
            cx + minU * scale, cy + minV * scale,
            cx + maxU * scale, cy + maxV * scale
        );
        palette.gradientColors.forEach((col, idx) => {
            strokeGradient.addColorStop(idx / (palette.gradientColors.length - 1), col);
        });

        const COLOR_OUTLINE = strokeGradient;

        const shouldDrawBoundingBox =
            boundingBoxOptions === false ||
            (typeof boundingBoxOptions === 'object' && boundingBoxOptions.showBoundingBox === false)
                ? false
                : true;
        // Don't force a hairlineColor here -- an unset one lets drawBoundingBox's
        // own isLight/dark fallback apply (dark slate in light theme, dimmer back
        // edge for depth); forcing palette.primary unconditionally overrode that
        // theme-awareness (Chief review, 25 Oct 2026).
        const bboxOpts: AxoBoundingBoxOptions | undefined =
            typeof boundingBoxOptions === 'object'
                ? { rawDimensions: { w: w_cm, h: h_cm, d: d_cm }, ...boundingBoxOptions }
                : (boundingBoxOptions ? { rawDimensions: { w: w_cm, h: h_cm, d: d_cm } } : undefined);

        let hexPattern: CanvasPattern | null = null;
        let parsedHexList: string[] = [];
        let tCols = 60;
        let tRows = 60;

        try {
            if (hexMapString) {
                let sCols = 20;
                let sRows = 20;
                let hexStrToParse = hexMapString;

                // Support explicit "COLSxROWS:" dimensions prefix from spatial_points/dimensions
                const dimMatch = hexMapString.match(/^(\d+)x(\d+):([\s\S]+)$/);
                if (dimMatch) {
                    sCols = parseInt(dimMatch[1], 10);
                    sRows = parseInt(dimMatch[2], 10);
                    hexStrToParse = dimMatch[3];
                }

                const rawHexList = parseHexMapString(hexStrToParse);
                if (rawHexList.length > 0) {
                    if (!dimMatch) {
                        const len = rawHexList.length;
                        const isTall = H > W * 1.3;
                        if (len === 180) { sCols = isTall ? 9 : 20; sRows = isTall ? 20 : 9; }
                        else if (len === 300) { sCols = isTall ? 15 : 20; sRows = isTall ? 20 : 15; }
                        else if (len === 160) { sCols = isTall ? 8 : 20; sRows = isTall ? 20 : 8; }
                        else if (len === 3600) { sCols = 60; sRows = 60; }
                        else if (len === 6400) { sCols = 80; sRows = 80; }
                        else if (len === 400) { sCols = 20; sRows = 20; }
                        else if (len === 100) { sCols = 10; sRows = 10; }
                        else if (len === 64) { sCols = 8; sRows = 8; }
                        else if (len > 0 && len % 20 === 0) { sCols = 20; sRows = len / 20; }
                        else if (len > 0 && len % 16 === 0) { sCols = 16; sRows = len / 16; }
                        else {
                            sCols = Math.max(1, Math.round(Math.sqrt(len)));
                            sRows = Math.ceil(len / sCols);
                        }
                    }
                    parsedHexList = normalizeHexMapTexture(rawHexList, sCols, sRows, tCols, tRows);
                }
            }

            // Fallback: If no photo hex map, use canonical stone palette to build continuous veined texture
            if (!parsedHexList || parsedHexList.length === 0) {
                parsedHexList = normalizeHexMapTexture(palette.gradientColors, 4, 4, tCols, tRows);
            }

            if (parsedHexList && parsedHexList.length > 0) {
                const texCan = document.createElement('canvas');
                texCan.width = canvasSize;
                texCan.height = canvasSize;
                const texCtx = texCan.getContext('2d');
                if (texCtx) {
                    const cellW = canvasSize / tCols;
                    const cellH = canvasSize / tRows;
                    for (let r = 0; r < tRows; r++) {
                        for (let c = 0; c < tCols; c++) {
                            const idx = r * tCols + c;
                            const color = parsedHexList[idx] || palette.primary || '#CCCCCC';
                            texCtx.fillStyle = color.startsWith('#') ? color : `#${color}`;
                            texCtx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
                        }
                    }
                    hexPattern = ctx.createPattern(texCan, 'repeat');
                }
            }
        } catch (e) {
            console.error("Failed to generate stretched stone texture", e);
        }

        ctx.font = 'bold 18px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        function drawLabel(val: number, label: string, p1: {u:number, v:number}, p2: {u:number, v:number}, angle: number, offsetV: number) {
            // Text annotations removed: already printed on manifesto
            return;
        }

        ctx.lineWidth = 1.8;
        ctx.strokeStyle = strokeGradient;

        // Render back occluded edges of 3D bounding dimension frame
        if (shouldDrawBoundingBox) {
            draw3DBoundingDimensionFrame(
                ctx,
                { W, H, D },
                { project, scale, cx, cy, isDark: !asJpeg, wireframeColor, pxScale },
                bboxOpts,
                'back'
            );
        }

        if (mirrorClass) {
            drawMirror(ctx, mirrorClass, { W, H, D }, {
                project, scale, cx, cy,
                colorTop: COLOR_TOP, colorRight: COLOR_RIGHT, colorLeft: COLOR_LEFT, colorOutline: strokeGradient,
                lineWidth: 1.8, isWireframe, hexPattern,
                parsedHexList, tCols, tRows,
            });
            if (shouldDrawBoundingBox) {
                draw3DBoundingDimensionFrame(
                    ctx,
                    { W, H, D },
                    { project, scale, cx, cy, isDark: !asJpeg, wireframeColor, pxScale },
                    bboxOpts,
                    'front'
                );
            }
            resolve(canvas.toDataURL(asJpeg ? 'image/jpeg' : 'image/png', 1.0));
            return;
        }

        if (extra) {
            drawExtra(ctx, extra, { W, H, D }, {
                project, scale, cx, cy,
                colorTop: COLOR_TOP, colorRight: COLOR_RIGHT, colorLeft: COLOR_LEFT, colorOutline: strokeGradient,
                lineWidth: 1.8, holes: extractHolesCount(shapeStr, descStr), isWireframe, hexPattern,
                shapeText: `${shapeStr} ${descStr}`,
            });
            if (shouldDrawBoundingBox) {
                draw3DBoundingDimensionFrame(
                    ctx,
                    { W, H, D },
                    { project, scale, cx, cy, isDark: !asJpeg, wireframeColor, pxScale },
                    bboxOpts,
                    'front'
                );
            }
            resolve(canvas.toDataURL(asJpeg ? 'image/jpeg' : 'image/png', 1.0));
            return;
        }

        if (geom === 'cylinder') {
            const cb_u = (W/2 - D/2) * cos30;
            const cb_v = -(W/2 + D/2) * sin30;
            const ct_u = (W/2 - D/2) * cos30;
            const ct_v = -H - (W/2 + D/2) * sin30;

            const a = (W/2)*cos30, b = -(W/2)*sin30;
            const c = -(D/2)*cos30, d = -(D/2)*sin30;

            const t1 = Math.atan2(-D, W); // Right-most tangent parameter
            const t2 = Math.atan2(D, -W); // Left-most tangent parameter
            const x1 = Math.cos(t1), z1 = Math.sin(t1);
            const x2 = Math.cos(t2), z2 = Math.sin(t2);

            const u1 = a*x1 + c*z1, v1 = b*x1 + d*z1;
            const u2 = a*x2 + c*z2, v2 = b*x2 + d*z2;

            let tFrontStart = t2;
            let tFrontEnd = t1;
            if (tFrontEnd < tFrontStart) tFrontEnd += 2 * Math.PI;

            function drawEllipsePath(c_u: number, c_v: number, scaleFactor: number, tStart: number, tEnd: number) {
                ctx!.beginPath();
                for (let t = tStart; t <= tEnd + 0.05; t += 0.05) {
                    const ct = t > tEnd ? tEnd : t;
                    const x = Math.cos(ct), z = Math.sin(ct);
                    const u = a * x + c * z;
                    const v = b * x + d * z;
                    const px = cx + (c_u + u * scaleFactor) * scale;
                    const py = cy + (c_v + v * scaleFactor) * scale;
                    if (t === tStart) ctx!.moveTo(px, py);
                    else ctx!.lineTo(px, py);
                }
            }

            drawEllipsePath(cb_u, cb_v, 1.0, 0, 2 * Math.PI);
            ctx.fillStyle = COLOR_RIGHT;
            ctx.fill();
            if (isWireframe) ctx.stroke();

            drawEllipsePath(cb_u, cb_v, 1.0, tFrontStart, tFrontEnd);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u1)*scale, cy + (cb_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u1)*scale, cy + (ct_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u2)*scale, cy + (ct_v + v2)*scale);
            ctx.lineTo(cx + (cb_u + u2)*scale, cy + (cb_v + v2)*scale);
            ctx.closePath();
            
            if (hexPattern) {
                ctx.save();
                ctx.globalAlpha = isWireframe ? 0.0 : 1.0;
                ctx.fillStyle = hexPattern;
                ctx.fill();
                ctx.restore();
                const shGrd = ctx!.createLinearGradient(cx + (cb_u + u2)*scale, 0, cx + (cb_u + u1)*scale, 0);
                shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');
                shGrd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
                shGrd.addColorStop(1, 'rgba(0,0,0,0.15)');
                ctx.fillStyle = shGrd;
                ctx.fill();
            } else {
                const grd = ctx!.createLinearGradient(cx + (cb_u + u2)*scale, 0, cx + (cb_u + u1)*scale, 0);
                grd.addColorStop(0, COLOR_LEFT);
                grd.addColorStop(1, COLOR_RIGHT);
                ctx.fillStyle = grd;
                ctx.fill();
            }
            
            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u1)*scale, cy + (cb_v + v1)*scale);
            ctx.lineTo(cx + (ct_u + u1)*scale, cy + (ct_v + v1)*scale);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + (cb_u + u2)*scale, cy + (cb_v + v2)*scale);
            ctx.lineTo(cx + (ct_u + u2)*scale, cy + (ct_v + v2)*scale);
            ctx.stroke();

            drawEllipsePath(ct_u, ct_v, 1.0, 0, 2 * Math.PI);
            if (!isWireframe) {
                ctx.fillStyle = COLOR_TOP;
                ctx.fill();
            }
            if (hexPattern) {
                ctx.save();
                ctx.globalAlpha = isWireframe ? 0.0 : 1.0;
                ctx.fillStyle = hexPattern;
                ctx.fill();
                ctx.restore();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fill();
            }
            ctx.stroke();

            // Draw inner top ellipse (hollow interior or glass)
            drawEllipsePath(ct_u, ct_v, isMirror ? 0.85 : 0.75, 0, 2 * Math.PI);
            if (isWireframe) {
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fill();
                ctx.stroke();
                
                if (isMirror) {
                    ctx.beginPath();
                    const slashAngle = Math.PI / 4;
                    const len = (W/2) * 0.5 * scale;
                    const dx = Math.cos(slashAngle) * len;
                    const dy = Math.sin(slashAngle) * len;
                    ctx.moveTo(cx + ct_u*scale - dx, cy + ct_v*scale - dy);
                    ctx.lineTo(cx + ct_u*scale + dx, cy + ct_v*scale + dy);
                    ctx.moveTo(cx + ct_u*scale - dx + 8, cy + ct_v*scale - dy - 4);
                    ctx.lineTo(cx + ct_u*scale + dx + 8, cy + ct_v*scale + dy - 4);
                    ctx.stroke();
                }
            } else if (isMirror) {
                const faceGrd = ctx!.createLinearGradient(
                    cx + (ct_u - W/4)*scale, cy + (ct_v - W/4)*scale,
                    cx + (ct_u + W/4)*scale, cy + (ct_v + W/4)*scale
                );
                faceGrd.addColorStop(0, COLOR_TOP);
                faceGrd.addColorStop(0.45, COLOR_TOP);
                faceGrd.addColorStop(0.5, COLOR_RIGHT); // sleek diagonal glass shine
                faceGrd.addColorStop(0.55, COLOR_TOP);
                faceGrd.addColorStop(1, COLOR_TOP);
                ctx.fillStyle = faceGrd;
                ctx.fill();
                ctx.stroke();
            } else {
                if (!isWireframe) {
                    if (hexPattern) {
                        ctx!.save();
                        ctx!.globalAlpha = 1.0;
                        ctx!.fillStyle = hexPattern;
                        ctx!.fill();
                        ctx!.restore();
                        const holeGrd = ctx!.createLinearGradient(
                            cx + (ct_u) * scale, cy + (ct_v - (W/2)*sin30) * scale,
                            cx + (ct_u) * scale, cy + (ct_v + (W/2)*sin30) * scale
                        );
                        holeGrd.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
                        holeGrd.addColorStop(0.6, 'rgba(0, 0, 0, 0.28)');
                        holeGrd.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
                        ctx!.fillStyle = holeGrd;
                        ctx!.fill();
                    } else {
                        const holeGrd = ctx!.createLinearGradient(
                            cx + (ct_u) * scale, cy + (ct_v - (W/2)*sin30) * scale,
                            cx + (ct_u) * scale, cy + (ct_v + (W/2)*sin30) * scale
                        );
                        holeGrd.addColorStop(0, COLOR_LEFT);
                        holeGrd.addColorStop(1, COLOR_RIGHT);
                        ctx!.fillStyle = holeGrd;
                        ctx!.fill();
                    }
                }
                ctx!.stroke();
            }

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            const pRightBottom = {u: cx + (cb_u + u1)*scale, v: cy + (cb_v + v1)*scale};
            const pRightTop = {u: cx + (ct_u + u1)*scale, v: cy + (ct_v + v1)*scale};
            drawLabel(H, 'H', pRightBottom, pRightTop, Math.atan2(pRightTop.v - pRightBottom.v, pRightTop.u - pRightBottom.u), 25);

        } else if (geom === 'bowl' || geom === 'plate') {
            const ct_u = (W/2 - D/2) * cos30;
            const ct_v = -H - (W/2 + D/2) * sin30;
            const cb_u = (W/2 - D/2) * cos30;
            
            const a = (W/2)*cos30, b = -(W/2)*sin30;
            const c = -(D/2)*cos30, d = -(D/2)*sin30;

            function drawEllipsePath(c_u: number, c_v: number, scaleFactor: number, tStart: number, tEnd: number) {
                ctx!.beginPath();
                for (let t = tStart; t <= tEnd + 0.05; t += 0.05) {
                    const ct = t > tEnd ? tEnd : t;
                    const x = Math.cos(ct), z = Math.sin(ct);
                    const u = a * x + c * z;
                    const v = b * x + d * z;
                    const px = cx + (c_u + u * scaleFactor) * scale;
                    const py = cy + (c_v + v * scaleFactor) * scale;
                    if (t === tStart) ctx!.moveTo(px, py);
                    else ctx!.lineTo(px, py);
                }
            }

            // BOWL & PLATE rendering

                const tLowest = Math.atan2(-D, -W);
                const vLowest = b * Math.cos(tLowest) + d * Math.sin(tLowest);
                
                const visualH = Math.max(H, vLowest + Math.min(W, D) * 0.25);
                const cb_v = ct_v + visualH;

                const t1 = Math.atan2(-D, W); // Right tangent
                const t2 = Math.atan2(D, -W); // Left tangent
                const x1 = Math.cos(t1), z1 = Math.sin(t1);
                const x2 = Math.cos(t2), z2 = Math.sin(t2);

                const u1 = a*x1 + c*z1, v1 = b*x1 + d*z1;
                const u2 = a*x2 + c*z2, v2 = b*x2 + d*z2;

                const p0_u = cx + (ct_u + u2)*scale; // Left tangent
                const p0_v = cy + (ct_v + v2)*scale;
                const p2_u = cx + (ct_u + u1)*scale; // Right tangent
                const p2_v = cy + (ct_v + v1)*scale;
                
                const pm_u = cx + ct_u*scale; // Top center
                const pm_v = cy + ct_v*scale;
                
                const pBot_u = cx + cb_u*scale; // Bottom center
                const pBot_v = cy + cb_v*scale;

                const kappa = 0.55228;
                const hLeft = pBot_v - p0_v;
                const hRight = pBot_v - p2_v;
                
                const cp1_u = p0_u;
                const cp1_v = p0_v + kappa * hLeft;
                const cp2_u = pBot_u - kappa * (pBot_u - p0_u);
                const cp2_v = pBot_v;
                
                const cp3_u = pBot_u + kappa * (p2_u - pBot_u);
                const cp3_v = pBot_v;
                const cp4_u = p2_u;
                const cp4_v = p2_v + kappa * hRight;

                // Fill bowl body
                ctx.beginPath();
                ctx.moveTo(p0_u, p0_v);
                ctx.bezierCurveTo(cp1_u, cp1_v, cp2_u, cp2_v, pBot_u, pBot_v);
                ctx.bezierCurveTo(cp3_u, cp3_v, cp4_u, cp4_v, p2_u, p2_v);
                ctx.lineTo(pm_u, pm_v);
                ctx.closePath();
                
                if (hexPattern) {
                    ctx.save();
                    ctx.globalAlpha = isWireframe ? 0.0 : 1.0;
                    ctx.fillStyle = hexPattern;
                    ctx.fill();
                    ctx.restore();
                    const shGrd = ctx.createLinearGradient(p0_u, 0, p2_u, 0);
                    shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');
                    shGrd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
                    shGrd.addColorStop(1, 'rgba(0,0,0,0.2)');
                    ctx.fillStyle = shGrd;
                    ctx.fill();
                } else {
                    const grd = ctx.createLinearGradient(p0_u, 0, p2_u, 0);
                    grd.addColorStop(0, COLOR_LEFT);
                    grd.addColorStop(1, COLOR_RIGHT);
                    ctx.fillStyle = grd;
                    ctx.fill();
                }

                // Stroke bottom sweeping curve
                ctx.beginPath();
                ctx.moveTo(p0_u, p0_v);
                ctx.bezierCurveTo(cp1_u, cp1_v, cp2_u, cp2_v, pBot_u, pBot_v);
                ctx.bezierCurveTo(cp3_u, cp3_v, cp4_u, cp4_v, p2_u, p2_v);
                ctx.stroke();

                // Draw full top ellipse (outer rim)
                drawEllipsePath(ct_u, ct_v, 1.0, 0, 2 * Math.PI);
                if (!isWireframe) {
                    ctx.fillStyle = COLOR_TOP;
                    ctx.fill();
                }
                if (hexPattern) {
                    ctx.save();
                    ctx.globalAlpha = isWireframe ? 0.0 : 1.0;
                    ctx.fillStyle = hexPattern;
                    ctx.fill();
                    ctx.restore();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.fill();
                }
                ctx.stroke();

                // Draw inner top ellipse (hollow interior cavity)
                drawEllipsePath(ct_u, ct_v, 0.85, 0, 2 * Math.PI);
                if (!isWireframe) {
                    if (hexPattern) {
                        ctx.save();
                        ctx.globalAlpha = 1.0;
                        ctx.fillStyle = hexPattern;
                        ctx.fill();
                        ctx.restore();

                        // Soft concave interior depth shadow overlay (under back rim down into basin)
                        const innerGrd = ctx.createLinearGradient(
                            cx + ct_u * scale,
                            cy + (ct_v - (D / 2) * sin30) * scale,
                            cx + ct_u * scale,
                            cy + (ct_v + (D / 2) * sin30) * scale
                        );
                        innerGrd.addColorStop(0, 'rgba(0, 0, 0, 0.40)');
                        innerGrd.addColorStop(0.5, 'rgba(0, 0, 0, 0.18)');
                        innerGrd.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
                        ctx.fillStyle = innerGrd;
                        ctx.fill();
                    } else {
                        const innerGrd = ctx.createLinearGradient(
                            cx + ct_u * scale,
                            cy + (ct_v - (D / 2) * sin30) * scale,
                            cx + ct_u * scale,
                            cy + (ct_v + (D / 2) * sin30) * scale
                        );
                        innerGrd.addColorStop(0, COLOR_LEFT);
                        innerGrd.addColorStop(1, COLOR_RIGHT);
                        ctx.fillStyle = innerGrd;
                        ctx.fill();
                    }
                }
                ctx.stroke();

                // Draw concave basin floor
                drawEllipsePath(ct_u, ct_v + visualH * 0.28, 0.50, 0, 2 * Math.PI);
                if (!isWireframe) {
                    if (hexPattern) {
                        ctx.save();
                        ctx.globalAlpha = 1.0;
                        ctx.fillStyle = hexPattern;
                        ctx.fill();
                        ctx.restore();
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
                        ctx.fill();
                    } else {
                        ctx.fillStyle = COLOR_LEFT;
                        ctx.fill();
                    }
                }
                ctx.save();
                ctx.strokeStyle = strokeGradient;
                ctx.globalAlpha = 0.45;
                ctx.stroke();
                ctx.restore();

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);



        } else if (geom === 'mirror') {
            const R = Math.max(W, H) / 2;
            
            // Center of the back face (Z=D)
            const backCx = cx + project(W/2, H/2, D).u * scale;
            const backCy = cy + project(W/2, H/2, D).v * scale;
            
            // Center of the front face (Z=0)
            const frontCx = cx + project(W/2, H/2, 0).u * scale;
            const frontCy = cy + project(W/2, H/2, 0).v * scale;

            function traceIsoCircle(centerX: number, centerY: number, radius: number) {
                ctx!.beginPath();
                for (let t = 0; t <= 2 * Math.PI + 0.05; t += 0.05) {
                    const x = radius * Math.cos(t);
                    const y = radius * Math.sin(t);
                    const p = project(x, y, 0);
                    const ptX = centerX + p.u * scale;
                    const ptY = centerY + p.v * scale;
                    if (t === 0) ctx!.moveTo(ptX, ptY);
                    else ctx!.lineTo(ptX, ptY);
                }
                ctx!.closePath();
            }

            // 1. Draw back face
            traceIsoCircle(backCx, backCy, R);
            ctx!.fillStyle = COLOR_RIGHT;
            ctx!.fill();
            if (isWireframe) ctx!.stroke();

            // 2. Draw connecting rim
            const tTangent1 = -Math.PI/4;
            const tTangent2 = 3*Math.PI/4;
            const p1 = project(R * Math.cos(tTangent1), R * Math.sin(tTangent1), 0);
            const p2 = project(R * Math.cos(tTangent2), R * Math.sin(tTangent2), 0);

            ctx!.beginPath();
            ctx!.moveTo(backCx + p1.u * scale, backCy + p1.v * scale);
            ctx!.lineTo(frontCx + p1.u * scale, frontCy + p1.v * scale);
            ctx!.lineTo(frontCx + p2.u * scale, frontCy + p2.v * scale);
            ctx!.lineTo(backCx + p2.u * scale, backCy + p2.v * scale);
            ctx!.closePath();
            ctx!.fillStyle = COLOR_RIGHT;
            ctx!.fill();

            if (isWireframe) {
                // Outline the rim
                ctx!.beginPath();
                ctx!.moveTo(backCx + p1.u * scale, backCy + p1.v * scale);
                ctx!.lineTo(frontCx + p1.u * scale, frontCy + p1.v * scale);
                ctx!.moveTo(backCx + p2.u * scale, backCy + p2.v * scale);
                ctx!.lineTo(frontCx + p2.u * scale, frontCy + p2.v * scale);
                ctx!.stroke();
            }

            // 3. Draw front face
            traceIsoCircle(frontCx, frontCy, R);
            if (!isWireframe) {
                ctx!.fillStyle = COLOR_TOP;
                ctx!.fill();
            }
            if (hexPattern) {
                ctx!.save();
                ctx!.globalAlpha = isWireframe ? 0.0 : 1.0;
                ctx!.fillStyle = hexPattern;
                ctx!.fill();
                ctx!.restore();
                ctx!.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx!.fill();
            }
            ctx!.stroke();

            // 4. Draw inner glass
            const innerR = R * 0.85;
            traceIsoCircle(frontCx, frontCy, innerR);
            if (isWireframe) {
                ctx!.fillStyle = 'rgba(0,0,0,0)';
                ctx!.fill();
                ctx!.stroke();
                // Add wireframe slash
                ctx!.beginPath();
                const sp1 = project(innerR * Math.cos(Math.PI/4), innerR * Math.sin(Math.PI/4), 0);
                const sp2 = project(innerR * Math.cos(Math.PI/4 + Math.PI), innerR * Math.sin(Math.PI/4 + Math.PI), 0);
                ctx!.moveTo(frontCx + sp1.u*scale, frontCy + sp1.v*scale);
                ctx!.lineTo(frontCx + sp2.u*scale, frontCy + sp2.v*scale);
                
                const sp3 = project(innerR * Math.cos(Math.PI/4)*0.8, innerR * Math.sin(Math.PI/4)*0.8, 0);
                const sp4 = project(innerR * Math.cos(Math.PI/4 + Math.PI)*0.8, innerR * Math.sin(Math.PI/4 + Math.PI)*0.8, 0);
                ctx!.moveTo(frontCx + sp3.u*scale + 10, frontCy + sp3.v*scale - 5);
                ctx!.lineTo(frontCx + sp4.u*scale + 10, frontCy + sp4.v*scale - 5);
                ctx!.stroke();
            } else {
                const faceGrd = ctx!.createLinearGradient(
                    frontCx - R*scale, frontCy - R*scale,
                    frontCx + R*scale, frontCy + R*scale
                );
                faceGrd.addColorStop(0, COLOR_TOP);
                faceGrd.addColorStop(0.45, COLOR_TOP);
                faceGrd.addColorStop(0.5, COLOR_RIGHT);
                faceGrd.addColorStop(0.55, COLOR_TOP);
                faceGrd.addColorStop(1, COLOR_TOP);
                ctx!.fillStyle = faceGrd;
                ctx!.fill();
                ctx!.stroke();
            }

            // Labels
            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);

        } else if (geom === 'sphere') {
            const R = Math.max(W, H, D) / 2;
            const center3d = project(W/2, H/2, D/2);
            const ptX = cx + center3d.u * scale;
            const ptY = cy + center3d.v * scale;
            
            ctx!.beginPath();
            ctx!.arc(ptX, ptY, R * scale, 0, 2 * Math.PI);
            ctx!.closePath();

            const grd = ctx!.createRadialGradient(ptX - (R*0.3)*scale, ptY - (R*0.3)*scale, R*0.1*scale, ptX, ptY, R*scale);
            grd.addColorStop(0, COLOR_TOP);
            grd.addColorStop(0.7, COLOR_RIGHT);
            grd.addColorStop(1, COLOR_LEFT);
            
            if (hexPattern) {
                ctx!.save();
                ctx!.globalAlpha = isWireframe ? 0.0 : 1.0;
                ctx!.fillStyle = hexPattern;
                ctx!.fill();
                ctx!.restore();
                const shGrd = ctx!.createRadialGradient(ptX - (R*0.3)*scale, ptY - (R*0.3)*scale, R*0.1*scale, ptX, ptY, R*scale);
                shGrd.addColorStop(0, 'rgba(255,255,255,0.3)');
                shGrd.addColorStop(0.7, 'rgba(0,0,0,0.1)');
                shGrd.addColorStop(1, 'rgba(0,0,0,0.45)');
                ctx!.fillStyle = shGrd;
            } else if (isWireframe) {
                ctx!.fillStyle = 'rgba(0,0,0,0)';
            } else {
                ctx!.fillStyle = grd;
            }
            ctx!.fill();
            ctx!.stroke();

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);

        } else if (geom === 'octahedron') {
            const v3d = [
                {x: W/2, y: H, z: D/2}, // 0: Top
                {x: W/2, y: 0, z: D/2}, // 1: Bottom
                {x: 0, y: H/2, z: 0},   // 2: Front
                {x: W, y: H/2, z: 0},   // 3: Right
                {x: W, y: H/2, z: D},   // 4: Back
                {x: 0, y: H/2, z: D}    // 5: Left
            ];
            const projected = v3d.map(p => project(p.x, p.y, p.z));
            const pts = projected.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));

            function drawFace(indices: number[], color: string, shadeOverlay?: string) {
                ctx!.beginPath();
                ctx!.moveTo(pts[indices[0]].u, pts[indices[0]].v);
                for (let i = 1; i < indices.length; i++) ctx!.lineTo(pts[indices[i]].u, pts[indices[i]].v);
                ctx!.closePath();
                if (!isWireframe) {
                    ctx!.fillStyle = color;
                    ctx!.fill();
                }
                if (hexPattern) {
                    ctx!.save();
                    ctx!.globalAlpha = isWireframe ? 0.0 : 1.0;
                    ctx!.fillStyle = hexPattern;
                    ctx!.fill();
                    ctx!.restore();
                }
                if (shadeOverlay) {
                    ctx!.fillStyle = shadeOverlay;
                    ctx!.fill();
                }
                ctx!.stroke();
            }

            // Top-Left Face
            drawFace([0, 5, 2], COLOR_TOP, 'rgba(255, 255, 255, 0.15)');
            // Top-Right Face
            drawFace([0, 2, 3], COLOR_RIGHT, 'rgba(0, 0, 0, 0.15)');
            // Bottom-Left Face
            drawFace([1, 5, 2], COLOR_LEFT, 'rgba(0, 0, 0, 0.35)');
            
            // Bottom-Right Face
            drawFace([1, 2, 3], isWireframe ? 'rgba(0,0,0,0)' : '#A3A3A3', 'rgba(0, 0, 0, 0.25)');

            const boxPts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', boxPts[0], boxPts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', boxPts[0], boxPts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', boxPts[1], boxPts[5], Math.atan2(boxPts[5].v - boxPts[1].v, boxPts[5].u - boxPts[1].u), 25);

        } else if (geom === 'diamond-table') {
            const strokeWidth = 1.8;
            ctx!.lineWidth = strokeWidth;

            const tableOutlineColor = strokeGradient;
            ctx!.strokeStyle = tableOutlineColor;

            const N = 10;
            const wob = [1, 0.97, 1.02, 0.98, 1, 0.97, 1.03, 0.98, 1.01, 0.97];
            const cx3d = W / 2;
            const cz3d = D / 2;
            const rx = W / 2;
            const rz = D / 2;
            const topY = H;
            const girdleY = H * 0.8;
            const baseY = 0;

            interface Point3D { x: number; y: number; z: number; }
            interface Point2D { x: number; y: number; }

            const top3d: Point3D[] = [];
            const girdle3d: Point3D[] = [];
            const base3d: Point3D[] = [];

            for (let k = 0; k < N; k++) {
                const angTop = (k / N) * 2 * Math.PI + Math.PI / N;
                const angBase = ((k + 0.5) / N) * 2 * Math.PI + Math.PI / N;
                const rTop = wob[k];
                const rBase = 0.4 * wob[k];

                top3d.push({
                    x: cx3d + rx * rTop * Math.cos(angTop),
                    y: topY,
                    z: cz3d + rz * rTop * Math.sin(angTop),
                });
                girdle3d.push({
                    x: cx3d + rx * rTop * Math.cos(angTop),
                    y: girdleY,
                    z: cz3d + rz * rTop * Math.sin(angTop),
                });
                base3d.push({
                    x: cx3d + rx * rBase * Math.cos(angBase),
                    y: baseY,
                    z: cz3d + rz * rBase * Math.sin(angBase),
                });
            }

            function toCanvasPt(p: Point3D): Point2D {
                const pr = project(p.x, p.y, p.z);
                return {
                    x: cx + pr.u * scale,
                    y: cy + pr.v * scale,
                };
            }

            const topPts = top3d.map(toCanvasPt);
            const girdlePts = girdle3d.map(toCanvasPt);
            const basePts = base3d.map(toCanvasPt);

            function isFrontFacing(A: Point3D, B: Point3D, C: Point3D): boolean {
                const v1x = B.x - A.x, v1y = B.y - A.y, v1z = B.z - A.z;
                const v2x = C.x - A.x, v2y = C.y - A.y, v2z = C.z - A.z;
                const nx = v1y * v2z - v1z * v2y;
                const ny = v1z * v2x - v1x * v2z;
                const nz = v1x * v2y - v1y * v2x;
                return (-nx + ny - nz) > 0.0001;
            }

            function drawPolyFace(pts: Point2D[], fillColor: string, shadeOverlay?: string) {
                if (pts.length < 3) return;
                ctx!.beginPath();
                ctx!.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx!.lineTo(pts[i].x, pts[i].y);
                ctx!.closePath();

                if (!isWireframe) {
                    ctx!.fillStyle = fillColor;
                    ctx!.fill();
                }
                if (hexPattern) {
                    ctx!.save();
                    ctx!.globalAlpha = isWireframe ? 0.0 : 1.0;
                    ctx!.fillStyle = hexPattern;
                    ctx!.fill();
                    ctx!.restore();
                }
                if (shadeOverlay) {
                    ctx!.fillStyle = shadeOverlay;
                    ctx!.fill();
                }
                ctx!.stroke();
            }

            // 1. Triangular facets tapering from girdle down to base ring (alternating mid / dark by facing)
            for (let k = 0; k < N; k++) {
                const k1 = (k + 1) % N;

                // Downward triangle from girdle[k]..girdle[k1] to base[k] (mid shade)
                if (isFrontFacing(girdle3d[k], girdle3d[k1], base3d[k])) {
                    drawPolyFace(
                        [girdlePts[k], girdlePts[k1], basePts[k]],
                        COLOR_RIGHT,
                        'rgba(0, 0, 0, 0.15)'
                    );
                }

                // Upward triangle from base[k]..base[k1] to girdle[k1] (dark shade)
                if (isFrontFacing(base3d[k], base3d[k1], girdle3d[k1])) {
                    drawPolyFace(
                        [basePts[k], basePts[k1], girdlePts[k1]],
                        COLOR_LEFT,
                        'rgba(0, 0, 0, 0.35)'
                    );
                }
            }

            // 2. Girdle band quads (mid shade)
            for (let k = 0; k < N; k++) {
                const k1 = (k + 1) % N;
                if (isFrontFacing(top3d[k], top3d[k1], girdle3d[k1])) {
                    drawPolyFace(
                        [topPts[k], topPts[k1], girdlePts[k1], girdlePts[k]],
                        COLOR_RIGHT,
                        'rgba(0, 0, 0, 0.15)'
                    );
                }
            }

            // 3. Top decagon face (lightest shade)
            drawPolyFace(topPts, COLOR_TOP, 'rgba(255, 255, 255, 0.15)');

            // 4. Banded grain lines across top face (clipped to top decagon)
            ctx!.save();
            ctx!.beginPath();
            ctx!.moveTo(topPts[0].x, topPts[0].y);
            for (let i = 1; i < N; i++) ctx!.lineTo(topPts[i].x, topPts[i].y);
            ctx!.closePath();
            ctx!.clip();

            const grainParams = [
                { dx: -0.14, sway: 0.03 },
                { dx: 0.02, sway: 0.04 },
                { dx: 0.18, sway: 0.03 },
            ];

            ctx!.lineWidth = strokeWidth;
            ctx!.strokeStyle = tableOutlineColor;
            ctx!.lineCap = 'round';
            ctx!.lineJoin = 'round';

            for (const gp of grainParams) {
                const p1 = toCanvasPt({ x: cx3d + W * (gp.dx - gp.sway), y: topY, z: cz3d - D * 0.42 });
                const p2 = toCanvasPt({ x: cx3d + W * (gp.dx + gp.sway * 0.4), y: topY, z: cz3d - D * 0.14 });
                const p3 = toCanvasPt({ x: cx3d + W * (gp.dx - gp.sway * 0.6), y: topY, z: cz3d + D * 0.16 });
                const p4 = toCanvasPt({ x: cx3d + W * (gp.dx + gp.sway), y: topY, z: cz3d + D * 0.42 });

                ctx!.beginPath();
                ctx!.moveTo(p1.x, p1.y);
                ctx!.bezierCurveTo(p2.x, p2.y, p3.x, p3.y, p4.x, p4.y);
                ctx!.stroke();
            }
            ctx!.restore();

            // Re-stroke top decagon outline cleanly over grain line ends
            ctx!.beginPath();
            ctx!.moveTo(topPts[0].x, topPts[0].y);
            for (let i = 1; i < N; i++) ctx!.lineTo(topPts[i].x, topPts[i].y);
            ctx!.closePath();
            ctx!.stroke();

            const pts = projected_box.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);

        } else {
            const inset = geom === 'polyhedron' ? 0.3 : 0;
            const v3d = [
                {x:0, y:0, z:0}, {x:W, y:0, z:0}, {x:W, y:0, z:D}, {x:0, y:0, z:D},
                {x:W*inset, y:H, z:D*inset}, {x:W*(1-inset), y:H, z:D*inset}, 
                {x:W*(1-inset), y:H, z:D*(1-inset)}, {x:W*inset, y:H, z:D*(1-inset)}
            ];

            const projected = v3d.map(p => project(p.x, p.y, p.z));
            const pts = projected.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));

            function drawFace(indices: number[], color: string, shadeOverlay?: string) {
                ctx!.beginPath();
                ctx!.moveTo(pts[indices[0]].u, pts[indices[0]].v);
                for (let i = 1; i < indices.length; i++) ctx!.lineTo(pts[indices[i]].u, pts[indices[i]].v);
                ctx!.closePath();
                if (!isWireframe) {
                    ctx!.fillStyle = color;
                    ctx!.fill();
                }
                if (hexPattern) {
                    ctx!.save();
                    ctx!.globalAlpha = isWireframe ? 0.0 : 1.0;
                    ctx!.fillStyle = hexPattern;
                    ctx!.fill();
                    ctx!.restore();
                }
                if (shadeOverlay) {
                    ctx!.fillStyle = shadeOverlay;
                    ctx!.fill();
                }
                ctx!.stroke();
            }

            function drawProjectedHexGrid(faceType: 'front' | 'top' | 'left', shadeOverlay?: string) {
                if (!parsedHexList || parsedHexList.length === 0) return;
                const topInset = geom === 'polyhedron' ? 0.3 : 0;
                for (let r = 0; r < tRows; r++) {
                    for (let c = 0; c < tCols; c++) {
                        const idx = r * tCols + c;
                        const color = parsedHexList[idx] || parsedHexList[0] || '#CCCCCC';
                        const hexCol = color.startsWith('#') ? color : `#${color}`;
                        
                        let p1_3d, p2_3d, p3_3d, p4_3d;
                        if (faceType === 'front') {
                            const yRatio1 = (tRows - r) / tRows;
                            const yRatio2 = (tRows - (r + 1)) / tRows;
                            const insetLeft1 = W * topInset * yRatio1;
                            const insetRight1 = W * (1 - topInset * yRatio1);
                            const insetLeft2 = W * topInset * yRatio2;
                            const insetRight2 = W * (1 - topInset * yRatio2);
                            
                            const x1_top = insetLeft1 + (c / tCols) * (insetRight1 - insetLeft1);
                            const x2_top = insetLeft1 + ((c + 1) / tCols) * (insetRight1 - insetLeft1);
                            const x1_bot = insetLeft2 + (c / tCols) * (insetRight2 - insetLeft2);
                            const x2_bot = insetLeft2 + ((c + 1) / tCols) * (insetRight2 - insetLeft2);
                            
                            const y1 = H - (r / tRows) * H;
                            const y2 = H - ((r + 1) / tRows) * H;
                            const z1 = D * topInset * yRatio1;
                            const z2 = D * topInset * yRatio2;

                            p1_3d = { x: x1_top, y: y1, z: z1 };
                            p2_3d = { x: x2_top, y: y1, z: z1 };
                            p3_3d = { x: x2_bot, y: y2, z: z2 };
                            p4_3d = { x: x1_bot, y: y2, z: z2 };
                        } else if (faceType === 'top') {
                            const x1 = W * topInset + (c / tCols) * (W * (1 - 2 * topInset));
                            const x2 = W * topInset + ((c + 1) / tCols) * (W * (1 - 2 * topInset));
                            const z1 = D * topInset + (r / tRows) * (D * (1 - 2 * topInset));
                            const z2 = D * topInset + ((r + 1) / tRows) * (D * (1 - 2 * topInset));
                            p1_3d = { x: x1, y: H, z: z1 };
                            p2_3d = { x: x2, y: H, z: z1 };
                            p3_3d = { x: x2, y: H, z: z2 };
                            p4_3d = { x: x1, y: H, z: z2 };
                        } else { // left
                            const yRatio1 = (tRows - r) / tRows;
                            const yRatio2 = (tRows - (r + 1)) / tRows;
                            const insetFront1 = D * topInset * yRatio1;
                            const insetBack1 = D * (1 - topInset * yRatio1);
                            const insetFront2 = D * topInset * yRatio2;
                            const insetBack2 = D * (1 - topInset * yRatio2);
                            
                            const z1_top = insetFront1 + (c / tCols) * (insetBack1 - insetFront1);
                            const z2_top = insetFront1 + ((c + 1) / tCols) * (insetBack1 - insetFront1);
                            const z1_bot = insetFront2 + (c / tCols) * (insetBack2 - insetFront2);
                            const z2_bot = insetFront2 + ((c + 1) / tCols) * (insetBack2 - insetFront2);

                            const y1 = H - (r / tRows) * H;
                            const y2 = H - ((r + 1) / tRows) * H;
                            const x1 = W * topInset * yRatio1;
                            const x2 = W * topInset * yRatio2;

                            p1_3d = { x: x1, y: y1, z: z1_top };
                            p2_3d = { x: x1, y: y1, z: z2_top };
                            p3_3d = { x: x2, y: y2, z: z2_bot };
                            p4_3d = { x: x2, y: y2, z: z1_bot };
                        }

                        const p1 = project(p1_3d.x, p1_3d.y, p1_3d.z);
                        const p2 = project(p2_3d.x, p2_3d.y, p2_3d.z);
                        const p3 = project(p3_3d.x, p3_3d.y, p3_3d.z);
                        const p4 = project(p4_3d.x, p4_3d.y, p4_3d.z);

                        ctx!.beginPath();
                        ctx!.moveTo(p1.u * scale + cx, p1.v * scale + cy);
                        ctx!.lineTo(p2.u * scale + cx, p2.v * scale + cy);
                        ctx!.lineTo(p3.u * scale + cx, p3.v * scale + cy);
                        ctx!.lineTo(p4.u * scale + cx, p4.v * scale + cy);
                        ctx!.closePath();
                        ctx!.fillStyle = hexCol;
                        ctx!.fill();
                    }
                }
                if (shadeOverlay) {
                    const indices = faceType === 'top' ? [4, 5, 6, 7] : faceType === 'left' ? [0, 3, 7, 4] : [0, 1, 5, 4];
                    ctx!.beginPath();
                    ctx!.moveTo(pts[indices[0]].u, pts[indices[0]].v);
                    for (let i = 1; i < indices.length; i++) ctx!.lineTo(pts[indices[i]].u, pts[indices[i]].v);
                    ctx!.closePath();
                    ctx!.fillStyle = shadeOverlay;
                    ctx!.fill();
                    ctx!.stroke();
                }
            }

            if (parsedHexList && parsedHexList.length > 0) {
                ctx!.save();
                if (isWireframe) {
                    ctx!.globalAlpha = 0.55;
                }
                drawProjectedHexGrid('top', 'rgba(255, 255, 255, 0.22)');
                drawProjectedHexGrid('left', 'rgba(0, 0, 0, 0.16)');
                drawProjectedHexGrid('front', 'rgba(0, 0, 0, 0.04)');
                ctx!.restore();

                const strokeFace = (indices: number[]) => {
                    ctx!.beginPath();
                    ctx!.moveTo(pts[indices[0]].u, pts[indices[0]].v);
                    for (let i = 1; i < indices.length; i++) ctx!.lineTo(pts[indices[i]].u, pts[indices[i]].v);
                    ctx!.closePath();
                    ctx!.stroke();
                };
                strokeFace([4, 5, 6, 7]);
                strokeFace([0, 3, 7, 4]);
                strokeFace([0, 1, 5, 4]);
            } else {
                drawFace([4, 5, 6, 7], COLOR_TOP, 'rgba(255, 255, 255, 0.15)');
                drawFace([0, 3, 7, 4], COLOR_LEFT, 'rgba(0, 0, 0, 0.35)');
                drawFace([0, 1, 5, 4], COLOR_RIGHT, 'rgba(0, 0, 0, 0.15)');
            }

            if (isMirror) {
                // Find largest face to draw the glass on
                const areaLeft = D * H;
                const areaRight = W * H;
                const areaTop = W * D;
                const maxArea = Math.max(areaLeft, areaRight, areaTop);
                
                const frameX = Math.min(20, W * 0.3);
                const frameY = Math.min(20, H * 0.3);
                const frameZ = Math.min(20, D * 0.3);
                
                let glassPts3d = [];
                if (maxArea === areaRight) {
                    glassPts3d = [
                        {x: frameX, y: frameY, z: 0},
                        {x: W - frameX, y: frameY, z: 0},
                        {x: W - frameX, y: H - frameY, z: 0},
                        {x: frameX, y: H - frameY, z: 0}
                    ];
                } else if (maxArea === areaLeft) {
                    glassPts3d = [
                        {x: 0, y: frameY, z: frameZ},
                        {x: 0, y: frameY, z: D - frameZ},
                        {x: 0, y: H - frameY, z: D - frameZ},
                        {x: 0, y: H - frameY, z: frameZ}
                    ];
                } else {
                    glassPts3d = [
                        {x: frameX, y: H, z: frameZ},
                        {x: W - frameX, y: H, z: frameZ},
                        {x: W - frameX, y: H, z: D - frameZ},
                        {x: frameX, y: H, z: D - frameZ}
                    ];
                }
                
                const glassProjected = glassPts3d.map(p => project(p.x, p.y, p.z));
                const gPts = glassProjected.map(p => ({ u: p.u * scale + cx, v: p.v * scale + cy }));
                
                ctx.beginPath();
                ctx.moveTo(gPts[0].u, gPts[0].v);
                ctx.lineTo(gPts[1].u, gPts[1].v);
                ctx.lineTo(gPts[2].u, gPts[2].v);
                ctx.lineTo(gPts[3].u, gPts[3].v);
                ctx.closePath();
                
                const minGu = Math.min(...gPts.map(p=>p.u));
                const maxGu = Math.max(...gPts.map(p=>p.u));
                const minGv = Math.min(...gPts.map(p=>p.v));
                const maxGv = Math.max(...gPts.map(p=>p.v));
                
                const faceGrd = ctx!.createLinearGradient(
                    maxGu, minGv,
                    minGu, maxGv
                );
                faceGrd.addColorStop(0, COLOR_TOP);
                faceGrd.addColorStop(0.45, COLOR_TOP);
                faceGrd.addColorStop(0.5, COLOR_RIGHT);
                faceGrd.addColorStop(0.55, COLOR_TOP);
                faceGrd.addColorStop(1, COLOR_TOP);

                ctx.fillStyle = faceGrd;
                ctx.fill();
                ctx.stroke();
            }

            drawLabel(D, 'D', pts[0], pts[3], Math.PI / 6, 25);
            drawLabel(W, 'W', pts[0], pts[1], -Math.PI / 6, 25);
            drawLabel(H, 'H', pts[1], pts[5], Math.atan2(pts[5].v - pts[1].v, pts[5].u - pts[1].u), 25);
        }

        // Render front edges, precision ticks, and labels for the 3D bounding dimension frame
        if (shouldDrawBoundingBox) {
            draw3DBoundingDimensionFrame(
                ctx,
                { W, H, D },
                { project, scale, cx, cy, isDark: !asJpeg, wireframeColor, pxScale },
                bboxOpts,
                'front'
            );
        }

        resolve(canvas.toDataURL(asJpeg ? 'image/jpeg' : 'image/png', 1.0));
    });
}
