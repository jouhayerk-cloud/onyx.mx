import React, { useEffect, useId, useMemo, useRef } from 'react';
import { tr } from '../../../lib/i18n';
import { type Cam, VB_W, VB_H, prism, rectY, rectX, discY, pathOf, proj, unproj, shift, Spring, Tween, wake } from './engine';

/**
 * Shipping as a box truck on a road. The truck follows the pointer along the road on a spring (clamped), its wheels
 * turn with the distance it travels, and when the pointer is over the cargo box the roller shutter on the side rolls
 * up and shows the crates. A click opens Trucking.
 */

const CAM: Cam = { S: 5, cx: 150, cy: 172 };
const BOX = { x0: 0, x1: 22, y0: 0, y1: 11, z0: 3.4, z1: 17 };
const OPENING = { x0: 3, x1: 19, z0: 5, z1: 15 };
const WHEELS = [4.5, 11.5, 26.5];
const WHEEL_R = 2.6;
const WHEEL_Z = 3;
const TRAVEL = [-7, 9];             // how far the truck may move along the road (world units)
const REST_OFFSET = -1.5;           // a designed rest: not centred, the shutter a little ajar
const REST_OPEN = 0.16;

interface Geometry {
    road: { body: string; crease: string };
    dashes: string;
    chassis: { body: string; crease: string };
    box: { body: string; crease: string };
    cab: { body: string; crease: string };
    windshield: string;
    sideWindow: string;
    headlight: string;
    opening: string;
    crates: { body: string; crease: string }[];
    wheels: { disc: string; hub: string; cx: number }[];
}

let cached: Geometry | null = null;
function geometry(): Geometry {
    if (cached) return cached;
    const road = prism(CAM, -18, -3.5, 0, 66, 20, 0.9, 1.4);
    const dashA = [-14, -4, 6, 16, 26, 36].map(x => pathOf([proj(CAM, x, 14, 0.9), proj(CAM, x + 5, 14, 0.9)], false)).join('');
    const chassis = prism(CAM, -0.6, 0.5, 2, 31.6, 10, 1.4, 0.5);
    const box = prism(CAM, BOX.x0, BOX.y0, BOX.z0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0, BOX.z1 - BOX.z0, 1.6);
    const cab = prism(CAM, 22.6, 0.6, 3.4, 8.4, 9.8, 8.6, 2.2);
    const crates = [[4.5, 5.2], [10, 6], [15, 4.6]].map(([x, h]) => prism(CAM, x, 5.8, OPENING.z0 + 0.2, 4.2, 4.4, h, 0.5));
    const wheels = WHEELS.map(cx => ({ disc: discY(CAM, cx, 11.4, WHEEL_Z, WHEEL_R), hub: discY(CAM, cx, 11.4, WHEEL_Z, 0.9, 10), cx }));
    cached = {
        road, dashes: dashA, chassis, box, cab,
        windshield: rectX(CAM, 31, 1.8, 9.2, 7.2, 11),
        sideWindow: rectY(CAM, 10.4, 24.2, 29.6, 7.4, 11),
        headlight: rectX(CAM, 31, 7.6, 9, 4.2, 5.2),
        opening: rectY(CAM, BOX.y1, OPENING.x0, OPENING.x1, OPENING.z0, OPENING.z1),
        crates, wheels,
    };
    return cached;
}

