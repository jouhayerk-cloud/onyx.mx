import React, { useMemo } from 'react';
import { InventoryItem } from '../../lib/Types';
import { normalizeInventoryData } from '../../lib/utils';

interface PackingPosition {
    x: number; // in cm
    y: number; // in cm
    z: number; // in cm
    rotation: number; // 0, 90, 180, 270
    isFlipped: boolean;
}

interface CratePackingWorkspaceProps {
    width: number;
    length: number;
    height: number;
    items: { item: InventoryItem; position: PackingPosition }[];
    onUpdatePosition?: (itemId: string, pos: PackingPosition) => void;
}

export const CratePackingWorkspace: React.FC<CratePackingWorkspaceProps> = ({
    width = 60,
    length = 60,
    height = 60,
    items = []
}) => {
    // Scale factor for display (e.g., 1cm = 5px)
    const scale = 5;
    
    const containerStyle = {
        width: `${width * scale}px`,
        height: `${length * scale}px`,
        position: 'relative' as const,
    };

    return (
        <div className="logistics-3d-container flex items-center justify-center p-20 bg-black/20 rounded-3xl overflow-hidden">
            <div className="isometric-workspace" style={containerStyle}>
                {/* BOTTOM FACE */}
                <div 
                    className="face-3d cm-grid-panel cm-grid-panel-heavy border border-white/20"
                    style={{
                        width: '100%',
                        height: '100%',
                        transform: 'translateZ(0px)',
                        backgroundColor: 'rgba(255,255,255,0.02)'
                    }}
                >
                    {/* Dimension Markers */}
                    <div className="absolute -left-12 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-black text-white/20 uppercase tracking-widest font-mono">
                        {length} CM
                    </div>
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-[10px] font-black text-white/20 uppercase tracking-widest font-mono">
                        {width} CM
                    </div>
                </div>

                {/* BACK FACE */}
                <div 
                    className="face-3d cm-grid-panel border-l border-t border-white/10"
                    style={{
                        width: '100%',
                        height: `${height * scale}px`,
                        top: 0,
                        left: 0,
                        transform: 'rotateX(-90deg) translateY(-100%)',
                        transformOrigin: 'top',
                        backgroundColor: 'rgba(255,255,255,0.01)'
                    }}
                />

                {/* LEFT SIDE FACE */}
                <div 
                    className="face-3d cm-grid-panel border-r border-t border-white/10"
                    style={{
                        width: `${height * scale}px`,
                        height: '100%',
                        top: 0,
                        left: 0,
                        transform: 'rotateY(90deg) translateX(-100%)',
                        transformOrigin: 'left',
                        backgroundColor: 'rgba(255,255,255,0.01)'
                    }}
                />

                {/* ITEMS */}
                {items.map(({ item, position }) => (
                    <ItemCuboid 
                        key={item.id} 
                        item={item} 
                        position={position} 
                        scale={scale} 
                    />
                ))}

                {/* Crate Outline (Top Edges) */}
                <div 
                    className="face-3d border border-white/20 pointer-events-none"
                    style={{
                        width: '100%',
                        height: '100%',
                        transform: `translateZ(${height * scale}px)`,
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        boxShadow: 'inset 0 0 40px rgba(255,255,255,0.05)'
                    }}
                />
            </div>
        </div>
    );
};

const ItemCuboid: React.FC<{ 
    item: InventoryItem; 
    position: PackingPosition;
    scale: number;
}> = ({ item, position, scale }) => {
    const norm = normalizeInventoryData(item.data);
    const w = (Number(norm.widthCm) || 10) * scale;
    const l = (Number(norm.lengthCm) || 10) * scale;
    const h = (Number(norm.heightCm) || 10) * scale;
    
    // 3cm Padding Visualizer
    const padding = 3 * scale;

    const transform = `translate3d(${position.x * scale}px, ${position.y * scale}px, ${position.z * scale}px) rotateZ(${position.rotation}deg) ${position.isFlipped ? 'rotateX(180deg)' : ''}`;

    return (
        <div 
            className="absolute transition-transform duration-500" 
            style={{ 
                width: `${w}px`, 
                height: `${l}px`, 
                transform,
                transformStyle: 'preserve-3d',
                cursor: 'pointer'
            }}
        >
            {/* Main Cuboid Faces */}
            {/* Top */}
            <div 
                className="face-3d bg-(--main-color)/20 border border-(--main-color)/40"
                style={{ width: '100%', height: '100%', transform: `translateZ(${h}px)` }}
            />
            {/* Front */}
            <div 
                className="face-3d bg-(--main-color)/10 border border-(--main-color)/30"
                style={{ width: '100%', height: `${h}px`, bottom: 0, transform: 'rotateX(-90deg)', transformOrigin: 'bottom' }}
            />
            {/* Right */}
            <div 
                className="face-3d bg-(--main-color)/10 border border-(--main-color)/30"
                style={{ width: `${h}px`, height: '100%', right: 0, transform: 'rotateY(90deg)', transformOrigin: 'right' }}
            />
            {/* Back */}
            <div 
                className="face-3d bg-(--main-color)/5 border border-(--main-color)/20"
                style={{ width: '100%', height: `${h}px`, top: 0, transform: 'rotateX(90deg)', transformOrigin: 'top' }}
            />
            {/* Left */}
            <div 
                className="face-3d bg-(--main-color)/5 border border-(--main-color)/20"
                style={{ width: `${h}px`, height: '100%', left: 0, transform: 'rotateY(-90deg)', transformOrigin: 'left' }}
            />
            
            {/* Label/ID on top */}
            <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ transform: `translateZ(${h + 1}px)` }}
            >
                <span className="text-[8px] font-black text-white/60 uppercase tracking-tighter bg-black/40 px-1 rounded-sm whitespace-nowrap">
                    {norm.itemId?.slice(-4) || 'ITEM'}
                </span>
            </div>

            {/* Padding Clearance Indicator (Optional/Subtle) */}
            <div 
                className="absolute border border-white/5 pointer-events-none rounded-sm"
                style={{ 
                    inset: `-${padding/2}px`, 
                    height: `${l + padding}px`, 
                    width: `${w + padding}px`,
                    transform: `translateZ(0px)`
                }}
            />
        </div>
    );
};
