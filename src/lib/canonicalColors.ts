/**
 * Boosts saturation, brightness, and vibrancy of stone colors.
 * Makes whites clean, brilliant, and pure; makes stone pigments pop with rich saturation.
 */
export function enhanceStoneColor(hex: string): string {
    if (!hex) return hex;
    const clean = hex.trim().replace(/^#/, '');
    if (clean.length < 6) return hex;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    let l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // 1. Whites and near-whites: brighten to clean, crisp white
    if (s < 0.16 && l > 0.65) {
        l = Math.min(0.99, l * 1.12 + 0.04);
        s = Math.max(0, s * 0.6);
    } else {
        // 2. Colored pigments: boost saturation and vibrancy
        s = Math.min(1.0, s * 1.45 + 0.08);
        l = Math.min(0.95, l * 1.12 + 0.03);
    }

    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    let rNew: number, gNew: number, bNew: number;
    if (s === 0) {
        rNew = gNew = bNew = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        rNew = hue2rgb(p, q, h + 1 / 3);
        gNew = hue2rgb(p, q, h);
        bNew = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (n: number) => {
        const clamped = Math.max(0, Math.min(255, Math.round(n * 255)));
        return clamped.toString(16).padStart(2, '0').toUpperCase();
    };

    return `#${toHex(rNew)}${toHex(gNew)}${toHex(bNew)}`;
}

export function enhanceStonePalette(palette: StonePalette): StonePalette {
    return {
        primary: enhanceStoneColor(palette.primary),
        secondary: enhanceStoneColor(palette.secondary),
        gradientColors: palette.gradientColors.map(enhanceStoneColor),
    };
}

/**
 * Canonical Stone Palettes for Onyx & Marble Items.
 * 
 * Defines multi-color stroke palettes and color resolvers for axonometric
 * CAD wireframes and hairline silhouette figures.
 */

export interface StonePalette {
    primary: string;
    secondary: string;
    gradientColors: string[];
}

// Palettes below marked "photo-extracted" come from real item photos: hue-weighted
// k-means on the actual pixels (same technique as the vein-mask colour extraction),
// per-photo background excluded, sorted by saturation so the stone's characteristic
// hue leads the array. See swarm/artifacts/colorMap/stone_color_map.json and
// extract_stone_colors.py for the method and the full shade lists (more than 6 per
// colour in most cases -- gradientColors below keeps only the first 6).
export const CANONICAL_STONE_PALETTES: Record<string, StonePalette> = {
    aquaSerpentine: { // photo-extracted, 18 real shades sampled
        primary: '#432a16',
        secondary: '#332a17',
        gradientColors: ['#432a16', '#332a17', '#664f33', '#907a53', '#564534', '#a28a67'],
    },
    aqua: { // photo-extracted, 28 real shades sampled
        primary: '#825f2f',
        secondary: '#5b4424',
        gradientColors: ['#825f2f', '#5b4424', '#0c0e19', '#d0b675', '#a1885e', '#67503d'],
    },
    zebra: {
        primary: '#0F172A',
        secondary: '#FFFFFF',
        gradientColors: ['#0F172A', '#334155', '#CBD5E1', '#FFFFFF', '#64748B', '#0F172A'],
    },
    talan: { // photo-extracted (Green Talan), 40 real shades sampled
        primary: '#b55b29',
        secondary: '#564f1d',
        gradientColors: ['#b55b29', '#564f1d', '#211b0d', '#958b48', '#7a763c', '#533f29'],
    },
    cherryBlossom: { // photo-extracted, lit (backlit) state -- real blues AND rust/pink,
                      // see Cherry Blossom.lit in stone_color_map.json for all 52 shades.
                      // "Cherry Blue" and "Cherry Pink" are the same stone, not separate.
        primary: '#7d3807',
        secondary: '#a35c10',
        gradientColors: ['#7d3807', '#a35c10', '#d2a135', '#6f361e', '#1d274e', '#191f3d'],
    },
    ice: {
        primary: '#BAE6FD',
        secondary: '#CBD5E1',
        gradientColors: ['#BAE6FD', '#E0F2FE', '#FFFFFF', '#94A3B8', '#FFFFFF'],
    },
    cloud: {
        primary: '#FFFFFF',
        secondary: '#CBD5E1',
        gradientColors: ['#FFFFFF', '#F8FAFC', '#E2E8F0', '#CBD5E1', '#FFFFFF'],
    },
    emperor: {
        primary: '#78350F',
        secondary: '#A8A29E',
        gradientColors: ['#78350F', '#92400E', '#D6D3D1', '#A8A29E', '#78350F'],
    },
    tehuacanGray: { // photo-extracted, 20 real shades sampled
        primary: '#261b17',
        secondary: '#867a6a',
        gradientColors: ['#261b17', '#867a6a', '#362e2b', '#b4a995', '#a39987', '#756d64'],
    },
    amber: { // photo-extracted, 32 real shades sampled
        primary: '#3c1b08',
        secondary: '#b6811e',
        gradientColors: ['#3c1b08', '#b6811e', '#955b22', '#7e471e', '#845b23', '#9c6e34'],
    },
    tehuacan: { // photo-extracted, 13 real shades sampled
        primary: '#856d52',
        secondary: '#9e8b6f',
        gradientColors: ['#856d52', '#9e8b6f', '#534a3c', '#716654', '#b19f84', '#8b7d69'],
    },
    nacar: {
        primary: '#FFFFFF',
        secondary: '#FEF3C7',
        gradientColors: ['#FFFFFF', '#FEF3C7', '#E0F2FE', '#FCE7F3', '#FFFFFF'],
    },
    pink: { // photo-extracted (Pink Serpentine; plain "Pink" source photos were unreadable HEIC)
        primary: '#0a0910',
        secondary: '#1a1b24',
        gradientColors: ['#0a0910', '#1a1b24', '#454958', '#af9892', '#6d6e7f', '#8e868b'],
    },
    serpentine: { // photo-extracted (Green Talan), same real stone as talan above
        primary: '#b55b29',
        secondary: '#564f1d',
        gradientColors: ['#b55b29', '#564f1d', '#211b0d', '#958b48', '#7a763c', '#533f29'],
    },
    galaxy: { // photo-extracted, unlit/ambient state (lit backlit state is brighter gold --
              // see Galaxy.lit in stone_color_map.json if a backlit variant is ever wired up)
        primary: '#a57e52',
        secondary: '#3b3124',
        gradientColors: ['#a57e52', '#3b3124', '#5d4d39', '#796653', '#4e4436', '#a08b70'],
    },
    red: { // photo-extracted (Red Pyramid), 16 real shades sampled
        primary: '#ce921a',
        secondary: '#2e1e0e',
        gradientColors: ['#ce921a', '#2e1e0e', '#1c120a', '#0b0804', '#77562c', '#d6c070'],
    },
    multicolor: { // photo-extracted (Rainbow), unlit/ambient state
        primary: '#ab8c32',
        secondary: '#9d7b3a',
        gradientColors: ['#ab8c32', '#9d7b3a', '#6b5328', '#150d08', '#d0b750', '#4d331e'],
    },
    gold: {
        primary: '#FDE047',
        secondary: '#D97706',
        gradientColors: ['#FDE047', '#F59E0B', '#D97706', '#FEF08A'],
    },
    silver: {
        primary: '#E2E8F0',
        secondary: '#94A3B8',
        gradientColors: ['#E2E8F0', '#CBD5E1', '#94A3B8', '#FFFFFF'],
    },
    blue: { // photo-extracted (Blue Argentina), 23 real shades sampled
        primary: '#113b44',
        secondary: '#2f1e0d',
        gradientColors: ['#113b44', '#2f1e0d', '#462d1a', '#5f492e', '#20373a', '#69553e'],
    },
    purple: {
        primary: '#8B5CF6',
        secondary: '#6D28D9',
        gradientColors: ['#8B5CF6', '#A78BFA', '#6D28D9', '#C4B5FD'],
    },
    brown: {
        primary: '#D97706',
        secondary: '#78350F',
        gradientColors: ['#D97706', '#B45309', '#78350F', '#F59E0B'],
    },
    black: {
        primary: '#334155',
        secondary: '#1E293B',
        gradientColors: ['#334155', '#475569', '#1E293B', '#64748B'],
    },
    white: {
        primary: '#FFFFFF',
        secondary: '#E2E8F0',
        gradientColors: ['#FFFFFF', '#F8FAFC', '#E2E8F0', '#FFFFFF'],
    },
    gray: {
        primary: '#94A3B8',
        secondary: '#64748B',
        gradientColors: ['#94A3B8', '#CBD5E1', '#64748B', '#94A3B8'],
    },
    default: {
        primary: '#71717A',
        secondary: '#CBD5E1',
        gradientColors: ['#71717A', '#A1A1AA', '#CBD5E1', '#71717A'],
    },
};

function normalizeText(str: string): string {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Resolves a full StonePalette from an item object, string name, or hex color code.
 */
function resolveRawStonePalette(itemOrText: any): StonePalette {
    if (!itemOrText) return CANONICAL_STONE_PALETTES.default;

    // Direct palette object already passed
    if (typeof itemOrText === 'object' && Array.isArray(itemOrText.gradientColors) && itemOrText.primary) {
        return itemOrText as StonePalette;
    }

    let rawText = '';
    if (typeof itemOrText === 'string') {
        rawText = itemOrText;
    } else if (typeof itemOrText === 'object') {
        const fields = [
            itemOrText.color, itemOrText.color_en, itemOrText.color_es,
            itemOrText.finish, itemOrText.finish_en, itemOrText.finish_es,
            itemOrText.material, itemOrText.material_en, itemOrText.material_es,
            itemOrText.description, itemOrText.shortDescription,
            itemOrText.title, itemOrText.name, itemOrText.shape, itemOrText.type
        ];
        rawText = fields.filter(Boolean).join(' ');
    }

    const t = normalizeText(rawText);

    // 0. Aqua Serpentine (specific mineral variety with turquoise & terracotta bands)
    if (
        (t.includes('aqua') || t.includes('teal') || t.includes('turquesa') || t.includes('turquoise')) &&
        (t.includes('serpentine') || t.includes('serpentina'))
    ) {
        return CANONICAL_STONE_PALETTES.aquaSerpentine;
    }

    // 0b. Zebra (black and white banded)
    if (t.includes('zebra') || t.includes('cebra')) {
        return CANONICAL_STONE_PALETTES.zebra;
    }

    // 0c. Emperor / Brown Calcite
    if (t.includes('emperor') || t.includes('emperador')) {
        return CANONICAL_STONE_PALETTES.emperor;
    }

    // 0d. Ice / Cristaline
    if (t.includes('ice') || t.includes('hielo') || t.includes('cristaline') || t.includes('cristalino')) {
        return CANONICAL_STONE_PALETTES.ice;
    }

    // 0e. Cloud
    if (t.includes('cloud') || t.includes('nube')) {
        return CANONICAL_STONE_PALETTES.cloud;
    }

    // 0f. Talan / Queretaro (deep green & earthy brown)
    if (t.includes('talan') || t.includes('queretaro')) {
        return CANONICAL_STONE_PALETTES.talan;
    }

    // 0g. Cherry Blossom ("Cherry Blue" and "Cherry Pink" in the DB taxonomy are the same
    // stone, not separate colours -- owner correction, 24 Oct 2026). Must come before the
    // generic pink/blue checks below, which would otherwise catch "cherry pink"/"cherry blue".
    if (t.includes('cherry')) {
        return CANONICAL_STONE_PALETTES.cherryBlossom;
    }

    // 1. Aqua
    if (
        t.includes('aqua') || t.includes('teal') || t.includes('turquesa') || t.includes('turquoise') ||
        t.includes('#2dd4bf') || t.includes('#0d9488')
    ) {
        return CANONICAL_STONE_PALETTES.aqua;
    }

    // 2. Multicolor / Rainbow
    if (
        t.includes('multicolor') || t.includes('rainbow') || t.includes('arcoiris') ||
        t.includes('assorted') || t.includes('surtido') || t.includes('cosmic') || t.includes('cosmico')
    ) {
        return CANONICAL_STONE_PALETTES.multicolor;
    }

    // 3. Tehuacán Gray (prioritize over generic Tehuacán and generic Gray)
    if (
        t.includes('tehuacan gray') || t.includes('tehuacan gris') ||
        t.includes('gray tehuacan') || t.includes('gris tehuacan') ||
        t.includes('tehuacan ice') || t.includes('tehuacan rim') ||
        t.includes('large gray rim') || t.includes('small gray rim')
    ) {
        return CANONICAL_STONE_PALETTES.tehuacanGray;
    }

    // 4. Ámbar / Cristaline Amber / Tehuacán Amber (prioritize over generic Tehuacán)
    if (
        t.includes('amber') || t.includes('ambar') ||
        t.includes('miel') || t.includes('honey') || t.includes('caramel') ||
        t.includes('#f59e0b') || t.includes('#ea580c')
    ) {
        return CANONICAL_STONE_PALETTES.amber;
    }

    // 5. Nácar / Pearlescent
    if (
        t.includes('nacar') || t.includes('pearlescent') || t.includes('pearl') ||
        t.includes('perla') || t.includes('iridescent') || t.includes('iridiscente')
    ) {
        return CANONICAL_STONE_PALETTES.nacar;
    }

    // 6. Pink / Pink Serpentine
    if (
        t.includes('pink') || t.includes('rosa') || t.includes('rose') ||
        t.includes('#f472b6') || t.includes('#ec4899') || t.includes('#fda4af')
    ) {
        return CANONICAL_STONE_PALETTES.pink;
    }

    // 7. Serpentine / Green Talan (prioritize over generic green)
    if (
        t.includes('talan') || t.includes('serpentine') || t.includes('serpentina')
    ) {
        return CANONICAL_STONE_PALETTES.serpentine;
    }

    // 8. Galaxy / Black Zebra (prioritize over generic black)
    if (
        t.includes('galaxy') || t.includes('galaxia') ||
        t.includes('black zebra') || t.includes('zebra') || t.includes('cebra') ||
        t.includes('obsidian') || t.includes('obsidiana')
    ) {
        return CANONICAL_STONE_PALETTES.galaxy;
    }

    // 9. Red / Red Pyramid / Jasper
    if (
        t.includes('pyramid') || t.includes('piramide') ||
        t.includes('jasper') || t.includes('jaspe') ||
        t.includes('red') || t.includes('rojo') || t.includes('rubi') || t.includes('ruby') ||
        t.includes('#ef4444') || t.includes('#b45309')
    ) {
        return CANONICAL_STONE_PALETTES.red;
    }

    // 10. Tehuacán (General white stone)
    if (t.includes('tehuacan')) {
        return CANONICAL_STONE_PALETTES.tehuacan;
    }

    // Metals & Other Colors
    if (t.includes('gold') || t.includes('brass') || t.includes('laton') || t.includes('dorado') || t.includes('oro') || t.includes('#fde047')) {
        return CANONICAL_STONE_PALETTES.gold;
    }
    if (t.includes('silver') || t.includes('chrome') || t.includes('steel') || t.includes('aluminum') || t.includes('plata') || t.includes('acero') || t.includes('#e2e8f0')) {
        return CANONICAL_STONE_PALETTES.silver;
    }
    if (t.includes('blue') || t.includes('azul') || t.includes('#3b82f6')) {
        return CANONICAL_STONE_PALETTES.blue;
    }
    if (t.includes('purple') || t.includes('violet') || t.includes('morado') || t.includes('amethyst') || t.includes('cuarzo') || t.includes('#8b5cf6')) {
        return CANONICAL_STONE_PALETTES.purple;
    }
    if (t.includes('green') || t.includes('verde') || t.includes('emerald') || t.includes('esmeralda') || t.includes('#10b981')) {
        return CANONICAL_STONE_PALETTES.serpentine;
    }
    if (t.includes('brown') || t.includes('wood') || t.includes('walnut') || t.includes('oak') || t.includes('madera') || t.includes('cafe') || t.includes('marron') || t.includes('chocolate') || t.includes('emperador')) {
        return CANONICAL_STONE_PALETTES.brown;
    }
    if (t.includes('black') || t.includes('nero') || t.includes('dark') || t.includes('negro') || t.includes('#334155')) {
        return CANONICAL_STONE_PALETTES.black;
    }
    if (t.includes('white') || t.includes('blanco') || t.includes('clear') || t.includes('transparent') || t.includes('#ffffff')) {
        return CANONICAL_STONE_PALETTES.white;
    }
    if (t.includes('grey') || t.includes('gray') || t.includes('gris') || t.includes('concrete') || t.includes('cement') || t.includes('#94a3b8') || t.includes('#a1a1aa')) {
        return CANONICAL_STONE_PALETTES.gray;
    }

    // Direct hex color fallback -> dual harmonic gradient
    const trimmed = typeof itemOrText === 'string' ? itemOrText.trim() : '';
    if (/^#?[0-9a-f]{3,8}$/i.test(trimmed)) {
        const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
        return {
            primary: hex,
            secondary: '#CBD5E1',
            gradientColors: [hex, '#CBD5E1', hex],
        };
    }

    return CANONICAL_STONE_PALETTES.default;
}

/**
 * Resolves the primary canonical color hex for an item.
 */

/**
 * Resolves a full StonePalette from an item object, string name, or hex color code,
 * enhanced with rich saturation, radiant highlights, and vivid chroma.
 */
export function resolveStonePalette(itemOrText: any): StonePalette {
    return enhanceStonePalette(resolveRawStonePalette(itemOrText));
}

export function resolveItemColor(itemOrText: any): string {
    return resolveStonePalette(itemOrText).primary;
}
