import React, { useEffect, useId, useMemo, useRef } from 'react';
import { tr } from '../../../lib/i18n';
import { type Cam, VB_W, VB_H, prism, rectY, rectX, discY, pathOf, proj, unproj, shift, Spring, Tween, wake, sleep } from './engine';
import './itemCargoTruck.css';

/**
 * Shipping as a 3D Freight Cargo Box Truck on a Road.
 * Upgraded from @lucasmarkes/hairline Truck to full color with 4 internal 3D crates,
 * rolling shutter door, rotating spoked wheels, and interactive Springs.
 */

const CAM: Cam = { S: 5.0, cx: 170, cy: 149 };
const BOX = { x0: 0, x1: 22, y0: 0, y1: 11, z0: 3.4, z1: 17 };
const OPENING = { x0: 3, x1: 19, z0: 5, z1: 15 };
const WHEELS = [4.5, 11.5, 26.5];
const WHEEL_R = 2.6;
const WHEEL_Z = 3.0;
const TRAVEL = [-7, 9];
const REST_OFFSET = -1.5;
const REST_OPEN = 0.16;

const CRATES = [
    { code: 'ONYX', name: tr('Shipping Cargo · Onyx Stone Vessel'), color: '#00aeef', x: 3.6, w: 3.4, h: 5.6 },
    { code: 'BOX', name: tr('Shipping Cargo · Boxes.py Laser Crate'), color: '#f2b53c', x: 7.4, w: 3.6, h: 6.8 },
    { code: 'SLAB', name: tr('Shipping Cargo · Natural Granite Slab'), color: '#35d0a2', x: 11.4, w: 3.3, h: 5.0 },
    { code: 'LAMP', name: tr('Shipping Cargo · Calibrated Lamp Unit'), color: '#b85bf8', x: 15.1, w: 3.4, h: 6.2 },
] as const;

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
    crates: {
        code: string;
        name: string;
        color: string;
        body: string;
        crease: string;
        gx: number;
    }[];
    wheels: { disc: string; hub: string; cx: number }[];
}

let cached: Geometry | null = null;
function geometry(): Geometry {
    if (cached) return cached;

    const road = prism(CAM, -18, -3.5, 0, 66, 20, 0.9, 1.4);
    const dashes = [-14, -4, 6, 16, 26, 36]
        .map(x => pathOf([proj(CAM, x, 14, 0.9), proj(CAM, x + 5, 14, 0.9)], false))
        .join('');

    const chassis = prism(CAM, -0.6, 0.5, 2.0, 31.6, 10, 1.4, 0.5);
    const box = prism(CAM, BOX.x0, BOX.y0, BOX.z0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0, BOX.z1 - BOX.z0, 1.6);
    const cab = prism(CAM, 22.6, 0.6, 3.4, 8.4, 9.8, 8.6, 2.2);

    const crates = CRATES.map(c => {
        const sol = prism(CAM, c.x, 5.8, OPENING.z0 + 0.2, c.w, 4.4, c.h, 0.45);
        return {
            code: c.code,
            name: c.name,
            color: c.color,
            body: sol.body,
            crease: sol.crease,
            gx: c.x + c.w / 2,
        };
    });

    const wheels = WHEELS.map(cx => ({
        disc: discY(CAM, cx, 11.4, WHEEL_Z, WHEEL_R),
        hub: discY(CAM, cx, 11.4, WHEEL_Z, 0.9, 10),
        cx,
    }));

    cached = {
        road,
        dashes,
        chassis,
        box,
        cab,
        windshield: rectX(CAM, 31, 1.8, 9.2, 7.2, 11),
        sideWindow: rectY(CAM, 10.4, 24.2, 29.6, 7.4, 11),
        headlight: rectX(CAM, 31, 7.6, 9.0, 4.2, 5.2),
        opening: rectY(CAM, BOX.y1, OPENING.x0, OPENING.x1, OPENING.z0, OPENING.z1),
        crates,
        wheels,
    };
    return cached;
}

/** Two spokes of a wheel, turned by angle radians */
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

export interface ItemCargoTruckProps {
    onOpen: () => void;
    onRead?: (text: string) => void;
    intensity?: number;
    label?: string;
    focused?: boolean;
}

