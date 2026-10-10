import React, { useEffect, useMemo, useRef, useState } from 'react';
import { vendors } from '../../../lib/consts';
import { tr } from '../../../lib/i18n';
import { type Cam, VB_W, VB_H, prism, rectY, proj, unproj, falloff, Spring, Tween, wake, sleep, shift } from './engine';
import './folderTray.css';

/**
 * Inventory as a Riffle-style open tray of vendor folders.
 * Folders are presented in full vendor colours; hovering or focusing a folder lifts it on a spring
 * and leans it upright to face the viewer, while neighbours lean after it with 1 / .31 / .09 falloff
 * and a 45 ms stagger. Clicking a folder opens that vendor; clicking the tray frame or overflow folder opens all.
 */

const TOP_CODES = ['JM', 'EM', 'CA', 'AN', 'SU', 'TE', 'DH', 'ML'] as const;
const CAM: Cam = { S: 5.0, cx: 188, cy: 172 };
const W = 54, D = 22, Z0 = 3.5;
const N = TOP_CODES.length + 1; // 8 top vendors + 1 grey overflow folder for all vendors
const FOLDER_H = 13.5;
const HMAX = 8.0;               // maximum rise height (world units)
const REST_LEAN = -6.0;         // resting tilt in degrees
const STEP_MS = 45;             // stagger delay per step of distance
const REST_BRIGHT = 3;          // deterministic resting focus mark

interface FolderItem {
    code: string | null;
    color: string;
    name: string;
    body: string;
    crease: string;
    tab: string;
    pivot: [number, number];
}

interface Geometry {
    trayBody: { body: string; crease: string };
    backRim: { body: string; crease: string };
    frontLip: { body: string; crease: string };
    handle: string;
    folders: FolderItem[];
    pitch: number;
    x0: number;
    zMid: number;
    yFrom: number;
    yTo: number;
}

let cached: Geometry | null = null;
function geometry(): Geometry {
    if (cached) return cached;
    const trayBody = prism(CAM, 0, 0, Z0, W, D, 3.4, 1.6);
    const backRim = prism(CAM, 0.8, 0.6, Z0 + 3.4, W - 1.6, 1.8, 7.5, 0.8);
    const frontLip = prism(CAM, 0, D - 2.2, Z0 + 1.2, W, 2.4, 5.8, 0.8);
    const handle = rectY(CAM, D + 0.3, W / 2 - 5.5, W / 2 + 5.5, Z0 + 2.8, Z0 + 4.2);

    const x0 = 3.6;
    const pitch = (W - 7.2) / N;
    const t = pitch * 0.72;
    const yF = 2.4;
    const lenF = D - 5.2;
    const trayFloor = Z0 + 2.8;
    const tabLen = 4.6;
    const tabH = 2.4;
    const tabOffsets = [0.8, 6.0, 11.2];

    const table = vendors as unknown as Record<string, { name: string; color: string }>;
    const folders: FolderItem[] = [];

    for (let i = 0; i < N; i++) {
        const isOverflow = i === N - 1;
        const code = isOverflow ? null : TOP_CODES[i];
        const v = code ? table[code] : null;
        const color = isOverflow ? '#94a3b8' : (v?.color || '#9aa4b2');
        const name = isOverflow ? tr('All vendors') : (v?.name || (code ?? ''));
        const x = x0 + i * pitch + (pitch - t) / 2;
        const tabY = yF + tabOffsets[i % 3];

        const body = prism(CAM, x, yF, trayFloor, t, lenF, FOLDER_H, 0.4);
        const tab = prism(CAM, x, tabY, trayFloor + FOLDER_H, t, tabLen, tabH, 0.35);
        const pivot = proj(CAM, x + t / 2, yF + lenF / 2, trayFloor);

        folders.push({
            code,
            color,
            name,
            body: body.body,
            crease: body.crease,
            tab: tab.body,
            pivot,
        });
    }

    cached = {
        trayBody,
        backRim,
        frontLip,
        handle,
        folders,
        pitch,
        x0,
        zMid: trayFloor + FOLDER_H / 2,
        yFrom: yF - 3.0,
        yTo: D + 4.0,
    };
    return cached;
}

const REST_RISE = Array.from({ length: N }, (_, i) => 0.4 + 1.2 * Math.abs(Math.sin(i * 1.8 + 0.5)));

export interface FolderTrayProps {
    onOpen: (vendor: string | null) => void;
    onRead?: ((label: string | null) => void) | ((label: string) => void);
    intensity?: number;
}

