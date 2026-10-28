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
    talan: { // shades of green with earthy bands: the db hex maps for Green Talan were mostly room background
        primary: '#4F7A3A',
        secondary: '#6B8F4E',
        gradientColors: ['#4F7A3A', '#6B8F4E', '#2F4F2A', '#8FA86A', '#5C4A2E', '#A9BF8A'],
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
    amber: { // shades of amber: the db hex maps mix in the White-Amber items' whites and grays
        primary: '#C8862E',
        secondary: '#E0A04A',
        gradientColors: ['#C8862E', '#E0A04A', '#9A5E1C', '#F0C27A', '#7A4512', '#F6D9A6'],
    },
    tehuacan: { // shades of white and gray; a second colour in the colour field is mixed in, see tehuacanWith
        primary: '#FFFFFF',
        secondary: '#C9C9C6',
        gradientColors: ['#FFFFFF', '#C9C9C6', '#F4F1EA', '#9C9C99', '#E6E3DC', '#B3B3B0'],
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
    serpentine: { // same stone as talan
        primary: '#4F7A3A',
        secondary: '#6B8F4E',
        gradientColors: ['#4F7A3A', '#6B8F4E', '#2F4F2A', '#8FA86A', '#5C4A2E', '#A9BF8A'],
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
    gray: { // neutral grays
        primary: '#9A9A96',
        secondary: '#BDBDB8',
        gradientColors: ['#9A9A96', '#BDBDB8', '#6F6F6B', '#D4D4CF'],
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

/** Enhanced primary hex -> raw palette, so a caller that kept only resolveItemColor's hex still gets the whole palette. */
const PALETTE_BY_PRIMARY = new Map<string, StonePalette>();

function normalizeText(str: string): string {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/** White Tehuacan shades with the second colour of `colorField` (the words besides Tehuacan) worked in. */
function tehuacanWith(colorField: string): StonePalette {
    const base = CANONICAL_STONE_PALETTES.tehuacan;
    const rest = normalizeText(colorField).replace(/tehuacan/g, ' ').replace(/w/g, ' ').trim();
    const other = rest ? resolveRawStonePalette(rest) : null;
    if (!other || other === CANONICAL_STONE_PALETTES.default || other === base) return base;
    const w = base.gradientColors;
    const o = other.gradientColors;
    // Primary is white with a 15% tint of the second colour, so each mix has its own hex.
    const mix = (a: string, b: string, k: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
    const primary = /^#[0-9a-f]{6}$/i.test(o[0]) ? mix('#FFFFFF', o[0], 0.15) : w[0];
    return { primary, secondary: o[0], gradientColors: [primary, o[0], w[1], o[1], w[2], o[2]] };
}

/**
 * Resolves a full StonePalette from an item object, string name, or hex color code.
 */
function resolveRawStonePalette(itemOrText: any): StonePalette {
    if (!PALETTE_BY_PRIMARY.size) {
        for (const pal of Object.values(CANONICAL_STONE_PALETTES)) PALETTE_BY_PRIMARY.set(enhanceStonePalette(pal).primary.toUpperCase(), pal);
    }
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
    // Whole words only: a substring test matched "red" inside "squared" and "ice" inside "price".
    const has = (word: string) => {
        for (let i = t.indexOf(word); i >= 0; i = t.indexOf(word, i + 1)) {
            const before = t[i - 1];
            const after = t[i + word.length];
            if ((!before || !/[a-z0-9]/.test(before)) && (!after || !/[a-z0-9]/.test(after))) return true;
        }
        return false;
    };

    // Tehuacan is a white stone: its palette is white shades plus the other colour the
    // colour field names ("Tehuacan Amber", "Tehuacan W Green"), or white alone.
    const colorField = typeof itemOrText === 'string' ? itemOrText : String(itemOrText.color || '');
    // A hex the app handed out earlier (resolveItemColor, passed on to the axo renderer) maps back to its full palette.
    const known = PALETTE_BY_PRIMARY.get(colorField.trim().toUpperCase());
    if (known) return known;
    if (/(^|[^a-z])tehuacan([^a-z]|$)/.test(normalizeText(colorField))) return tehuacanWith(colorField);
    // The colour field decides when it names a stone; shape and description words only break a tie.
    if (typeof itemOrText === 'object' && colorField.trim() && !colorField.trim().startsWith('#')) {
        const own = resolveRawStonePalette(colorField);
        if (own !== CANONICAL_STONE_PALETTES.default) return own;
    }

    // 0. Aqua Serpentine (specific mineral variety with turquoise & terracotta bands)
    if (
        (has('aqua') || has('teal') || has('turquesa') || has('turquoise')) &&
        (has('serpentine') || has('serpentina'))
    ) {
        return CANONICAL_STONE_PALETTES.aquaSerpentine;
    }

    // 0b. Zebra (black and white banded)
    if (has('zebra') || has('cebra')) {
        return CANONICAL_STONE_PALETTES.zebra;
    }

    // 0c. Emperor / Brown Calcite
    if (has('emperor') || has('emperador')) {
        return CANONICAL_STONE_PALETTES.emperor;
    }

    // 0d. Ice / Cristaline
    if (has('ice') || has('hielo') || has('cristaline') || has('cristalino')) {
        return CANONICAL_STONE_PALETTES.ice;
    }

    // 0e. Cloud
    if (has('cloud') || has('nube')) {
        return CANONICAL_STONE_PALETTES.cloud;
    }

    // 0f. Talan / Queretaro (deep green & earthy brown)
    if (has('talan') || has('queretaro')) {
        return CANONICAL_STONE_PALETTES.talan;
    }

    // 0g. Cherry Blossom ("Cherry Blue" and "Cherry Pink" in the DB taxonomy are the same
    // stone, not separate colours -- owner correction, 24 Oct 2026). Must come before the
    // generic pink/blue checks below, which would otherwise catch "cherry pink"/"cherry blue".
    if (has('cherry')) {
        return CANONICAL_STONE_PALETTES.cherryBlossom;
    }

    // 1. Aqua
    if (
        has('aqua') || has('teal') || has('turquesa') || has('turquoise') ||
        has('#2dd4bf') || has('#0d9488')
    ) {
        return CANONICAL_STONE_PALETTES.aqua;
    }

    // 2. Multicolor / Rainbow
    if (
        has('multicolor') || has('rainbow') || has('arcoiris') ||
        has('assorted') || has('surtido') || has('cosmic') || has('cosmico')
    ) {
        return CANONICAL_STONE_PALETTES.multicolor;
    }

    // 3. Tehuacán Gray (prioritize over generic Tehuacán and generic Gray)
    if (
        has('tehuacan gray') || has('tehuacan gris') ||
        has('gray tehuacan') || has('gris tehuacan') ||
        has('tehuacan ice') || has('tehuacan rim') ||
        has('large gray rim') || has('small gray rim')
    ) {
        return CANONICAL_STONE_PALETTES.tehuacanGray;
    }

    // 4. Ámbar / Cristaline Amber / Tehuacán Amber (prioritize over generic Tehuacán)
    if (
        has('amber') || has('ambar') ||
        has('miel') || has('honey') || has('caramel') ||
        has('#f59e0b') || has('#ea580c')
    ) {
        return CANONICAL_STONE_PALETTES.amber;
    }

    // 5. Nácar / Pearlescent
    if (
        has('nacar') || has('pearlescent') || has('pearl') ||
        has('perla') || has('iridescent') || has('iridiscente')
    ) {
        return CANONICAL_STONE_PALETTES.nacar;
    }

    // 6. Pink / Pink Serpentine
    if (
        has('pink') || has('rosa') || has('rose') ||
        has('#f472b6') || has('#ec4899') || has('#fda4af')
    ) {
        return CANONICAL_STONE_PALETTES.pink;
    }

    // 7. Serpentine / Green Talan (prioritize over generic green)
    if (
        has('talan') || has('serpentine') || has('serpentina')
    ) {
        return CANONICAL_STONE_PALETTES.serpentine;
    }

    // 8. Galaxy / Black Zebra (prioritize over generic black)
    if (
        has('galaxy') || has('galaxia') ||
        has('black zebra') || has('zebra') || has('cebra') ||
        has('obsidian') || has('obsidiana')
    ) {
        return CANONICAL_STONE_PALETTES.galaxy;
    }

    // 9. Red / Red Pyramid / Jasper
    if (
        has('pyramid') || has('piramide') ||
        has('jasper') || has('jaspe') ||
        has('red') || has('rojo') || has('rubi') || has('ruby') ||
        has('#ef4444') || has('#b45309')
    ) {
        return CANONICAL_STONE_PALETTES.red;
    }

    // 10. Tehuacán (General white stone)
    if (has('tehuacan')) {
        return CANONICAL_STONE_PALETTES.tehuacan;
    }

    if (has('orange') || has('naranja')) {
        return CANONICAL_STONE_PALETTES.orange;
    }
    if (has('yellow') || has('amarillo')) {
        return CANONICAL_STONE_PALETTES.yellow;
    }

    // Metals & Other Colors
    if (has('gold') || has('brass') || has('laton') || has('dorado') || has('oro') || has('#fde047')) {
        return CANONICAL_STONE_PALETTES.gold;
    }
    if (has('silver') || has('chrome') || has('steel') || has('aluminum') || has('plata') || has('acero') || has('#e2e8f0')) {
        return CANONICAL_STONE_PALETTES.silver;
    }
    if (has('blue') || has('azul') || has('#3b82f6')) {
        return CANONICAL_STONE_PALETTES.blue;
    }
    if (has('purple') || has('violet') || has('morado') || has('amethyst') || has('cuarzo') || has('#8b5cf6')) {
        return CANONICAL_STONE_PALETTES.purple;
    }
    if (has('green') || has('verde') || has('emerald') || has('esmeralda') || has('#10b981')) {
        return CANONICAL_STONE_PALETTES.serpentine;
    }
    if (has('brown') || has('wood') || has('walnut') || has('oak') || has('madera') || has('cafe') || has('marron') || has('chocolate') || has('emperador')) {
        return CANONICAL_STONE_PALETTES.brown;
    }
    if (has('black') || has('nero') || has('dark') || has('negro') || has('#334155')) {
        return CANONICAL_STONE_PALETTES.black;
    }
    if (has('white') || has('blanco') || has('clear') || has('transparent') || has('#ffffff')) {
        return CANONICAL_STONE_PALETTES.white;
    }
    if (has('grey') || has('gray') || has('gris') || has('concrete') || has('cement') || has('#94a3b8') || has('#a1a1aa')) {
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
    const raw = resolveRawStonePalette(itemOrText);
    const enhanced = enhanceStonePalette(raw);
    PALETTE_BY_PRIMARY.set(enhanced.primary.toUpperCase(), raw);
    return enhanced;
}

export function resolveItemColor(itemOrText: any): string {
    return resolveStonePalette(itemOrText).primary;
}

/** The palette before enhanceStonePalette's saturation boost, for print where the boost reads too strong. */
export function resolveStonePaletteRaw(itemOrText: any): StonePalette {
    return resolveRawStonePalette(itemOrText);
}

/**
 * An item's own stone shades from its hex map: the `n` most common colours (cells binned at 8 levels per channel,
 * averaged), lightest first. Skips the cutout background (#FFFFFF), the dark-room gray and the light-room creams,
 * the same background the db palettes exclude. Empty when fewer than 2 shades remain.
 */
/** A hex-map cell that is backdrop, not stone: the cutout white, the dark-room gray or the light-room creams. */
export function isHexMapBackground(r: number, g: number, b: number): boolean {
    return (r === 255 && g === 255 && b === 255)
        || (Math.abs(r - 109) <= 14 && Math.abs(g - 108) <= 14 && Math.abs(b - 114) <= 14)
        || (r >= 244 && g >= 232 && b >= 165);
}

export function hexMapShades(hexes: readonly string[], n = 6): string[] {
    const bins = new Map<number, { c: number; r: number; g: number; b: number }>();
    for (const h of hexes) {
        const m = /^#?([0-9a-f]{6})/i.exec(h.trim());
        if (!m) continue;
        const v = parseInt(m[1], 16);
        const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
        if (isHexMapBackground(r, g, b)) continue;
        const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
        const bin = bins.get(k) ?? { c: 0, r: 0, g: 0, b: 0 };
        bin.c++; bin.r += r; bin.g += g; bin.b += b;
        bins.set(k, bin);
    }
    const ranked = [...bins.values()].sort((a, b) => b.c - a.c);
    const avg = (x: { c: number; r: number; g: number; b: number }) => [x.r / x.c, x.g / x.c, x.b / x.c];
    const hexOf = (c: number[]) => '#' + c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
    const picked = ranked.slice(0, n);
    // Aqua Serpentine: keep the sage-teal band in the bar even when it is not among the most common shades.
    const total = ranked.reduce((t, x) => t + x.c, 0);
    if (!picked.some(x => isAquaBand(hexOf(avg(x))))) {
        const aqua = ranked.find(x => isAquaBand(hexOf(avg(x))) && x.c >= Math.max(2, total * 0.02));
        if (aqua && picked.length) picked[picked.length - 1] = aqua;
    }
    const top = picked.map(avg)
        .sort((a, b) => (b[0] * 0.299 + b[1] * 0.587 + b[2] * 0.114) - (a[0] * 0.299 + a[1] * 0.587 + a[2] * 0.114));
    if (top.length < 2) return [];
    return top.map(c => '#' + c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase());
}

/** A gentle lift for printed colour bars: saturation x1.15 (+0.03) and lightness x1.04 (+0.02), far milder than enhanceStoneColor. */
export function liftBandColor(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    const r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    let l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
        s = Math.min(1, s * 1.15 + 0.03);
    }
    l = Math.min(0.97, l * 1.04 + 0.02);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const ch = (t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        const x = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
        return Math.round(x * 255).toString(16).padStart(2, '0');
    };
    if (s === 0) return '#' + Math.round(l * 255).toString(16).padStart(2, '0').repeat(3).toUpperCase();
    return ('#' + ch(h + 1 / 3) + ch(h) + ch(h - 1 / 3)).toUpperCase();
}

const toHsl = (hex: string): [number, number, number] | null => {
    const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
    if (!m) return null;
    const v = parseInt(m[1], 16);
    const r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
};

const fromHsl = (h: number, s: number, l: number): string => {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, hh = h / 360;
    const ch = (t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        const x = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
        return Math.round(x * 255).toString(16).padStart(2, '0');
    };
    return ('#' + ch(hh + 1 / 3) + ch(hh) + ch(hh - 1 / 3)).toUpperCase();
};

/** Aqua Serpentine's sage-teal band (#88A271, #657C5D, #819B6A): hue 70-140°, saturation 0.08-0.55, lightness 0.22-0.72. */
export function isAquaBand(hex: string): boolean {
    const hsl = toHsl(hex);
    if (!hsl) return false;
    const [h, s, l] = hsl;
    return h >= 70 && h <= 140 && s >= 0.08 && s <= 0.55 && l >= 0.22 && l <= 0.72;
}

/** Vibrance for the aqua band in colour bars: saturation x1.3 (+0.03, max 0.55), hue nudged 8° toward teal (max 150°). Other colours unchanged. */
export function boostAquaBand(hex: string): string {
    if (!isAquaBand(hex)) return hex;
    const [h, s, l] = toHsl(hex)!;
    return fromHsl(Math.min(150, h + 8), Math.min(0.55, s * 1.3 + 0.03), l);
}

/** Boosts the aqua band in a hex map only when the band is really there: at least 5% of the non-background cells. */
export function boostAquaBandInMap(hexes: readonly string[]): string[] {
    const stone = hexes.filter(h => !/^#?f{6}$/i.test(h.trim()));
    const share = stone.length ? stone.filter(isAquaBand).length / stone.length : 0;
    return share >= 0.05 ? hexes.map(boostAquaBand) : [...hexes];
}

/** An item's colour-bar shades: its hex-map shades (aqua band boosted), else its canonical palette, lifted. Shared by the PDF bands and the inventory list. */
export function itemBandShades(hexMap: readonly string[], item: { color?: string; material?: string }): string[] {
    let shades = boostAquaBandInMap(hexMapShades(hexMap));
    if (!shades.length) {
        const palette = resolveStonePaletteRaw(item);
        shades = palette.gradientColors.length ? palette.gradientColors : [palette.primary];
    }
    return shades.map(liftBandColor);
}
