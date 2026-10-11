import { type Dims, type FigurePart } from '../types';
import {
    type Cam,
    type P2,
    proj,
    pathOf,
    discY,
} from '../../../welcome/hairline/engine';

/** Median/typical fallback dimensions in cm per painted wall panel subject. */
export const PAINTED_PANEL_DEFAULTS: Record<string, Dims> = {
    'horse':    { w: 166, h: 75, d: 10 },
    'elk':      { w: 175, h: 80, d: 10 },
    'deer':     { w: 160, h: 70, d: 10 },
    'moose':    { w: 180, h: 85, d: 10 },
    'bear':     { w: 155, h: 75, d: 10 },
    'bobcat':   { w: 150, h: 68, d: 10 },
    'climbers': { w: 190, h: 90, d: 10 },
};

// ── silhouette builders (stylised hairline outlines on the panel face) ─────

/**
 * Horse silhouette: arched neck, flowing tail, trotting legs, alert ears.
 * Drawn in the panel front face plane y = d.
 */
export function buildHorseSilhouette(cam: Cam, w: number, h: number, d: number): FigurePart[] {
    const borderX = Math.max(1.8, w * 0.08);
    const borderZ = Math.max(1.5, h * 0.12);
    const cx = w / 2;
    const cz = h / 2;
    const sx = (w - 2 * borderX) * 0.42;
    const sz = (h - 2 * borderZ) * 0.40;
    const pt = (u: number, v: number): P2 => proj(cam, cx + u * sx, d, cz + v * sz);

    const ground = pathOf([pt(-0.85, -0.85), pt(0.85, -0.85)], false);

    const bodyOutline = pathOf([
        pt(0.24, -0.85),
        pt(0.22, -0.42),
        pt(0.28, -0.05),
        pt(0.35, 0.22),
        pt(0.42, 0.42),
        pt(0.52, 0.44),
        pt(0.58, 0.52),
        pt(0.48, 0.62),
        pt(0.36, 0.72),
        pt(0.34, 0.85),
        pt(0.30, 0.75),
        pt(0.18, 0.68),
        pt(0.06, 0.50),
        pt(-0.02, 0.38),
        pt(-0.18, 0.28),
        pt(-0.38, 0.35),
        pt(-0.52, 0.25),
        pt(-0.68, 0.05),
        pt(-0.72, -0.35),
        pt(-0.60, -0.45),
        pt(-0.58, -0.15),
        pt(-0.48, -0.12),
        pt(-0.52, -0.45),
        pt(-0.50, -0.85),
        pt(-0.40, -0.10),
        pt(-0.15, -0.15),
        pt(0.10, -0.12),
        pt(0.18, -0.18),
        pt(0.24, -0.85),
    ], false);

    const legFrontFar = pathOf([pt(0.34, -0.05), pt(0.38, -0.40), pt(0.42, -0.82)], false);
    const legRearFar = pathOf([pt(-0.35, -0.12), pt(-0.38, -0.45), pt(-0.36, -0.82)], false);
    const mane = pathOf([pt(0.28, 0.72), pt(0.20, 0.62), pt(0.10, 0.48), pt(0.02, 0.36)], false);

    const eyeR = Math.min(w, h) * 0.012;
    const eye = discY(cam, cx + 0.40 * sx, d, cz + 0.58 * sz, eyeR, 8);

    return [
        { d: ground, kind: 'crease' },
        { d: bodyOutline, kind: 'crease' },
        { d: legFrontFar, kind: 'crease' },
        { d: legRearFar, kind: 'crease' },
        { d: mane, kind: 'crease' },
        { d: eye, kind: 'bright' },
    ];
}

/**
 * Elk silhouette: large branching rack of antlers, shaggy dewlap mane, tall slender legs.
 */
