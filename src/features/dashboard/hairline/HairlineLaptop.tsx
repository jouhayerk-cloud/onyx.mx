import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    Cam,
    P2,
    P3,
    VB_W,
    VB_H,
    proj,
    pathOf,
    hull,
    ring,
    prism,
    rectZ,
    Spring,
    wake,
    sleep,
} from './engine';
import './hairlineLaptop.css';

interface HairlineLaptopProps {
    title?: string;
    hostName?: string;
    ipAddress?: string;
    modelName?: string;
    nvmeSpeed?: number;
    interactive?: boolean;
    initialAngle?: number; // degrees (15 shut to 125 open)
    className?: string;
}

const CAM: Cam = { S: 3.4, cx: 200, cy: 195 };

// Physical base & lid constants
const W = 100;
const D = 70;
const BASE_H = 3.6;
const LID_T = 2.4;
const HINGE_Y = D;
const HINGE_Z = BASE_H + LID_T / 2;

/** Helper to generate keyboard layout */
function generateKeyGrid(): Array<{ x: number; y: number; w: number; d: number }> {
    const keys: Array<{ x: number; y: number; w: number; d: number }> = [];
    const ku = 5.2; // Key unit size
    const x0 = (W - 14 * ku) / 2;
    let y = 14;

    // Function row
    for (let i = 0; i < 14; i++) {
        keys.push({ x: x0 + i * ku, y, w: ku * 0.9, d: ku * 0.6 });
    }
    y += ku * 0.8;

    // Numbers & letters rows (4 rows)
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 14; c++) {
            keys.push({ x: x0 + c * ku, y, w: ku * 0.9, d: ku * 0.9 });
        }
        y += ku * 1.05;
    }

    // Spacebar row
    keys.push({ x: x0, y, w: ku * 1.8, d: ku * 0.9 });
    keys.push({ x: x0 + ku * 2, y, w: ku * 1.5, d: ku * 0.9 });
    keys.push({ x: x0 + ku * 3.7, y, w: ku * 6.0, d: ku * 0.9 }); // Space
    keys.push({ x: x0 + ku * 9.9, y, w: ku * 1.5, d: ku * 0.9 });
    keys.push({ x: x0 + ku * 11.6, y, w: ku * 2.4, d: ku * 0.9 });

    return keys;
}

