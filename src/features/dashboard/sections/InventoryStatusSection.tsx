import React from 'react';
import { Package, Zap } from 'lucide-react';
import { tr } from '../../../lib/i18n';

// ── Wireframe SVG Component ─────────────────────────────────────────
const LargeCrateWireframe: React.FC<{ w?: number; l?: number; h?: number; type?: string; size?: number; color?: string; fillPercent?: number }> = ({
    w = 60, l = 60, h = 60, type = 'crate', size = 130, color = 'var(--main-color)', fillPercent = 0
}) => {
    const visH = type === 'pallet' ? 15 : h;
    const maxDim = Math.max(w, l, visH, 1);
    const scale  = (size * 0.33) / maxDim;
    const dw = Math.round(w    * scale);
    const dh = Math.round(visH * scale);
    const depth = Math.round(l * scale * 0.4);
    const svgW = dw + depth + 8, svgH = dh + depth + 8;
    const x0 = 4, y0 = depth + 4, x1 = x0 + dw, y2 = y0 + dh;
    const dx = depth, dy = -depth;

    const fillH = Math.round(dh * (fillPercent / 100));
    const fillY = y2 - fillH;

    return (
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ filter: `drop-shadow(0 0 10px ${color})`, overflow: 'visible' }}>
            {/* Hidden Back Edges */}
            <line x1={x0+dx} y1={y0+dy} x2={x0+dx} y2={y2+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" />
            <line x1={x0+dx} y1={y0+dy} x2={x1+dx} y2={y0+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" />
            <line x1={x0+dx} y1={y2+dy} x2={x1+dx} y2={y2+dy} stroke={color} strokeWidth="0.7" strokeDasharray="2,2" />

            {/* Internal Fill (Cargo Block) */}
            {fillPercent > 0 && (
                <g opacity={0.6}>
                    <polygon points={`${x1},${y2} ${x1+dx},${y2+dy} ${x1+dx},${fillY+dy} ${x1},${fillY}`} fill={color} />
                    <polygon points={`${x0},${fillY} ${x0+dx},${fillY+dy} ${x1+dx},${fillY+dy} ${x1},${fillY}`} fill={color} filter="brightness(1.3)" />
                    <rect x={x0} y={fillY} width={dw} height={fillH} fill={color} filter="brightness(1.1)" />
                    <line x1={x0} y1={fillY} x2={x1} y2={fillY} stroke="white" strokeWidth="0.5" opacity="0.3" />
                </g>
            )}

            {/* Main Wireframe Structure */}
            <polygon points={`${x0},${y0} ${x0+dx},${y0+dy} ${x1+dx},${y0+dy} ${x1},${y0}`} fill="none" stroke={color} strokeWidth="1" />
            <polygon points={`${x1},${y0} ${x1+dx},${y0+dy} ${x1+dx},${y2+dy} ${x1},${y2}`} fill="none" stroke={color} strokeWidth="1" />
            <rect x={x0} y={y0} width={dw} height={dh} fill="none" stroke={color} strokeWidth="1.2" />
        </svg>
    );
};

interface InventoryStatusSectionProps {
    groupedLogistics: any[];
}

export const InventoryStatusSection: React.FC<InventoryStatusSectionProps> = ({ groupedLogistics }) => {
    return (
        <section aria-label="Storage and Logistics">
            <div className="flex items-center gap-3 mb-6 px-2">
                <Package size={16} strokeWidth={2.5} className="text-(--main-color)" />
                <h2 className="text-[14px] font-black uppercase tracking-[0.2em] text-(--text-color)">{tr("Storage & Logistics")}</h2>
            </div>

            <div className="bg-white/[0.03] backdrop-blur-2xl p-8 rounded-3xl border border-white/10 shadow-2xl">
                {groupedLogistics.length === 0 ? (
                    <div className="py-12 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">
                        {tr("No logistics data")}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-16 gap-y-20">
                        {groupedLogistics.map((log: any, idx: number) => {
                            const isPacked = log.packed >= log.count;
                            const statusColor = isPacked ? 'var(--main-color)' : 'var(--text-color-secondary)';
                            return (
                                <div key={idx} className="flex flex-col items-center gap-6 group/box transition-all cursor-default relative">
                                    <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                    
                                    <div className="relative h-32 w-full flex items-center justify-center transition-transform group-hover/box:-translate-y-4">
                                        <LargeCrateWireframe 
                                            w={log.w} l={log.l} h={log.h} 
                                            type={log.type} 
                                            color={statusColor} 
                                            size={130} 
                                            fillPercent={(log.packed / log.count) * 100}
                                        />
                                        {log.packed > 0 && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover/box:scale-125 transition-transform">
                                                <Zap size={20} className={isPacked ? "text-(--main-color) animate-pulse" : "text-white"} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="w-full text-center space-y-2 relative z-10 p-2">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] font-black text-(--text-color) tracking-[0.4em] uppercase mb-2">{log.type}</span>
                                            <p className="text-2xl font-black text-(--text-color) tracking-tighter leading-none group-hover/box:scale-110 transition-transform">
                                                {log.isIndividual ? (
                                                    <span className="text-[10px] font-mono border-b border-dashed border-white pb-1">{tr("ID: #")}{log.shortId}</span>
                                                ) : (
                                                    <>{log.count} <span className="text-[11px] font-bold text-(--text-color-secondary) tracking-widest uppercase ml-1">{tr("Units")}</span></>
                                                )}
                                            </p>
                                            <p className="text-[10px] font-mono font-bold text-(--text-color-secondary) mt-2">@{log.w}x{log.h}x{log.l}</p>
                                        </div>
                                        {!log.isIndividual && (
                                            <div className="flex items-center justify-center gap-3 mt-3">
                                                <div className="h-[3px] w-16 bg-white/10 overflow-hidden rounded-full shadow-inner">
                                                    <div className="h-full transition-all duration-700" style={{ width: `${(log.packed/log.count)*100}%`, backgroundColor: statusColor }} />
                                                </div>
                                                <span className="text-[10px] font-mono font-black" style={{ color: statusColor }}>{Math.round((log.packed/log.count)*100)}%</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};
