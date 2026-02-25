import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { financeSubTabAtom, exchangeRateAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg } from '../../lib/utils';
import { PaymentsView } from '../dashboard/PaymentsView';

const fmtMXN = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtUSD = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

const SUB_TABS = [
    { id: 'payments' as const, label: 'PAYMENTS', color: '#00AEEF', icon: '💳' },
    { id: 'tracking' as const, label: 'TRACKING', color: '#6BCEBB', icon: '📊' },
    { id: 'expenses' as const, label: 'EXPENSES', color: '#F7941D', icon: '💰' },
];

const SUBCATEGORIES = ['All', 'Acquisition', 'Monthly Expense', 'Supplies', 'Labor', 'Crate/Pallet', 'Operating'] as const;

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
        const sub = db.finance.find().$.subscribe(d => {
            clearTimeout(timer);
            timer = setTimeout(() => setDocs(d.map(x => x.toJSON())), 200);
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
                        <span className="text-lg font-mono font-black text-[#00AEEF]">{fmtMXN(grandTotal)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">USD</span>
                        <span className="text-lg font-mono font-black text-white/40">{fmtUSD(grandTotal / exchangeRate)}</span>
                    </div>
                </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'payments' && <PaymentsView />}
                {activeTab === 'tracking' && <FinanceTrackingPanel docs={docs} exchangeRate={exchangeRate} onRefresh={refresh} />}
                {activeTab === 'expenses' && <MonthlyExpensesPanel docs={docs} exchangeRate={exchangeRate} onRefresh={refresh} />}
            </div>
        </div>
    );
};