export const FolderTray: React.FC<FolderTrayProps> = ({ onOpen, onRead, intensity = 0.65 }) => {
    const g = useMemo(geometry, []);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const folderRefs = useRef<(SVGGElement | null)[]>([]);
    const springs = useRef<Spring[]>(REST_RISE.map(r => new Spring(r)));
    const tweens = useRef<Tween[]>(REST_RISE.map(() => Object.assign(new Tween(), { value: REST_LEAN, from: REST_LEAN, to: REST_LEAN })));
    const pending = useRef<({ at: number; riseTo: number; leanTo: number } | null)[]>(REST_RISE.map(() => null));
    const active = useRef<number | null>(null);
    const [liveText, setLiveText] = useState('');
    const read = useRef(onRead);
    read.current = onRead;

    const paint = () => {
        const [, dyZ] = shift(CAM, 0, 0, 1);
        for (let i = 0; i < N; i++) {
            const el = folderRefs.current[i];
            if (!el) continue;
            const rise = springs.current[i].x;
            const lean = tweens.current[i].value;
            el.style.transform = `translateY(${(rise * dyZ).toFixed(2)}px) rotate(${lean.toFixed(2)}deg)`;
        }
    };

    const tick = useRef((dt: number): boolean => {
        const now = performance.now();
        let moving = false;
        pending.current.forEach((p, i) => {
            if (!p) return;
            if (now >= p.at) {
                springs.current[i].t = p.riseTo;
                tweens.current[i].set(p.leanTo);
                pending.current[i] = null;
            }
            moving = true;
        });
        for (let i = 0; i < N; i++) {
            const sMove = springs.current[i].step(dt);
            const tMove = tweens.current[i].step(dt);
            if (sMove || tMove) moving = true;
        }
        paint();
        return moving;
    }).current;

    const setActive = (i: number | null) => {
        if (active.current === i) return;
        active.current = i;
        folderRefs.current.forEach((el, k) => el?.classList.toggle('is-active', i === null ? k === REST_BRIGHT : k === i));
        if (i === null) {
            read.current?.('rest');
            setLiveText('');
        } else {
            const fo = g.folders[i];
            const label = fo.code ? `${fo.code} · ${fo.name}` : fo.name;
            read.current?.(label);
            setLiveText(label);
        }
    };

    const aim = (a: number | null) => {
        const now = performance.now();
        const k = Math.max(0, Math.min(1, intensity));
        const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        for (let i = 0; i < N; i++) {
            const dist = a === null ? 0 : Math.abs(i - a);
            const fo = a === null ? 0 : falloff(dist, 2.4);
            const riseTo = a === null ? REST_RISE[i] : REST_RISE[i] * 0.35 + (0.6 + 0.4 * k) * HMAX * fo;
            const leanTo = a === null ? REST_LEAN : REST_LEAN * (1 - fo);

            if (reducedMotion) {
                springs.current[i].x = riseTo;
                springs.current[i].t = riseTo;
                tweens.current[i].value = leanTo;
                tweens.current[i].to = leanTo;
                pending.current[i] = null;
            } else {
                const delay = a === null ? 0 : dist * STEP_MS;
                pending.current[i] = { at: now + delay, riseTo, leanTo };
            }
        }
        setActive(a === null ? null : Math.max(0, Math.min(N - 1, Math.round(a))));
        if (reducedMotion) paint();
        else wake(tick);
    };

    useEffect(() => {
        folderRefs.current[REST_BRIGHT]?.classList.add('is-active');
        paint();
        return () => { sleep(tick); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const indexAt = (e: { clientX: number; clientY: number }): number | null => {
        const svg = svgRef.current;
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const [gx, gy] = unproj(CAM, ((e.clientX - r.left) / r.width) * VB_W, ((e.clientY - r.top) / r.height) * VB_H, g.zMid);
        if (gy < g.yFrom || gy > g.yTo) return null;
        const a = (gx - g.x0) / g.pitch - 0.5;
        return a < -1.5 || a > N + 0.5 ? null : a;
    };

    return (
        <div
            className="hl-tray-stage"
            tabIndex={0}
            role="group"
            aria-label={tr('Inventory folders, one per vendor. Arrow keys choose a vendor, Enter opens it.')}
            onPointerMove={e => aim(indexAt(e))}
            onPointerLeave={() => aim(null)}
            onPointerDown={e => aim(indexAt(e))}
            onClick={e => {
                const a = indexAt(e);
                onOpen(a === null ? null : g.folders[Math.max(0, Math.min(N - 1, Math.round(a)))].code);
            }}
            onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    aim(Math.min(N - 1, cur + 1));
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    aim(Math.max(0, cur - 1));
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    aim(0);
                } else if (e.key === 'End') {
                    e.preventDefault();
                    aim(N - 1);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    onOpen(g.folders[cur].code);
                } else if (e.key === 'Escape') {
                    aim(null);
                }
            }}
            onBlur={() => aim(null)}
        >
            <span className="sr-only" aria-live="polite">{liveText}</span>
            <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true" focusable="false">
                <path className="hl-plate" d={g.trayBody.body} />
                <path className="hl-crease" d={g.trayBody.crease} />
                <path className="hl-plate" d={g.backRim.body} />
                <path className="hl-crease" d={g.backRim.crease} />
                {g.folders.map((fo, i) => (
                    <g
                        key={fo.code ?? 'all'}
                        ref={el => { folderRefs.current[i] = el; }}
                        className="hl-tray-folder"
                        style={{
                            '--c': fo.color,
                            transformOrigin: `${fo.pivot[0].toFixed(1)}px ${fo.pivot[1].toFixed(1)}px`,
                        } as React.CSSProperties}
                    >
                        <path className="hl-folder-body" d={fo.body} />
                        <path className="hl-folder-crease" d={fo.crease} />
                        <path className="hl-folder-tab" d={fo.tab} />
                    </g>
                ))}
                <path className="hl-plate" d={g.frontLip.body} />
                <path className="hl-crease" d={g.frontLip.crease} />
                <path className="hl-mark" d={g.handle} />
            </svg>
        </div>
    );
};
