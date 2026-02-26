/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { financeSubTabAtom, exchangeRateAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { TrackingPaymentsView } from './TrackingPaymentsView';

const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const SUB_TABS = [
    { id: 'payments' as const, label: 'PAYMENTS', color: '#00AEEF', icon: '💳' },
    { id: 'expenses' as const, label: 'EXPENSES', color: '#F7941D', icon: '💰' },
];

export const FinanceView: React.FC = () => {
    const [activeTab, setActiveTab] = useAtom(financeSubTabAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    const [docs, setDocs] = useState<any[]>([]);
    const [ver, setVer] = useState(0);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        if (!db) return;
        let timer: any;
        const sub = db.finance.find().$.subscribe((d: any[]) => {
            clearTimeout(timer);
            timer = setTimeout(() => setDocs(d.map((x: any) => x.toJSON())), 200);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db, ver]);

    const grandTotal = docs.reduce((a, b) => a + (b.amount || 0), 0);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Sub-tab bar */}
            <div className="flex items-center gap-2 px-6 py-3 bg-white/[0.02] backdrop-blur-xl border-b border-white/[0.05] shrink-0">
                {SUB_TABS.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${activeTab === t.id
                            ? 'text-black shadow-lg scale-105' : 'bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/[0.08]'}`}
                        style={activeTab === t.id ? { backgroundColor: t.color } : {}}>
                        <span className="mr-1.5">{t.icon}</span>{t.label}
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Total Finance</span>
                        <span className="text-lg font-mono font-black text-[#00AEEF]">{fmt(grandTotal)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">USD</span>
                        <span className="text-lg font-mono font-black text-white/40">{fmt(grandTotal / exchangeRate)}</span>
                    </div>
                </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'payments' && <TrackingPaymentsView docs={docs} exchangeRate={exchangeRate} onRefresh={refresh} />}
                {activeTab === 'expenses' && <MonthlyExpensesPanel docs={docs} />}
            </div>
        </div>
    );
};

// ─── Monthly / Recurring Expenses Panel ───────────────────────────────────────
const MonthlyExpensesPanel: React.FC<{ docs: any[] }> = ({ docs }) => {
    const monthly = docs.filter(d => d.subcategory === 'Monthly Expense' || d.recurring);
    const total = monthly.reduce((a, b) => a + (b.amount || 0), 0);
    const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-4 p-4 border-b border-white/5 shrink-0">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{monthly.length} Monthly/Recurring</span>
                <div className="ml-auto text-right">
                    <span className="text-[8px] text-white/20 uppercase block font-black tracking-widest">Monthly Total</span>
                    <span className="text-lg font-mono font-black text-[#F7941D]">{fmt(total)}</span>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {monthly.map((d: any) => (
                        <div key={d.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-white">{d.description || d.notes || 'Expense'}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${d.status === 'Paid' ? 'bg-[#8DC63F]/20 text-[#8DC63F]' : 'bg-[#FFED00]/10 text-[#FFED00]'}`}>{d.status || 'Requested'}</span>
                            </div>
                            <div className="flex justify-between items-end mt-2">
                                <div><span className="text-[8px] text-white/20 uppercase block">Amount</span><span className="text-sm font-mono font-black text-[#F7941D]">{fmt(d.amount)}</span></div>
                                {d.recurring_day && <span className="text-[9px] text-white/20">Day {d.recurring_day}</span>}
                                <div><span className="text-[8px] text-white/20 uppercase block">Date</span><span className="text-[10px] font-mono text-white/40">{fmtDate(d.date)}</span></div>
                            </div>
                        </div>
                    ))}
                    {monthly.length === 0 && <div className="col-span-3 py-16 text-center text-white/10 text-sm font-black tracking-widest">NO MONTHLY EXPENSES</div>}
                </div>
            </div>
        </div>
    );
};