// Finance Tracking Panel — Full table with subcategory filter
const FinanceTrackingPanel: React.FC<{ docs: any[]; exchangeRate: number; onRefresh: () => void }> = ({ docs, exchangeRate, onRefresh }) => {
    const [filter, setFilter] = useState('All');
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ subcategory: 'Acquisition', amount: '', description: '', vendor_id: '', notes: '' });

    const filtered = useMemo(() => filter === 'All' ? docs : docs.filter(d => d.subcategory === filter), [docs, filter]);
    const totalBySubcat = useMemo(() => {
        const m: Record<string, number> = {};
        docs.forEach(d => { m[d.subcategory || 'Other'] = (m[d.subcategory || 'Other'] || 0) + (d.amount || 0); });
        return m;
    }, [docs]);

    const handleAdd = async () => {
        const payload = { ...form, amount: parseFloat(form.amount) || 0, status: 'Requested', type: 'Expense', category: form.subcategory, currency: 'MXN', date: new Date().toISOString(), updated_at: new Date().toISOString() };
        const { error } = await supabase.from('finance').insert(payload);
        if (error) toast.error(error.message); else { toast.success('Added'); setShowAdd(false); setForm({ subcategory: 'Acquisition', amount: '', description: '', vendor_id: '', notes: '' }); onRefresh(); }
    };

    const handleToggleStatus = async (id: string, current: string) => {
        const next = current === 'Requested' ? 'Paid' : 'Requested';
        const { error } = await supabase.from('finance').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) toast.error(error.message); else onRefresh();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-black/10 shrink-0">
                <div className="flex flex-wrap gap-1.5">
                    {SUBCATEGORIES.map(s => (
                        <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${filter === s ? 'bg-[#6BCEBB] text-black shadow-lg' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>{s.toUpperCase()}</button>
                    ))}
                </div>
                <button onClick={() => setShowAdd(true)} className="ml-auto px-4 py-2 bg-[#6BCEBB] text-black text-[10px] font-black tracking-widest rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">+ ADD</button>
            </div>
            {/* Summary cards */}
            <div className="flex gap-3 p-4 shrink-0 overflow-x-auto">
                {Object.entries(totalBySubcat).map(([k, v]) => (
                    <div key={k} className="px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/5 min-w-[140px]">
                        <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">{k}</div>
                        <div className="text-sm font-mono font-black text-white">{fmtMXN(v)}</div>
                        <div className="text-[8px] font-mono text-white/20">{fmtUSD(v / exchangeRate)}</div>
                    </div>
                ))}
            </div>
            {/* Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.01]">
                    <table className="w-full text-left border-collapse">
                        <thead><tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02]">
                            <th className="px-4 py-3">Date</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-center">Status</th>
                        </tr></thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filtered.map(r => (
                                <tr key={r.id} className="hover:bg-white/[0.04] transition-all">
                                    <td className="px-4 py-2 font-mono text-[10px] text-white/40">{fmtDate(r.date)}</td>
                                    <td className="px-4 py-2"><span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-white/5 text-white/50">{r.subcategory || r.category || '—'}</span></td>
                                    <td className="px-4 py-2 text-xs text-white/70">{r.description || r.notes || '—'}</td>
                                    <td className="px-4 py-2">{r.vendor_id ? <span className="px-1.5 py-0.5 rounded text-[8px] font-black" style={{ backgroundColor: vendors[r.vendor_id as keyof typeof vendors]?.color || '#555', color: getTextColorForBg(vendors[r.vendor_id as keyof typeof vendors]?.color || '#555') }}>{r.vendor_id}</span> : '—'}</td>
                                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-white/60">{fmtMXN(r.amount)}</td>
                                    <td className="px-4 py-2 text-center">
                                        <button onClick={() => handleToggleStatus(r.id, r.status)} className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all ${r.status === 'Paid' ? 'bg-[#8DC63F]/20 text-[#8DC63F] border border-[#8DC63F]/30' : 'bg-[#FFED00]/10 text-[#FFED00] border border-[#FFED00]/20'}`}>{r.status || 'Requested'}</button>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-white/10 text-sm font-black tracking-widest">NO RECORDS</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Add Modal */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setShowAdd(false)}>
                    <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-8 w-[480px] max-w-[90vw] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-6">Add Finance Record</h3>
                        <div className="space-y-4">
                            <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Subcategory</label>
                                <select value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80">
                                    {SUBCATEGORIES.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
                                </select></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Amount (MXN)</label>
                                    <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-white/80" /></div>
                                <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Vendor</label>
                                    <input value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80" placeholder="e.g. JM" /></div>
                            </div>
                            <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Description</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80" /></div>
                            <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Notes</label>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 h-16 resize-none" /></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowAdd(false)} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl text-[10px] font-black tracking-widest hover:bg-white/5">CANCEL</button>
                            <button onClick={handleAdd} className="flex-1 py-3 bg-[#6BCEBB] text-black rounded-xl text-[10px] font-black tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all">COMMIT</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Monthly/Recurring Expenses Panel
const MonthlyExpensesPanel: React.FC<{ docs: any[]; exchangeRate: number; onRefresh: () => void }> = ({ docs, exchangeRate, onRefresh }) => {
    const monthlyDocs = useMemo(() => docs.filter(d => d.subcategory === 'Monthly Expense' || d.recurring), [docs]);
    const total = monthlyDocs.reduce((a, b) => a + (b.amount || 0), 0);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-4 p-4 border-b border-white/5 shrink-0">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{monthlyDocs.length} Monthly/Recurring Expenses</span>
                <div className="ml-auto text-right">
                    <span className="text-[8px] text-white/20 uppercase block font-black tracking-widest">Monthly Total</span>
                    <span className="text-lg font-mono font-black text-[#F7941D]">{fmtMXN(total)}</span>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {monthlyDocs.map(d => (
                        <div key={d.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-white">{d.description || d.notes || 'Expense'}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${d.status === 'Paid' ? 'bg-[#8DC63F]/20 text-[#8DC63F]' : 'bg-[#FFED00]/10 text-[#FFED00]'}`}>{d.status || 'Requested'}</span>
                            </div>
                            <div className="flex justify-between items-end mt-2">
                                <div><span className="text-[8px] text-white/20 uppercase block">Amount</span><span className="text-sm font-mono font-black text-[#F7941D]">{fmtMXN(d.amount)}</span></div>
                                {d.recurring_day && <span className="text-[9px] text-white/20">Day {d.recurring_day}</span>}
                                <div><span className="text-[8px] text-white/20 uppercase block">Date</span><span className="text-[10px] font-mono text-white/40">{fmtDate(d.date)}</span></div>
                            </div>
                        </div>
                    ))}
                    {monthlyDocs.length === 0 && <div className="col-span-3 py-16 text-center text-white/10 text-sm font-black tracking-widest">NO MONTHLY EXPENSES</div>}
                </div>
            </div>
        </div>
    );
};