export function buildElkSilhouette(cam: Cam, w: number, h: number, d: number): FigurePart[] {
    const borderX = Math.max(1.8, w * 0.08);
    const borderZ = Math.max(1.5, h * 0.12);
    const cx = w / 2;
    const cz = h / 2;
    const sx = (w - 2 * borderX) * 0.42;
    const sz = (h - 2 * borderZ) * 0.40;
    const pt = (u: number, v: number): P2 => proj(cam, cx + u * sx, d, cz + v * sz);

    const ground = pathOf([pt(-0.85, -0.85), pt(0.85, -0.85)], false);

    const bodyOutline = pathOf([
        pt(0.20, -0.85),
        pt(0.19, -0.42),
        pt(0.22, -0.05),
        pt(0.26, 0.12),
        pt(0.32, 0.28),
        pt(0.40, 0.35),
        pt(0.55, 0.42),
        pt(0.38, 0.52),
        pt(0.28, 0.55),
        pt(0.15, 0.48),
        pt(0.02, 0.38),
        pt(-0.20, 0.32),
        pt(-0.42, 0.36),
        pt(-0.55, 0.28),
        pt(-0.50, 0.05),
        pt(-0.54, -0.42),
        pt(-0.52, -0.85),
        pt(-0.35, -0.12),
        pt(-0.10, -0.14),
        pt(0.14, -0.12),
        pt(0.18, -0.22),
        pt(0.20, -0.85),
    ], false);

    // Branching antler beam and tines
    const antlerBeam = pathOf([
        pt(0.28, 0.55),
        pt(0.18, 0.72),
        pt(0.02, 0.88),
        pt(-0.18, 0.95),
        pt(-0.38, 0.92),
    ], false);
    const browTine = pathOf([pt(0.26, 0.58), pt(0.38, 0.70)], false);
    const bezTine = pathOf([pt(0.20, 0.68), pt(0.28, 0.82)], false);
    const trezTine = pathOf([pt(0.10, 0.80), pt(0.16, 0.94)], false);
    const crownTine1 = pathOf([pt(-0.08, 0.92), pt(-0.06, 0.99)], false);
    const crownTine2 = pathOf([pt(-0.28, 0.94), pt(-0.25, 0.99)], false);

    const legFrontFar = pathOf([pt(0.30, -0.05), pt(0.32, -0.42), pt(0.32, -0.85)], false);
    const legRearFar = pathOf([pt(-0.38, 0.0), pt(-0.40, -0.42), pt(-0.40, -0.85)], false);

    const eyeR = Math.min(w, h) * 0.012;
    const eye = discY(cam, cx + 0.36 * sx, d, cz + 0.48 * sz, eyeR, 8);

    return [
        { d: ground, kind: 'crease' },
        { d: bodyOutline, kind: 'crease' },
        { d: antlerBeam, kind: 'crease' },
        { d: browTine, kind: 'crease' },
        { d: bezTine, kind: 'crease' },
        { d: trezTine, kind: 'crease' },
        { d: crownTine1, kind: 'crease' },
        { d: crownTine2, kind: 'crease' },
        { d: legFrontFar, kind: 'crease' },
        { d: legRearFar, kind: 'crease' },
        { d: eye, kind: 'bright' },
    ];
}

/**
 * Deer silhouette: graceful posture, small upright multi-point antlers, delicate legs, upturned tail.
 */
export function buildDeerSilhouette(cam: Cam, w: number, h: number, d: number): FigurePart[] {
    const borderX = Math.max(1.8, w * 0.08);
    const borderZ = Math.max(1.5, h * 0.12);
    const cx = w / 2;
    const cz = h / 2;
    const sx = (w - 2 * borderX) * 0.42;
    const sz = (h - 2 * borderZ) * 0.40;
    const pt = (u: number, v: number): P2 => proj(cam, cx + u * sx, d, cz + v * sz);

    const ground = pathOf([pt(-0.85, -0.85), pt(0.85, -0.85)], false);

    const bodyOutline = pathOf([
        pt(0.18, -0.85),
        pt(0.17, -0.40),
        pt(0.20, -0.05),
        pt(0.25, 0.25),
        pt(0.32, 0.48),
        pt(0.40, 0.52),
        pt(0.50, 0.58),
        pt(0.38, 0.65),
        pt(0.26, 0.82),
        pt(0.22, 0.70),
        pt(0.15, 0.52),
        pt(0.02, 0.32),
        pt(-0.18, 0.24),
        pt(-0.38, 0.30),
        pt(-0.52, 0.42),
        pt(-0.48, 0.28),
        pt(-0.48, -0.38),
        pt(-0.44, -0.85),
        pt(-0.30, -0.08),
        pt(-0.08, -0.10),
        pt(0.12, -0.08),
        pt(0.18, -0.85),
    ], false);

    const antlerBeam = pathOf([pt(0.34, 0.66), pt(0.38, 0.85), pt(0.46, 0.95)], false);
    const antlerTine1 = pathOf([pt(0.36, 0.75), pt(0.28, 0.88)], false);
    const antlerTine2 = pathOf([pt(0.40, 0.85), pt(0.34, 0.96)], false);

    const legFrontFar = pathOf([pt(0.26, -0.05), pt(0.28, -0.40), pt(0.28, -0.85)], false);
    const legRearFar = pathOf([pt(-0.34, -0.05), pt(-0.36, -0.40), pt(-0.36, -0.85)], false);

    const eyeR = Math.min(w, h) * 0.012;
    const eye = discY(cam, cx + 0.36 * sx, d, cz + 0.60 * sz, eyeR, 8);

    return [
        { d: ground, kind: 'crease' },
        { d: bodyOutline, kind: 'crease' },
        { d: antlerBeam, kind: 'crease' },
        { d: antlerTine1, kind: 'crease' },
        { d: antlerTine2, kind: 'crease' },
        { d: legFrontFar, kind: 'crease' },
        { d: legRearFar, kind: 'crease' },
        { d: eye, kind: 'bright' },
    ];
}

