/**
 * smartFilters.ts
 *
 * Auto-generated, nested attribute filters for Inventory.
 *
 * Two hierarchies, both derived from the data rather than configured:
 *
 *     Type (short_description)  ->  Shape
 *     Material                  ->  Color
 *
 * Why these pairings: UnifiedInventoryView already filtered on a combined
 * `shape + short_description` and `color + material` string, which is the same
 * relationship expressed flatly. Flattening lost the containment — "Bowl" and
 * "Round Bowl" became unrelated strings — so a user could not select a type and
 * see every shape within it. Nesting restores that, and the counts make the
 * distribution visible while choosing.
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

const readShape = (d: any): string => canonical(d?.shape);
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

export const buildTypeShapeTree = (rows: any[]): SmartFilterNode[] =>
    buildTree(rows, readType, readShape);

export const buildMaterialColorTree = (rows: any[]): SmartFilterNode[] =>
    buildTree(rows, readMaterial, readColor);

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

export const rowMatchesTypeShape = (d: any, selected: string[] | undefined): boolean =>
    matchesSelection(selected, readType(d), readShape(d));

export const rowMatchesMaterialColor = (d: any, selected: string[] | undefined): boolean =>
    matchesSelection(selected, readMaterial(d), readColor(d));

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
