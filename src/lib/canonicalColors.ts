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

// Palettes marked "db hex maps" are built from every hex map stored in the database
// (spatial_points, all photo angles), grouped by the palette each item's colour resolves
// to: #FFFFFF cutout background, the dark-room gray and the light-room creams excluded,
// cells binned at 8 levels per channel, the 6 most frequent bins kept, most frequent first.
// The table is swarm/artifacts/colorMap/db_hex_palettes.json. Palettes without that mark
// had no hex maps behind them and keep their hand-picked shades.
export const CANONICAL_STONE_PALETTES: Record<string, StonePalette> = {
    aquaSerpentine: { // db hex maps, 31 items
        primary: '#8d7151',
        secondary: '#6e5233',
        gradientColors: ['#8d7151', '#6e5233', '#756950', '#938970', '#ac9270', '#6e5a47'],
    },
    aqua: { // db hex maps, 21 items
        primary: '#fccf90',
        secondary: '#d0ccb4',
        gradientColors: ['#fccf90', '#d0ccb4', '#cdcfca', '#e9d9ca', '#fed275', '#f3d2b0'],
    },
    zebra: { // db hex maps, 12 items
        primary: '#6a728b',
        secondary: '#515b70',
        gradientColors: ['#6a728b', '#515b70', '#968993', '#576475', '#b5a9b3', '#cbb1b0'],
    },
    talan: { // db hex maps, 55 items
        primary: '#b2b3ad',
        secondary: '#cecfcc',
        gradientColors: ['#b2b3ad', '#cecfcc', '#93928e', '#a9a798', '#c6c6b9', '#6e6957'],
    },
    cherryBlossom: { // db hex maps, 5 items
        primary: '#b2b0ac',
        secondary: '#97938d',
        gradientColors: ['#b2b0ac', '#97938d', '#aba59a', '#a59a91', '#d2ae71', '#ebcd90'],
    },
    ice: { // db hex maps, 54 items
        primary: '#f4d5af',
        secondary: '#f0e7cf',
        gradientColors: ['#f4d5af', '#f0e7cf', '#eeeeeb', '#d6ccb2', '#f8cd95', '#d4b391'],
    },
    cloud: {
        primary: '#FFFFFF',
        secondary: '#CBD5E1',
        gradientColors: ['#FFFFFF', '#F8FAFC', '#E2E8F0', '#CBD5E1', '#FFFFFF'],
    },
    emperor: { // db hex maps, 4 items
        primary: '#facdb1',
        secondary: '#f9d4c9',
        gradientColors: ['#facdb1', '#f9d4c9', '#f0b4ab', '#8f7271', '#ac928f', '#d0b5ac'],
    },
    tehuacanGray: { // db hex maps, 15 items
        primary: '#f2d3b0',
        secondary: '#d2eef9',
        gradientColors: ['#f2d3b0', '#d2eef9', '#e9f8fa', '#adb0b2', '#cfcfcd', '#f4e4cd'],
    },
    amber: { // db hex maps, 51 items
        primary: '#b3a993',
        secondary: '#b6b4aa',
        gradientColors: ['#b3a993', '#b6b4aa', '#cfc7b3', '#8d7351', '#ad9470', '#726853'],
    },
    tehuacan: { // db hex maps, 33 items
        primary: '#b4b3a9',
        secondary: '#95918d',
        gradientColors: ['#b4b3a9', '#95918d', '#d0c8b6', '#b0a695', '#f2d4b0', '#c9b8ac'],
    },
    nacar: { // db hex maps, 52 items
        primary: '#6e4b33',
        secondary: '#693226',
        gradientColors: ['#6e4b33', '#693226', '#ebd2af', '#8e7053', '#ccb390', '#d3d0cc'],
    },
    pink: { // db hex maps, 31 items
        primary: '#363129',
        secondary: '#534639',
        gradientColors: ['#363129', '#534639', '#6c6653', '#575548', '#6e5849', '#f8d0ce'],
    },
    serpentine: { // db hex maps, 55 items
        primary: '#b2b3ad',
        secondary: '#cecfcc',
        gradientColors: ['#b2b3ad', '#cecfcc', '#93928e', '#a9a798', '#c6c6b9', '#6e6957'],
    },
    galaxy: { // db hex maps, 4 items
        primary: '#ceb390',
        secondary: '#b0926d',
        gradientColors: ['#ceb390', '#b0926d', '#d5c7ae', '#6e5036', '#948e8b', '#6b584c'],
    },
    red: { // db hex maps, 7 items
        primary: '#8e736f',
        secondary: '#ffef05',
        gradientColors: ['#8e736f', '#ffef05', '#73655b', '#f89008', '#ac8996', '#ab6d6f'],
    },
    multicolor: { // db hex maps, 8 items
        primary: '#cdb152',
        secondary: '#cbb66d',
        gradientColors: ['#cdb152', '#cbb66d', '#969289', '#8e8777', '#af954f', '#e7d26f'],
    },
    gold: { // db hex maps, 9 items
        primary: '#f7cdaa',
        secondary: '#fff492',
        gradientColors: ['#f7cdaa', '#fff492', '#f0b691', '#8f6f53', '#b1908a', '#efac6e'],
    },
    silver: {
        primary: '#E2E8F0',
        secondary: '#94A3B8',
        gradientColors: ['#E2E8F0', '#CBD5E1', '#94A3B8', '#FFFFFF'],
    },
    blue: { // db hex maps, 12 items
        primary: '#334e4f',
        secondary: '#4d564f',
        gradientColors: ['#334e4f', '#4d564f', '#526b6a', '#6e6755', '#514836', '#2f3733'],
    },
    purple: { // db hex maps, 29 items
        primary: '#8d8f8f',
        secondary: '#768a8b',
        gradientColors: ['#8d8f8f', '#768a8b', '#576a70', '#737571', '#aeaead', '#d1fdf7'],
    },
    brown: { // db hex maps, 1 items
        primary: '#6e4e15',
        secondary: '#554d28',
        gradientColors: ['#6e4e15', '#554d28', '#503821', '#895606', '#743617', '#f68c00'],
    },
    black: { // db hex maps, 3 items
        primary: '#6f7589',
        secondary: '#898891',
        gradientColors: ['#6f7589', '#898891', '#d5ccd6', '#5c6374', '#9496ad', '#5b5d6d'],
    },
    white: { // db hex maps, 17 items
        primary: '#b3b3ab',
        secondary: '#d1d0c9',
        gradientColors: ['#b3b3ab', '#d1d0c9', '#cac6b8', '#ada897', '#97958d', '#908876'],
    },
    gray: {
        primary: '#94A3B8',
        secondary: '#64748B',
        gradientColors: ['#94A3B8', '#CBD5E1', '#64748B', '#94A3B8'],
    },
    orange: { // shades of orange: the db hex maps for Orange were mostly room background
        primary: '#E8742A',
        secondary: '#F29A4A',
        gradientColors: ['#E8742A', '#F29A4A', '#C85A1E', '#F7B26E', '#A4471A', '#FBCB94'],
    },
    yellow: { // shades of yellow
        primary: '#F7C934',
        secondary: '#FFE14D',
        gradientColors: ['#F7C934', '#FFE14D', '#E0A91C', '#FFD966', '#C98E12', '#FFF0A0'],
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

    if (t.includes('orange') || t.includes('naranja')) {
        return CANONICAL_STONE_PALETTES.orange;
    }
    if (t.includes('yellow') || t.includes('amarillo')) {
        return CANONICAL_STONE_PALETTES.yellow;
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
