import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { workbookProductionDataAtom } from '../../lib/atoms';
import { vendors as vendorConfigs } from '../../lib/consts';
import { tr } from '../../lib/i18n';

export const WorkbookProductionView: React.FC = () => {
    const rawData = useAtomValue(workbookProductionDataAtom);

    const productionItems = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];
        let headerIdx = -1;
        for (let i = 0; i < rawData.length; i++) {
            const rowStr = rawData[i]?.join(' ').toUpperCase() || '';
            if (rowStr.includes('DESCRIPTION') && (rowStr.includes('TOTAL') || rowStr.includes('QTY'))) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return [];

        const headers = rawData[headerIdx].map((h: any) => String(h).toUpperCase());
        const getIdx = (parts: string[]) => headers.findIndex(h => parts.some(p => h.includes(p)));

        const indices = {
            date: getIdx(['DATE']),
            vendor: getIdx(['VENDOR']),
            desc: getIdx(['DESCRIPTION']),
            price: getIdx(['PRICE']),
            qty: getIdx(['QTY', ' Q']),
            total: getIdx(['TOTAL']),
            advance: getIdx(['ADVANCE']),
            ready: getIdx(['READY']),
            tag: getIdx(['TAG'])
        };

        return rawData.slice(headerIdx + 1)
            .filter(row => row[indices.desc] || row[indices.vendor]) // Must have at least a description or vendor
            .map(row => ({
                date: row[indices.date],
                vendor: row[indices.vendor],
                description: row[indices.desc],
                price: row[indices.price],
                qty: row[indices.qty],
                total: row[indices.total],
                advance: row[indices.advance],
                readyDate: row[indices.ready],
                tagId: row[indices.tag]
            }));
    }, [rawData]);

    const fmt = (val: any) => {
        const n = parseFloat(val);
        if (isNaN(n)) return val || '-';
        return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });
    };

    if (productionItems.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--text-color-secondary)]">
                {tr("No active production orders found in -Production sheet.")}
            </div>
        );
    }

    return (
        <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar relative z-10">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-bold border-l-2 border-[#FFED00] pl-3">
                    {tr("Active Production")} <span className="text-white/20 ml-2 font-mono">[{productionItems.length}]</span>
                </h2>
                <div className="flex gap-4">
                    <span className="text-[10px] text-white/30 uppercase tracking-widest">{tr("v326 Operational")}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {productionItems.map((item, i) => {
                    const vendorCode = String(item.vendor || '').split(' ')[0];
                    const config = vendorConfigs[vendorCode as keyof typeof vendorConfigs];
                    const color = config?.color || '#333';

                    const total = parseFloat(item.total) || 0;
                    const advance = parseFloat(item.advance) || 0;
                    const progress = total > 0 ? Math.min(100, (advance / total) * 100) : 0;

                    return (
                        <div key={i} className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4 hover:bg-white/[0.02] transition-colors relative overflow-hidden group">
                            {/* Color accent bar */}
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }}></div>

                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[9px] font-bold text-black" style={{ backgroundColor: color }}>
                                            {vendorCode}
                                        </span>
                                        {item.tagId && (
                                            <span className="text-[9px] font-mono text-white/40">#{String(item.tagId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}</span>
                                        )}
                                    </div>
                                    <h3 className="text-sm font-bold text-white mt-1 group-hover:text-[#FFED00] transition-colors line-clamp-1">
                                        {item.description || 'Unnamed Order'}
                                    </h3>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-white/30 uppercase">{tr("Total")}</div>
                                    <div className="text-sm font-mono font-bold text-white">{fmt(item.total)}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-[10px]">
                                <div>
                                    <div className="text-white/30 uppercase mb-1">{tr("Price Unit")}</div>
                                    <div className="text-white/60 font-mono">{fmt(item.price)}</div>
                                </div>
                                <div>
                                    <div className="text-white/30 uppercase mb-1">{tr("Quantity")}</div>
                                    <div className="text-white/60 font-mono">x {item.qty}</div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5 mt-2">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-white/30 uppercase">{tr("Advance Payment")}</span>
                                    <span className="font-mono text-white/60">{fmt(item.advance)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#FFED00] transition-all duration-1000"
                                        style={{ width: `${progress}%`, opacity: progress > 0 ? 1 : 0.2 }}
                                    ></div>
                                </div>
                            </div>

                            <div className="mt-2 pt-3 border-t border-white/5 flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-white/20 uppercase">{tr("Ready Date")}</span>
                                    <span className="text-xs text-white/60 font-mono">
                                        {item.readyDate ? (typeof item.readyDate === 'number' ? new Date(Math.round((item.readyDate - 25569) * 864e5)).toLocaleDateString('es-MX') : String(item.readyDate)) : 'TBD'}
                                    </span>
                                </div>
                                <button className="p-2 rounded-full hover:bg-white/10 text-white/20 hover:text-white transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
