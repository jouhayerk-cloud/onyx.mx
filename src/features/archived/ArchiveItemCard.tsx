import React from 'react';
import type { ArchiveItem, ArchiveFinance } from '../archive/types';
import { vendorColor, parseDescription, formatDims, formatWeight, formatMoney, formatDate } from './archiveFormat';
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
    const weight = formatWeight(item.weight_kg);

    return (
        <button
            type="button"
            className={`inv-card inv-card--xl text-left`}
            aria-pressed={isSelected}
            aria-label={`${item.tag_id || ''} · ${title}`}
            onClick={onClick}
        >
            <div className="inv-card-layout">
                <div className="inv-gal">
                    <div className="inv-gal-hero flex flex-col items-center justify-center relative overflow-hidden" style={{ backgroundColor: vColor }}>
                        <div className="text-[6rem] font-black opacity-20 leading-none mix-blend-overlay pointer-events-none select-none">{item.vendor}</div>
                        
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            {item.tag_id && (
                                <span className="vendor-tag inline-flex items-center rounded text-black text-[13px] leading-none font-black uppercase tracking-tight shadow-md max-w-full overflow-hidden">
                                    <span className="px-2 py-1.5 shrink-0 bg-black/10 text-white mix-blend-overlay">{item.tag_id.slice(0, 5)}</span>
                                    <span className="px-2 py-1.5 text-(--text-color) bg-(--sidebar-bg) border border-white/10 truncate shadow-inner">{item.tag_id.slice(5)}</span>
                                </span>
                            )}
                            {item.item_number && (
                                <span className="text-[12px] font-mono font-black text-black/50 mix-blend-overlay px-2 py-1 rounded-sm bg-white/20">
                                    #{item.item_number}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="inv-card-body">
                    <div className="inv-xl-head">
                        <div className="inv-xl-id">
                            <span className="inv-card-qty text-[13px] font-mono font-black text-cyan-500" title={tr("Quantity")}>{item.quantity || 1}</span>
                        </div>
                    </div>

                    <h3 className="inv-card-name text-[14px] uppercase tracking-tight text-(--text-color) truncate" title={title}>
                        <b>{shape || tr("OBJ")}</b> {color && <span className="text-(--text-color)/75">{color}</span>}
                    </h3>
                    
                    <div className="flex flex-wrap gap-1.5 mt-2 mb-4">
                        {color && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-(--text-color)/5 text-(--text-color)/70 border border-(--border-color)">{color}</span>}
                        {shape && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-(--text-color)/5 text-(--text-color)/70 border border-(--border-color)">{shape}</span>}
                    </div>

                    <div className="inv-readout inv-readout--xl mt-4">
                        <div className="inv-xl-specs flex items-center justify-between w-full">
                            <div className="inv-xl-measure flex flex-col">
                                <span className="text-[10px] font-black uppercase text-(--text-color)/40 tracking-wider">{tr("Dimensions")}</span>
                                <span className="inv-ro-v text-[13px] font-mono font-black text-(--text-color)">{dims || '—'}</span>
                            </div>
                            <div className="inv-xl-measure inv-r flex flex-col items-end">
                                <span className="text-[10px] font-black uppercase text-(--text-color)/40 tracking-wider">{tr("Weight")}</span>
                                <span className="inv-ro-v text-[13px] font-mono font-bold text-(--text-color)/70">{weight || '—'}</span>
                            </div>
                        </div>

                        <div className="inv-xl-specs flex items-center justify-between w-full mt-2">
                            <div className="inv-xl-measure flex flex-col">
                                <span className="text-[10px] font-black uppercase text-(--text-color)/40 tracking-wider">{tr("Date")}</span>
                                <span className="text-[12px] font-medium text-(--text-color)/70">{formatDate(item.item_date) || '—'}</span>
                            </div>
                        </div>
                        
                        {finance !== null && (
                            <div className="inv-xl-figs mt-3 pt-3 border-t border-(--border-color) flex flex-row items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-(--text-color)/40 tracking-wider">{tr("Price MXN")}</span>
                                    <span className="inv-ro-v text-[14px] font-black text-(--text-color)">{formatMoney(finance.price_mxn, 'MXN')}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black uppercase text-(--text-color)/40 tracking-wider">{tr("Total USD")}</span>
                                    <span className="inv-ro-v text-[14px] font-black text-(--main-color)">{formatMoney(finance.total_usd, 'USD')}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
}, (prev, next) => {
    return prev.item.id === next.item.id &&
           prev.finance === next.finance &&
           prev.isSelected === next.isSelected;
});
