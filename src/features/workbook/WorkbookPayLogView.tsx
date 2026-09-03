import React, { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { workbookPayLogDataAtom } from '../../lib/atoms';
import { vendors as vendorConfigs } from '../../lib/consts';
import { tr } from '../../lib/i18n';

type PayLogEntry = {
    reqDate: any;
    type: string;
    vendor: string;
    account: string;
    mxn: any;
    taxCom: any;
    total: any;
    description: string;
    notes: string;
    payDate: any;
};

export const WorkbookPayLogView: React.FC = () => {
    const rawData = useAtomValue(workbookPayLogDataAtom);
    const [filter, setFilter] = useState<string>('ALL');

    const payLogInfo = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];

        let headerIdx = -1;
        for (let i = 0; i < rawData.length; i++) {
            const rowStr = rawData[i]?.join(' ').toUpperCase() || '';
            if (rowStr.includes('TYPE') && rowStr.includes('VENDOR') && rowStr.includes('ACCOUNT')) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return [];

        const headers = rawData[headerIdx].map((h: any) => String(h).toUpperCase());
        const getIdx = (parts: string[]) => headers.findIndex(h => parts.some(p => h.includes(p)));

        const indices = {
            reqDate: getIdx(['REQ DATE']),
            type: getIdx(['TYPE']),
            vendor: getIdx(['VENDOR']),
            account: getIdx(['ACCOUNT']),
            mxn: getIdx(['MXN']),
            tax: getIdx(['TAX', 'COM']),
            total: getIdx(['TOTAL']),
            desc: getIdx(['DESCRIPTION']),
            notes: getIdx(['NOTES']),
            payDate: getIdx(['PAY DATE'])
        };

        return rawData.slice(headerIdx + 1)
            .filter(row => row[indices.type] && row[indices.vendor])
            .map(row => ({
                reqDate: row[indices.reqDate],
                type: String(row[indices.type] || '').toUpperCase(),
                vendor: String(row[indices.vendor] || ''),
                account: String(row[indices.account] || '').toUpperCase(),
                mxn: row[indices.mxn],
                taxCom: row[indices.tax],
                total: row[indices.total],
                description: row[indices.desc],
                notes: row[indices.notes],
                payDate: row[indices.payDate]
            })) as PayLogEntry[];
    }, [rawData]);

    const filteredEntries = useMemo(() => {
        if (filter === 'ALL') return payLogInfo;
        return payLogInfo.filter(e => e.type === filter);
    }, [payLogInfo, filter]);

    const stats = useMemo(() => {
        const total = filteredEntries.reduce((sum, e) => sum + (parseFloat(e.total) || 0), 0);
        const count = filteredEntries.length;
        return { total, count };
    }, [filteredEntries]);

    const fmt = (val: any) => {
        const n = parseFloat(val);
        if (isNaN(n)) return val || '-';
        return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'ACQUISITION': return '#a9d08e';
            case 'EXPENSE': return '#e06666';
            case 'PRODUCTION': return '#FFED00';
            case 'SUPPLIES': return '#F7941D';
            case 'CRATES': return '#8DC63F';
            default: return 'var(--text-color-secondary)';
        }
    };

    const getAccountColor = (acc: string) => {
        if (acc.includes('BOA')) return '#00b0f0';
        if (acc.includes('BBVA')) return '#00AEEF';
        if (acc.includes('WIRE')) return '#ffffff';
        return 'rgba(255,255,255,0.1)';
    };

    return (
        <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar relative z-10">
            <div className="flex justify-between items-end border-b border-white/10 pb-4">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">{tr("Financials")}</span>
                    <h2 className="text-3xl font-black text-white italic font-display">{tr("PAYMENT LOG")}</h2>
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase tracking-widest text-white/30">{tr("Showing")} {stats.count} entries</span>
                        <span className="text-lg font-mono font-bold text-[#00AEEF]">{fmt(stats.total)}</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 mb-2 overflow-x-auto pb-2 custom-scrollbar">
                {['ALL', 'ACQUISITION', 'EXPENSE', 'PRODUCTION', 'SUPPLIES', 'CRATES'].map(t => (
                    <button
                        key={t}
                        onClick={() => setFilter(t)}
                        className={`px-3 py-1.5 rounded text-[10px] font-bold border transition-all uppercase tracking-widest ${filter === t ? 'bg-white text-black border-white' : 'bg-transparent text-white/40 border-white/10 hover:border-white/30'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-white/[0.02] border-b border-white/5">
                        <tr className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                            <th className="p-4">{tr("Req/Pay Date")}</th>
                            <th className="p-4">{tr("Type / Vendor")}</th>
                            <th className="p-4">{tr("Account")}</th>
                            <th className="p-4 text-right">{tr("Amount (MXN)")}</th>
                            <th className="p-4">{tr("Description")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                        {filteredEntries.map((e, i) => {
                            const vendorCode = e.vendor.split(' ')[0];
                            const vConfig = vendorConfigs[vendorCode as keyof typeof vendorConfigs];
                            const vColor = vConfig?.color || 'transparent';

                            return (
                                <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="p-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-white/60">{e.reqDate ? (typeof e.reqDate === 'number' ? new Date(Math.round((e.reqDate - 25569) * 864e5)).toLocaleDateString(tr("es-MX")) : String(e.reqDate)) : '-'}</span>
                                            <span className="text-[9px] text-white/20 italic">{tr("Paid:")} {e.payDate ? (typeof e.payDate === 'number' ? new Date(Math.round((e.payDate - 25569) * 864e5)).toLocaleDateString(tr("es-MX")) : String(e.payDate)) : tr("TBD")}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold w-fit bg-white/5 border border-white/10" style={{ color: getTypeColor(e.type) }}>{e.type}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: vColor }}></div>
                                                <span className="text-white font-medium truncate max-w-[150px]">{e.vendor}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 rounded-[4px] text-[9px] font-bold text-white border" style={{ borderColor: getAccountColor(e.account), background: `${getAccountColor(e.account)}1a` }}>
                                            {e.account}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex flex-col items-end gap-0.5">
                                            <span className="text-white font-bold">{fmt(e.total)}</span>
                                            <span className="text-[9px] text-white/20">{tr("Tax:")} {fmt(e.taxCom)}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col">
                                            <span className="text-white/60 line-clamp-1 group-hover:line-clamp-none transition-all">{e.description}</span>
                                            <span className="text-[9px] text-white/20 italic line-clamp-1">{e.notes}</span>
                                        </div>
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
