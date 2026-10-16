import React, { useState } from 'react';
import './risingPlusSign.css';

interface RisingPlusSignProps {
    intensity?: number;
    label?: string;
    onOpen?: () => void;
}

/**
 * Rising 3D Plus Sign hairline figure for "Add Entry".
 * Follows the hairline vector aesthetic: precision 1px/1.2px strokes,
 * isometric 3D extruded facets, luminous top plane, depth shadow,
 * and rising elevation particles.
 */
export const RisingPlusSign: React.FC<RisingPlusSignProps> = ({
    intensity = 0.8,
    label = 'Add Entry',
    onOpen,
}) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className={`rising-plus-container ${isHovered ? 'rising-plus-container--lifted' : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={onOpen}
            role="img"
            aria-label={label}
        >
            <svg
                viewBox="0 0 240 240"
                className="rising-plus-svg"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Linear gradient for luminous top cross faces */}
                    <linearGradient id="plusTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#00f0ff" />
                        <stop offset="45%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>

                    {/* Shaded gradient for left extruded facets */}
                    <linearGradient id="plusLeftGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#3b0764" stopOpacity="0.95" />
                    </linearGradient>

                    {/* Shaded gradient for right extruded facets */}
                    <linearGradient id="plusRightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.9" />
                    </linearGradient>

                    {/* Ambient glow under the rising plus */}
                    <radialGradient id="plusGlowGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity="0.6" />
                        <stop offset="60%" stopColor="#00f0ff" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                    </radialGradient>

                    {/* Filter for subtle neon rim glow */}
                    <filter id="plusNeonFilter" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#a855f7" floodOpacity="0.45" />
                    </filter>
                </defs>

                {/* 1. Base Pedestal: Concentric isometric ground rings */}
                <g className="plus-pedestal" opacity="0.75">
                    {/* Outer isometric ellipse */}
                    <ellipse
                        cx="120"
                        cy="176"
                        rx="68"
                        ry="26"
                        fill="url(#plusGlowGrad)"
                        stroke="rgba(168, 85, 247, 0.4)"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                    />
                    {/* Inner isometric ring */}
                    <ellipse
                        cx="120"
                        cy="176"
                        rx="46"
                        ry="17"
                        fill="none"
                        stroke="rgba(0, 240, 255, 0.6)"
                        strokeWidth="1.2"
                    />
                    {/* Center emitter core */}
                    <ellipse
                        cx="120"
                        cy="176"
                        rx="20"
                        ry="7.5"
                        fill="rgba(168, 85, 247, 0.25)"
                        stroke="#00f0ff"
                        strokeWidth="1"
                    />
                </g>

                {/* 2. Ascending hairline elevation guides */}
                <g className="plus-rays" stroke="#00f0ff" strokeWidth="1" opacity="0.6">
                    <line x1="88" y1="172" x2="88" y2="135" strokeDasharray="2 3" />
                    <line x1="152" y1="172" x2="152" y2="135" strokeDasharray="2 3" />
                    <line x1="120" y1="182" x2="120" y2="152" strokeDasharray="2 3" />
                    {/* Floating particle ticks */}
                    <circle cx="92" cy="148" r="1.5" fill="#ec4899" />
                    <circle cx="148" cy="142" r="1.5" fill="#00f0ff" />
                    <circle cx="120" cy="130" r="1.8" fill="#a855f7" />
                </g>

                {/* 3. The 3D Rising Plus Sign Geometry */}
                <g className="plus-3d-body" filter="url(#plusNeonFilter)">
                    {/* Drop shadow of the plus sign on the ground plane */}
                    <path
                        d="M104 168 L120 160 L136 168 L154 168 L154 176 L136 176 L136 192 L104 192 L104 176 L86 176 L86 168 Z"
                        fill="rgba(0,0,0,0.4)"
                        opacity="0.5"
                        transform="scale(1, 0.5) translate(0, 160)"
                    />

                    {/* ── Extruded Side Walls (Vertical Thickness = 16px) ── */}
                    {/* Left & Bottom Extrusions */}
                    <g fill="url(#plusLeftGrad)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8">
                        {/* Left arm bottom wall */}
                        <polygon points="68,110 102,110 102,126 68,126" />
                        {/* Bottom arm left wall */}
                        <polygon points="102,144 102,160 120,160 120,144" />
                        {/* Center corner wall */}
                        <polygon points="102,126 102,144 116,144 116,126" />
                    </g>

                    {/* Right & Front Extrusions */}
                    <g fill="url(#plusRightGrad)" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8">
                        {/* Bottom arm front/right wall */}
                        <polygon points="120,144 138,144 138,160 120,160" />
                        {/* Right arm bottom wall */}
                        <polygon points="138,110 172,110 172,126 138,126" />
                        {/* Right arm front wall */}
                        <polygon points="172,92 172,110 172,126 172,108" opacity="0.6" />
                    </g>

                    {/* ── Luminous Top Face of the Plus Sign ── */}
                    <path
                        d="
                            M102,62
                            L138,62
                            L138,92
                            L172,92
                            L172,118
                            L138,118
                            L138,148
                            L102,148
                            L102,118
                            L68,118
                            L68,92
                            L102,92
                            Z
                        "
                        fill="url(#plusTopGrad)"
                        stroke="#ffffff"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                    />

                    {/* Precision Hairline Internal Inset / Bevel Accent */}
                    <path
                        d="
                            M106,66
                            L134,66
                            L134,96
                            L168,96
                            L168,114
                            L134,114
                            L134,144
                            L106,144
                            L106,114
                            L72,114
                            L72,96
                            L106,96
                            Z
                        "
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.75)"
                        strokeWidth="0.8"
                        strokeDasharray="28 2"
                    />

                    {/* Center Core Crosshair Glow */}
                    <circle cx="120" cy="105" r="5" fill="#ffffff" opacity="0.9" />
                    <line x1="120" y1="97" x2="120" y2="113" stroke="#00f0ff" strokeWidth="1.2" />
                    <line x1="112" y1="105" x2="128" y2="105" stroke="#00f0ff" strokeWidth="1.2" />
                </g>
            </svg>
        </div>
    );
};