export const HairlineLaptop: React.FC<HairlineLaptopProps> = ({
    title = 'Onyx G7 Host',
    hostName = 'G7-NVMe-Mesh',
    ipAddress = '192.0.2.71',
    modelName = 'Colibrì MoE 35B',
    nvmeSpeed = 2850,
    interactive = true,
    initialAngle = 104,
    className = '',
}) => {
    const clipId = useId();
    const gradId = useId();
    const wrapRef = useRef<HTMLDivElement>(null);

    // Dynamic spring angle for lid
    const angleSpring = useRef(new Spring(initialAngle, 85, 14, 1));
    const [lidAngle, setLidAngle] = useState(initialAngle);
    const [activeKeyIdx, setActiveKeyIdx] = useState<number | null>(null);
    const [clickCount, setClickCount] = useState(0);

    // Static Base Geometry
    const baseGeom = useMemo(() => {
        const chassis = prism(CAM, 0, 0, 0, W, D, BASE_H, 4.5);
        const trackpad = {
            body: rectZ(CAM, BASE_H + 0.1, (W - 32) / 2, (W + 32) / 2, 2, 20),
        };
        const keyboardBay = rectZ(CAM, BASE_H + 0.05, 7, W - 7, 24, D - 6);
        const keys = generateKeyGrid().map((k) => ({
            ...k,
            path: rectZ(CAM, BASE_H + 0.5, k.x, k.x + k.w, k.y, k.y + k.d),
        }));

        // Hinge cylinder
        const hinge = prism(CAM, 10, HINGE_Y - 2.5, BASE_H - 1, W - 20, 5, LID_T + 1, 1.5);

        return { chassis, trackpad, keyboardBay, keys, hinge };
    }, []);

    // Pointer animation loop
    useEffect(() => {
        const tick = (dt: number): boolean => {
            const moving = angleSpring.current.step(dt);
            setLidAngle(angleSpring.current.x);
            return moving;
        };

        const handlePointerMove = (e: PointerEvent) => {
            if (!interactive || !wrapRef.current) return;
            const rect = wrapRef.current.getBoundingClientRect();
            const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            // Move pointer up -> lid opens wider (up to 124 deg), down -> nearly shut (25 deg)
            const targetDeg = 25 + (1 - relY) * 98;
            angleSpring.current.t = targetDeg;
            wake(tick);
        };

        const handlePointerLeave = () => {
            if (!interactive) return;
            angleSpring.current.t = initialAngle;
            wake(tick);
        };

        const wrap = wrapRef.current;
        if (wrap && interactive) {
            wrap.addEventListener('pointermove', handlePointerMove);
            wrap.addEventListener('pointerleave', handlePointerLeave);
        }

        return () => {
            if (wrap && interactive) {
                wrap.removeEventListener('pointermove', handlePointerMove);
                wrap.removeEventListener('pointerleave', handlePointerLeave);
            }
            sleep(tick);
        };
    }, [interactive, initialAngle]);

    // Computed Lid Geometry at current lidAngle
    const lidGeom = useMemo(() => {
        const rad = (lidAngle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Lid coordinate transform: u across (0 to W), v up the lid (0 to D), w thickness (-LID_T/2 to LID_T/2)
        const lidPoint = (u: number, v: number, w: number): P2 => {
            const y = HINGE_Y - v * cos - w * sin;
            const z = HINGE_Z + v * sin - w * cos;
            return proj(CAM, u, y, z);
        };

        // Screen Outer Plate (4 corners + thickness)
        const cornersFront: P2[] = [
            lidPoint(2, 0, LID_T / 2),
            lidPoint(W - 2, 0, LID_T / 2),
            lidPoint(W - 2, D, LID_T / 2),
            lidPoint(2, D, LID_T / 2),
        ];

        const cornersBack: P2[] = [
            lidPoint(2, 0, -LID_T / 2),
            lidPoint(W - 2, 0, -LID_T / 2),
            lidPoint(W - 2, D, -LID_T / 2),
            lidPoint(2, D, -LID_T / 2),
        ];

        const plateHull = pathOf(hull([...cornersFront, ...cornersBack]));
        const faceFront = pathOf(cornersFront);

        // Display Glass Screen Inset (bezel 4.5mm)
        const screenCorners: P2[] = [
            lidPoint(5.5, 4, LID_T / 2 + 0.1),
            lidPoint(W - 5.5, 4, LID_T / 2 + 0.1),
            lidPoint(W - 5.5, D - 6, LID_T / 2 + 0.1),
            lidPoint(5.5, D - 6, LID_T / 2 + 0.1),
        ];
        const screenPath = pathOf(screenCorners);

        // Code and Terminal Lines on Screen
        const codeLines = [
            { path: pathOf([lidPoint(10, D - 13, 1.4), lidPoint(36, D - 13, 1.4)], false), color: 'hl-code-cyan' },
            { path: pathOf([lidPoint(39, D - 13, 1.4), lidPoint(68, D - 13, 1.4)], false), color: 'hl-code-emerald' },
            { path: pathOf([lidPoint(10, D - 21, 1.4), lidPoint(48, D - 21, 1.4)], false), color: 'hl-code-purple' },
            { path: pathOf([lidPoint(51, D - 21, 1.4), lidPoint(86, D - 21, 1.4)], false), color: 'hl-code-amber' },
            { path: pathOf([lidPoint(15, D - 29, 1.4), lidPoint(58, D - 29, 1.4)], false), color: 'hl-code-cyan' },
            { path: pathOf([lidPoint(15, D - 37, 1.4), lidPoint(75, D - 37, 1.4)], false), color: 'hl-code-emerald' },
            { path: pathOf([lidPoint(10, D - 45, 1.4), lidPoint(42, D - 45, 1.4)], false), color: 'hl-code-cyan' },
        ];

        // Active blinking cursor
        const cursor = pathOf([lidPoint(45, D - 45, 1.4), lidPoint(50, D - 45, 1.4)], false);

        // Traffic Light Window Dots
        const windowDots = [
            { pt: lidPoint(9, D - 8, 1.4), color: '#ef4444' },
            { pt: lidPoint(13, D - 8, 1.4), color: '#f59e0b' },
            { pt: lidPoint(17, D - 8, 1.4), color: '#10b981' },
        ];

        // Webcam dot
        const webcam = lidPoint(W / 2, D - 3, 1.4);

        return {
            plateHull,
            faceFront,
            screenPath,
            codeLines,
            cursor,
            windowDots,
            webcam,
        };
    }, [lidAngle]);

    return (
        <div ref={wrapRef} className={`hl-laptop-wrap ${className}`}>
            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="hl-laptop-svg"
                preserveAspectRatio="xMidYMid meet"
                aria-label={`Hairline Laptop: ${title}`}
            >
                <defs>
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity="0.8" />
                    </linearGradient>
                    <clipPath id={clipId}>
                        <path d={lidGeom.screenPath} />
                    </clipPath>
                </defs>

                {/* ── BASE LAYER ── */}
                <g id="base-chassis">
                    {/* Shadow underneath base */}
                    <path
                        d={baseGeom.chassis.body}
                        className="hl-line"
                        fill="rgba(0, 0, 0, 0.45)"
                        stroke="none"
                        transform="translate(0, 8)"
                        filter="blur(6px)"
                    />

                    {/* Main Aluminum Base Hull */}
                    <path d={baseGeom.chassis.body} className="hl-line hl-chassis-body" />
                    <path d={baseGeom.chassis.crease} className="hl-line hl-chassis-rim" />

                    {/* Hinge Barrel */}
                    <path d={baseGeom.hinge.body} className="hl-line" fill="#141920" stroke="rgba(255, 255, 255, 0.18)" strokeWidth={1} />

                    {/* Keyboard Bay */}
                    <path d={baseGeom.keyboardBay} className="hl-line" fill="#090c0f" stroke="rgba(0, 210, 255, 0.18)" strokeWidth={0.9} />

                    {/* Keys Grid */}
                    {baseGeom.keys.map((k, i) => (
                        <path
                            key={i}
                            d={k.path}
                            className={`hl-line hl-key-body ${activeKeyIdx === i ? 'hl-key-active' : ''}`}
                            onPointerDown={() => setActiveKeyIdx(i)}
                            onPointerUp={() => setActiveKeyIdx(null)}
                        />
                    ))}

                    {/* Trackpad */}
                    <path
                        d={baseGeom.trackpad.body}
                        className="hl-line hl-trackpad"
                        onClick={() => setClickCount((c) => c + 1)}
                    >
                        <title>Click Trackpad</title>
                    </path>
                </g>

                {/* ── LID LAYER (Drawn back-to-front based on angle) ── */}
                <g id="lid-assembly">
                    {/* Outer Lid Hull */}
                    <path d={lidGeom.plateHull} className="hl-line hl-screen-plate" />
                    <path d={lidGeom.faceFront} className="hl-line hl-chassis-rim" strokeOpacity={0.5} />

                    {/* Screen Glass Surface */}
                    <path d={lidGeom.screenPath} className="hl-line hl-screen-display" />

                    {/* Inside Screen Visuals */}
                    <g clipPath={`url(#${clipId})`}>
                        {/* Traffic lights */}
                        {lidGeom.windowDots.map((dot, i) => (
                            <circle key={i} cx={dot.pt[0]} cy={dot.pt[1]} r={1.8} fill={dot.color} />
                        ))}

                        {/* Webcam */}
                        <circle cx={lidGeom.webcam[0]} cy={lidGeom.webcam[1]} r={1.2} fill="#00d2ff" opacity={0.7} />

                        {/* Code Syntax Lines */}
                        {lidGeom.codeLines.map((line, idx) => (
                            <path key={idx} d={line.path} className={`hl-line ${line.color}`} />
                        ))}

                        {/* Active Blinking Cursor */}
                        <path d={lidGeom.cursor} className="hl-line hl-code-cyan hl-cursor-blink" />
                    </g>
                </g>
            </svg>

            {/* Tactile Telemetry Badge HUD */}
            <div className="hl-telemetry-badge">
                <span className="hl-pulse-dot" />
                <span>{ipAddress}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#10b981' }}>{nvmeSpeed} MB/s</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#e2e8f0' }}>{Math.round(lidAngle)}°</span>
            </div>
        </div>
    );
};
