import React, { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { financeSubTabAtom, exchangeRateAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { TrackingPaymentsView } from './TrackingPaymentsView';

const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const FinanceView: React.FC = () => {
    const [activeTab] = useAtom(financeSubTabAtom);
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
    const paid = docs.filter(d => d.status === 'Paid').reduce((a, b) => a + (b.amount || 0), 0);
    const pending = grandTotal - paid;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Contextual status strip ── */}
            <div className="flex items-center gap-6 px-6 py-2 bg-white/[0.015] border-b border-white/[0.04] shrink-0">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Total</span>
                    <span className="text-sm font-mono font-black text-[#00AEEF]">{fmt(grandTotal)}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Paid</span>
                    <span className="text-sm font-mono font-black text-[#8DC63F]">{fmt(paid)}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Pending</span>
                    <span className="text-sm font-mono font-black text-[#FFED00]">{fmt(pending)}</span>
                </div>
                <div className="ml-auto flex flex-col items-end">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">≈ USD</span>
                    <span className="text-sm font-mono font-black text-white/30">{fmt(grandTotal / exchangeRate)}</span>
                </div>
            </div>
            {/* ── Content ── */}
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
