import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    Cam,
    P2,
    VB_W,
    VB_H,
    proj,
    unproj,
    pathOf,
    ring,
    prism,
    discZ,
    Spring,
    wake,
    sleep,
} from './engine';
import './hairlineTablet.css';

interface HairlineTabletProps {
    title?: string;
    deviceName?: string;
    ipAddress?: string;
    interactive?: boolean;
    className?: string;
}

const CAM: Cam = { S: 3.6, cx: 200, cy: 190 };

const W = 108;
const D = 74;
const H = 4.8;
const R = 7.5;
const SCREEN_INSET = 4.2;

interface TouchRipple {
    id: number;
    worldX: number;
    worldY: number;
    r: number;
    opacity: number;
}

export const HairlineTablet: React.FC<HairlineTabletProps> = ({
    title = 'Onyx Pad Pro Terminal',
    deviceName = 'Field Logistics iPad Pro',
    ipAddress = '192.0.2.105',
    interactive = true,
    className = '',
}) => {
    const clipId = useId();
    const wrapRef = useRef<HTMLDivElement>(null);

    // Dynamic Touch Tracking
    const [touchPoint, setTouchPoint] = useState<[number, number]>([W / 2, D / 2]);
    const [isPointerDown, setIsPointerDown] = useState(false);
    const [ripples, setRipples] = useState<TouchRipple[]>([]);
    const nextRippleId = useRef(0);

    // Static Tablet Geometry
    const geom = useMemo(() => {
        const chassis = prism(CAM, 0, 0, 0, W, D, H, R);

        // Screen bezel ring on top surface
        const screenRing = ring(SCREEN_INSET, SCREEN_INSET, W - 2 * SCREEN_INSET, D - 2 * SCREEN_INSET, R - 2.0);
        const screenPath = pathOf(screenRing.map(([x, y]) => proj(CAM, x, y, H + 0.1)));

        // Front Camera Pinhole on top edge
        const camPinhole = discZ(CAM, W / 2, D - SCREEN_INSET / 2, H + 0.15, 0.8);

        // Interactive Matrix Grid Nodes (4x3 layout)
        const gridNodes: Array<{ x: number; y: number; path: string }> = [];
        const cols = 5;
        const rows = 4;
        const xStep = (W - 2 * SCREEN_INSET - 16) / (cols - 1);
        const yStep = (D - 2 * SCREEN_INSET - 16) / (rows - 1);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const nx = SCREEN_INSET + 8 + c * xStep;
                const ny = SCREEN_INSET + 8 + r * yStep;
                gridNodes.push({
                    x: nx,
                    y: ny,
                    path: discZ(CAM, nx, ny, H + 0.15, 2.2),
                });
            }
        }

        return { chassis, screenPath, camPinhole, gridNodes };
    }, []);

    // Animation Loop for Radiating Touch Ripples
    useEffect(() => {
        let isRunning = true;
        let lastTime = performance.now();

        const tick = (now: number) => {
            if (!isRunning) return;
            const dt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;

            setRipples((prev) =>
                prev
                    .map((rp) => ({
                        ...rp,
                        r: rp.r + 28 * dt,
                        opacity: rp.opacity - 1.2 * dt,
                    }))
                    .filter((rp) => rp.opacity > 0)
            );

            requestAnimationFrame(tick);
        };

        const animId = requestAnimationFrame(tick);
        return () => {
            isRunning = false;
            cancelAnimationFrame(animId);
        };
    }, []);

    // Handle Pointer Movement to Project onto Tablet Screen
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!interactive || !wrapRef.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        const sx = ((e.clientX - rect.left) / rect.width) * VB_W;
        const sy = ((e.clientY - rect.top) / rect.height) * VB_H;

        // Unproject screen coordinate to tablet plane (Z = H)
        const [wx, wy] = unproj(CAM, sx, sy, H);
        const clampedX = Math.max(SCREEN_INSET + 2, Math.min(W - SCREEN_INSET - 2, wx));
        const clampedY = Math.max(SCREEN_INSET + 2, Math.min(D - SCREEN_INSET - 2, wy));

        setTouchPoint([clampedX, clampedY]);

        // Spawn a trailing touch ripple periodically
        if (Math.random() > 0.45 || isPointerDown) {
            setRipples((prev) => [
                ...prev.slice(-8),
                {
                    id: nextRippleId.current++,
                    worldX: clampedX,
                    worldY: clampedY,
                    r: 1.5,
                    opacity: isPointerDown ? 0.95 : 0.6,
                },
            ]);
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!interactive) return;
        setIsPointerDown(true);
        handlePointerMove(e);
        // Force spawn high-intensity ripple
        setRipples((prev) => [
            ...prev,
            {
                id: nextRippleId.current++,
                worldX: touchPoint[0],
                worldY: touchPoint[1],
                r: 2,
                opacity: 1,
            },
        ]);
    };

    // Crosshairs and Projected Guideline Paths
    const guidelines = useMemo(() => {
        const [tx, ty] = touchPoint;
        const pTouch = proj(CAM, tx, ty, H + 0.2);

        // Line along X
        const pX0 = proj(CAM, SCREEN_INSET + 2, ty, H + 0.15);
        const pX1 = proj(CAM, W - SCREEN_INSET - 2, ty, H + 0.15);
        const lineX = pathOf([pX0, pX1], false);

        // Line along Y
        const pY0 = proj(CAM, tx, SCREEN_INSET + 2, H + 0.15);
        const pY1 = proj(CAM, tx, D - SCREEN_INSET - 2, H + 0.15);
        const lineY = pathOf([pY0, pY1], false);

        return { pTouch, lineX, lineY };
    }, [touchPoint]);

    return (
        <div
            ref={wrapRef}
            className={`hl-tablet-wrap ${className}`}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerUp={() => setIsPointerDown(false)}
            onPointerLeave={() => setIsPointerDown(false)}
        >
            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="hl-tablet-svg"
                preserveAspectRatio="xMidYMid meet"
                aria-label={`Hairline Tablet: ${deviceName}`}
            >
                <defs>
                    <clipPath id={clipId}>
                        <path d={geom.screenPath} />
                    </clipPath>
                </defs>

                {/* ── TABLET SHADOW ── */}
                <path
                    d={geom.chassis.body}
                    fill="rgba(0, 0, 0, 0.45)"
                    filter="blur(8px)"
                    transform="translate(2, 9)"
                />

                {/* ── CHASSIS & SCREEN RIM ── */}
                <path d={geom.chassis.body} className="hl-tablet-chassis" />
                <path d={geom.chassis.crease} className="hl-tablet-bezel" />

                {/* ── SCREEN GLASS SURFACE ── */}
                <path d={geom.screenPath} className="hl-tablet-glass" />
                <path d={geom.camPinhole} fill="#818cf8" opacity={0.6} />

                {/* ── INTERACTIVE CANVAS (CLIPPED TO SCREEN) ── */}
                <g clipPath={`url(#${clipId})`}>
                    {/* Background Grid Nodes */}
                    {geom.gridNodes.map((node, i) => {
                        const dist = Math.hypot(node.x - touchPoint[0], node.y - touchPoint[1]);
                        const isActive = dist < 14;
                        return (
                            <path
                                key={i}
                                d={node.path}
                                className={`hl-ui-node ${isActive ? 'is-active' : ''}`}
                            />
                        );
                    })}

                    {/* Touch Crosshair Guidelines */}
                    <path d={guidelines.lineX} className="hl-touch-crosshair" />
                    <path d={guidelines.lineY} className="hl-touch-crosshair" />

                    {/* Radiating Multi-Touch Ripples */}
                    {ripples.map((rp) => (
                        <path
                            key={rp.id}
                            d={discZ(CAM, rp.worldX, rp.worldY, H + 0.16, rp.r)}
                            className="hl-touch-ring"
                            strokeOpacity={rp.opacity}
                        />
                    ))}

                    {/* Active Touch Contact Point */}
                    <circle
                        cx={guidelines.pTouch[0]}
                        cy={guidelines.pTouch[1]}
                        r={isPointerDown ? 4.5 : 3}
                        fill="#00d2ff"
                        filter="drop-shadow(0 0 6px #00d2ff)"
                    />
                </g>
            </svg>

            {/* Bottom Floating Telemetry */}
            <div className="hl-tablet-telemetry">
                <span className="hl-pulse-dot" style={{ backgroundColor: '#818cf8', boxShadow: '0 0 8px #818cf8' }} />
                <span>{deviceName}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#00d2ff' }}>
                    X:{Math.round(touchPoint[0])} Y:{Math.round(touchPoint[1])}
                </span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#10b981' }}>{isPointerDown ? 'TOUCH' : 'HOVER'}</span>
            </div>
        </div>
    );
};
