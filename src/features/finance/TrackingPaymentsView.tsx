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
    pendingGroups: VendorGroup[];
}> = ({ isOpen, onClose, onSaved, pendingGroups }) => {
    const db = useDatabase();
    const [step, setStep] = useState(1);
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

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setForm({
                description: '',
                amount: '',
                subcategory: 'Acq',
                vendor_id: '',
                destination: null,
                reference: '',
                payment_method: 'Wire Transfer',
                notes: '',
                recurring: false,
                recurring_day: new Date().getDate(),
            });
        }
    }, [isOpen]);

    // Acquisition auto-fill
    useEffect(() => {
        if (form.subcategory === 'Acq' && form.vendor_id) {
            const group = pendingGroups.find(g => g.vendorId === form.vendor_id);
            if (group) {
                setForm(f => ({
                    ...f,
                    amount: group.total.toString(),
                    description: `Payment for ${group.items.length} items from ${group.vendorId}`
                }));
            }
        }
    }, [form.vendor_id, form.subcategory]);

    const calculateIVA = (amt: number) => amt * 0.16;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const amt = parseFloat(form.amount);
        if (!form.description || isNaN(amt) || amt <= 0 || !form.destination) {
            return toast.error('Fill in description, amount, and select an account.');
        }
        setSaving(true);
        const toastId = toast.loading('Saving…');
        try {
            let commission = destinationsConfig[form.destination].calculateCommission(amt);
            if (form.destination === PaymentDestination.BBVA_Ramses) {
                const iva = calculateIVA(amt);
                commission += iva;
            }

            // For Acquisitions, we need to find the related inventory items to mark them as pay_req
            const group = form.subcategory === 'Acq' ? pendingGroups.find(g => g.vendorId === form.vendor_id) : null;
            const inventoryItemRows = group ? group.items.map(i => i.row).join(',') : null;

            await appendExpense({
                ...form,
                amount: amt,
                commission,
                inventoryItemRows
            }, db);

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
            <div className="bg-[#1a1a2e] border border-white/10 rounded-4xl p-8 w-[560px] max-w-[95vw] shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>

                {/* Progress Header */}
                <div className="flex justify-between items-center mb-8">
                    <div className="flex gap-2">
                        {[1, 2, 3].map(s => (
                            <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${step >= s ? 'w-8 bg-(--main-color)' : 'w-4 bg-white/10'}`} />
                        ))}
                    </div>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                        <span className="text-xl">✕</span>
                    </button>
                </div>

                <div className="min-h-[360px] flex flex-col">
                    {/* Step 1: Category */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-2xl font-black text-white mb-2">Select Category</h2>
                            <p className="text-xs text-white/40 mb-8 uppercase tracking-widest">What type of payment is this?</p>

                            <div className="grid grid-cols-2 gap-4">
                                {SUBCATEGORIES.filter(s => s !== 'All').map(cat => (
                                    <button key={cat}
                                        onClick={() => { set('subcategory', cat); setStep(2); }}
                                        className="flex flex-col items-start p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-(--main-color)/50 hover:bg-(--main-color)/10 transition-all group"
                                    >
                                        <span className="text-2xl mb-3 group-hover:scale-110 transition-transform">
                                            {cat === 'Acq' ? '📦' : cat === 'Mo-Exp' ? '📅' : cat === 'Sppl' ? '🛠' : cat === 'Labr' ? '👷' : cat === 'Pack' ? '🏷' : '⚙️'}
                                        </span>
                                        <span className="text-sm font-black text-white uppercase tracking-wider">{cat}</span>
                                        <span className="text-[10px] text-white/30 font-medium">
                                            {cat === 'Acq' ? 'Vendor Acquisitions' : 'Operational Costs'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Details */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-2xl font-black text-white mb-2">Details</h2>
                            <p className="text-xs text-white/40 mb-8 uppercase tracking-widest">Enter the specifics of the transaction</p>

                            <div className="flex flex-col gap-6">
                                {form.subcategory === 'Acq' && (
                                    <div>
                                        <label className="field-label">Select Vendor</label>
                                        <select value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)} className="field-input py-4!">
                                            <option value="">— Choose Vendor —</option>
                                            {pendingGroups.map(g => (
                                                <option key={g.vendorId} value={g.vendorId}>{g.vendorId} ({g.items.length} items)</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="field-label">Description</label>
                                    <input value={form.description} onChange={e => set('description', e.target.value)}
                                        className="field-input py-4!" placeholder="Brief summary of payment" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="field-label">Amount (MXN)</label>
                                        <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                                            className="field-input py-4! font-mono text-lg" placeholder="0.00" />
                                    </div>
                                    {form.subcategory === 'Mo-Exp' ? (
                                        <div>
                                            <label className="field-label">Day of Month</label>
                                            <input type="number" min="1" max="31" value={form.recurring_day} onChange={e => { set('recurring_day', parseInt(e.target.value)); set('recurring', true); }}
                                                className="field-input py-4! font-mono text-lg" />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="field-label">Reference #</label>
                                            <input value={form.reference} onChange={e => set('reference', e.target.value)}
                                                className="field-input py-4!" placeholder="Optional" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-4 mt-12">
                                <button onClick={() => setStep(1)} className="flex-1 py-4 border border-white/10 text-white/40 rounded-2xl text-[10px] font-black tracking-widest hover:bg-white/5 transition-all">BACK</button>
                                <button onClick={() => {
                                    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount');
                                    setStep(3);
                                }} className="flex-1 py-4 bg-white/10 text-white rounded-2xl text-[10px] font-black tracking-widest hover:bg-white/20 transition-all">CONTINUE</button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Account */}
                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-2xl font-black text-white mb-2">Payment Method</h2>
                            <p className="text-xs text-white/40 mb-8 uppercase tracking-widest">Choose disbursement account</p>

                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(destinationsConfig).map(([key, cfg]) => {
                                    const amt = parseFloat(form.amount) || 0;
                                    const comm = cfg.calculateCommission(amt);
                                    const iva = (key === PaymentDestination.BBVA_Ramses) ? calculateIVA(amt) : 0;
                                    const totalExtra = comm + iva;

                                    return (
                                        <button key={key} type="button"
                                            onClick={() => set('destination', key as PaymentDestination)}
                                            className={`flex flex-col items-center gap-3 p-6 rounded-4xl border-2 transition-all ${form.destination === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-white/5 bg-white/3 hover:border-white/20 hover:bg-white/5'}`}
                                        >
                                            <img src={cfg.icon} alt={cfg.name} className="h-10 w-auto object-contain" />
                                            <div className="text-center">
                                                <div className="text-[10px] font-black text-white uppercase tracking-wider">{cfg.name}</div>
                                                {totalExtra > 0 && (
                                                    <div className="text-[9px] font-mono text-(--main-color) mt-1">
                                                        +{fmtMXN(totalExtra)} {key === PaymentDestination.BoA_Employee ? '(Bank Fee)' : iva > 0 ? '(IVA incl.)' : 'Fee'}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-12 p-6 rounded-4xl bg-black/40 border border-white/5">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Total Request</span>
                                    <span className="text-xs font-mono text-white/40">{fmtMXN(parseFloat(form.amount) || 0)} base</span>
                                </div>
                                <div className="text-3xl font-mono font-black text-white">
                                    {form.destination ? fmtMXN((parseFloat(form.amount) || 0) + destinationsConfig[form.destination].calculateCommission(parseFloat(form.amount) || 0) + (form.destination === PaymentDestination.BBVA_Ramses ? calculateIVA(parseFloat(form.amount) || 0) : 0)) : '—'}
                                </div>
                            </div>

                            <div className="flex gap-4 mt-8">
                                <button onClick={() => setStep(2)} className="flex-1 py-4 border border-white/10 text-white/40 rounded-2xl text-[10px] font-black tracking-widest hover:bg-white/5 transition-all">BACK</button>
                                <button onClick={handleSubmit} disabled={saving || !form.destination}
                                    className="flex-1 py-4 bg-(--main-color) text-black rounded-2xl text-[10px] font-black tracking-widest disabled:opacity-40 transition-all shadow-xl hover:scale-[1.02]">
                                    {saving ? 'PROCESSING…' : 'CONFIRM PAYMENT'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Request Payment modal (for vendor groups) ────────────────────────────────
const RequestPaymentModal: React.FC<{
    group: VendorGroup | null;
    onClose: () => void;
    onConfirm: (dest: PaymentDestination, percentage: number) => void;
}> = ({ group, onClose, onConfirm }) => {
    const [dest, setDest] = useState<PaymentDestination | null>(null);
    const [percentage, setPercentage] = useState(100);
    if (!group) return null;
    const name = appUsers[group.vendorId as keyof typeof appUsers]?.name || group.vendorId;
    const amountToRequest = group.total * (percentage / 100);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={onClose}>
            <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-7 w-[460px] max-w-[95vw] shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-1">Request Payment</h3>
                <p className="text-xs text-white/40 mb-5">{name} · {group.items.length} items · <span className="font-mono text-white/60">{fmtMXN(group.total)} total</span></p>

                <div className="mb-6">
                    <label className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-2 block">Payment Percentage</label>
                    <div className="flex items-center gap-4">
                        <input type="range" min="10" max="100" step="5" value={percentage} onChange={e => setPercentage(parseInt(e.target.value))}
                            className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-(--main-color)" />
                        <span className="text-lg font-mono font-black text-(--main-color) w-12">{percentage}%</span>
                    </div>
                    {percentage < 100 && <p className="text-[9px] text-yellow-400/50 mt-1 italic uppercase tracking-wider">Partial Payment Request</p>}
                </div>

                <div className="grid grid-cols-4 gap-2 mb-6">
                    {Object.entries(destinationsConfig).map(([key, cfg]) => {
                        const amt = amountToRequest;
                        const comm = cfg.calculateCommission(amt);
                        const iva = (key === PaymentDestination.BBVA_Ramses) ? (amt * 0.16) : 0;
                        const totalExtra = comm + iva;
                        return (
                            <button key={key} type="button" onClick={() => setDest(key as PaymentDestination)}
                                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${dest === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-white/10 hover:border-white/30'}`}>
                                <img src={cfg.icon} alt={cfg.name} className="h-8 w-full object-contain" />
                                <span className="text-[9px] font-bold text-white/50 text-center leading-tight">{cfg.name}</span>
                                <span className="text-[9px] font-mono text-(--main-color)">{fmtMXN(amt + totalExtra)}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl text-[10px] font-black tracking-widest hover:bg-white/5">CANCEL</button>
                    <button onClick={() => dest && onConfirm(dest, percentage)} disabled={!dest} className="flex-1 py-3 bg-(--main-color) text-black rounded-xl text-[10px] font-black tracking-widest disabled:opacity-40">CONFIRM</button>
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
        // We include items that are marked as Acquired or Requested, but NOT yet sent to payReq
        // Also including 'Catalog' and 'Avaiable' to transition existing data
        const targetStatuses = ['acquired', 'requested', 'avaiable', 'yes', 'catalog', 'production'];

        const pendingItems = inventory.filter(i => {
            const status = (i.data.status || '').toLowerCase();
            return targetStatuses.includes(status) && !i.data.payReq;
        });

        const groups: Record<string, VendorGroup> = {};
        for (const item of pendingItems) {
            // Priority for grouping:
            // 1. vendor_id or vendorId field
            // 2. Prefix from item_id (e.g. "V01-001" -> "V01")
            // 3. Fallback to Unknown
            const data = item.data;
            const itemIdStr = String(data.item_id || data.itemId || '');
            let vid = data.vendor_id || data.vendorId;

            if (!vid && itemIdStr.includes('-')) {
                vid = itemIdStr.split('-')[0];
            }

            if (!vid) vid = 'Unknown';

            if (!groups[vid]) groups[vid] = { vendorId: vid, items: [], total: 0 };

            const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
            const qty = parseFloat(data.quantity || '1') || 1;
            groups[vid].items.push(item);
            groups[vid].total += (price * qty);
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

    const handleRequestPayment = async (dest: PaymentDestination, percentage: number) => {
        if (!requestGroup) return;
        const group = requestGroup;
        const toastId = toast.loading(`Requesting payment for ${group.vendorId}…`);
        try {
            const amount = group.total * (percentage / 100);
            let commission = destinationsConfig[dest].calculateCommission(amount);
            if (dest === PaymentDestination.BBVA_Ramses) {
                commission += amount * 0.16;
            }

            const isPartial = percentage < 100;
            const desc = isPartial
                ? `Partial Payment (${percentage}%) for ${group.items.length} items from ${group.vendorId}`
                : `Liquidation Payment for ${group.items.length} items from ${group.vendorId}`;

            await appendExpense({
                description: desc,
                amount: amount,
                commission,
                destination: dest,
                status: 'Requested',
                subcategory: 'Acq',
                vendor_id: group.vendorId,
                inventoryItemRows: isPartial ? null : group.items.map(i => i.row).join(','),
                notes: isPartial ? `Partial payment of total ${fmtMXN(group.total)}` : null
            }, db);

            // Only mark items as requested if it's a 100% liquidation
            if (!isPartial) {
                for (const item of group.items) {
                    await supabase.from('inventory').update({ pay_req: true }).eq('id', item.row);
                }
            }

            toast.success(isPartial ? `Partial payment requested.` : `Liquidation requested.`, { id: toastId });
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
            <AddPaymentModal
                isOpen={showAdd}
                onClose={() => setShowAdd(false)}
                onSaved={() => { setPaymentsVersion(v => v + 1); onRefresh(); }}
                pendingGroups={pendingGroups}
            />
            <RequestPaymentModal
                group={requestGroup}
                onClose={() => setRequestGroup(null)}
                onConfirm={handleRequestPayment}
            />

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
