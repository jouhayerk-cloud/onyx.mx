import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    Sun,
    RotateCw,
    Box,
    Compass,
    Download,
    Maximize2,
    Minimize2,
    X,
    ExternalLink,
    Sparkles,
    Eye
} from 'lucide-react';
import {
    parseHexMapString,
    normalizeHexMapTexture,
    generateAxonometricDataUrl,
    resolveItemColor,
    resolveStonePalette,
    type AxoBoundingBoxOptions
} from '../../lib/axonometric';
import { resolveStonePaletteRaw } from '../../lib/canonicalColors';
import { classifyExtra, extractHolesCount, isFreeFormPanel, isPanelPair, PANEL_PAIR_GAP_RATIO } from '../../lib/axoExtra';
import { classifyMirror } from '../../lib/axoMirrors';
import { classifyGeometry } from '../../lib/geometry';
import {
    extractItemHexString,
    getCleanImageUrl,
    calculateCodesAndPrices,
    normalizeInventoryData,
    cmToImperial,
    formatWeightImperialOnly
} from '../../lib/utils';
import { tr } from '../../lib/i18n';
import toast from '../onyxIsland/notify/toast';

export type Archetype3D =
    | 'bowl'
    | 'canoe'
    | 'mirror'
    | 'floor-lamp'
    | 'tower-lamp'
    | 'table-lamp'
    | 'pendant'
    | 'wall-panel'
    | 'panel-pair'
    | 'painted-wall-panel'
    | 'fountain-yinyang-rect'
    | 'table'
    | 'coffee-table'
    | 'couch-angled'
    | 'bar-l-shaped'
    | 'plate'
    | 'sphere'
    | 'wine-rack'
    | 'sculpture'
    | 'rock'
    | 'box';

export interface ThreeModelViewerProps {
    item: any;
    axoFallbackUrl?: string | null;
    initialFullscreen?: boolean;
    onCloseFullscreen?: () => void;
    className?: string;
}

export interface ThreeModelFullscreenModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: any;
}

interface ParsedItemSpecs {
    rawData: any;
    barcode: string;
    title: string;
    stoneText: string;
    shapeText: string;
    descText: string;
    widthCm: number;
    heightCm: number;
    lengthCm: number;
    weightKg: number;
    archetype: Archetype3D;
    isPorousStone: boolean;
    dominantHex: string;
    secondaryHex: string;
    paletteHexes: string[];
    hexMapString?: string;
    cutoutPngUrl: string | null;
    veinSvgUrl: string | null;
    mirrorSubClass: 'mirror-round' | 'mirror-square' | 'mirror-rect' | 'mirror-freeform';
    holesCount: number;
    maskAttractions?: any;
}

/**
 * Resolves the 3D procedural archetype and stone material properties from any inventory item record.
 */
export function parseItemFor3D(item: any): ParsedItemSpecs {
    const rawData = (item && typeof item === 'object' && 'data' in item ? { ...item.data, ...item } : item) || {};
    const norm = normalizeInventoryData(rawData);
    const calculated = calculateCodesAndPrices(norm, 20, '326');

    const barcode = String(
        calculated.bookBarcode ||
        rawData.bookBarcode ||
        rawData.book_barcode ||
        rawData.itemId ||
        rawData.item_id ||
        rawData.id ||
        'ONYX_ITEM'
    ).trim();

    const title = String(
        rawData.shopifyTitle ||
        rawData.shopify_title ||
        rawData.title ||
        rawData.name ||
        rawData.shortDescription ||
        rawData.short_description ||
        `${rawData.shape || 'Onyx'} ${rawData.color || ''}`
    ).trim();

    const stoneText = [rawData.color, rawData.material, rawData.variety].filter(Boolean).join(' ').trim();
    const shapeText = String(rawData.shape || norm.shape || '').trim();
    const descText = [
        rawData.shortDescription,
        rawData.short_description,
        rawData.description,
        barcode
    ].filter(Boolean).join(' ');

    const combinedLower = `${shapeText} ${descText} ${stoneText}`.toLowerCase();

    const extraClass = classifyExtra(shapeText, descText);
    const mirrorClass = classifyMirror(shapeText, descText);
    const baseGeom = classifyGeometry(shapeText, descText);

    let archetype: Archetype3D = 'box';
    let mirrorSubClass: 'mirror-round' | 'mirror-square' | 'mirror-rect' | 'mirror-freeform' = 'mirror-rect';

    if (mirrorClass) {
        archetype = 'mirror';
        if (combinedLower.includes('free') || combinedLower.includes('organic') || combinedLower.includes('irregular')) {
            mirrorSubClass = 'mirror-freeform';
        } else {
            mirrorSubClass = mirrorClass;
        }
    } else if (extraClass === 'hull') {
        archetype = 'canoe';
    } else if (extraClass === 'fountain-yinyang-rect') {
        archetype = 'fountain-yinyang-rect';
    } else if (extraClass === 'couch-angled') {
        archetype = 'couch-angled';
    } else if (extraClass === 'bar-l-shaped') {
        archetype = 'bar-l-shaped';
    } else if (extraClass === 'lamp-floor') {
        archetype = 'floor-lamp';
    } else if (extraClass === 'lamp-tower') {
        archetype = 'tower-lamp';
    } else if (extraClass === 'lamp-table') {
        archetype = 'table-lamp';
    } else if (extraClass === 'lamp-pendant') {
        archetype = 'pendant';
    } else if (extraClass === 'panel') {
        if (isPanelPair(combinedLower)) {
            archetype = 'panel-pair';
        } else if (combinedLower.includes('painted') || combinedLower.includes('pintado')) {
            archetype = 'painted-wall-panel';
        } else {
            archetype = 'wall-panel';
        }
    } else if (extraClass === 'table') {
        if (combinedLower.includes('coffee') || combinedLower.includes('centro')) {
            archetype = 'coffee-table';
        } else {
            archetype = 'table';
        }
    } else if (extraClass === 'wine-rack') {
        archetype = 'wine-rack';
    } else if (extraClass === 'tube') {
        archetype = combinedLower.includes('lamp') || combinedLower.includes('lampara') ? 'table-lamp' : 'floor-lamp';
    } else if (baseGeom.geom === 'bowl') {
        archetype = 'bowl';
    } else if (baseGeom.geom === 'plate') {
        archetype = 'plate';
    } else if (baseGeom.geom === 'sphere') {
        archetype = 'sphere';
    } else if (baseGeom.geom === 'octahedron') {
        archetype = 'sculpture';
    } else if (baseGeom.geom === 'polyhedron') {
        archetype = 'rock';
    } else if (combinedLower.includes('lamp') || combinedLower.includes('lampara') || combinedLower.includes('luminary')) {
        archetype = 'table-lamp';
    }

    // Default realistic physical dimensions (cm) per archetype if record has missing dimensions
    let rawW = parseFloat(rawData.widthCm ?? rawData.width_cm ?? norm.widthCm) || 0;
    let rawH = parseFloat(rawData.heightCm ?? rawData.height_cm ?? norm.heightCm) || 0;
    let rawL = parseFloat(rawData.lengthCm ?? rawData.length_cm ?? rawData.depthCm ?? rawData.depth_cm ?? norm.lengthCm) || 0;

    if (rawW <= 0 && rawH <= 0 && rawL <= 0) {
        switch (archetype) {
            case 'bowl': rawW = 42; rawH = 16; rawL = 42; break;
            case 'canoe': rawW = 58; rawH = 14; rawL = 22; break;
            case 'plate': rawW = 38; rawH = 5; rawL = 38; break;
            case 'mirror':
                if (mirrorSubClass === 'mirror-round' || mirrorSubClass === 'mirror-square') {
                    rawW = 100; rawH = 100; rawL = 10;
                } else {
                    rawW = 80; rawH = 150; rawL = 10;
                }
                break;
            case 'floor-lamp': rawW = 30; rawH = 125; rawL = 30; break;
            case 'tower-lamp': rawW = 22; rawH = 150; rawL = 22; break;
            case 'table-lamp': rawW = 20; rawH = 42; rawL = 20; break;
            case 'pendant': rawW = 24; rawH = 38; rawL = 24; break;
            case 'wall-panel':
            case 'painted-wall-panel': rawW = 60; rawH = 120; rawL = 7; break;
            case 'panel-pair': rawW = 90; rawH = 120; rawL = 7; break;
            case 'fountain-yinyang-rect': rawW = 110; rawH = 95; rawL = 55; break;
            case 'coffee-table': rawW = 110; rawH = 42; rawL = 70; break;
            case 'table': rawW = 50; rawH = 58; rawL = 50; break;
            case 'couch-angled': rawW = 95; rawH = 82; rawL = 88; break;
            case 'bar-l-shaped': rawW = 185; rawH = 108; rawL = 155; break;
            case 'sphere': rawW = 28; rawH = 28; rawL = 28; break;
            case 'wine-rack': rawW = 28; rawH = 52; rawL = 18; break;
            default: rawW = 35; rawH = 35; rawL = 35; break;
        }
    } else {
        if (rawW <= 0) rawW = rawL > 0 ? rawL : rawH > 0 ? rawH * 0.6 : 35;
        if (rawH <= 0) {
            if (archetype === 'bowl' || archetype === 'canoe') rawH = Math.max(10, Math.round(rawW * 0.36));
            else if (archetype === 'plate') rawH = Math.max(4, Math.round(rawW * 0.14));
            else if (archetype === 'mirror' && mirrorSubClass === 'mirror-round') rawH = rawW;
            else rawH = rawW;
        }
        if (rawL <= 0) {
            if (archetype === 'mirror' || archetype === 'wall-panel' || archetype === 'panel-pair' || archetype === 'painted-wall-panel') {
                rawL = Math.max(6, Math.round(Math.min(rawW, rawH) * 0.1));
            } else if (archetype === 'canoe') {
                rawL = Math.max(16, Math.round(rawW * 0.38));
            } else {
                rawL = rawW;
            }
        }
    }

    const weightKg = parseFloat(rawData.weightKg ?? rawData.weight_kg ?? norm.weightKg) || 0;

    // Determine whether stone is porous/opaque (Travertine / Granite / Cantera / Rock) vs translucent Onyx / Fluorite / Marble
    const isPorousStone =
        /\b(travertine|travertino|granite|granito|cantera|basalt|volcanic|volcanica|sandstone|limestone)\b/i.test(combinedLower) ||
        (archetype === 'rock' && !/\b(onyx|onix|fluorite|fluorita|calcite|calcita)\b/i.test(combinedLower));

    // Resolve raw untinted stone palette & vein colors (no 1.45x saturation boost in 3D)
    const palette = resolveStonePaletteRaw(rawData);
    const dominantHex = palette.primary || resolveItemColor(rawData) || '#d6cab8';
    const secondaryHex = palette.secondary || '#ece5d8';
    const paletteHexes = [...(palette.gradientColors || [dominantHex, secondaryHex])];

    // Inspect processed_media_urls for vein_colors, vein_svg_urls, and cutout PNG
    let procMedia: any = rawData.processedMediaUrls || rawData.processed_media_urls;
    if (typeof procMedia === 'string' && procMedia.trim().startsWith('{')) {
        try { procMedia = JSON.parse(procMedia); } catch { procMedia = null; }
    }

    if (procMedia && typeof procMedia === 'object') {
        const vc = procMedia.vein_colors || procMedia._vein_colors;
        if (Array.isArray(vc)) {
            vc.forEach((c: any) => {
                if (typeof c === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(c.trim())) {
                    const hex = c.trim().startsWith('#') ? c.trim() : `#${c.trim()}`;
                    if (!paletteHexes.includes(hex)) paletteHexes.push(hex);
                }
            });
        }
    }

    const hexMapString = extractItemHexString(rawData);

    // Extract clean cutout PNG URL
    let cutoutPngUrl: string | null = null;
    const genPng = rawData.generatedPngUrl || rawData.generated_png_url || norm.generatedPngUrl;
    if (genPng && typeof genPng === 'string') {
        cutoutPngUrl = getCleanImageUrl(genPng) || genPng;
    } else if (procMedia && typeof procMedia === 'object') {
        for (const [k, v] of Object.entries(procMedia)) {
            if (!k.startsWith('_') && typeof v === 'string' && v.toLowerCase().includes('.png')) {
                cutoutPngUrl = getCleanImageUrl(v) || v;
                break;
            }
        }
    }

    // Extract vector vein SVG URL (angle_0 preferred)
    let veinSvgUrl: string | null = null;
    if (procMedia && typeof procMedia === 'object' && procMedia.vein_svg_urls && typeof procMedia.vein_svg_urls === 'object') {
        const svgMap = procMedia.vein_svg_urls as Record<string, unknown>;
        const rawSvg = (svgMap.angle_0 || Object.values(svgMap)[0]) as string | undefined;
        if (rawSvg && typeof rawSvg === 'string') {
            veinSvgUrl = getCleanImageUrl(rawSvg) || rawSvg;
        }
    }

    const holesCount = extractHolesCount(shapeText, descText) || 6;
    const maskAttractions =
        (procMedia && typeof procMedia === 'object' ? procMedia.mask_attractions : undefined) ||
        rawData.maskAttractions ||
        rawData.mask_attractions ||
        undefined;

    return {
        rawData,
        barcode,
        title,
        stoneText: stoneText || 'Natural Onyx',
        shapeText,
        descText,
        widthCm: rawW,
        heightCm: rawH,
        lengthCm: rawL,
        weightKg,
        archetype,
        isPorousStone,
        dominantHex,
        secondaryHex,
        paletteHexes,
        hexMapString,
        cutoutPngUrl,
        veinSvgUrl,
        mirrorSubClass,
        holesCount,
        maskAttractions
    };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = (hex || '#e5b578').replace(/^#/, '').trim();
    const full = clean.length === 3
        ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
        : clean.padEnd(6, 'c');
    const n = parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(n)) return { r: 229, g: 181, b: 120 };
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255
    };
}

