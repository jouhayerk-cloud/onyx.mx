/**
 * Canonical Types: one name per kind of object, whatever the inventory spelling.
 *
 * The inventory Type is free text ("pendant", "pendant lamp", "Pendant Lamps", "2 holes").
 * The Add Entry type tiles and the cross-filtered suggestions must count those as one
 * value, so every Type is read through canonicalType() before it is compared or shown.
 * Pure: no React, no I/O. Shape is read only where a Type alone is not enough
 * (a wine rack's hole count, a person's name on a basin).
 *
 * Plan: C:\Jouhayerk\swarm\artifacts\TYPE_PICKER_REDESIGN_PLAN.md sections 1, 2a and 7.
 */

export type CanonicalTypeId =
    | 'pendant'
    | 'table-lamp'
    | 'floor-lamp'
    | 'tower-lamp'
    | 'luminary'
    | 'bowl'
    | 'canoe'
    | 'plate'
    | 'basin'
    | 'rock'
    | 'fountain'
    | 'sculpture'
    | 'pillar'
    | 'ball'
    | 'bag'
    | 'wall-panel'
    | 'painted-wall-panel'
    | 'mirror'
    | 'wine-rack'
    | 'table'
    | 'couch'
    | 'bar';

export interface CanonicalTypeInfo { id: CanonicalTypeId; label: string }

/** Every canonical Type, in the order of the alias table below. */
export const CANONICAL_TYPES: readonly CanonicalTypeInfo[] = [
    { id: 'pendant', label: 'Pendant' },
    { id: 'table-lamp', label: 'Table Lamp' },
    { id: 'floor-lamp', label: 'Floor Lamp' },
    { id: 'tower-lamp', label: 'Tower Lamp' },
    { id: 'luminary', label: 'Luminary' },
    { id: 'bowl', label: 'Bowl' },
    { id: 'canoe', label: 'Canoe' },
    { id: 'plate', label: 'Plate' },
    { id: 'basin', label: 'Basin' },
    { id: 'rock', label: 'Rock' },
    { id: 'fountain', label: 'Fountain' },
    { id: 'sculpture', label: 'Sculpture' },
    { id: 'pillar', label: 'Pillar' },
    { id: 'ball', label: 'Ball' },
    { id: 'bag', label: 'Bag' },
    { id: 'wall-panel', label: 'Wall Panel' },
    { id: 'painted-wall-panel', label: 'Painted Wall Panel' },
    { id: 'mirror', label: 'Mirror' },
    { id: 'wine-rack', label: 'Wine Rack' },
    { id: 'table', label: 'Table' },
    { id: 'couch', label: 'Couch' },
    { id: 'bar', label: 'Bar' },
];

export interface CanonicalResult { id: CanonicalTypeId | null; label: string; holes?: number; personal: boolean }

/** Spellings that name each canonical Type (wine rack is matched by rule, not listed here). */
const ALIASES: ReadonlyArray<readonly [CanonicalTypeId, readonly string[]]> = [
    ['pendant', ['pendant', 'pendant lamp', 'pendant lamps', 'pendants']],
    ['table-lamp', ['table lamp', 'table lamps', 'lamp', 'lamps']],
    ['floor-lamp', ['floor lamp']],
    ['tower-lamp', ['tower lamp']],
    ['luminary', ['luminary']],
    ['bowl', ['bowl', 'bowls']],
    ['canoe', ['canoe', 'canoa']],
    ['plate', ['plate', 'plato', 'tray']],
    ['basin', ['basin']],
    ['rock', ['rock']],
    ['fountain', ['fountain', 'fountain set']],
    ['sculpture', ['sculpture', 'sculptures', 'sculptures set']],
    ['pillar', ['pillar']],
    ['ball', ['ball']],
    ['bag', ['bag']],
    ['wall-panel', ['wall panel', 'wall panels', 'panel pair', 'wall panel pair']],
    ['painted-wall-panel', ['painted wall panel']],
    ['mirror', ['mirror']],
    ['table', ['table', 'coffee table', 'cofee table', 'table set']],
    ['couch', ['v shaped couch', 'couch', 'sofa']],
    ['bar', ['bar']],
];

