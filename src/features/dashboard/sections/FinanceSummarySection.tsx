import React, { useState } from 'react';
import { Wallet, Activity, DollarSign, Package, ShoppingCart, Users, Box, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import { el } from '../../../lib/i18nEnums';
import { EChart } from '../../../components/EChart';
import type { EChartsOption } from 'echarts';
import { useAtomValue, useSetAtom } from 'jotai';
import { showFinancialsAtom, currencyModeAtom, inventoryArtifactConfigAtom } from '../../../lib/atoms';
import { vendors } from '../../../lib/consts';

const FinancialDonutChart = ({ metrics, currentExchangeRate, mode }: { metrics: any, currentExchangeRate: number, mode: string }) => {
    const data = [
        { name: 'Paid Acq.', value: metrics.paidAcq, itemStyle: { color: '#22c55e' } },
        { name: 'Req. Merch.', value: metrics.reqMerch, itemStyle: { color: '#eab308' } },
        { name: 'Pending', value: metrics.pending, itemStyle: { color: '#ef4444' } },
        { name: 'Req. Exp.', value: metrics.reqExp, itemStyle: { color: '#d946ef' } },
        { name: 'Paid Exp.', value: metrics.paidExp, itemStyle: { color: '#3b82f6' } },
    ].filter(d => d.value > 0);

    const total = data.reduce((acc, d) => acc + d.value, 0);
    const displayTotal = mode === 'USD' ? total / currentExchangeRate : total;

    const option: EChartsOption = {
        tooltip: {
            trigger: 'item', backgroundColor: '#050505', borderColor: '#333',
            textStyle: { color: '#fff', fontSize: 10, fontFamily: 'monospace' },
            formatter: (p: any) => `${p.name}: ${mode} ${(mode === 'USD' ? p.value / currentExchangeRate : p.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        },
        series: [{
            type: 'pie', radius: ['65%', '90%'], itemStyle: { borderRadius: 0, borderColor: '#000', borderWidth: 2 },
            label: { show: false }, emphasis: { label: { show: false } }, data
        }],
        graphic: [{
            type: 'text' as const, left: 'center' as const, top: 'center' as const,
            style: {
                text: `${mode}\n${displayTotal >= 1000000 ? (displayTotal/1000000).toFixed(1)+'M' : (displayTotal/1000).toFixed(0)+'K'}`,
                align: 'center' as const, fill: 'var(--text-color)', fontSize: 14, fontWeight: 900, fontFamily: 'monospace'
            }
        }]
    };
    return <EChart option={option} className="w-full h-full" />;
};

interface FinanceSummarySectionProps {
    globalTotals: any;
    currentExchangeRate: number;
    requisitions: any[];
    comingPaymentsByVendor: any[];
    activeDestReqNetMXN: number;
}

export const FinanceSummarySection: React.FC<FinanceSummarySectionProps> = ({ 
    globalTotals, currentExchangeRate, requisitions, comingPaymentsByVendor, activeDestReqNetMXN 
}) => {
    const showFinancials = useAtomValue(showFinancialsAtom);
    const currencyMode = useAtomValue(currencyModeAtom);
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    
    const [queueOpen, setQueueOpen] = useState(true);
    const [destsOpen, setDestsOpen] = useState<Record<string, boolean>>({});

    const fmt = (usd: number, mxn: number) => {
        if (!showFinancials) return '***';
        const val = currencyMode === 'MXN' ? mxn : usd;
        return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <section aria-label="Finance Summary">
            <div className="flex items-center gap-3 mb-6 px-2">
                <Wallet size={16} strokeWidth={2.5} className="text-(--main-color)" />
                <h2 className="text-[14px] font-black uppercase tracking-[0.2em] text-(--text-color)">{tr("Where is the money?")}</h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Donut Chart - Capital Distribution */}
                <div className="lg:col-span-5 bg-white/[0.03] backdrop-blur-2xl p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center gap-6">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-(--text-color-secondary) mb-4">{tr("Capital Allocation Ecosystem")}</span>
                    <div className="w-full aspect-square max-w-[180px] relative">
                        <FinancialDonutChart 
                            metrics={{ paidAcq: globalTotals.paidAcqMxn, paidExp: globalTotals.paidExpMxn, reqMerch: globalTotals.reqMerchMxn, reqExp: globalTotals.reqExpMxn, pending: globalTotals.pendingMxn }} 
                            currentExchangeRate={currentExchangeRate} mode={currencyMode} 
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-4 w-full">
                        {[{ label: tr("Inventory"), val: globalTotals.paidAcqMxn + globalTotals.reqMerchMxn, color: '#22c55e' },
                          { label: tr("Operations"), val: globalTotals.paidExpMxn + globalTotals.reqExpMxn, color: '#3b82f6' },
                          { label: tr("Liability"), val: globalTotals.pendingMxn, color: '#ef4444' }
                        ].map(g => (
                            <div key={g.label} className="flex flex-col gap-1 border-l-4 pl-4 bg-white/[0.05] p-3 border border-white/5" style={{ borderColor: g.color }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-(--text-color)">{g.label}</span>
                                    <span className="text-[12px] font-mono font-black" style={{ color: g.color }}>
                                        {((g.val / (globalTotals.paidAcqMxn + globalTotals.reqMerchMxn + globalTotals.paidExpMxn + globalTotals.reqExpMxn + globalTotals.pendingMxn || 1)) * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Queue and Upcoming */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                    <div className="bg-white/[0.03] backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                        <div className="flex items-center justify-between cursor-pointer" onClick={() => setQueueOpen(!queueOpen)}>
                            <div className="flex items-center gap-3">
                                <Activity size={14} className="text-rose-500" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color)">{tr("Active Request Queue")}</h3>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-[12px] font-black text-rose-500">{requisitions.length} <span className="text-[8px] uppercase">{tr("Dests")}</span></span>
                                <span className="text-[14px] font-mono font-black text-(--text-color)">{fmt(activeDestReqNetMXN / currentExchangeRate, activeDestReqNetMXN)}</span>
                                {queueOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                        </div>

                        {queueOpen && (
                            <div className="mt-6 space-y-3">
                                {requisitions.length === 0 ? <p className="text-[10px] text-center text-(--text-color-secondary)">{tr("Queue Empty")}</p> : requisitions.map(req => {
                                    const mxn = req.docs.reduce((a: number, d: any) => a + (d.amount||0) + (d.commission||0), 0);
                                    const isExp = destsOpen[req.key] !== false;
                                    return (
                                        <div key={req.key} className="rounded-lg bg-(--text-color)/5 border border-(--text-color)/10 overflow-hidden">
                                            <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-(--text-color)/5" onClick={() => setDestsOpen(p => ({...p, [req.key]: !isExp}))}>
                                                <div className="w-10 h-8 flex shrink-0"><img src={req.cfg.icon} alt="Icon" className="max-w-full max-h-full object-contain" /></div>
                                                <div className="flex-1">
                                                    <p className="text-[11px] font-black uppercase tracking-widest">{req.cfg.name}</p>
                                                    <p className="text-[9px] text-(--text-color-secondary) truncate max-w-[200px]">{req.docs[0]?.description || tr("Multiple units")}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[12px] font-mono font-black">{fmt(mxn / currentExchangeRate, mxn)}</span>
                                                </div>
                                            </div>
                                            {isExp && (
                                                <div className="px-3 pb-3 border-t border-(--text-color)/10 space-y-2 pt-2">
                                                    {req.docs.map((d: any) => (
                                                        <div key={d.id} className="flex justify-between items-center text-[10px] p-2 bg-black/20 rounded">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-(--text-color)/80">{d.category || tr("General")} • {el(d.subcategory||'')}</span>
                                                                <span className="text-(--text-color-secondary) truncate max-w-[150px]">{d.description}</span>
                                                            </div>
                                                            <span className="font-mono font-bold text-(--text-color)">{fmt(((d.amount||0)+(d.commission||0))/currentExchangeRate, (d.amount||0)+(d.commission||0))}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="bg-white/[0.03] backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <DollarSign size={14} className="text-emerald-500" />
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color)">{tr("Upcoming Payments by Vendor")}</h3>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {comingPaymentsByVendor.length === 0 ? <p className="text-[10px] text-center text-(--text-color-secondary)">{tr("No upcoming")}</p> : comingPaymentsByVendor.map(g => (
                                <div key={g.vendorId} className="flex justify-between items-center p-3 bg-white/[0.05] rounded-lg border border-white/5">
                                    <span className="text-[10px] font-black uppercase tracking-widest">{g.vendorId}</span>
                                    <span className="text-[12px] font-mono font-black text-emerald-400">{fmt(g.total / currentExchangeRate, g.total)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
