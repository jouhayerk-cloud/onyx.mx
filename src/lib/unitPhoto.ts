/**
 * Which photo (0-based) label k of N shows: lamps with a lights-on/off pair per unit use the lights-on photo
 * (2*(k-1)), everything else photo order (k-1). Kept jsPDF-free so UI code can share it with the PDF labels.
 */
export function unitPhotoIndex(k: number, n: number, photoCount: number, isLamp: boolean): number {
    // Lamp photos are stored in pairs per unit (2026-11-25): [lamp1 on, lamp1 off, lamp2 on, lamp2 off, ...].
    // Use unit k's lights-on photo (1st, 3rd, 5th ...); past the last pair, fall back to photo order.
    if (isLamp && photoCount >= 2) {
        const on = 2 * (k - 1);
        return on < photoCount ? on : k - 1;
    }
    return k - 1;
}
console.assert(unitPhotoIndex(1, 2, 4, true) === 0 && unitPhotoIndex(2, 2, 4, true) === 2 && unitPhotoIndex(2, 2, 3, true) === 2 && unitPhotoIndex(3, 3, 6, true) === 4 && unitPhotoIndex(2, 2, 4, false) === 1 && unitPhotoIndex(1, 1, 1, true) === 0, 'unitPhotoIndex');
