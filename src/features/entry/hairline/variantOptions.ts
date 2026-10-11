/**
 * The sub-shapes of each canonical Type: the single registry behind the dynamic hairline selector, the figure builders and the
 * Shape field of Add Entry. A Type has ONE kind of sub-shape that matters (the live inventory, 11 Oct 2026):
 *   form    lamps, mirrors, wall panels, tables, rocks and fountains (Cylinder, Squared, Round, Diamond ...)
 *   size    bowls, canoes, plates (Mini, Small, Medium, Large: the proportions change)
 *   subject the animal or figure painted on a panel or carved (Horse, Elk, Deer ...)
 *   holes   wine racks (the N in "N Holes")
 *   none    nothing to choose
 * Option values are kebab-case ids. A builder receives the option VALUE as its `variant` argument and must also accept the legacy
 * Shape text ("SQUARED", "Squares", "Large "): run it through resolveVariant first.
 * Pure: no React, no I/O, no app imports.
 */

export type SubShapeKind = 'form' | 'size' | 'subject' | 'holes' | 'none';

export interface SubShapeOption {
    /** kebab-case id passed to the figure builders as `variant`. */
    readonly value: string;
    /** English label (callers pass it through tr()). */
    readonly label: string;
    /** Other spellings that mean this option (lower case, no accents). */
    readonly aliases?: readonly string[];
}

export interface TypeSubShapes {
    readonly typeId: string;
    readonly kind: SubShapeKind;
    /** English name of the choice, for the selector's row label: "Form", "Size", "Subject", "Holes". */
    readonly label: string;
    readonly options: readonly SubShapeOption[];
    /** The option drawn before anything is chosen; null when kind is none. */
    readonly defaultValue: string | null;
}

const opt = (value: string, label: string, aliases: readonly string[] = []): SubShapeOption => ({ value, label, aliases });

const FORM_CYLINDER = opt('cylinder', 'Cylinder', ['cylindrical', 'cilindro', 'cilindrico']);
const FORM_SQUARED = opt('squared', 'Squared', ['square', 'squares', 'cuadrado', 'cuadrada']);
const FORM_CUBE = opt('cube', 'Cube', ['cubo']);
const FORM_RECT = opt('rectangular', 'Rectangular', ['rectangle', 'rectangulo']);
const FORM_ROUND = opt('round', 'Round', ['circle', 'circular', 'oval', 'redondo', 'redonda']);
const FORM_FREE = opt('free-form', 'Free Form', ['freeform', 'free form', 'organic', 'organico', 'wavy']);
const FORM_IRREGULAR = opt('irregular', 'Irregular');

const SIZES_ALL = [opt('large', 'Large', ['grande']), opt('medium', 'Medium', ['mediano', 'mediana']), opt('small', 'Small', ['chico', 'chica', 'pequeno', 'pequena']), opt('mini', 'Mini')];

const ANIMALS = [
    opt('horse', 'Horse', ['horses', 'caballo', 'caballos']),
    opt('elk', 'Elk', ['elks', 'alce', 'alces']),
    opt('deer', 'Deer', ['venado', 'venados']),
    opt('moose', 'Moose'),
    opt('bear', 'Bear', ['bears', 'oso', 'osos']),
    opt('bobcat', 'Bobcat', ['bobcats', 'lince']),
    opt('climbers', 'Climbers', ['climber', 'escaladores']),
];

const ids = (typeId: string, kind: SubShapeKind, label: string, options: readonly SubShapeOption[], defaultValue: string | null): TypeSubShapes => ({ typeId, kind, label, options, defaultValue });
const none = (typeId: string): TypeSubShapes => ids(typeId, 'none', '', [], null);