/** Two spokes of a wheel, turned by `a` radians. */
const spokes = (cx: number, a: number): string => {
    const pts: string[] = [];
    for (let k = 0; k < 2; k++) {
        const t = a + k * (Math.PI / 2);
        const p = (s: number) => proj(CAM, cx + s * 1.9 * Math.cos(t), 11.4, WHEEL_Z + s * 1.9 * Math.sin(t));
        const [x1, y1] = p(-1);
        const [x2, y2] = p(1);
        pts.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`);
    }
    return pts.join('');
};

export const Truck: React.FC<{
    onOpen: () => void;
    onRead?: (text: string) => void;
    intensity?: number;
}> = ({ onOpen, onRead, intensity = 0.65 }) => {
    const g = useMemo(geometry, []);
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    const svgRef = useRef<SVGSVGElement | null>(null);
    const truckRef = useRef<SVGGElement | null>(null);
    const shutterRef = useRef<SVGGElement | null>(null);
    const spokeRefs = useRef<(SVGPathElement | null)[]>([]);
    const pos = useRef(new Spring(REST_OFFSET));
    const door = useRef(Object.assign(new Tween(), { value: REST_OPEN, from: REST_OPEN, to: REST_OPEN }));
    const reading = useRef('');
    const read = useRef(onRead);
    read.current = onRead;

    const paint = () => {
        const off = pos.current.x;
        const [sx, sy] = shift(CAM, off, 0, 0);
        if (truckRef.current) truckRef.current.style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px)`;
        const lift = shift(CAM, 0, 0, OPENING.z1 - OPENING.z0)[1];   // negative: up the screen
        if (shutterRef.current) shutterRef.current.style.transform = `translateY(${(lift * door.current.value).toFixed(2)}px)`;
        g.wheels.forEach((w, i) => spokeRefs.current[i]?.setAttribute('d', spokes(w.cx, -off / WHEEL_R)));
    };

    const tick = useRef((dt: number): boolean => {
        const a = pos.current.step(dt);
        const b = door.current.step(dt);
        paint();
        return a || b;
    }).current;

    const say = (text: string) => { if (reading.current !== text) { reading.current = text; read.current?.(text); } };

    useEffect(() => { paint(); say('rest'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    const onMove = (e: React.PointerEvent) => {
        const svg = svgRef.current;
        if (!svg) return;
        const r = svg.getBoundingClientRect();
        const vx = ((e.clientX - r.left) / r.width) * VB_W;
        const vy = ((e.clientY - r.top) / r.height) * VB_H;
        const [gx, gy] = unproj(CAM, vx, vy, 0);                                   // the road
        const [bx, by] = unproj(CAM, vx, vy, (BOX.z0 + BOX.z1) / 2);               // the cargo box
        const k = Math.max(0, Math.min(1, intensity));
        const onRoad = gy > -5 && gy < 17;
        // the rest pose is the hit target (rule 1): the cargo box where the truck rests, not where it has got to
        const overCargo = bx > BOX.x0 + REST_OFFSET - 2 && bx < BOX.x1 + REST_OFFSET + 2 && by > BOX.y0 - 3 && by < BOX.y1 + 3;
        pos.current.t = Math.max(TRAVEL[0], Math.min(TRAVEL[1], REST_OFFSET + (gx - (BOX.x1 / 2 + REST_OFFSET)) * (0.35 + 0.35 * k)));
        door.current.set(overCargo ? 1 : REST_OPEN);
        say(overCargo ? 'cargo' : onRoad ? 'road' : 'rest');
        wake(tick);
    };

    const leave = () => { pos.current.t = REST_OFFSET; door.current.set(REST_OPEN); say('rest'); wake(tick); };

    return (
        <div
            className="hl-stage"
            tabIndex={0}
            role="group"
            aria-label={tr('Shipping truck. Press Enter to open Trucking.')}
            onPointerMove={onMove}
            onPointerLeave={leave}
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
                else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    pos.current.t = Math.max(TRAVEL[0], Math.min(TRAVEL[1], pos.current.t + (e.key === 'ArrowRight' ? 4 : -4)));
                    door.current.set(1);
                    wake(tick);
                }
            }}
            onBlur={leave}
        >
            <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true" focusable="false">
                <defs>
                    <clipPath id={`${uid}-door`}><path d={g.opening} /></clipPath>
                </defs>
                <path className="hl-plate" d={g.road.body} />
                <path className="hl-crease" d={g.road.crease} />
                <path className="hl-dash" d={g.dashes} />
                <g ref={truckRef} className="hl-truck">
                    <path className="hl-plate" d={g.chassis.body} />
                    <path className="hl-plate" d={g.box.body} />
                    <path className="hl-crease" d={g.box.crease} />
                    <path className="hl-slot" d={g.opening} />
                    <g clipPath={`url(#${uid}-door)`}>
                        {g.crates.map((c, i) => (
                            <g key={i}>
                                <path className="hl-plate" d={c.body} />
                                <path className="hl-crease" d={c.crease} />
                            </g>
                        ))}
                        <g ref={shutterRef} className="hl-shutter">
                            <path className="hl-face" d={g.opening} />
                            {[0.25, 0.5, 0.75].map(f => (
                                <path key={f} className="hl-crease" d={pathOf([proj(CAM, OPENING.x0, BOX.y1, OPENING.z0 + (OPENING.z1 - OPENING.z0) * f), proj(CAM, OPENING.x1, BOX.y1, OPENING.z0 + (OPENING.z1 - OPENING.z0) * f)], false)} />
                            ))}
                        </g>
                    </g>
                    <path className="hl-plate" d={g.cab.body} />
                    <path className="hl-crease" d={g.cab.crease} />
                    <path className="hl-face" d={g.windshield} />
                    <path className="hl-face" d={g.sideWindow} />
                    <path className="hl-mark hl-bright" d={g.headlight} />
                    {g.wheels.map((w, i) => (
                        <g key={w.cx}>
                            <path className="hl-plate" d={w.disc} />
                            <path className="hl-crease" d={w.hub} />
                            <path ref={el => { spokeRefs.current[i] = el; }} className="hl-spoke" />
                        </g>
                    ))}
                </g>
            </svg>
        </div>
    );
};