/**
 * Generates a CORS-safe, synchronous 1024x1024 Albedo Canvas and Bump Canvas
 * seeded from the item's 60x60 `_pixel_map_hex` and mineral vein palette,
 * with smooth bicubic/bilinear interpolation and organic onyx vein strata.
 */
function createSeededStoneCanvases(specs: ParsedItemSpecs, size = 1024): {
    albedoCanvas: HTMLCanvasElement;
    bumpCanvas: HTMLCanvasElement;
} {
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const aCtx = albedoCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d')!;

    // 1. Parse and normalize the item's hex map to a dense 64x64 grid
    const gridN = 64;
    let denseGrid: { r: number; g: number; b: number }[] = [];

    if (specs.hexMapString) {
        let srcCols = 60, srcRows = 60;
        let rawStr = specs.hexMapString;
        const m = rawStr.match(/^(\d+)x(\d+):([\s\S]+)$/);
        if (m) {
            srcCols = parseInt(m[1], 10) || 60;
            srcRows = parseInt(m[2], 10) || 60;
            rawStr = m[3];
        }
        const parsed = parseHexMapString(rawStr);
        if (parsed.length > 0) {
            if (!m) {
                srcCols = Math.max(1, Math.round(Math.sqrt(parsed.length)));
                srcRows = Math.max(1, Math.ceil(parsed.length / srcCols));
            }
            const normalized = normalizeHexMapTexture(
                parsed,
                srcCols,
                srcRows,
                gridN,
                gridN,
                specs.archetype === 'bowl' || specs.archetype === 'canoe',
                true
            );
            denseGrid = normalized.map(hexToRgb);
        }
    }

    // Fallback mineral strata grid if item has no hex map yet
    if (denseGrid.length < gridN * gridN) {
        const pal = (specs.paletteHexes.length > 0 ? specs.paletteHexes : [specs.dominantHex, specs.secondaryHex]).map(hexToRgb);
        denseGrid = [];
        for (let r = 0; r < gridN; r++) {
            for (let c = 0; c < gridN; c++) {
                const u = c / gridN;
                const v = r / gridN;
                const wave =
                    Math.sin(v * Math.PI * 4.0 + Math.sin(u * Math.PI * 3.0) * 1.1) * 0.5 + 0.5;
                const pos = wave * (pal.length - 1);
                const i0 = Math.floor(pos);
                const i1 = Math.min(pal.length - 1, i0 + 1);
                const f = pos - i0;
                denseGrid.push({
                    r: Math.round(pal[i0].r * (1 - f) + pal[i1].r * f),
                    g: Math.round(pal[i0].g * (1 - f) + pal[i1].g * f),
                    b: Math.round(pal[i0].b * (1 - f) + pal[i1].b * f),
                });
            }
        }
    }

    // 2. Render smooth bilinearly-upscaled 256x256 intermediate buffer with organic vein micro-harmonics,
    // then hardware-scale to 1024x1024 and overlay fine mineral calcite veins
    const midN = 256;
    const midAlbedo = document.createElement('canvas');
    midAlbedo.width = midN;
    midAlbedo.height = midN;
    const mCtx = midAlbedo.getContext('2d')!;
    const aImg = mCtx.createImageData(midN, midN);

    const midBump = document.createElement('canvas');
    midBump.width = midN;
    midBump.height = midN;
    const mbCtx = midBump.getContext('2d')!;
    const bImg = mbCtx.createImageData(midN, midN);

    const veinRgb = hexToRgb(specs.paletteHexes[1] || specs.secondaryHex || '#fff4e0');
    const darkVeinRgb = hexToRgb(specs.paletteHexes[2] || specs.dominantHex || '#8c5828');

    for (let y = 0; y < midN; y++) {
        const v = y / (midN - 1);
        for (let x = 0; x < midN; x++) {
            const u = x / (midN - 1);

            // Keep true spatial alignment with the item's hex map (no domain warp that misaligns with cutout PNG)
            const gx = u * (gridN - 1);
            const gy = v * (gridN - 1);
            const x0 = Math.floor(gx);
            const y0 = Math.floor(gy);
            const x1 = Math.min(gridN - 1, x0 + 1);
            const y1 = Math.min(gridN - 1, y0 + 1);
            const fx = gx - x0;
            const fy = gy - y0;

            const c00 = denseGrid[y0 * gridN + x0];
            const c10 = denseGrid[y0 * gridN + x1];
            const c01 = denseGrid[y1 * gridN + x0];
            const c11 = denseGrid[y1 * gridN + x1];

            let r = (c00.r * (1 - fx) + c10.r * fx) * (1 - fy) + (c01.r * (1 - fx) + c11.r * fx) * fy;
            let g = (c00.g * (1 - fx) + c10.g * fx) * (1 - fy) + (c01.g * (1 - fx) + c11.g * fx) * fy;
            let b = (c00.b * (1 - fx) + c10.b * fx) * (1 - fy) + (c01.b * (1 - fx) + c11.b * fx) * fy;

            // Fine crystalline calcite vein ridge function (used for bump relief; only tints albedo if no real hex map)
            const veinPhase = Math.sin(
                u * 18.0 + v * 11.0 + Math.sin(u * 7.0 - v * 9.0) * 2.4 + Math.cos(v * 23.0) * 0.7
            );
            const sharpVein = Math.pow(Math.max(0, 1.0 - Math.abs(veinPhase) * 3.8), 2.5);
            const secondaryBand = Math.pow(Math.max(0, Math.sin(v * 28.0 + Math.sin(u * 9.0) * 3.0)), 6.0) * 0.35;

            if (!specs.hexMapString) {
                if (sharpVein > 0.01) {
                    r = r * (1 - sharpVein * 0.35) + veinRgb.r * (sharpVein * 0.35);
                    g = g * (1 - sharpVein * 0.35) + veinRgb.g * (sharpVein * 0.35);
                    b = b * (1 - sharpVein * 0.35) + veinRgb.b * (sharpVein * 0.35);
                }
                if (secondaryBand > 0.01) {
                    r = r * (1 - secondaryBand) + darkVeinRgb.r * secondaryBand;
                    g = g * (1 - secondaryBand) + darkVeinRgb.g * secondaryBand;
                    b = b * (1 - secondaryBand) + darkVeinRgb.b * secondaryBand;
                }
            }

            // Porous travertine pits vs smooth onyx vein micro-relief
            let bumpVal = 128 + sharpVein * 85 - secondaryBand * 60;
            if (specs.isPorousStone) {
                const poreHash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                const poreNoise = poreHash - Math.floor(poreHash);
                if (poreNoise > 0.86 && Math.sin(v * 40.0 + u * 8.0) > 0.1) {
                    bumpVal -= 75;
                    r *= 0.84;
                    g *= 0.84;
                    b *= 0.84;
                }
            }

            const idx = (y * midN + x) * 4;
            aImg.data[idx] = Math.min(255, Math.max(0, Math.round(r)));
            aImg.data[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
            aImg.data[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
            aImg.data[idx + 3] = 255;

            const bClamped = Math.min(255, Math.max(0, Math.round(bumpVal)));
            bImg.data[idx] = bClamped;
            bImg.data[idx + 1] = bClamped;
            bImg.data[idx + 2] = bClamped;
            bImg.data[idx + 3] = 255;
        }
    }

    mCtx.putImageData(aImg, 0, 0);
    mbCtx.putImageData(bImg, 0, 0);

    aCtx.imageSmoothingEnabled = true;
    aCtx.imageSmoothingQuality = 'high';
    aCtx.drawImage(midAlbedo, 0, 0, size, size);

    bCtx.imageSmoothingEnabled = true;
    bCtx.imageSmoothingQuality = 'high';
    bCtx.drawImage(midBump, 0, 0, size, size);

    // 3. Draw micro-relief fissures into bumpCanvas (and only into albedoCanvas if no hexMapString exists)
    aCtx.save();
    bCtx.save();
    for (let i = 0; i < 14; i++) {
        const seed = (i + 1) * 1.618;
        aCtx.beginPath();
        bCtx.beginPath();
        let px = ((Math.sin(seed * 3.1) * 0.5 + 0.5) * size);
        let py = 0;
        aCtx.moveTo(px, py);
        bCtx.moveTo(px, py);
        for (let step = 1; step <= 32; step++) {
            const t = step / 32;
            py = t * size;
            px += Math.sin(t * Math.PI * 3.5 + seed) * (size * 0.032) + Math.cos(t * 11 + i) * (size * 0.012);
            aCtx.lineTo(px, py);
            bCtx.lineTo(px, py);
        }
        if (!specs.hexMapString) {
            const palHex = specs.paletteHexes[i % specs.paletteHexes.length] || specs.secondaryHex;
            aCtx.strokeStyle = palHex;
            aCtx.globalAlpha = 0.12;
            aCtx.lineWidth = 1.5 + (i % 3) * 1.2;
            aCtx.stroke();
        }

        bCtx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.24)' : 'rgba(40,40,40,0.20)';
        bCtx.lineWidth = 1.8 + (i % 3);
        bCtx.stroke();
    }
    aCtx.restore();
    bCtx.restore();

    return { albedoCanvas, bumpCanvas };
}

/**
 * Creates a studio reflection/refraction PMREM environment texture so translucent onyx
 * (`transmission: 0.68`) and mirror glass (`metalness: 0.98`) refract and reflect realistically.
 */
function createStudioEnvironment(renderer: THREE.WebGLRenderer, warmHex: string): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x111318);

    // Overhead neutral studio softbox
    const topBox = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    topBox.position.set(0, 14, 0);
    topBox.rotation.x = Math.PI / 2;
    envScene.add(topBox);

    // Key neutral studio strip light
    const keyStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 20),
        new THREE.MeshBasicMaterial({ color: 0xfafaf9, side: THREE.DoubleSide })
    );
    keyStrip.position.set(14, 4, 10);
    keyStrip.lookAt(0, 0, 0);
    envScene.add(keyStrip);

    // Subtle neutral fill strip light
    const rimStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 18),
        new THREE.MeshBasicMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide })
    );
    rimStrip.position.set(-14, 5, -10);
    rimStrip.lookAt(0, 0, 0);
    envScene.add(rimStrip);

    const rt = pmrem.fromScene(envScene, 0.035);
    pmrem.dispose();
    return rt.texture;
}

/**
 * Multi-frequency periodic edge perturbation for hand-carved mirror apertures and free-form stone slabs.
 */
function handCarvedWiggle(theta: number): number {
    return (
        Math.sin(7 * theta) * 0.45 +
        Math.cos(13 * theta + 0.8) * 0.35 +
        Math.sin(23 * theta + 2.1) * 0.20
    );
}

/**
 * Normalizes box/extrude UV coordinates so a 0..1 stone texture maps cleanly across the mesh bounds.
 */
