import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tr } from '../../../lib/i18n';
import { type Cam, VB_W, VB_H, prism, discY, proj, unproj, falloff, Spring, Tween, wake, sleep, shift } from './engine';
import './plusTowerLamp.css';

/**
 * Add Entry as a 3D Plus-Sign Monolithic Tower Lamp.
 * Composed of 5 stacked full-color 3D Greek cross tiers that expand vertically
 * on interactive Springs with falloff and stagger when hovered.
 */

const CAM: Cam = { S: 4.8, cx: 200, cy: 232 };

const TIERS = [
    { name: tr('Add Entry · Base Tier 1'), color: '#7e22ce' },
    { name: tr('Add Entry · Intake Core Tier 2'), color: '#9333ea' },
    { name: tr('Add Entry · Batch Catalog Tier 3'), color: '#a855f7' },
    { name: tr('Add Entry · Telemetry Tier 4'), color: '#b85bf8' },
    { name: tr('Add Entry · Photon Beacon Cap Tier 5'), color: '#d8b4fe' },
] as const;

const N = TIERS.length;
const REST_RISE = [0.2, 0.5, 0.9, 1.4, 2.0];
const REST_BRIGHT = 3;
const HMAX = 10.0;
const STEP_MS = 35;

interface TierGeometry {
    name: string;
    color: string;
    armH: { body: string; crease: string };
    armV: { body: string; crease: string };
    z: number;
    pivot: [number, number];
}

interface Geometry {
    plinth: { body: string; crease: string };
    tiers: TierGeometry[];
    beacon: { body: string; crease: string };
    zMid: number;
}

let cached: Geometry | null = null;
function geometry(): Geometry {
    if (cached) return cached;

    // Plinth foundation
    const plinth = prism(CAM, -15, -15, 0, 30, 30, 3.0, 2.2);

    // 5 Tiers of intersecting rounded Greek Cross prisms
    const tiers: TierGeometry[] = TIERS.map((tInfo, i) => {
        const z = 3.2 + i * 4.4;
        const w = 21.0 - i * 0.9;
        const t = 8.8 - i * 0.35;
        const h = 3.6;
        const r = 1.0;

        const armH = prism(CAM, -w / 2, -t / 2, z, w, t, h, r);
        const armV = prism(CAM, -t / 2, -w / 2, z, t, w, h, r);
        const pivot = proj(CAM, 0, 0, z);

        return {
            name: tInfo.name,
            color: tInfo.color,
            armH,
            armV,
            z,
            pivot,
        };
    });

    // Beacon cap on top of Tier 4
    const topZ = 3.2 + 4 * 4.4 + 3.6;
    const beacon = prism(CAM, -2.5, -2.5, topZ, 5.0, 5.0, 2.2, 0.8);

    cached = {
        plinth,
        tiers,
        beacon,
        zMid: topZ / 2,
    };
    return cached;
}

export interface PlusTowerLampProps {
    onOpen: () => void;
    onRead?: (text: string) => void;
    intensity?: number;
    focused?: boolean;
}

