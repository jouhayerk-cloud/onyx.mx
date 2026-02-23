import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { workbookSuppliesDataAtom } from '../../lib/atoms';

export const WorkbookSuppliesView: React.FC = () => {
    const rawData = useAtomValue(workbookSuppliesDataAtom);

    const suppliesInfo = useMemo(() => {
        if (!rawData || rawData.length === 0) return null;

        // 1. Balance Info (usually at the top)
        // From observation: row 1-2 contains totals
        const totalOut = rawData[2]?.[7] || 0;
        const totalIn = rawData[2]?.[9] || 0;
        const remaining = parseFloat(totalIn) - parseFloat(totalOut);

        // 2. Find Data Header
        let headerIdx = -1;
        for (let i = 0; i < rawData.length; i++) {
            const rowStr = rawData[i]?.join(' ').toUpperCase() || '';
            if (rowStr.includes('DESCTIPTION') || rowStr.includes('ITEM')) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return { items: [], totalOut, totalIn, remaining };

        const headers = rawData[headerIdx].map((h: any) => String(h).toUpperCase());
        const getIdx = (parts: string[]) => headers.findIndex(h => parts.some(p => h.includes(p)));

        const indices = {
            date: getIdx(['DATE']),
            item: getIdx(['ITEM']),
            desc: getIdx(['DESCRIPTION', 'DESCTIPTION']),
            qty: getIdx(['Q', 'QTY']),
            msn: getIdx(['MSN', 'IN/OUT']),
            total: getIdx(['TOTAL']),
            usd: getIdx(['USD'])
        };

        const items = rawData.slice(headerIdx + 1)
            .filter(row => row[indices.desc] || row[indices.item])
            .map(row => ({
                date: row[indices.date],
                item: row[indices.item],
                description: row[indices.desc],
                qty: row[indices.qty],
                msn: row[indices.msn],
                total: row[indices.total],
                usd: row[indices.usd]
            }));

        return { items, totalOut, totalIn, remaining };
    }, [rawData]);

    const fmt = (val: any) => {
        const n = parseFloat(val);
        if (isNaN(n)) return val || '-';
        return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });
    };

    if (!suppliesInfo || suppliesInfo.items.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--text-color-secondary)]">
                No supplies or labor data found in -Supplies sheet.
            </div>
        );
    }

    return (
        <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar relative z-10">
            <div className="flex justify-between items-end border-b border-white/10 pb-4">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Inventory</span>
                    <h2 className="text-3xl font-black text-white italic font-display">SUPPLIES & LABOR</h2>
                </div>
                <div className="flex gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase tracking-widest text-white/30">Total Out</span>
                        <span className="text-sm font-mono font-bold text-[#e06666]">{fmt(suppliesInfo.totalOut)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase tracking-widest text-white/30">Total In</span>
                        <span className="text-sm font-mono font-bold text-[#a9d08e]">{fmt(suppliesInfo.totalIn)}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-white/10 border-r border-white/5"></div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase tracking-widest text-white/30">Remaining</span>
                        <span className="text-lg font-mono font-bold text-white">{fmt(suppliesInfo.remaining)}</span>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-white/[0.02] border-b border-white/5">
                        <tr className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                            <th className="p-4">Date</th>
                            <th className="p-4">Item / Description</th>
                            <th className="p-4 text-center">Qty</th>
                            <th className="p-4 text-right">Amount (MXN)</th>
                            <th className="p-4 text-right">Total</th>
                            <th className="p-4 text-right">USD</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-xs">
                        {suppliesInfo.items.map((item, i) => {
                            const isOut = parseFloat(item.msn) > 0;
                            return (
                                <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="p-4 text-white/30">
                                        {item.date ? (typeof item.date === 'number' ? new Date(Math.round((item.date - 25569) * 864e5)).toLocaleDateString('es-MX') : String(item.date)) : '-'}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col">
                                            <span className="text-white font-medium mb-0.5 group-hover:text-[#F7941D] transition-colors">{item.item || '-'}</span>
                                            <span className="text-[10px] text-white/40 uppercase tracking-tight line-clamp-1">{item.description || ''}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center text-white/60">{item.qty || '-'}</td>
                                    <td className={`p-4 text-right font-bold ${isOut ? 'text-[#e06666]' : 'text-white/40'}`}>
                                        {fmt(item.msn)}
                                    </td>
                                    <td className="p-4 text-right text-white font-bold">{fmt(item.total)}</td>
                                    <td className="p-4 text-right text-[#00b0f0] font-bold">
                                        {item.usd ? `$${parseFloat(item.usd).toFixed(2)}` : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
