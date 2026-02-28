/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { PaymentDestination, FinanceRecord, InventoryItem } from '../../lib/Types';
import { vendors, appUsers } from '../../lib/consts';
import { paymentsVersionAtom, userAtom, inventoryAtom, InventoryVersionAtom, paymentDestinationFilterAtom, exchangeRateAtom } from '../../lib/atoms';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';
const getVendorIdFromDescription = (desc: string) => desc?.match(/from (\w+)$/)?.[1] ?? null;

const SUBCATEGORIES = ['All', 'Acq', 'Mo-Exp', 'Sppl', 'Labr', 'Pack', 'Oprt'] as const;
type Subcategory = typeof SUBCATEGORIES[number];

type VendorGroup = { vendorId: string; items: InventoryItem[]; total: number };

// ─── API helpers ─────────────────────────────────────────────────────────────
const appendExpense = async (payload: any, db: any) => {
    const { error, data } = await supabase.from('finance').insert({
        amount: payload.amount,
        commission: payload.commission ?? 0,
        destination: payload.destination,
        status: payload.status ?? 'Requested',
        date: payload.date ?? new Date().toISOString(),
        currency: 'MXN',
        type: payload.type ?? 'Expense',
        category: payload.category ?? 'Vendor Payment',
        subcategory: payload.subcategory ?? null,
        description: payload.description,
        vendor_id: payload.vendor_id ?? null,
        reference: payload.reference ?? null,
        payment_method: payload.payment_method ?? null,
        notes: payload.notes ?? null,
        recurring: payload.recurring ?? false,
        recurring_day: payload.recurring ? payload.recurring_day ?? null : null,
        related_ids: payload.inventoryItemRows ? payload.inventoryItemRows.split(',') : [],
        updated_at: new Date().toISOString(),
    }).select();
    if (error) throw error;
    if (payload.inventoryItemRows) {
        const ids = payload.inventoryItemRows.split(',');
        await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
        if (db) await db.inventory.find({ selector: { id: { $in: ids } } }).update({ $set: { payReq: 'true' } });
    }
    return data;
};

