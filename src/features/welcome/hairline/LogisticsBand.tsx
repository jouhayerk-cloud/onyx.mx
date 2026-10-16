import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tr } from '../../../lib/i18n';
import { type Cam, VB_W, VB_H, prism, rectY, discY, pathOf, proj, unproj, falloff, Spring, Tween, wake, sleep, shift } from './engine';
import './logisticsBand.css';

/**
 * Logistics as a 3D Continuous Conveyor Band with Laser Inspection Arch.
 * Follows @lucasmarkes/hairline's `slow` and `riffle` architecture:
 * Conveyor belt runs with 6 full-color 3D cargo items.
 * Hovering slows the clock without stopping it, and lifts items on interactive Springs with falloff.
 */

const CAM: Cam = { S: 4.4, cx: 191, cy: 177 };

const CARGO = [
    { code: 'CRATE', name: tr('Boxes.py Birch Crate'), color: '#35d0a2', h: 9.0 },
    { code: 'ONYX', name: tr('Carved Onyx Stone Vessel'), color: '#00aeef', h: 11.5 },
    { code: 'PALLET', name: tr('Strapped Warehouse Pallet'), color: '#f2b53c', h: 6.5 },
    { code: 'POD', name: tr('Cold-Chain Sensor Pod'), color: '#b85bf8', h: 10.5 },
    { code: 'DRUM', name: tr('Sealed Drum Container'), color: '#10b981', h: 12.0 },
    { code: 'CARTON', name: tr('Dispatch Crate Package'), color: '#ff7a45', h: 8.5 },
] as const;

const N = CARGO.length;
const REST_RISE = Array.from({ length: N }, (_, i) => 0.4 + 1.0 * Math.abs(Math.sin(i * 1.7 + 0.4)));
const REST_BRIGHT = 0; // First crate as default rest focus
const HMAX = 8.5;
const STEP_MS = 40;

interface CargoGeometry {
    code: string;
    name: string;
    color: string;
    body: string;
    crease: string;
    lid: string;
    pivot: [number, number];
    gx: number;
}

interface Geometry {
    bed: { body: string; crease: string };
    railFront: { body: string; crease: string };
    railBack: { body: string; crease: string };
    rollers: string[];
    archLeft: { body: string; crease: string };
    archRight: { body: string; crease: string };
    archLintel: { body: string; crease: string };
    laserFan: string;
    cargo: CargoGeometry[];
    xMin: number;
    xMax: number;
    zMid: number;
}

let cached: Geometry | null = null;
function geometry(): Geometry {
    if (cached) return cached;

    // Conveyor chassis bed
    const bed = prism(CAM, -24, 0, 0, 72, 18, 3.8, 1.8);
    const railFront = prism(CAM, -24, 17.2, 3.6, 72, 1.4, 2.6, 0.4);
    const railBack = prism(CAM, -24, -0.6, 3.6, 72, 1.4, 2.6, 0.4);

    // Front rollers
    const rollerXs = [-18, -6, 6, 18, 30, 42];
    const rollers = rollerXs.map(x => discY(CAM, x, 18.2, 1.9, 1.7, 16));

    // Laser inspection arch straddling belt
    const archLeft = prism(CAM, 4.0, -1.8, 0, 3.4, 3.4, 22.0, 0.6);
    const archRight = prism(CAM, 4.0, 16.4, 0, 3.4, 3.4, 22.0, 0.6);
    const archLintel = prism(CAM, 3.6, -1.8, 22.0, 4.2, 21.6, 3.4, 0.8);
    const laserFan = pathOf([
        proj(CAM, 5.7, 0.5, 22.0),
        proj(CAM, 5.7, 17.5, 22.0),
        proj(CAM, 5.7, 17.5, 3.8),
        proj(CAM, 5.7, 0.5, 3.8),
    ]);

    // 6 Full-color cargo items along conveyor
    const x0 = -18.0;
    const x1 = 36.0;
    const pitch = (x1 - x0) / (N - 1);
    const yF = 2.4;
    const lenF = 13.2;
    const floorZ = 3.8;
    const t = 6.4;

    const cargo: CargoGeometry[] = CARGO.map((c, i) => {
        const x = x0 + i * pitch;
        const body = prism(CAM, x, yF, floorZ, t, lenF, c.h, 0.8);
        const lid = prism(CAM, x - 0.2, yF - 0.2, floorZ + c.h, t + 0.4, lenF + 0.4, 1.4, 0.6);
        const pivot = proj(CAM, x + t / 2, yF + lenF / 2, floorZ);

        return {
            code: c.code,
            name: c.name,
            color: c.color,
            body: body.body,
            crease: body.crease,
            lid: lid.body,
            pivot,
            gx: x + t / 2,
        };
    });

    cached = {
        bed,
        railFront,
        railBack,
        rollers,
        archLeft,
        archRight,
        archLintel,
        laserFan,
        cargo,
        xMin: x0 - 3,
        xMax: x1 + 8,
        zMid: floorZ + 5.0,
    };
    return cached;
}

