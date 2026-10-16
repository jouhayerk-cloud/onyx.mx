// src/lib/logistics/boxesCliBridge.ts
// Boxes.py laser cutfile downloads, LightBurn project export and Windows CLI recipe helpers.
//
// The web app never runs Boxes.py and cannot tell whether it is installed anywhere: the recipes below are text
// for the operator to run on the laser PC, and the SVG / LightBurn files come from the Onyx procedural drawing
// (boxesBridge.generateProceduralCrateSvg), which is an approximate preview, not Boxes.py output.

import {
    BOXES_EXE_PATH,
    buildBoxesCliArgs,
    escapeXml,
    isBoxesGeneratorName,
} from './boxesBridge';

/**
 * Where the operator's laser PC is expected to have Boxes.py (Windows venv install).
 * These are assumptions used to write recipes; nothing here is probed or verified from the browser.
 */
export const BOXES_RUNTIME = {
    installDir: 'C:\\boxes',
    venvDir: 'C:\\boxes\\.venv',
    cliPath: BOXES_EXE_PATH,
    serverPath: 'C:\\boxes\\.venv\\Scripts\\boxesserver.exe',
    serverPort: 8080,
    serverUrl: 'http://localhost:8080',
    serverCommand: '$env:PYTHONUTF8=1; C:\\boxes\\.venv\\Scripts\\boxesserver.exe --port 8080',
    pythonVersion: 'Python 3.13',
    utf8Prefix: '$env:PYTHONUTF8=1;',
    // Neutral on purpose: the web app cannot know whether Boxes.py is installed on this device.
    statusPillText: 'Boxes.py recipes (run on the laser PC)'
} as const;

/**
 * Supported Core Generators from Boxes.py Catalog
 */
export type BoxesGeneratorType = 'UniversalBox' | 'TypeTray' | 'ABox' | 'ClosedBox' | 'FlexBox';

export interface BoxesGeneratorMeta {
    id: BoxesGeneratorType;
    name: string;
    description: string;
    badge: string;
    recommendedFor: string;
    defaultArgs?: Record<string, string | number>;
}

export const BOXES_GENERATORS: Record<BoxesGeneratorType, BoxesGeneratorMeta> = {
    TypeTray: {
        id: 'TypeTray',
        name: 'TypeTray (Subdivided Grid)',
        description: 'Compartment tray with continuous slot dividers configured via --sx and --sy compartment intervals.',
        badge: 'ORGANIZER GRID',
        recommendedFor: 'Jewelry, onyx desk lamps, mineral specimens, & delicate small parts'
    },
    UniversalBox: {
        id: 'UniversalBox',
        name: 'UniversalBox (Finger-Joint)',
        description: 'Advanced parametric box with outer dimensions, sliding or hinged lids, & modular internal dividers.',
        badge: 'MODULAR CRATE',
        recommendedFor: 'Medium storage crates, toolboxes, and segmented inventory containers'
    },
    ABox: {
        id: 'ABox',
        name: 'ABox (Shipping Crate)',
        description: 'Heavy-duty finger-joint box with optional lid styles (flat, chest, overthetop, ontop).',
        badge: 'SHIPPING CRATE',
        recommendedFor: 'Rugged transport crates, stone shipments, and heavy warehouse storage'
    },
    ClosedBox: {
        id: 'ClosedBox',
        name: 'ClosedBox (Sealed)',
        description: 'Fully enclosed 6-sided finger-joint box designed for maximum structural rigidity.',
        badge: 'SEALED ENCLOSURE',
        recommendedFor: 'Hermetic freight cases, sealed export packages, and tamper-resistant parcels'
    },
    FlexBox: {
        id: 'FlexBox',
        name: 'FlexBox (Living Hinge)',
        description: 'Living-hinge enclosure with bendable curved wooden lattice cut into the sheet.',
        badge: 'LIVING HINGE',
        recommendedFor: 'Luxury packaging, curved display boxes, and presentation cases'
    }
};

/**
 * Official Kerf Burn Presets from boxes-py/SKILL.md
 */
export interface BoxesMaterialPreset {
    id: string;
    name: string;
    thicknessMm: number;
    burnMm: number;
    category: 'wood' | 'acrylic' | 'plywood';
    kerfRange: string;
    color: string;
    description: string;
}

