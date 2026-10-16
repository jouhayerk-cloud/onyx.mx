// src/lib/logistics/boxesCliBridge.ts
// Boxes.py Laser Cutfile, LightBurn Project Export Utilities & Windows CLI Bridge

/**
 * Windows Boxes.py Installation Runtime Configuration (C:\boxes)
 * Python 3.13 Virtual Environment & Web Server definitions
 */
export const BOXES_RUNTIME = {
    installDir: 'C:\\boxes',
    venvDir: 'C:\\boxes\\.venv',
    cliPath: 'C:\\boxes\\.venv\\Scripts\\boxes.exe',
    serverPath: 'C:\\boxes\\.venv\\Scripts\\boxesserver.exe',
    serverPort: 8080,
    serverUrl: 'http://localhost:8080',
    serverCommand: '$env:PYTHONUTF8=1; C:\\boxes\\.venv\\Scripts\\boxesserver.exe --port 8080',
    pythonVersion: 'Python 3.13',
    utf8Prefix: '$env:PYTHONUTF8=1;',
    statusPillText: '🟢 Boxes.py Engine Installed (C:\\boxes · Python 3.13 · UTF-8 Mode)'
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

/**
 * Embeds SVG cut paths into LightBurn project container (.lbrn2).
 */
export function generateLightBurnProjectXml(
    svgContent: string,
    params?: { cutSpeed?: number; cutPower?: number; materialThickness?: number }
): string {
    const speed = params?.cutSpeed || 20; // mm/s
    const power = params?.cutPower || 85; // %
    const thickness = params?.materialThickness || 6; // mm

    return `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject FormatVersion="1">
    <Thumbnail Resolution="256" />
    <VariableText Format="" />
    <UIPrefs />
    <CutSetting type="Cut">
        <index Value="0" />
        <name Value="Outer Cut" />
        <color Value="#ef4444" />
        <speed Value="${speed}" />
        <maxPower Value="${power}" />
        <minPower Value="${power}" />
        <airAssist Value="1" />
        <thickness Value="${thickness}" />
    </CutSetting>
    <CutSetting type="Scan">
        <index Value="1" />
        <name Value="Engrave Labels" />
        <color Value="#38bdf8" />
        <speed Value="250" />
        <maxPower Value="18" />
        <minPower Value="18" />
        <airAssist Value="0" />
    </CutSetting>
    <Shape Type="Group">
        <!-- SVG Vector Layer Container from Boxes.py -->
        <RawSvgData><![CDATA[${svgContent}]]></RawSvgData>
    </Shape>
</LightBurnProject>`;
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

/**
 * Formats a Windows PowerShell CLI recipe for C:\boxes\.venv\Scripts\boxes.exe.
 * Always prefixes with $env:PYTHONUTF8=1 to prevent Windows cp1252 charmap encoding errors.
 */
export function getBoxesCliRecipe(
    generator: string,
    args: Record<string, string | number | boolean | undefined>,
    outputFile?: string,
    format?: 'svg' | 'lbrn2' | 'ps'
): string {
    const formattedArgs: string[] = [];

    // Prioritize standard keys in clean order
    const orderedKeys = ['x', 'y', 'h', 'thickness', 'burn', 'outside', 'sx', 'sy', 'Lid_style', 'lid', 'top_edge'];
    const addedKeys = new Set<string>();

    for (const key of orderedKeys) {
        if (args[key] !== undefined && args[key] !== null) {
            const val = args[key];
            if (typeof val === 'boolean') {
                if (val) formattedArgs.push(`--${key} 1`);
            } else if (typeof val === 'string' && (val.includes(' ') || val.includes(':'))) {
                formattedArgs.push(`--${key} "${val}"`);
            } else {
                formattedArgs.push(`--${key} ${val}`);
            }
            addedKeys.add(key);
        }
    }

    // Append any extra args
    for (const [key, val] of Object.entries(args)) {
        if (!addedKeys.has(key) && val !== undefined && val !== null) {
            if (typeof val === 'boolean') {
                if (val) formattedArgs.push(`--${key} 1`);
            } else if (typeof val === 'string' && (val.includes(' ') || val.includes(':'))) {
                formattedArgs.push(`--${key} "${val}"`);
            } else {
                formattedArgs.push(`--${key} ${val}`);
            }
        }
    }

    if (format && format !== 'svg') {
        formattedArgs.push(`--format ${format}`);
    }

    if (outputFile) {
        formattedArgs.push(`--output "${outputFile}"`);
    }

    const argString = formattedArgs.length > 0 ? ` ${formattedArgs.join(' ')}` : '';
    return `$env:PYTHONUTF8=1; C:\\boxes\\.venv\\Scripts\\boxes.exe ${generator}${argString}`;
}

/**
 * Returns the PowerShell command to start the local Boxes.py Web Server.
 */
export function getBoxesWebServerCommand(): string {
    return BOXES_RUNTIME.serverCommand;
}
