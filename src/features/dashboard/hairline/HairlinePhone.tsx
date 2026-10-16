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
    rectZ,
    discZ,
    Spring,
    wake,
    sleep,
} from './engine';
import './hairlinePhone.css';

interface HairlinePhoneProps {
    title?: string;
    deviceName?: string;
    ipAddress?: string;
    modelType?: string;
    interactive?: boolean;
    className?: string;
}

const CAM: Cam = { S: 4.2, cx: 200, cy: 175 };

// Phone physical dimensions (mm relative)
const W = 52;
const L = 104;
const H = 6.2;
const R = 9.5;
const SCREEN_INSET = 2.4;

interface FeedItem {
    id: string;
    title: string;
    badge: string;
    badgeColor: string;
    sub: string;
    val: string;
}

const FEED_ITEMS: FeedItem[] = [
    { id: '1', title: 'ONYX MESH G7', badge: 'HOST', badgeColor: '#38bdf8', sub: '192.0.2.71', val: '2ms' },
    { id: '2', title: 'SUPABASE VECTOR', badge: '768D', badgeColor: '#10b981', sub: 'item_embeddings', val: '1.00 MRR' },
    { id: '3', title: 'OPERATOR RAMSES', badge: 'LIVE', badgeColor: '#f59e0b', sub: 'Admin Boss Clearance', val: 'Active' },
    { id: '4', title: 'COLIBRÌ MoE NVMe', badge: '35B', badgeColor: '#a855f7', sub: 'Vulkan Engine G7', val: '2850 MB/s' },
    { id: '5', title: 'LITERTLM NATIVE', badge: 'SLM', badgeColor: '#06b6d4', sub: 'Gemma-2-740M', val: 'On-Device' },
    { id: '6', title: 'RP2040 BEACON', badge: 'IOT', badgeColor: '#ec4899', sub: 'Warehouse Scale 02', val: 'Online' },
];

const CARD_H = 15;
const CARD_GAP = 3.5;
const TOTAL_CYCLE = FEED_ITEMS.length * (CARD_H + CARD_GAP);

