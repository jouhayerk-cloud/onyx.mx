import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pipette, Sparkles, RotateCcw, Plus, Check, Sliders, RefreshCw, Wand2, Trash2 } from 'lucide-react';
import { Key, cx } from '../../components/ui';
import { tr } from '../../lib/i18n';
import { getCleanImageUrl, extractFileId, fetchImageBatch, extractItemHexString } from '../../lib/utils';
import { generateAxonometricDataUrl, parseHexMapString, resolveItemColor } from '../../lib/axonometric';
import {
    boostBowlHexColor,
    extractCustomBandShades,
    hexMapShades,
    isBowlItem,
    isHexMapBackground,
    liftBandColorForItem,
    resolveStonePaletteRaw,
} from '../../lib/canonicalColors';
import { clearAxoIconCache } from '../../lib/axoIconCache';
import { invalidateItemShades } from '../../lib/itemShades';
import { supabase } from '../../lib/supabase';
import { getDatabase } from '../../lib/database';
import { uploadCleanedImage } from '../../lib/bgReplace';
import toast from '../onyxIsland/notify/toast';
import type { EntryPhoto } from './entryModel';
import './hexColorMapEditor.css';

export interface HexColorMapEditorProps {
    row: Record<string, any>;
    photos: readonly EntryPhoto[];
    user?: unknown;
    disabled?: boolean;
    onHexMapSaved?: (patch: {
        spatial_points: any[];
        processed_media_urls: string;
        customBandShades?: string[];
    }) => void;
}

function parseHexToRgb(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{6})/i.exec((hex || '').trim());
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0');
    return (`#${clamp(r)}${clamp(g)}${clamp(b)}`).toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
    const sc = Math.min(1, Math.max(0, s));
    const lc = Math.min(1, Math.max(0, l));
    if (sc === 0) {
        const v = Math.round(lc * 255);
        return rgbToHex(v, v, v);
    }
    const q = lc < 0.5 ? lc * (1 + sc) : lc + sc - lc * sc;
    const p = 2 * lc - q;
    const hh = ((h % 360) + 360) % 360 / 360;
    const ch = (t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        const x = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
        return Math.round(x * 255);
    };
    return rgbToHex(ch(hh + 1 / 3), ch(hh), ch(hh - 1 / 3));
}

/** Pure vibrancy (saturation) and brightness (lightness) adjustment with ZERO hue shift (`h` untouched). */
export function adjustHexVibranceBrightness(hex: string, vibrancePct: number, brightnessPct: number): string {
    const rgb = parseHexToRgb(hex);
    if (!rgb) return hex;
    if (isHexMapBackground(rgb[0], rgb[1], rgb[2])) return hex;
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    if (vibrancePct === 0 && brightnessPct === 0) return hex.toUpperCase();

    const vFactor = 1 + vibrancePct / 100;
    const bFactor = 1 + brightnessPct / 100;

    // Pure saturation scale + gentle lift for low-chroma stone when boosting vibrance
    let nextS = s;
    if (s > 0.015) {
        nextS = vibrancePct >= 0
            ? Math.min(0.88, s * vFactor + (vibrancePct / 100) * 0.06)
            : Math.max(0, s * vFactor);
    }

    // Lightness scale with highlight protection so near-white stone never clips to #FFFFFF
    let nextL = l;
    if (brightnessPct >= 0) {
        const headroom = Math.max(0, 0.88 - l);
        nextL = Math.min(0.90, l + headroom * (brightnessPct / 160) + (l < 0.45 ? (brightnessPct / 100) * 0.08 : 0));
    } else {
        nextL = Math.max(0.05, l * bFactor);
    }

    return hslToHex(h, nextS, nextL);
}

/** Color distance (0..100) in perceptual RGB/HSL space. */
function colorDistancePct(hexA: string, hexB: string): number {
    const a = parseHexToRgb(hexA);
    const b = parseHexToRgb(hexB);
    if (!a || !b) return 100;
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    // Weighted Euclidean RGB distance normalized to 0..100
    const dist = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
    return (dist / 255) * 100;
}