/**
 * Moose silhouette: broad palmate scoop antlers with finger tines, heavy shoulder hump, drooping snout, throat bell.
 */
export function buildMooseSilhouette(cam: Cam, w: number, h: number, d: number): FigurePart[] {
    const borderX = Math.max(1.8, w * 0.08);
    const borderZ = Math.max(1.5, h * 0.12);
    const cx = w / 2;
    const cz = h / 2;
    const sx = (w - 2 * borderX) * 0.42;
    const sz = (h - 2 * borderZ) * 0.40;
    const pt = (u: number, v: number): P2 => proj(cam, cx + u * sx, d, cz + v * sz);

    const ground = pathOf([pt(-0.85, -0.85), pt(0.85, -0.85)], false);

    const bodyOutline = pathOf([
        pt(0.18, -0.85),
        pt(0.18, -0.40),
        pt(0.20, 0.0),
        pt(0.25, 0.12),
        pt(0.26, -0.05),
        pt(0.30, -0.02),
        pt(0.32, 0.18),
        pt(0.40, 0.25),
        pt(0.58, 0.32),
        pt(0.54, 0.42),
        pt(0.35, 0.48),
        pt(0.24, 0.50),
        pt(0.12, 0.42),
        pt(-0.05, 0.46),
        pt(-0.25, 0.32),
        pt(-0.46, 0.30),
        pt(-0.54, 0.24),
        pt(-0.48, 0.05),
        pt(-0.52, -0.38),
        pt(-0.48, -0.85),
        pt(-0.35, -0.08),
        pt(-0.10, -0.06),
        pt(0.12, -0.04),
        pt(0.18, -0.85),
    ], false);

    // Palmate shovel antler with finger points along top rim
    const palmOutline = pathOf([
        pt(0.24, 0.50),
        pt(0.18, 0.62),
        pt(0.22, 0.72),
        pt(0.14, 0.78),
        pt(0.08, 0.85),
        pt(-0.02, 0.88),
        pt(-0.12, 0.92),
        pt(-0.24, 0.90),
        pt(-0.35, 0.85),
        pt(-0.42, 0.75),
        pt(-0.38, 0.65),
        pt(-0.24, 0.58),
        pt(0.05, 0.52),
        pt(0.24, 0.50),
    ], true);

    const palmCrease = pathOf([pt(0.08, 0.55), pt(-0.10, 0.72), pt(-0.28, 0.75)], false);
    const legFrontFar = pathOf([pt(0.28, 0.0), pt(0.30, -0.40), pt(0.30, -0.85)], false);
    const legRearFar = pathOf([pt(-0.38, 0.02), pt(-0.40, -0.38), pt(-0.40, -0.85)], false);

    const eyeR = Math.min(w, h) * 0.012;
    const eye = discY(cam, cx + 0.36 * sx, d, cz + 0.42 * sz, eyeR, 8);

    return [
        { d: ground, kind: 'crease' },
        { d: bodyOutline, kind: 'crease' },
        { d: palmOutline, kind: 'crease' },
        { d: palmCrease, kind: 'crease' },
        { d: legFrontFar, kind: 'crease' },
        { d: legRearFar, kind: 'crease' },
        { d: eye, kind: 'bright' },
    ];
}

/**
 * Bear silhouette: heavy, low, massive shoulder hump, rounded ears, deep belly, broad paws.
 */
