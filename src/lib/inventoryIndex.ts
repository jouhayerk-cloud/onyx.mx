/**
 * O(1) row lookup over the inventory atom.
 *
 * Every logistics view resolves crate contents the same way:
 *
 *     crate.inventory_ids.split(',').forEach(entry => {
 *         const inv = allInventory.find(i => String(i.row) === entry.split(':')[0]);
 *     })
 *
 * — a linear scan of ~500 rows per packed item. TruckingModule's
 * getCrateDisplayName compounds it: it scans once per item in the crate, then
 * again per item of every *other* crate it compares against, and is itself
 * called once per crate being rendered. At 50 crates x 20 items x 500 rows that
 * is hundreds of millions of string comparisons in a single synchronous render.
 *
 * The index is memoised against the array's identity rather than rebuilt per
 * call, because the inventory atom hands out one stable array between syncs, so
 * a whole render pass shares a single build.
 *
 * Deliberately keyed on the array and not on a version counter: a WeakMap lets
 * the index die with the array it describes, so a stale inventory snapshot
 * cannot pin an index in memory.
 */

const indexCache = new WeakMap<object, Map<string, any>>();

function buildIndex(allInventory: any[]): Map<string, any> {
    const map = new Map<string, any>();
    for (const item of allInventory) {
        const key = String(item?.row);
        // First write wins, matching Array.prototype.find's "first match" semantics
        // in the (unexpected) case of duplicate row ids.
        if (!map.has(key)) map.set(key, item);
    }
    return map;
}

export function getInventoryRowIndex(allInventory: any[] | null | undefined): Map<string, any> {
    if (!Array.isArray(allInventory)) return new Map();
    let index = indexCache.get(allInventory);
    if (!index) {
        index = buildIndex(allInventory);
        indexCache.set(allInventory, index);
    }
    return index;
}

/**
 * Drop-in replacement for `allInventory.find(i => String(i.row) === id)`.
 * Same result, same `undefined` on miss.
 */
export function findInventoryByRow(allInventory: any[] | null | undefined, id: string): any | undefined {
    return getInventoryRowIndex(allInventory).get(String(id));
}
