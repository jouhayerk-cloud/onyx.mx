import { extractItemHexString } from './utils';
import { parseHexMapString } from './axonometric';
import { itemBandShades } from './canonicalColors';

// shortcut: cached per row object; DataSyncProvider keeps unchanged rows the same object, so a row is parsed once
// per revision. Fine for ~2k rows; revisit if rows stop being stable objects.
const cache = new WeakMap<object, string[]>();

/** An item's colour-bar shades (its hex map, else its canonical palette), the same ones every colour bar draws. */
export function itemShades(data: any): string[] {
    if (!data || typeof data !== 'object') return [];
    const hit = cache.get(data);
    if (hit) return hit;
    const shades = itemBandShades(parseHexMapString(extractItemHexString(data)), { color: data.color, material: data.material });
    cache.set(data, shades);
    return shades;
}

/** True when the shades come from the item's own hex map rather than the palette fallback. */
export const hasHexMap = (data: any) => !!extractItemHexString(data);