/** Normalised alias -> canonical id. */
const ALIAS_INDEX = new Map<string, CanonicalTypeId>();
for (const [id, names] of ALIASES) {
    for (const name of names) ALIAS_INDEX.set(squash(name), id);
}

const HOLES = /^(\d+)\s*holes?$/;
const PERSONAL = /^client\b/;

/** Trim, collapse spaces, fold accents, lower case. */
function squash(raw: string | null | undefined): string {
    return String(raw ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

/** Each word capitalised, the rest lower case. Accents kept. */
function titleCase(raw: string): string {
    return raw
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase())
        .join(' ');
}

function labelOf(id: CanonicalTypeId): string {
    return CANONICAL_TYPES.find(c => c.id === id)?.label ?? '';
}

function wineRack(holes?: number): CanonicalResult {
    return { id: 'wine-rack', label: 'Wine Rack', personal: false, ...(holes === undefined ? {} : { holes }) };
}

/**
 * The canonical Type of a row's Type text, read with its Shape.
 * @example canonicalType('pendant lamps') // { id: 'pendant', label: 'Pendant', personal: false }
 * @example canonicalType('2 holes', 'Rustic Wine Rack') // { id: 'wine-rack', label: 'Wine Rack', holes: 2, personal: false }
 * @example canonicalType('Client Ana', 'Basin') // { id: 'basin', label: 'Basin', personal: true }
 */
export function canonicalType(rawType: string | null | undefined, rawShape?: string | null): CanonicalResult {
    const t = squash(rawType);
    if (!t) return { id: null, label: '', personal: false };

    const shape = squash(rawShape);

    // A person's name is never shown. A basin keeps its real Type from the Shape.
    if (PERSONAL.test(t)) {
        return shape === 'basin'
            ? { id: 'basin', label: 'Basin', personal: true }
            : { id: null, label: '', personal: true };
    }

    const typeHoles = HOLES.exec(t);
    if (typeHoles) return wineRack(Number(typeHoles[1]));

    if (t.includes('wine rack') || shape.includes('wine rack')) {
        const shapeHoles = HOLES.exec(shape);
        return wineRack(shapeHoles ? Number(shapeHoles[1]) : undefined);
    }

    // A trailing plural folds onto its singular when only the singular is in the table.
    const id = ALIAS_INDEX.get(t) ?? (t.endsWith('s') ? ALIAS_INDEX.get(t.slice(0, -1)) : undefined);
    if (id) return { id, label: labelOf(id), personal: false };

    return { id: null, label: titleCase(String(rawType)), personal: false };
}

/**
 * The key a Type is compared and counted by: the canonical id when known, else the normalised raw text.
 * @example typeKey('pendant lamp') === typeKey('Pendant') // true
 */
export function typeKey(rawType: string | null | undefined, rawShape?: string | null): string {
    return canonicalType(rawType, rawShape).id ?? squash(rawType);
}

/** True for a Type that names a client ("client <name>"), in any case. */
export function isPersonalType(rawType: string | null | undefined): boolean {
    return PERSONAL.test(squash(rawType));
}

/*
 * Self-check (run by hand, no test framework). Input is (rawType, rawShape); output is the result.
 *
 *  #  rawType               rawShape            -> id          label                 holes  personal
 *  1  'Pendant Lamps'       -                   -> pendant     'Pendant'             -      false
 *  2  '  lamp '            -                   -> table-lamp  'Table Lamp'          -      false
 *  3  'Cofee  Table'        -                   -> table       'Table'               -      false
 *  4  '2 holes'             'Rustic Wine Rack'  -> wine-rack   'Wine Rack'           2      false
 *  5  'Wine Rack'           '6 holes'           -> wine-rack   'Wine Rack'           6      false
 *  6  'Client Ana'          'Basin'             -> basin       'Basin'               -      true
 *  7  'Client Ana'          'Chair'             -> null        ''                    -      true
 *  8  'Canoa'               -                   -> canoe       'Canoe'               -      false
 *  9  'Sofá'                -                   -> couch       'Couch'               -      false
 * 10  'Painted Wall Panel'  -                   -> painted-wall-panel  'Painted Wall Panel'  -  false
 * 11  'Panel Pair'          -                   -> wall-panel  'Wall Panel'          -      false
 * 12  'sofa bed'            -                   -> null        'Sofa Bed'            -      false
 */