export function buildBearSilhouette(cam: Cam, w: number, h: number, d: number): FigurePart[] {
    const borderX = Math.max(1.8, w * 0.08);
    const borderZ = Math.max(1.5, h * 0.12);
    const cx = w / 2;
    const cz = h / 2;
    const sx = (w - 2 * borderX) * 0.42;
    const sz = (h - 2 * borderZ) * 0.40;
    const pt = (u: number, v: number): P2 => proj(cam, cx + u * sx, d, cz + v * sz);

    const ground = pathOf([pt(-0.85, -0.85), pt(0.85, -0.85)], false);

    const bodyOutline = pathOf([
        pt(0.28, -0.85),
        pt(0.25, -0.45),
        pt(0.30, -0.15),
        pt(0.38, 0.05),
        pt(0.48, 0.12),
        pt(0.58, 0.18),
        pt(0.55, 0.28),
        pt(0.42, 0.32),
        pt(0.34, 0.42),
        pt(0.28, 0.36),
        pt(0.18, 0.38),
        pt(0.02, 0.44),
        pt(-0.20, 0.38),
        pt(-0.46, 0.35),
        pt(-0.62, 0.22),
        pt(-0.60, 0.15),
        pt(-0.52, -0.15),
        pt(-0.56, -0.50),
        pt(-0.50, -0.85),
        pt(-0.38, -0.32),
        pt(-0.15, -0.35),
        pt(0.10, -0.30),
        pt(0.20, -0.35),
        pt(0.28, -0.85),
    ], false);

    const legFrontFar = pathOf([pt(0.40, -0.18), pt(0.42, -0.50), pt(0.42, -0.85)], false);
    const legRearFar = pathOf([pt(-0.38, -0.22), pt(-0.40, -0.52), pt(-0.38, -0.85)], false);
    const shoulderCrease = pathOf([pt(0.05, 0.35), pt(0.15, 0.10), pt(0.22, -0.10)], false);

    const eyeR = Math.min(w, h) * 0.012;
    const eye = discY(cam, cx + 0.42 * sx, d, cz + 0.25 * sz, eyeR, 8);

    return [
        { d: ground, kind: 'crease' },
        { d: bodyOutline, kind: 'crease' },
        { d: legFrontFar, kind: 'crease' },
        { d: legRearFar, kind: 'crease' },
        { d: shoulderCrease, kind: 'crease' },
        { d: eye, kind: 'bright' },
    ];
}

/**
 * Bobcat silhouette: low feline crouch, tufted triangular ears, flared cheek ruffs, short bobbed tail.
 */
export function buildBobcatSilhouette(cam: Cam, w: number, h: number, d: number): FigurePart[] {
    const borderX = Math.max(1.8, w * 0.08);
    const borderZ = Math.max(1.5, h * 0.12);
    const cx = w / 2;
    const cz = h / 2;
    const sx = (w - 2 * borderX) * 0.42;
    const sz = (h - 2 * borderZ) * 0.40;
    const pt = (u: number, v: number): P2 => proj(cam, cx + u * sx, d, cz + v * sz);

    const ground = pathOf([pt(-0.85, -0.85), pt(0.85, -0.85)], false);

    const bodyOutline = pathOf([
        pt(0.26, -0.85),
        pt(0.24, -0.48),
        pt(0.28, -0.18),
        pt(0.36, -0.05),
        pt(0.48, 0.05),
        pt(0.44, 0.15),
        pt(0.54, 0.18),
        pt(0.50, 0.26),
        pt(0.40, 0.28),
        pt(0.36, 0.46),
        pt(0.30, 0.48),
        pt(0.26, 0.35),
        pt(0.16, 0.28),
        pt(0.04, 0.32),
        pt(-0.15, 0.24),
        pt(-0.36, 0.28),
        pt(-0.52, 0.25),
        pt(-0.62, 0.36),
        pt(-0.65, 0.30),
        pt(-0.56, 0.18),
        pt(-0.48, -0.08),
        pt(-0.54, -0.46),
        pt(-0.48, -0.85),
        pt(-0.36, -0.22),
        pt(-0.12, -0.24),
        pt(0.14, -0.22),
        pt(0.20, -0.32),
        pt(0.26, -0.85),
    ], false);

    const legFrontFar = pathOf([pt(0.36, -0.18), pt(0.38, -0.50), pt(0.38, -0.85)], false);
    const legRearFar = pathOf([pt(-0.38, -0.15), pt(-0.40, -0.48), pt(-0.38, -0.85)], false);
    const tuftCrease = pathOf([pt(0.33, 0.47), pt(0.35, 0.55)], false);

    const eyeR = Math.min(w, h) * 0.012;
    const eye = discY(cam, cx + 0.40 * sx, d, cz + 0.22 * sz, eyeR, 8);

    return [
        { d: ground, kind: 'crease' },
        { d: bodyOutline, kind: 'crease' },
        { d: legFrontFar, kind: 'crease' },
        { d: legRearFar, kind: 'crease' },
        { d: tuftCrease, kind: 'crease' },
        { d: eye, kind: 'bright' },
    ];
}