export const BOXES_MATERIAL_PRESETS: BoxesMaterialPreset[] = [
    {
        id: 'baltic-birch-3',
        name: '3.0mm Baltic Birch',
        thicknessMm: 3.0,
        burnMm: 0.09,
        category: 'wood',
        kerfRange: '0.08mm - 0.12mm',
        color: '#f59e0b',
        description: 'Laser kerf 0.08–0.12mm compensation for 3mm Baltic Birch / MDF'
    },
    {
        id: 'birch-ply-5',
        name: '5.0mm Birch Plywood',
        thicknessMm: 5.0,
        burnMm: 0.13,
        category: 'plywood',
        kerfRange: '0.12mm - 0.16mm',
        color: '#d97706',
        description: 'Laser kerf 0.12–0.16mm compensation for 5mm Plywood / MDF'
    },
    {
        id: 'structural-ply-6',
        name: '6.0mm Structural Ply',
        thicknessMm: 6.0,
        burnMm: 0.15,
        category: 'plywood',
        kerfRange: '0.12mm - 0.16mm',
        color: '#b45309',
        description: 'Structural crating plywood with 0.15mm beam kerf compensation'
    },
    {
        id: 'cast-acrylic-3',
        name: '3.0mm Cast Acrylic',
        thicknessMm: 3.0,
        burnMm: 0.07,
        category: 'acrylic',
        kerfRange: '0.05mm - 0.09mm',
        color: '#06b6d4',
        description: 'Laser kerf 0.05–0.09mm compensation for 3mm transparent Cast Acrylic'
    },
    {
        id: 'marine-ply-12',
        name: '12.0mm Marine Ply',
        thicknessMm: 12.0,
        burnMm: 0.18,
        category: 'plywood',
        kerfRange: '0.16mm - 0.20mm',
        color: '#10b981',
        description: 'Heavy 12mm Marine Plywood for overseas shipping crates'
    }
];