/** Parse dimensions and hex list from an item row. */
function parseItemHexGrid(row: Record<string, any>): { cols: number; rows: number; cells: string[] } {
    let cols = 20;
    let rows = 20;
    const sp = row?.spatial_points || row?.spatialPoints;
    if (sp) {
        let parsed = sp;
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch {}
        }
        const arr = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
        const pm = arr.find((p: any) => p && (p.type === 'pixel_map' || p.hex_string || p.hexString));
        if (pm) {
            if (pm.cols && pm.rows) {
                cols = Number(pm.cols) || 20;
                rows = Number(pm.rows) || 20;
            } else if (typeof pm.dimensions === 'string' && pm.dimensions.includes('x')) {
                const [c, r] = pm.dimensions.split('x').map((x: string) => parseInt(x, 10));
                if (c > 0 && r > 0) { cols = c; rows = r; }
            }
        }
    }

    const rawStr = extractItemHexString(row) || '';
    const dimMatch = rawStr.match(/^(\d+)x(\d+):([\s\S]+)$/);
    let body = rawStr;
    if (dimMatch) {
        cols = parseInt(dimMatch[1], 10) || cols;
        rows = parseInt(dimMatch[2], 10) || rows;
        body = dimMatch[3];
    }
    const list = parseHexMapString(body).map(h => h.toUpperCase());
    if (list.length > 0 && !dimMatch) {
        if (list.length === 3600) { cols = 60; rows = 60; }
        else if (list.length === 400) { cols = 20; rows = 20; }
        else if (list.length !== cols * rows) {
            cols = Math.max(1, Math.round(Math.sqrt(list.length)));
            rows = Math.ceil(list.length / cols);
        }
    }
    return { cols, rows, cells: list };
}

/** Renders a bitmap canvas data URL from the hex grid. */
function renderHexGridBitmapDataUrl(cells: readonly string[], cols: number, rows: number): string {
    if (typeof document === 'undefined' || !cells.length) return '';
    const blockSize = cols > 30 ? 8 : 14;
    const canvas = document.createElement('canvas');
    canvas.width = cols * blockSize;
    canvas.height = rows * blockSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const hex = cells[r * cols + c] || '#FFFFFF';
            ctx.fillStyle = hex;
            ctx.fillRect(c * blockSize, r * blockSize, blockSize, blockSize);
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 1;
            ctx.strokeRect(c * blockSize, r * blockSize, blockSize, blockSize);
        }
    }
    return canvas.toDataURL('image/webp', 0.9);
}

/** Loads any local/remote/Drive image into an HTMLImageElement with CORS-safe fallback so getImageData works. */
async function loadPickableImage(url: string): Promise<HTMLImageElement | null> {
    if (!url) return null;
    const clean = url.startsWith('data:') || url.startsWith('blob:') ? url : (getCleanImageUrl(url) || url);

    // 1. Direct data/blob or CORS fetch -> blob
    if (clean.startsWith('data:') || clean.startsWith('blob:')) {
        return await new Promise<HTMLImageElement | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = clean;
        });
    }

    // 2. If Google Drive file ID exists, fetch base64 via batch proxy for pixel-readable canvas
    const fileId = extractFileId(url) || extractFileId(clean);
    if (fileId) {
        try {
            const res = await fetchImageBatch(fileId);
            if (res?.base64) {
                const dataUrl = `data:${res.mimeType || 'image/jpeg'};base64,${res.base64}`;
                const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(null);
                    img.src = dataUrl;
                });
                if (loaded) return loaded;
            }
        } catch {}
    }

    // 3. Try fetch -> blob
    try {
        const resp = await fetch(clean, { mode: 'cors' });
        if (resp.ok) {
            const blob = await resp.blob();
            const objUrl = URL.createObjectURL(blob);
            const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
                const img = new Image();
                img.onload = () => { URL.revokeObjectURL(objUrl); resolve(img); };
                img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
                img.src = objUrl;
            });
            if (loaded) return loaded;
        }
    } catch {}

    // 4. Anonymous crossOrigin image
    return await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = clean;
    });
}

