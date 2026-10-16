import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    Cam,
    P2,
    VB_W,
    VB_H,
    proj,
    pathOf,
    hull,
    ring,
    prism,
    discZ,
    rectZ,
    rectY,
    rectX,
    Spring,
    wake,
    sleep,
} from './engine';
import './hairlineM5StickS3.css';

interface HairlineM5StickS3Props {
    title?: string;
    nodeId?: string;
    heapFree?: number;
    rssi?: number;
    interactive?: boolean;
    className?: string;
}

const CAM: Cam = { S: 4.4, cx: 200, cy: 185 };

const W = 28;
const L = 64;
const H = 14;
const R = 4.2;
const SCREEN_INSET = 3.2;

export const HairlineM5StickS3: React.FC<HairlineM5StickS3Props> = ({
    title = 'M5StickS3 ESP32-S3',
    nodeId = 'pico-m5s3-edge-01',
    heapFree = 184320,
    rssi = -58,
    interactive = true,
    className = '',
}) => {
    const clipId = useId();
    const wrapRef = useRef<HTMLDivElement>(null);

    const [isPressed, setIsPressed] = useState(false);
    const [displayMode, setDisplayMode] = useState<'wave' | 'telemetry' | 'qr'>('wave');
    const [wavePhase, setWavePhase] = useState(0);

    // Static M5StickS3 Geometry
    const geom = useMemo(() => {
        const chassis = prism(CAM, 0, 0, 0, W, L, H, R);

        // Top 8-pin header sockets (L = 64)
        const pins: string[] = [];
        for (let i = 0; i < 8; i++) {
            const px = 4.5 + i * 2.6;
            pins.push(discZ(CAM, px, L - 1.5, H + 0.1, 0.7));
        }

        // Bottom USB-C cutout (L = 0)
        const usbc = rectY(CAM, 0, (W - 8) / 2, (W + 8) / 2, 4, 10);

        // Screen bezel on front face
        const screenW = W - 2 * SCREEN_INSET;
        const screenL = 34;
        const screenY0 = 24;
        const screenRing = ring(SCREEN_INSET, screenY0, screenW, screenL, 2.5);
        const screenPath = pathOf(screenRing.map(([x, y]) => proj(CAM, x, y, H + 0.1)));

        // Front M5 Button (Y = 6 to 18)
        const btnW = 16;
        const btnL = 12;
        const btnX0 = (W - btnW) / 2;
        const btnY0 = 7;
        const btnRing = ring(btnX0, btnY0, btnW, btnL, 3.2);
        const btnPath = pathOf(btnRing.map(([x, y]) => proj(CAM, x, y, H + 0.6)));
        const btnCenter = proj(CAM, W / 2, btnY0 + btnL / 2, H + 0.8);

        // Side Buttons (Power & Reset on right edge)
        const pwrBtn = rectX(CAM, W, 32, 42, 5, 9);
        const rstBtn = rectX(CAM, W, 18, 24, 5, 9);

        return {
            chassis,
            pins,
            usbc,
            screenPath,
            screenW,
            screenL,
            screenY0,
            btnPath,
            btnCenter,
            pwrBtn,
            rstBtn,
        };
    }, []);

    // Live Oscilloscope Waveform Animation
    useEffect(() => {
        let isRunning = true;
        let lastTime = performance.now();

        const tick = (now: number) => {
            if (!isRunning) return;
            const dt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;
            setWavePhase((p) => p + 4.5 * dt);
            requestAnimationFrame(tick);
        };

        const animId = requestAnimationFrame(tick);
        return () => {
            isRunning = false;
            cancelAnimationFrame(animId);
        };
    }, []);

    // Screen Content Generator
    const screenContent = useMemo(() => {
        const { screenW, screenL, screenY0 } = geom;
        const screenBaseX = SCREEN_INSET;

        if (displayMode === 'wave') {
            const steps = 18;
            const pts: P2[] = [];
            for (let i = 0; i <= steps; i++) {
                const u = i / steps;
                const wx = screenBaseX + 1.5 + u * (screenW - 3);
                // Sine wave modulated by noise
                const amplitude = 5.5 * Math.sin(u * Math.PI * 3 + wavePhase);
                const wy = screenY0 + screenL / 2 + amplitude;
                pts.push(proj(CAM, wx, wy, H + 0.15));
            }
            return {
                type: 'wave',
                wavePath: pathOf(pts, false),
                label: 'RT-SINE 120Hz',
            };
        } else if (displayMode === 'telemetry') {
            const l1 = pathOf([proj(CAM, screenBaseX + 2, screenY0 + 26, H + 0.15), proj(CAM, screenBaseX + screenW - 2, screenY0 + 26, H + 0.15)], false);
            const l2 = pathOf([proj(CAM, screenBaseX + 2, screenY0 + 18, H + 0.15), proj(CAM, screenBaseX + screenW - 6, screenY0 + 18, H + 0.15)], false);
            const l3 = pathOf([proj(CAM, screenBaseX + 2, screenY0 + 10, H + 0.15), proj(CAM, screenBaseX + screenW - 4, screenY0 + 10, H + 0.15)], false);
            return {
                type: 'telemetry',
                lines: [l1, l2, l3],
                label: 'ESP32-S3 RTOS',
            };
        } else {
            // QR / Barcode matrix simulation
            const bars: string[] = [];
            for (let i = 0; i < 9; i++) {
                const bx = screenBaseX + 2 + i * 2.2;
                bars.push(pathOf([proj(CAM, bx, screenY0 + 6, H + 0.15), proj(CAM, bx, screenY0 + screenL - 6, H + 0.15)], false));
            }
            return {
                type: 'qr',
                bars,
                label: 'QR NFC SYNC',
            };
        }
    }, [displayMode, wavePhase, geom]);

    const handleButtonClick = () => {
        setIsPressed(true);
        setTimeout(() => setIsPressed(false), 160);
        // Toggle screen mode
        setDisplayMode((prev) => (prev === 'wave' ? 'telemetry' : prev === 'telemetry' ? 'qr' : 'wave'));
    };

    return (
        <div ref={wrapRef} className={`hl-m5s3-wrap ${className}`}>
            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="hl-m5s3-svg"
                preserveAspectRatio="xMidYMid meet"
                aria-label={`Hairline M5StickS3: ${nodeId}`}
            >
                <defs>
                    <clipPath id={clipId}>
                        <path d={geom.screenPath} />
                    </clipPath>
                </defs>

                {/* ── SHADOW ── */}
                <path
                    d={geom.chassis.body}
                    fill="rgba(0, 0, 0, 0.45)"
                    filter="blur(8px)"
                    transform="translate(3, 9)"
                />

                {/* ── HARDWARE CHASSIS ── */}
                <path d={geom.chassis.body} className="hl-m5s3-chassis" />
                <path d={geom.chassis.crease} className="hl-m5s3-bezel" />

                {/* Top GPIO Header Pins */}
                {geom.pins.map((p, i) => (
                    <path key={i} d={p} className="hl-m5s3-pin" />
                ))}

                {/* Bottom USB-C Port */}
                <path d={geom.usbc} fill="#000000" stroke="#00d2ff" strokeWidth={0.8} />

                {/* Side Buttons */}
                <path d={geom.pwrBtn} fill="#1e2530" stroke="rgba(255, 255, 255, 0.25)" strokeWidth={0.8} />
                <path d={geom.rstBtn} fill="#1e2530" stroke="rgba(255, 255, 255, 0.25)" strokeWidth={0.8} />

                {/* ── SCREEN TFT GLASS ── */}
                <path d={geom.screenPath} className="hl-m5s3-screen" />

                {/* ── DYNAMIC SCREEN CONTENT ── */}
                <g clipPath={`url(#${clipId})`}>
                    {screenContent.type === 'wave' && (
                        <path d={screenContent.wavePath} className="hl-m5s3-waveform" />
                    )}

                    {screenContent.type === 'telemetry' &&
                        screenContent.lines?.map((l, i) => (
                            <path key={i} d={l} stroke={i === 0 ? '#10b981' : i === 1 ? '#00d2ff' : '#f59e0b'} strokeWidth={1.5} />
                        ))}

                    {screenContent.type === 'qr' &&
                        screenContent.bars?.map((b, i) => (
                            <path key={i} d={b} stroke="#00d2ff" strokeWidth={1.4} />
                        ))}

                    {/* Mode Tag */}
                    <text
                        x={proj(CAM, W / 2, geom.screenY0 + geom.screenL - 3.5, H + 0.16)[0]}
                        y={proj(CAM, W / 2, geom.screenY0 + geom.screenL - 3.5, H + 0.16)[1]}
                        textAnchor="middle"
                        fill="#38bdf8"
                        fontSize={6}
                        fontFamily="monospace"
                        fontWeight="bold"
                    >
                        {screenContent.label}
                    </text>
                </g>

                {/* ── FRONT TACTILE M5 BUTTON ── */}
                <path
                    d={geom.btnPath}
                    className={`hl-m5s3-btn ${isPressed ? 'is-pressed' : ''}`}
                    onClick={handleButtonClick}
                >
                    <title>Click M5 Button to Toggle Screen</title>
                </path>
                <text
                    x={geom.btnCenter[0]}
                    y={geom.btnCenter[1] + 2}
                    textAnchor="middle"
                    fill={isPressed ? '#000000' : '#00d2ff'}
                    fontSize={7.5}
                    fontFamily="monospace"
                    fontWeight="900"
                    pointerEvents="none"
                >
                    M5
                </text>
            </svg>

            {/* Bottom Floating Telemetry */}
            <div className="hl-m5s3-telemetry">
                <span className="hl-pulse-dot" style={{ backgroundColor: '#00d2ff', boxShadow: '0 0 8px #00d2ff' }} />
                <span>{nodeId}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#10b981' }}>{rssi} dBm</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#f59e0b' }}>{Math.round(heapFree / 1024)} KB</span>
            </div>
        </div>
    );
};
