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
    cylinder,
    prism,
    discZ,
    rotZ,
    rotX,
    Spring,
    wake,
    sleep,
} from './engine';
import './hairlineStackChan.css';

interface HairlineStackChanProps {
    title?: string;
    botName?: string;
    batteryPct?: number;
    interactive?: boolean;
    className?: string;
}

const CAM: Cam = { S: 3.6, cx: 200, cy: 195 };

// Head dimensions
const HEAD_W = 48;
const HEAD_D = 46;
const HEAD_H = 46;
const HEAD_R = 9;
const NECK_Z = 16;

export const HairlineStackChan: React.FC<HairlineStackChanProps> = ({
    title = 'M5Stack StackChan',
    botName = 'StackChan Companion',
    batteryPct = 94,
    interactive = true,
    className = '',
}) => {
    const clipId = useId();
    const wrapRef = useRef<HTMLDivElement>(null);

    // Pan (yaw) and Tilt (pitch) springs
    const panSpring = useRef(new Spring(0, 75, 14, 1));
    const tiltSpring = useRef(new Spring(0, 75, 14, 1));
    const bounceSpring = useRef(new Spring(0, 140, 12, 1));

    const [panDeg, setPanDeg] = useState(0);
    const [tiltDeg, setTiltDeg] = useState(0);
    const [bounceZ, setBounceZ] = useState(0);

    const [isBlinking, setIsBlinking] = useState(false);
    const [isHappy, setIsHappy] = useState(false);

    // Periodic autonomous blinking
    useEffect(() => {
        const interval = setInterval(() => {
            setIsBlinking(true);
            setTimeout(() => setIsBlinking(false), 140);
        }, 3400);

        return () => clearInterval(interval);
    }, []);

    // Pointer tracking animation loop
    useEffect(() => {
        const tick = (dt: number): boolean => {
            const m1 = panSpring.current.step(dt);
            const m2 = tiltSpring.current.step(dt);
            const m3 = bounceSpring.current.step(dt);

            setPanDeg(panSpring.current.x);
            setTiltDeg(tiltSpring.current.x);
            setBounceZ(bounceSpring.current.x);

            return m1 || m2 || m3;
        };

        const handlePointerMove = (e: PointerEvent) => {
            if (!interactive || !wrapRef.current) return;
            const rect = wrapRef.current.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
            const relY = (e.clientY - rect.top) / rect.height - 0.5;

            // Pan left/right up to 28 degrees, tilt up/down up to 18 degrees
            panSpring.current.t = relX * 48;
            tiltSpring.current.t = -relY * 32;
            wake(tick);
        };

        const handlePointerLeave = () => {
            if (!interactive) return;
            panSpring.current.t = 0;
            tiltSpring.current.t = 0;
            setIsHappy(false);
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

    // Handle happy click bounce
    const handleClick = () => {
        setIsHappy(true);
        bounceSpring.current.t = 8;
        setTimeout(() => {
            bounceSpring.current.t = 0;
        }, 180);
        setTimeout(() => {
            setIsHappy(false);
        }, 1800);
    };

    // Static Base & Servo Neck Geometry
    const baseGeom = useMemo(() => {
        const baseCylinder = cylinder(CAM, 0, 0, 0, 26, 6, 24);
        const mountingRing = discZ(CAM, 0, 0, 6.1, 20);
        const servoNeck = prism(CAM, -8, -8, 6, 16, 16, 10, 2.5);
        const neckBracket = prism(CAM, -5, -12, 10, 10, 24, 6, 1.8);

        return { baseCylinder, mountingRing, servoNeck, neckBracket };
    }, []);

    // Transformed Head & Emotive Face Geometry
    const headGeom = useMemo(() => {
        const panRad = (panDeg * Math.PI) / 180;
        const tiltRad = (tiltDeg * Math.PI) / 180;
        const origin: P3 = [0, 0, NECK_Z + bounceZ];

        // 3D Point Transformation with Pan & Tilt
        const transformPoint = (p: P3): P3 => {
            const translated: P3 = [p[0], p[1], p[2] + NECK_Z + bounceZ];
            const pRotPan = rotZ(translated, panRad, origin);
            return rotX(pRotPan, tiltRad, origin);
        };

        // Head Box 8 corners (centered at X=0, Y=0, Z=0)
        const hw = HEAD_W / 2;
        const hd = HEAD_D / 2;
        const hh = HEAD_H;

        const rawCorners: P3[] = [
            [-hw, -hd, 0],
            [hw, -hd, 0],
            [hw, hd, 0],
            [-hw, hd, 0],
            [-hw, -hd, hh],
            [hw, -hd, hh],
            [hw, hd, hh],
            [-hw, hd, hh],
        ];

        const screenPts2D = rawCorners.map(transformPoint).map((pt) => proj(CAM, pt[0], pt[1], pt[2]));
        const headHull = pathOf(hull(screenPts2D));

        // Front Face (Y = -hd)
        const frontCorners2D: P2[] = [
            proj(CAM, ...transformPoint([-hw + 2, -hd - 0.2, 4])),
            proj(CAM, ...transformPoint([hw - 2, -hd - 0.2, 4])),
            proj(CAM, ...transformPoint([hw - 2, -hd - 0.2, hh - 4])),
            proj(CAM, ...transformPoint([-hw + 2, -hd - 0.2, hh - 4])),
        ];
        const screenPath = pathOf(frontCorners2D);

        // Screen Bezel Inner Display (Black TFT glass)
        const displayCorners: P2[] = [
            proj(CAM, ...transformPoint([-hw + 5, -hd - 0.3, 7])),
            proj(CAM, ...transformPoint([hw - 5, -hd - 0.3, 7])),
            proj(CAM, ...transformPoint([hw - 5, -hd - 0.3, hh - 7])),
            proj(CAM, ...transformPoint([-hw + 5, -hd - 0.3, hh - 7])),
        ];
        const displayPath = pathOf(displayCorners);

        // Emotive Face Coordinates
        const eyeY = -hd - 0.5;
        const eyeZ = hh / 2 + 3;
        const leftEyeP3: P3 = [-9, eyeY, eyeZ];
        const rightEyeP3: P3 = [9, eyeY, eyeZ];

        const leftEyePt = proj(CAM, ...transformPoint(leftEyeP3));
        const rightEyePt = proj(CAM, ...transformPoint(rightEyeP3));

        // Mouth coordinate
        const mouthPt = proj(CAM, ...transformPoint([0, eyeY, eyeZ - 9]));
        const mouthStart = proj(CAM, ...transformPoint([-3.5, eyeY, eyeZ - 8]));
        const mouthEnd = proj(CAM, ...transformPoint([3.5, eyeY, eyeZ - 8]));
        const mouthPath = pathOf([mouthStart, mouthPt, mouthEnd], false);

        // Cheeks
        const leftCheek = proj(CAM, ...transformPoint([-14, eyeY, eyeZ - 6]));
        const rightCheek = proj(CAM, ...transformPoint([14, eyeY, eyeZ - 6]));

        return {
            headHull,
            screenPath,
            displayPath,
            leftEyePt,
            rightEyePt,
            mouthPath,
            leftCheek,
            rightCheek,
        };
    }, [panDeg, tiltDeg, bounceZ]);

    return (
        <div
            ref={wrapRef}
            className={`hl-stackchan-wrap ${className}`}
            onClick={handleClick}
            title="Click to pet StackChan!"
        >
            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="hl-stackchan-svg"
                preserveAspectRatio="xMidYMid meet"
                aria-label={`Hairline StackChan Robot: ${botName}`}
            >
                <defs>
                    <clipPath id={clipId}>
                        <path d={headGeom.displayPath} />
                    </clipPath>
                </defs>

                {/* ── BASE SHADOW ── */}
                <path
                    d={baseGeom.baseCylinder.body}
                    fill="rgba(0, 0, 0, 0.45)"
                    filter="blur(8px)"
                    transform="translate(0, 9)"
                />

                {/* ── SERVO BASE & BRACKET ── */}
                <path d={baseGeom.baseCylinder.body} className="hl-chan-base" />
                <path d={baseGeom.mountingRing} fill="none" stroke="rgba(0, 210, 255, 0.3)" strokeWidth={1} />
                <path d={baseGeom.servoNeck.body} className="hl-chan-neck" />
                <path d={baseGeom.neckBracket.body} className="hl-chan-neck" fill="#242c38" stroke="#f59e0b" />

                {/* ── ROTATING ROBOT HEAD ── */}
                <g id="stackchan-head">
                    {/* Head Outer Hull */}
                    <path d={headGeom.headHull} className="hl-chan-head" />

                    {/* Front Casing Bezel */}
                    <path d={headGeom.screenPath} fill="#141a22" stroke="rgba(255, 255, 255, 0.12)" strokeWidth={1} />

                    {/* Inner Black TFT LCD Screen */}
                    <path d={headGeom.displayPath} className="hl-chan-screen" />

                    {/* Emotive Face on Display */}
                    <g clipPath={`url(#${clipId})`}>
                        {/* Eyes */}
                        {isBlinking ? (
                            // Blinking line
                            <>
                                <line
                                    x1={headGeom.leftEyePt[0] - 5}
                                    y1={headGeom.leftEyePt[1]}
                                    x2={headGeom.leftEyePt[0] + 5}
                                    y2={headGeom.leftEyePt[1]}
                                    stroke="#00d2ff"
                                    strokeWidth={2}
                                />
                                <line
                                    x1={headGeom.rightEyePt[0] - 5}
                                    y1={headGeom.rightEyePt[1]}
                                    x2={headGeom.rightEyePt[0] + 5}
                                    y2={headGeom.rightEyePt[1]}
                                    stroke="#00d2ff"
                                    strokeWidth={2}
                                />
                            </>
                        ) : isHappy ? (
                            // Happy inverted crescent eyes ^^
                            <>
                                <path
                                    d={`M${headGeom.leftEyePt[0] - 6} ${headGeom.leftEyePt[1] + 2} Q${headGeom.leftEyePt[0]} ${headGeom.leftEyePt[1] - 6} ${headGeom.leftEyePt[0] + 6} ${headGeom.leftEyePt[1] + 2}`}
                                    className="hl-chan-eye-happy"
                                />
                                <path
                                    d={`M${headGeom.rightEyePt[0] - 6} ${headGeom.rightEyePt[1] + 2} Q${headGeom.rightEyePt[0]} ${headGeom.rightEyePt[1] - 6} ${headGeom.rightEyePt[0] + 6} ${headGeom.rightEyePt[1] + 2}`}
                                    className="hl-chan-eye-happy"
                                />
                            </>
                        ) : (
                            // Normal capsule eyes
                            <>
                                <ellipse
                                    cx={headGeom.leftEyePt[0]}
                                    cy={headGeom.leftEyePt[1]}
                                    rx={4.5}
                                    ry={6.5}
                                    className="hl-chan-eye"
                                />
                                <ellipse
                                    cx={headGeom.rightEyePt[0]}
                                    cy={headGeom.rightEyePt[1]}
                                    rx={4.5}
                                    ry={6.5}
                                    className="hl-chan-eye"
                                />
                            </>
                        )}

                        {/* Blushing Cheeks when Happy */}
                        {isHappy && (
                            <>
                                <circle cx={headGeom.leftCheek[0]} cy={headGeom.leftCheek[1]} r={4} className="hl-chan-cheek" />
                                <circle cx={headGeom.rightCheek[0]} cy={headGeom.rightCheek[1]} r={4} className="hl-chan-cheek" />
                            </>
                        )}

                        {/* Cute Mouth */}
                        <path d={headGeom.mouthPath} className="hl-chan-mouth" />
                    </g>
                </g>
            </svg>

            {/* Bottom Floating Telemetry */}
            <div className="hl-stackchan-telemetry">
                <span className="hl-pulse-dot" />
                <span>{botName}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#10b981' }}>{batteryPct}%</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#f59e0b' }}>
                    Pan:{Math.round(panDeg)}° Tilt:{Math.round(tiltDeg)}°
                </span>
            </div>
        </div>
    );
};
