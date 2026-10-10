import React, { useEffect, useMemo, useRef } from 'react';
import { vendors } from '../../../lib/consts';
import { tr } from '../../../lib/i18n';
import { type Cam, VB_W, VB_H, prism, rectY, unproj, falloff, Spring, wake, shift } from './engine';

/**
 * Inventory as a file cabinet: two closed drawers and the top one pulled out, with one folder per vendor standing in it,
 * each in that vendor's colour code (lib/consts vendors). The pointer's position along the drawer lifts the nearest
 * folders (the farther the less); a click opens the inventory filtered to that vendor.
 */

const CODES = ['AM', 'AN', 'BT', 'CA', 'CP', 'DH', 'EM', 'FR', 'GE', 'IH', 'JM', 'ML', 'MM', 'RF', 'SU', 'TE'] as const;
const CAM: Cam = { S: 4.6, cx: 172, cy: 163 };
const W = 52, D = 22, H = 9.5, GAP = 1.2, OPEN = 13;
const N = CODES.length;
const FOLDER_H = 9.2;
const REACH = 3.6;              // folders on each side of the pointer that answer it
const HMAX = 6.5;               // the most a folder rises (world units)
const STEP_MS = 45;             // stagger per folder of distance (rule 2)

interface Geometry {
    shell: { body: string; crease: string };
    fronts: { path: string; handle: string }[];
    slot: string;
    tray: { body: string; crease: string };
    panel: { body: string; crease: string };
    panelHandle: string;
    folders: { code: string; color: string; name: string; body: string; crease: string; tab: string }[];
    pitch: number;
    x0: number;
    zMid: number;
    yFrom: number;
    yTo: number;
}

let cached: Geometry | null = null;
function geometry(): Geometry {
    if (cached) return cached;
    const z2 = 2 * (H + GAP);
    const shell = prism(CAM, 0, 0, 0, W, D, 3 * H + 2 * GAP, 2.2);
    const fronts = [0, 1].map(k => {
        const z = k * (H + GAP);
        return { path: rectY(CAM, D, 1.6, W - 1.6, z + 1, z + H - 1), handle: rectY(CAM, D, W / 2 - 4.5, W / 2 + 4.5, z + H * 0.55, z + H * 0.55 + 1.3) };
    });
    const slot = rectY(CAM, D, 1.6, W - 1.6, z2 + 1, z2 + H - 1);
    const trayTop = z2 + 1 + 3.4;
    const tray = prism(CAM, 1.6, D - 3, z2 + 1, W - 3.2, OPEN + 3, 3.4, 1.2);
    const panel = prism(CAM, 0.8, D + OPEN - 0.2, z2 + 0.4, W - 1.6, 1.4, H - 0.8, 0.6);
    const panelHandle = rectY(CAM, D + OPEN + 1.2, W / 2 - 5, W / 2 + 5, z2 + H * 0.5, z2 + H * 0.5 + 1.3);
    const x0 = 3.4;
    const pitch = (W - 6.8) / N;
    const t = pitch * 0.66;
    const yF = D - 1.2;
    const lenF = OPEN - 1;
    const table = vendors as unknown as Record<string, { name: string; color: string }>;
    const folders = CODES.map((code, i) => {
        const x = x0 + i * pitch + (pitch - t) / 2;
        const body = prism(CAM, x, yF, trayTop, t, lenF, FOLDER_H, 0.4);
        const tab = prism(CAM, x, yF + [0.4, 4.4, 8.4][i % 3], trayTop + FOLDER_H, t, 3, 1.7, 0.35);
        const v = table[code];
        return { code, color: v?.color || '#9aa4b2', name: v?.name || code, body: body.body, crease: body.crease, tab: tab.body };
    });
    cached = { shell, fronts, slot, tray, panel, panelHandle, folders, pitch, x0, zMid: trayTop + FOLDER_H / 2, yFrom: yF - 2.5, yTo: D + OPEN };
    return cached;
}

// A designed rest (rule 5): non-uniform, deterministic, and one folder is the bright mark.
const REST = Array.from({ length: N }, (_, i) => 0.5 + 1.6 * Math.abs(Math.sin(i * 1.9 + 0.6)));
const REST_BRIGHT = 5;