/** Strips everything but letters, digits, '_' and '-' so a name can be used in a file name or a recipe. */
export function sanitizeFileBase(name: unknown, fallback = 'crate'): string {
    const cleaned = String(name ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return cleaned.slice(0, 64) || fallback;
}

/**
 * Downloads generated SVG vector cutfile to user machine.
 */
export function downloadLaserCutfileSvg(filename: string, svgContent: string): void {
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ─── LightBurn project (.lbrn2) ──────────────────────────────────────────────

interface LightBurnPolygon {
    points: Array<[number, number]>;
    cutIndex: number;
}

function readAttr(tag: string, name: string): string | null {
    const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
    return m ? m[1] : null;
}

/**
 * Reads the cut geometry back out of an SVG made by generateProceduralCrateSvg / combineCrateSvgs:
 * the `laser-cut` paths (panel outlines, only M / L / Z commands) become layer 0 and the `slot-cut`
 * rectangles (divider slots) become layer 1. Group translations written by combineCrateSvgs are applied.
 * Anything else in the SVG (cards, labels, bed outline, scripts, images) is ignored by construction.
 */
function extractLightBurnPolygons(svg: string): LightBurnPolygon[] {
    const polygons: LightBurnPolygon[] = [];
    let ox = 0;
    let oy = 0;
    const tagRe = /<(g|path|rect)\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(svg)) !== null) {
        const tag = m[0];
        const kind = m[1];
        if (kind === 'g') {
            const tf = /^translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)$/.exec(readAttr(tag, 'transform') ?? '');
            if (tf) {
                ox = Number(tf[1]);
                oy = Number(tf[2]);
            }
        } else if (kind === 'path') {
            const cls = readAttr(tag, 'class') ?? '';
            const d = readAttr(tag, 'd');
            if (!d || !/(^|\s)laser-cut(\s|$)/.test(cls)) continue;
            const cmdRe = /([MLZ])([^MLZ]*)/g;
            let c: RegExpExecArray | null;
            let current: Array<[number, number]> = [];
            const flush = () => {
                if (current.length > 1) {
                    const first = current[0];
                    const last = current[current.length - 1];
                    if (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) current.pop();
                    if (current.length >= 3) polygons.push({ points: current, cutIndex: 0 });
                }
                current = [];
            };
            while ((c = cmdRe.exec(d)) !== null) {
                if (c[1] === 'Z') {
                    flush();
                    continue;
                }
                const nums = (c[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
                if (nums.length < 2 || !Number.isFinite(nums[0]) || !Number.isFinite(nums[1])) continue;
                if (c[1] === 'M') flush();
                const pt: [number, number] = [nums[0] + ox, nums[1] + oy];
                const prev = current[current.length - 1];
                if (!prev || Math.abs(prev[0] - pt[0]) > 1e-6 || Math.abs(prev[1] - pt[1]) > 1e-6) current.push(pt);
            }
            flush();
        } else if (kind === 'rect') {
            const cls = readAttr(tag, 'class') ?? '';
            if (!/(^|\s)slot-cut(\s|$)/.test(cls)) continue;
            const x = Number(readAttr(tag, 'x'));
            const y = Number(readAttr(tag, 'y'));
            const w = Number(readAttr(tag, 'width'));
            const h = Number(readAttr(tag, 'height'));
            if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
            polygons.push({
                points: [[x + ox, y + oy], [x + w + ox, y + oy], [x + w + ox, y + h + oy], [x + ox, y + h + oy]],
                cutIndex: 1,
            });
        }
    }
    return polygons;
}

/**
 * Builds a LightBurn project (.lbrn2) from the cut geometry of a procedural crate SVG.
 *
 * Structure follows the LightBurn writer in Boxes.py (boxes/drawing.py, LBRN2Surface): a LightBurnProject root,
 * CutSetting layers, then a Group whose Children are `Shape Type="Path"` elements with a VertList and a closed
 * PrimList. Coordinates are millimetres, y down. Layer 0 = panel outlines (Outer Cut), layer 1 = divider slots
 * (Inner Cut). Text and the bed outline are not exported. It has not been opened in LightBurn from this app:
 * for a guaranteed native file run the Boxes.py recipe with `--format lbrn2` on the laser PC.
 * Throws when the SVG holds no cuttable geometry.
 */
export function generateLightBurnProjectXml(
    svgContent: string,
    params?: { cutSpeed?: number; cutPower?: number; materialThickness?: number }
): string {
    const speed = Number.isFinite(params?.cutSpeed) && (params?.cutSpeed ?? 0) > 0 ? Number(params?.cutSpeed) : 20; // mm/s
    const power = Number.isFinite(params?.cutPower) && (params?.cutPower ?? 0) > 0 ? Math.min(100, Number(params?.cutPower)) : 85; // %
    const thickness = Number.isFinite(params?.materialThickness) && (params?.materialThickness ?? 0) > 0 ? Number(params?.materialThickness) : 6; // mm

    const polygons = extractLightBurnPolygons(svgContent);
    if (polygons.length === 0) {
        throw new Error('No cuttable geometry found in the SVG, LightBurn project not generated.');
    }

    const fmt = (n: number) => n.toFixed(3);
    const shapes = polygons.map(poly => {
        const verts = poly.points.map(([x, y]) => `V${fmt(x)} ${fmt(y)}c0x1c1x1`).join('');
        return `      <Shape Type="Path" CutIndex="${poly.cutIndex}">
        <XForm>1 0 0 1 0 0</XForm>
        <VertList>${verts}</VertList>
        <PrimList>LineClosed</PrimList>
      </Shape>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="1.0.06" FormatVersion="1" MaterialHeight="${thickness}" MirrorX="False" MirrorY="False">
  <CutSetting Type="Cut">
    <index Value="0" />
    <name Value="Outer Cut" />
    <priority Value="1" />
    <speed Value="${speed}" />
    <maxPower Value="${power}" />
    <minPower Value="${power}" />
  </CutSetting>
  <CutSetting Type="Cut">
    <index Value="1" />
    <name Value="Inner Cut" />
    <priority Value="0" />
    <speed Value="${speed}" />
    <maxPower Value="${power}" />
    <minPower Value="${power}" />
  </CutSetting>
  <Shape Type="Group">
    <XForm>1 0 0 1 0 0</XForm>
    <Children>
${shapes}
    </Children>
  </Shape>
  <Notes ShowOnLoad="0" Notes="${escapeXml('Generated by Onyx from an approximate procedural drawing (not Boxes.py output). Check fit and kerf before cutting.')}" />
</LightBurnProject>
`;
}

/**
 * Downloads LightBurn Project (.lbrn2) to user machine.
 */
export function downloadLightBurnProject(filename: string, lbrnContent: string): void {
    const blob = new Blob([lbrnContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.lbrn2') ? filename : `${filename}.lbrn2`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ─── CLI recipe ──────────────────────────────────────────────────────────────

/**
 * Formats a Windows PowerShell CLI recipe for boxes.exe (default install path, see BOXES_RUNTIME).
 * Always prefixes with $env:PYTHONUTF8=1 to prevent Windows cp1252 charmap encoding errors.
 *
 * Only the arguments the chosen generator really accepts are written (buildBoxesCliArgs): TypeTray takes
 * --sx/--sy/--h (not --x/--y), BinTray --sx/--y/--sh, FlexBox --sx/--y/--h, the box generators --x/--y/--h.
 * Values are validated and single-quoted, so a crate name can never inject shell syntax. Pass `args.sx`/`sy`
 * for compartment layouts; without them a tray gets one section per side.
 */
export function getBoxesCliRecipe(
    generator: string,
    args: Record<string, string | number | boolean | undefined>,
    outputFile?: string,
    format?: 'svg' | 'lbrn2' | 'ps'
): string {
    const name = isBoxesGeneratorName(generator) ? generator : 'UniversalBox';
    const values: Record<string, unknown> = { ...args };
    if (format && format !== 'svg') values.format = format;
    if (outputFile) values.output = outputFile;
    return ['$env:PYTHONUTF8=1;', BOXES_EXE_PATH, name, ...buildBoxesCliArgs(name, values)].join(' ');
}

/**
 * Returns the PowerShell command to start the local Boxes.py Web Server.
 */
export function getBoxesWebServerCommand(): string {
    return BOXES_RUNTIME.serverCommand;
}
