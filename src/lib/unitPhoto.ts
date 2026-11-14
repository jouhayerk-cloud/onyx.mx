/**
 * Which photo (0-based) label k of N shows: lamps with a lights-off/on pair per unit use the lights-on photo
 * (2*(k-1)+1), everything else photo order (k-1). Kept jsPDF-free so UI code can share it with the PDF labels.
 */
export function unitPhotoIndex(k: number, n: number, photoCount: number, isLamp: boolean): number {
    // Lamp photos are stored in pairs per unit: [lamp1 off, lamp1 on, lamp2 off, lamp2 on, ...].
    // Use unit k's lights-on photo (2, 4, ...), else that unit's lights-off one when the "on" shot is missing.
    if (isLamp && photoCount >= 2) {
        const on = 2 * (k - 1) + 1;
        return on < photoCount ? on : 2 * (k - 1);
    }
    return k - 1;
}
console.assert(unitPhotoIndex(1, 2, 4, true) === 1 && unitPhotoIndex(2, 2, 4, true) === 3 && unitPhotoIndex(2, 2, 3, true) === 2 && unitPhotoIndex(3, 3, 6, true) === 5 && unitPhotoIndex(2, 2, 4, false) === 1 && unitPhotoIndex(1, 1, 1, true) === 0, 'unitPhotoIndex');