export function HexColorMapEditor({ row, photos, user, disabled, onHexMapSaved }: HexColorMapEditorProps) {
    const headId = useId();
    const isBowl = useMemo(() => isBowlItem(row), [row]);

    // Initial hex grid from row
    const initialGrid = useMemo(() => parseItemHexGrid(row), [row]);
    const [cols, setCols] = useState<number>(initialGrid.cols || 24);
    const [rows, setRows] = useState<number>(initialGrid.rows || 24);
    const [baseCells, setBaseCells] = useState<string[]>(initialGrid.cells);
    const [workingCells, setWorkingCells] = useState<string[]>(initialGrid.cells);

    // Sync if row id changes
    const prevRowId = useRef(row?.id);
    useEffect(() => {
        if (row?.id !== prevRowId.current || (baseCells.length === 0 && initialGrid.cells.length > 0)) {
            prevRowId.current = row?.id;
            setCols(initialGrid.cols || 24);
            setRows(initialGrid.rows || 24);
            setBaseCells(initialGrid.cells);
            setWorkingCells(initialGrid.cells);
        }
    }, [row?.id, initialGrid, baseCells.length]);

    // Candidate images for eyedropper (cutout PNGs + entry photos)
    const imageSources = useMemo(() => {
        const list: { label: string; url: string }[] = [];
        const seen = new Set<string>();
        const add = (label: string, u?: string | null) => {
            if (!u || typeof u !== 'string') return;
            const key = extractFileId(u) || u;
            if (seen.has(key)) return;
            seen.add(key);
            list.push({ label, url: u });
        };
        if (row?.generated_png_url || row?.generatedPngUrl) {
            add('Cutout PNG', row.generated_png_url || row.generatedPngUrl);
        }
        const pmu = row?.processed_media_urls || row?.processedMediaUrls;
        if (pmu) {
            let map = pmu;
            if (typeof map === 'string' && map.startsWith('{')) {
                try { map = JSON.parse(map); } catch {}
            }
            if (map && typeof map === 'object') {
                Object.entries(map).forEach(([k, v], idx) => {
                    if (!k.startsWith('_') && typeof v === 'string' && v.startsWith('http')) {
                        add(`Studio ${idx + 1}`, v);
                    }
                });
            }
        }
        photos.filter(p => !p.isVideo).forEach((p, idx) => {
            add(`Photo ${idx + 1}`, p.preview || p.url);
        });
        return list;
    }, [row, photos]);

    const [activeImgIdx, setActiveImgIdx] = useState(0);
    const activeImgUrl = imageSources[Math.min(activeImgIdx, Math.max(0, imageSources.length - 1))]?.url || '';

    // Picked color & enhancement controls
    const [pickedHex, setPickedHex] = useState<string>('#5E8C83');
    const [vibrance, setVibrance] = useState<number>(isBowl ? 28 : 20);
    const [brightness, setBrightness] = useState<number>(isBowl ? 14 : 8);
    const [similarityRadius, setSimilarityRadius] = useState<number>(22);
    const [selectedBarSlot, setSelectedBarSlot] = useState<number | null>(null);

    // Custom / pinned color bar shades
    const [customShades, setCustomShades] = useState<string[] | null>(() => extractCustomBandShades(row));

    // Enhanced version of the currently picked color (zero hue shift)
    const enhancedPickedHex = useMemo(
        () => adjustHexVibranceBrightness(pickedHex, vibrance, brightness),
        [pickedHex, vibrance, brightness]
    );

    // Which cells in workingCells match `pickedHex` within `similarityRadius`
    const matchingCellIndices = useMemo(() => {
        const matched = new Set<number>();
        if (!workingCells.length || !pickedHex) return matched;
        for (let i = 0; i < workingCells.length; i++) {
            const c = workingCells[i];
            const rgb = parseHexToRgb(c);
            if (!rgb || isHexMapBackground(rgb[0], rgb[1], rgb[2])) continue;
            if (colorDistancePct(c, pickedHex) <= similarityRadius) {
                matched.add(i);
            }
        }
        return matched;
    }, [workingCells, pickedHex, similarityRadius]);

    // Preview cells: shows live effect of Vibrance & Brightness on matching cells
    const previewCells = useMemo(() => {
        if (!workingCells.length) return [];
        if (vibrance === 0 && brightness === 0) return workingCells;
        return workingCells.map((c, idx) => {
            if (!matchingCellIndices.has(idx)) return c;
            return adjustHexVibranceBrightness(c, vibrance, brightness);
        });
    }, [workingCells, matchingCellIndices, vibrance, brightness]);

    // Derived 6-shade Color Bar
    const derivedBarShades = useMemo(() => {
        const auto = hexMapShades(previewCells, 6).map(h => liftBandColorForItem(h, isBowl));
        if (auto.length >= 2) return auto;
        const pal = resolveStonePaletteRaw(row);
        return (pal.gradientColors.length ? pal.gradientColors : [pal.primary]).map(h => liftBandColorForItem(h, isBowl));
    }, [previewCells, isBowl, row]);

    const activeBarShades = useMemo(() => {
        if (customShades && customShades.length >= 2) return customShades;
        return derivedBarShades;
    }, [customShades, derivedBarShades]);

    // Initialize pickedHex from first stone shade once loaded
    const initializedPick = useRef(false);
    useEffect(() => {
        if (!initializedPick.current && derivedBarShades.length > 0) {
            initializedPick.current = true;
            setPickedHex(derivedBarShades[Math.floor(derivedBarShades.length / 2)] || derivedBarShades[0]);
        }
    }, [derivedBarShades]);

    // Image canvas for pixel eyedropper sampling + hex map extraction
    const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [samplingHex, setSamplingHex] = useState(false);
    const [cursorSample, setCursorSample] = useState<{ x: number; y: number; hex: string } | null>(null);

    const sampleHexGridFromLoadedImage = useCallback((img: HTMLImageElement, targetCols = 24, targetRows = 24) => {
        const can = document.createElement('canvas');
        can.width = targetCols;
        can.height = targetRows;
        const ctx = can.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, targetCols, targetRows);
        const data = ctx.getImageData(0, 0, targetCols, targetRows).data;
        const extracted: string[] = [];
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            const isBlackBg = r <= 42 && g <= 42 && b <= 42 && (Math.max(r, g, b) - Math.min(r, g, b)) <= 15;
            if (a < 50 || isBlackBg) {
                extracted.push('#FFFFFF');
            } else {
                const rawHex = rgbToHex(r, g, b);
                extracted.push(isBowl ? boostBowlHexColor(rawHex, true) : rawHex);
            }
        }
        setCols(targetCols);
        setRows(targetRows);
        setBaseCells(extracted);
        setWorkingCells(extracted);
    }, [isBowl]);

    useEffect(() => {
        let cancelled = false;
        if (!activeImgUrl) {
            setImgLoaded(false);
            return;
        }
        setImgLoaded(false);
        loadPickableImage(activeImgUrl).then(img => {
            if (cancelled || !img) return;
            const canvas = imgCanvasRef.current;
            if (canvas) {
                const size = 280;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                    ctx.clearRect(0, 0, size, size);
                    // Subtle dark studio ground for transparent cutouts
                    ctx.fillStyle = '#14171F';
                    ctx.fillRect(0, 0, size, size);
                    const scale = Math.min(size / (img.naturalWidth || img.width || 1), size / (img.naturalHeight || img.height || 1));
                    const dw = Math.round((img.naturalWidth || img.width) * scale);
                    const dh = Math.round((img.naturalHeight || img.height) * scale);
                    const ox = Math.round((size - dw) / 2);
                    const oy = Math.round((size - dh) / 2);
                    ctx.drawImage(img, ox, oy, dw, dh);
                    setImgLoaded(true);
                }
            }
            // If item has no hex map yet, automatically sample one from the loaded photo
            if (baseCells.length === 0) {
                sampleHexGridFromLoadedImage(img, 24, 24);
            }
        });
        return () => { cancelled = true; };
    }, [activeImgUrl, baseCells.length, sampleHexGridFromLoadedImage]);

    // Eyedropper interaction on photo canvas
    const pickFromCanvasEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = imgCanvasRef.current;
        if (!canvas || !imgLoaded) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width)));
        const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height)));
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            const px = ctx.getImageData(x, y, 1, 1).data;
            if (px[3] < 20) return;
            const hex = rgbToHex(px[0], px[1], px[2]);
            setPickedHex(hex);
            setCursorSample({
                x: ((e.clientX - rect.left) / rect.width) * 100,
                y: ((e.clientY - rect.top) / rect.height) * 100,
                hex,
            });
        } catch {}
    };

    // Resample fresh hex map from current photo
    const handleResampleFromPhoto = async () => {
        if (!activeImgUrl) return;
        setSamplingHex(true);
        try {
            const img = await loadPickableImage(activeImgUrl);
            if (!img) {
                toast.error(tr('Could not read pixels from this image.'));
                return;
            }
            sampleHexGridFromLoadedImage(img, 24, 24);
            setCustomShades(null);
            toast.success(tr('Sampled fresh hex map from image.'));
        } finally {
            setSamplingHex(false);
        }
    };

    // Commit current Vibrance/Brightness boost to matching similar cells in workingCells
    const handleApplyToSimilarCells = () => {
        if (!matchingCellIndices.size) {
            toast(tr('No similar cells matched. Increase Similarity range or pick another color.'));
            return;
        }
        setWorkingCells(previewCells);
        setPickedHex(enhancedPickedHex);
        toast.success(`${matchingCellIndices.size} similar hex cells enhanced.`);
    };

    // Boost entire hex map with current Vibrance & Brightness sliders (zero hue shift)
    const handleBoostEntireHexMap = () => {
        if (!workingCells.length) return;
        const next = workingCells.map(c => {
            const rgb = parseHexToRgb(c);
            if (!rgb || isHexMapBackground(rgb[0], rgb[1], rgb[2])) return c;
            return adjustHexVibranceBrightness(c, vibrance, brightness);
        });
        setWorkingCells(next);
        setPickedHex(enhancedPickedHex);
        toast.success(tr('Enhanced all stone cells in hex map.'));
    };

    // Add / Set the enhanced picked color into the Color Bar AND inject into matching hex map cells
    const handleAddOrSetInColorBar = (slotIndex?: number | null) => {
        const targetColor = enhancedPickedHex;
        const current = [...activeBarShades];
        const targetSlot = slotIndex !== undefined && slotIndex !== null ? slotIndex : selectedBarSlot;

        let nextShades: string[];
        if (targetSlot !== null && targetSlot >= 0 && targetSlot < current.length) {
            current[targetSlot] = targetColor;
            nextShades = current;
        } else if (!current.includes(targetColor)) {
            if (current.length < 6) {
                nextShades = [...current, targetColor];
            } else {
                // Replace the shade closest to pickedHex or last slot
                let bestIdx = current.length - 1;
                let bestDist = Infinity;
                current.forEach((s, idx) => {
                    const d = colorDistancePct(s, pickedHex);
                    if (d < bestDist) { bestDist = d; bestIdx = idx; }
                });
                current[bestIdx] = targetColor;
                nextShades = current;
            }
        } else {
            nextShades = current;
        }
        setCustomShades(nextShades);

        // Also update matching similar cells in the hex map so the 3D axo & hex map reflect the chosen color
        if (matchingCellIndices.size > 0) {
            setWorkingCells(previewCells);
        } else if (workingCells.length > 0) {
            // Paint a subtle cluster of stone cells with closest match so the hex map carries this pigment
            const ranked = workingCells
                .map((hex, i) => ({ i, hex, rgb: parseHexToRgb(hex), d: colorDistancePct(hex, pickedHex) }))
                .filter(x => x.rgb && !isHexMapBackground(x.rgb[0], x.rgb[1], x.rgb[2]))
                .sort((a, b) => a.d - b.d)
                .slice(0, Math.max(6, Math.round(workingCells.length * 0.08)));
            if (ranked.length > 0) {
                const replaceSet = new Set(ranked.map(r => r.i));
                setWorkingCells(prev => prev.map((c, idx) => replaceSet.has(idx) ? targetColor : c));
            }
        }
        toast.success(`Set ${targetColor} in Color Bar & Hex Map.`);
    };

    const handleReset = () => {
        setWorkingCells(baseCells);
        setCustomShades(extractCustomBandShades(row));
        setVibrance(isBowl ? 28 : 20);
        setBrightness(isBowl ? 14 : 8);
        setSelectedBarSlot(null);
        toast(tr('Reset to stored hex map.'));
    };

    // Live 3D Axonometric preview from previewCells
    const [axoUrl, setAxoUrl] = useState<string>('');
    const previewHexMapString = useMemo(() => {
        if (!previewCells.length) return '';
        return `${cols}x${rows}:${previewCells.join(',')}`;
    }, [previewCells, cols, rows]);

    useEffect(() => {
        let cancelled = false;
        const w = parseFloat(row?.width_cm || row?.widthCm) || 30;
        const h = parseFloat(row?.height_cm || row?.heightCm) || 18;
        const d = parseFloat(row?.length_cm || row?.lengthCm) || w;
        const shape = row?.shape || '';
        const desc = [row?.short_description, row?.shortDescription, row?.description, row?.material, row?.color].filter(Boolean).join(' ');
        const fallbackColor = activeBarShades[0] || resolveItemColor(row);

        const timer = setTimeout(() => {
            generateAxonometricDataUrl(w, h, d, shape, desc, fallbackColor, false, previewHexMapString || undefined)
                .then(url => {
                    if (!cancelled && url) setAxoUrl(url);
                })
                .catch(() => {});
        }, 90);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [row, previewHexMapString, activeBarShades]);

    // Save Enhanced directly to Supabase + RxDB + parent state
    const [savingHex, setSavingHex] = useState(false);
    const handleSaveEnhanced = async () => {
        const finalCells = previewCells.length ? previewCells : workingCells;
        if (!finalCells.length) {
            toast.error(tr('No hex map cells to save.'));
            return;
        }
        setSavingHex(true);
        try {
            const hexString = finalCells.join(',');
            const dims = `${cols}x${rows}`;
            const localBitmap = renderHexGridBitmapDataUrl(finalCells, cols, rows);
            const rowId = String(row?.id || 'draft');

            let bitmapUrl: string | null = localBitmap || null;
            if (localBitmap && localBitmap.startsWith('data:') && row?.id) {
                try {
                    bitmapUrl = await uploadCleanedImage(localBitmap, `bitmap_${rowId}_enhanced.webp`, user);
                } catch {
                    bitmapUrl = null;
                }
            }

            // Build updated spatial_points preserving any other entries
            let existingSp: any[] = [];
            const rawSp = row?.spatial_points || row?.spatialPoints;
            if (rawSp) {
                if (typeof rawSp === 'string') {
                    try { existingSp = JSON.parse(rawSp); } catch {}
                } else if (Array.isArray(rawSp)) {
                    existingSp = [...rawSp];
                }
            }
            if (!Array.isArray(existingSp)) existingSp = [];

            const finalShades = (customShades && customShades.length >= 2)
                ? customShades
                : hexMapShades(finalCells, 6).map(h => liftBandColorForItem(h, isBowl));

            const newPixelMapEntry = {
                type: 'pixel_map',
                index: 0,
                dimensions: dims,
                cols,
                rows,
                hex_string: hexString,
                bitmap_url: bitmapUrl,
                band_shades: finalShades,
                timestamp: new Date().toISOString(),
            };

            const otherEntries = existingSp.filter((p: any) => !(p && (p.type === 'pixel_map' || p.hex_string || p.hexString)));
            const nextSpatialPoints = [newPixelMapEntry, ...otherEntries];

            // Build updated processed_media_urls
            let pmuObj: Record<string, any> = {};
            const rawPmu = row?.processed_media_urls || row?.processedMediaUrls;
            if (rawPmu) {
                if (typeof rawPmu === 'string' && rawPmu.startsWith('{')) {
                    try { pmuObj = JSON.parse(rawPmu) || {}; } catch {}
                } else if (typeof rawPmu === 'object') {
                    pmuObj = { ...rawPmu };
                }
            }
            pmuObj._pixel_map_hex = hexString;
            pmuObj._pixel_map_hex_0 = hexString;
            pmuObj.dimensions = dims;
            if (bitmapUrl) pmuObj._bitmap_url = bitmapUrl;
            pmuObj._band_shades = finalShades.join(',');
            const nextPmuString = JSON.stringify(pmuObj);

            // Persist to Supabase & RxDB if this is an existing row in DB
            if (row?.id) {
                const { data: saved, error } = await supabase
                    .from('inventory')
                    .update({
                        spatial_points: nextSpatialPoints as any,
                        processed_media_urls: nextPmuString,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', String(row.id))
                    .select('*')
                    .single();

                if (error) throw new Error(error.message);

                try {
                    const db: any = await getDatabase();
                    if (db?.inventory && saved) {
                        await db.inventory.upsert({
                            ...saved,
                            id: String(saved.id),
                            ...(saved.workbook != null ? { workbook: String(saved.workbook) } : {}),
                        });
                    }
                } catch {}
            }

            setBaseCells(finalCells);
            setWorkingCells(finalCells);
            setCustomShades(finalShades);
            clearAxoIconCache(row?.id ? String(row.id) : undefined);
            invalidateItemShades(row);

            onHexMapSaved?.({
                spatial_points: nextSpatialPoints,
                processed_media_urls: nextPmuString,
                customBandShades: finalShades,
            });

            toast.success(tr('Saved enhanced Hex Map, Color Bar & Axo texture.'));
        } catch (err: any) {
            toast.error(err?.message || tr('Failed to save enhanced hex map.'));
        } finally {
            setSavingHex(false);
        }
    };

    const hasEyeDropperApi = typeof window !== 'undefined' && 'EyeDropper' in window;
    const handleNativeEyeDropper = async () => {
        if (!hasEyeDropperApi) return;
        try {
            const dropper = new (window as any).EyeDropper();
            const res = await dropper.open();
            if (res?.sRGBHex) {
                setPickedHex(res.sRGBHex.toUpperCase());
            }
        } catch {}
    };

    return (
        <section className="hex-editor ui-root" aria-labelledby={headId}>
            <div className="hex-editor__header">
                <div className="hex-editor__title-group">
                    <Sliders size={15} className="hex-editor__icon" />
                    <h3 id={headId} className="entry-h">
                        {tr('Hex & Color Map Studio')}
                    </h3>
                    {isBowl && (
                        <span className="hex-editor__badge">
                            {tr('Bowl Vibrance Active')}
                        </span>
                    )}
                </div>
                <div className="hex-editor__header-actions">
                    {activeImgUrl && (
                        <Key
                            size="sm"
                            variant="quiet"
                            icon={<RefreshCw size={12} />}
                            busy={samplingHex}
                            disabled={disabled || savingHex}
                            onClick={() => void handleResampleFromPhoto()}
                            title={tr('Re-extract 24x24 hex grid from the selected image')}
                        >
                            {tr('Sample from photo')}
                        </Key>
                    )}
                    <Key
                        size="sm"
                        variant="quiet"
                        icon={<RotateCcw size={12} />}
                        disabled={disabled || savingHex}
                        onClick={handleReset}
                    >
                        {tr('Reset')}
                    </Key>
                    <Key
                        size="sm"
                        variant="go"
                        icon={<Sparkles size={13} />}
                        busy={savingHex}
                        disabled={disabled || !previewCells.length}
                        onClick={() => void handleSaveEnhanced()}
                    >
                        {tr('Save Enhanced')}
                    </Key>
                </div>
            </div>

            <div className="hex-editor__grid">
                {/* 1. IMAGE COLOR EYEDROPPER */}
                <div className="hex-editor__panel">
                    <div className="hex-editor__panel-head">
                        <span>{tr('1. Pick Color from Image')}</span>
                        {imageSources.length > 1 && (
                            <div className="hex-editor__img-tabs">
                                {imageSources.map((src, i) => (
                                    <button
                                        key={src.url}
                                        type="button"
                                        className={cx('hex-editor__tab', i === activeImgIdx && 'hex-editor__tab--active')}
                                        onClick={() => setActiveImgIdx(i)}
                                    >
                                        {src.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="hex-editor__canvas-wrap">
                        {activeImgUrl ? (
                            <div className="hex-editor__img-stage">
                                <canvas
                                    ref={imgCanvasRef}
                                    className="hex-editor__img-canvas"
                                    onClick={pickFromCanvasEvent}
                                    onMouseMove={e => { if (e.buttons === 1) pickFromCanvasEvent(e); }}
                                    title={tr('Click or drag on the stone to sample a color')}
                                />
                                {cursorSample && (
                                    <span
                                        className="hex-editor__loupe"
                                        style={{
                                            left: `${cursorSample.x}%`,
                                            top: `${cursorSample.y}%`,
                                            backgroundColor: cursorSample.hex,
                                        }}
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="hex-editor__empty">
                                {tr('No photo available')}
                            </div>
                        )}
                    </div>

                    <div className="hex-editor__picker-row">
                        <label className="hex-editor__swatch-pair" title={tr('Click to open color picker')}>
                            <input
                                type="color"
                                value={pickedHex}
                                onChange={e => setPickedHex(e.target.value.toUpperCase())}
                                className="hex-editor__native-color"
                            />
                            <span className="hex-editor__swatch" style={{ background: pickedHex }} />
                            <span className="hex-editor__swatch-meta">
                                <small>{tr('Picked')}</small>
                                <code className="ui-tnum">{pickedHex}</code>
                            </span>
                        </label>
                        <span className="hex-editor__arrow">→</span>
                        <div className="hex-editor__swatch-pair hex-editor__swatch-pair--enhanced">
                            <span className="hex-editor__swatch" style={{ background: enhancedPickedHex }} />
                            <span className="hex-editor__swatch-meta">
                                <small>{tr('Enhanced')}</small>
                                <code className="ui-tnum">{enhancedPickedHex}</code>
                            </span>
                        </div>
                        {hasEyeDropperApi && (
                            <Key
                                size="sm"
                                icon={<Pipette size={13} />}
                                onClick={() => void handleNativeEyeDropper()}
                                title={tr('Pick color from anywhere on screen')}
                            />
                        )}
                    </div>
                </div>

                {/* 2. INTERACTIVE HEX MAP VISUALIZER */}
                <div className="hex-editor__panel">
                    <div className="hex-editor__panel-head">
                        <span>{tr('2. Hex Map Visualizer')} ({cols}×{rows})</span>
                        <span className="hex-editor__match-pill ui-tnum">
                            {matchingCellIndices.size} {tr('similar cells')}
                        </span>
                    </div>

                    <div className="hex-editor__map-wrap">
                        {previewCells.length > 0 ? (
                            <div
                                className="hex-editor__map-grid"
                                style={{
                                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                                }}
                            >
                                {previewCells.map((hex, idx) => {
                                    const isMatched = matchingCellIndices.has(idx);
                                    const rgb = parseHexToRgb(workingCells[idx] || hex);
                                    const isBg = !rgb || isHexMapBackground(rgb[0], rgb[1], rgb[2]);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            className={cx(
                                                'hex-editor__cell',
                                                isMatched && 'hex-editor__cell--matched',
                                                isBg && 'hex-editor__cell--bg'
                                            )}
                                            style={{ backgroundColor: hex }}
                                            onClick={() => {
                                                const rawCell = workingCells[idx] || hex;
                                                setPickedHex(rawCell.toUpperCase());
                                            }}
                                            title={`${hex}${isMatched ? ' (Matched similar)' : ''}`}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="hex-editor__empty">
                                {tr('No hex map yet — click "Sample from photo" above.')}
                            </div>
                        )}
                    </div>

                    <p className="hex-editor__hint">
                        {tr('Click any cell in the grid or on the photo to select its color. Highlighted cells match within the similarity range.')}
                    </p>
                </div>

                {/* 3. VIBRANCE, BRIGHTNESS, COLOR BAR & LIVE 3D AXO */}
                <div className="hex-editor__panel hex-editor__panel--controls">
                    <div className="hex-editor__panel-head">
                        <span>{tr('3. Enhance & Color Bar')}</span>
                        <span className="hex-editor__subnote">{tr('Zero hue shift')}</span>
                    </div>

                    {/* Sliders */}
                    <div className="hex-editor__sliders">
                        <label className="hex-editor__slider-row">
                            <div className="hex-editor__slider-label">
                                <span>{tr('Vibrance (Saturation)')}</span>
                                <strong className="ui-tnum">{vibrance > 0 ? `+${vibrance}%` : `${vibrance}%`}</strong>
                            </div>
                            <input
                                type="range"
                                min={-50}
                                max={140}
                                step={2}
                                value={vibrance}
                                onChange={e => setVibrance(Number(e.target.value))}
                            />
                        </label>

                        <label className="hex-editor__slider-row">
                            <div className="hex-editor__slider-label">
                                <span>{tr('Brightness (Lightness)')}</span>
                                <strong className="ui-tnum">{brightness > 0 ? `+${brightness}%` : `${brightness}%`}</strong>
                            </div>
                            <input
                                type="range"
                                min={-40}
                                max={80}
                                step={2}
                                value={brightness}
                                onChange={e => setBrightness(Number(e.target.value))}
                            />
                        </label>

                        <label className="hex-editor__slider-row">
                            <div className="hex-editor__slider-label">
                                <span>{tr('Similar Color Range')}</span>
                                <strong className="ui-tnum">{similarityRadius}% ({matchingCellIndices.size} cells)</strong>
                            </div>
                            <input
                                type="range"
                                min={4}
                                max={55}
                                step={1}
                                value={similarityRadius}
                                onChange={e => setSimilarityRadius(Number(e.target.value))}
                            />
                        </label>
                    </div>

                    <div className="hex-editor__apply-row">
                        <Key
                            size="sm"
                             icon={<Check size={13} />}
                            disabled={disabled || !matchingCellIndices.size}
                            onClick={handleApplyToSimilarCells}
                            title={tr('Commit the enhanced vibrance and brightness to all matched similar cells')}
                        >
                            {tr('Enhance Similar in Hex')}
                        </Key>
                        <Key
                            size="sm"
                            variant="quiet"
                            icon={<Wand2 size={13} />}
                            disabled={disabled || !workingCells.length}
                            onClick={handleBoostEntireHexMap}
                            title={tr('Boost all stone cells in the hex map with current vibrance and brightness')}
                        >
                            {tr('Boost All Cells')}
                        </Key>
                    </div>

                    {/* Interactive Color Bar Editor */}
                    <div className="hex-editor__colorbar-block">
                        <div className="hex-editor__colorbar-head">
                            <span>{tr('Item Color Bar (6 Shades)')}</span>
                            <div className="hex-editor__colorbar-actions">
                                <Key
                                    size="sm"
                                    icon={<Plus size={12} />}
                                    disabled={disabled}
                                    onClick={() => handleAddOrSetInColorBar(selectedBarSlot)}
                                    title={selectedBarSlot !== null
                                        ? `Replace slot ${selectedBarSlot + 1} with ${enhancedPickedHex}`
                                        : `Add ${enhancedPickedHex} to Color Bar`}
                                >
                                    {selectedBarSlot !== null
                                        ? `${tr('Set Slot')} #${selectedBarSlot + 1}`
                                        : tr('Set in Color Bar')}
                                </Key>
                                {customShades && (
                                    <button
                                        type="button"
                                        className="hex-editor__clear-pin"
                                        onClick={() => { setCustomShades(null); setSelectedBarSlot(null); }}
                                        title={tr('Revert to automatic hex map shades')}
                                    >
                                        <Trash2 size={11} /> {tr('Auto')}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="hex-editor__colorbar" role="group" aria-label={tr('Item Color Bar')}>
                            {activeBarShades.map((shade, idx) => (
                                <button
                                    key={`${idx}-${shade}`}
                                    type="button"
                                    className={cx(
                                        'hex-editor__bar-slot',
                                        selectedBarSlot === idx && 'hex-editor__bar-slot--selected'
                                    )}
                                    style={{ backgroundColor: shade }}
                                    onClick={() => {
                                        setSelectedBarSlot(prev => prev === idx ? null : idx);
                                        setPickedHex(shade);
                                    }}
                                    onDoubleClick={() => handleAddOrSetInColorBar(idx)}
                                    title={`Slot ${idx + 1}: ${shade} (Click to select slot, double-click to overwrite with ${enhancedPickedHex})`}
                                >
                                    <span className="hex-editor__bar-code ui-tnum">{shade}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Live 3D Axonometric Element Preview */}
                    <div className="hex-editor__axo-preview">
                        <div className="hex-editor__axo-meta">
                            <span>{tr('Live 3D Axo Element')}</span>
                            <small>{tr('Updates live from Hex Map & Color Bar')}</small>
                        </div>
                        {axoUrl ? (
                            <img src={axoUrl} alt="3D Axo Preview" className="hex-editor__axo-img" />
                        ) : (
                            <div className="hex-editor__axo-placeholder" />
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
