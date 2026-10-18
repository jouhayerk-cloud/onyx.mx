import { buildTypeFigure } from '../../features/entry/hairline/typeFigures';
import type { Dims, FigurePart } from '../../features/entry/hairline/types';
import { parseShapeText } from '../../features/entry/hairline/variantOptions';
import { canonicalType } from '../canonicalType';
import { resolveItemColor } from '../axonometric';

export interface AxoRenderParams {
    /** Canonical Type ID or raw type string. */
    typeId?: string | null;
    /** Raw shape string or sub-shape variant. */
    shape?: string | null;
    /** Width in cm (record value). */
    w?: number | null;
    /** Height in cm (record value). */
    h?: number | null;
    /** Length / Depth in cm (record value). */
    l?: number | null;
    /** Top opening: 'open' | 'closed'. */
    top?: string | null;
    /** Hole count for wine racks. */
    holes?: number | null;
    /** Outline stroke color (hex), default '#71717A'. */
    color?: string | null;
    /** Canvas background: 'white' (default, matches reference jpgs) | 'transparent'. */
    background?: 'white' | 'transparent';
}

export interface AxoRenderResult {
    dataUrl: string | null;
    figureExists: boolean;
    cacheKey: string;
}

const MAX_CACHE_ENTRIES = 240;
const iconCache = new Map<string, string>();