/** Counts are the live items per option (11 Oct 2026) and only order the options; the drawing never depends on them. */
export const SUB_SHAPES: Readonly<Record<string, TypeSubShapes>> = {
    'pendant': ids('pendant', 'form', 'Form', [FORM_CYLINDER, FORM_SQUARED], 'cylinder'),
    'table-lamp': ids('table-lamp', 'form', 'Form', [FORM_SQUARED, FORM_CYLINDER, FORM_CUBE, FORM_RECT], 'squared'),
    'floor-lamp': ids('floor-lamp', 'form', 'Form', [FORM_SQUARED, FORM_CYLINDER], 'squared'),
    'tower-lamp': ids('tower-lamp', 'form', 'Form', [FORM_SQUARED, FORM_CYLINDER], 'squared'),
    'luminary': ids('luminary', 'form', 'Form', [FORM_RECT, FORM_IRREGULAR], 'rectangular'),
    'bowl': ids('bowl', 'size', 'Size', SIZES_ALL, 'medium'),
    'canoe': ids('canoe', 'size', 'Size', SIZES_ALL.slice(0, 3), 'medium'),
    'plate': ids('plate', 'size', 'Size', SIZES_ALL.slice(0, 3), 'large'),
    'basin': none('basin'),
    'rock': ids('rock', 'form', 'Form', [opt('boulder', 'Boulder'), FORM_FREE], 'boulder'),
    'fountain': ids('fountain', 'form', 'Form', [opt('boulder', 'Boulder'), opt('sphere', 'Sphere', ['ball']), opt('s-shaped', 'S-shaped', ['s shaped', 's'])], 'boulder'),
    'sculpture': ids('sculpture', 'subject', 'Subject', [opt('flame', 'Flame'), opt('venus', 'Venus'), opt('cactus', 'Cactus')], null),
    'pillar': ids('pillar', 'form', 'Form', [FORM_SQUARED, FORM_CYLINDER], 'squared'),
    'ball': ids('ball', 'size', 'Size', [opt('mini', 'Mini'), opt('small', 'Small')], 'mini'),
    'bag': none('bag'),
    'wall-panel': ids('wall-panel', 'form', 'Form', [FORM_RECT, FORM_IRREGULAR, FORM_FREE, opt('pair', 'Pair', ['panel pair', 'wall panel pair', 'par'])], 'rectangular'),
    'painted-wall-panel': ids('painted-wall-panel', 'subject', 'Subject', ANIMALS, 'horse'),
    'mirror': ids('mirror', 'form', 'Form', [FORM_RECT, FORM_ROUND, FORM_SQUARED], 'rectangular'),
    'wine-rack': ids('wine-rack', 'holes', 'Holes', [2, 3, 4, 5, 6, 8, 9, 10, 20, 21].map(n => opt(String(n), n + ' holes', [String(n)])), '6'),
    'table': ids('table', 'form', 'Form', [opt('diamond', 'Diamond'), FORM_ROUND, FORM_FREE, FORM_RECT], 'diamond'),
    'couch': ids('couch', 'form', 'Form', [opt('v-shaped', 'V-shaped', ['v shaped', 'v'])], 'v-shaped'),
    'bar': ids('bar', 'form', 'Form', [opt('l-shaped', 'L-shaped', ['l shaped', 'l'])], 'l-shaped'),
};

const NONE: TypeSubShapes = none('');

/** The sub-shape choice of a Type; an unknown Type has none. */
export function subShapesFor(typeId: string | null | undefined): TypeSubShapes {
    return (typeId && SUB_SHAPES[typeId]) || NONE;
}

/** Lower case, no accents, single spaces, no trailing plural "s" on words longer than 3 letters ("Horses" -> "horse"). */
export function foldVariant(raw: unknown): string {
    const s = String(raw ?? '')
        .normalize('NFD')
        .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    return s;
}

/**
 * The option VALUE for an option value or a legacy Shape text, or null when the text names no option of this Type.
 * Accepts "Squared", "SQUARE", "squares", "Free Form", "Horses", "6 holes".
 */
export function optionValueFor(typeId: string | null | undefined, raw: unknown): string | null {
    const info = subShapesFor(typeId);
    const s = foldVariant(raw);
    if (!s || !info.options.length) return null;
    const stripped = s.length > 3 && s.endsWith('s') ? s.slice(0, -1) : s;
    for (const o of info.options) {
        const names = [o.value, foldVariant(o.label), ...(o.aliases ?? [])];
        if (names.includes(s) || names.includes(stripped)) return o.value;
    }
    return null;
}

/** What a builder draws: the option for `raw`, else the Type's default. null for a Type without sub-shapes. */
export function resolveVariant(typeId: string | null | undefined, raw: unknown): string | null {
    const info = subShapesFor(typeId);
    return optionValueFor(typeId, raw) ?? info.defaultValue;
}

/** The text the form's Shape field receives when an option is chosen: the label, except wine racks (always "Rustic Wine Rack"). */
export function shapeTextFor(typeId: string | null | undefined, value: string | null | undefined): string {
    if (typeId === 'wine-rack') return 'Rustic Wine Rack';
    const o = subShapesFor(typeId).options.find(x => x.value === value);
    return o ? o.label : '';
}