export interface LogisticsBandProps {
    onOpen: () => void;
    onRead?: (text: string) => void;
    intensity?: number;
    focused?: boolean;
}

export const LogisticsBand: React.FC<LogisticsBandProps> = ({
    onOpen,
    onRead,
    intensity = 0.65,
    focused = false,
}) => {
    const g = useMemo(geometry, []);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const cargoRefs = useRef<(SVGGElement | null)[]>([]);
    const springs = useRef<Spring[]>(REST_RISE.map(r => new Spring(r)));
    const pending = useRef<({ at: number; riseTo: number } | null)[]>(REST_RISE.map(() => null));
    const active = useRef<number | null>(null);
    const read = useRef(onRead);
    read.current = onRead;

    // Conveyor speed rate (1.0x at rest, slows to 0.25x when hovered)
    const rate = useRef(new Tween());

    const paint = () => {
        const [, dyZ] = shift(CAM, 0, 0, 1);
        for (let i = 0; i < N; i++) {
            const el = cargoRefs.current[i];
            if (!el) continue;
            const rise = springs.current[i].x;
            el.style.transform = `translateY(${(rise * dyZ).toFixed(2)}px)`;
        }
    };

    const tick = useRef((dt: number): boolean => {
        const now = performance.now();
        let moving = false;
        pending.current.forEach((p, i) => {
            if (!p) return;
            if (now >= p.at) {
                springs.current[i].t = p.riseTo;
                pending.current[i] = null;
            }
            moving = true;
        });

        for (let i = 0; i < N; i++) {
            if (springs.current[i].step(dt)) moving = true;
        }
        if (rate.current.step(dt)) moving = true;

        paint();
        return moving;
    }).current;

    const setActive = (i: number | null) => {
        if (active.current === i) return;
        active.current = i;
        cargoRefs.current.forEach((el, k) => el?.classList.toggle('is-active', i === null ? k === REST_BRIGHT : k === i));
        if (i === null) {
            read.current?.('Conveyor · Rate 1.00×');
            rate.current.set(0); // normal rate
        } else {
            const item = g.cargo[i];
            read.current?.(`${item.name} · Rate 0.25×`);
            rate.current.set(1); // slowed down
        }
    };

    const aim = (a: number | null) => {
        const now = performance.now();
        const k = Math.max(0, Math.min(1, intensity));
        const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        for (let i = 0; i < N; i++) {
            const dist = a === null ? 0 : Math.abs(i - a);
            const fo = a === null ? 0 : falloff(dist, 2.2);
            const riseTo = a === null ? REST_RISE[i] : REST_RISE[i] * 0.35 + (0.6 + 0.4 * k) * HMAX * fo;

            if (reducedMotion) {
                springs.current[i].x = riseTo;
                springs.current[i].t = riseTo;
                pending.current[i] = null;
            } else {
                const delay = a === null ? 0 : dist * STEP_MS;
                pending.current[i] = { at: now + delay, riseTo };
            }
        }
        setActive(a === null ? null : Math.max(0, Math.min(N - 1, Math.round(a))));
        if (reducedMotion) paint();
        else wake(tick);
    };

    useEffect(() => {
        cargoRefs.current[REST_BRIGHT]?.classList.add('is-active');
        paint();
        read.current?.('Conveyor · Rate 1.00×');
        return () => { sleep(tick); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Focus-driven auto-animation for mobile carousel and keyboard focus
    useEffect(() => {
        if (!focused) {
            aim(null);
            return;
        }
        let step = 0;
        aim(step);
        const timer = window.setInterval(() => {
            step = (step + 1) % N;
            aim(step);
        }, 1150);
        return () => {
            window.clearInterval(timer);
            aim(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focused]);

    const indexAt = (e: { clientX: number; clientY: number }): number | null => {
        const svg = svgRef.current;
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const vx = ((e.clientX - r.left) / r.width) * VB_W;
        const vy = ((e.clientY - r.top) / r.height) * VB_H;
        const [gx, gy] = unproj(CAM, vx, vy, g.zMid);

        if (gy < -2.0 || gy > 20.0 || gx < g.xMin || gx > g.xMax) return null;
        const pitch = (g.xMax - g.xMin) / (N - 1);
        const a = (gx - g.xMin) / pitch;
        return a < -0.6 || a > N + 0.6 ? null : Math.max(0, Math.min(N - 1, a));
    };

    return (
        <div
            className="hl-logistics-stage hl-stage"
            tabIndex={0}
            role="group"
            aria-label={tr('Logistics conveyor belt and crates. Enter opens Logistics.')}
            onPointerMove={e => aim(indexAt(e))}
            onPointerLeave={() => aim(null)}
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    aim(Math.min(N - 1, cur + 1));
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    aim(Math.max(0, cur - 1));
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen();
                } else if (e.key === 'Escape') {
                    aim(null);
                }
            }}
            onBlur={() => aim(null)}
        >
            <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true" focusable="false">
                {/* Back Rail */}
                <path className="hl-plate" d={g.railBack.body} />
                <path className="hl-crease" d={g.railBack.crease} />

                {/* Conveyor Bed */}
                <path className="hl-plate" d={g.bed.body} />
                <path className="hl-crease" d={g.bed.crease} />

                {/* Front Rollers */}
                {g.rollers.map((r, i) => (
                    <path key={i} className="hl-face" d={r} />
                ))}

                {/* Laser Inspection Arch Rear Column */}
                <path className="hl-plate" d={g.archLeft.body} />
                <path className="hl-crease" d={g.archLeft.crease} />

                {/* 6 Full-color 3D Cargo Items */}
                {g.cargo.map((c, i) => (
                    <g
                        key={c.code}
                        ref={el => { cargoRefs.current[i] = el; }}
                        className="hl-cargo-item"
                        style={{
                            '--c': c.color,
                            transformOrigin: `${c.pivot[0].toFixed(1)}px ${c.pivot[1].toFixed(1)}px`,
                        } as React.CSSProperties}
                    >
                        <path className="hl-cargo-body" d={c.body} />
                        <path className="hl-cargo-crease" d={c.crease} />
                        <path className="hl-cargo-lid" d={c.lid} />
                    </g>
                ))}

                {/* Laser Scanning Arch Front Column, Lintel & Laser Beam */}
                <path className="hl-plate" d={g.archRight.body} />
                <path className="hl-crease" d={g.archRight.crease} />
                <path className="hl-plate hl-bright" d={g.archLintel.body} />
                <path className="hl-crease" d={g.archLintel.crease} />
                <path className="hl-laser-fan" d={g.laserFan} />

                {/* Front Rail */}
                <path className="hl-plate" d={g.railFront.body} />
                <path className="hl-crease" d={g.railFront.crease} />
            </svg>
        </div>
    );
};
