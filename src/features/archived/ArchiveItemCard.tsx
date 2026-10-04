import React from 'react';
import type { ArchiveItem, ArchiveFinance } from '../archive/types';
import { vendorColor, parseDescription, formatDims, formatWeight, formatMoney, formatNumber, formatDate } from './archiveFormat';
import { tr } from '../../lib/i18n';

export interface ArchiveItemCardProps {
    item: ArchiveItem;
    finance: ArchiveFinance | null;
    isSelected: boolean;
    onClick: () => void;
}

export const ArchiveItemCard: React.FC<ArchiveItemCardProps> = React.memo(({ item, finance, isSelected, onClick }) => {
    const vColor = vendorColor(item.vendor);
    const { color, shape, title } = parseDescription(item.description);
    const dims = formatDims(item);

    return (
        <button
            type="button"
            className="arch-glass arch-row text-left flex flex-col rounded-xl overflow-hidden relative w-full hover:-translate-y-1 transition-transform"
            data-selected={isSelected}
            aria-pressed={isSelected}
            aria-label={`${item.tag_id || ''} · ${title}`}
            onClick={onClick}
        >
            <div className="flex flex-col items-center justify-center relative overflow-hidden aspect-[3/2] w-full shrink-0" style={{ backgroundColor: vColor }}>
                <div className="text-5xl font-black opacity-20 leading-none mix-blend-overlay pointer-events-none select-none">{item.vendor}</div>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    {item.tag_id && (
                        <span className="vendor-tag inline-flex items-center rounded text-black text-[11px] leading-none font-black uppercase tracking-tight shadow-sm overflow-hidden">
                            <span className="px-1.5 py-1 shrink-0 bg-black/10 text-white mix-blend-overlay">{item.tag_id.slice(0, 5)}</span>
                            <span className="px-1.5 py-1 bg-white text-black border border-white/10 truncate shadow-inner">{item.tag_id.slice(5)}</span>
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-col p-3 gap-2 w-full flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <h3 className="text-[13px] uppercase tracking-tight font-bold truncate flex-1 min-w-0" title={title}>
                        {shape || tr("OBJ")} {color && <span className="opacity-60">{color}</span>}
                    </h3>
                    {item.quantity != null && (
                        <span className="text-[12px] font-mono text-cyan-500 font-bold shrink-0">{formatNumber(item.quantity, 0)}</span>
                    )}
                </div>
                
                {(color || shape) && (
                    <div className="flex flex-wrap gap-1">
                        {color && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-black/5 opacity-70">{color}</span>}
                        {shape && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-black/5 opacity-70">{shape}</span>}
                    </div>
                )}

                <div className="mt-auto pt-2 flex justify-between items-end border-t border-black/5">
                    <div className="flex flex-col min-w-0">
                        <span className="text-[9px] font-black uppercase opacity-40 tracking-wider truncate">{tr("Dims")}</span>
                        <span className="text-[11px] font-mono font-bold opacity-80 truncate">{dims || '—'}</span>
                    </div>
                    {finance && (
                        <div className="flex flex-col items-end shrink-0 pl-2">
                            <span className="text-[9px] font-black uppercase opacity-40 tracking-wider">{tr("USD")}</span>
                            <span className="text-[12px] font-mono font-black text-[var(--main-color)]">{formatMoney(finance.total_usd, 'USD')}</span>
                        </div>
                    )}
                </div>
            </div>
        </button>
    );
}, (prev, next) => {
    return prev.item.id === next.item.id &&
           prev.finance === next.finance &&
           prev.isSelected === next.isSelected;
});