// ─── Unified Add / Expense Modal ─────────────────────────────────────────────
const AddPaymentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
}> = ({ isOpen, onClose, onSaved }) => {
    const db = useDatabase();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        description: '',
        amount: '',
        subcategory: 'Acquisition' as string,
        vendor_id: '',
        destination: null as PaymentDestination | null,
        reference: '',
        payment_method: 'Wire Transfer',
        notes: '',
        recurring: false,
        recurring_day: 1,
    });

    const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const amt = parseFloat(form.amount);
        if (!form.description || isNaN(amt) || amt <= 0 || !form.destination) {
            return toast.error('Fill in description, amount, and select an account.');
        }
        setSaving(true);
        const toastId = toast.loading('Saving…');
        try {
            const commission = destinationsConfig[form.destination].calculateCommission(amt);
            await appendExpense({ ...form, amount: amt, commission }, db);
            toast.success('Record added!', { id: toastId });
            onSaved();
            onClose();
        } catch (err: any) {
            toast.error(err.message, { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={onClose}>
            <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-7 w-[520px] max-w-[95vw] shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-5 flex items-center gap-2">
                    <span className="text-(--main-color)">＋</span> Add Payment / Expense
                </h3>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {/* Description */}
                    <div><label className="field-label">Description *</label>
                        <input value={form.description} onChange={e => set('description', e.target.value)} className="field-input" placeholder="e.g. Payment for lot #42" required /></div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Amount */}
                        <div><label className="field-label">Amount (MXN) *</label>
                            <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} className="field-input font-mono" required /></div>
                        {/* Subcategory */}
                        <div><label className="field-label">Category</label>
                            <select value={form.subcategory} onChange={e => set('subcategory', e.target.value)} className="field-input">
                                {SUBCATEGORIES.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
                            </select></div>
                        {/* Vendor */}
                        <div><label className="field-label">Vendor</label>
                            <select value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)} className="field-input">
                                <option value="">— None —</option>
                                {Object.keys(vendors).map(v => <option key={v} value={v}>{v}</option>)}
                            </select></div>
                        {/* Reference */}
                        <div><label className="field-label">Reference / Invoice #</label>
                            <input value={form.reference} onChange={e => set('reference', e.target.value)} className="field-input" /></div>
                    </div>

                    {/* Account / Destination selector */}
                    <div>
                        <label className="field-label mb-2">Payment Account *</label>
                        <div className="grid grid-cols-4 gap-2">
                            {Object.entries(destinationsConfig).map(([key, cfg]) => (
                                <button
                                    key={key} type="button"
                                    onClick={() => set('destination', key as PaymentDestination)}
                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${form.destination === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}`}
                                >
                                    <img src={cfg.icon} alt={cfg.name} className="h-8 w-full object-contain" />
                                    <span className="text-[9px] text-center font-bold text-white/60 leading-tight">{cfg.name}</span>
                                    {form.amount && !isNaN(parseFloat(form.amount)) && (
                                        <span className="text-[9px] font-mono text-(--main-color)">
                                            +{fmtMXN(cfg.calculateCommission(parseFloat(form.amount)))} fee
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notes + Recurring */}
                    <div><label className="field-label">Notes</label>
                        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="field-input resize-none h-14" /></div>

                    <label className="flex items-center gap-2 text-[10px] font-bold text-white/70 cursor-pointer">
                        <input type="checkbox" checked={form.recurring} onChange={e => set('recurring', e.target.checked)} className="rounded bg-white/5 border-white/10" />
                        Recurring expense
                        {form.recurring && (
                            <span className="flex items-center gap-1 ml-2 font-normal">
                                Day <input type="number" min="1" max="31" value={form.recurring_day} onChange={e => set('recurring_day', parseInt(e.target.value) || 1)} className="w-12 bg-white/5 border border-white/10 rounded px-2 py-0.5 font-mono text-xs text-white/80" />
                            </span>
                        )}
                    </label>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl text-[10px] font-black tracking-widest hover:bg-white/5">CANCEL</button>
                        <button type="submit" disabled={saving || !form.destination} className="flex-1 py-3 bg-(--main-color) text-black rounded-xl text-[10px] font-black tracking-widest disabled:opacity-40">
                            {saving ? 'SAVING…' : 'COMMIT'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Request Payment modal (for vendor groups) ────────────────────────────────
const RequestPaymentModal: React.FC<{
    group: VendorGroup | null;
    onClose: () => void;
    onConfirm: (dest: PaymentDestination) => void;
}> = ({ group, onClose, onConfirm }) => {
    const [dest, setDest] = useState<PaymentDestination | null>(null);
    if (!group) return null;
    const name = appUsers[group.vendorId as keyof typeof appUsers]?.name || group.vendorId;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={onClose}>
            <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-7 w-[460px] max-w-[95vw] shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-1">Request Payment</h3>
                <p className="text-xs text-white/40 mb-5">{name} · {group.items.length} items · <span className="font-mono text-white/60">{fmtMXN(group.total)}</span></p>
                <div className="grid grid-cols-4 gap-2 mb-6">
                    {Object.entries(destinationsConfig).map(([key, cfg]) => {
                        const comm = cfg.calculateCommission(group.total);
                        return (
                            <button key={key} type="button" onClick={() => setDest(key as PaymentDestination)}
                                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${dest === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-white/10 hover:border-white/30'}`}>
                                <img src={cfg.icon} alt={cfg.name} className="h-8 w-full object-contain" />
                                <span className="text-[9px] font-bold text-white/50 text-center leading-tight">{cfg.name}</span>
                                <span className="text-[9px] font-mono text-(--main-color)">{fmtMXN(group.total + comm)}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl text-[10px] font-black tracking-widest hover:bg-white/5">CANCEL</button>
                    <button onClick={() => dest && onConfirm(dest)} disabled={!dest} className="flex-1 py-3 bg-(--main-color) text-black rounded-xl text-[10px] font-black tracking-widest disabled:opacity-40">CONFIRM</button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const TrackingPaymentsView: React.FC<{ docs: any[]; exchangeRate: number; onRefresh: () => void }> = ({ docs, exchangeRate, onRefresh }) => {
    const db = useDatabase();
    const [inventory, setInventory] = useAtom(inventoryAtom);
    const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [paymentsVersion, setPaymentsVersion] = useAtom(paymentsVersionAtom);
    const [destinationFilter, setDestinationFilter] = useAtom(paymentDestinationFilterAtom);
    const [subcatFilter, setSubcatFilter] = useState<Subcategory>('All');
    const [vendorFilter, setVendorFilter] = useState<string>('All');
    const [showAdd, setShowAdd] = useState(false);
    const [requestGroup, setRequestGroup] = useState<VendorGroup | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load inventory for pending payment requests
    const fetchInventory = useCallback(async () => {
        if (!db) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const invDocs = await db.inventory.find().exec();
            setInventory(invDocs.map((doc: any) => ({ row: doc.id, data: doc.toJSON() })));
        } catch { }
        setIsLoading(false);
    }, [db, setInventory]);

    useEffect(() => { fetchInventory(); }, [inventoryVersion, paymentsVersion, fetchInventory]);

    // Vendor groups pending payment
    const pendingGroups = useMemo<VendorGroup[]>(() => {
        const approved = inventory.filter(i => i.data.status === 'YES' && !i.data.payReq);
        const groups: Record<string, VendorGroup> = {};
        for (const item of approved) {
            const vid = item.data.itemId;
            if (!groups[vid]) groups[vid] = { vendorId: vid, items: [], total: 0 };
            groups[vid].items.push(item);
            groups[vid].total += parseFloat(item.data.price) || 0;
        }
        return Object.values(groups);
    }, [inventory]);

    // Pending vendor totals for tab chips
    const vendorTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        docs.filter(e => e.status === 'Requested').forEach(e => {
            const vid = getVendorIdFromDescription(e.description || '');
            if (vid) totals[vid] = (totals[vid] || 0) + (e.amount || 0) + (e.commission || 0);
        });
        return totals;
    }, [docs]);

    // Filtered + sorted records
    const filtered = useMemo(() => {
        return [...docs]
            .filter(r => {
                const subcat = subcatFilter === 'All' || (r.subcategory || r.category) === subcatFilter;
                const dest = destinationFilter === 'All' || r.destination === destinationFilter;
                const vendor = vendorFilter === 'All' || getVendorIdFromDescription(r.description || '') === vendorFilter;
                return subcat && dest && vendor;
            })
            .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
    }, [docs, subcatFilter, destinationFilter, vendorFilter]);

    const handleRequestPayment = async (group: VendorGroup, dest: PaymentDestination) => {
        const toastId = toast.loading(`Requesting payment for ${group.vendorId}…`);
        try {
            const commission = destinationsConfig[dest].calculateCommission(group.total);
            await appendExpense({
                description: `Payment for ${group.items.length} items from ${group.vendorId}`,
                amount: group.total, commission, destination: dest, status: 'Requested',
                inventoryItemRows: group.items.map(i => i.row).join(','),
            }, db);
            await appendExpense; // flush
            // Mark items
            for (const item of group.items) {
                await supabase.from('inventory').update({ pay_req: true }).eq('id', item.row);
            }
            toast.success(`Payment requested.`, { id: toastId });
            setInventoryVersion(v => v + 1);
            setPaymentsVersion(v => v + 1);
            onRefresh();
        } catch (err: any) { toast.error(err.message, { id: toastId }); }
        setRequestGroup(null);
    };

    const handleToggleStatus = async (r: any) => {
        const next = r.status === 'Requested' ? 'Paid' : 'Requested';
        const { error } = await supabase.from('finance').update({ status: next, pay_date: next === 'Paid' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', r.id);
        if (error) toast.error(error.message); else onRefresh();
    };

    // Summary by subcategory
    const subcatTotals = useMemo(() => {
        const m: Record<string, number> = {};
        docs.forEach(d => { const k = d.subcategory || d.category || 'Other'; m[k] = (m[k] || 0) + (d.amount || 0); });
        return m;
    }, [docs]);

    if (isLoading) return <div className="h-full flex items-center justify-center"><LoadingIndicator /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <AddPaymentModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSaved={() => { setPaymentsVersion(v => v + 1); onRefresh(); }} />
            <RequestPaymentModal group={requestGroup} onClose={() => setRequestGroup(null)} onConfirm={(dest) => requestGroup && handleRequestPayment(requestGroup, dest)} />

            {/* ── Filter Bar ── */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/10 shrink-0">

                {/* Subcategory pills */}
                <div className="flex flex-wrap gap-1.5">
                    {SUBCATEGORIES.map(s => (
                        <button key={s} onClick={() => setSubcatFilter(s)}
                            className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${subcatFilter === s ? 'bg-[#6BCEBB] text-black shadow' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>
                            {s.toUpperCase()}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                    {/* Account / destination filter icons */}
                    <button onClick={() => setDestinationFilter('All')}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black tracking-widest border transition-all ${destinationFilter === 'All' ? 'bg-white/20 border-white/30 text-white' : 'border-white/10 text-white/30 hover:border-white/20'}`}>
                        ALL
                    </button>
                    {Object.entries(destinationsConfig).map(([key, cfg]) => (
                        <button key={key} onClick={() => setDestinationFilter(key as PaymentDestination)} title={cfg.name}
                            className={`p-2 rounded-xl border-2 transition-all ${destinationFilter === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}`}>
                            <img src={cfg.icon} alt={cfg.name} className="h-6 w-auto object-contain" />
                        </button>
                    ))}
                    <button onClick={() => setShowAdd(true)}
                        className="ml-2 px-4 py-2 bg-(--main-color) text-black text-[10px] font-black tracking-widest rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">
                        <svg className="w-3 h-3 inline-block align-text-top mr-1"><use href="#plus" /></svg>ADD
                    </button>
                </div>
            </div>

            {/* ── Vendor filter chips (pending payments) ── */}
            {Object.keys(vendorTotals).length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0 overflow-x-auto">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest shrink-0">Pending:</span>
                    <button onClick={() => setVendorFilter('All')} className={`tab-button ${vendorFilter === 'All' ? 'active' : ''}`}>All</button>
                    {Object.entries(vendorTotals).map(([vid, total]) => (
                        <button key={vid} onClick={() => setVendorFilter(vid)}
                            className={`tab-button vendor-tab ${vendorFilter === vid ? 'active' : ''}`}
                            style={vendorFilter === vid ? { backgroundColor: vendors[vid as keyof typeof vendors]?.color, color: getTextColorForBg(vendors[vid as keyof typeof vendors]?.color || '#555') } : {}}>
                            {vid} <span className="count">{fmtMXN(total as number)}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Pending vendor payment request cards ── */}
            {pendingGroups.length > 0 && (
                <div className="flex gap-3 px-4 py-3 border-b border-white/5 shrink-0 overflow-x-auto">
                    {pendingGroups.map(group => {
                        const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#2a2a3e';
                        const txt = getTextColorForBg(color);
                        return (
                            <div key={group.vendorId} className="shrink-0 p-3 rounded-xl min-w-[180px]" style={{ backgroundColor: color, color: txt }}>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-sm">{appUsers[group.vendorId as keyof typeof appUsers]?.name || group.vendorId}</p>
                                        <p className="text-[10px] opacity-70">{group.items.length} items ready</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-mono font-bold text-sm">{fmtMXN(group.total)}</p>
                                        <button onClick={() => setRequestGroup(group)}
                                            className="mt-1 px-2 py-1 rounded-lg text-[9px] font-black tracking-wide border border-current/30 hover:bg-white/20 transition-all">
                                            Request
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Summary cards ── */}
            <div className="flex gap-3 px-4 py-3 shrink-0 overflow-x-auto border-b border-white/5">
                {Object.entries(subcatTotals).map(([k, v]) => (
                    <div key={k} className="px-4 py-2.5 rounded-2xl bg-white/2 border border-white/5 min-w-[130px] shrink-0">
                        <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">{k}</div>
                        <div className="text-sm font-mono font-black text-white">{fmtMXN(v)}</div>
                        <div className="text-[8px] font-mono text-white/20">${((v) / exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</div>
                    </div>
                ))}
            </div>

            {/* ── Records Table ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#0d0d1a] z-10">
                        <tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5">
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Acc</th>
                            <th className="px-4 py-3">Cat</th>
                            <th className="px-4 py-3">Desc</th>
                            <th className="px-4 py-3">Vend</th>
                            <th className="px-4 py-3 text-right">Amt</th>
                            <th className="px-4 py-3 text-center">Stat</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/3">
                        {filtered.map(r => (
                            <tr key={r.id} className="hover:bg-white/3 transition-all">
                                <td className="px-4 py-2 font-mono text-[10px] text-white/40 whitespace-nowrap">
                                    {fmtDate(r.date)}{r.recurring && <span className="text-[#F7941D] ml-1" title={`Day ${r.recurring_day}`}>↻</span>}
                                </td>
                                <td className="px-4 py-2">
                                    {r.destination && destinationsConfig[r.destination as PaymentDestination] ? (
                                        <img src={destinationsConfig[r.destination as PaymentDestination].icon}
                                            alt={r.destination} title={destinationsConfig[r.destination as PaymentDestination].name}
                                            className="h-5 w-auto object-contain" />
                                    ) : <span className="text-white/20 text-[9px]">—</span>}
                                </td>
                                <td className="px-4 py-2">
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-white/5 text-white/50">
                                        {r.subcategory || r.category || '—'}
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-xs text-white/70 max-w-[200px] truncate">{r.description || r.notes || '—'}</td>
                                <td className="px-4 py-2">
                                    {r.vendor_id ? (
                                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black"
                                            style={{ backgroundColor: vendors[r.vendor_id as keyof typeof vendors]?.color || '#555', color: getTextColorForBg(vendors[r.vendor_id as keyof typeof vendors]?.color || '#555') }}>
                                            {r.vendor_id}
                                        </span>
                                    ) : '—'}
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-xs font-bold text-white/70">
                                    {fmtMXN(r.amount)}
                                    {(r.commission || 0) > 0 && <span className="text-white/30 text-[9px] block">+{fmtMXN(r.commission)} fee</span>}
                                </td>
                                <td className="px-4 py-2 text-center">
                                    <button onClick={() => handleToggleStatus(r)}
                                        className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all ${r.status === 'Paid' ? 'bg-[#8DC63F]/20 text-[#8DC63F] border border-[#8DC63F]/30' : 'bg-[#FFED00]/10 text-[#FFED00] border border-[#FFED00]/20 hover:bg-[#FFED00]/20'}`}>
                                        {r.status || 'Requested'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-white/10 text-sm font-black tracking-widest">NO RECORDS</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