export const HairlinePhone: React.FC<HairlinePhoneProps> = ({
    title = 'iPhone 15 Pro Companion',
    deviceName = 'Ramses iPhone 15 Pro',
    ipAddress = '192.0.2.100',
    modelType = 'LiteRT-LM On-Device',
    interactive = true,
    className = '',
}) => {
    const clipId = useId();
    const wrapRef = useRef<HTMLDivElement>(null);

    // Continuous scroll offset & spring velocity
    const scrollPos = useRef(0);
    const scrollSpeed = useRef(18); // pixels per second
    const isDragging = useRef(false);
    const lastPointerY = useRef(0);
    const [renderScroll, setRenderScroll] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

    // Static Phone Chassis Geometry
    const geom = useMemo(() => {
        // Main phone unibody prism
        const chassis = prism(CAM, 0, 0, 0, W, L, H, R);

        // Screen bezel ring on top surface
        const screenRing = ring(SCREEN_INSET, SCREEN_INSET, W - 2 * SCREEN_INSET, L - 2 * SCREEN_INSET, R - 1.8);
        const screenPath = pathOf(screenRing.map(([x, y]) => proj(CAM, x, y, H + 0.1)));

        // Dynamic Island pill at top of screen
        const diW = 14;
        const diL = 4.2;
        const diX = (W - diW) / 2;
        const diY = L - SCREEN_INSET - 6.5;
        const islandRing = ring(diX, diY, diW, diL, 2.1);
        const dynamicIsland = pathOf(islandRing.map(([x, y]) => proj(CAM, x, y, H + 0.15)));

        // Camera Bump on back / side
        const camBump = prism(CAM, 4, L - 28, -2, 22, 24, 2, 4.5);
        const lens1 = discZ(CAM, 10, L - 11, -2.1, 3.5);
        const lens2 = discZ(CAM, 10, L - 21, -2.1, 3.5);
        const lens3 = discZ(CAM, 19, L - 16, -2.1, 3.5);

        // Side Buttons (Volume up/down left, Power right)
        const volUp = prism(CAM, -1.2, L - 32, 2, 1.2, 10, 2.2, 0.4);
        const volDown = prism(CAM, -1.2, L - 46, 2, 1.2, 10, 2.2, 0.4);
        const powerBtn = prism(CAM, W, L - 38, 2, 1.2, 14, 2.2, 0.4);

        return {
            chassis,
            screenPath,
            dynamicIsland,
            camBump,
            lens1,
            lens2,
            lens3,
            volUp,
            volDown,
            powerBtn,
        };
    }, []);

    // Animation Loop for live scrolling
    useEffect(() => {
        let isRunning = true;
        let lastTime = performance.now();

        const tick = (now: number) => {
            if (!isRunning) return;
            const dt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;

            if (!isDragging.current) {
                // Auto-advance scroll position smoothly
                const speed = isHovered ? scrollSpeed.current * 0.35 : scrollSpeed.current;
                scrollPos.current = (scrollPos.current + speed * dt) % TOTAL_CYCLE;
                setRenderScroll(scrollPos.current);
            }

            requestAnimationFrame(tick);
        };

        const animId = requestAnimationFrame(tick);

        return () => {
            isRunning = false;
            cancelAnimationFrame(animId);
        };
    }, [isHovered]);

    // Touch / Pointer Scrubbing Handlers
    const handlePointerDown = (e: React.PointerEvent) => {
        if (!interactive) return;
        isDragging.current = true;
        lastPointerY.current = e.clientY;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current || !interactive) return;
        const delta = e.clientY - lastPointerY.current;
        lastPointerY.current = e.clientY;
        scrollPos.current = (scrollPos.current - delta * 0.5 + TOTAL_CYCLE) % TOTAL_CYCLE;
        setRenderScroll(scrollPos.current);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        isDragging.current = false;
        try {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            // Safe release ignore
        }
    };

    // Render 2 repeated copies of items for endless scroll loop
    const visibleCards = useMemo(() => {
        const screenTopY = L - SCREEN_INSET - 10;
        const screenBottomY = SCREEN_INSET + 3;
        const cardWidth = W - 2 * SCREEN_INSET - 4;
        const cardX0 = SCREEN_INSET + 2;

        const rendered: Array<{
            item: FeedItem;
            cardPath: string;
            pText: P2;
            pSub: P2;
            pBadge: P2;
            pVal: P2;
        }> = [];

        // Duplicate feed items to form continuous conveyor loop
        const stream = [...FEED_ITEMS, ...FEED_ITEMS, ...FEED_ITEMS];

        stream.forEach((item, index) => {
            // Position relative to current scroll
            const yOffset = index * (CARD_H + CARD_GAP) - renderScroll;
            const cardY0 = screenBottomY + yOffset;

            // Only project if roughly within screen bounds
            if (cardY0 > -20 && cardY0 < L + 20) {
                const cardRing = ring(cardX0, cardY0, cardWidth, CARD_H, 2.5);
                const cardPath = pathOf(cardRing.map(([x, y]) => proj(CAM, x, y, H + 0.12)));

                const pText = proj(CAM, cardX0 + 3, cardY0 + CARD_H - 4.5, H + 0.15);
                const pSub = proj(CAM, cardX0 + 3, cardY0 + CARD_H - 10.5, H + 0.15);
                const pBadge = proj(CAM, cardX0 + cardWidth - 11, cardY0 + CARD_H - 4.5, H + 0.15);
                const pVal = proj(CAM, cardX0 + cardWidth - 11, cardY0 + CARD_H - 10.5, H + 0.15);

                rendered.push({
                    item,
                    cardPath,
                    pText,
                    pSub,
                    pBadge,
                    pVal,
                });
            }
        });

        return rendered;
    }, [renderScroll]);

    return (
        <div
            ref={wrapRef}
            className={`hl-phone-wrap ${className}`}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="hl-phone-svg"
                preserveAspectRatio="xMidYMid meet"
                aria-label={`Hairline Phone: ${deviceName}`}
            >
                <defs>
                    <clipPath id={clipId}>
                        <path d={geom.screenPath} />
                    </clipPath>
                </defs>

                {/* ── PHONE SHADOW ── */}
                <path
                    d={geom.chassis.body}
                    fill="rgba(0, 0, 0, 0.45)"
                    filter="blur(8px)"
                    transform="translate(4, 10)"
                />

                {/* ── HARDWARE BUTTONS & CAMERA ── */}
                <path d={geom.volUp.body} className="hl-side-button" />
                <path d={geom.volDown.body} className="hl-side-button" />
                <path d={geom.powerBtn.body} className="hl-side-button" />

                {/* ── CHASSIS & SCREEN RIM ── */}
                <path d={geom.chassis.body} className="hl-phone-chassis" />
                <path d={geom.chassis.crease} className="hl-phone-bezel" />

                {/* ── SCREEN SURFACE GLASS ── */}
                <path d={geom.screenPath} className="hl-phone-glass" />

                {/* ── LIVE SCROLLING STREAM (CLIPPED TO SCREEN) ── */}
                <g clipPath={`url(#${clipId})`}>
                    {visibleCards.map((c, i) => (
                        <g key={i}>
                            <path d={c.cardPath} className="hl-feed-card" />
                            <text x={c.pText[0]} y={c.pText[1]} className="hl-stream-text">
                                {c.item.title}
                            </text>
                            <text x={c.pSub[0]} y={c.pSub[1]} className="hl-stream-sub">
                                {c.item.sub}
                            </text>
                            <text
                                x={c.pBadge[0]}
                                y={c.pBadge[1]}
                                className="hl-stream-badge"
                                fill={c.item.badgeColor}
                            >
                                {c.item.badge}
                            </text>
                            <text x={c.pVal[0]} y={c.pVal[1]} className="hl-stream-sub" textAnchor="end">
                                {c.item.val}
                            </text>
                        </g>
                    ))}

                    {/* Top Status Gradient Fader */}
                    <rect
                        x={0}
                        y={0}
                        width={VB_W}
                        height={90}
                        fill="url(#top-fade)"
                        opacity={0.3}
                        pointerEvents="none"
                    />
                </g>

                {/* ── DYNAMIC ISLAND AT TOP ── */}
                <path d={geom.dynamicIsland} className="hl-dynamic-island" />
                <circle
                    cx={proj(CAM, W / 2 + 3.8, L - SCREEN_INSET - 4.4, H + 0.2)[0]}
                    cy={proj(CAM, W / 2 + 3.8, L - SCREEN_INSET - 4.4, H + 0.2)[1]}
                    r={1}
                    fill="#38bdf8"
                    opacity={0.8}
                />
            </svg>

            {/* Bottom Floating Telemetry */}
            <div className="hl-phone-telemetry">
                <span className="hl-pulse-dot" style={{ backgroundColor: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
                <span>{deviceName}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#10b981' }}>{ipAddress}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#e2e8f0' }}>LiteRT-LM</span>
            </div>
        </div>
    );
};
