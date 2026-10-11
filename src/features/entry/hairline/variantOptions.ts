/**
 * The sub-shapes of each canonical Type: the single registry behind the dynamic hairline selector, the figure builders and the
 * Shape field of Add Entry. A Type has ONE primary choice that matters (the live inventory, 11 Oct 2026):
 *   form    lamps, mirrors, wall panels, tables, rocks and fountains (Cylinder, Squared, Round, Diamond ...)
 *   size    bowls, canoes, plates (Mini, Small, Medium, Large: the proportions change)
 *   subject the animal or figure painted on a panel or carved (Horse, Elk, Deer ...)
 *   holes   wine racks (the N in "N Holes")
 *   none    nothing to choose
 * and, for some Types, extra axes that apply on top of the primary one: table and floor lamps are Open top or Closed top in their
 * squared, rectangular and cube forms (kind "top").
 * Option values are kebab-case ids. A builder receives the primary option VALUE as its `variant` argument and must also accept the legacy
 * Shape text ("SQUARED", "Squares", "Large "): run it through resolveVariant first. Extra axes are read with parseShapeText.
 * The Shape field keeps ONE text per item ("Squared Open Top"): composeShapeText builds it and parseShapeText reads it back, so no schema change.
 * Unified Types (owner decision, 11 Oct 2026): Luminary is a Wall Panel (every wall panel is lit), Tower Lamp is a Floor Lamp.
 * Pure: no React, no I/O, no app imports.
 */

export type SubShapeKind = 'form' | 'size' | 'subject' | 'holes' | 'top' | 'none';

export interface SubShapeOption {
    /** kebab-case id passed to the figure builders as `variant`. */
    readonly value: string;
    /** English label (callers pass it through tr()). */
    readonly label: string;
    /** Other spellings that mean this option (lower case, no accents). */
    readonly aliases?: readonly string[];
}

/** An extra choice that applies on top of the primary one. */
export interface SubShapeAxis {
    readonly kind: SubShapeKind;
    /** English name of the choice, for the row label: "Top". */
    readonly label: string;
    readonly options: readonly SubShapeOption[];
    /** null: no option is drawn until one is chosen. */
    readonly defaultValue: string | null;
    /** The axis shows only when the primary option is one of these (null: always). */
    readonly whenPrimary: readonly string[] | null;
}

export interface TypeSubShapes {
    readonly typeId: string;
    readonly kind: SubShapeKind;
    /** English name of the primary choice, for the selector's row label: "Form", "Size", "Subject", "Holes". */
    readonly label: string;
    readonly options: readonly SubShapeOption[];
    /** The option drawn before anything is chosen; null when kind is none. */
    readonly defaultValue: string | null;
    /** Extra axes, in the order they are shown and written in the Shape text. */
    readonly extra?: readonly SubShapeAxis[];
}

const opt = (value: string, label: string, aliases: readonly string[] = []): SubShapeOption => ({ value, label, aliases });

const FORM_CYLINDER = opt('cylinder', 'Cylinder', ['cylindrical', 'cilindro', 'cilindrico']);
const FORM_SQUARED = opt('squared', 'Squared', ['square', 'squares', 'cuadrado', 'cuadrada']);
const FORM_CUBE = opt('cube', 'Cube', ['cubo']);
const FORM_RECT = opt('rectangular', 'Rectangular', ['rectangle', 'rectangulo']);
/** A floor lamp is one four-sided column: squared and rectangular are the same form, the width and depth decide the section (owner decision, 11 Oct 2026). */
const FORM_SQUARED_COLUMN = opt('squared', 'Squared', ['square', 'squares', 'cuadrado', 'cuadrada', 'rectangular', 'rectangle', 'rectangulo']);
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

/** Open top or Closed top: a lamp body with an open mouth (the light shows) or a capped top. */
const TOP_AXIS: SubShapeAxis = {
    kind: 'top',
    label: 'Top',
    options: [opt('open', 'Open Top', ['open', 'open top', 'abierto', 'abierta']), opt('closed', 'Closed Top', ['closed', 'closed top', 'cerrado', 'cerrada'])],
    defaultValue: null,
    whenPrimary: ['squared', 'rectangular', 'cube'],
};

const ids = (typeId: string, kind: SubShapeKind, label: string, options: readonly SubShapeOption[], defaultValue: string | null, extra?: readonly SubShapeAxis[]): TypeSubShapes => ({ typeId, kind, label, options, defaultValue, extra });
const none = (typeId: string): TypeSubShapes => ids(typeId, 'none', '', [], null);

/** Types that were unified into another one; their old ids still resolve. */
export const UNIFIED_TYPE_IDS: Readonly<Record<string, string>> = { 'luminary': 'wall-panel', 'tower-lamp': 'floor-lamp' };

