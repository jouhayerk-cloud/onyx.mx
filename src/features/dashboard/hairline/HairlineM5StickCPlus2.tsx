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
import './hairlineM5StickCPlus2.css';

interface HairlineM5StickCPlus2Props {
    title?: string;
    nodeId?: string;
    batteryPct?: number;
    tempC?: number;
    interactive?: boolean;
    className?: string;
}

const CAM: Cam = { S: 4.4, cx: 200, cy: 185 };

const W = 28;
const L = 64;
const H = 14.5;
const R = 4.2;
const SCREEN_INSET = 3.2;

export const HairlineM5StickCPlus2: React.FC<HairlineM5StickCPlus2Props> = ({
    title = 'M5StickC PLUS 2',
    nodeId = 'pico-m5cplus2-beacon',
    batteryPct = 88,
    tempC = 33.4,
    interactive = true,
    className = '',
}) => {
    const clipId = useId();
    const wrapRef = useRef<HTMLDivElement>(null);

    // Dynamic IMU pitch/roll springs
    const pitchSpring = useRef(new Spring(0, 80, 14, 1));
    const rollSpring = useRef(new Spring(0, 80, 14, 1));

    const [pitch, setPitch] = useState(0);
    const [roll, setRoll] = useState(0);
    const [isPressed, setIsPressed] = useState(false);
    const [imuMode, setImuMode] = useState<'horizon' | 'gforce' | 'beacon'>('horizon');

    // Pointer movement tracks simulated 6-axis IMU tilt
    useEffect(() => {
        const tick = (dt: number): boolean => {
            const m1 = pitchSpring.current.step(dt);
            const m2 = rollSpring.current.step(dt);
            setPitch(pitchSpring.current.x);
            setRoll(rollSpring.current.x);
            return m1 || m2;
        };

        const handlePointerMove = (e: PointerEvent) => {
            if (!interactive || !wrapRef.current) return;
            const rect = wrapRef.current.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
            const relY = (e.clientY - rect.top) / rect.height - 0.5;

            pitchSpring.current.t = relY * 42; // +/- 21 deg
            rollSpring.current.t = relX * 42;  // +/- 21 deg
            wake(tick);
        };

        const handlePointerLeave = () => {
            if (!interactive) return;
            pitchSpring.current.t = 0;
            rollSpring.current.t = 0;
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
    }, [interactive]);

    // Static Orange Casing Geometry
    const geom = useMemo(() => {
        const chassis = prism(CAM, 0, 0, 0, W, L, H, R);

        // Top IR LED & Power LED (L = 64)
        const irDiode = discZ(CAM, W / 2, L - 1.5, H + 0.1, 1.2);
        const pwrLed = discZ(CAM, 5, L - 3, H + 0.15, 0.7);

        // Bottom Grove Port (HY2.0-4P at L = 0)
        const grovePort = rectY(CAM, 0, (W - 14) / 2, (W + 14) / 2, 3, 11);

        // Screen bezel on front face
        const screenW = W - 2 * SCREEN_INSET;
        const screenL = 34;
        const screenY0 = 24;
        const screenRing = ring(SCREEN_INSET, screenY0, screenW, screenL, 2.5);
        const screenPath = pathOf(screenRing.map(([x, y]) => proj(CAM, x, y, H + 0.1)));

        // Front tactile M5 Button (Y = 6 to 18)
        const btnW = 16;
        const btnL = 12;
        const btnX0 = (W - btnW) / 2;
        const btnY0 = 7;
        const btnRing = ring(btnX0, btnY0, btnW, btnL, 3.2);
        const btnPath = pathOf(btnRing.map(([x, y]) => proj(CAM, x, y, H + 0.6)));
        const btnCenter = proj(CAM, W / 2, btnY0 + btnL / 2, H + 0.8);

        // Side Buttons (Btn B on right, Power on left)
        const btnB = rectX(CAM, W, 22, 32, 5, 9);
        const btnPwr = rectX(CAM, 0, 36, 46, 5, 9);

        return {
            chassis,
            irDiode,
            pwrLed,
            grovePort,
            screenPath,
            screenW,
            screenL,
            screenY0,
            btnPath,
            btnCenter,
            btnB,
            btnPwr,
        };
    }, []);

    // IMU Screen Visuals
    const imuVisuals = useMemo(() => {
        const { screenW, screenL, screenY0 } = geom;
        const cx = SCREEN_INSET + screenW / 2;
        const cy = screenY0 + screenL / 2;

        if (imuMode === 'horizon') {
            // Artificial horizon line tilted by roll and offset by pitch
            const rollRad = (roll * Math.PI) / 180;
            const cos = Math.cos(rollRad);
            const sin = Math.sin(rollRad);
            const halfW = screenW / 2 - 2;
            const pitchOffset = (pitch / 25) * 6;

            const p1 = proj(CAM, cx - halfW * cos, cy - halfW * sin + pitchOffset, H + 0.15);
            const p2 = proj(CAM, cx + halfW * cos, cy + halfW * sin + pitchOffset, H + 0.15);
            const horizonLine = pathOf([p1, p2], false);

            // Bubble Level Indicator
            const bubblePt = proj(CAM, cx + (roll / 25) * 5, cy + pitchOffset, H + 0.18);

            return {
                type: 'horizon',
                horizonLine,
                bubblePt,
                label: `P:${Math.round(pitch)}° R:${Math.round(roll)}°`,
            };
        } else if (imuMode === 'gforce') {
            // G-Force Vector crosshairs
            const gx = (roll / 25) * 6;
            const gy = (pitch / 25) * 6;
            const pCenter = proj(CAM, cx, cy, H + 0.15);
            const pTarget = proj(CAM, cx + gx, cy + gy, H + 0.18);
            const vectorLine = pathOf([pCenter, pTarget], false);

            return {
                type: 'gforce',
                vectorLine,
                pTarget,
                label: 'MPU6886 6-AXIS',
            };
        } else {
            // Warehouse Beacon Pulse
            return {
                type: 'beacon',
                pCenter: proj(CAM, cx, cy, H + 0.15),
                label: 'BEACON 2.4GHz',
            };
        }
    }, [imuMode, pitch, roll, geom]);

    const handleButtonClick = () => {
        setIsPressed(true);
        setTimeout(() => setIsPressed(false), 160);
        setImuMode((prev) => (prev === 'horizon' ? 'gforce' : prev === 'gforce' ? 'beacon' : 'horizon'));
    };

    return (
        <div ref={wrapRef} className={`hl-m5cplus-wrap ${className}`}>
            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="hl-m5cplus-svg"
                preserveAspectRatio="xMidYMid meet"
                aria-label={`Hairline M5StickC PLUS 2: ${nodeId}`}
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

                {/* ── VIBRANT ORANGE CHASSIS ── */}
                <path d={geom.chassis.body} className="hl-m5cplus-chassis" />
                <path d={geom.chassis.crease} className="hl-m5cplus-bezel" />

                {/* Top Diodes & LEDs */}
                <path d={geom.irDiode} fill="#000000" stroke="#f97316" strokeWidth={0.8} />
                <path d={geom.pwrLed} fill="#ef4444" filter="drop-shadow(0 0 3px #ef4444)" />

                {/* Bottom Grove Port */}
                <path d={geom.grovePort} className="hl-m5cplus-grove" />

                {/* Side Buttons */}
                <path d={geom.btnB} fill="#c2410c" stroke="rgba(255, 255, 255, 0.3)" strokeWidth={0.8} />
                <path d={geom.btnPwr} fill="#dc2626" stroke="rgba(255, 255, 255, 0.3)" strokeWidth={0.8} />

                {/* ── 1.14" TFT LCD SCREEN ── */}
                <path d={geom.screenPath} className="hl-m5cplus-screen" />

                {/* ── DYNAMIC 6-AXIS IMU SCREEN CONTENT ── */}
                <g clipPath={`url(#${clipId})`}>
                    {imuVisuals.type === 'horizon' && (
                        <>
                            {/* Reticle Circle */}
                            <circle
                                cx={proj(CAM, SCREEN_INSET + geom.screenW / 2, geom.screenY0 + geom.screenL / 2, H + 0.14)[0]}
                                cy={proj(CAM, SCREEN_INSET + geom.screenW / 2, geom.screenY0 + geom.screenL / 2, H + 0.14)[1]}
                                r={9}
                                fill="none"
                                stroke="rgba(255, 255, 255, 0.15)"
                                strokeWidth={0.8}
                                strokeDasharray="2 2"
                            />
                            {/* Artificial Horizon */}
                            <path d={imuVisuals.horizonLine} className="hl-imu-horizon" />
                            {/* Level Bubble */}
                            {imuVisuals.bubblePt && (
                                <circle
                                    cx={imuVisuals.bubblePt[0]}
                                    cy={imuVisuals.bubblePt[1]}
                                    r={2.8}
                                    className="hl-imu-bubble"
                                />
                            )}
                        </>
                    )}

                    {imuVisuals.type === 'gforce' && (
                        <>
                            <path d={imuVisuals.vectorLine} stroke="#f97316" strokeWidth={1.8} strokeLinecap="round" />
                            {imuVisuals.pTarget && (
                                <circle cx={imuVisuals.pTarget[0]} cy={imuVisuals.pTarget[1]} r={3} fill="#fb923c" />
                            )}
                        </>
                    )}

                    {imuVisuals.type === 'beacon' && imuVisuals.pCenter && (
                        <>
                            <circle cx={imuVisuals.pCenter[0]} cy={imuVisuals.pCenter[1]} r={4} fill="#10b981" />
                            <circle cx={imuVisuals.pCenter[0]} cy={imuVisuals.pCenter[1]} r={9} fill="none" stroke="#10b981" strokeWidth={1} opacity={0.6} />
                            <circle cx={imuVisuals.pCenter[0]} cy={imuVisuals.pCenter[1]} r={14} fill="none" stroke="#10b981" strokeWidth={0.8} opacity={0.3} />
                        </>
                    )}

                    {/* IMU Telemetry Tag */}
                    <text
                        x={proj(CAM, W / 2, geom.screenY0 + geom.screenL - 3.5, H + 0.16)[0]}
                        y={proj(CAM, W / 2, geom.screenY0 + geom.screenL - 3.5, H + 0.16)[1]}
                        textAnchor="middle"
                        fill="#fed7aa"
                        fontSize={6}
                        fontFamily="monospace"
                        fontWeight="bold"
                    >
                        {imuVisuals.label}
                    </text>
                </g>

                {/* ── FRONT TACTILE M5 BUTTON ── */}
                <path
                    d={geom.btnPath}
                    className={`hl-m5cplus-btn ${isPressed ? 'is-pressed' : ''}`}
                    onClick={handleButtonClick}
                >
                    <title>Click M5 Button to Toggle IMU Visualizer</title>
                </path>
                <text
                    x={geom.btnCenter[0]}
                    y={geom.btnCenter[1] + 2}
                    textAnchor="middle"
                    fill={isPressed ? '#ea580c' : '#ffedd5'}
                    fontSize={7.5}
                    fontFamily="monospace"
                    fontWeight="900"
                    pointerEvents="none"
                >
                    M5
                </text>
            </svg>

            {/* Bottom Floating Telemetry */}
            <div className="hl-m5cplus-telemetry">
                <span className="hl-pulse-dot" style={{ backgroundColor: '#ea580c', boxShadow: '0 0 8px #ea580c' }} />
                <span>{nodeId}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#10b981' }}>{batteryPct}%</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#fed7aa' }}>{tempC}°C</span>
            </div>
        </div>
    );
};
