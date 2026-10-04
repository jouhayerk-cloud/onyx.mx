import React, { useRef, useEffect } from 'react';
import type { ArchiveItem, ArchiveFinance } from '../archive/types';
import { vendorColor, parseDescription, formatDims, formatWeight, formatMoney, formatNumber, formatDate } from './archiveFormat';
import { tr } from '../../lib/i18n';

export interface ArchiveItemTableProps {
    items: ArchiveItem[];
    financeMap: Record<string, ArchiveFinance>;
    isFinanceRole: boolean;
    selectedId: string | null;
    onRowClick: (item: ArchiveItem) => void;
    density: 'compact' | 'standard';
}

export const ArchiveItemTable: React.FC<ArchiveItemTableProps> = ({ items, financeMap, isFinanceRole, selectedId, onRowClick, density }) => {
    const padding = density === 'compact' ? 'py-1' : 'py-3';
    
    // Shared column layout for header and body rows
    const gridCols = isFinanceRole
        ? '100px 120px 100px 110px 240px 80px 80px 180px 110px 110px 80px 80px 110px 110px 160px'
        : '100px 120px 100px 110px 240px 80px 80px 180px';
    const totalWidth = isFinanceRole ? 1990 : 1010;

    const headRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const head = headRef.current;
        const body = bodyRef.current;
        if (!head || !body) return;
        
        const syncScroll = () => {
            head.scrollLeft = body.scrollLeft;
        };
        
        body.addEventListener('scroll', syncScroll);
        return () => body.removeEventListener('scroll', syncScroll);
    }, []);

    return (
        <div className="flex flex-col w-full relative">
            <div 
                ref={headRef}
                className="arch-th overflow-hidden border-b border-black/5"
            >
                <div role="row" className="grid items-center" style={{ gridTemplateColumns: gridCols, width: totalWidth }}>
                    <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 sticky left-0 z-10 arch-th">{tr("Vendor")}</div>
                    <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 sticky left-[100px] z-10 arch-th">{tr("Tag ID")}</div>
                    <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50">{tr("Num")}</div>
                    <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50">{tr("Date")}</div>
                    <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50">{tr("Description")}</div>
                    <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("Qty")}</div>
                    <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("Wt.")}</div>
                    <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50">{tr("Dimensions")}</div>
                    {isFinanceRole && (
                        <>
                            <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("Price MXN")}</div>
                            <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("Total Pesos")}</div>
                            <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("AQ")}</div>
                            <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("LND")}</div>
                            <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("Retail")}</div>
                            <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("Total USD")}</div>
                            <div role="columnheader" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest opacity-50 text-right">{tr("AQC/LC/SQM/Desc")}</div>
                        </>
                    )}
                </div>
            </div>
            <div ref={bodyRef} className="overflow-x-auto relative w-full no-scrollbar pb-8" role="grid">
                <div className="flex flex-col" style={{ width: totalWidth }}>
                    {items.map(item => (
                        <ArchiveTableRow
                            key={item.id}
                            item={item}
                            finance={financeMap[item.id] || null}
                            isFinanceRole={isFinanceRole}
                            isSelected={selectedId === item.id}
                            onClick={() => onRowClick(item)}
                            padding={padding}
                            gridCols={gridCols}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

interface ArchiveTableRowProps {
    item: ArchiveItem;
    finance: ArchiveFinance | null;
    isFinanceRole: boolean;
    isSelected: boolean;
    onClick: () => void;
    padding: string;
    gridCols: string;
}

const ArchiveTableRow: React.FC<ArchiveTableRowProps> = React.memo(({ item, finance, isFinanceRole, isSelected, onClick, padding, gridCols }) => {
    const vColor = vendorColor(item.vendor);
    const { title } = parseDescription(item.description);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <div 
            className="arch-row grid items-center border-b border-black/5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] focus-visible:ring-inset"
            data-selected={isSelected}
            onClick={onClick}
            tabIndex={0}
            role="row"
            aria-selected={isSelected}
            onKeyDown={handleKeyDown}
            style={{ gridTemplateColumns: gridCols }}
        >
            <div role="gridcell" className={`px-4 ${padding} sticky left-0 z-10 flex items-center arch-row`} data-selected={isSelected}>
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-black text-white mix-blend-screen shadow-sm" style={{ backgroundColor: vColor }}>
                    {item.vendor}
                </span>
            </div>
            <div role="gridcell" className={`px-4 ${padding} font-mono text-[12px] font-bold sticky left-[100px] z-10 arch-row flex items-center`} data-selected={isSelected}>{item.tag_id || '—'}</div>
            <div role="gridcell" className={`px-4 ${padding} font-mono text-[12px] opacity-70`}>{item.item_number || '—'}</div>
            <div role="gridcell" className={`px-4 ${padding} text-[12px] opacity-70`}>{formatDate(item.item_date) || '—'}</div>
            <div role="gridcell" className={`px-4 ${padding} text-[13px] font-medium truncate`} title={title}>{title || '—'}</div>
            <div role="gridcell" className={`px-4 ${padding} text-[13px] font-mono font-black text-cyan-500 text-right tabular-nums`}>{formatNumber(item.quantity, 0)}</div>
            <div role="gridcell" className={`px-4 ${padding} text-[12px] font-mono font-bold opacity-70 text-right tabular-nums`}>{formatWeight(item.weight_kg) || '—'}</div>
            <div role="gridcell" className={`px-4 ${padding} text-[12px] font-mono font-black`}>{formatDims(item) || '—'}</div>
            
            {isFinanceRole && (
                <>
                    <div role="gridcell" className={`px-4 ${padding} text-[13px] font-black text-right tabular-nums`}>{formatMoney(finance?.price_mxn ?? null, 'MXN')}</div>
                    <div role="gridcell" className={`px-4 ${padding} text-[13px] font-black text-[var(--main-color)] text-right tabular-nums`}>{formatMoney(finance?.total_pesos ?? null, 'MXN')}</div>
                    <div role="gridcell" className={`px-4 ${padding} text-[12px] font-mono font-black opacity-75 text-right tabular-nums`}>{formatNumber(finance?.aq ?? null)}</div>
                    <div role="gridcell" className={`px-4 ${padding} text-[12px] font-mono font-black text-yellow-500/90 text-right tabular-nums`}>{formatNumber(finance?.lnd ?? null)}</div>
                    <div role="gridcell" className={`px-4 ${padding} text-[13px] font-black text-green-500 text-right tabular-nums`}>{formatMoney(finance?.retail ?? null, 'USD')}</div>
                    <div role="gridcell" className={`px-4 ${padding} text-[13px] font-black text-[var(--main-color)] text-right tabular-nums`}>{formatMoney(finance?.total_usd ?? null, 'USD')}</div>
                    <div role="gridcell" className={`px-4 ${padding} text-[11px] font-mono opacity-50 text-right tabular-nums`}>
                        {[finance?.aqc, finance?.lc, finance?.sqm_price, finance?.desc_price].map(x => formatNumber(x)).join(' / ')}
                    </div>
                </>
            )}
        </div>
    );
}, (prev, next) => {
    return prev.item.id === next.item.id &&
           prev.finance === next.finance &&
           prev.isFinanceRole === next.isFinanceRole &&
           prev.isSelected === next.isSelected &&
           prev.padding === next.padding &&
           prev.gridCols === next.gridCols;
});