export const PlusTowerLamp: React.FC<PlusTowerLampProps> = ({
    onOpen,
    onRead,
    intensity = 0.65,
    focused = false,
}) => {
    const g = useMemo(geometry, []);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const tierRefs = useRef<(SVGGElement | null)[]>([]);
    const beaconRef = useRef<SVGGElement | null>(null);
    const springs = useRef<Spring[]>(REST_RISE.map(r => new Spring(r)));
    const pending = useRef<({ at: number; riseTo: number } | null)[]>(REST_RISE.map(() => null));
    const active = useRef<number | null>(null);
    const read = useRef(onRead);
    read.current = onRead;

    const paint = () => {
        const [, dyZ] = shift(CAM, 0, 0, 1);
        for (let i = 0; i < N; i++) {
            const el = tierRefs.current[i];
            if (!el) continue;
            const rise = springs.current[i].x;
            el.style.transform = `translateY(${(rise * dyZ).toFixed(2)}px)`;
        }
        if (beaconRef.current) {
            const topRise = springs.current[N - 1].x;
            beaconRef.current.style.transform = `translateY(${(topRise * dyZ).toFixed(2)}px)`;
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

        paint();
        return moving;
    }).current;

    const setActive = (i: number | null) => {
        if (active.current === i) return;
        active.current = i;
        tierRefs.current.forEach((el, k) => el?.classList.toggle('is-active', i === null ? k === REST_BRIGHT : k === i));
        if (i === null) {
            read.current?.('Plus Tower Lamp · Standby');
        } else {
            const tier = g.tiers[i];
            read.current?.(tier.name);
        }
    };

    const aim = (a: number | null) => {
        const now = performance.now();
        const k = Math.max(0, Math.min(1, intensity));
        const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        for (let i = 0; i < N; i++) {
            // Expansion increases with tier height
            const heightMultiplier = (i + 1) / N;
            const dist = a === null ? 0 : Math.abs(i - a);
            const fo = a === null ? 0 : falloff(dist, 2.5);
            const riseTo = a === null
                ? REST_RISE[i]
                : REST_RISE[i] + (0.5 + 0.5 * k) * HMAX * heightMultiplier * (0.4 + 0.6 * fo);

            if (reducedMotion) {
                springs.current[i].x = riseTo;
                springs.current[i].t = riseTo;
                pending.current[i] = null;
            } else {
                const delay = a === null ? 0 : (N - 1 - i) * STEP_MS;
                pending.current[i] = { at: now + delay, riseTo };
            }
        }
        setActive(a === null ? null : Math.max(0, Math.min(N - 1, Math.round(a))));
        if (reducedMotion) paint();
        else wake(tick);
    };

    useEffect(() => {
        tierRefs.current[REST_BRIGHT]?.classList.add('is-active');
        paint();
        read.current?.('Plus Tower Lamp · Standby');
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
        const vy = ((e.clientY - r.top) / r.height) * VB_H;
        // Test vertical pointer position within tower bounds
        const towerTop = 80;
        const towerBottom = 230;
        if (vy < towerTop - 15 || vy > towerBottom + 15) return null;
        const rel = 1 - (vy - towerTop) / (towerBottom - towerTop);
        const a = rel * (N - 1);
        return Math.max(0, Math.min(N - 1, a));
    };

    return (
        <div
            className="hl-plus-stage hl-stage"
            tabIndex={0}
            role="group"
            aria-label={tr('Add Entry Plus Monolithic Tower. Enter opens Add Entry.')}
            onPointerMove={e => aim(indexAt(e))}
            onPointerLeave={() => aim(null)}
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    aim(Math.min(N - 1, cur + 1));
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
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
                {/* Plinth Base */}
                <path className="hl-plate" d={g.plinth.body} />
                <path className="hl-crease" d={g.plinth.crease} />

                {/* 5 Stacked Plus Cross Tiers */}
                {g.tiers.map((t, i) => (
                    <g
                        key={i}
                        ref={el => { tierRefs.current[i] = el; }}
                        className="hl-tier"
                        style={{
                            '--c': t.color,
                            transformOrigin: `${t.pivot[0].toFixed(1)}px ${t.pivot[1].toFixed(1)}px`,
                        } as React.CSSProperties}
                    >
                        {/* Horizontal Cross Arm */}
                        <path className="hl-cross-arm" d={t.armH.body} />
                        <path className="hl-cross-crease" d={t.armH.crease} />
                        {/* Vertical Cross Arm */}
                        <path className="hl-cross-arm" d={t.armV.body} />
                        <path className="hl-cross-crease" d={t.armV.crease} />
                    </g>
                ))}

                {/* Top Beacon Cap */}
                <g ref={beaconRef} className="hl-tier">
                    <path className="hl-plate hl-bright" d={g.beacon.body} />
                    <path className="hl-crease" d={g.beacon.crease} />
                </g>
            </svg>
        </div>
    );
};
