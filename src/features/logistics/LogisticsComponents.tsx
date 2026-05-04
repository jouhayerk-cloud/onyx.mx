import React from 'react';
import { vendors } from '../../lib/consts';

export const TRUCK_L_CM = 1615;
export const TRUCK_W_CM = 244;
export const BASE_SCALE = 1.5;

export const CrateWireframe: React.FC<{ w: number; l: number; h: number; color: string; size?: number; solid?: boolean }> = ({ w, l, h, color, size = 44, solid = false }) => {
    const maxDim = Math.max(w, l, h, 1);
    const W = w / maxDim; const L = l / maxDim; const H = h / maxDim;
    const S = 13; const ox = 24; const oy = 30;
    const iso = (x: number, y: number, z: number): [number, number] => [
        ox + (x - y) * S * 0.866,
        oy + (x + y) * S * 0.5 - z * S
    ];
    const corners = [
        iso(0,0,0), iso(W,0,0), iso(W,L,0), iso(0,L,0), // bottom
        iso(0,0,H), iso(W,0,H), iso(W,L,H), iso(0,L,H), // top
    ];
    const [a,b,c,d,e,f,g,hh] = corners;
    const pts = (arr: [number,number][]) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const fillOpacity = solid ? 1.0 : 0.03;
    const strokeOpacity = solid ? 0.3 : 1;
    
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: 'visible' }}>
            <polygon points={pts([a,b,c,d])} fill={solid ? color : "none"} fillOpacity={solid ? 0.15 : 0} stroke={color} strokeWidth={0.6} strokeOpacity={0.25} />
            <polygon points={pts([a,d,hh,e])} fill={color} fillOpacity={fillOpacity * 0.75} stroke={color} strokeWidth={0.7} strokeOpacity={strokeOpacity * 0.55} />
            <polygon points={pts([a,b,f,e])} fill={color} fillOpacity={fillOpacity * 0.9} stroke={color} strokeWidth={0.7} strokeOpacity={strokeOpacity * 0.45} />
            <polygon points={pts([e,f,g,hh])} fill={color} fillOpacity={fillOpacity} stroke={color} strokeWidth={0.9} strokeOpacity={strokeOpacity} />
            {!solid && [{a,b: e},{a: b,b: f},{a: c,b: g},{a: d,b: hh}].map(({a: p1,b: p2},i) => (
                <line key={i} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={color} strokeWidth={0.6} strokeOpacity={0.4} />
            ))}
        </svg>
    );
};

