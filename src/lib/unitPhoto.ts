/**
 * Which photo (0-based) label k of N shows. Photos are stored in groups per unit, `perUnit` long:
 * lamps [on, off] (2), canoes [top view, side, side] (3), everything else one each (1). Each label takes its
 * unit's first photo (lights-on / top view). Kept jsPDF-free so UI code can share it with the PDF labels.
 */
export function unitPhotoIndex(k: number, n: number, photoCount: number, perUnit: number): number {
    // Past the last group (fewer photos than units x group), fall back to photo order.
    if (perUnit > 1 && photoCount >= 2) {
        const first = perUnit * (k - 1);
        return first < photoCount ? first : k - 1;
    }
    return k - 1;
}

/** Photos per unit from the item's kind text (shape, short description, type): canoes 3 (2026-11-25), lamps 2, else 1. */
export function photosPerUnit(kind: string, isLamp: boolean): number {
    return /canoe/i.test(kind) ? 3 : isLamp ? 2 : 1;
}

console.assert(unitPhotoIndex(1, 2, 4, 2) === 0 && unitPhotoIndex(2, 2, 4, 2) === 2 && unitPhotoIndex(2, 2, 3, 2) === 2 && unitPhotoIndex(3, 3, 6, 2) === 4 && unitPhotoIndex(2, 2, 4, 1) === 1 && unitPhotoIndex(1, 1, 1, 2) === 0
    && unitPhotoIndex(1, 7, 21, 3) === 0 && unitPhotoIndex(2, 7, 21, 3) === 3 && unitPhotoIndex(7, 7, 21, 3) === 18 && unitPhotoIndex(3, 3, 6, 3) === 2
    && photosPerUnit('Large Canoe', false) === 3 && photosPerUnit('Table Lamp', true) === 2, 'unitPhotoIndex');