export const ItemCargoTruck: React.FC<ItemCargoTruckProps> = ({
    onOpen,
    onRead,
    intensity = 0.65,
    label = tr('Shipping truck. Press Enter to open Trucking.'),
    focused = false,
}) => {
    const g = useMemo(geometry, []);
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    const svgRef = useRef<SVGSVGElement | null>(null);
    const truckRef = useRef<SVGGElement | null>(null);
    const shutterRef = useRef<SVGGElement | null>(null);
    const spokeRefs = useRef<(SVGPathElement | null)[]>([]);
    const crateRefs = useRef<(SVGGElement | null)[]>([]);

    const pos = useRef(new Spring(REST_OFFSET));
    const door = useRef(Object.assign(new Tween(), { value: REST_OPEN, from: REST_OPEN, to: REST_OPEN }));
    const crateSprings = useRef(CRATES.map(() => new Spring(0)));

    const reading = useRef('');
    const read = useRef(onRead);
    read.current = onRead;

    const paint = () => {
        const off = pos.current.x;
        const [sx, sy] = shift(CAM, off, 0, 0);
        if (truckRef.current) truckRef.current.style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px)`;

        // Shutter lift up the screen
        const lift = shift(CAM, 0, 0, OPENING.z1 - OPENING.z0)[1];
        if (shutterRef.current) shutterRef.current.style.transform = `translateY(${(lift * door.current.value).toFixed(2)}px)`;

        // Wheels rotation
        g.wheels.forEach((w, i) => spokeRefs.current[i]?.setAttribute('d', spokes(w.cx, -off / WHEEL_R)));

        // Crates slight lift
        const [, dyZ] = shift(CAM, 0, 0, 1);
        crateSprings.current.forEach((sp, i) => {
            const el = crateRefs.current[i];
            if (el) el.style.transform = `translateY(${(sp.x * dyZ).toFixed(2)}px)`;
        });
    };

    const tick = useRef((dt: number): boolean => {
        const a = pos.current.step(dt);
        const b = door.current.step(dt);
        let cMove = false;
        crateSprings.current.forEach(sp => {
            if (sp.step(dt)) cMove = true;
        });
        paint();
        return a || b || cMove;
    }).current;

    const say = (text: string) => {
        if (reading.current !== text) {
            reading.current = text;
            read.current?.(text);
        }
    };

    useEffect(() => {
        paint();
        say('Shipping · Standby');
        return () => { sleep(tick); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onMove = (e: React.PointerEvent) => {
        const svg = svgRef.current;
        if (!svg) return;
        const r = svg.getBoundingClientRect();
        const vx = ((e.clientX - r.left) / r.width) * VB_W;
        const vy = ((e.clientY - r.top) / r.height) * VB_H;
        const [gx, gy] = unproj(CAM, vx, vy, 0);
        const [bx, by] = unproj(CAM, vx, vy, (BOX.z0 + BOX.z1) / 2);
        const k = Math.max(0, Math.min(1, intensity));

        const onRoad = gy > -5 && gy < 17;
        const overCargo = bx > BOX.x0 + REST_OFFSET - 2 && bx < BOX.x1 + REST_OFFSET + 2 && by > BOX.y0 - 3 && by < BOX.y1 + 3;

        const targetPos = Math.max(TRAVEL[0], Math.min(TRAVEL[1], REST_OFFSET + (gx - (BOX.x1 / 2 + REST_OFFSET)) * (0.35 + 0.35 * k)));
        const targetDoor = overCargo ? 1.0 : REST_OPEN;

        // Determine if hovering specific crate inside bay
        let hitCrate = -1;
        if (overCargo) {
            const relX = bx - REST_OFFSET;
            g.crates.forEach((cr, i) => {
                if (Math.abs(relX - cr.gx) < 2.0) hitCrate = i;
            });
        }

        const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reducedMotion) {
            pos.current.x = targetPos;
            pos.current.t = targetPos;
            door.current.value = targetDoor;
            door.current.to = targetDoor;
            crateSprings.current.forEach((sp, i) => {
                sp.x = i === hitCrate ? 2.5 : 0;
                sp.t = i === hitCrate ? 2.5 : 0;
            });
            paint();
        } else {
            pos.current.t = targetPos;
            door.current.set(targetDoor);
            crateSprings.current.forEach((sp, i) => {
                sp.t = i === hitCrate ? 2.5 : 0;
            });
            wake(tick);
        }

        if (hitCrate >= 0) {
            say(g.crates[hitCrate].name);
        } else if (overCargo) {
            say(tr('Shipping · Cargo Bay Open'));
        } else if (onRoad) {
            say(tr('Shipping · Road Transit'));
        } else {
            say('Shipping · Standby');
        }
    };

    const aimCrate = (crateIdx: number | null) => {
        const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (crateIdx === null) {
            if (reducedMotion) {
                pos.current.x = REST_OFFSET;
                pos.current.t = REST_OFFSET;
                door.current.value = REST_OPEN;
                door.current.to = REST_OPEN;
                crateSprings.current.forEach(sp => { sp.x = 0; sp.t = 0; });
                paint();
            } else {
                pos.current.t = REST_OFFSET;
                door.current.set(REST_OPEN);
                crateSprings.current.forEach(sp => { sp.t = 0; });
                wake(tick);
            }
            say('Shipping · Standby');
            return;
        }

        const targetPos = Math.max(TRAVEL[0], Math.min(TRAVEL[1], REST_OFFSET + (crateIdx - 1.5) * 1.5));
        const targetDoor = 1.0;

        if (reducedMotion) {
            pos.current.x = targetPos;
            pos.current.t = targetPos;
            door.current.value = targetDoor;
            door.current.to = targetDoor;
            crateSprings.current.forEach((sp, i) => {
                sp.x = i === crateIdx ? 2.5 : 0;
                sp.t = i === crateIdx ? 2.5 : 0;
            });
            paint();
        } else {
            pos.current.t = targetPos;
            door.current.set(targetDoor);
            crateSprings.current.forEach((sp, i) => {
                sp.t = i === crateIdx ? 2.5 : 0;
            });
            wake(tick);
        }
        say(g.crates[crateIdx].name);
    };

    const leave = () => {
        aimCrate(null);
    };

    // Focus-driven auto-animation for mobile carousel and keyboard focus
    useEffect(() => {
        if (!focused) {
            aimCrate(null);
            return;
        }
        let step = 0;
        aimCrate(step);
        const timer = window.setInterval(() => {
            step = (step + 1) % CRATES.length;
            aimCrate(step);
        }, 1150);
        return () => {
            window.clearInterval(timer);
            aimCrate(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focused]);

    return (
        <div
            className="hl-truck-stage hl-stage"
            tabIndex={0}
            role="group"
            aria-label={label}
            onPointerMove={onMove}
            onPointerLeave={leave}
            onClick={onOpen}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen();
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
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

                {/* Road and dashed center lines */}
                <path className="hl-plate" d={g.road.body} />
                <path className="hl-crease" d={g.road.crease} />
                <path className="hl-dash" d={g.dashes} />

                {/* Truck Group */}
                <g ref={truckRef} className="hl-truck">
                    <path className="hl-plate" d={g.chassis.body} />
                    <path className="hl-plate" d={g.box.body} />
                    <path className="hl-crease" d={g.box.crease} />
                    <path className="hl-slot" d={g.opening} />

                    {/* Inside Cargo Bay behind Shutter */}
                    <g clipPath={`url(#${uid}-door)`}>
                        {g.crates.map((c, i) => (
                            <g
                                key={c.code}
                                ref={el => { crateRefs.current[i] = el; }}
                                className="hl-truck-crate"
                                style={{ '--c': c.color } as React.CSSProperties}
                            >
                                <path className="hl-crate-body" d={c.body} />
                                <path className="hl-crate-crease" d={c.crease} />
                            </g>
                        ))}
                        <g ref={shutterRef} className="hl-shutter">
                            <path className="hl-face" d={g.opening} />
                            {[0.25, 0.5, 0.75].map(f => (
                                <path
                                    key={f}
                                    className="hl-crease"
                                    d={pathOf([
                                        proj(CAM, OPENING.x0, BOX.y1, OPENING.z0 + (OPENING.z1 - OPENING.z0) * f),
                                        proj(CAM, OPENING.x1, BOX.y1, OPENING.z0 + (OPENING.z1 - OPENING.z0) * f),
                                    ], false)}
                                />
                            ))}
                        </g>
                    </g>

                    {/* Cab, Windows and Headlight */}
                    <path className="hl-plate" d={g.cab.body} />
                    <path className="hl-crease" d={g.cab.crease} />
                    <path className="hl-face" d={g.windshield} />
                    <path className="hl-face" d={g.sideWindow} />
                    <path className="hl-mark hl-bright" d={g.headlight} />

                    {/* Wheels and rotating spokes */}
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