function normalizeGeometryUVs(geom: THREE.BufferGeometry): void {
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return;
    const pos = geom.attributes.position;
    const norm = geom.attributes.normal;
    if (!pos) return;

    const spanX = Math.max(0.001, bb.max.x - bb.min.x);
    const spanY = Math.max(0.001, bb.max.y - bb.min.y);
    const spanZ = Math.max(0.001, bb.max.z - bb.min.z);

    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const nx = norm ? Math.abs(norm.getX(i)) : 0;
        const ny = norm ? Math.abs(norm.getY(i)) : 0;
        const nz = norm ? Math.abs(norm.getZ(i)) : 1;

        let u = 0, v = 0;
        if (ny > nx && ny > nz) {
            u = (x - bb.min.x) / spanX;
            v = 1.0 - (z - bb.min.z) / spanZ;
        } else if (nx > nz) {
            u = (z - bb.min.z) / spanZ;
            v = (y - bb.min.y) / spanY;
        } else {
            u = (x - bb.min.x) / spanX;
            v = (y - bb.min.y) / spanY;
        }
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function applyBoxUVsInSubregion(geom: THREE.BufferGeometry, bboxUv: number[] = [0, 0, 1, 1]): void {
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return;
    const pos = geom.attributes.position;
    const norm = geom.attributes.normal;
    const spanX = Math.max(0.001, bb.max.x - bb.min.x);
    const spanY = Math.max(0.001, bb.max.y - bb.min.y);
    const spanZ = Math.max(0.001, bb.max.z - bb.min.z);

    const u0 = bboxUv[0] ?? 0;
    const v0Top = bboxUv[1] ?? 0;
    const u1 = bboxUv[2] ?? 1;
    const v1Top = bboxUv[3] ?? 1;
    const vMinGL = 1.0 - v1Top;
    const vMaxGL = 1.0 - v0Top;

    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const nx = norm ? Math.abs(norm.getX(i)) : 0;
        const ny = norm ? Math.abs(norm.getY(i)) : 0;
        const nz = norm ? Math.abs(norm.getZ(i)) : 1;

        let lu = 0, lv = 0;
        if (ny > nx && ny > nz) {
            lu = (x - bb.min.x) / spanX;
            lv = 1.0 - (z - bb.min.z) / spanZ;
        } else if (nx > nz) {
            lu = (z - bb.min.z) / spanZ;
            lv = (y - bb.min.y) / spanY;
        } else {
            lu = (x - bb.min.x) / spanX;
            lv = (y - bb.min.y) / spanY;
        }
        uvs[i * 2] = u0 + lu * (u1 - u0);
        uvs[i * 2 + 1] = vMinGL + lv * (vMaxGL - vMinGL);
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function applyCornerLampUVs(geom: THREE.BufferGeometry, cornerSpec?: any): void {
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return;
    const pos = geom.attributes.position;
    const norm = geom.attributes.normal;
    const spanX = Math.max(0.001, bb.max.x - bb.min.x);
    const spanY = Math.max(0.001, bb.max.y - bb.min.y);
    const spanZ = Math.max(0.001, bb.max.z - bb.min.z);

    const bbox = [0.02, 0.02, 0.98, 0.98];
    const uMin = bbox[0] ?? 0.05;
    const vMinTop = bbox[1] ?? 0.03;
    const uMax = bbox[2] ?? 0.95;
    const vMaxTop = bbox[3] ?? 0.97;
    const uCornerFrac = (cornerSpec && typeof cornerSpec.u_corner_frac === 'number') ? cornerSpec.u_corner_frac : 0.5;
    const uCorner = uMin + uCornerFrac * (uMax - uMin);
    const vMinGL = 1.0 - vMaxTop;
    const vMaxGL = 1.0 - vMinTop;

    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const nx = norm ? norm.getX(i) : 0;
        const ny = norm ? norm.getY(i) : 0;
        const nz = norm ? norm.getZ(i) : 1;

        const tx = (x - bb.min.x) / spanX;
        const ty = (y - bb.min.y) / spanY;
        const tz = (z - bb.min.z) / spanZ;

        let u = uCorner;
        const v = vMinGL + ty * (vMaxGL - vMinGL);

        if (Math.abs(ny) > 0.75) {
            u = uMin + tx * (uMax - uMin);
        } else if (Math.abs(nz) >= Math.abs(nx)) {
            if (nz >= 0) {
                // Left-Front face (+Z): x goes from -hw (tx=0 -> uMin) to +hw corner (tx=1 -> uCorner)
                u = uMin + tx * (uCorner - uMin);
            } else {
                // Back-Right face (-Z): bookmatched around +X/-Z seam
                u = uCorner + tx * (uMax - uCorner);
            }
        } else {
            if (nx >= 0) {
                // Right-Front face (+X): z goes from +hd corner (tz=1 -> uCorner) to -hd (tz=0 -> uMax)
                u = uCorner + (1.0 - tz) * (uMax - uCorner);
            } else {
                // Back-Left face (-X): bookmatched around -X/+Z seam
                u = uCorner - tz * (uCorner - uMin);
            }
        }
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/**
 * Builds the Archetype-Specific 3D Procedural Mesh Group scaled to the item's real `width_cm`, `height_cm`, `length_cm`.
 * Returns the root group and an array of internal/rear warm PointLights toggled by Backlight Glow.
 */
function buildArchetype3DScene(
    specs: ParsedItemSpecs,
    stoneMat: THREE.MeshPhysicalMaterial
): {
    meshGroup: THREE.Group;
    backlights: THREE.Light[];
    glowMeshes: THREE.Mesh[];
    normalizedDims: { w: number; h: number; d: number };
} {
    const group = new THREE.Group();
    const backlights: THREE.Light[] = [];
    const glowMeshes: THREE.Mesh[] = [];

    // For panel pairs where widthCm is recorded per-slab (e.g. 64 x 145 cm -> 131 x 145 cm total pair),
    // match 2D axo resolveAxoGeometry by widening total pair width to W * (2 + PANEL_PAIR_GAP_RATIO).
    const effectiveWidthCm =
        specs.archetype === 'panel-pair' && specs.widthCm < specs.heightCm * 0.68
            ? Math.round(specs.widthCm * (2 + PANEL_PAIR_GAP_RATIO))
            : specs.widthCm;
    const effectiveDepthCm =
        (specs.archetype === 'wall-panel' || specs.archetype === 'panel-pair' || specs.archetype === 'painted-wall-panel')
            ? Math.min(specs.lengthCm, 8)
            : specs.lengthCm;

    // Scale real cm dimensions so the largest dimension is ~8.0 scene units
    const maxCm = Math.max(effectiveWidthCm, specs.heightCm, effectiveDepthCm, 1);
    const unitScale = 8.0 / maxCm;
    const W = Math.max(0.6, effectiveWidthCm * unitScale);
    const H = Math.max(0.4, specs.heightCm * unitScale);
    const D = Math.max(0.24, effectiveDepthCm * unitScale);

    const addWarmLight = (x: number, y: number, z: number, intensity = 5.5, distance = 18) => {
        const pt = new THREE.PointLight(0xffae52, intensity, distance, 1.4);
        pt.position.set(x, y, z);
        group.add(pt);
        backlights.push(pt);
        return pt;
    };

    const combinedText = `${specs.shapeText} ${specs.descText}`.toLowerCase();

    switch (specs.archetype) {
        case 'bowl':
        case 'plate': {
            const isPlate = specs.archetype === 'plate';
            const vc = specs.maskAttractions?.vessel_contours;
            const rimContour: number[][] | null =
                Array.isArray(vc?.rim_contour_xz) && vc.rim_contour_xz.length >= 16
                    ? vc.rim_contour_xz
                    : null;
            const rimRadii: number[] | null =
                Array.isArray(vc?.rim_radii) && vc.rim_radii.length >= 8
                    ? vc.rim_radii
                    : null;
            const rawWallProf: number[] | null =
                Array.isArray(vc?.wall_profile_r) && vc.wall_profile_r.length >= 4
                    ? vc.wall_profile_r
                    : null;

            let wallProf: number[] | null = null;
            if (rawWallProf) {
                wallProf = rawWallProf.slice();
                wallProf[0] = Math.max(0.36, Math.min(0.56, wallProf[0]));
                for (let wi = 1; wi < wallProf.length; wi++) {
                    wallProf[wi] = Math.max(wallProf[wi], wallProf[wi - 1]);
                }
                const wMax = Math.max(0.1, wallProf[wallProf.length - 1]);
                for (let wi = 0; wi < wallProf.length; wi++) {
                    wallProf[wi] = Math.max(0.36, Math.min(1.0, wallProf[wi] / wMax));
                }
                wallProf[wallProf.length - 1] = 1.0;
            }

            const rFootFrac = isPlate ? 0.55 : (wallProf ? wallProf[0] : 0.44);
            const wallRatio = isPlate ? 0.085 : 0.095;
            const floorY = Math.max(H * 0.08, Math.min(W, D) * 0.5 * wallRatio * 1.15);
            const isPetalOrFree = /\b(petal|flower|flor|free|organic|ruffle|wave|scallop)\b/i.test(combinedText);

            const uSteps = 96;
            const vSteps = 40;
            const positions: number[] = [];
            const uvs: number[] = [];
            const indices: number[] = [];

            const sampleFlare = (t01: number): number => {
                if (!wallProf) {
                    return rFootFrac + (1.0 - rFootFrac) * Math.pow(t01, isPlate ? 0.65 : 0.58);
                }
                const f = Math.max(0, Math.min(1, t01)) * (wallProf.length - 1);
                const i0 = Math.floor(f);
                const i1 = Math.min(wallProf.length - 1, i0 + 1);
                return wallProf[i0] * (1 - (f - i0)) + wallProf[i1] * (f - i0);
            };

            for (let iu = 0; iu <= uSteps; iu++) {
                const uFrac = (iu % uSteps) / uSteps;
                const theta = uFrac * Math.PI * 2 - Math.PI;
                let uxRim = 0.5 * Math.cos(theta);
                let uyRim = 0.5 * Math.sin(theta);

                if (rimContour) {
                    const f = uFrac * rimContour.length;
                    const i0 = Math.floor(f) % rimContour.length;
                    const i1 = (i0 + 1) % rimContour.length;
                    const frac = f - Math.floor(f);
                    uxRim = rimContour[i0][0] * (1 - frac) + rimContour[i1][0] * frac;
                    uyRim = rimContour[i0][1] * (1 - frac) + rimContour[i1][1] * frac;
                } else if (rimRadii) {
                    const f = uFrac * rimRadii.length;
                    const i0 = Math.floor(f) % rimRadii.length;
                    const i1 = (i0 + 1) % rimRadii.length;
                    const frac = f - Math.floor(f);
                    const rMod = rimRadii[i0] * (1 - frac) + rimRadii[i1] * frac;
                    uxRim = 0.5 * Math.cos(theta) * rMod;
                    uyRim = 0.5 * Math.sin(theta) * rMod;
                } else if (isPetalOrFree) {
                    const petals = combinedText.includes('6') ? 6 : 8;
                    const wave = 1.0 + Math.sin(theta * petals) * 0.055 + Math.cos(theta * 3) * 0.025;
                    uxRim *= wave;
                    uyRim *= wave;
                }

                const rLobe = Math.min(1.25, Math.hypot(uxRim, uyRim) / 0.5);
                const yRim = H * (0.93 + 0.07 * rLobe);

                for (let iv = 0; iv <= vSteps; iv++) {
                    const v = iv / vSteps;
                    let rFrac = 0;
                    let py = 0;
                    let rUv = 0;

                    if (v <= 0.08) {
                        const t = v / 0.08;
                        rFrac = rFootFrac * t;
                        py = 0;
                        rUv = 0.84 * t;
                    } else if (v <= 0.46) {
                        const t = (v - 0.08) / 0.38;
                        rFrac = sampleFlare(t);
                        py = yRim * Math.pow(t, isPlate ? 1.15 : 0.90);
                        rUv = 0.84 + 0.16 * t;
                    } else if (v <= 0.54) {
                        const t = (v - 0.46) / 0.08;
                        rFrac = 1.0 - wallRatio * (0.5 - 0.5 * Math.cos(t * Math.PI));
                        py = yRim + Math.sin(t * Math.PI) * (H * 0.024);
                        rUv = rFrac;
                    } else {
                        const t = 1.0 - (v - 0.54) / 0.46;
                        const innerRimR = 1.0 - wallRatio;
                        rFrac = innerRimR * Math.sin(t * Math.PI * 0.5);
                        py = floorY + (yRim - floorY) * Math.pow(t, isPlate ? 1.42 : 1.32);
                        rUv = rFrac;
                    }

                    const x = uxRim * W * rFrac;
                    const z = -uyRim * D * rFrac;
                    const y = py - H * 0.5;
                    positions.push(x, y, z);

                    const uCoord = Math.max(0.01, Math.min(0.99, uxRim * rUv + 0.5));
                    const vCoord = Math.max(0.01, Math.min(0.99, uyRim * rUv + 0.5));
                    uvs.push(uCoord, vCoord);
                }
            }

            const stride = vSteps + 1;
            for (let iu = 0; iu < uSteps; iu++) {
                for (let iv = 0; iv < vSteps; iv++) {
                    const a = iu * stride + iv;
                    const b = (iu + 1) * stride + iv;
                    const c = (iu + 1) * stride + (iv + 1);
                    const d = iu * stride + (iv + 1);
                    indices.push(a, b, d);
                    indices.push(b, c, d);
                }
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geom.setIndex(indices);
            geom.computeVertexNormals();

            const mesh = new THREE.Mesh(geom, stoneMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            addWarmLight(0, -H * 0.12, 0, 2.8, 14);
            break;
        }

        case 'canoe': {
            // Elongated boat-hull vessel with tapered bow/stern and hollowed concave interior trough
            const uSteps = 72;
            const vSteps = 36;
            const halfW = W * 0.5;
            const halfD = D * 0.5;
            const wallThick = Math.max(0.14, Math.min(W, D) * 0.11);

            const positions: number[] = [];
            const uvs: number[] = [];
            const indices: number[] = [];

            // v goes 0..1 from outer keel -> outer gunwale -> lip -> inner cavity -> inner keel
            for (let iu = 0; iu <= uSteps; iu++) {
                const u = iu / uSteps;
                const theta = u * Math.PI * 2;
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);

                // Pointed canoe pinching at bow/stern (or top-down & side-profile mask contours when present)
                const vc = specs.maskAttractions?.vessel_contours;
                const planW: number[] | null = vc?.plan_half_widths || null;
                const profTop: number[] | null = vc?.profile_top_y || null;
                const longitudinal = Math.abs(cosT);
                const sIdx = Math.min(32, Math.max(0, Math.round(((cosT + 1) * 0.5) * 32)));
                const pinchZ = (planW && planW.length > sIdx)
                    ? Math.max(0.08, planW[sIdx])
                    : Math.pow(1 - Math.pow(longitudinal, 2.2) * 0.35, 0.7);
                const prowLift = (profTop && profTop.length > sIdx)
                    ? Math.max(0, (profTop[sIdx] - 0.65) * H * 0.85)
                    : Math.pow(longitudinal, 2.6) * H * 0.32;

                for (let iv = 0; iv <= vSteps; iv++) {
                    const v = iv / vSteps;
                    let rFrac = 0;
                    let yVal = 0;

                    if (v <= 0.48) {
                        // Outer hull from flat keel (0.28) to rim (1.0)
                        const t = v / 0.48;
                        rFrac = 0.26 + 0.74 * Math.sin(t * Math.PI * 0.5);
                        yVal = H * Math.pow(t, 0.88) + prowLift * Math.pow(t, 1.3);
                    } else if (v <= 0.54) {
                        // Gunwale rim rounding
                        const t = (v - 0.48) / 0.06;
                        const innerR = Math.max(0.2, 1.0 - wallThick / Math.max(0.2, halfD));
                        rFrac = 1.0 - (1.0 - innerR) * t;
                        yVal = H + prowLift + Math.sin(t * Math.PI) * wallThick * 0.25;
                    } else {
                        // Hollowed concave interior trough
                        const t = 1.0 - (v - 0.54) / 0.46;
                        const innerR = Math.max(0.2, 1.0 - wallThick / Math.max(0.2, halfD));
                        rFrac = Math.max(0.02, innerR * Math.sin(t * Math.PI * 0.5));
                        const floorY = wallThick * 1.15;
                        yVal = floorY + (H - floorY + prowLift * 0.85) * Math.pow(t, 1.25);
                    }

                    const x = cosT * halfW * rFrac;
                    const z = sinT * halfD * rFrac * pinchZ;
                    const y = yVal - H * 0.5;

                    positions.push(x, y, z);
                    const lu = Math.max(0.01, Math.min(0.99, (x / W) + 0.5));
                    const lv = Math.max(0.01, Math.min(0.99, 0.5 - (z / D)));
                    uvs.push(lu, lv);
                }
            }

            const stride = vSteps + 1;
            for (let iu = 0; iu < uSteps; iu++) {
                for (let iv = 0; iv < vSteps; iv++) {
                    const a = iu * stride + iv;
                    const b = (iu + 1) * stride + iv;
                    const c = (iu + 1) * stride + (iv + 1);
                    const d = iu * stride + (iv + 1);
                    indices.push(a, b, d);
                    indices.push(b, c, d);
                }
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geom.setIndex(indices);
            geom.computeVertexNormals();

            const mesh = new THREE.Mesh(geom, stoneMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            addWarmLight(0, 0, 0, 4.8, 15);
            break;
        }

        case 'mirror': {
            // Thick stone slab frame with hand-cut central aperture + reflective metallic mirror glass backing + warm halo LED backlight
            const slabDepth = Math.min(Math.max(D, 0.35), Math.min(W, H) * 0.16);
            const outerShape = new THREE.Shape();
            const holePath = new THREE.Path();
            const segs = 96;

            const rx = W * 0.5;
            const ry = H * 0.5;
            const borderRatio = 0.25;
            const irx = rx * (1 - borderRatio * 2);
            const iry = ry * (1 - borderRatio * 2);
            const mc = specs.maskAttractions?.mirror_contours;
            const hasMaskOuter = Array.isArray(mc?.outer_points) && mc.outer_points.length >= 12;
            const hasMaskInner = Array.isArray(mc?.inner_hole_points) && mc.inner_hole_points.length >= 12;

            if (hasMaskOuter) {
                mc.outer_points.forEach((pt: number[], i: number) => {
                    const ox = pt[0] * W;
                    const oy = pt[1] * H;
                    if (i === 0) outerShape.moveTo(ox, oy);
                    else outerShape.lineTo(ox, oy);
                });
                outerShape.closePath();
            } else {
                for (let i = 0; i <= segs; i++) {
                const t = (i / segs) * Math.PI * 2;
                const cosT = Math.cos(t);
                const sinT = Math.sin(t);

                let ox = 0, oy = 0;
                if (specs.mirrorSubClass === 'mirror-round') {
                    const w = 1 + handCarvedWiggle(t) * 0.012;
                    ox = cosT * rx * w;
                    oy = sinT * ry * w;
                } else if (specs.mirrorSubClass === 'mirror-freeform') {
                    const w = 1 + Math.sin(t * 3 + 0.4) * 0.08 + Math.cos(t * 5 - 0.7) * 0.04;
                    ox = cosT * rx * w;
                    oy = sinT * ry * w;
                } else {
                    // Rounded superellipse for square/rectangular slab frame
                    const exp = 0.18;
                    const sx = cosT >= 0 ? Math.pow(cosT, exp) : -Math.pow(-cosT, exp);
                    const sy = sinT >= 0 ? Math.pow(sinT, exp) : -Math.pow(-sinT, exp);
                    ox = sx * rx;
                    oy = sy * ry;
                }

                if (i === 0) outerShape.moveTo(ox, oy);
                else outerShape.lineTo(ox, oy);
                }
            }

            // Hand-cut inner opening (from SVG mask inner contour or organic stone edge wiggle)
            if (hasMaskInner) {
                mc.inner_hole_points.forEach((pt: number[], i: number) => {
                    const ix = pt[0] * W;
                    const iy = pt[1] * H;
                    if (i === 0) holePath.moveTo(ix, iy);
                    else holePath.lineTo(ix, iy);
                });
                holePath.closePath();
            } else {
                for (let i = 0; i <= segs; i++) {
                const t = (i / segs) * Math.PI * 2;
                const cosT = Math.cos(t);
                const sinT = Math.sin(t);
                const wig = 1 + handCarvedWiggle(t) * 0.028;

                let ix = 0, iy = 0;
                if (specs.mirrorSubClass === 'mirror-round' || specs.mirrorSubClass === 'mirror-freeform') {
                    ix = cosT * irx * wig;
                    iy = sinT * iry * wig;
                } else {
                    const exp = 0.32;
                    const sx = cosT >= 0 ? Math.pow(cosT, exp) : -Math.pow(-cosT, exp);
                    const sy = sinT >= 0 ? Math.pow(sinT, exp) : -Math.pow(-sinT, exp);
                    ix = sx * irx * wig;
                    iy = sy * iry * wig;
                }

                if (i === 0) holePath.moveTo(ix, iy);
                else holePath.lineTo(ix, iy);
                }
            }
            outerShape.holes.push(holePath);

            const frameGeom = new THREE.ExtrudeGeometry(outerShape, {
                depth: slabDepth,
                bevelEnabled: true,
                bevelThickness: slabDepth * 0.12,
                bevelSize: slabDepth * 0.1,
                bevelSegments: 4,
                curveSegments: 64
            });
            frameGeom.center();
            normalizeGeometryUVs(frameGeom);

            const frameMesh = new THREE.Mesh(frameGeom, stoneMat);
            frameMesh.castShadow = true;
            frameMesh.receiveShadow = true;
            group.add(frameMesh);

            // Reflective metallic mirror glass backing plane
            const mirrorMat = new THREE.MeshPhysicalMaterial({
                color: 0xf0f6ff,
                metalness: 0.98,
                roughness: 0.02,
                clearcoat: 1.0,
                clearcoatRoughness: 0.01,
                reflectivity: 1.0,
                envMapIntensity: 2.4
            });
            const glassGeom =
                specs.mirrorSubClass === 'mirror-round' || specs.mirrorSubClass === 'mirror-freeform'
                    ? new THREE.CircleGeometry(Math.max(irx, iry) * 1.08, 64)
                    : new THREE.PlaneGeometry(irx * 2.15, iry * 2.15);
            const glassMesh = new THREE.Mesh(glassGeom, mirrorMat);
            if (specs.mirrorSubClass === 'mirror-round' || specs.mirrorSubClass === 'mirror-freeform') {
                glassMesh.scale.set(irx / Math.max(irx, iry), iry / Math.max(irx, iry), 1);
            }
            glassMesh.position.z = -slabDepth * 0.15;
            group.add(glassMesh);

            // Dark backing board behind glass so mirror doesn't show from rear
            const backBoard = new THREE.Mesh(
                glassGeom.clone(),
                new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 })
            );
            backBoard.scale.copy(glassMesh.scale);
            backBoard.position.z = -slabDepth * 0.22;
            backBoard.rotation.y = Math.PI;
            group.add(backBoard);

            // Warm LED halo ring + rear lights behind the translucent onyx frame
            addWarmLight(0, 0, -slabDepth * 1.4, 7.5, 20);
            addWarmLight(rx * 0.65, ry * 0.55, -slabDepth * 1.1, 4.0, 14);
            addWarmLight(-rx * 0.65, -ry * 0.55, -slabDepth * 1.1, 4.0, 14);
            break;
        }

        case 'floor-lamp':
        case 'tower-lamp':
        case 'table-lamp':
        case 'pendant': {
            const isRound = /\b(cylinder|cilinder|round|cilindro|redondo|tube|tubo)\b/i.test(combinedText);
            const isSphere = /\b(sphere|esfera|ball|orb|globe)\b/i.test(combinedText);
            const isPyramid = /\b(pyramid|piramide|obelisk|obelisco|taper)\b/i.test(combinedText);
            const isPendant = specs.archetype === 'pendant';

            const wallThick = Math.max(0.14, Math.min(W, D) * 0.12);

            if (isSphere) {
                const radius = Math.max(W, H, D) * 0.45;
                const geom = new THREE.SphereGeometry(radius, 64, 48);
                normalizeGeometryUVs(geom);
                const orb = new THREE.Mesh(geom, stoneMat);
                orb.castShadow = true;
                group.add(orb);
            } else if (isRound) {
                // Hollowed cylindrical stone column via LatheGeometry
                const rOut = (W + D) * 0.25;
                const rIn = Math.max(0.1, rOut - wallThick);
                const pts = [
                    new THREE.Vector2(rIn, -H * 0.5),
                    new THREE.Vector2(rOut, -H * 0.5),
                    new THREE.Vector2(rOut, H * 0.5),
                    new THREE.Vector2(rIn, H * 0.5),
                    new THREE.Vector2(rIn, -H * 0.46)
                ];
                const geom = new THREE.LatheGeometry(pts, 72);
                normalizeGeometryUVs(geom);
                const col = new THREE.Mesh(geom, stoneMat);
                col.castShadow = true;
                col.receiveShadow = true;
                group.add(col);
            } else {
                // Hollowed squared / tapered column with 4 mitered translucent stone walls
                const outerShape = new THREE.Shape();
                const hw = W * 0.5;
                const hd = D * 0.5;
                outerShape.moveTo(-hw, -hd);
                outerShape.lineTo(hw, -hd);
                outerShape.lineTo(hw, hd);
                outerShape.lineTo(-hw, hd);
                outerShape.closePath();

                const hole = new THREE.Path();
                const ihw = Math.max(0.1, hw - wallThick);
                const ihd = Math.max(0.1, hd - wallThick);
                hole.moveTo(-ihw, -ihd);
                hole.lineTo(ihw, -ihd);
                hole.lineTo(ihw, ihd);
                hole.lineTo(-ihw, ihd);
                hole.closePath();
                outerShape.holes.push(hole);

                const extrudeGeom = new THREE.ExtrudeGeometry(outerShape, {
                    depth: H,
                    bevelEnabled: true,
                    bevelThickness: 0.04,
                    bevelSize: 0.04,
                    bevelSegments: 2
                });
                extrudeGeom.rotateX(-Math.PI / 2);
                extrudeGeom.center();

                if (isPyramid) {
                    const pos = extrudeGeom.attributes.position;
                    for (let i = 0; i < pos.count; i++) {
                        const y = pos.getY(i);
                        const t = (y + H * 0.5) / Math.max(0.001, H);
                        const taper = 1 - t * 0.55;
                        pos.setX(i, pos.getX(i) * taper);
                        pos.setZ(i, pos.getZ(i) * taper);
                    }
                    extrudeGeom.computeVertexNormals();
                }

                if (specs.archetype === 'tower-lamp' || specs.archetype === 'floor-lamp' || specs.maskAttractions?.tower_lamp_corner_uv) {
                    applyCornerLampUVs(extrudeGeom, specs.maskAttractions?.tower_lamp_corner_uv);
                    extrudeGeom.rotateY(-Math.PI * 0.25);
                } else {
                    normalizeGeometryUVs(extrudeGeom);
                }
                const colMesh = new THREE.Mesh(extrudeGeom, stoneMat);
                colMesh.castShadow = true;
                colMesh.receiveShadow = true;
                group.add(colMesh);
            }

            // Internal warm glowing core bulb column + PointLights
            const coreH = H * 0.72;
            const coreR = Math.min(W, D) * 0.16;
            const coreMat = new THREE.MeshBasicMaterial({
                color: 0xffb866,
                transparent: true,
                opacity: 0.85
            });
            const coreMesh = new THREE.Mesh(new THREE.CylinderGeometry(coreR, coreR, coreH, 24), coreMat);
            group.add(coreMesh);
            glowMeshes.push(coreMesh);

            addWarmLight(0, -H * 0.18, 0, 7.5, 20);
            addWarmLight(0, H * 0.18, 0, 6.5, 18);

            if (isPendant) {
                // Architectural bronze cord + canopy
                const cordMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8, roughness: 0.3 });
                const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, H * 0.45, 12), cordMat);
                cord.position.y = H * 0.5 + H * 0.225;
                group.add(cord);
            } else {
                // Dark brushed stone plinth base
                const plinthMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.4, metalness: 0.2 });
                const plinth = new THREE.Mesh(new THREE.BoxGeometry(W * 1.04, H * 0.045, D * 1.04), plinthMat);
                plinth.position.y = -H * 0.5 - H * 0.022;
                group.add(plinth);
            }
            break;
        }

        case 'wall-panel':
        case 'panel-pair':
        case 'painted-wall-panel': {
            const slabDepth = Math.min(Math.max(D, 0.24), 0.48);
            const pc = specs.maskAttractions?.panel_pair_contours;
            const wpc = specs.maskAttractions?.wall_panel_contours;
            const isPair = specs.archetype === 'panel-pair' || Boolean(pc);
            const isFree = isFreeFormPanel(combinedText);

            // Procedural fallback slab builder: for bookmatched free-form pairs, keeps the inner saw-cut seam straight
            // and shapes the outer edge with natural live-edge undulation (matching 2D axo freeFormOutline)
            const createPanelMesh = (panelW: number, panelH: number, isRightOfPair = false, bboxUv?: number[]) => {
                if (isFree) {
                    const shape = new THREE.Shape();
                    const hw = panelW * 0.5;
                    const hh = panelH * 0.5;
                    const pts: [number, number][] = [];
                    if (isPair) {
                        // Straight vertical inner seam + undulating natural outer edge
                        const steps = 28;
                        if (!isRightOfPair) {
                            // Left slab: straight right seam at x = +hw, natural outer edge on left/top/bottom
                            pts.push([hw, -hh * 0.94]);
                            pts.push([hw, hh * 0.97]);
                            for (let i = 0; i <= 10; i++) {
                                const t = i / 10;
                                const x = hw * (1 - 2 * t);
                                const y = hh * (0.97 - 0.04 * Math.sin(t * Math.PI) - 0.05 * Math.pow(t, 2));
                                pts.push([x, y]);
                            }
                            for (let i = 1; i <= steps; i++) {
                                const t = i / steps;
                                const y = hh * (0.92 - 1.88 * t);
                                const rind = 0.88 + 0.08 * Math.sin(t * Math.PI * 3.2 + 0.4) + 0.04 * Math.cos(t * Math.PI * 7.0);
                                const taperBot = t > 0.78 ? (t - 0.78) * 0.65 : 0;
                                const x = -hw * Math.max(0.55, rind - taperBot);
                                pts.push([x, y]);
                            }
                            for (let i = 1; i <= 8; i++) {
                                const t = i / 8;
                                const x = -hw * 0.68 * (1 - t) + hw * t;
                                const y = -hh * (0.96 - 0.04 * t);
                                pts.push([x, y]);
                            }
                        } else {
                            // Right slab: mirror of left slab (straight left seam at x = -hw, natural outer edge on right)
                            pts.push([-hw, -hh * 0.94]);
                            for (let i = 1; i <= 8; i++) {
                                const t = i / 8;
                                const x = -hw * (1 - t) + hw * 0.68 * t;
                                const y = -hh * (0.94 + 0.04 * t);
                                pts.push([x, y]);
                            }
                            for (let i = steps; i >= 0; i--) {
                                const t = i / steps;
                                const y = hh * (0.92 - 1.88 * t);
                                const rind = 0.88 + 0.08 * Math.sin(t * Math.PI * 3.2 + 0.4) + 0.04 * Math.cos(t * Math.PI * 7.0);
                                const taperBot = t > 0.78 ? (t - 0.78) * 0.65 : 0;
                                const x = hw * Math.max(0.55, rind - taperBot);
                                pts.push([x, y]);
                            }
                            for (let i = 10; i >= 0; i--) {
                                const t = i / 10;
                                const x = -hw * (1 - 2 * t);
                                const y = hh * (0.97 - 0.04 * Math.sin(t * Math.PI) - 0.05 * Math.pow(t, 2));
                                pts.push([x, y]);
                            }
                        }
                    } else {
                        const segs = 72;
                        for (let i = 0; i <= segs; i++) {
                            const t = (i / segs) * Math.PI * 2;
                            const w = 1 + Math.sin(t * 3 + 0.6) * 0.07 + Math.cos(t * 5) * 0.03;
                            pts.push([Math.cos(t) * hw * w, Math.sin(t) * hh * w]);
                        }
                    }
                    pts.forEach((pt, idx) => {
                        if (idx === 0) shape.moveTo(pt[0], pt[1]);
                        else shape.lineTo(pt[0], pt[1]);
                    });
                    shape.closePath();
                    const g = new THREE.ExtrudeGeometry(shape, {
                        depth: slabDepth,
                        bevelEnabled: true,
                        bevelThickness: 0.025,
                        bevelSize: 0.02,
                        bevelSegments: 3
                    });
                    g.center();
                    applyBoxUVsInSubregion(g, bboxUv || [0, 0, 1, 1]);
                    return new THREE.Mesh(g, stoneMat);
                } else {
                    const g = new THREE.BoxGeometry(panelW, panelH, slabDepth, 4, 4, 2);
                    applyBoxUVsInSubregion(g, bboxUv || [0, 0, 1, 1]);
                    return new THREE.Mesh(g, stoneMat);
                }
            };

            if (isPair) {
                const gap = W * 0.032;
                const singleW = (W - gap) * 0.5;
                const leftBbox = [0.0, 0.0, 0.492, 1.0];
                const rightBbox = [0.508, 0.0, 1.0, 1.0];
                if (pc && Array.isArray(pc.left_points) && pc.left_points.length >= 8 && Array.isArray(pc.right_points) && pc.right_points.length >= 8) {
                    const buildSplitSlab = (pts: number[][], bboxUv: number[]) => {
                        const sh = new THREE.Shape();
                        pts.forEach((pt, idx) => {
                            const px = pt[0] * singleW;
                            const py = pt[1] * H;
                            if (idx === 0) sh.moveTo(px, py);
                            else sh.lineTo(px, py);
                        });
                        sh.closePath();
                        const g = new THREE.ExtrudeGeometry(sh, {
                            depth: slabDepth,
                            bevelEnabled: true,
                            bevelThickness: 0.025,
                            bevelSize: 0.02,
                            bevelSegments: 3
                        });
                        g.center();
                        applyBoxUVsInSubregion(g, bboxUv);
                        return new THREE.Mesh(g, stoneMat);
                    };
                    const leftSlab = buildSplitSlab(pc.left_points, leftBbox);
                    leftSlab.position.x = -(singleW * 0.5 + gap * 0.5);
                    leftSlab.castShadow = true;
                    group.add(leftSlab);

                    const rightSlab = buildSplitSlab(pc.right_points, rightBbox);
                    rightSlab.position.x = singleW * 0.5 + gap * 0.5;
                    rightSlab.castShadow = true;
                    group.add(rightSlab);
                } else {
                    const leftSlab = createPanelMesh(singleW, H, false, leftBbox);
                    leftSlab.position.x = -(singleW * 0.5 + gap * 0.5);
                    leftSlab.castShadow = true;
                    group.add(leftSlab);

                    const rightSlab = createPanelMesh(singleW, H, true, rightBbox);
                    rightSlab.position.x = singleW * 0.5 + gap * 0.5;
                    rightSlab.castShadow = true;
                    group.add(rightSlab);
                }
            } else {
                const singleBbox = [0, 0, 1, 1];
                if (isFree && Array.isArray(wpc?.outer_points) && wpc.outer_points.length >= 8) {
                    const sh = new THREE.Shape();
                    wpc.outer_points.forEach((pt: number[], idx: number) => {
                        if (idx === 0) sh.moveTo(pt[0] * W, pt[1] * H);
                        else sh.lineTo(pt[0] * W, pt[1] * H);
                    });
                    sh.closePath();
                    const g = new THREE.ExtrudeGeometry(sh, {
                        depth: slabDepth,
                        bevelEnabled: true,
                        bevelThickness: 0.025,
                        bevelSize: 0.02,
                        bevelSegments: 3
                    });
                    g.center();
                    applyBoxUVsInSubregion(g, singleBbox);
                    const slab = new THREE.Mesh(g, stoneMat);
                    slab.castShadow = true;
                    group.add(slab);
                } else {
                    const slab = createPanelMesh(W, H, false, singleBbox);
                    slab.castShadow = true;
                    group.add(slab);
                }
            }

            // Rear warm LED point lights (no solid yellow rectangle plane behind the slabs!)
            addWarmLight(-W * 0.24, H * 0.22, -slabDepth * 1.8, 4.5, 18);
            addWarmLight(W * 0.24, -H * 0.22, -slabDepth * 1.8, 4.5, 18);
            addWarmLight(0, 0, -slabDepth * 1.6, 5.5, 20);
            break;
        }

        case 'fountain-yinyang-rect': {
            // Broad low rectangular fluted basin trough + interior water pool + twin vertical fluted monolith slabs + central S-curved Yin-Yang cascading water seam
            const basinH = H * 0.24;
            const basinWall = Math.min(W, D) * 0.09;
            const baseY = -H * 0.5;

            // Outer fluted basin trough
            const basinShape = new THREE.Shape();
            const hw = W * 0.5;
            const hd = D * 0.5;
            basinShape.moveTo(-hw, -hd);
            basinShape.lineTo(hw, -hd);
            basinShape.lineTo(hw, hd);
            basinShape.lineTo(-hw, hd);
            basinShape.closePath();

            const basinHole = new THREE.Path();
            basinHole.moveTo(-(hw - basinWall), -(hd - basinWall));
            basinHole.lineTo(hw - basinWall, -(hd - basinWall));
            basinHole.lineTo(hw - basinWall, hd - basinWall);
            basinHole.lineTo(-(hw - basinWall), hd - basinWall);
            basinHole.closePath();
            basinShape.holes.push(basinHole);

            const basinGeom = new THREE.ExtrudeGeometry(basinShape, {
                depth: basinH,
                bevelEnabled: true,
                bevelThickness: 0.04,
                bevelSize: 0.04,
                bevelSegments: 2
            });
            basinGeom.rotateX(-Math.PI / 2);
            basinGeom.translate(0, baseY, 0);
            normalizeGeometryUVs(basinGeom);
            const basinMesh = new THREE.Mesh(basinGeom, stoneMat);
            basinMesh.castShadow = true;
            basinMesh.receiveShadow = true;
            group.add(basinMesh);

            // Basin floor
            const floorGeom = new THREE.BoxGeometry(W * 0.96, basinH * 0.22, D * 0.96);
            normalizeGeometryUVs(floorGeom);
            const floorMesh = new THREE.Mesh(floorGeom, stoneMat);
            floorMesh.position.y = baseY + basinH * 0.11;
            group.add(floorMesh);

            // Shimmering water pool surface inside basin
            const waterMat = new THREE.MeshPhysicalMaterial({
                color: 0x38bdf8,
                transmission: 0.85,
                opacity: 1,
                transparent: true,
                roughness: 0.05,
                ior: 1.333,
                thickness: 1.2,
                clearcoat: 1.0
            });
            const waterPool = new THREE.Mesh(
                new THREE.PlaneGeometry(W - basinWall * 2.1, D - basinWall * 2.1),
                waterMat
            );
            waterPool.rotation.x = -Math.PI / 2;
            waterPool.position.y = baseY + basinH * 0.76;
            group.add(waterPool);

            // Twin vertical fluted monolith slabs with S-curved Yin-Yang central cascading water seam
            const towerH = H * 0.78;
            const towerW = W * 0.34;
            const towerD = D * 0.34;
            const seamGap = W * 0.045;

            for (const side of [-1, 1]) {
                const tGeom = new THREE.BoxGeometry(towerW, towerH, towerD, 16, 28, 8);
                const pos = tGeom.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    let x = pos.getX(i);
                    const y = pos.getY(i);
                    let z = pos.getZ(i);
                    const ny = (y + towerH * 0.5) / towerH;

                    // S-curved Yin-Yang inner edge facing the central seam
                    const sWave = Math.sin(ny * Math.PI * 2.0) * (towerW * 0.18);
                    if ((side === -1 && x > towerW * 0.2) || (side === 1 && x < -towerW * 0.2)) {
                        x += sWave;
                    }
                    // Carved vertical flutes on front/back faces
                    const flute = Math.sin((x / towerW) * Math.PI * 14) * 0.035;
                    if (Math.abs(z) > towerD * 0.42) {
                        z += Math.sign(z) * flute;
                    }
                    pos.setXYZ(i, x, y, z);
                }
                tGeom.computeVertexNormals();
                normalizeGeometryUVs(tGeom);

                const towerMesh = new THREE.Mesh(tGeom, stoneMat);
                towerMesh.position.set(
                    side * (towerW * 0.5 + seamGap * 0.5),
                    baseY + basinH * 0.6 + towerH * 0.5,
                    0
                );
                towerMesh.castShadow = true;
                towerMesh.receiveShadow = true;
                group.add(towerMesh);
            }

            // Central S-curved Yin-Yang cascading water ribbon
            const streamCurvePts: THREE.Vector3[] = [];
            for (let i = 0; i <= 24; i++) {
                const t = i / 24;
                const sy = baseY + basinH * 0.75 + t * (towerH * 0.96);
                const sx = Math.sin(t * Math.PI * 2.0) * (towerW * 0.16);
                streamCurvePts.push(new THREE.Vector3(sx, sy, 0));
            }
            const streamCurve = new THREE.CatmullRomCurve3(streamCurvePts);
            const streamGeom = new THREE.TubeGeometry(streamCurve, 40, seamGap * 0.48, 12, false);
            const streamMesh = new THREE.Mesh(streamGeom, waterMat);
            group.add(streamMesh);

            addWarmLight(0, baseY + basinH + towerH * 0.45, 0, 6.5, 18);
            addWarmLight(-towerW * 0.4, baseY + basinH * 0.9, 0, 4.0, 14);
            addWarmLight(towerW * 0.4, baseY + basinH * 0.9, 0, 4.0, 14);
            break;
        }

        case 'table':
        case 'coffee-table': {
            const isRoundTop = /\b(round|circle|oval|redond)\b/i.test(combinedText);
            const isDiamond = /\b(diamond|diamante|facet|octa)\b/i.test(combinedText);
            const topThick = Math.max(0.24, H * 0.14);
            const baseH = H - topThick;

            // Tabletop slab
            let topGeom: THREE.BufferGeometry;
            if (isRoundTop) {
                topGeom = new THREE.CylinderGeometry(W * 0.5, W * 0.5, topThick, 64);
                topGeom.scale(1, 1, D / Math.max(0.001, W));
            } else {
                topGeom = new THREE.BoxGeometry(W, topThick, D, 4, 2, 4);
            }
            normalizeGeometryUVs(topGeom);
            const topMesh = new THREE.Mesh(topGeom, stoneMat);
            topMesh.position.y = H * 0.5 - topThick * 0.5;
            topMesh.castShadow = true;
            topMesh.receiveShadow = true;
            group.add(topMesh);

            // Pedestal base (faceted diamond / architectural column)
            let baseGeom: THREE.BufferGeometry;
            if (isDiamond) {
                baseGeom = new THREE.CylinderGeometry(W * 0.28, W * 0.34, baseH, 8, 2);
                const pos = baseGeom.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    if (Math.abs(y) < baseH * 0.15) {
                        pos.setX(i, pos.getX(i) * 1.28);
                        pos.setZ(i, pos.getZ(i) * 1.28);
                    }
                }
                baseGeom.computeVertexNormals();
            } else {
                baseGeom = new THREE.CylinderGeometry(W * 0.28, W * 0.34, baseH, isRoundTop ? 48 : 4);
                if (!isRoundTop) baseGeom.rotateY(Math.PI / 4);
                baseGeom.scale(1, 1, D / Math.max(0.001, W));
            }
            normalizeGeometryUVs(baseGeom);
            const baseMesh = new THREE.Mesh(baseGeom, stoneMat);
            baseMesh.position.y = -H * 0.5 + baseH * 0.5;
            baseMesh.castShadow = true;
            baseMesh.receiveShadow = true;
            group.add(baseMesh);

            addWarmLight(0, 0, 0, 5.5, 16);
            break;
        }

        case 'couch-angled': {
            // Monolithic stone armchair (`EM326115OOOH` style) with inward-chamfered V-front apron,
            // flared trapezoidal side arms, reclined backrest, and sunken seat well
            const baseY = -H * 0.5;
            const seatH = H * 0.42;
            const armW = W * 0.2;

            // V-chamfered monolithic seat base
            const seatShape = new THREE.Shape();
            const hw = W * 0.48;
            const hd = D * 0.48;
            seatShape.moveTo(-hw * 0.85, -hd);
            seatShape.lineTo(hw * 0.85, -hd);
            seatShape.lineTo(hw, hd * 0.72);
            seatShape.lineTo(0, hd); // V-angled front apron apex
            seatShape.lineTo(-hw, hd * 0.72);
            seatShape.closePath();

            const seatGeom = new THREE.ExtrudeGeometry(seatShape, {
                depth: seatH,
                bevelEnabled: true,
                bevelThickness: 0.05,
                bevelSize: 0.05,
                bevelSegments: 3
            });
            seatGeom.rotateX(-Math.PI / 2);
            seatGeom.translate(0, baseY, 0);
            normalizeGeometryUVs(seatGeom);
            const seatMesh = new THREE.Mesh(seatGeom, stoneMat);
            seatMesh.castShadow = true;
            seatMesh.receiveShadow = true;
            group.add(seatMesh);

            // Flared trapezoidal side arms
            for (const side of [-1, 1]) {
                const armGeom = new THREE.BoxGeometry(armW, H * 0.76, D * 0.88, 4, 6, 4);
                const pos = armGeom.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    const ny = (y + H * 0.38) / (H * 0.76);
                    // Outward flare toward top of armrest
                    pos.setX(i, pos.getX(i) + side * ny * armW * 0.38);
                }
                armGeom.computeVertexNormals();
                normalizeGeometryUVs(armGeom);
                const armMesh = new THREE.Mesh(armGeom, stoneMat);
                armMesh.position.set(side * (W * 0.5 - armW * 0.58), baseY + H * 0.38, -D * 0.03);
                armMesh.castShadow = true;
                armMesh.receiveShadow = true;
                group.add(armMesh);
            }

            // Reclined monolithic backrest slab
            const backW = W - armW * 1.5;
            const backH = H * 0.68;
            const backD = D * 0.22;
            const backGeom = new THREE.BoxGeometry(backW, backH, backD, 4, 6, 4);
            normalizeGeometryUVs(backGeom);
            const backMesh = new THREE.Mesh(backGeom, stoneMat);
            backMesh.position.set(0, baseY + seatH * 0.75 + backH * 0.45, -D * 0.32);
            backMesh.rotation.x = -0.18;
            backMesh.castShadow = true;
            backMesh.receiveShadow = true;
            group.add(backMesh);

            addWarmLight(0, baseY + seatH * 0.6, 0, 5.5, 16);
            break;
        }

        case 'bar-l-shaped': {
            // 90° L-shaped bar (`TE32626HXFX` style): two perpendicular wings, overhanging 45° mitered countertop,
            // illuminated front onyx panels, and dark recessed toe-kick base
            const baseY = -H * 0.5;
            const legDepth = Math.min(W, D) * 0.34;
            const kickH = H * 0.08;
            const topH = H * 0.09;
            const bodyH = H - kickH - topH;

            const createLShape = (wSpan: number, dSpan: number, thick: number) => {
                const s = new THREE.Shape();
                const x0 = -wSpan * 0.5;
                const z0 = -dSpan * 0.5;
                s.moveTo(x0, z0);
                s.lineTo(x0 + wSpan, z0);
                s.lineTo(x0 + wSpan, z0 + thick);
                s.lineTo(x0 + thick, z0 + thick);
                s.lineTo(x0 + thick, z0 + dSpan);
                s.lineTo(x0, z0 + dSpan);
                s.closePath();
                return s;
            };

            // 1. Dark recessed toe-kick plinth
            const kickMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.5, metalness: 0.3 });
            const kickGeom = new THREE.ExtrudeGeometry(
                createLShape(W * 0.94, D * 0.94, legDepth * 0.88),
                { depth: kickH, bevelEnabled: false }
            );
            kickGeom.rotateX(-Math.PI / 2);
            kickGeom.translate(0, baseY, 0);
            group.add(new THREE.Mesh(kickGeom, kickMat));

            // 2. Illuminated L-shaped onyx body panels
            const bodyGeom = new THREE.ExtrudeGeometry(
                createLShape(W * 0.97, D * 0.97, legDepth * 0.94),
                {
                    depth: bodyH,
                    bevelEnabled: true,
                    bevelThickness: 0.03,
                    bevelSize: 0.03,
                    bevelSegments: 2
                }
            );
            bodyGeom.rotateX(-Math.PI / 2);
            bodyGeom.translate(0, baseY + kickH, 0);
            normalizeGeometryUVs(bodyGeom);
            const bodyMesh = new THREE.Mesh(bodyGeom, stoneMat);
            bodyMesh.castShadow = true;
            bodyMesh.receiveShadow = true;
            group.add(bodyMesh);

            // 3. Overhanging 45° mitered chevron countertop slab
            const topGeom = new THREE.ExtrudeGeometry(
                createLShape(W * 1.03, D * 1.03, legDepth * 1.08),
                {
                    depth: topH,
                    bevelEnabled: true,
                    bevelThickness: 0.035,
                    bevelSize: 0.035,
                    bevelSegments: 3
                }
            );
            topGeom.rotateX(-Math.PI / 2);
            topGeom.translate(0, baseY + kickH + bodyH, 0);
            normalizeGeometryUVs(topGeom);
            const topMesh = new THREE.Mesh(topGeom, stoneMat);
            topMesh.castShadow = true;
            topMesh.receiveShadow = true;
            group.add(topMesh);

            addWarmLight(-W * 0.25, 0, -D * 0.25, 6.5, 18);
            addWarmLight(W * 0.15, 0, -D * 0.32, 5.5, 16);
            addWarmLight(-W * 0.32, 0, D * 0.15, 5.5, 16);
            break;
        }

        case 'wine-rack': {
            // Carved stone monolith with cylindrical wine bottle holes
            const shape = new THREE.Shape();
            const hw = W * 0.5;
            const hh = H * 0.5;
            shape.moveTo(-hw * 0.82, -hh);
            shape.lineTo(hw * 0.82, -hh);
            shape.quadraticCurveTo(hw, 0, hw * 0.72, hh * 0.88);
            shape.quadraticCurveTo(0, hh * 1.05, -hw * 0.72, hh * 0.88);
            shape.quadraticCurveTo(-hw, 0, -hw * 0.82, -hh);

            const nHoles = Math.min(12, Math.max(3, specs.holesCount));
            const holeR = Math.min(W, H) * 0.11;
            const rows = Math.ceil(nHoles / 2);
            for (let i = 0; i < nHoles; i++) {
                const row = Math.floor(i / 2);
                const col = i % 2;
                const hx = (col === 0 ? -1 : 1) * hw * 0.34;
                const hy = -hh * 0.58 + ((row + 0.5) / rows) * (H * 0.72) + (col === 1 ? H * 0.05 : 0);
                const hp = new THREE.Path();
                hp.absarc(hx, hy, holeR, 0, Math.PI * 2, false);
                shape.holes.push(hp);
            }

            const geom = new THREE.ExtrudeGeometry(shape, {
                depth: D,
                bevelEnabled: true,
                bevelThickness: 0.04,
                bevelSize: 0.04,
                bevelSegments: 3
            });
            geom.center();
            normalizeGeometryUVs(geom);
            const mesh = new THREE.Mesh(geom, stoneMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            addWarmLight(0, 0, -D * 0.9, 5.5, 16);
            break;
        }

        case 'sphere': {
            const r = Math.max(W, H, D) * 0.46;
            const geom = new THREE.SphereGeometry(r, 64, 48);
            normalizeGeometryUVs(geom);
            const mesh = new THREE.Mesh(geom, stoneMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
            addWarmLight(0, 0, 0, 5.5, 15);
            break;
        }

        case 'sculpture':
        case 'rock': {
            const geom = new THREE.IcosahedronGeometry(Math.max(W, H, D) * 0.45, specs.archetype === 'rock' ? 3 : 1);
            geom.scale(W / Math.max(W, H, D), H / Math.max(W, H, D), D / Math.max(W, H, D));
            const pos = geom.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i);
                const vy = pos.getY(i);
                const vz = pos.getZ(i);
                const n = 1 + Math.sin(vx * 1.7 + vy * 2.3) * 0.08 + Math.cos(vz * 2.1 - vy) * 0.06;
                pos.setXYZ(i, vx * n, vy * n, vz * n);
            }
            geom.computeVertexNormals();
            normalizeGeometryUVs(geom);
            const mesh = new THREE.Mesh(geom, stoneMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
            addWarmLight(0, 0, 0, 4.5, 14);
            break;
        }

        default: {
            const geom = new THREE.BoxGeometry(W, H, D, 8, 8, 8);
            normalizeGeometryUVs(geom);
            const mesh = new THREE.Mesh(geom, stoneMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
            addWarmLight(0, 0, 0, 5.0, 15);
            break;
        }
    }

    return {
        meshGroup: group,
        backlights,
        glowMeshes,
        normalizedDims: { w: W, h: H, d: D }
    };
}