export const MiniIsoView: React.FC<{
    truckCrates: any[];
    positions: Record<string, any>;
    allCrates: any[];
    allInventory: any[];
    truckNumbering?: Record<string, number>;
    width?: number;
    height?: number;
}> = ({ truckCrates, positions, allCrates, allInventory, truckNumbering = {}, width = 300, height = 150 }) => {
    const S = width / (TRUCK_L_CM + TRUCK_W_CM) * 0.95;
    const ox = width * 0.5;
    const oy = height * 0.35;

    const iso = (x: number, y: number, z: number): [number, number] => [
        ox + (x - y) * S * 0.866,
        oy + (x + y) * S * 0.5 - z * S
    ];

    const effectivePositions = { ...positions };
    if (Object.keys(effectivePositions).length === 0) {
        truckCrates.forEach(c => {
            if (c.id) {
                effectivePositions[c.id] = {
                    x: c.x ?? 0,
                    y: c.z !== undefined ? c.z : (c.y ?? 0),
                    r: c.r ?? 0,
                    z: c.y !== undefined && c.z !== undefined ? c.y : 0
                };
            }
        });
    }

    const sortedIds = Object.keys(effectivePositions).sort((a, b) => 
        (effectivePositions[a].x + effectivePositions[a].y) - (effectivePositions[b].x + effectivePositions[b].y)
    );

    const crateMap = new Map(truckCrates.map((c: any) => [c.id, c]));

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
            {sortedIds.map(id => {
                const crate = crateMap.get(id);
                if (!crate || crate.parent_id) return null;
                const p = effectivePositions[id];
                const rotated = p.r === 90;
                const w = crate.width_cm || crate.w || 120;
                const l = crate.length_cm || crate.l || 80;
                const h = crate.height_cm || crate.h || 100;
                const dX = rotated ? w : l, dY = rotated ? l : w;
                const zOff = p.z || 0;

                const vendorId = crate.subtitle || crate.vendor_id || (crate.label?.split('-')[0]);
                const col = crate.color || (vendors[vendorId as keyof typeof vendors]?.color || '#F97316');

                const pts = [
                    iso(p.x, p.y, zOff), iso(p.x + dX, p.y, zOff), iso(p.x + dX, p.y + dY, zOff), iso(p.x, p.y + dY, zOff),
                    iso(p.x, p.y, zOff + h), iso(p.x + dX, p.y, zOff + h), iso(p.x + dX, p.y + dY, zOff + h), iso(p.x, p.y + dY, zOff + h)
                ];
                const ptStr = (indices: number[]) => indices.map(i => `${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`).join(' ');

                return (
                    <g key={id}>
                        <polygon points={ptStr([0,3,7,4])} fill={col} fillOpacity={0.75} stroke={col} strokeWidth={0.2} strokeOpacity={0.3} />
                        <polygon points={ptStr([0,1,5,4])} fill={col} fillOpacity={0.9} stroke={col} strokeWidth={0.2} strokeOpacity={0.3} />
                        <polygon points={ptStr([4,5,6,7])} fill={col} fillOpacity={1.0} stroke={col} strokeWidth={0.3} strokeOpacity={0.4} />
                    </g>
                );
            })}
        </svg>
    );
};

export const CmGrid: React.FC<{ isVertical?: boolean; scale?: number }> = ({ isVertical, scale = BASE_SCALE }) => {
    const minor = 50; const major = 100;
    const xLines: number[] = []; const yLines: number[] = [];
    for (let x = 0; x <= TRUCK_L_CM; x += minor) xLines.push(x);
    for (let y = 0; y <= TRUCK_W_CM; y += minor) yLines.push(y);

    const L = TRUCK_L_CM * scale;
    const W = TRUCK_W_CM * scale;

    return (
        <svg 
            className="absolute inset-0 pointer-events-none" 
            width={isVertical ? W : L} 
            height={isVertical ? L : W} 
            style={{ overflow: 'visible' }}
        >
            {xLines.map(x => {
                const xPos = isVertical ? (TRUCK_L_CM - x) * scale : x * scale;
                return (
                    <line 
                        key={`x${x}`} 
                        x1={isVertical ? 0 : xPos} 
                        y1={isVertical ? xPos : 0} 
                        x2={isVertical ? W : xPos} 
                        y2={isVertical ? xPos : W}
                        stroke={x % major === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'} 
                        strokeWidth={x % major === 0 ? 1 : 0.5} 
                    />
                );
            })}
            {yLines.map(y => {
                const yPos = y * scale;
                return (
                    <line 
                        key={`y${y}`} 
                        x1={isVertical ? yPos : 0} 
                        y1={isVertical ? 0 : yPos} 
                        x2={isVertical ? yPos : L} 
                        y2={isVertical ? 0 : yPos}
                        stroke={y % major === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'} 
                        strokeWidth={y % major === 0 ? 1 : 0.5} 
                    />
                );
            })}
            {/* Trailer Outline */}
            <rect 
                x={0} y={0} 
                width={isVertical ? W : L} 
                height={isVertical ? L : W} 
                rx={4} 
                fill="none" 
                stroke="rgba(255,255,255,0.2)" 
                strokeWidth={2} 
            />
            {/* Trailer Tongue / Front */}
            <path 
                d={isVertical 
                    ? `M ${W/2-20} 0 L ${W/2+20} 0 L ${W/2} -40 Z`
                    : `M 0 ${W/2-20} L 0 ${W/2+20} L -40 ${W/2} Z`
                }
                fill="rgba(255,255,255,0.1)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={2}
            />
        </svg>
    );
};
