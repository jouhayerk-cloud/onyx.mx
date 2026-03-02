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

const SUBCATEGORIES = ['All', 'Acq', 'MONTHLY', 'Sppl', 'Labr', 'Pack', 'Oprt'] as const;
type Subcategory = typeof SUBCATEGORIES[number];

type VendorGroup = { vendorId: string; items: InventoryItem[]; total: number; totalQty: number; paidTotal: number };

// ─── API helpers ─────────────────────────────────────────────────────────────
const appendExpense = async (payload: any, db: any) => {
    const idsToLink = payload.inventoryItemRows || payload.linkedRows;
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
        related_ids: idsToLink ? idsToLink.split(',') : [],
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
        subcategory: 'Acq' as string,
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

    const calculateIVA = (amt: number) => amt * 0.16;

    const handleSubmit = async () => {
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

            const isProd = form.subcategory === 'Prod';
            const group = (form.subcategory === 'Acq' || isProd) ? pendingGroups.find(g => g.vendorId === form.vendor_id) : null;
            const inventoryItemRows = group ? group.items.map(i => i.row).join(',') : null;
            const ids = inventoryItemRows ? inventoryItemRows.split(',') : [];

            // If it's a manual entry for an existing group, handle tagging
            if (ids.length > 0) {
                const isPartial = group && amt < (group.total - group.paidTotal);
                const perc = group ? Math.round(((group.paidTotal + amt) / group.total) * 100) : 100;

                if (isProd && isPartial) {
                    await supabase.from('inventory').update({
                        pay_req: `requested ${perc}%`,
                        notes: `Partial payment of ${amt} recorded.`
                    }).in('id', ids);
                } else {
                    await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
                }
            }

            await appendExpense({
                ...form,
                amount: amt,
                commission,
                inventoryItemRows: (form.subcategory === 'Acq' && !form.vendor_id.includes('%')) ? inventoryItemRows : null,
                linkedRows: (form.subcategory === 'Prod' || form.vendor_id.includes('%')) ? inventoryItemRows : null
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4" onClick={onClose}>
            <div className="bg-[#0d0d1a] border border-white/10 rounded-[40px] w-full max-w-[600px] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Progress Header */}
                <div className="px-10 pt-10 flex justify-between items-center mb-8">
                    <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(s => (
                            <div key={s} className={`h-1 rounded-full transition-all duration-500 ${step >= s ? 'w-8 bg-(--main-color)' : 'w-4 bg-white/10'}`} />
                        ))}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all text-sm">✕</button>
                </div>

                <div className="px-10 pb-10 flex flex-col min-h-[460px]">
                    {/* Stage 1: Merch vs Expenses */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-white mb-3 leading-tight tracking-tight uppercase">TRANSACTION<br />CLASSIFICATION</h2>
                            <p className="text-[11px] text-white/30 mb-10 uppercase tracking-[0.3em] font-bold">Define the primary nature of this expenditure</p>

                            <div className="grid grid-cols-2 gap-5">
                                <button onClick={() => setStep(2.1)}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-white/2 border border-white/5 hover:border-[#F7941D]/50 hover:bg-[#F7941D]/5 transition-all group">
                                    <div className="w-16 h-16 mb-6 rounded-full border-2 border-[#F7941D]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 text-[#F7941D] opacity-70"><use href="#pkg" /></svg>
                                    </div>
                                    <span className="text-[12px] font-black text-white uppercase tracking-[0.2em]">MERCHANDISE</span>
                                    <span className="text-[9px] text-white/20 font-bold mt-3 text-center leading-relaxed">Inventory acquisitions,<br />production & labor costs</span>
                                </button>
                                <button onClick={() => setStep(2.2)}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-white/2 border border-white/5 hover:border-[#00AEEF]/50 hover:bg-[#00AEEF]/5 transition-all group">
                                    <div className="w-16 h-16 mb-6 rounded-full border-2 border-[#00AEEF]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 text-[#00AEEF] opacity-70"><use href="#dollar" /></svg>
                                    </div>
                                    <span className="text-[12px] font-black text-white uppercase tracking-[0.2em]">OPERATIONS</span>
                                    <span className="text-[9px] text-white/20 font-bold mt-3 text-center leading-relaxed">Business services,<br />fixed bills & utilities</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stage 2.1: Merch Type (Acq vs Prod) */}
                    {step === 2.1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-white mb-3 uppercase tracking-tight">MERCHANDISE</h2>
                            <p className="text-[11px] text-white/30 mb-8 uppercase tracking-widest font-bold">Classify the inventory transaction type</p>
                            <button onClick={() => setStep(1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-10 flex items-center gap-3 group transition-all">
                                <span className="group-hover:-translate-x-1 transition-transform">←</span> BACK TO TYPE
                            </button>

                            <div className="grid grid-cols-2 gap-5">
                                <button onClick={() => { set('subcategory', 'Acq'); setStep(3.1); }}
                                    className="flex flex-col items-center p-8 rounded-[40px] bg-white/2 border border-white/5 hover:border-white/20 transition-all group">
                                    <div className="w-14 h-14 mb-4 rounded-full border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-7 h-7 opacity-50"><use href="#download" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-white uppercase tracking-[0.15em]">ACQUISITIONS</span>
                                    <span className="text-[8px] text-white/20 font-bold mt-2 text-center uppercase leading-tight">Bulk purchase from<br />authorized vendors</span>
                                </button>
                                <button onClick={() => { set('subcategory', 'Prod'); setStep(3.1); }}
                                    className="flex flex-col items-center p-8 rounded-[40px] bg-white/2 border border-white/5 hover:border-white/20 transition-all group">
                                    <div className="w-14 h-14 mb-4 rounded-full border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-7 h-7 opacity-50"><use href="#settings" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-white uppercase tracking-[0.15em]">PRODUCTION</span>
                                    <span className="text-[8px] text-white/20 font-bold mt-2 text-center uppercase leading-tight">Manufacturing labor<br />& custom processing</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stage 3.1: Select Bubble */}
                    {step === 3.1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-white mb-3 uppercase tracking-tight">VENDORS</h2>
                            <button onClick={() => setStep(2.1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-8 flex items-center gap-3 group transition-all">
                                <span className="group-hover:-translate-x-1 transition-transform">←</span> BACK
                            </button>

                            <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
                                {pendingGroups.length === 0 ? (
                                    <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-[40px]">
                                        <p className="text-white/10 text-[10px] font-black tracking-[0.3em] uppercase">No pending items found</p>
                                    </div>
                                ) : (
                                    pendingGroups
                                        .filter(g => {
                                            const isProdGroup = g.items.some(i => i.data?.status?.toLowerCase() === 'production');
                                            return form.subcategory === 'Prod' ? isProdGroup : !isProdGroup;
                                        })
                                        .map(group => {
                                            const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#2a2a3e';
                                            const paidPerc = Math.round((group.paidTotal / group.total) * 100);
                                            return (
                                                <button key={group.vendorId}
                                                    onClick={() => {
                                                        set('vendor_id', group.vendorId);
                                                        set('amount', (group.total - group.paidTotal).toString());
                                                        set('description', `${paidPerc > 0 ? 'Liquidation' : 'Payment'} for ${group.items.length} items from ${group.vendorId}`);
                                                        setStep(4);
                                                    }}
                                                    className="flex justify-between items-center p-5 rounded-[32px] bg-white/2 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-left group"
                                                >
                                                    <div className="flex items-center gap-5">
                                                        <div className="w-12 h-12 rounded-[20px] flex items-center justify-center font-black text-base" style={{ backgroundColor: color, color: getTextColorForBg(color) }}>
                                                            {group.vendorId[0]}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-white leading-none mb-1">{group.vendorId}</p>
                                                            <p className="text-[10px] text-white/30 uppercase tracking-widest leading-none">{group.items.length} items · {paidPerc > 0 ? `${paidPerc}% Paid` : 'Unpaid'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-mono font-black text-white leading-none mb-1">{fmtMXN(group.total - group.paidTotal)}</p>
                                                        <span className="text-[9px] font-black text-(--main-color) opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest block">Select Vendor</span>
                                                    </div>
                                                </button>
                                            );
                                        })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Stage 2.2: Expenses Stage 1 (Monthly vs Specific) */}
                    {step === 2.2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-white mb-3 uppercase tracking-tight text-center">OPERATING COSTS</h2>
                            <p className="text-[11px] text-white/30 mb-10 uppercase tracking-widest font-bold text-center">Classify the administrative cost</p>
                            <button onClick={() => setStep(1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-10 flex items-center gap-3 group transition-all">← BACK</button>

                            <div className="grid grid-cols-2 gap-5 w-full">
                                <button onClick={() => { set('subcategory', 'MONTHLY'); setStep(4); }}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-white/2 border border-white/5 hover:border-white/20 transition-all group">
                                    <div className="w-16 h-16 mb-5 rounded-full border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 opacity-50"><use href="#calendar" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-white uppercase tracking-widest">MONTHLY FIXED</span>
                                    <span className="text-[8px] text-white/20 font-bold mt-2 uppercase leading-tight text-center">Recurring bills<br />& subscriptions</span>
                                </button>
                                <button onClick={() => setStep(3.2)}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-white/2 border border-white/5 hover:border-white/20 transition-all group">
                                    <div className="w-16 h-16 mb-5 rounded-full border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 opacity-50"><use href="#file" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-white uppercase tracking-widest">VARIABLE COST</span>
                                    <span className="text-[8px] text-white/20 font-bold mt-2 uppercase leading-tight text-center">One-time operational<br />expenditure</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stage 3.2: Expense Categories */}
                    {step === 3.2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-white mb-3 uppercase tracking-tight">CATEGORIES</h2>
                            <p className="text-[11px] text-white/30 mb-8 uppercase tracking-widest font-bold">Select expense department</p>
                            <button onClick={() => setStep(2.2)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-10 flex items-center gap-3 group transition-all">← BACK</button>

                            <div className="grid grid-cols-2 gap-4">
                                {['Sppl', 'Labr', 'Pack', 'Oprt'].map(cat => {
                                    const labels: Record<string, { t: string, s: string, i: string }> = {
                                        Sppl: { t: 'SUPPLIES', s: 'Equipment & tools', i: '#hammer' },
                                        Labr: { t: 'LABOR', s: 'Workforce payments', i: '#user' },
                                        Pack: { t: 'PACKAGING', s: 'Shipping materials', i: '#label' },
                                        Oprt: { t: 'OPERATIONS', s: 'General services', i: '#settings' }
                                    };
                                    return (
                                        <button key={cat}
                                            onClick={() => { set('subcategory', cat); setStep(4); }}
                                            className="flex flex-col items-start p-7 rounded-[32px] bg-white/2 border border-white/5 hover:border-(--main-color)/40 hover:bg-(--main-color)/5 transition-all group"
                                        >
                                            <div className="w-12 h-12 mb-4 rounded-full border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform group-hover:border-(--main-color)/30">
                                                <svg className="w-6 h-6 opacity-30 group-hover:opacity-100 group-hover:text-(--main-color) transition-all">
                                                    <use href={labels[cat].i} />
                                                </svg>
                                            </div>
                                            <span className="text-[12px] font-black text-white uppercase tracking-[0.1em]">{labels[cat].t}</span>
                                            <span className="text-[8px] text-white/20 font-bold mt-1 uppercase leading-none">{labels[cat].s}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Stage 4: Final Form */}
                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-white mb-2 uppercase tracking-tight">DETAILS</h2>
                            <p className="text-[11px] text-white/30 mb-10 uppercase tracking-widest font-bold">Specify payment details for {form.subcategory}</p>

                            <div className="flex flex-col gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] opacity-40 font-black uppercase tracking-[0.3em] block ml-1">DESCRIPTION</label>
                                    <input value={form.description} onChange={e => set('description', e.target.value)}
                                        className="w-full h-16 px-6 rounded-[24px] bg-white/5 border border-white/10 text-white placeholder:text-white/10 focus:border-(--main-color)/50 focus:bg-white/10 transition-all outline-none" placeholder="Brief summary of payment" />
                                </div>

                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-3">
                                        <label className="text-[10px] opacity-40 font-black uppercase tracking-[0.3em] block ml-1">AMOUNT (MXN)</label>
                                        <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                                            className="w-full h-16 px-6 font-mono text-xl font-bold bg-white/5 border border-white/10 rounded-[24px] text-white outline-none focus:border-(--main-color)/50 transition-all" placeholder="0.00" />
                                    </div>
                                    {form.subcategory === 'MONTHLY' ? (
                                        <div className="space-y-3">
                                            <label className="text-[10px] opacity-40 font-black uppercase tracking-[0.3em] block ml-1">RECURRING DAY</label>
                                            <input type="number" min="1" max="31" value={form.recurring_day} onChange={e => { set('recurring_day', parseInt(e.target.value)); set('recurring', true); }}
                                                className="w-full h-16 px-6 font-mono text-xl font-bold bg-white/5 border border-white/10 rounded-[24px] text-white outline-none focus:border-(--main-color)/50 transition-all" />
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <label className="text-[10px] opacity-40 font-black uppercase tracking-[0.3em] block ml-1">REFERENCE</label>
                                            <input value={form.reference} onChange={e => set('reference', e.target.value)}
                                                className="w-full h-16 px-6 rounded-[24px] bg-white/5 border border-white/10 text-white placeholder:text-white/10 outline-none focus:border-(--main-color)/50 transition-all" placeholder="Optional #" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-5 mt-16">
                                <button onClick={() => {
                                    if (form.vendor_id) setStep(3.1);
                                    else if (['Sppl', 'Labr', 'Pack', 'Oprt'].includes(form.subcategory)) setStep(3.2);
                                    else setStep(2.2);
                                }} className="flex-1 py-5 border border-white/10 text-white/30 rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-white/5 transition-all">BACK</button>
                                <button onClick={() => {
                                    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount');
                                    setStep(5);
                                }} className="flex-1 py-5 bg-white/10 text-white rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-white/20 transition-all">CONTINUE</button>
                            </div>
                        </div>
                    )}

                    {/* Stage 5: Account Selection */}
                    {step === 5 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-white mb-3 uppercase tracking-tight">SOURCE</h2>
                            <p className="text-[11px] text-white/30 mb-8 uppercase tracking-widest font-bold">Select payment disbursement account</p>

                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(destinationsConfig).map(([key, cfg]) => {
                                    const amt = parseFloat(form.amount) || 0;
                                    const comm = cfg.calculateCommission(amt);
                                    const iva = (key === PaymentDestination.BBVA_Ramses) ? calculateIVA(amt) : 0;
                                    const totalExtra = comm + iva;

                                    return (
                                        <button key={key} type="button"
                                            onClick={() => set('destination', key as PaymentDestination)}
                                            className={`flex flex-col items-center gap-3 p-6 rounded-[32px] border-2 transition-all ${form.destination === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-white/5 bg-white/2 hover:border-white/20'}`}
                                        >
                                            <img src={cfg.icon} alt={cfg.name} className="h-10 w-auto object-contain mb-1" />
                                            <div className="text-center">
                                                <div className="text-[11px] font-black text-white uppercase tracking-widest opacity-80">{cfg.name}</div>
                                                {totalExtra > 0 && (
                                                    <div className="text-[9px] font-mono text-(--main-color) mt-1 font-bold">
                                                        +{fmtMXN(totalExtra)} FEE
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-10 p-8 rounded-[40px] bg-black/40 border border-white/5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">TOTAL TRANSACTION</span>
                                    <span className="text-xs font-mono text-white/40">{fmtMXN(parseFloat(form.amount) || 0)} BASE</span>
                                </div>
                                <div className="text-4xl font-mono font-black text-white tracking-tighter">
                                    {form.destination ? fmtMXN((parseFloat(form.amount) || 0) + destinationsConfig[form.destination].calculateCommission(parseFloat(form.amount) || 0) + (form.destination === PaymentDestination.BBVA_Ramses ? calculateIVA(parseFloat(form.amount) || 0) : 0)) : '—'}
                                </div>
                            </div>

                            <div className="flex gap-5 mt-10">
                                <button onClick={() => setStep(4)} className="flex-1 py-5 border border-white/10 text-white/30 rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-white/5 transition-all">BACK</button>
                                <button onClick={handleSubmit} disabled={saving || !form.destination}
                                    className="flex-[1.5] py-5 bg-(--main-color) text-black rounded-[28px] text-[11px] font-black tracking-[0.2em] disabled:opacity-40 transition-all shadow-xl hover:scale-[1.02] active:scale-95">
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
    const paidPerc = group ? Math.round((group.paidTotal / group.total) * 100) : 0;
    const [percentage, setPercentage] = useState(100);

    useEffect(() => {
        if (paidPerc > 0 && paidPerc < 100) {
            setPercentage(100);
        }
    }, [paidPerc]);

    if (!group) return null;
    const name = appUsers[group.vendorId as keyof typeof appUsers]?.name || group.vendorId;
    const isProduction = group.items.some(i => (i.data.status || '').toLowerCase() === 'production');

    const targetAmount = group.total * (percentage / 100);
    const amountToRequest = Math.max(0, targetAmount - group.paidTotal);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4" onClick={onClose}>
            <div className="bg-[#0d0d1a] border border-white/10 rounded-[40px] w-full max-w-[500px] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                <div className="px-10 pt-10 flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight">
                            {paidPerc > 0 && percentage === 100 ? 'LIQUIDATE BALANCE' : 'PAYMENT REQUEST'}
                        </h3>
                        <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold mt-1">FOR {group.vendorId}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all text-sm">✕</button>
                </div>

                <div className="px-10 pb-10">
                    <div className="flex flex-col gap-6">
                        {/* Status Summary */}
                        <div className="flex justify-between items-end p-6 rounded-[32px] bg-white/2 border border-white/5">
                            <div>
                                <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">CONTRACT TOTAL</p>
                                <p className="text-2xl font-mono font-black text-white">{fmtMXN(group.total)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">STAKEHOLDERS</p>
                                <p className="text-xs font-black text-white uppercase tracking-widest">{group.items.length} ITEMS</p>
                            </div>
                        </div>

                        {/* Progress Tracker */}
                        <div className="bg-white/2 rounded-[32px] p-6 border border-white/5">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">PAYMENT ARCHITECTURE</span>
                                <span className="text-[10px] font-mono font-black text-white">{paidPerc}% COMPLETE</span>
                            </div>
                            <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-white/5">
                                <div className="h-full bg-green-500/40 rounded-full transition-all duration-1000" style={{ width: `${paidPerc}%` }} />
                                {percentage > paidPerc && (
                                    <div className="h-full bg-(--main-color)/40 rounded-full animate-pulse transition-all duration-500" style={{ width: `${percentage - paidPerc}%` }} />
                                )}
                            </div>
                        </div>

                        {/* Control Slider - Only for Production */}
                        {isProduction ? (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <label className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">TARGET PERCENTAGE</label>
                                    <span className="text-xl font-mono font-black text-(--main-color) leading-none">{percentage}%</span>
                                </div>
                                <input type="range" min={Math.max(10, paidPerc + 5)} max="100" step="5" value={percentage} onChange={e => setPercentage(parseInt(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-(--main-color) mb-4" />

                                <div className="p-5 rounded-[24px] bg-(--main-color)/5 border border-(--main-color)/10 text-center">
                                    <p className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.3em] mb-1">AMOUNT TO DISBURSE</p>
                                    <p className="text-3xl font-mono font-black text-white">{fmtMXN(amountToRequest)}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 rounded-[32px] bg-white/2 border border-white/5 text-center">
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-2">FULL PAYMENT REQUIRED</p>
                                <p className="text-3xl font-mono font-black text-white">{fmtMXN(amountToRequest)}</p>
                            </div>
                        )}

                        {/* Destination Picker */}
                        <div className="grid grid-cols-4 gap-2">
                            {Object.entries(destinationsConfig).map(([key, cfg]) => (
                                <button key={key} type="button" onClick={() => setDest(key as PaymentDestination)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${dest === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-white/5 bg-white/2 hover:border-white/20'}`}>
                                    <img src={cfg.icon} alt={cfg.name} className="h-7 w-auto grayscale group-hover:grayscale-0 transition-all opacity-40 hover:opacity-100" />
                                    <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter text-center leading-tight">{cfg.name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-4 mt-2">
                            <button onClick={onClose} className="flex-1 py-5 border border-white/10 text-white/20 rounded-[24px] text-[10px] font-black tracking-widest hover:bg-white/5 transition-all">CANCEL</button>
                            <button onClick={() => dest && onConfirm(dest, percentage)} disabled={!dest || amountToRequest <= 0}
                                className="flex-[1.5] py-5 bg-(--main-color) text-black rounded-[24px] text-[10px] font-black tracking-widest disabled:opacity-40 uppercase transition-all shadow-lg hover:scale-[1.02] active:scale-95">
                                {paidPerc > 0 && percentage === 100 ? 'CONFIRM LIQUIDATION' : 'CONFIRM PARTIAL PAYMENT'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const TrackingPaymentsView: React.FC<{ docs: any[]; exchangeRate: number; onRefresh: () => void }> = ({ docs, exchangeRate, onRefresh }) => {
    const db = useDatabase();
    const user = useAtomValue(userAtom);
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

            if (!groups[vid]) groups[vid] = { vendorId: vid, items: [], total: 0, totalQty: 0, paidTotal: 0 };

            const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
            const qty = parseFloat(data.quantity || '1') || 1;
            groups[vid].items.push(item);
            groups[vid].total += (price * qty);
            groups[vid].totalQty += qty;
        }

        // Aggregate existing partial payments from finance records
        const groupList = Object.values(groups);
        for (const group of groupList) {
            const itemIds = new Set(group.items.map(i => String(i.row)));
            const relatedExpenses = docs.filter(d =>
                d.vendor_id === group.vendorId &&
                ['Requested', 'Paid', 'Sent', 'Dispersed'].includes(d.status) &&
                (d.related_ids?.some((id: any) => itemIds.has(String(id))) ||
                    d.related_inventory_ids?.split(',').some((id: any) => itemIds.has(String(id))))
            );
            // Sum only successful amounts linked to these items
            group.paidTotal = relatedExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        }

        return groupList;
    }, [inventory, docs]);

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
            const targetAmount = group.total * (percentage / 100);
            const amount = Math.max(0, targetAmount - group.paidTotal);

            if (amount <= 0 && percentage < 100) {
                toast.error('No balanced remaining at this percentage.', { id: toastId });
                return;
            }

            let commission = destinationsConfig[dest].calculateCommission(amount);
            if (dest === PaymentDestination.BBVA_Ramses) {
                commission += amount * 0.16;
            }

            const isProduction = group.items.some(i => (i.data.status || '').toLowerCase() === 'production');
            const isPartial = percentage < 100;
            const desc = isPartial
                ? `Partial Payment (${percentage}%) for ${group.items.length} items from ${group.vendorId}`
                : `Liquidation Payment for ${group.items.length} items from ${group.vendorId}`;

            const itemIdsStr = group.items.map(i => String(i.row)).join(',');
            const ids = itemIdsStr.split(',');

            // PRODUCTION Progress Tracking
            if (isProduction) {
                if (isPartial) {
                    await supabase.from('inventory').update({ pay_req: `requested ${percentage}%` }).in('id', ids);
                } else {
                    await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
                }
            }

            await appendExpense({
                description: desc,
                amount: amount,
                commission,
                destination: dest,
                status: 'Requested',
                subcategory: isProduction ? 'Prod' : 'Acq',
                vendor_id: group.vendorId,
                inventoryItemRows: isPartial ? null : itemIdsStr,
                linkedRows: isPartial ? itemIdsStr : null,
                notes: isPartial ? `Partial payment for total ${fmtMXN(group.total)}. Current paid: ${fmtMXN(group.paidTotal + amount)}` : null
            }, db);

            toast.success(isPartial ? `Partial payment requested.` : `Liquidation requested.`, { id: toastId });
            setInventoryVersion(v => v + 1);
            setPaymentsVersion(v => v + 1);
            onRefresh && onRefresh();
        } catch (err: any) { toast.error(err.message, { id: toastId }); }
        setRequestGroup(null);
    };

    const handleDeletePayment = async (id: string) => {
        if (!confirm('Are you sure you want to delete this payment record?')) return;
        const { error } = await supabase.from('finance').delete().eq('id', id);
        if (error) toast.error(error.message);
        else {
            toast.success('Payment deleted');
            onRefresh();
        }
    };

    const [showFilters, setShowFilters] = useState(false);
    const [isBubblesCollapsed, setIsBubblesCollapsed] = useState(false);

    const handleToggleStatus = async (r: any) => {
        const next = r.status === 'Requested' ? 'Paid' : 'Requested';
        const { error } = await supabase.from('finance').update({
            status: next,
            pay_date: next === 'Paid' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        }).eq('id', r.id);

        if (error) {
            toast.error(error.message);
        } else {
            // PRODUCTION / ACQ Tagging Persistence
            if (next === 'Paid') {
                const ids = r.related_ids || r.related_inventory_ids?.split(',');
                if (ids?.length > 0) {
                    if (r.description?.includes('%')) {
                        const perc = r.description.match(/(\d+)%/)?.[1];
                        await supabase.from('inventory').update({ pay_req: `paid ${perc || 'partial'}%` }).in('id', ids);
                    } else {
                        await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
                    }
                }
            }
            onRefresh();
        }
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
            <div className="flex flex-col border-b border-white/5 bg-black/10 shrink-0">
                <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 text-[10px] font-black tracking-widest text-white/40 hover:text-white transition-colors">
                            <span className="text-xs">{showFilters ? '−' : '+'}</span> FILTERS
                        </button>
                        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                            <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">Exchange</span>
                            <span className="text-xs font-mono font-black text-white/40">1 USD = {exchangeRate.toFixed(2)} MXN</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowAdd(true)}
                            className="px-4 py-2 bg-(--main-color) text-black text-[10px] font-black tracking-widest rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">
                            <svg className="w-3 h-3 inline-block align-text-top mr-1"><use href="#plus" /></svg>ADD
                        </button>
                    </div>
                </div>

                {showFilters && (
                    <div className="px-4 py-3 bg-black/20 border-t border-white/5 flex flex-wrap items-center gap-4 animate-in slide-in-from-top-1 duration-200">
                        {/* Subcategory pills */}
                        <div className="flex flex-wrap gap-1.5 pt-2">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest w-full mb-1">Category (Subcat)</span>
                            {SUBCATEGORIES.map(s => (
                                <button key={s} onClick={() => setSubcatFilter(s)}
                                    className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${subcatFilter === s ? 'bg-[#6BCEBB] text-black shadow' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>
                                    {s.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col gap-1 border-l border-white/10 pl-4 pt-2">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">Account Filter</span>
                            <div className="flex items-center -space-x-4 hover:space-x-1 transition-all duration-500 group/stack">
                                {Object.entries(destinationsConfig).map(([key, cfg]) => {
                                    const isActive = destinationFilter === key;
                                    return (
                                        <div key={key} onClick={() => setDestinationFilter(isActive ? 'All' : key as PaymentDestination)}
                                            className={`relative cursor-pointer transition-all duration-500 ease-out flex items-center gap-3 p-3 rounded-2xl border backdrop-blur-md shadow-2xl
                                                ${isActive
                                                    ? 'w-48 bg-(--main-color)/20 border-(--main-color) z-30 translate-x-0 scale-100 opacity-100'
                                                    : 'w-12 bg-white/2 border-white/5 z-10 hover:z-20 group-hover/stack:scale-105 opacity-60 hover:opacity-100'}`}>

                                            <img src={cfg.icon} alt={cfg.name} className={`h-6 w-auto object-contain transition-all duration-500 ${isActive ? 'scale-110' : 'grayscale group-hover/stack:grayscale-0'}`} />

                                            {isActive && (
                                                <div className="flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-2 duration-500">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-tighter truncate">{cfg.name}</span>
                                                    <span className="text-[8px] font-bold text-(--main-color) uppercase tracking-widest">ACTIVE</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

            {/* ── Pending Bubbles Bar (Collapsible) ── */}
            {pendingGroups.length > 0 && (
                <div className="flex flex-col border-t border-white/5 bg-black/5">
                    <div className="flex justify-between items-center px-4 py-1.5 h-8">
                        <button onClick={() => setIsBubblesCollapsed(!isBubblesCollapsed)}
                            className="flex items-center gap-2 text-[9px] font-black tracking-[0.2em] text-white/30 hover:text-(--main-color) transition-all">
                            <span>{isBubblesCollapsed ? '+' : '−'}</span>
                            PENDING REQUESTS
                            <span className="ml-2 px-1.5 py-0.5 rounded-md bg-white/5 text-[8px]">{pendingGroups.length}</span>
                        </button>

                        {!isBubblesCollapsed && (
                            <div className="flex items-center gap-2 overflow-x-auto max-w-[400px] no-scrollbar">
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest shrink-0">Filter:</span>
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
                    </div>

                    <div className={`px-4 transition-all duration-500 overflow-hidden ${isBubblesCollapsed ? 'max-h-0 py-0' : 'max-h-[200px] py-3'}`}>
                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            {pendingGroups.map(group => {
                                const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#2a2a3e';
                                const txt = getTextColorForBg(color);
                                const isProd = group.items.some(i => i.data.status?.toLowerCase() === 'production');
                                const paidPerc = Math.round((group.paidTotal / group.total) * 100);

                                return (
                                    <div key={group.vendorId} className="shrink-0 p-2.5 rounded-2xl min-w-[140px] flex flex-col gap-2 group/card relative overflow-hidden transition-all hover:scale-[1.02] shadow-sm hover:shadow-md" style={{ backgroundColor: color, color: txt }}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex flex-col">
                                                <p className="font-black text-[10px] uppercase tracking-wider leading-none mb-1 opacity-90">{appUsers[group.vendorId as keyof typeof appUsers]?.name || group.vendorId}</p>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[8px] font-mono font-bold opacity-60 bg-black/10 px-1 rounded">{group.items.length} ITM</span>
                                                    {isProd && <span className="text-[7px] font-black uppercase tracking-widest bg-white/20 px-1 rounded">PROD</span>}
                                                </div>
                                            </div>
                                            <p className="font-mono font-black text-[11px] leading-none pt-0.5">{fmtMXN(group.total)}</p>
                                        </div>

                                        {isProd && paidPerc > 0 && (
                                            <div className="w-full h-1 bg-black/10 rounded-full overflow-hidden mt-1">
                                                <div className="h-full bg-white/40 rounded-full" style={{ width: `${paidPerc}%` }} />
                                            </div>
                                        )}

                                        <button onClick={() => setRequestGroup(group)}
                                            className="w-full py-1 rounded-lg text-[9px] font-black tracking-widest border border-current/20 hover:bg-white/20 transition-all uppercase mt-1">
                                            {isProd && paidPerc > 0 ? 'Liquidate' : 'Request'}
                                        </button>

                                        {isProd && paidPerc > 0 && (
                                            <div className="absolute top-0 right-0 p-1 opacity-40">
                                                <span className="text-[7px] font-black">{paidPerc}%</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>

            {/* ── Summary cards ── */ }
    <div className="flex gap-3 px-4 py-3 shrink-0 overflow-x-auto border-b border-white/5">
        {Object.entries(subcatTotals).map(([k, v]) => (
            <div key={k} className="px-4 py-2.5 rounded-2xl bg-white/2 border border-white/5 min-w-[130px] shrink-0">
                <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">{k}</div>
                <div className="text-sm font-mono font-black text-white">{fmtMXN(v)}</div>
                <div className="text-[8px] font-mono text-white/20">${((v) / exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</div>
            </div>
        ))}
    </div>

    {/* ── Records Table ── */ }
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
                            <div className="flex items-center justify-center gap-2">
                                <button onClick={() => handleToggleStatus(r)}
                                    className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all ${r.status === 'Paid' ? 'bg-[#8DC63F]/20 text-[#8DC63F] border border-[#8DC63F]/30' : 'bg-[#FFED00]/10 text-[#FFED00] border border-[#FFED00]/20 hover:bg-[#FFED00]/20'}`}>
                                    {r.status || 'Requested'}
                                </button>
                                {(user?.role === 'Admin' || user?.role === 'Developer') && (
                                    <button onClick={() => handleDeletePayment(r.id)}
                                        className="w-7 h-7 flex items-center justify-center rounded-full bg-red-500/10 text-red-500/60 hover:text-red-500 hover:bg-red-500/20 transition-all text-[10px]" title="Delete Payment Record">
                                        ✕
                                    </button>
                                )}
                            </div>
                        </td>
                    </tr>
                ))}
                {filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-white/10 text-sm font-black tracking-widest">NO RECORDS</td></tr>
                )}
            </tbody>
        </table>
    </div>

    {/* SVG Icons for Wizard */ }
    <svg style={{ display: 'none' }}>
        <defs>
            <symbol id="pkg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
            </symbol>
            <symbol id="dollar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </symbol>
            <symbol id="download" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </symbol>
            <symbol id="settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
            </symbol>
            <symbol id="calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </symbol>
            <symbol id="file" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </symbol>
            <symbol id="hammer" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9" /><path d="M17.64 15 22 10.64" /><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.23V5a2 2 0 0 0-2-2h-3a2 2 0 0 0-2 2v2.46c0 .83-.34 1.63-.93 2.23l-1.25 1.25" /><path d="m15 15 5 5" /><path d="m12 12 5 5" />
            </symbol>
            <symbol id="user" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </symbol>
            <symbol id="label" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
            </symbol>
        </defs>
    </svg>
        </div >
    );
};