/**
 * Generates and downloads a standalone self-contained `<barcode>_3d.html` artifact
 * with embedded texture data URL, physical material parameters, and interactive Three.js scene.
 */
function exportStandalone3DHtml(specs: ParsedItemSpecs, albedoDataUrl: string, bumpDataUrl: string): void {
    const safeTitle = specs.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${specs.barcode} — ${safeTitle} (3D Onyx Artifact)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #090b10; color: #f1f5f9; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; overflow: hidden; height: 100vh; width: 100vw; }
  #canvas-host { width: 100%; height: 100%; position: relative; }
  .hud-top { position: fixed; top: 18px; left: 18px; right: 18px; display: flex; justify-content: space-between; align-items: center; pointer-events: none; z-index: 10; }
  .badge-card { pointer-events: auto; background: rgba(15, 23, 42, 0.78); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 10px 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
  .barcode { font-family: ui-monospace, monospace; font-weight: 800; font-size: 12px; color: #38bdf8; background: rgba(56,189,248,0.14); padding: 4px 9px; border-radius: 7px; border: 1px solid rgba(56,189,248,0.3); }
  .title { font-weight: 700; font-size: 14px; color: #fff; }
  .dims { font-family: ui-monospace, monospace; font-size: 12px; color: #94a3b8; }
  .toolbar { pointer-events: auto; display: flex; gap: 8px; }
  button { background: rgba(15, 23, 42, 0.82); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; padding: 8px 13px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  button.active { background: rgba(245, 158, 11, 0.22); color: #fcd34d; border-color: rgba(245, 158, 11, 0.45); }
  button:hover { background: rgba(255,255,255,0.12); }
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.167.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.167.0/examples/jsm/"
  }
}
</script>
</head>
<body>
<div class="hud-top">
  <div class="badge-card">
    <span class="barcode">${specs.barcode}</span>
    <div>
      <div class="title">${safeTitle}</div>
      <div class="dims">${specs.stoneText} · ${specs.widthCm} × ${specs.heightCm} × ${specs.lengthCm} cm (${specs.archetype})</div>
    </div>
  </div>
  <div class="toolbar">
    <button id="btn-glow" class="active">Backlight Glow: ON</button>
    <button id="btn-rot" class="active">Auto-Rotate: ON</button>
  </div>
</div>
<div id="canvas-host"></div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SPECS = ${JSON.stringify({
        archetype: specs.archetype,
        widthCm: specs.widthCm,
        heightCm: specs.heightCm,
        lengthCm: specs.lengthCm,
        isPorousStone: specs.isPorousStone,
        dominantHex: specs.dominantHex,
        mirrorSubClass: specs.mirrorSubClass
    })};
const ALBEDO_URL = ${JSON.stringify(albedoDataUrl)};
const BUMP_URL = ${JSON.stringify(bumpDataUrl)};

const host = document.getElementById('canvas-host');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090b10);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(8.5, 5.8, 10.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.4;

const loader = new THREE.TextureLoader();
const albedoTex = loader.load(ALBEDO_URL);
albedoTex.colorSpace = THREE.SRGBColorSpace;
const bumpTex = loader.load(BUMP_URL);

const mat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  map: albedoTex,
  bumpMap: bumpTex,
  bumpScale: SPECS.isPorousStone ? 0.28 : 0.06,
  transmission: SPECS.isPorousStone ? 0.03 : 0.24,
  thickness: 2.0,
  ior: 1.54,
  roughness: SPECS.isPorousStone ? 0.62 : 0.18,
  metalness: 0.0,
  clearcoat: SPECS.isPorousStone ? 0.12 : 0.72,
  clearcoatRoughness: 0.1,
  attenuationColor: new THREE.Color(0xffffff),
  attenuationDistance: 10.0,
  emissive: new THREE.Color(0xffffff),
  emissiveMap: albedoTex,
  emissiveIntensity: 0.16,
  side: THREE.FrontSide
});

const maxCm = Math.max(SPECS.widthCm, SPECS.heightCm, SPECS.lengthCm, 1);
const s = 8.0 / maxCm;
const W = Math.max(0.6, SPECS.widthCm * s);
const H = Math.max(0.4, SPECS.heightCm * s);
const D = Math.max(0.35, SPECS.lengthCm * s);

let geom;
if (SPECS.archetype === 'bowl' || SPECS.archetype === 'plate') {
  const r = (W + D) * 0.25;
  const pts = [new THREE.Vector2(0.01, 0), new THREE.Vector2(r * 0.45, 0), new THREE.Vector2(r, H), new THREE.Vector2(r * 0.88, H), new THREE.Vector2(0.01, H * 0.18)];
  geom = new THREE.LatheGeometry(pts, 72);
  geom.center();
} else if (SPECS.archetype === 'sphere') {
  geom = new THREE.SphereGeometry(Math.max(W, H, D) * 0.45, 64, 48);
} else {
  geom = new THREE.BoxGeometry(W, H, D, 12, 12, 12);
}
const mesh = new THREE.Mesh(geom, mat);
scene.add(mesh);

scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
keyLight.position.set(10, 14, 12);
scene.add(keyLight);

const warmLight = new THREE.PointLight(0xffae52, 6.5, 22, 1.4);
warmLight.position.set(0, 0, -D * 0.4);
scene.add(warmLight);

let glowOn = true;
document.getElementById('btn-glow').onclick = (e) => {
  glowOn = !glowOn;
  warmLight.intensity = glowOn ? 6.5 : 0;
  mat.emissiveIntensity = glowOn ? 0.25 : 0.02;
  e.target.textContent = 'Backlight Glow: ' + (glowOn ? 'ON' : 'OFF');
  e.target.classList.toggle('active', glowOn);
};
document.getElementById('btn-rot').onclick = (e) => {
  controls.autoRotate = !controls.autoRotate;
  e.target.textContent = 'Auto-Rotate: ' + (controls.autoRotate ? 'ON' : 'OFF');
  e.target.classList.toggle('active', controls.autoRotate);
};
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cleanCode = specs.barcode.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `${cleanCode}_3d.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.success(`${cleanCode}_3d.html saved`);
}

export const ThreeModelViewer: React.FC<ThreeModelViewerProps> = ({
    item,
    axoFallbackUrl: propAxoUrl,
    initialFullscreen = false,
    onCloseFullscreen,
    className = ''
}) => {
    const specs = useMemo(() => parseItemFor3D(item), [item]);

    const [backlightOn, setBacklightOn] = useState<boolean>(!specs.isPorousStone);
    const [autoRotate, setAutoRotate] = useState<boolean>(true);
    const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
    const [showWireframeBox, setShowWireframeBox] = useState<boolean>(true);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(initialFullscreen);
    const [generatedAxoUrl, setGeneratedAxoUrl] = useState<string | null>(propAxoUrl || null);
    const [staticArtifactExists, setStaticArtifactExists] = useState<boolean>(false);
    const [textureSourceLabel, setTextureSourceLabel] = useState<string>('HexMap + Vein Strata');

    const mountRef = useRef<HTMLDivElement | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const stoneMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const backlightsRef = useRef<THREE.Light[]>([]);
    const glowMeshesRef = useRef<THREE.Mesh[]>([]);
    const bboxGroupRef = useRef<THREE.Group | null>(null);
    const canvasesRef = useRef<{ albedoCanvas: HTMLCanvasElement; bumpCanvas: HTMLCanvasElement } | null>(null);

    const staticArtifactUrl = `/models/3d/${encodeURIComponent(specs.barcode)}.html`;

    // Check if pre-built `/models/3d/<barcode>.html` exists
    useEffect(() => {
        let active = true;
        if (!specs.barcode) return;
        fetch(staticArtifactUrl, { method: 'HEAD' })
            .then(res => {
                const ct = res.headers.get('content-type') || '';
                if (active && res.ok && ct.includes('text/html')) {
                    setStaticArtifactExists(true);
                }
            })
            .catch(() => {});
        return () => { active = false; };
    }, [specs.barcode, staticArtifactUrl]);

    // Sync propAxoUrl or generate 2D Axonometric blueprint on demand when toggled to 2D
    useEffect(() => {
        if (propAxoUrl) {
            setGeneratedAxoUrl(propAxoUrl);
            return;
        }
        if (viewMode !== '2d' || generatedAxoUrl) return;
        let active = true;
        const bboxOptions: AxoBoundingBoxOptions = {
            showBoundingBox: true,
            showDimensionLabels: true,
            showMeasurementTicks: true,
            unit: 'cm'
        };
        generateAxonometricDataUrl(
            specs.widthCm,
            specs.heightCm,
            specs.lengthCm,
            specs.shapeText,
            specs.descText,
            specs.dominantHex,
            false,
            specs.hexMapString,
            bboxOptions
        ).then(url => {
            if (active && url) setGeneratedAxoUrl(url);
        }).catch(() => {});
        return () => { active = false; };
    }, [propAxoUrl, viewMode, generatedAxoUrl, specs]);

    // Main WebGL Three.js Scene Effect
    useEffect(() => {
        if (viewMode !== '3d') return;
        const host = mountRef.current;
        if (!host) return;

        let isDisposed = false;
        let animFrameId = 0;

        const width = Math.max(300, host.clientWidth || 640);
        const height = Math.max(280, host.clientHeight || 420);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.22;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        host.innerHTML = '';
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const envTex = createStudioEnvironment(renderer, specs.dominantHex);
        scene.environment = envTex;

        const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 250);
        camera.position.set(8.2, 5.4, 10.2);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enablePan = true;
        controls.minDistance = 3.2;
        controls.maxDistance = 32;
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 1.35;
        controlsRef.current = controls;

        // 1. Seed synchronous 1024x1024 HexMap + Vein Strata canvases (100% CORS-safe)
        const { albedoCanvas, bumpCanvas } = createSeededStoneCanvases(specs, 1024);
        canvasesRef.current = { albedoCanvas, bumpCanvas };
        setTextureSourceLabel(specs.hexMapString ? '60×60 HexMap + Vein Strata' : 'Mineral Vein Palette');

        const albedoTex = new THREE.CanvasTexture(albedoCanvas);
        albedoTex.colorSpace = THREE.SRGBColorSpace;
        albedoTex.wrapS = THREE.ClampToEdgeWrapping;
        albedoTex.wrapT = THREE.ClampToEdgeWrapping;
        albedoTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        bumpTex.wrapS = THREE.ClampToEdgeWrapping;
        bumpTex.wrapT = THREE.ClampToEdgeWrapping;

        // 2. True-Color Translucent Onyx vs Porous Travertine/Rock Physical Material (zero artificial color tinting)
        const stoneMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            map: albedoTex,
            bumpMap: bumpTex,
            bumpScale: specs.isPorousStone ? 0.28 : 0.06,
            transmission: specs.isPorousStone ? 0.03 : 0.24,
            thickness: specs.isPorousStone ? 0.8 : 2.0,
            ior: 1.54,
            roughness: specs.isPorousStone ? 0.62 : 0.18,
            metalness: 0.0,
            clearcoat: specs.isPorousStone ? 0.12 : 0.72,
            clearcoatRoughness: 0.1,
            attenuationColor: new THREE.Color(0xffffff),
            attenuationDistance: 10.0,
            emissive: new THREE.Color(0xffffff),
            emissiveMap: albedoTex,
            emissiveIntensity: backlightOn && !specs.isPorousStone ? 0.16 : 0.0,
            envMapIntensity: specs.isPorousStone ? 0.55 : 0.95,
            side: THREE.FrontSide
        });
        stoneMatRef.current = stoneMat;

        // 3. Asynchronously composite Clean Cutout PNG (`generated_png_url`) & Vector Vein SVG (`vein_svg_urls.angle_0`)
        if (specs.cutoutPngUrl) {
            const cutoutImg = new Image();
            cutoutImg.crossOrigin = 'anonymous';
            cutoutImg.onload = () => {
                if (isDisposed) return;
                try {
                    const aCtx = albedoCanvas.getContext('2d');
                    if (aCtx) {
                        const iw = cutoutImg.naturalWidth || cutoutImg.width;
                        const ih = cutoutImg.naturalHeight || cutoutImg.height;
                        const tmp = document.createElement('canvas');
                        tmp.width = iw;
                        tmp.height = ih;
                        const tCtx = tmp.getContext('2d', { willReadFrequently: true });
                        let sx = 0, sy = 0, sw = iw, sh = ih;
                        if (tCtx && iw > 0 && ih > 0) {
                            tCtx.drawImage(cutoutImg, 0, 0);
                            const imgData = tCtx.getImageData(0, 0, iw, ih).data;
                            let minX = iw, minY = ih, maxX = 0, maxY = 0;
                            let found = false;
                            for (let y = 0; y < ih; y += 2) {
                                for (let x = 0; x < iw; x += 2) {
                                    const idx = (y * iw + x) * 4;
                                    const a = imgData[idx + 3];
                                    const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
                                    // Non-transparent and not pure white studio background
                                    if (a > 32 && !(r > 248 && g > 248 && b > 248)) {
                                        if (x < minX) minX = x;
                                        if (x > maxX) maxX = x;
                                        if (y < minY) minY = y;
                                        if (y > maxY) maxY = y;
                                        found = true;
                                    }
                                }
                            }
                            if (found && maxX > minX + 16 && maxY > minY + 16) {
                                sx = minX;
                                sy = minY;
                                sw = maxX - minX;
                                sh = maxY - minY;
                            }
                        }

                        // Completely replace the hex-map placeholder so two textures NEVER overlap:
                        // 1) Multi-pass dilated/blurred self-bleed fills any irregular perimeter corners with the stone's own edge color
                        const cw = albedoCanvas.width;
                        const ch = albedoCanvas.height;
                        aCtx.save();
                        aCtx.clearRect(0, 0, cw, ch);
                        aCtx.filter = 'blur(36px)';
                        aCtx.drawImage(cutoutImg, sx, sy, sw, sh, -cw * 0.12, -ch * 0.12, cw * 1.24, ch * 1.24);
                        aCtx.filter = 'blur(16px)';
                        aCtx.drawImage(cutoutImg, sx, sy, sw, sh, -cw * 0.04, -ch * 0.04, cw * 1.08, ch * 1.08);
                        // 2) Crisp 1:1 tightly-cropped stone photo on top
                        aCtx.filter = 'none';
                        aCtx.globalAlpha = 1.0;
                        aCtx.drawImage(cutoutImg, sx, sy, sw, sh, 0, 0, cw, ch);
                        aCtx.restore();

                        albedoTex.needsUpdate = true;
                        stoneMat.needsUpdate = true;
                        setTextureSourceLabel(prev => prev.includes('SVG') ? 'True-Color Cutout PNG + Vein SVG' : 'True-Color Cutout PNG');
                    }
                } catch {
                    // Canvas remained on synchronous HexMap texture if remote host restricted CORS readback
                }
            };
            cutoutImg.src = specs.cutoutPngUrl;
        }

        if (specs.veinSvgUrl) {
            const svgImg = new Image();
            svgImg.crossOrigin = 'anonymous';
            svgImg.onload = () => {
                if (isDisposed) return;
                try {
                    const bCtx = bumpCanvas.getContext('2d');
                    if (bCtx) {
                        // Stroke Vein SVG into the bump map only so it adds 3D relief without double-painting over the photo albedo
                        bCtx.save();
                        bCtx.globalAlpha = 0.65;
                        bCtx.drawImage(svgImg, 0, 0, bumpCanvas.width, bumpCanvas.height);
                        bCtx.restore();
                        bumpTex.needsUpdate = true;
                    }
                    stoneMat.needsUpdate = true;
                    setTextureSourceLabel(prev => prev.includes('PNG') ? 'Cutout PNG + Vein SVG + HexMap' : 'Vein SVG + HexMap');
                } catch {}
            };
            svgImg.src = specs.veinSvgUrl;
        }

        // 4. Build Archetype-Specific 3D Mesh Group
        const { meshGroup, backlights, glowMeshes, normalizedDims } = buildArchetype3DScene(specs, stoneMat);
        scene.add(meshGroup);
        backlightsRef.current = backlights;
        glowMeshesRef.current = glowMeshes;

        backlights.forEach(l => {
            l.visible = backlightOn;
        });
        glowMeshes.forEach(m => {
            m.visible = backlightOn;
        });

        // 5. Architectural CAD Bounding Dimension Frame
        const bboxGroup = new THREE.Group();
        const boxGeo = new THREE.BoxGeometry(
            normalizedDims.w * 1.04,
            normalizedDims.h * 1.04,
            normalizedDims.d * 1.04
        );
        const edgesGeo = new THREE.EdgesGeometry(boxGeo);
        const edgesMat = new THREE.LineBasicMaterial({
            color: new THREE.Color(specs.dominantHex).lerp(new THREE.Color(0x38bdf8), 0.5),
            transparent: true,
            opacity: 0.32
        });
        const wireframeBox = new THREE.LineSegments(edgesGeo, edgesMat);
        bboxGroup.add(wireframeBox);
        bboxGroup.visible = showWireframeBox;
        scene.add(bboxGroup);
        bboxGroupRef.current = bboxGroup;

        // 6. Neutral True-Color Studio Lighting & Subtle Contact Floor Disc
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
        keyLight.position.set(11, 16, 13);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        scene.add(keyLight);

        const rimLight = new THREE.DirectionalLight(0xf1f5f9, 0.9);
        rimLight.position.set(-12, 8, -11);
        scene.add(rimLight);

        const underFill = new THREE.DirectionalLight(0xffffff, 0.55);
        underFill.position.set(0, -10, 6);
        scene.add(underFill);

        const floorShadow = new THREE.Mesh(
            new THREE.CircleGeometry(Math.max(normalizedDims.w, normalizedDims.d) * 0.95, 48),
            new THREE.ShadowMaterial({ opacity: 0.32 })
        );
        floorShadow.rotation.x = -Math.PI / 2;
        floorShadow.position.y = -normalizedDims.h * 0.52 - 0.04;
        floorShadow.receiveShadow = true;
        scene.add(floorShadow);

        // Resize observer for responsive container & fullscreen transitions
        const handleResize = () => {
            if (isDisposed || !mountRef.current) return;
            const w = Math.max(240, mountRef.current.clientWidth);
            const h = Math.max(240, mountRef.current.clientHeight);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        const ro = new ResizeObserver(handleResize);
        ro.observe(host);

        const animate = () => {
            if (isDisposed) return;
            animFrameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            isDisposed = true;
            cancelAnimationFrame(animFrameId);
            ro.disconnect();
            controls.dispose();
            albedoTex.dispose();
            bumpTex.dispose();
            envTex.dispose();
            stoneMat.dispose();
            renderer.dispose();
        };
    }, [specs, viewMode, isFullscreen]);

    // Live toggle updates without rebuilding WebGL context
    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.autoRotate = autoRotate;
        }
    }, [autoRotate]);

    useEffect(() => {
        backlightsRef.current.forEach(l => {
            l.visible = backlightOn;
        });
        glowMeshesRef.current.forEach(m => {
            m.visible = backlightOn;
        });
        if (stoneMatRef.current) {
            stoneMatRef.current.emissiveIntensity = backlightOn && !specs.isPorousStone ? 0.16 : 0.0;
            stoneMatRef.current.needsUpdate = true;
        }
    }, [backlightOn, specs.isPorousStone]);

    useEffect(() => {
        if (bboxGroupRef.current) {
            bboxGroupRef.current.visible = showWireframeBox;
        }
    }, [showWireframeBox]);

    const handleDownloadHtml = useCallback(() => {
        const canvases = canvasesRef.current || createSeededStoneCanvases(specs, 512);
        let albedoDataUrl = '';
        let bumpDataUrl = '';
        try {
            albedoDataUrl = canvases.albedoCanvas.toDataURL('image/jpeg', 0.88);
            bumpDataUrl = canvases.bumpCanvas.toDataURL('image/jpeg', 0.82);
        } catch {
            const fallback = createSeededStoneCanvases(specs, 512);
            albedoDataUrl = fallback.albedoCanvas.toDataURL('image/jpeg', 0.88);
            bumpDataUrl = fallback.bumpCanvas.toDataURL('image/jpeg', 0.82);
        }
        exportStandalone3DHtml(specs, albedoDataUrl, bumpDataUrl);
    }, [specs]);

    const toggleFullscreen = useCallback(() => {
        setIsFullscreen(prev => {
            const next = !prev;
            if (!next && onCloseFullscreen) {
                onCloseFullscreen();
            }
            return next;
        });
    }, [onCloseFullscreen]);

    const displayWidthCm =
        specs.archetype === 'panel-pair' && specs.widthCm < specs.heightCm * 0.68
            ? Math.round(specs.widthCm * (2 + PANEL_PAIR_GAP_RATIO))
            : specs.widthCm;
    const displayDepthCm =
        (specs.archetype === 'wall-panel' || specs.archetype === 'panel-pair' || specs.archetype === 'painted-wall-panel')
            ? Math.min(specs.lengthCm, 8)
            : specs.lengthCm;
    const metricDimsStr = `${displayWidthCm} × ${specs.heightCm} × ${displayDepthCm} cm`;
    const imperialDimsStr = [displayWidthCm, specs.heightCm, displayDepthCm]
        .map(cm => cmToImperial(cm))
        .filter(Boolean)
        .join(' × ');
    const imperialWeight = specs.weightKg > 0 ? formatWeightImperialOnly(specs.weightKg) : '';

    const renderViewerStage = (fullscreenMode: boolean) => (
        <div
            className={`relative flex flex-col overflow-hidden select-none ${
                fullscreenMode
                    ? 'fixed inset-0 z-[100005] bg-slate-950/95 backdrop-blur-2xl p-3 sm:p-6 animate-in fade-in duration-200'
                    : `liquid-panel flex-1 min-h-[380px] sm:min-h-[440px] ${className}`
            }`}
            onClick={e => e.stopPropagation()}
        >
            {/* Ambient Stone Glow Backdrop */}
            <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-500"
                style={{
                    opacity: backlightOn ? 0.32 : 0.12,
                    background: `radial-gradient(circle at 50% 52%, ${specs.dominantHex}55 0%, ${specs.secondaryHex}18 45%, transparent 75%)`
                }}
            />

            {/* Top Overlay Header: Archetype Badge + Texture Pipeline Status + Toolbar */}
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 p-3 sm:px-4 border-b border-white/10 bg-slate-950/50 backdrop-blur-md">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold tracking-wider bg-sky-500/20 text-sky-300 border border-sky-400/30">
                        {specs.barcode}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-400/30">
                        {specs.archetype}
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono text-slate-300 bg-white/5 border border-white/10">
                        <Sparkles size={11} className="text-amber-400" />
                        <span>{textureSourceLabel}</span>
                    </span>
                    {fullscreenMode && (
                        <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[260px] md:max-w-[420px]">
                            {specs.title}
                        </span>
                    )}
                </div>

                {/* Interactive Controls Toolbar */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Backlight Glow Toggle */}
                    <button
                        type="button"
                        onClick={() => setBacklightOn(v => !v)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                            backlightOn
                                ? 'bg-amber-500/25 text-amber-200 border-amber-400/40 shadow-sm shadow-amber-500/20'
                                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                        }`}
                        title={tr('Toggle Internal Warm Onyx Backlight')}
                    >
                        <Sun size={13} className={backlightOn ? 'text-amber-300' : ''} />
                        <span>{tr('Backlight')}</span>
                    </button>

                    {/* Auto-Rotate Toggle */}
                    {viewMode === '3d' && (
                        <button
                            type="button"
                            onClick={() => setAutoRotate(v => !v)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                autoRotate
                                    ? 'bg-sky-500/20 text-sky-300 border-sky-400/35'
                                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                            }`}
                            title={tr('Toggle 3D Auto-Rotate')}
                        >
                            <RotateCw size={13} className={autoRotate ? 'animate-spin' : ''} style={{ animationDuration: '6s' }} />
                            <span className="hidden sm:inline">{tr('Auto-Rotate')}</span>
                        </button>
                    )}

                    {/* CAD Bounding Box Toggle */}
                    {viewMode === '3d' && (
                        <button
                            type="button"
                            onClick={() => setShowWireframeBox(v => !v)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                showWireframeBox
                                    ? 'bg-white/15 text-white border-white/25'
                                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                            }`}
                            title={tr('Toggle 3D Bounding Frame')}
                        >
                            <Compass size={13} />
                            <span className="hidden md:inline">{tr('Frame')}</span>
                        </button>
                    )}

                    {/* 2D Axo / 3D Model Toggle */}
                    <button
                        type="button"
                        onClick={() => setViewMode(m => (m === '3d' ? '2d' : '3d'))}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                            viewMode === '2d'
                                ? 'bg-purple-500/25 text-purple-200 border-purple-400/40'
                                : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
                        }`}
                        title={tr('Switch between Realistic 3D Onyx Model and 2D Axonometric Blueprint')}
                    >
                        {viewMode === '3d' ? <Eye size={13} /> : <Box size={13} />}
                        <span>{viewMode === '3d' ? tr('2D Axo') : tr('3D Model')}</span>
                    </button>

                    {/* Save 3D HTML Artifact */}
                    <button
                        type="button"
                        onClick={handleDownloadHtml}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 hover:bg-emerald-500/30 transition-all"
                        title={tr('Download Standalone Self-Contained 3D HTML Artifact')}
                    >
                        <Download size={13} />
                        <span>{tr('Save 3D HTML')}</span>
                    </button>

                    {staticArtifactExists && (
                        <a
                            href={staticArtifactUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-sky-300 border border-white/15 hover:bg-white/20 transition-all"
                            title={tr('Open pre-built 3D HTML artifact')}
                        >
                            <ExternalLink size={13} />
                            <span className="hidden lg:inline">{tr('Static 3D')}</span>
                        </a>
                    )}

                    {/* Fullscreen Expand / Collapse */}
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white border border-white/15 hover:bg-white/20 transition-all"
                        title={fullscreenMode ? tr('Exit Fullscreen') : tr('Fullscreen 3D View')}
                    >
                        {fullscreenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        <span className="hidden sm:inline">{fullscreenMode ? tr('Exit') : tr('Fullscreen')}</span>
                    </button>

                    {fullscreenMode && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsFullscreen(false);
                                if (onCloseFullscreen) onCloseFullscreen();
                            }}
                            className="p-1.5 rounded-lg bg-white/10 text-slate-300 hover:text-white hover:bg-rose-500/30 transition-all"
                            aria-label={tr('Close')}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Viewport Stage */}
            <div className="relative flex-1 flex items-center justify-center min-h-[320px] w-full overflow-hidden">
                {viewMode === '3d' ? (
                    <div
                        ref={mountRef}
                        className="w-full h-full min-h-[320px] cursor-grab active:cursor-grabbing"
                    />
                ) : (
                    <div className="flex items-center justify-center p-6 w-full h-full">
                        {generatedAxoUrl ? (
                            <img
                                src={generatedAxoUrl}
                                alt={`${specs.title} - 2D Axonometric Blueprint`}
                                className="max-h-full max-w-full object-contain filter drop-shadow-2xl"
                            />
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-400">
                                <div className="w-7 h-7 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                                <span className="text-xs font-mono">{tr('Rendering 2D Axonometric Blueprint…')}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Bottom-Left Physical Spec Readout Pill */}
                <div className="absolute bottom-3 left-3 z-20 pointer-events-none flex flex-wrap items-center gap-2">
                    <div className="px-3 py-1.5 rounded-xl bg-slate-950/75 backdrop-blur-md border border-white/10 text-xs flex items-center gap-2.5 shadow-lg">
                        <span
                            className="w-3 h-3 rounded-full border border-white/30 shrink-0"
                            style={{ backgroundColor: specs.dominantHex }}
                        />
                        <span className="font-semibold text-white">{specs.stoneText}</span>
                        <span className="text-slate-500">·</span>
                        <span className="font-mono text-sky-300">{metricDimsStr}</span>
                        {imperialDimsStr && (
                            <>
                                <span className="text-slate-500 hidden sm:inline">·</span>
                                <span className="font-mono text-slate-300 hidden sm:inline">{imperialDimsStr}</span>
                            </>
                        )}
                        {specs.weightKg > 0 && (
                            <>
                                <span className="text-slate-500">·</span>
                                <span className="font-mono text-amber-300">
                                    {specs.weightKg} kg{imperialWeight ? ` (${imperialWeight})` : ''}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Bottom-Right Interaction Hint */}
                {viewMode === '3d' && (
                    <div className="absolute bottom-3 right-3 z-20 pointer-events-none hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/65 backdrop-blur-md border border-white/10 text-[11px] text-slate-400">
                        <span>{tr('Drag to orbit · Scroll/pinch to zoom')}</span>
                    </div>
                )}
            </div>
        </div>
    );

    if (isFullscreen) {
        return createPortal(renderViewerStage(true), document.body);
    }

    return renderViewerStage(false);
};

/**
 * Standalone Fullscreen 3D Modal Portal for instant one-click inspection from any axo icon in the app.
 */
export const ThreeModelFullscreenModal: React.FC<ThreeModelFullscreenModalProps> = ({
    isOpen,
    onClose,
    item
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !item) return null;

    return (
        <ThreeModelViewer
            item={item}
            initialFullscreen={true}
            onCloseFullscreen={onClose}
        />
    );
};
