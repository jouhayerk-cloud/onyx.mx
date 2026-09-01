/**
 * smartFilters.ts
 *
 * Auto-generated, nested attribute filters for Inventory.
 *
 * Two live hierarchies:
 *
 *     Geometry (classifyGeometry, 8 bounded values)  ->  free-text shape/type
 *     Material                                       ->  Color
 *
 * The first shipped as Type (short_description) -> Shape, both free text. That
 * failed for a structural reason, not a cosmetic one: `short_description` as
 * the PARENT is not a bounded set — it's dozens of near-duplicate strings
 * typed by several people in two languages, so the top of the hierarchy was
 * itself a wall of chips before a single child ever expanded. Heading it with
 * classifyGeometry() (lib/geometry.ts) instead bounds the parent to eight
 * fixed values that already have a rendered icon each, and demotes the free
 * text — still useful, just not fit to be a top-level chip — to a child.
 * Material -> Color keeps its original shape: Material is already a
 * reasonably bounded vocabulary, so it didn't have this problem.
 *
 * Selection encoding is a single flat Set of keys:
 *
 *     "Bowl"          — the whole type, every shape inside it
 *     "Bowl>Round"    — one shape within a type
 *
 * A flat Set rather than a nested structure keeps the atom trivially
 * serialisable for atomWithStorage, and makes "is this row included?" a pair of
 * Set lookups instead of a tree walk per row across 500 rows.
 */

import { classifyItem, GEOMETRIES, GEOMETRY_LABELS, type Geometry } from './geometry';

export interface SmartFilterChild {
    label: string;
    count: number;
    /** Fully-qualified selection key, e.g. "Bowl>Round". */
    key: string;
}

export interface SmartFilterNode {
    label: string;
    count: number;
    /** Selection key for the whole branch, e.g. "Bowl". */
    key: string;
    children: SmartFilterChild[];
}

/** Canonical display form. Mirrors the database's inventory_normalise_type(). */
export const canonical = (raw: unknown): string => {
    const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!s || s === '-' || s.toUpperCase() === 'NULL') return '';
    return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
};

const readType = (d: any): string =>
    canonical(d?.shortDescription ?? d?.short_description ?? d?.itemType ?? d?.type);

const readMaterial = (d: any): string => canonical(d?.material);
const readColor = (d: any): string => canonical(d?.color);

/** Selection key for a parent/child pair. */
export const childKey = (parent: string, child: string) => `${parent}>${child}`;

/**
 * Builds one hierarchy. Rows missing the parent attribute are skipped rather
 * than bucketed under "Unknown": an empty bucket that cannot be acted on is
 * noise in a filter list, and the row is still reachable by every other filter.
 */
