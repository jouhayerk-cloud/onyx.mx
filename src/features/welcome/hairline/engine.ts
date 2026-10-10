/**
 * The small engine behind the welcome page's hairline figures.
 *
 * The figures follow the ten rules of @lucasmarkes/hairline's hairline-create skill: the pointer is tested against the
 * rest pose (rule 1), motion spreads by distance (2), every reach is clamped (3), plates are opaque and painted back to
 * front (6), all motion sits in ONE shared loop that sleeps when nothing moves (7), a spring for the continuous pointer
 * and a 700 ms tween for discrete choices (8), solids are the hull of two rounded rings (9), and no words are drawn
 * inside a figure (10). The skill's kernel is not exported by the package, so this file re-implements the parts the
 * welcome figures need (the package's own figures are used as they are where one fits).
 */

// ── camera: Cam(45, 0.5, S), a 2:1 view ─────────────────────────────────────

export interface Cam { S: number; cx: number; cy: number }
export const VB_W = 400;
export const VB_H = 320;
const C = Math.SQRT1_2;       // cos 45 = sin 45
const KZ = 0.866;             // vertical scale of z (cos 30)

export const proj = (cam: Cam, x: number, y: number, z: number): [number, number] =>
    [cam.cx + cam.S * (x - y) * C, cam.cy + cam.S * ((x + y) * C * 0.5 - z * KZ)];

/** Where a point of the screen lies on the horizontal plane at height z. */
export const unproj = (cam: Cam, sx: number, sy: number, z = 0): [number, number] => {
    const rx = (sx - cam.cx) / cam.S;
    const ry = ((sy - cam.cy) / cam.S + KZ * z) / 0.5;
    return [(rx + ry) / (2 * C), (ry - rx) / (2 * C)];
};

/** Screen offset of a world move (dx, dy, dz). */
export const shift = (cam: Cam, dx: number, dy: number, dz: number): [number, number] =>
    [cam.S * (dx - dy) * C, cam.S * ((dx + dy) * C * 0.5 - dz * KZ)];

// ── geometry ────────────────────────────────────────────────────────────────

export type P2 = [number, number];

/** A rounded rectangle as a ring of points, four steps per corner (rule 9). */
export function ring(x0: number, y0: number, w: number, d: number, r: number, steps = 4): P2[] {
    const rr = Math.max(0, Math.min(r, w / 2, d / 2));
    if (rr === 0) return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + d], [x0, y0 + d]];
    const out: P2[] = [];
    const corner = (cx: number, cy: number, a0: number) => {
        for (let i = 0; i <= steps; i++) {
            const a = a0 + (Math.PI / 2) * (i / steps);
            out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
        }
    };
    corner(x0 + w - rr, y0 + rr, -Math.PI / 2);
    corner(x0 + w - rr, y0 + d - rr, 0);
    corner(x0 + rr, y0 + d - rr, Math.PI / 2);
    corner(x0 + rr, y0 + rr, Math.PI);
    return out;
}

/** Convex hull (monotone chain) of screen points. */
export function hull(points: P2[]): P2[] {
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: P2[] = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: P2[] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

const f = (n: number) => Math.round(n * 100) / 100;
export const pathOf = (pts: P2[], close = true): string =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('') + (close ? 'Z' : '');

export interface Solid { body: string; crease: string }

/** A rounded prism: its silhouette is the hull of the bottom and top rings, plus one dim crease along the top. */
export function prism(cam: Cam, x0: number, y0: number, z0: number, w: number, d: number, h: number, r: number): Solid {
    const base = ring(x0, y0, w, d, r);
    const bottom = base.map(([x, y]) => proj(cam, x, y, z0));
    const top = base.map(([x, y]) => proj(cam, x, y, z0 + h));
    return { body: pathOf(hull([...bottom, ...top])), crease: pathOf(top) };
}

/** A rectangle on the plane y = const (a face that looks to the left), or x = const (to the right). */
export const rectY = (cam: Cam, y: number, x0: number, x1: number, z0: number, z1: number): string =>
    pathOf([proj(cam, x0, y, z0), proj(cam, x1, y, z0), proj(cam, x1, y, z1), proj(cam, x0, y, z1)]);
export const rectX = (cam: Cam, x: number, y0: number, y1: number, z0: number, z1: number): string =>
    pathOf([proj(cam, x, y0, z0), proj(cam, x, y1, z0), proj(cam, x, y1, z1), proj(cam, x, y0, z1)]);

/** A circle standing on the plane y = const, as a polygon (a wheel seen from the left side). */
export function discY(cam: Cam, cx: number, y: number, cz: number, r: number, n = 20): string {
    const pts: P2[] = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(proj(cam, cx + r * Math.cos(a), y, cz + r * Math.sin(a)));
    }
    return pathOf(pts);
}

// ── falloff (rule 3): 1, then .31 at 42% of the radius, then .09 at the edge ─

export function falloff(distance: number, radius: number): number {
    const u = Math.abs(distance) / radius;
    if (u >= 1) return 0;
    if (u <= 0.42) return 1 + (0.31 - 1) * (u / 0.42);
    return 0.31 + (0.09 - 0.31) * ((u - 0.42) / 0.58);
}

// ── clocks (rule 8) ─────────────────────────────────────────────────────────

/** A continuous quantity that follows its target on a spring: k 100, c 18, m 1. */
export class Spring {
    x: number;
    v = 0;
    t: number;
    constructor(x = 0) { this.x = x; this.t = x; }
    step(dt: number): boolean {
        const a = 100 * (this.t - this.x) - 18 * this.v;
        this.v += a * dt;
        this.x += this.v * dt;
        if (Math.abs(this.t - this.x) < 0.002 && Math.abs(this.v) < 0.002) { this.x = this.t; this.v = 0; return false; }
        return true;
    }
}

/** cubic-bezier(.32, .72, 0, 1), the curve of every discrete change. */
function bezierY(t: number): number {
    const p1x = 0.32, p1y = 0.72, p2x = 0, p2y = 1;
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    let s = t;
    for (let i = 0; i < 6; i++) {
        const x = ((ax * s + bx) * s + cx) * s - t;
        const dx = (3 * ax * s + 2 * bx) * s + cx;
        if (Math.abs(dx) < 1e-6) break;
        s -= x / dx;
    }
    s = Math.min(1, Math.max(0, s));
    return ((ay * s + by) * s + cy) * s;
}

/** A discrete value (0 to 1) that glides to its target in 700 ms. */
export class Tween {
    from = 0;
    to = 0;
    value = 0;
    private elapsed = 700;
    set(target: number) {
        if (target === this.to) return;
        this.from = this.value;
        this.to = target;
        this.elapsed = 0;
    }
    step(dt: number): boolean {
        if (this.elapsed >= 700) return false;
        this.elapsed = Math.min(700, this.elapsed + dt * 1000);
        this.value = this.from + (this.to - this.from) * bezierY(this.elapsed / 700);
        return this.elapsed < 700;
    }
}

// ── the one loop (rule 7): it runs only while a figure reports motion ───────

type Tick = (dt: number) => boolean;
const ticks = new Set<Tick>();
let raf = 0;
let last = 0;

function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const t of Array.from(ticks)) if (!t(dt)) ticks.delete(t);
    if (ticks.size) raf = requestAnimationFrame(frame);
}

/** Start (or keep) calling `tick` every frame until it returns false. Safe to call on every pointer event. */
export function wake(tick: Tick): void {
    ticks.add(tick);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

export function sleep(tick: Tick): void { ticks.delete(tick); }
