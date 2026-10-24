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

export const CANONICAL_STONE_PALETTES: Record<string, StonePalette> = {
    aquaSerpentine: {
        primary: '#2DD4BF',
        secondary: '#B26C1B',
        gradientColors: ['#2DD4BF', '#A2B599', '#FFF9C0', '#EDA954', '#B26C1B', '#9B6F42'],
    },
    aqua: {
        primary: '#2DD4BF',
        secondary: '#0D9488',
        gradientColors: ['#2DD4BF', '#0D9488', '#FBBF24', '#F97316', '#FB7185', '#F472B6'],
    },
    zebra: {
        primary: '#0F172A',
        secondary: '#FFFFFF',
        gradientColors: ['#0F172A', '#334155', '#CBD5E1', '#FFFFFF', '#64748B', '#0F172A'],
    },
    talan: {
        primary: '#059669',
        secondary: '#78350F',
        gradientColors: ['#059669', '#10B981', '#D97706', '#78350F', '#B45309'],
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
    tehuacanGray: {
        primary: '#94A3B8',
        secondary: '#64748B',
        gradientColors: ['#94A3B8', '#CBD5E1', '#FFFFFF', '#64748B'],
    },
    amber: {
        primary: '#F59E0B',
        secondary: '#EA580C',
        gradientColors: ['#F59E0B', '#FDE047', '#EA580C', '#F59E0B'],
    },
    tehuacan: {
        primary: '#FFFFFF',
        secondary: '#10B981',
        gradientColors: ['#FFFFFF', '#F8FAFC', '#34D399', '#10B981', '#F59E0B', '#FFFFFF'],
    },
    nacar: {
        primary: '#FFFFFF',
        secondary: '#FEF3C7',
        gradientColors: ['#FFFFFF', '#FEF3C7', '#E0F2FE', '#FCE7F3', '#FFFFFF'],
    },
    pink: {
        primary: '#F472B6',
        secondary: '#334155',
        gradientColors: ['#F472B6', '#FFFFFF', '#FDA4AF', '#334155'],
    },
    serpentine: {
        primary: '#10B981',
        secondary: '#78350F',
        gradientColors: ['#10B981', '#059669', '#D97706', '#78350F'],
    },
    galaxy: {
        primary: '#334155',
        secondary: '#FFFFFF',
        gradientColors: ['#334155', '#94A3B8', '#FFFFFF', '#334155'],
    },
    red: {
        primary: '#EF4444',
        secondary: '#B45309',
        gradientColors: ['#EF4444', '#B45309', '#F97316', '#EF4444'],
    },
    multicolor: {
        primary: '#EF4444',
        secondary: '#8B5CF6',
        gradientColors: ['#EF4444', '#F97316', '#FBBF24', '#10B981', '#3B82F6', '#8B5CF6'],
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
    blue: {
        primary: '#3B82F6',
        secondary: '#1D4ED8',
        gradientColors: ['#3B82F6', '#60A5FA', '#1D4ED8', '#93C5FD'],
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
export function resolveStonePalette(itemOrText: any): StonePalette {
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
export function resolveItemColor(itemOrText: any): string {
    return resolveStonePalette(itemOrText).primary;
}
