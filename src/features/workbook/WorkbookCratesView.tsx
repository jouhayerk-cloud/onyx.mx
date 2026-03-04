import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { workbookCratesFileDataAtom } from '../../lib/atoms';
import { vendors as vendorConfigs } from '../../lib/consts';

export const WorkbookCratesView: React.FC = () => {
    const rawData = useAtomValue(workbookCratesFileDataAtom);

    const cratesInfo = useMemo(() => {
        if (!rawData || rawData.length === 0) return null;
        const owedToSimona = rawData[1]?.[9] || 0; // TBP total
        const paidSimona = rawData[2]?.[9] || 0;
        const balanceSimona = parseFloat(owedToSimona) - parseFloat(paidSimona);
        let headerIdx = -1;
        for (let i = 0; i < rawData.length; i++) {
            const rowStr = rawData[i]?.join(' ').toUpperCase() || '';
            if (rowStr.includes('KG') && rowStr.includes('DESCTIPTION')) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return { items: [], balanceSimona };

        const headers = rawData[headerIdx].map((h: any) => String(h).toUpperCase());
        const getIdx = (parts: string[]) => headers.findIndex(h => parts.some(p => h.includes(p)));

        const indices = {
            date: getIdx(['DATE']),
            vendor: getIdx(['VENDOR']),
            item: getIdx(['ITEM']),
            desc: getIdx(['DESCRIPTION', 'DESCTIPTION']),
            qty: getIdx(['Q', 'QTY']),
            kg: getIdx(['KG']),
            l: getIdx(['L']),
            w: getIdx(['W']),
            d: getIdx(['D']),
            msn: getIdx(['MSN', 'IN/OUT']),
            total: getIdx(['TOTAL']),
            lbs: getIdx(['POUNDS', 'LBS']),
            dims: getIdx(['DIMENSIONS'])
        };

        const items = rawData.slice(headerIdx + 1)
            .filter(row => row[indices.desc] || row[indices.vendor])
            .map(row => ({
                date: row[indices.date],
                vendor: row[indices.vendor],
                item: row[indices.item],
                description: row[indices.desc],
                qty: row[indices.qty],
                kg: row[indices.kg],
                l: row[indices.l],
                w: row[indices.w],
                d: row[indices.d],
                msn: row[indices.msn],
                total: row[indices.total],
                lbs: row[indices.lbs],
                dimsInfo: row[indices.dims]
            }));

        return { items, balanceSimona };
    }, [rawData]);

    const fmt = (val: any) => {
        const n = parseFloat(val);
        if (isNaN(n)) return val || '-';
        return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });
    };

    if (!cratesInfo || cratesInfo.items.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--text-color-secondary)]">
                No pallets or crates data found in -Crates sheet.
            </div>
        );
    }

    return (
        <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar relative z-10">
            <div className="flex justify-between items-end border-b border-white/10 pb-4">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Logistics</span>
                    <h2 className="text-3xl font-black text-white italic font-display">PALLETS & CRATES</h2>
                </div>
                <div className="flex gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase tracking-widest text-white/30">Owed to Simona</span>
                        <span className="text-lg font-mono font-bold text-[#8DC63F]">{fmt(cratesInfo.balanceSimona)}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {cratesInfo.items.map((item, i) => {
                    const vendorCode = String(item.vendor || '').split(' ')[0];
                    const config = vendorConfigs[vendorCode as keyof typeof vendorConfigs];
                    const color = config?.color || '#333';

                    return (
                        <div key={i} className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4 hover:border-white/20 transition-all group relative overflow-hidden">
                            {/* Color accent bar */}
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }}></div>

                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[9px] font-bold text-black" style={{ backgroundColor: color }}>
                                            {vendorCode}
                                        </span>
                                        <span className="text-[10px] text-white/40 font-mono italic">{item.item || 'Crate'}</span>
                                    </div>
                                    <h3 className="text-sm font-bold text-white mt-1 group-hover:text-[#8DC63F] transition-colors">{item.description || 'Logistics Entry'}</h3>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-white/30 uppercase">Date</div>
                                    <div className="text-xs font-mono text-white/60">
                                        {item.date ? (typeof item.date === 'number' ? new Date(Math.round((item.date - 25569) * 864e5)).toLocaleDateString('es-MX') : String(item.date)) : '-'}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/5 bg-white/[0.01] px-3 -mx-5">
                                <div className="flex flex-col items-center">
                                    <span className="text-[9px] uppercase text-white/20">Weight</span>
                                    <span className="text-xs font-bold text-white font-mono">{item.kg || '-'} <span className="text-[8px] opacity-40">kg</span></span>
                                    <span className="text-[8px] text-white/20">{item.lbs || '-'} lbs</span>
                                </div>
                                <div className="flex flex-col items-center border-x border-white/5">
                                    <span className="text-[9px] uppercase text-white/20">Quantity</span>
                                    <span className="text-xs font-bold text-white font-mono">{item.qty || '1'}</span>
                                    <span className="text-[8px] text-white/20">Units</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-[9px] uppercase text-white/20">Cost</span>
                                    <span className="text-xs font-bold text-[#8DC63F] font-mono">{fmt(item.total)}</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] uppercase tracking-wider text-white/30">Dimensions (CM)</span>
                                    <div className="flex gap-1">
                                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-mono text-white/80 border border-white/10">{item.l || '0'}×{item.w || '0'}×{item.d || '0'}</span>
                                    </div>
                                </div>
                                {item.dimsInfo && (
                                    <div className="text-[9px] text-white/40 italic font-mono bg-white/5 p-2 rounded">
                                        {item.dimsInfo}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
