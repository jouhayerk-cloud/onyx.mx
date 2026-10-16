import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tr } from '../../../lib/i18n';
import { type Cam, VB_W, VB_H, prism, rectY, discY, pathOf, proj, unproj, falloff, Spring, Tween, wake, sleep, shift } from './engine';
import './atmMachine.css';

/**
 * Finances as a 3D Vault & ATM Cash Dispenser.
 * Features an authentic axonometric vault body with combination dial, sliding locking bolts,
 * and 7 full-color banknotes/ledger cards on interactive Springs.
 */

const CAM: Cam = { S: 5.2, cx: 240, cy: 201 };
const BANKNOTES = [
    { code: 'USD', name: tr('$100 Federal Reserve Cash'), color: '#10b981' },
    { code: 'EUR', name: tr('Wire Settlement Transfer'), color: '#00aeef' },
    { code: 'GLD', name: tr('Physical Bullion Ingot'), color: '#f2b53c' },
    { code: 'LED', name: tr('Vendor Ledger Balances'), color: '#f59e0b' },
    { code: 'CHK', name: tr('Certified Cashier Check'), color: '#34d399' },
    { code: 'BND', name: tr('Treasury Yield Certificate'), color: '#14b8a6' },
    { code: 'RSV', name: tr('Vault Reserve Liquidity'), color: '#eab308' },
] as const;

const N = BANKNOTES.length;
const REST_RISE = Array.from({ length: N }, (_, i) => 0.5 + 1.1 * Math.abs(Math.sin(i * 1.6 + 0.3)));
const REST_BRIGHT = 2; // Default resting note
const HMAX = 9.0;
const STEP_MS = 40;

interface Geometry {
    vaultChassis: { body: string; crease: string };
    vaultDoor: { body: string; crease: string };
    dialOuter: string;
    dialInner: string;
    dialCenter: string;
    bolts: { body: string; crease: string; z: number }[];
    dispenserTray: { body: string; crease: string };
    dispenserSlot: string;
    notes: {
        code: string;
        name: string;
        color: string;
        body: string;
        crease: string;
        tab: string;
        pivot: [number, number];
        gx: number;
    }[];
    xMin: number;
    xMax: number;
    zMid: number;
}

let cached: Geometry | null = null;
function geometry(): Geometry {
    if (cached) return cached;

    // Heavy vault body
    const vaultChassis = prism(CAM, -16, 2, 0, 36, 18, 28, 2.8);
    const vaultDoor = prism(CAM, -14, 19.4, 2.2, 32, 2.2, 23.6, 2.0);

    // Combination dial on door
    const dialOuter = discY(CAM, -2, 21.8, 14, 6.2, 28);
    const dialInner = discY(CAM, -2, 21.9, 14, 4.4, 24);
    const dialCenter = discY(CAM, -2, 22.0, 14, 1.8, 16);

    // 3 Sliding locking bolts
    const boltZ = [6.5, 14.0, 21.5];
    const bolts = boltZ.map(z => ({
        ...prism(CAM, -19.5, 8.5, z, 5.0, 4.0, 3.2, 0.8),
        z,
    }));

    // ATM cash dispenser tray on front right
    const dispenserTray = prism(CAM, 4, 17, 10, 18, 6.5, 3.5, 1.2);
    const dispenserSlot = rectY(CAM, 21.4, 6, 19.5, 11, 13.5);

    // 7 Banknotes/cards emerging from slot
    const notes = BANKNOTES.map((b, i) => {
        const x = 6.2 + i * 1.8;
        const y = 18.2 + i * 0.4;
        const z = 12.5;
        const t = 1.3;
        const len = 5.2;
        const h = 8.5;
        const body = prism(CAM, x, y, z, t, len, h, 0.35);
        const tab = prism(CAM, x, y + 0.6, z + h, t, 3.8, 1.8, 0.25);
        const pivot = proj(CAM, x + t / 2, y + len / 2, z);

        return {
            code: b.code,
            name: b.name,
            color: b.color,
            body: body.body,
            crease: body.crease,
            tab: tab.body,
            pivot,
            gx: x + t / 2,
        };
    });

    cached = {
        vaultChassis,
        vaultDoor,
        dialOuter,
        dialInner,
        dialCenter,
        bolts,
        dispenserTray,
        dispenserSlot,
        notes,
        xMin: 4.5,
        xMax: 22.0,
        zMid: 16.0,
    };
    return cached;
}