const buildTree = (
    rows: any[],
    parentOf: (d: any) => string,
    childOf: (d: any) => string,
): SmartFilterNode[] => {
    const parents = new Map<string, { count: number; children: Map<string, number> }>();

    for (const row of rows) {
        const d = row?.data ?? row;
        const p = parentOf(d);
        if (!p) continue;

        let node = parents.get(p);
        if (!node) { node = { count: 0, children: new Map() }; parents.set(p, node); }
        node.count += 1;

        const c = childOf(d);
        if (c) node.children.set(c, (node.children.get(c) ?? 0) + 1);
    }

    return Array.from(parents.entries())
        .map(([label, node]) => ({
            label,
            key: label,
            count: node.count,
            children: Array.from(node.children.entries())
                .map(([cl, cc]) => ({ label: cl, count: cc, key: childKey(label, cl) }))
                // Within a branch, order by frequency then alphabetically: the
                // common shapes surface first, which is how they are picked.
                .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

/* buildTypeShapeTree / rowMatchesTypeShape lived here and were removed once
 * the geometry-headed bar replaced them. They took the hierarchy's PARENT from
 * `short_description` free text, which reproduced the exact problem this
 * rework exists to fix: dozens of near-duplicate strings as top-level chips.
 * Bounding the top of the hierarchy — not restyling it — is the fix, and
 * buildGeometryTree below does that. */

export const buildMaterialColorTree = (rows: any[]): SmartFilterNode[] =>
    buildTree(rows, readMaterial, readColor);

/**
 * The free-text descriptor nested under a geometry bucket. `shape` is
 * preferred over `short_description` because it is usually the more specific
 * of the two ("Round Bowl" vs "Bowl"); short_description only stands in when
 * shape itself is blank, which happens throughout the older rows.
 */
const readShapeText = (d: any): string =>
    canonical(d?.shape) || readType(d);

/**
 * Shape hierarchy, headed by the eight bounded geometry classes from
 * geometry.ts instead of free text. This is the actual fix for the chaos
 * described when this file was first built: buildTypeShapeTree's PARENT was
 * `short_description`, unbounded free text typed by several people in two
 * languages, so the top of that hierarchy was itself dozens of near-duplicate
 * chips — restyling never had a chance against that. classifyGeometry()
 * collapses the same text into eight fixed values, so every one of the ~500
 * rows lands in exactly one of eight buckets, and the messy free text is
 * demoted to a CHILD (a sub-filter) instead of heading the list.
 *
 * Order is the fixed GEOMETRIES order, not frequency: a bounded taxonomy's
 * whole value is a stable set of chips (with a stable icon each) a user
 * learns to recognise. Sorting by count would reshuffle that set on every
 * data change for no benefit — there are only eight, so "most common first"
 * buys nothing a fixed order doesn't already give.
 */
export const buildGeometryTree = (rows: any[]): SmartFilterNode[] => {
    const buckets = new Map<Geometry, { count: number; children: Map<string, number> }>();
    for (const g of GEOMETRIES) buckets.set(g, { count: 0, children: new Map() });

    for (const row of rows) {
        const d = row?.data ?? row;
        const { geom } = classifyItem(d);
        const bucket = buckets.get(geom)!;
        bucket.count += 1;

        const child = readShapeText(d);
        if (child) bucket.children.set(child, (bucket.children.get(child) ?? 0) + 1);
    }

    return GEOMETRIES.map(g => {
        const label = GEOMETRY_LABELS[g];
        const bucket = buckets.get(g)!;
        return {
            label,
            key: label,
            count: bucket.count,
            children: Array.from(bucket.children.entries())
                .map(([cl, cc]) => ({ label: cl, count: cc, key: childKey(label, cl) }))
                .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
        };
    });
    // Every row is classified (classifyGeometry defaults to 'box'), so unlike
    // buildTree above, nothing is ever skipped here and all eight buckets are
    // always present — including at count 0, which is itself information: it
    // tells the user the vocabulary is bounded and complete, not that the
    // bucket doesn't exist yet.
};

/**
 * Does a row pass the selection?
 *
 * Empty selection means no constraint — a filter nobody has touched must not
 * hide anything. Otherwise a row matches if its own branch is selected, or if
 * its specific parent>child pair is.
 *
 * Selecting a parent and one of its children is treated as the parent: the
 * broader choice wins, so ticking "Bowl" after "Bowl>Round" widens rather than
 * silently contradicting itself.
 */
export const matchesSelection = (
    selected: string[] | undefined,
    parent: string,
    child: string,
): boolean => {
    if (!selected || selected.length === 0) return true;
    if (!parent) return false;
    const set = new Set(selected);
    if (set.has(parent)) return true;
    return child ? set.has(childKey(parent, child)) : false;
};

export const rowMatchesMaterialColor = (d: any, selected: string[] | undefined): boolean =>
    matchesSelection(selected, readMaterial(d), readColor(d));

/** Shape counterpart. The parent is the item's geometry LABEL rather than its
 *  raw class, because that label is what buildGeometryTree puts on the chip and
 *  therefore what a stored selection key holds — matching on the class would
 *  silently never hit. */
export const rowMatchesShape = (d: any, selected: string[] | undefined): boolean =>
    matchesSelection(selected, GEOMETRY_LABELS[classifyItem(d).geom], readShapeText(d));

/**
 * Toggling a parent clears its children. Leaving them behind would make the
 * chip count disagree with what is actually filtered, and re-selecting the
 * parent later would silently re-apply a narrower filter the user had removed.
 */
export const toggleKey = (selected: string[], key: string): string[] => {
    const set = new Set(selected);
    if (set.has(key)) {
        set.delete(key);
    } else {
        set.add(key);
        if (!key.includes('>')) {
            for (const k of Array.from(set)) {
                if (k.startsWith(`${key}>`)) set.delete(k);
            }
        } else {
            set.delete(key.split('>')[0]);
        }
    }
    return Array.from(set);
};