export const FileCabinet: React.FC<{
    onOpen: (vendor: string | null) => void;
    onRead?: (text: string) => void;
    intensity?: number;
}> = ({ onOpen, onRead, intensity = 0.65 }) => {
    const g = useMemo(geometry, []);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const folderRefs = useRef<(SVGGElement | null)[]>([]);
    const springs = useRef<Spring[]>(REST.map(r => new Spring(r)));
    const pending = useRef<({ at: number; to: number } | null)[]>(REST.map(() => null));
    const active = useRef<number | null>(null);
    const read = useRef(onRead);
    read.current = onRead;

    const paint = () => {
        const [, dy] = shift(CAM, 0, 0, 1);
        springs.current.forEach((s, i) => {
            const el = folderRefs.current[i];
            if (el) el.style.transform = `translateY(${(s.x * dy).toFixed(2)}px)`;
        });
    };

    const tick = useRef((dt: number): boolean => {
        const now = performance.now();
        let moving = false;
        pending.current.forEach((p, i) => {
            if (!p) return;
            if (now >= p.at) { springs.current[i].t = p.to; pending.current[i] = null; }
            moving = true;
        });
        for (const s of springs.current) if (s.step(dt)) moving = true;
        paint();
        return moving;
    }).current;

    const setActive = (i: number | null) => {
        if (active.current === i) return;
        active.current = i;
        folderRefs.current.forEach((el, k) => el?.classList.toggle('is-active', i === null ? k === REST_BRIGHT : k === i));
        read.current?.(i === null ? 'rest' : `${g.folders[i].code} · ${g.folders[i].name}`);
    };

    /** Aim the figure at a (fractional) folder index, or at rest. */
    const aim = (a: number | null) => {
        const now = performance.now();
        const k = Math.max(0, Math.min(1, intensity));
        for (let i = 0; i < N; i++) {
            const to = a === null ? REST[i] : REST[i] * 0.35 + (0.6 + 0.4 * k) * HMAX * falloff(i - a, REACH);
            pending.current[i] = { at: now + (a === null ? 0 : Math.abs(i - a) * STEP_MS), to };
        }
        setActive(a === null ? null : Math.max(0, Math.min(N - 1, Math.round(a))));
        wake(tick);
    };

    useEffect(() => {
        folderRefs.current[REST_BRIGHT]?.classList.add('is-active');
        paint();
        return () => { /* nothing outside the svg to release; the loop forgets a tick that stops moving */ };
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
            className="hl-stage"
            tabIndex={0}
            role="group"
            aria-label={tr('Inventory folders, one per vendor. Arrow keys choose a vendor, Enter opens it.')}
            onPointerMove={e => aim(indexAt(e))}
            onPointerLeave={() => aim(null)}
            onPointerDown={e => aim(indexAt(e))}
            onClick={e => { const a = indexAt(e); onOpen(a === null ? null : CODES[Math.max(0, Math.min(N - 1, Math.round(a)))]); }}
            onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const cur = active.current ?? REST_BRIGHT;
                    aim(Math.max(0, Math.min(N - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(active.current === null ? null : CODES[active.current]);
                } else if (e.key === 'Escape') aim(null);
            }}
            onBlur={() => aim(null)}
        >
            <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true" focusable="false">
                <path className="hl-plate" d={g.shell.body} />
                <path className="hl-crease" d={g.shell.crease} />
                {g.fronts.map((f, i) => (
                    <g key={i}>
                        <path className="hl-face" d={f.path} />
                        <path className="hl-mark" d={f.handle} />
                    </g>
                ))}
                <path className="hl-slot" d={g.slot} />
                <path className="hl-plate" d={g.tray.body} />
                <path className="hl-crease" d={g.tray.crease} />
                {g.folders.map((fo, i) => (
                    <g key={fo.code} ref={el => { folderRefs.current[i] = el; }} className="hl-folder" style={{ '--c': fo.color } as React.CSSProperties}>
                        <path className="hl-folder-body" d={fo.body} />
                        <path className="hl-folder-crease" d={fo.crease} />
                        <path className="hl-folder-tab" d={fo.tab} />
                    </g>
                ))}
                <path className="hl-plate" d={g.panel.body} />
                <path className="hl-crease" d={g.panel.crease} />
                <path className="hl-mark" d={g.panelHandle} />
            </svg>
        </div>
    );
};