/** 4 rotating spokes for the vault combination dial */
const dialSpokes = (a: number): string => {
    const pts: string[] = [];
    for (let k = 0; k < 4; k++) {
        const t = a + k * (Math.PI / 4);
        const p = (s: number) => proj(CAM, -2 + s * 4.2 * Math.cos(t), 21.9, 14 + s * 4.2 * Math.sin(t));
        const [x1, y1] = p(-1);
        const [x2, y2] = p(1);
        pts.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`);
    }
    return pts.join('');
};

export interface AtmMachineProps {
    onOpen: () => void;
    onRead?: (text: string) => void;
    intensity?: number;
    focused?: boolean;
}

export const AtmMachine: React.FC<AtmMachineProps> = ({
    onOpen,
    onRead,
    intensity = 0.65,
    focused = false,
}) => {
    const g = useMemo(geometry, []);
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    const svgRef = useRef<SVGSVGElement | null>(null);
    const noteRefs = useRef<(SVGGElement | null)[]>([]);
    const boltRefs = useRef<(SVGGElement | null)[]>([]);
    const spokeRef = useRef<SVGPathElement | null>(null);

    const springs = useRef<Spring[]>(REST_RISE.map(r => new Spring(r)));
    const dialAngle = useRef(new Spring(0));
    const boltRetract = useRef(new Tween());
    const pending = useRef<({ at: number; riseTo: number } | null)[]>(REST_RISE.map(() => null));
    const active = useRef<number | null>(null);
    const read = useRef(onRead);
    read.current = onRead;

    const paint = () => {
        const [, dyZ] = shift(CAM, 0, 0, 1);
        // Paint banknotes
        for (let i = 0; i < N; i++) {
            const el = noteRefs.current[i];
            if (!el) continue;
            const rise = springs.current[i].x;
            el.style.transform = `translateY(${(rise * dyZ).toFixed(2)}px)`;
        }
        // Paint combination dial spokes
        if (spokeRef.current) {
            spokeRef.current.setAttribute('d', dialSpokes(dialAngle.current.x));
        }
        // Paint locking bolts retraction
        const [dxB] = shift(CAM, 3.5 * boltRetract.current.value, 0, 0);
        boltRefs.current.forEach(b => {
            if (b) b.style.transform = `translateX(${dxB.toFixed(2)}px)`;
        });
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
        if (dialAngle.current.step(dt)) moving = true;
        if (boltRetract.current.step(dt)) moving = true;

        paint();
        return moving;
    }).current;

    const setActive = (i: number | null) => {
        if (active.current === i) return;
        active.current = i;
        noteRefs.current.forEach((el, k) => el?.classList.toggle('is-active', i === null ? k === REST_BRIGHT : k === i));
        if (i === null) {
            read.current?.('Finances Vault · Rest');
            boltRetract.current.set(0);
        } else {
            const nt = g.notes[i];
            read.current?.(nt.name);
            boltRetract.current.set(1);
        }
    };

    const aim = (a: number | null, dialTurn = 0) => {
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

        dialAngle.current.t += dialTurn;
        setActive(a === null ? null : Math.max(0, Math.min(N - 1, Math.round(a))));

        if (reducedMotion) paint();
        else wake(tick);
    };

    useEffect(() => {
        noteRefs.current[REST_BRIGHT]?.classList.add('is-active');
        paint();
        read.current?.('Finances Vault · Rest');
        return () => { sleep(tick); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Focus-driven auto-animation for mobile carousel and keyboard focus
    useEffect(() => {
        if (!focused) {
            aim(null, 0);
            return;
        }
        let step = 0;
        aim(step, 0.4);
        const timer = window.setInterval(() => {
            step = (step + 1) % N;
            aim(step, 0.4);
        }, 1150);
        return () => {
            window.clearInterval(timer);
            aim(null, 0);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focused]);

    const indexAt = (e: { clientX: number; clientY: number }): { noteIdx: number | null; dialTurn: number } => {
        const svg = svgRef.current;
        if (!svg) return { noteIdx: null, dialTurn: 0 };
        const r = svg.getBoundingClientRect();
        const vx = ((e.clientX - r.left) / r.width) * VB_W;
        const vy = ((e.clientY - r.top) / r.height) * VB_H;
        const [gx, gy] = unproj(CAM, vx, vy, g.zMid);

        // Vault dial area detection
        const overDial = gx >= -8 && gx <= 4 && gy >= 14 && gy <= 25;
        const dialTurn = overDial ? 0.35 : 0;

        // Cash dispenser area detection
        if (gx < g.xMin || gx > g.xMax) return { noteIdx: null, dialTurn };
        const pitch = (g.xMax - g.xMin) / N;
        const a = (gx - g.xMin) / pitch - 0.5;
        const noteIdx = a < -0.5 || a > N + 0.5 ? null : a;
        return { noteIdx, dialTurn };
    };

    return (
        <div
            className="hl-atm-stage hl-stage"
            tabIndex={0}
            role="group"
            aria-label={tr('Finances Vault & ATM cash dispenser. Enter opens Finances.')}
            onPointerMove={e => {
                const res = indexAt(e);
                aim(res.noteIdx, res.dialTurn);
            }}
            onPointerLeave={() => aim(null, 0)}
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    aim(Math.min(N - 1, cur + 1), 0.5);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    aim(Math.max(0, cur - 1), -0.5);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen();
                } else if (e.key === 'Escape') {
                    aim(null, 0);
                }
            }}
            onBlur={() => aim(null, 0)}
        >
            <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true" focusable="false">
                <defs>
                    <clipPath id={`${uid}-slot`}><path d={g.dispenserSlot} /></clipPath>
                </defs>

                {/* Vault Chassis */}
                <path className="hl-plate" d={g.vaultChassis.body} />
                <path className="hl-crease" d={g.vaultChassis.crease} />

                {/* Sliding Bolts on side */}
                {g.bolts.map((b, i) => (
                    <g key={b.z} ref={el => { boltRefs.current[i] = el; }} className="hl-atm-bolt">
                        <path className="hl-plate" d={b.body} />
                        <path className="hl-crease" d={b.crease} />
                    </g>
                ))}

                {/* Vault Door */}
                <path className="hl-plate" d={g.vaultDoor.body} />
                <path className="hl-crease" d={g.vaultDoor.crease} />

                {/* Combination Dial on Door */}
                <g className="hl-atm-dial">
                    <path className="hl-plate" d={g.dialOuter} />
                    <path className="hl-face" d={g.dialInner} />
                    <path ref={spokeRef} className="hl-spoke" />
                    <path className="hl-plate hl-bright" d={g.dialCenter} />
                </g>

                {/* ATM Cash Dispenser Tray */}
                <path className="hl-plate" d={g.dispenserTray.body} />
                <path className="hl-crease" d={g.dispenserTray.crease} />
                <path className="hl-slot" d={g.dispenserSlot} />

                {/* 7 Full-color Banknotes */}
                {g.notes.map((nt, i) => (
                    <g
                        key={nt.code}
                        ref={el => { noteRefs.current[i] = el; }}
                        className="hl-atm-note"
                        style={{
                            '--c': nt.color,
                            transformOrigin: `${nt.pivot[0].toFixed(1)}px ${nt.pivot[1].toFixed(1)}px`,
                        } as React.CSSProperties}
                    >
                        <path className="hl-note-body" d={nt.body} />
                        <path className="hl-note-crease" d={nt.crease} />
                        <path className="hl-note-tab" d={nt.tab} />
                    </g>
                ))}
            </svg>
        </div>
    );
};