/** Convert a hex color string to rgba with given opacity. */
function hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '').trim();
    if (clean.length === 6) {
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    if (clean.length === 3) {
        const r = parseInt(clean[0] + clean[0], 16);
        const g = parseInt(clean[1] + clean[1], 16);
        const b = parseInt(clean[2] + clean[2], 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return hex;
}

/** Extract screen bounding box from all path strings in figure parts. */
function getFigureBBox(parts: FigurePart[]): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const coordRegex = /([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;

    for (const part of parts) {
        coordRegex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = coordRegex.exec(part.d)) !== null) {
            const x = parseFloat(m[1]);
            const y = parseFloat(m[2]);
            if (!Number.isNaN(x) && !Number.isNaN(y)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return { minX: 50, maxX: 350, minY: 50, maxY: 350 };
    }
    return { minX, maxX, minY, maxY };
}

/**
 * Generate a cache key from rendered item parameters.
 */
export function buildAxoCacheKey(params: AxoRenderParams): string {
    const typeId = params.typeId ?? '';
    const shape = params.shape ?? '';
    const top = params.top ?? '';
    const holes = params.holes ?? '';
    const w = params.w != null && params.w > 0 ? Math.round(params.w * 10) / 10 : '';
    const h = params.h != null && params.h > 0 ? Math.round(params.h * 10) / 10 : '';
    const l = params.l != null && params.l > 0 ? Math.round(params.l * 10) / 10 : '';
    const color = params.color ?? '#71717A';
    const bg = params.background ?? 'white';
    return `${typeId}|${shape}|${top}|${holes}|${w}x${h}x${l}|${color}|${bg}`;
}

function isDiamondTable(typeStr: string | null | undefined, shapeStr: string | null | undefined): boolean {
    const s = String(shapeStr ?? '').toLowerCase();
    const t = String(typeStr ?? '').toLowerCase();
    return (
        t.includes('diamond table') ||
        s.includes('diamond table') ||
        t === 'diamond-table' ||
        s === 'diamond-table' ||
        ((t.includes('table') || t.includes('mesa')) && (s.includes('diamond') || s.includes('diamante') || t.includes('diamond') || t.includes('diamante')))
    );
}

/**
 * Pure, deterministic renderer that draws an item's axo icon onto a 400x400 canvas.
 * Returns a PNG data URL or null if the figure geometry does not exist.
 */
export function renderAxoIconDataUrl(params: AxoRenderParams): string | null {
    if (typeof document === 'undefined') return null;

    const cacheKey = buildAxoCacheKey(params);
    const cached = iconCache.get(cacheKey);
    if (cached) return cached;

    // Resolve canonical id if not provided or raw
    const shapeStr = params.shape ?? '';
    const diamondTable = isDiamondTable(params.typeId, shapeStr);
    const canon = canonicalType(params.typeId, shapeStr);
    const id = diamondTable ? 'table' : (canon.id ?? (params.typeId ? params.typeId.toLowerCase().trim() : null));
    if (!id) return null;

    // Dimensions: w = Width, h = Height, d = Length (order from spec)
    const rawDims: Dims | null = (params.w != null && params.w > 0) || (params.h != null && params.h > 0) || (params.l != null && params.l > 0)
        ? {
            w: params.w != null && params.w > 0 ? params.w : 0,
            h: params.h != null && params.h > 0 ? params.h : 0,
            d: params.l != null && params.l > 0 ? params.l : 0,
        }
        : null;

    // Top: read from explicit param or parse from shape
    const effectiveShape = diamondTable ? 'diamond' : shapeStr;
    const parsedShape = parseShapeText(id, effectiveShape);
    const top = params.top ?? parsedShape.extra.top ?? null;
    const holes = params.holes ?? canon.holes ?? undefined;

    const parts = buildTypeFigure(id, rawDims, holes, effectiveShape, top);
    if (!parts || !parts.length) return null;

    const canvasSize = 400;
    const padding = 60;
    const targetSize = canvasSize - 2 * padding; // 280 x 280

    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const bg = params.background ?? 'white';
    if (bg === 'white') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvasSize, canvasSize);
    } else {
        ctx.clearRect(0, 0, canvasSize, canvasSize);
    }

    // Determine scale and translation to fit within targetSize padded box centered at (200, 200)
    const bbox = getFigureBBox(parts);
    const bw = bbox.maxX - bbox.minX || 1;
    const bh = bbox.maxY - bbox.minY || 1;
    const scale = Math.min(targetSize / bw, targetSize / bh);

    const sourceCenterX = (bbox.minX + bbox.maxX) / 2;
    const sourceCenterY = (bbox.minY + bbox.maxY) / 2;
    const targetCenterX = canvasSize / 2;
    const targetCenterY = canvasSize / 2;

    ctx.save();
    ctx.translate(targetCenterX, targetCenterY);
    ctx.scale(scale, scale);
    ctx.translate(-sourceCenterX, -sourceCenterY);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const outlineColor = params.color || '#71717A';
    const outlineLineWidth = 5 / scale;
    const creaseLineWidth = 2.5 / scale;
    const dimColor = hexToRgba(outlineColor, 0.5);

    // Color palette from spec (match axonometric.ts and reference icons)
    const COLOR_TOP = '#F0F0F0';
    const COLOR_RIGHT = '#D4D4D4';
    const COLOR_SLOT = '#06080B';

    for (const part of parts) {
        const path = new Path2D(part.d);
        switch (part.kind) {
            case 'plate':
                ctx.fillStyle = COLOR_TOP;
                ctx.fill(path);
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = outlineLineWidth;
                ctx.stroke(path);
                break;
            case 'face':
                ctx.fillStyle = COLOR_RIGHT;
                ctx.fill(path);
                ctx.strokeStyle = dimColor;
                ctx.lineWidth = creaseLineWidth;
                ctx.stroke(path);
                break;
            case 'crease':
                ctx.strokeStyle = dimColor;
                ctx.lineWidth = creaseLineWidth;
                ctx.stroke(path);
                break;
            case 'slot':
                ctx.fillStyle = COLOR_SLOT;
                ctx.fill(path);
                break;
            case 'mark':
                ctx.fillStyle = outlineColor;
                ctx.fill(path);
                break;
            case 'bright':
                ctx.fillStyle = outlineColor;
                ctx.fill(path);
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1.2 / scale;
                ctx.stroke(path);
                break;
        }
    }

    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png', 1.0);

    if (iconCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = iconCache.keys().next().value;
        if (oldestKey !== undefined) iconCache.delete(oldestKey);
    }
    iconCache.set(cacheKey, dataUrl);

    return dataUrl;
}

/** Convert a data URL directly into a Blob in memory without network calls. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
    try {
        const [header, base64] = dataUrl.split(',');
        if (!base64) return null;
        const mimeMatch = header.match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        return new Blob([array], { type: mime });
    } catch {
        return null;
    }
}

/**
 * Asynchronously returns a PNG Blob for an axo icon.
 */
export async function renderAxoIconBlob(params: AxoRenderParams): Promise<Blob | null> {
    const dataUrl = renderAxoIconDataUrl(params);
    if (!dataUrl) return null;
    return dataUrlToBlob(dataUrl);
}

/**
 * Extract axo render parameters from an inventory item record.
 */
export function describeItemForAxo(item: any): AxoRenderParams {
    const raw = (item && typeof item === 'object' && 'data' in item ? item.data : item) || {};

    const rawType = String(
        raw.short_description || raw.shortDescription || raw.type || item?.type || '',
    ).trim();
    const rawShape = String(raw.shape || item?.shape || '').trim();

    const diamondTable = isDiamondTable(rawType, rawShape);
    const canon = canonicalType(rawType, rawShape);
    const typeId = diamondTable ? 'table' : (canon.id ?? (rawType ? rawType.toLowerCase() : null));

    const w = parseFloat(raw.width_cm || raw.widthCm || item?.width_cm || item?.widthCm) || null;
    const h = parseFloat(raw.height_cm || raw.heightCm || item?.height_cm || item?.heightCm) || null;
    const l = parseFloat(
        raw.length_cm || raw.lengthCm || raw.depth_cm || raw.depthCm || item?.length_cm || item?.lengthCm || item?.depth_cm || item?.depthCm,
    ) || null;

    const parsedShape = parseShapeText(typeId, rawShape);
    const top = raw.top || parsedShape.extra.top || (rawShape.toLowerCase().includes('open') ? 'open' : rawShape.toLowerCase().includes('closed') ? 'closed' : null);
    const holes = canon.holes ?? (raw.holes ? parseInt(String(raw.holes), 10) : undefined);
    const color = resolveItemColor(raw);

    return {
        typeId,
        shape: diamondTable ? (rawShape || 'diamond') : (rawShape || null),
        w,
        h,
        l,
        top,
        holes,
        color,
        background: 'white',
    };
}

/**
 * Render axo icon directly from an inventory row.
 */
export function renderItemAxoIcon(item: any, overrides?: Partial<AxoRenderParams>): string | null {
    const params = { ...describeItemForAxo(item), ...overrides };
    return renderAxoIconDataUrl(params);
}
