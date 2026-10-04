import React from 'react';
import type { ArchiveItem, ArchiveFinance } from '../archive/types';
import { vendorColor, parseDescription, formatDims, formatWeight, formatMoney, formatDate } from './archiveFormat';
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
    
    return (
        <div className="w-full overflow-x-auto relative no-scrollbar">
            <table className="w-full text-left whitespace-nowrap border-collapse" role="grid">
                <thead className="sticky top-0 z-20 bg-(--sidebar-bg) border-b border-(--border-color) shadow-sm">
                    <tr>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 sticky left-0 bg-(--sidebar-bg) z-30 shadow-[1px_0_0_var(--border-color)]">{tr("Vendor")}</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50">{tr("Tag ID")}</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50">{tr("Num")}</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50">{tr("Date")}</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50">{tr("Description")}</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("Qty")}</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("Wt.")}</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50">{tr("Dimensions")}</th>
                        {isFinanceRole && (
                            <>
                                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("Price MXN")}</th>
                                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("Total Pesos")}</th>
                                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("AQ")}</th>
                                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("LND")}</th>
                                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("Retail")}</th>
                                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("Total USD")}</th>
                                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-(--text-color)/50 text-right">{tr("AQC/LC/SQM/Desc")}</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--border-color)">
                    {items.map(item => (
                        <ArchiveTableRow
                            key={item.id}
                            item={item}
                            finance={financeMap[item.id] || null}
                            isFinanceRole={isFinanceRole}
                            isSelected={selectedId === item.id}
                            onClick={() => onRowClick(item)}
                            padding={padding}
                        />
                    ))}
                </tbody>
            </table>
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
}

const ArchiveTableRow: React.FC<ArchiveTableRowProps> = React.memo(({ item, finance, isFinanceRole, isSelected, onClick, padding }) => {
    const vColor = vendorColor(item.vendor);
    const { title } = parseDescription(item.description);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <tr 
            className={`hover:bg-(--text-color)/5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-(--main-color) focus-visible:ring-inset transition-colors ${isSelected ? 'bg-(--main-color)/10' : ''}`}
            onClick={onClick}
            tabIndex={0}
            role="row"
            aria-selected={isSelected}
            onKeyDown={handleKeyDown}
            style={{ contentVisibility: 'auto', containIntrinsicSize: '48px' }}
        >
            <td className={`px-4 ${padding} sticky left-0 z-10 shadow-[1px_0_0_var(--border-color)] ${isSelected ? 'bg-transparent' : 'bg-(--sidebar-bg)'}`}>
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-black text-white mix-blend-screen shadow-sm" style={{ backgroundColor: vColor }}>
                    {item.vendor}
                </span>
            </td>
            <td className={`px-4 ${padding} font-mono text-[12px] font-bold text-(--text-color)`}>{item.tag_id || '—'}</td>
            <td className={`px-4 ${padding} font-mono text-[12px] text-(--text-color)/70`}>{item.item_number || '—'}</td>
            <td className={`px-4 ${padding} text-[12px] text-(--text-color)/70`}>{formatDate(item.item_date) || '—'}</td>
            <td className={`px-4 ${padding} text-[13px] text-(--text-color) font-medium max-w-[200px] truncate`} title={title}>{title || '—'}</td>
            <td className={`px-4 ${padding} text-[13px] font-mono font-black text-cyan-500 text-right tabular-nums`}>{item.quantity || 1}</td>
            <td className={`px-4 ${padding} text-[12px] font-mono font-bold text-(--text-color)/70 text-right tabular-nums`}>{formatWeight(item.weight_kg) || '—'}</td>
            <td className={`px-4 ${padding} text-[12px] font-mono font-black text-(--text-color)`}>{formatDims(item) || '—'}</td>
            
            {isFinanceRole && (
                <>
                    <td className={`px-4 ${padding} text-[13px] font-black text-(--text-color) text-right tabular-nums`}>{formatMoney(finance?.price_mxn ?? null, 'MXN')}</td>
                    <td className={`px-4 ${padding} text-[13px] font-black text-(--main-color) text-right tabular-nums`}>{formatMoney(finance?.total_pesos ?? null, 'MXN')}</td>
                    <td className={`px-4 ${padding} text-[12px] font-mono font-black text-(--text-color)/75 text-right tabular-nums`}>{finance?.aq ?? '—'}</td>
                    <td className={`px-4 ${padding} text-[12px] font-mono font-black text-yellow-500/90 text-right tabular-nums`}>{finance?.lnd ?? '—'}</td>
                    <td className={`px-4 ${padding} text-[13px] font-black text-green-500 text-right tabular-nums`}>{formatMoney(finance?.retail ?? null, 'USD')}</td>
                    <td className={`px-4 ${padding} text-[13px] font-black text-(--main-color) text-right tabular-nums`}>{formatMoney(finance?.total_usd ?? null, 'USD')}</td>
                    <td className={`px-4 ${padding} text-[11px] font-mono text-(--text-color)/50 text-right tabular-nums`}>
                        {[finance?.aqc, finance?.lc, finance?.sqm_price, finance?.desc_price].filter(x => x != null).join(' / ') || '—'}
                    </td>
                </>
            )}
        </tr>
    );
}, (prev, next) => {
    return prev.item.id === next.item.id &&
           prev.finance === next.finance &&
           prev.isFinanceRole === next.isFinanceRole &&
           prev.isSelected === next.isSelected &&
           prev.padding === next.padding;
});
