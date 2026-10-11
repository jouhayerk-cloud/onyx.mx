/**
 * Clean suggestion source for Add Entry and attribute selectors.
 *
 * Provides deterministic, deduplicated, and canonically normalized suggestions
 * for inventory forms, types, materials, and colors.
 *
 * Pure TypeScript: strict, deterministic, zero I/O, no React runtime dependencies.
 */

import {
    canonicalForm,
    canonicalTypeId,
    canonicalMaterial,
    canonicalColour,
    canonicalVendorColour,
    classifyShapeValue,
    CANONICAL_TYPES,
    CANONICAL_COLOURS,
    CANONICAL_STONE_VARIETIES,
} from './inventoryTaxonomy';

export type SuggestField = 'shape' | 'type' | 'material' | 'color';

/**
 * Standard display spellings for geometric forms.
 */
const FORM_DISPLAY_NAMES: Readonly<Record<string, string>> = {
    'cylinder': 'Cylinder',
    'squared': 'Squared',
    'rectangular': 'Rectangular',
    'round': 'Round',
    'free-form': 'Free Form',
    'irregular': 'Irregular Border',
    'cube': 'Cube',
    'diamond': 'Diamond',
    'sphere': 'Sphere',
    'l-shaped': 'L-Shaped',
    's-shaped': 'S-Shaped',
};

/**
 * Standard display spellings for size bands.
 */
const SIZE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
    'mini': 'Mini',
    'small': 'Small',
    'medium': 'Medium',
    'large': 'Large',
};

/**
 * Standard display spellings for sculpture subjects.
 */
const SUBJECT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
    'horse': 'Horses',
    'elk': 'Elk',
    'deer': 'Deer',
    'moose': 'Moose',
    'bear': 'Bears',
    'cactus': 'Cactus',
    'bobcat': 'Bobcats',
    'climbers': 'Climbers',
    'flame': 'Flame',
    'venus': 'Venus',
};

/**
 * Capitalises each word, leaves the rest lower-case.
 */
function titleCase(raw: string): string {
    return raw
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/** Words that make a two-word value a colour or a stone variety ("Green Talan", "Orange Cosmic"), never a person: the canonical colours and varieties plus the vendor words that are not in them. */
const COLOUR_WORDS: ReadonlySet<string> = new Set(
    [...CANONICAL_COLOURS, ...CANONICAL_STONE_VARIETIES, 'Amber', 'Assorted', 'Colors', 'Colours', 'Pearl', 'Argentina']
        .flatMap(v => v.toLowerCase().split(/[ \/-]+/)),
);

/**
 * Checks whether a raw value represents a client or personal name.
 * Matches values starting with "Client " or two capitalised words with no taxonomy match,
 * keeping the value only if it is a known colour, variety, form, or type.
 */
function isPersonName(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;

    // Starts with "Client "
    if (/^client\b/i.test(trimmed)) {
        return true;
    }

    // Pattern for two capitalised words (e.g. "Laura McNabb", "Sandy Levits")
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(trimmed)) {
        // Kept ONLY if it is a known colour, stone variety, form, or type
        if (trimmed.toLowerCase().split(' ').some(w => COLOUR_WORDS.has(w))) return false;
        if (canonicalForm(trimmed) !== null) return false;
        if (canonicalTypeId(trimmed) !== null) return false;
        const cls = classifyShapeValue(trimmed);
        if (cls.kind !== 'unknown') return false;

        return true;
    }

    return false;
}

/**
 * Cleans a list of suggestions for a given field:
 * - Maps each raw value to its canonical display label using taxonomy functions
 * - Keeps "Squared Open Top" and "Squared Closed Top" as separate canonical values for shape
 * - Removes duplicates keeping the FIRST occurrence
 * - Drops empty values and personal/client names
 * - Keeps unknown values as typed (trimmed)
 */
export function cleanSuggestions(field: SuggestField, values: readonly string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const raw of values) {
        if (!raw || !raw.trim()) continue;
        const trimmed = raw.trim();

        if (isPersonName(trimmed)) continue;

        let label: string;

        switch (field) {
            case 'shape': {
                const cls = classifyShapeValue(trimmed);
                if (cls.kind === 'form' && cls.value) {
                    const baseForm = FORM_DISPLAY_NAMES[cls.value] ?? titleCase(cls.value);
                    if (cls.top === 'open') {
                        label = `${baseForm} Open Top`;
                    } else if (cls.top === 'closed') {
                        label = `${baseForm} Closed Top`;
                    } else {
                        label = baseForm;
                    }
                } else if (cls.kind === 'size' && cls.value) {
                    label = SIZE_DISPLAY_NAMES[cls.value] ?? titleCase(cls.value);
                } else if (cls.kind === 'subject' && cls.value) {
                    label = SUBJECT_DISPLAY_NAMES[cls.value] ?? titleCase(cls.value);
                } else if (cls.kind === 'type' && cls.value) {
                    const typeObj = CANONICAL_TYPES.find(t => t.id === cls.value);
                    label = typeObj ? typeObj.english : titleCase(cls.value);
                } else {
                    label = trimmed;
                }
                break;
            }

            case 'type': {
                const typeId = canonicalTypeId(trimmed);
                if (typeId) {
                    const typeObj = CANONICAL_TYPES.find(t => t.id === typeId);
                    label = typeObj ? typeObj.english : titleCase(trimmed);
                } else {
                    label = titleCase(trimmed);
                }
                break;
            }

            case 'material': {
                const mat = canonicalMaterial(trimmed);
                label = mat ?? titleCase(trimmed);
                break;
            }

            case 'color': {
                const cleaned = trimmed.replace(/-/g, ' ');
                const canon = canonicalVendorColour(trimmed) ?? canonicalVendorColour(cleaned);
                label = canon ?? titleCase(cleaned);
                break;
            }
        }

        if (!label || !label.trim() || isPersonName(label)) continue;

        const key = label.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        result.push(label);
    }

    return result;
}
