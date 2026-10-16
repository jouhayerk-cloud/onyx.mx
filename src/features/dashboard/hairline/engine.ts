/**
 * Hairline 3D Isometric & Axonometric Engine
 * Grounded in the mathematical foundation of @lucasmarkes/hairline.
 * 
 * Rules:
 * 1. Tested against rest pose.
 * 2. Motion spreads by distance with spring falloff.
 * 3. Every reach is clamped.
 * 4. All coordinates are pure mathematics; vector-effect="non-scaling-stroke".
 * 5. Full color multi-stop glowing gradients with specular neon highlights.
 * 6. Plates are opaque/translucent liquid glass, painted back-to-front.
 * 7. Unified requestAnimationFrame loop with automatic sleep when idle.
 * 8. Springs for continuous pointer tracking; tweens for discrete clicks/states.
 */

export interface Cam {
    S: number;   // Scale factor
    cx: number;  // Screen center X
    cy: number;  // Screen center Y
    pitch?: number; // Pitch angle in degrees (default 30)
    yaw?: number;   // Yaw angle in degrees (default 45)
}

export const VB_W = 400;
export const VB_H = 320;

const C = Math.SQRT1_2;       // cos 45 = sin 45 = 0.7071
const KZ = 0.8660254;         // cos 30 = sqrt(3)/2

export type P2 = [number, number];
export type P3 = [number, number, number];

/** Project 3D world coordinate (x, y, z) to 2D SVG canvas coordinate */
export const proj = (cam: Cam, x: number, y: number, z: number): P2 => [
    cam.cx + cam.S * (x - y) * C,
    cam.cy + cam.S * ((x + y) * C * 0.5 - z * KZ),
];

/** Inverse projection: Given screen (sx, sy) and horizontal plane z, return world (x, y) */
export const unproj = (cam: Cam, sx: number, sy: number, z = 0): P2 => {
    const rx = (sx - cam.cx) / cam.S;
    const ry = ((sy - cam.cy) / cam.S + KZ * z) / 0.5;
    return [(rx + ry) / (2 * C), (ry - rx) / (2 * C)];
};

/** Screen offset of a 3D displacement */
export const shift = (cam: Cam, dx: number, dy: number, dz: number): P2 => [
    cam.S * (dx - dy) * C,
    cam.S * ((dx + dy) * C * 0.5 - dz * KZ),
];

/** Rotate point (x, y, z) about an arbitrary origin and axis */
export function rotX(p: P3, angleRad: number, origin: P3 = [0, 0, 0]): P3 {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dy = p[1] - origin[1];
    const dz = p[2] - origin[2];
    return [
        p[0],
        origin[1] + dy * cos - dz * sin,
        origin[2] + dy * sin + dz * cos,
    ];
}

export function rotY(p: P3, angleRad: number, origin: P3 = [0, 0, 0]): P3 {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = p[0] - origin[0];
    const dz = p[2] - origin[2];
    return [
        origin[0] + dx * cos + dz * sin,
        p[1],
        origin[2] - dx * sin + dz * cos,
    ];
}

export function rotZ(p: P3, angleRad: number, origin: P3 = [0, 0, 0]): P3 {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = p[0] - origin[0];
    const dy = p[1] - origin[1];
    return [
        origin[0] + dx * cos - dy * sin,
        origin[1] + dx * sin + dy * cos,
        p[2],
    ];
}

/** 2D rounded rectangle as a ring of points */
export function ring(x0: number, y0: number, w: number, d: number, r: number, steps = 5): P2[] {
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

/** Convex hull algorithm (monotone chain) */
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

export interface Solid {
    body: string;
    crease: string;
}

/** Rounded 3D prism: silhouette hull of bottom & top rings + top crease */
export function prism(cam: Cam, x0: number, y0: number, z0: number, w: number, d: number, h: number, r: number): Solid {
    const base = ring(x0, y0, w, d, r);
    const bottom = base.map(([x, y]) => proj(cam, x, y, z0));
    const top = base.map(([x, y]) => proj(cam, x, y, z0 + h));
    return {
        body: pathOf(hull([...bottom, ...top])),
        crease: pathOf(top),
    };
}

/** Cylinder: disk at z0 and disk at z0+h with hull */
export function cylinder(cam: Cam, cx: number, cy: number, z0: number, r: number, h: number, steps = 24): Solid {
    const bottom: P2[] = [];
    const top: P2[] = [];
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        bottom.push(proj(cam, x, y, z0));
        top.push(proj(cam, x, y, z0 + h));
    }
    return {
        body: pathOf(hull([...bottom, ...top])),
        crease: pathOf(top),
    };
}