/** Options are ordered by how often the live inventory uses them; the drawing never depends on the order. */
export const SUB_SHAPES: Readonly<Record<string, TypeSubShapes>> = {
    'pendant': ids('pendant', 'form', 'Form', [FORM_CYLINDER, FORM_SQUARED], 'cylinder'),
    'table-lamp': ids('table-lamp', 'form', 'Form', [FORM_SQUARED, FORM_CYLINDER, FORM_CUBE, FORM_RECT], 'squared', [TOP_AXIS]),
    'floor-lamp': ids('floor-lamp', 'form', 'Form', [FORM_SQUARED_COLUMN], 'squared', [TOP_AXIS]),
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

/** The id a Type is known by today: a unified Type's old id gives the surviving one. */
export function currentTypeId(typeId: string | null | undefined): string | null {
    if (!typeId) return null;
    return UNIFIED_TYPE_IDS[typeId] ?? typeId;
}

/** The sub-shape choice of a Type; an unknown Type has none. */
export function subShapesFor(typeId: string | null | undefined): TypeSubShapes {
    const id = currentTypeId(typeId);
    return (id && SUB_SHAPES[id]) || NONE;
}

/** Lower case, no accents, single spaces. */
export function foldVariant(raw: unknown): string {
    return String(raw ?? '')
        .normalize('NFD')
        .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function matchOption(options: readonly SubShapeOption[], raw: unknown): string | null {
    const s = foldVariant(raw);
    if (!s || !options.length) return null;
    const stripped = s.length > 3 && s.endsWith('s') ? s.slice(0, -1) : s;
    for (const o of options) {
        const names = [o.value, foldVariant(o.label), ...(o.aliases ?? [])];
        if (names.includes(s) || names.includes(stripped)) return o.value;
    }
    return null;
}

/**
 * The primary option VALUE for an option value or a legacy Shape text, or null when the text names no option of this Type.
 * Accepts "Squared", "SQUARE", "squares", "Free Form", "Horses", "6 holes". Text that also names an extra option ("Squared Open Top")
 * is read through parseShapeText, not here.
 */
export function optionValueFor(typeId: string | null | undefined, raw: unknown): string | null {
    return matchOption(subShapesFor(typeId).options, raw);
}

/** What a builder draws: the option for `raw`, else the Type's default. null for a Type without sub-shapes. */
export function resolveVariant(typeId: string | null | undefined, raw: unknown): string | null {
    const info = subShapesFor(typeId);
    return optionValueFor(typeId, raw) ?? info.defaultValue;
}

/** The extra axes of a Type that apply for this primary option. */
export function extraAxesFor(typeId: string | null | undefined, primary: string | null | undefined): readonly SubShapeAxis[] {
    const axes = subShapesFor(typeId).extra ?? [];
    return axes.filter(a => !a.whenPrimary || (primary != null && a.whenPrimary.includes(primary)));
}

export interface ParsedShape {
    /** The primary option value, or null when the text names none. */
    readonly primary: string | null;
    /** Extra option values by axis kind, e.g. { top: "open" }. */
    readonly extra: Readonly<Record<string, string>>;
}

const hasPhrase = (folded: string, phrase: string) => new RegExp('(^|[^a-z0-9])' + phrase + '($|[^a-z0-9])').test(folded);

/** Reads a Shape text into its primary option and extra options: "Squared Open Top" gives { primary: "squared", extra: { top: "open" } }. */
export function parseShapeText(typeId: string | null | undefined, raw: unknown): ParsedShape {
    const info = subShapesFor(typeId);
    const text = foldVariant(raw);
    if (!text) return { primary: null, extra: {} };
    const extra: Record<string, string> = {};
    let rest = text;
    // Longest phrases first so "open top" is taken before "open".
    for (const axis of info.extra ?? []) {
        const names: Array<[string, string]> = [];
        for (const o of axis.options) for (const n of [foldVariant(o.label), ...(o.aliases ?? [])]) names.push([n, o.value]);
        names.sort((a, b) => b[0].length - a[0].length);
        for (const [n, v] of names) {
            if (hasPhrase(rest, n)) { extra[axis.kind] = v; rest = rest.replace(new RegExp('(^|[^a-z0-9])' + n + '($|[^a-z0-9])'), ' ').replace(/\s+/g, ' ').trim(); break; }
        }
    }
    return { primary: matchOption(info.options, rest) ?? matchOption(info.options, text), extra };
}

/** The Shape text for a primary option and extra options: label of each, in axis order, "Squared Open Top". Wine racks are always "Rustic Wine Rack". */
export function composeShapeText(typeId: string | null | undefined, primary: string | null | undefined, extra: Readonly<Record<string, string>> = {}): string {
    if (currentTypeId(typeId) === 'wine-rack') return 'Rustic Wine Rack';
    const info = subShapesFor(typeId);
    const main = info.options.find(x => x.value === primary);
    const parts: string[] = main ? [main.label] : [];
    for (const axis of extraAxesFor(typeId, primary)) {
        const o = axis.options.find(x => x.value === extra[axis.kind]);
        if (o) parts.push(o.label);
    }
    return parts.join(' ');
}

/** The text the form's Shape field receives when a primary option is chosen with no extras: the label, except wine racks. */
export function shapeTextFor(typeId: string | null | undefined, value: string | null | undefined): string {
    return composeShapeText(typeId, value);
}
