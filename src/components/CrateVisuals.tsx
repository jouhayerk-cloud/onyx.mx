import React from 'react';

interface WireframeCrateProps {
    w?: number;
    l?: number;
    h?: number;
    selected?: boolean;
    type?: string;
    size?: number;
    vibrant?: boolean;
}

export const WireframeCrate: React.FC<WireframeCrateProps> = ({
    w = 60, l = 60, h = 60, 
    selected = false, 
    type = 'crate', 
    size = 48,
    vibrant = false
}) => {
    // Normalize dims to fit the 'size' display box
    const visH = type === 'pallet' ? 15 : h;
    const maxDim = Math.max(w, l, visH, 1);
    const scale = (size * 0.8) / maxDim;
    const dw = Math.round(w * scale);
    const dl = Math.round(l * scale);
    const dh = Math.round(visH * scale);

    // Isometric-style wireframe params
    const depth = Math.round(dl * 0.35); // depth perspective
    const defaultColor = vibrant ? 'rgba(var(--main-color-rgb, 249,115,22), 0.8)' : 'rgba(255,255,255,0.35)';
    const color = selected ? 'var(--main-color)' : defaultColor;
    
    const svgW = dw + depth + 4;
    const svgH = dh + depth + 4;

    // Corners of front face
    const x0 = 2, y0 = depth + 2;
    const x1 = x0 + dw, y1 = y0;
    const x2 = x1, y2 = y0 + dh;
    const x3 = x0, y3 = y0 + dh;

    // Top face offset
    const dx = depth, dy = -depth;

    const glowStyle = (selected || vibrant) ? { 
        filter: `drop-shadow(0 0 3px ${color})`,
        transition: 'all 0.3s ease'
    } : {};

    return (
        <svg
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="overflow-visible"
            style={glowStyle}
        >
            {/* Back vertical edges (dashed) */}
            <line x1={x0 + dx} y1={y0 + dy} x2={x0 + dx} y2={x3 + dy} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" opacity="0.4" />
            <line x1={x0 + dx} y1={y0 + dy} x2={x1 + dx} y2={y1 + dy} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" opacity="0.4" />
            <line x1={x0 + dx} y1={x3 + dy} x2={x1 + dx} y2={x2 + dy} stroke={color} strokeWidth="0.6" strokeDasharray="2,2" opacity="0.4" />

            {/* Top face */}
            <polygon
                points={`${x0},${y0} ${x0 + dx},${y0 + dy} ${x1 + dx},${y1 + dy} ${x1},${y1}`}
                fill={selected || vibrant ? 'rgba(var(--main-color-rgb, 249,115,22), 0.1)' : 'rgba(255,255,255,0.03)'}
                stroke={color} strokeWidth="0.8"
            />

            {/* Right face */}
            <polygon
                points={`${x1},${y1} ${x1 + dx},${y1 + dy} ${x1 + dx},${y2 + dy} ${x1},${y2}`}
                fill={selected || vibrant ? 'rgba(var(--main-color-rgb, 249,115,22), 0.08)' : 'rgba(255,255,255,0.015)'}
                stroke={color} strokeWidth="0.8"
            />

            {/* Front face */}
            <rect x={x0} y={y0} width={dw} height={dh}
                fill={selected || vibrant ? 'rgba(var(--main-color-rgb, 249,115,22), 0.12)' : 'rgba(255,255,255,0.025)'}
                stroke={color} strokeWidth="1"
            />

            {/* Cross braces on front */}
            {type !== 'pallet' && (
                <>
                    <line x1={x0} y1={y0} x2={x1 + dw} y2={y0 + dh} stroke={color} strokeWidth="0.4" opacity="0.3" />
                    <line x1={x1} y1={y0} x2={x0} y2={y0 + dh} stroke={color} strokeWidth="0.4" opacity="0.3" />
                </>
            )}
        </svg>
    );
};