/** Rectangle on plane Y = const */
export const rectY = (cam: Cam, y: number, x0: number, x1: number, z0: number, z1: number): string =>
    pathOf([proj(cam, x0, y, z0), proj(cam, x1, y, z0), proj(cam, x1, y, z1), proj(cam, x0, y, z1)]);

/** Rectangle on plane X = const */
export const rectX = (cam: Cam, x: number, y0: number, y1: number, z0: number, z1: number): string =>
    pathOf([proj(cam, x, y0, z0), proj(cam, x, y1, z0), proj(cam, x, y1, z1), proj(cam, x, y0, z1)]);

/** Rectangle on plane Z = const (horizontal) */
export const rectZ = (cam: Cam, z: number, x0: number, x1: number, y0: number, y1: number): string =>
    pathOf([proj(cam, x0, y0, z), proj(cam, x1, y0, z), proj(cam, x1, y1, z), proj(cam, x0, y1, z)]);

/** Ellipse / disc on horizontal plane Z = const */
export function discZ(cam: Cam, cx: number, cy: number, z: number, rx: number, ry: number = rx, n = 24): string {
    const pts: P2[] = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(proj(cam, cx + rx * Math.cos(a), cy + ry * Math.sin(a), z));
    }
    return pathOf(pts);
}

/** Distance falloff curve */
export function falloff(distance: number, radius: number): number {
    const u = Math.abs(distance) / radius;
    if (u >= 1) return 0;
    if (u <= 0.42) return 1 + (0.31 - 1) * (u / 0.42);
    return 0.31 + (0.09 - 0.31) * ((u - 0.42) / 0.58);
}

/** Smooth spring physics class */
export class Spring {
    x: number;
    v = 0;
    t: number;
    k: number;
    c: number;
    m: number;

    constructor(x = 0, k = 100, c = 18, m = 1) {
        this.x = x;
        this.t = x;
        this.k = k;
        this.c = c;
        this.m = m;
    }

    step(dt: number): boolean {
        const a = (this.k * (this.t - this.x) - this.c * this.v) / this.m;
        this.v += a * dt;
        this.x += this.v * dt;
        if (Math.abs(this.t - this.x) < 0.002 && Math.abs(this.v) < 0.002) {
            this.x = this.t;
            this.v = 0;
            return false;
        }
        return true;
    }
}

/** Cubic Bezier ease (0.32, 0.72, 0, 1) */
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

/** Discrete tween runner */
export class Tween {
    from = 0;
    to = 0;
    value = 0;
    private elapsed = 700;
    private duration = 700;

    constructor(initial = 0, duration = 700) {
        this.from = initial;
        this.to = initial;
        this.value = initial;
        this.duration = duration;
    }

    set(target: number) {
        if (target === this.to) return;
        this.from = this.value;
        this.to = target;
        this.elapsed = 0;
    }

    step(dt: number): boolean {
        if (this.elapsed >= this.duration) return false;
        this.elapsed = Math.min(this.duration, this.elapsed + dt * 1000);
        this.value = this.from + (this.to - this.from) * bezierY(this.elapsed / this.duration);
        return this.elapsed < this.duration;
    }
}

/** Global unified animation loop */
type Tick = (dt: number) => boolean;
const ticks = new Set<Tick>();
let raf = 0;
let last = 0;

function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const t of Array.from(ticks)) {
        if (!t(dt)) ticks.delete(t);
    }
    if (ticks.size) raf = requestAnimationFrame(frame);
}

export function wake(tick: Tick): void {
    ticks.add(tick);
    if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }
}

export function sleep(tick: Tick): void {
    ticks.delete(tick);
}