/**
 * Climbers silhouette: steep rock face with two stylized figures scaling a cliff ledge, connected by a rope.
 */
export function buildClimbersSilhouette(cam: Cam, w: number, h: number, d: number): FigurePart[] {
    const borderX = Math.max(1.8, w * 0.08);
    const borderZ = Math.max(1.5, h * 0.12);
    const cx = w / 2;
    const cz = h / 2;
    const sx = (w - 2 * borderX) * 0.42;
    const sz = (h - 2 * borderZ) * 0.40;
    const pt = (u: number, v: number): P2 => proj(cam, cx + u * sx, d, cz + v * sz);

    // Jagged cliff ledge running diagonally across the face
    const ledge = pathOf([
        pt(-0.85, -0.80),
        pt(-0.50, -0.55),
        pt(-0.25, -0.40),
        pt(0.05, -0.10),
        pt(0.35, 0.25),
        pt(0.65, 0.65),
        pt(0.85, 0.85),
    ], false);

    const crag1 = pathOf([pt(-0.25, -0.40), pt(-0.15, -0.65)], false);
    const crag2 = pathOf([pt(0.35, 0.25), pt(0.48, 0.05)], false);

    // Lead climber (higher up)
    const climber1Body = pathOf([pt(0.20, 0.28), pt(0.28, 0.42)], false);
    const climber1Arms = pathOf([pt(0.26, 0.40), pt(0.36, 0.58), pt(0.42, 0.56)], false);
    const climber1Legs = pathOf([pt(0.20, 0.28), pt(0.12, 0.22), pt(0.16, 0.12)], false);
    const head1 = discY(cam, cx + 0.32 * sx, d, cz + 0.48 * sz, Math.min(w, h) * 0.016, 8);

    // Second climber (belaying below on a stance)
    const climber2Body = pathOf([pt(-0.38, -0.32), pt(-0.32, -0.18)], false);
    const climber2Arms = pathOf([pt(-0.33, -0.20), pt(-0.25, -0.18)], false);
    const climber2Legs = pathOf([pt(-0.38, -0.32), pt(-0.42, -0.48)], false);
    const head2 = discY(cam, cx - 0.30 * sx, d, cz - 0.12 * sz, Math.min(w, h) * 0.016, 8);

    // Connecting dynamic rope line
    const rope = pathOf([
        pt(0.22, 0.30),
        pt(0.02, 0.05),
        pt(-0.15, -0.18),
        pt(-0.34, -0.25),
    ], false);

    const beacon = discY(cam, cx + 0.42 * sx, d, cz + 0.58 * sz, Math.min(w, h) * 0.014, 8);

    return [
        { d: ledge, kind: 'crease' },
        { d: crag1, kind: 'crease' },
        { d: crag2, kind: 'crease' },
        { d: climber1Body, kind: 'crease' },
        { d: climber1Arms, kind: 'crease' },
        { d: climber1Legs, kind: 'crease' },
        { d: head1, kind: 'crease' },
        { d: climber2Body, kind: 'crease' },
        { d: climber2Arms, kind: 'crease' },
        { d: climber2Legs, kind: 'crease' },
        { d: head2, kind: 'crease' },
        { d: rope, kind: 'crease' },
        { d: beacon, kind: 'bright' },
    ];
}

/**
 * Dispatcher for painted wall panel animal/figure subjects.
 */
export function buildSubjectSilhouette(
    subject: string | null | undefined,
    cam: Cam,
    w: number,
    h: number,
    d: number,
): FigurePart[] {
    const s = (subject ?? '').toLowerCase().trim();
    switch (s) {
        case 'elk':
            return buildElkSilhouette(cam, w, h, d);
        case 'deer':
            return buildDeerSilhouette(cam, w, h, d);
        case 'moose':
            return buildMooseSilhouette(cam, w, h, d);
        case 'bear':
            return buildBearSilhouette(cam, w, h, d);
        case 'bobcat':
            return buildBobcatSilhouette(cam, w, h, d);
        case 'climbers':
            return buildClimbersSilhouette(cam, w, h, d);
        case 'horse':
        default:
            return buildHorseSilhouette(cam, w, h, d);
    }
}
