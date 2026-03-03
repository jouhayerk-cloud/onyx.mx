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
import { paymentsVersionAtom, userAtom, inventoryAtom, InventoryVersionAtom, paymentDestinationFilterAtom, exchangeRateAtom, paymentsOverviewModeAtom } from '../../lib/atoms';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg, calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';
const getVendorIdFromDescription = (desc: string) => desc?.match(/from (\w+)$/)?.[1] ?? null;
const normalizeSubcat = (s: string | null | undefined): string => {
    if (!s) return '—';
    const low = s.toString().trim().toLowerCase();
    if (low === 'mo-exp' || low === 'monthly' || low === 'mo-ex') return 'Monthly';
    if (low === 'acq' || low === 'acquisition') return 'Acq';
    if (low === 'prod' || low === 'production') return 'Prod';
    if (low === 'sppl' || low === 'supplies') return 'Sppl';
    if (low === 'labr' || low === 'labor') return 'Labr';
    if (low === 'pack' || low === 'packaging') return 'Pack';
    if (low === 'oprt' || low === 'operations') return 'Oprt';
    return s;
};

const SUBCATEGORIES = ['All', 'Acq', 'Prod', 'Monthly', 'Sppl', 'Labr', 'Pack', 'Oprt'] as const;
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4" onClick={onClose}>
            <div className="bg-(--c1) border border-(--border-color) rounded-[40px] w-full max-w-[600px] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Progress Header */}
                <div className="px-10 pt-10 flex justify-between items-center mb-8">
                    <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(s => (
                            <div key={s} className={`h-1 rounded-full transition-all duration-500 ${step >= s ? 'w-8 bg-(--main-color)' : 'w-4 bg-(--border-color)'}`} />
                        ))}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-(--glass-bg) flex items-center justify-center text-(--text-color-secondary) hover:text-(--text-color) transition-all text-sm">✕</button>
                </div>

                <div className="px-10 pb-10 flex flex-col min-h-[460px]">
                    {/* Stage 1: Merch vs Expenses */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 leading-tight tracking-tight uppercase">TRANSACTION<br />CLASSIFICATION</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-10 uppercase tracking-[0.3em] font-bold">Define the primary nature of this expenditure</p>

                            <div className="grid grid-cols-2 gap-5">
                                <button onClick={() => setStep(2.1)}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-(--glass-bg) border border-(--border-color) hover:border-[#F7941D]/50 hover:bg-[#F7941D]/5 transition-all group">
                                    <div className="w-16 h-16 mb-6 rounded-full border-2 border-[#F7941D]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 text-[#F7941D] opacity-70"><use href="#pkg" /></svg>
                                    </div>
                                    <span className="text-[12px] font-black text-(--text-color) uppercase tracking-[0.2em]">MERCHANDISE</span>
                                    <span className="text-[9px] text-(--text-color-secondary) font-bold mt-3 text-center leading-relaxed">Inventory acquisitions,<br />production & labor costs</span>
                                </button>
                                <button onClick={() => setStep(2.2)}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-(--glass-bg) border border-(--border-color) hover:border-[#00AEEF]/50 hover:bg-[#00AEEF]/5 transition-all group">
                                    <div className="w-16 h-16 mb-6 rounded-full border-2 border-[#00AEEF]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 text-[#00AEEF] opacity-70"><use href="#dollar" /></svg>
                                    </div>
                                    <span className="text-[12px] font-black text-(--text-color) uppercase tracking-[0.2em]">OPERATIONS</span>
                                    <span className="text-[9px] text-(--text-color-secondary) font-bold mt-3 text-center leading-relaxed">Business services,<br />fixed bills & utilities</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stage 2.1: Merch Type (Acq vs Prod) */}
                    {step === 2.1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight">MERCHANDISE</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-8 uppercase tracking-widest font-bold">Classify the inventory transaction type</p>
                            <button onClick={() => setStep(1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-10 flex items-center gap-3 group transition-all">
                                <span className="group-hover:-translate-x-1 transition-transform">←</span> BACK TO TYPE
                            </button>

                            <div className="grid grid-cols-2 gap-5">
                                <button onClick={() => { set('subcategory', 'Acq'); setStep(3.1); }}
                                    className="flex flex-col items-center p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color) hover:border-(--text-color-secondary)/30 transition-all group">
                                    <div className="w-14 h-14 mb-4 rounded-full border border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-7 h-7 opacity-50 text-(--text-color-secondary)"><use href="#download" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-(--text-color) uppercase tracking-[0.15em]">ACQUISITIONS</span>
                                    <span className="text-[8px] text-(--text-color-secondary) font-bold mt-2 text-center uppercase leading-tight">Bulk purchase from<br />authorized vendors</span>
                                </button>
                                <button onClick={() => { set('subcategory', 'Prod'); setStep(3.1); }}
                                    className="flex flex-col items-center p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color) hover:border-(--text-color-secondary)/30 transition-all group">
                                    <div className="w-14 h-14 mb-4 rounded-full border border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-7 h-7 opacity-50 text-(--text-color-secondary)"><use href="#settings" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-(--text-color) uppercase tracking-[0.15em]">PRODUCTION</span>
                                    <span className="text-[8px] text-(--text-color-secondary) font-bold mt-2 text-center uppercase leading-tight">Manufacturing labor<br />& custom processing</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stage 3.1: Select Bubble */}
                    {step === 3.1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight">VENDORS</h2>
                            <button onClick={() => setStep(2.1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-8 flex items-center gap-3 group transition-all">
                                <span className="group-hover:-translate-x-1 transition-transform">←</span> BACK
                            </button>

                            <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
                                {pendingGroups.length === 0 ? (
                                    <div className="text-center py-20 border-2 border-dashed border-(--border-color) rounded-[40px]">
                                        <p className="text-(--text-color-secondary) opacity-40 text-[10px] font-black tracking-[0.3em] uppercase">No pending items found</p>
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
                                                    className="flex justify-between items-center p-5 rounded-[32px] bg-(--glass-bg) border border-(--border-color) hover:bg-(--glass-bg) hover:border-(--text-color-secondary)/20 transition-all text-left group"
                                                >
                                                    <div className="flex items-center gap-5">
                                                        <div className="w-12 h-12 rounded-[20px] flex items-center justify-center font-black text-base" style={{ backgroundColor: color, color: getTextColorForBg(color) }}>
                                                            {group.vendorId[0]}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-(--text-color) leading-none mb-1">{group.vendorId}</p>
                                                            <p className="text-[10px] text-(--text-color-secondary) uppercase tracking-widest leading-none">{group.items.length} items · {paidPerc > 0 ? `${paidPerc}% Paid` : 'Unpaid'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-mono font-black text-(--text-color) leading-none mb-1">{fmtMXN(group.total - group.paidTotal)}</p>
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
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight text-center">OPERATING COSTS</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-10 uppercase tracking-widest font-bold text-center">Classify the administrative cost</p>
                            <button onClick={() => setStep(1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-10 flex items-center gap-3 group transition-all">← BACK</button>

                            <div className="grid grid-cols-2 gap-5 w-full">
                                <button onClick={() => { set('subcategory', 'Monthly'); setStep(4); }}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-(--glass-bg) border border-(--border-color) hover:border-(--text-color-secondary)/30 transition-all group">
                                    <div className="w-16 h-16 mb-5 rounded-full border border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 opacity-50 text-(--text-color-secondary)"><use href="#calendar" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-(--text-color) uppercase tracking-widest">MONTHLY FIXED</span>
                                    <span className="text-[8px] text-(--text-color-secondary) font-bold mt-2 uppercase leading-tight text-center">Recurring bills<br />& subscriptions</span>
                                </button>
                                <button onClick={() => { setStep(3.2); }}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-(--glass-bg) border border-(--border-color) hover:border-(--text-color-secondary)/30 transition-all group">
                                    <div className="w-16 h-16 mb-5 rounded-full border border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 opacity-50 text-(--text-color-secondary)"><use href="#file" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black text-(--text-color) uppercase tracking-widest">VARIABLE COST</span>
                                    <span className="text-[8px] text-(--text-color-secondary) font-bold mt-2 uppercase leading-tight text-center">One-time operational<br />expenditure</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stage 3.2: Expense Categories */}
                    {step === 3.2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight">CATEGORIES</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-8 uppercase tracking-widest font-bold">Select expense department</p>
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
                                            className="flex flex-col items-start p-7 rounded-[32px] bg-(--glass-bg) border border-(--border-color) hover:border-(--main-color)/40 hover:bg-(--main-color)/5 transition-all group"
                                        >
                                            <div className="w-12 h-12 mb-4 rounded-full border border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform group-hover:border-(--main-color)/30">
                                                <svg className="w-6 h-6 opacity-30 text-(--text-color-secondary) group-hover:opacity-100 group-hover:text-(--main-color) transition-all">
                                                    <use href={labels[cat].i} />
                                                </svg>
                                            </div>
                                            <span className="text-[12px] font-black text-(--text-color) uppercase tracking-widest">{labels[cat].t}</span>
                                            <span className="text-[8px] text-(--text-color-secondary) font-bold mt-1 uppercase leading-none">{labels[cat].s}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Stage 4: Final Form */}
                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-2 uppercase tracking-tight">DETAILS</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-10 uppercase tracking-widest font-bold">Specify payment details for {form.subcategory}</p>

                            <div className="flex flex-col gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">DESCRIPTION</label>
                                    <input value={form.description} onChange={e => set('description', e.target.value)}
                                        className="w-full h-16 px-6 rounded-[24px] bg-(--glass-bg) border border-(--border-color) text-(--text-color) placeholder:text-(--text-color-secondary)/30 focus:border-(--main-color)/50 transition-all outline-none" placeholder="Brief summary of payment" />
                                </div>

                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-3">
                                        <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">AMOUNT (MXN)</label>
                                        <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                                            className="w-full h-16 px-6 font-mono text-xl font-bold bg-(--glass-bg) border border-(--border-color) rounded-[24px] text-(--text-color) outline-none focus:border-(--main-color)/50 transition-all" placeholder="0.00" />
                                    </div>
                                    {normalizeSubcat(form.subcategory) === 'Monthly' ? (
                                        <div className="space-y-3">
                                            <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">RECURRING DAY</label>
                                            <input type="number" min="1" max="31" value={form.recurring_day} onChange={e => { set('recurring_day', parseInt(e.target.value)); set('recurring', true); }}
                                                className="w-full h-16 px-6 font-mono text-xl font-bold bg-(--glass-bg) border border-(--border-color) rounded-[24px] text-(--text-color) outline-none focus:border-(--main-color)/50 transition-all" />
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">REFERENCE</label>
                                            <input value={form.reference} onChange={e => set('reference', e.target.value)}
                                                className="w-full h-16 px-6 rounded-[24px] bg-(--glass-bg) border border-(--border-color) text-(--text-color) placeholder:text-(--text-color-secondary)/30 outline-none focus:border-(--main-color)/50 transition-all" placeholder="Optional #" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-5 mt-16">
                                <button onClick={() => {
                                    if (form.vendor_id) setStep(3.1);
                                    else if (['Sppl', 'Labr', 'Pack', 'Oprt'].includes(form.subcategory)) setStep(3.2);
                                    else setStep(2.2);
                                }} className="flex-1 py-5 border border-(--border-color) text-(--text-color-secondary) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--glass-bg) transition-all">BACK</button>
                                <button onClick={() => {
                                    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount');
                                    setStep(5);
                                }} className="flex-1 py-5 bg-(--main-color)/15 text-(--text-color) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--main-color)/25 transition-all">CONTINUE</button>
                            </div>
                        </div>
                    )}

                    {/* Stage 5: Account Selection */}
                    {step === 5 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight">SOURCE</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-8 uppercase tracking-widest font-bold">Select payment disbursement account</p>

                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(destinationsConfig).map(([key, cfg]) => {
                                    const amt = parseFloat(form.amount) || 0;
                                    const comm = cfg.calculateCommission(amt);
                                    const iva = (key === PaymentDestination.BBVA_Ramses) ? calculateIVA(amt) : 0;
                                    const totalExtra = comm + iva;

                                    return (
                                        <button key={key} type="button"
                                            onClick={() => set('destination', key as PaymentDestination)}
                                            className={`flex flex-col items-center gap-3 p-6 rounded-[32px] border-2 transition-all ${form.destination === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-(--border-color) bg-(--glass-bg) hover:border-(--text-color-secondary)/30'}`}
                                        >
                                            <img src={cfg.icon} alt={cfg.name} className="h-10 w-auto object-contain mb-1" />
                                            <div className="text-center">
                                                <div className="text-[11px] font-black text-(--text-color) uppercase tracking-widest opacity-80">{cfg.name}</div>
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

                            <div className="mt-10 p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color)">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-black text-(--text-color-secondary) uppercase tracking-[0.3em]">TOTAL TRANSACTION</span>
                                    <span className="text-xs font-mono text-(--text-color-secondary)">{fmtMXN(parseFloat(form.amount) || 0)} BASE</span>
                                </div>
                                <div className="text-4xl font-mono font-black text-(--text-color) tracking-tighter">
                                    {form.destination ? fmtMXN((parseFloat(form.amount) || 0) + destinationsConfig[form.destination].calculateCommission(parseFloat(form.amount) || 0) + (form.destination === PaymentDestination.BBVA_Ramses ? calculateIVA(parseFloat(form.amount) || 0) : 0)) : '—'}
                                </div>
                            </div>

                            <div className="flex gap-5 mt-10">
                                <button onClick={() => setStep(4)} className="flex-1 py-5 border border-(--border-color) text-(--text-color-secondary) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--glass-bg) transition-all">BACK</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4" onClick={onClose}>
            <div className="bg-(--c1) border border-(--border-color) rounded-[40px] w-full max-w-[500px] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                <div className="px-10 pt-10 flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-black text-(--text-color) uppercase tracking-tight">
                            {paidPerc > 0 && percentage === 100 ? 'LIQUIDATE BALANCE' : 'PAYMENT REQUEST'}
                        </h3>
                        <p className="text-[10px] text-(--text-color-secondary) uppercase tracking-widest font-bold mt-1">FOR {group.vendorId}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-(--glass-bg) flex items-center justify-center text-(--text-color-secondary) hover:text-(--text-color) transition-all text-sm">✕</button>
                </div>

                <div className="px-10 pb-10">
                    <div className="flex flex-col gap-6">
                        {/* Status Summary */}
                        <div className="flex justify-between items-end p-6 rounded-[32px] bg-(--glass-bg) border border-(--border-color)">
                            <div>
                                <p className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-[0.2em] mb-1">CONTRACT TOTAL</p>
                                <p className="text-2xl font-mono font-black text-(--text-color)">{fmtMXN(group.total)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-[0.2em] mb-1">STAKEHOLDERS</p>
                                <p className="text-xs font-black text-(--text-color) uppercase tracking-widest">{group.items.length} ITEMS</p>
                            </div>
                        </div>

                        {/* Progress Tracker */}
                        <div className="bg-(--glass-bg) rounded-[32px] p-6 border border-(--border-color)">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">PAYMENT ARCHITECTURE</span>
                                <span className="text-[10px] font-mono font-black text-(--text-color)">{paidPerc}% COMPLETE</span>
                            </div>
                            <div className="h-3 w-full bg-(--border-color) rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-(--border-color)">
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
                                    <label className="text-[10px] font-black text-(--text-color-secondary) uppercase tracking-widest leading-none">TARGET PERCENTAGE</label>
                                    <span className="text-xl font-mono font-black text-(--main-color) leading-none">{percentage}%</span>
                                </div>
                                <input type="range" min={Math.max(10, paidPerc + 5)} max="100" step="5" value={percentage} onChange={e => setPercentage(parseInt(e.target.value))}
                                    className="w-full h-2 bg-(--border-color) rounded-full appearance-none cursor-pointer accent-(--main-color) mb-4" />

                                <div className="p-5 rounded-[24px] bg-(--main-color)/5 border border-(--main-color)/10 text-center">
                                    <p className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.3em] mb-1">AMOUNT TO DISBURSE</p>
                                    <p className="text-3xl font-mono font-black text-(--text-color)">{fmtMXN(amountToRequest)}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 rounded-[32px] bg-(--glass-bg) border border-(--border-color) text-center">
                                <p className="text-[10px] font-black text-(--text-color-secondary) uppercase tracking-[0.3em] mb-2">FULL PAYMENT REQUIRED</p>
                                <p className="text-3xl font-mono font-black text-(--text-color)">{fmtMXN(amountToRequest)}</p>
                            </div>
                        )}

                        {/* Destination Picker */}
                        <div className="grid grid-cols-4 gap-2">
                            {Object.entries(destinationsConfig).map(([key, cfg]) => (
                                <button key={key} type="button" onClick={() => setDest(key as PaymentDestination)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${dest === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-(--border-color) bg-(--glass-bg) hover:border-(--text-color-secondary)/30'}`}>
                                    <img src={cfg.icon} alt={cfg.name} className="h-7 w-auto grayscale group-hover:grayscale-0 transition-all opacity-40 hover:opacity-100" />
                                    <span className="text-[8px] font-black text-(--text-color-secondary) uppercase tracking-tighter text-center leading-tight">{cfg.name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-4 mt-2">
                            <button onClick={onClose} className="flex-1 py-5 border border-(--border-color) text-(--text-color-secondary) rounded-[24px] text-[10px] font-black tracking-widest hover:bg-(--glass-bg) transition-all">CANCEL</button>
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
    const [overviewMode, setOverviewMode] = useAtom(paymentsOverviewModeAtom);
    const [liveExchangeRate, setLiveExchangeRate] = useState<number | null>(null);

    useEffect(() => {
        fetch('https://open.er-api.com/v6/latest/USD')
            .then(r => r.json())
            .then(d => { if (d?.rates?.MXN) setLiveExchangeRate(d.rates.MXN); })
            .catch(() => { });
    }, []);

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
                const subcatValue = normalizeSubcat(r.subcategory || r.category || '');
                const subcat = subcatFilter === 'All' || subcatValue === subcatFilter;
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
                    for (const id of ids) {
                        try {
                            const localDoc = await db.inventory.findOne({ selector: { id } }).exec();
                            if (localDoc) await localDoc.patch({ pay_req: `requested ${percentage}%` });
                        } catch (e) { }
                    }
                } else {
                    await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
                    for (const id of ids) {
                        try {
                            const localDoc = await db.inventory.findOne({ selector: { id } }).exec();
                            if (localDoc) await localDoc.patch({ pay_req: true });
                        } catch (e) { }
                    }
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
        if (error) {
            toast.error(error.message);
        } else {
            try {
                const localDoc = await db.finance.findOne({ selector: { id } }).exec();
                if (localDoc) await localDoc.remove();
            } catch (e) {
                console.error('Error removing local doc', e);
            }
            toast.success('Payment deleted');
            setPaymentsVersion(v => v + 1);
            onRefresh();
        }
    };

    const [showFilters, setShowFilters] = useState(false);
    const [isBubblesCollapsed, setIsBubblesCollapsed] = useState(false);
    const [expandedBubble, setExpandedBubble] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    const handleToggleStatus = async (r: any) => {
        const next = r.status === 'Requested' ? 'Paid' : 'Requested';
        const updatePayload = {
            status: next,
            pay_date: next === 'Paid' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase.from('finance').update(updatePayload).eq('id', r.id);

        if (error) {
            toast.error(error.message);
        } else {
            try {
                const localDoc = await db.finance.findOne({ selector: { id: r.id } }).exec();
                if (localDoc) await localDoc.patch(updatePayload);
            } catch (e) {
                console.error('Error patching local doc', e);
            }

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
            setPaymentsVersion(v => v + 1);
            onRefresh();
        }
    };

    // Summary by subcategory
    const subcatTotals = useMemo(() => {
        const m: Record<string, number> = {};
        docs.forEach(d => { const k = normalizeSubcat(d.subcategory || d.category); m[k] = (m[k] || 0) + (d.amount || 0); });
        return m;
    }, [docs]);

    const statusTotals = useMemo(() => {
        const m: Record<string, number> = { Requested: 0, Pending: 0, Paid: 0 };
        docs.forEach(d => {
            const s = d.status || 'Requested';
            if (s === 'Paid') m.Paid += d.amount || 0;
            else if (s === 'Requested') m.Requested += d.amount || 0;
            else m.Pending += d.amount || 0;
        });
        return m;
    }, [docs]);

    const activeDestPendingRecords = useMemo(() => {
        return destinationFilter !== 'All'
            ? docs.filter(d => d.destination === destinationFilter && (d.status === 'Requested' || !d.status))
            : [];
    }, [docs, destinationFilter]);

    const activeDestReqNetMXN = useMemo(() => {
        return activeDestPendingRecords.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
    }, [activeDestPendingRecords]);

    const activeDestReqNetUSD = activeDestReqNetMXN / (liveExchangeRate || exchangeRate);

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

            {/* ── General Overview ── */}
            {overviewMode !== 'collapsed' && (
                <div className={`flex flex-col shrink-0 border-b border-white/10 bg-black/20 ${overviewMode === 'extended' ? 'p-6' : 'p-3'} transition-all duration-300 relative`}>
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                            {/* Exchange Rates inline */}
                            <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5 shadow-inner">
                                <span className="text-[10px] uppercase font-black tracking-widest text-(--text-color-secondary)">Rates</span>
                                <div className="h-4 w-px bg-white/10" />
                                <span className="text-xs font-mono font-bold text-[#FACC15]" title="Book Rate">Workbook {exchangeRate.toFixed(2)}</span>
                                <div className="h-4 w-px bg-white/10" />
                                <span className="text-xs font-mono font-bold text-[#6BCEBB]" title="Live Rate">Internet {liveExchangeRate ? liveExchangeRate.toFixed(2) : '...'}</span>
                            </div>

                            {/* Dynamic Pending Net Total for Active Destination */}
                            {destinationFilter !== 'All' && activeDestReqNetMXN > 0 && (
                                <div className="flex items-center gap-3 px-4 py-1.5 bg-(--main-color)/10 border border-(--main-color)/30 rounded-xl animate-in fade-in zoom-in-95 shrink-0 shadow-inner">
                                    <span className="text-[9px] font-black text-(--main-color) uppercase tracking-[0.2em]">
                                        PENDING REQ
                                    </span>
                                    <div className="h-4 w-px bg-(--main-color)/20" />
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[13px] font-mono font-black text-(--text-color)">
                                            {fmtMXN(activeDestReqNetMXN)}
                                        </span>
                                        <span className="text-[10px] font-mono font-bold text-(--main-color)/70">
                                            ≈ ${activeDestReqNetUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setOverviewMode('extended')} className={`p-1.5 py-1 rounded-lg border transition-all text-[9px] font-black uppercase tracking-widest ${overviewMode === 'extended' ? 'bg-(--main-color)/20 border-(--main-color) text-(--main-color)' : 'border-white/10 text-white/30 hover:text-white/60'}`}>Full</button>
                            <button onClick={() => setOverviewMode('minimal')} className={`p-1.5 py-1 rounded-lg border transition-all text-[9px] font-black uppercase tracking-widest ${overviewMode === 'minimal' ? 'bg-(--main-color)/20 border-(--main-color) text-(--main-color)' : 'border-white/10 text-white/30 hover:text-white/60'}`}>Min</button>
                            <button onClick={() => setOverviewMode('collapsed')} className="p-1.5 py-1 rounded-lg border border-white/10 text-white/30 hover:bg-white/10 hover:text-white/60 transition-all text-[9px] font-black uppercase tracking-widest">Hide</button>
                        </div>
                    </div>

                    {/* ─── EXTENDED VIEW ─── */}
                    {overviewMode === 'extended' && (
                        <div className="flex gap-4 items-stretch">
                            {/* Payment Summary panel — Paid & Requested only, MXN + USD side by side */}
                            <div className="flex flex-col justify-center gap-2.5 p-4 bg-white/5 border border-white/10 rounded-2xl shrink-0">
                                <div className="flex items-baseline gap-3">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-[#6BCEBB]/60 w-10">Paid</span>
                                    <span className="text-sm font-mono font-black text-[#6BCEBB]">{fmtMXN(statusTotals.Paid || 0)}</span>
                                    <span className="text-sm font-mono font-black text-[#6BCEBB]/40">≈ ${((statusTotals.Paid || 0) / (liveExchangeRate || exchangeRate)).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</span>
                                </div>
                                <div className="flex items-baseline gap-3">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-[#FACC15]/60 w-10">Req</span>
                                    <span className="text-sm font-mono font-black text-[#FACC15]">{fmtMXN(statusTotals.Requested || 0)}</span>
                                    <span className="text-sm font-mono font-black text-[#FACC15]/40">≈ ${((statusTotals.Requested || 0) / (liveExchangeRate || exchangeRate)).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</span>
                                </div>
                            </div>

                            {/* Add Payment button + Vendor request cards inline */}
                            <div className="flex-1 overflow-x-auto flex items-center gap-3 custom-scrollbar pr-2 pb-2">
                                <button onClick={() => setShowAdd(true)}
                                    className="shrink-0 rounded-2xl flex flex-col items-center justify-center gap-2 p-3 min-w-[100px] h-full bg-(--main-color)/10 hover:bg-(--main-color)/20 border border-(--main-color)/30 text-(--main-color) cursor-pointer hover:-translate-y-1 transition-all shadow-lg">
                                    <svg className="w-6 h-6 shrink-0"><use href="#plus" /></svg>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-center leading-tight">Add<br />Payment</span>
                                </button>
                                {pendingGroups.map(group => {
                                    const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#2a2a3e';
                                    const isProd = group.items.some(i => i.data.status?.toLowerCase() === 'production');
                                    const paidPerc = Math.round((group.paidTotal / group.total) * 100);

                                    return (
                                        <div key={group.vendorId}
                                            onClick={() => setRequestGroup(group)}
                                            className="shrink-0 rounded-2xl flex flex-col justify-between p-3 min-w-[150px] cursor-pointer hover:-translate-y-1 transition-transform border border-white/10 shadow-lg bg-black/20"
                                            style={{ borderTopColor: color }}>
                                            <div className="flex justify-between items-center mb-1">
                                                <p className="font-black text-[11px] uppercase tracking-wider" style={{ color }}>{group.vendorId}</p>
                                                <span className="text-[9px] font-mono font-bold bg-white/10 text-(--text-color) px-1.5 py-0.5 rounded">{group.items.length} ITM</span>
                                            </div>
                                            <p className="font-mono font-black text-sm text-(--text-color)">{fmtMXN(group.total)}</p>
                                            {isProd && paidPerc > 0 ? (
                                                <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden mt-2">
                                                    <div className="h-full bg-(--main-color)" style={{ width: `${paidPerc}%` }} />
                                                </div>
                                            ) : (
                                                <div className="text-[9px] font-black tracking-widest uppercase opacity-70 mt-2 text-(--text-color-secondary)">Request Payment</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ─── MINIMAL VIEW ─── */}
                    {overviewMode === 'minimal' && (
                        <div className="flex items-center gap-4">
                            {/* Compact totals */}
                            <div className="flex items-center gap-4 p-3 bg-white/5 border border-white/10 rounded-2xl">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary)">Paid</span>
                                    <span className="text-sm font-mono font-black text-[#6BCEBB]">{fmtMXN(statusTotals.Paid || 0)}</span>
                                </div>
                                <div className="w-px h-6 bg-white/10" />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-(--text-color-secondary)">Req</span>
                                    <span className="text-sm font-mono font-black text-[#FACC15]">{fmtMXN((statusTotals.Requested || 0) + (statusTotals.Pending || 0))}</span>
                                </div>
                            </div>

                            {/* Add payment button */}
                            <button onClick={() => setShowAdd(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-(--main-color)/10 hover:bg-(--main-color)/20 border border-(--main-color)/30 text-(--main-color) rounded-xl transition-all shadow-sm hover:scale-105 active:scale-95">
                                <svg className="w-4 h-4 flex-shrink-0"><use href="#plus" /></svg>
                                <span className="text-[9px] font-black uppercase tracking-widest">Add</span>
                            </button>

                            {/* Vendor color-coded bubbles */}
                            {pendingGroups.length > 0 && (
                                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar no-scrollbar">
                                    {pendingGroups.map(group => {
                                        const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#555';
                                        const isProd = group.items.some(i => i.data.status?.toLowerCase() === 'production');
                                        const paidPerc = group.total > 0 ? Math.round((group.paidTotal / group.total) * 100) : 0;
                                        return (
                                            <div key={group.vendorId}
                                                onClick={() => setRequestGroup(group)}
                                                title={`${group.vendorId}: ${fmtMXN(group.total)}${isProd && paidPerc > 0 ? ` (${paidPerc}% paid)` : ''}`}
                                                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-all shadow-lg border-2 relative group/bubble"
                                                style={{ backgroundColor: color, borderColor: `${color}80` }}>
                                                <span className="text-[8px] font-black text-black leading-none">
                                                    {isProd && paidPerc > 0 ? `${paidPerc}%` : fmtMXN(group.total).replace('MXN', '').replace('$', '').trim().split('.')[0]}
                                                </span>
                                                {/* Progress ring for production items */}
                                                {isProd && paidPerc > 0 && (
                                                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                                                        <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
                                                        <circle cx="18" cy="18" r="16" fill="none" stroke="white" strokeWidth="2"
                                                            strokeDasharray={`${paidPerc} ${100 - paidPerc}`} strokeLinecap="round" />
                                                    </svg>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Payments Details Section ── */}
            <div className="flex-1 flex flex-col min-h-0 bg-(--glass-bg)">
                {/* Header/Controls below general overview */}
                <div className="flex items-center justify-between p-4 border-b border-(--border-color) shrink-0 bg-black/5 dark:bg-black/10">
                    <div className="flex items-center gap-4">

                        {/* Filters embedded here */}
                        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
                            {SUBCATEGORIES.map(s => (
                                <button key={s} onClick={() => setSubcatFilter(s)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all ${subcatFilter === s ? 'bg-(--main-color) text-black shadow-md' : 'bg-white/5 text-(--text-color-secondary) hover:text-(--text-color) border border-transparent hover:border-white/10'}`}>
                                    {s.toUpperCase()}
                                </button>
                            ))}
                        </div>

                    </div>

                    <div className="flex items-center gap-2">
                        {/* Destination Picker — stacked card animation */}
                        <div className="flex items-center justify-center relative h-14 px-2 mt-4">
                            {Object.entries(destinationsConfig).map(([key, cfg], idx, arr) => {
                                const isActive = destinationFilter === key;
                                const total = arr.length;
                                const offset = idx - (total - 1) / 2;
                                const spread = isActive ? -8 : Math.pow(offset, 2) * 2;
                                const rotation = isActive ? 0 : offset * 6;

                                return (
                                    <button key={key} onClick={() => setDestinationFilter(destinationFilter === key ? 'All' : key as PaymentDestination)}
                                        className={`p-0 bg-transparent border-none transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-pointer outline-none relative ${isActive ? 'scale-150 z-20 mx-4 brightness-125 drop-shadow-2xl' : 'opacity-70 hover:opacity-100 -mx-2.5 hover:scale-125 hover:-translate-y-2 hover:z-30'}`}
                                        style={{
                                            transform: `translateY(${spread}px) rotate(${rotation}deg)`,
                                            zIndex: isActive ? 40 : 10 - Math.abs(offset),
                                        }}
                                        title={cfg.name}>

                                        <img src={cfg.icon} alt={cfg.name} className={`h-9 w-auto object-contain transition-all drop-shadow-lg`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Data dense table */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-(--glass-bg) z-10 backdrop-blur-3xl shadow-sm">
                            <tr className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary) bg-black/5 dark:bg-black/20 border-b border-(--border-color)">
                                <th className="px-5 py-3 border-r border-white/5">Date</th>
                                <th className="px-3 py-3 border-r border-white/5 text-center">Acc</th>
                                <th className="px-3 py-3 border-r border-white/5 text-center">Cat</th>
                                <th className="px-5 py-3 border-r border-white/5">Desc</th>
                                <th className="px-3 py-3 border-r border-white/5 text-center">Vend</th>
                                <th className="px-5 py-3 border-r border-white/5 text-right">Amount</th>
                                <th className="px-5 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-(--border-color)">
                            {filtered.map(r => {
                                const isExpanded = expandedRow === r.id;
                                const relatedIds = r.related_ids || (r.related_inventory_ids ? r.related_inventory_ids.split(',').map((s: string) => s.trim()) : []);
                                const totalNet = (r.amount || 0) + (r.commission || 0);
                                const totalUSD = totalNet / (liveExchangeRate || exchangeRate);

                                return (
                                    <React.Fragment key={r.id}>
                                        <tr
                                            onClick={(e) => {
                                                // Prevent toggling if a button inside the row was clicked
                                                if ((e.target as HTMLElement).closest('button')) return;
                                                setExpandedRow(isExpanded ? null : r.id);
                                            }}
                                            className={`hover:bg-black/5 dark:hover:bg-white/5 transition-all group cursor-pointer ${isExpanded ? 'bg-black/5 dark:bg-white/5' : ''}`}>
                                            <td className="px-5 py-3 font-mono text-[10px] text-(--text-color-secondary) whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <svg className={`w-3 h-3 transition-transform text-(--text-color-secondary) ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                                                    {fmtDate(r.date)}{r.recurring && <span className="text-[#F7941D] ml-1" title={`Day ${r.recurring_day}`}>↻</span>}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                {r.destination && destinationsConfig[r.destination as PaymentDestination] ? (
                                                    <img src={destinationsConfig[r.destination as PaymentDestination].icon}
                                                        alt={r.destination} title={destinationsConfig[r.destination as PaymentDestination].name}
                                                        className="h-5 mx-auto w-auto object-contain drop-shadow-sm" />
                                                ) : <span className="text-(--text-color-secondary) text-[9px]">—</span>}
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="px-2 py-0.5 rounded-[4px] text-[9px] font-black bg-black/10 dark:bg-white/10 text-(--text-color)">
                                                    {normalizeSubcat(r.subcategory || r.category)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-xs font-medium text-(--text-color) max-w-[250px] truncate">{r.description || r.notes || '—'}</td>
                                            <td className="px-3 py-3 text-center">
                                                {r.vendor_id ? (
                                                    <span className="px-2 py-1 rounded-[4px] text-[9px] font-black shadow-sm"
                                                        style={{ backgroundColor: vendors[r.vendor_id as keyof typeof vendors]?.color || '#555', color: getTextColorForBg(vendors[r.vendor_id as keyof typeof vendors]?.color || '#555') }}>
                                                        {r.vendor_id}
                                                    </span>
                                                ) : <span className="text-(--text-color-secondary) text-[9px]">—</span>}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <span className="font-mono text-sm font-black text-(--text-color)">{fmtMXN(r.amount)}</span>
                                                {(r.commission || 0) > 0 && <span className="text-(--text-color-secondary) font-mono text-[9px] block">+{fmtMXN(r.commission)} fee</span>}
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center justify-center gap-3">
                                                    <button onClick={() => handleToggleStatus(r)}
                                                        className={`min-w-[80px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-sm ${r.status === 'Paid' ? 'bg-[#8DC63F]/20 text-[#8DC63F] border border-[#8DC63F]/50 hover:bg-[#8DC63F]/30' : 'bg-[#FACC15]/20 text-[#FACC15] border border-[#FACC15]/50 hover:bg-[#FACC15]/30'}`}>
                                                        {r.status || 'Requested'}
                                                    </button>
                                                    {(user?.role === 'Admin' || user?.role === 'Developer') && (
                                                        <button onClick={() => handleDeletePayment(r.id)}
                                                            className="w-7 h-7 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all text-xs opacity-0 group-hover:opacity-100" title="Delete record">
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {/* EXPANDED DETAILS PANEL */}
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={7} className="p-0 border-b border-(--border-color)">
                                                    <div className="bg-black/5 dark:bg-black/30 p-4 border-l-2 border-(--main-color) flex flex-wrap gap-x-8 gap-y-4 shadow-inner animate-fade-in relative z-0">

                                                        {/* Financial Detail */}
                                                        <div className="flex flex-col gap-1 min-w-[120px]">
                                                            <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">Total Net</span>
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="font-mono text-sm font-black text-(--text-color)">{fmtMXN(totalNet)}</span>
                                                                <span className="font-mono text-[10px] text-(--text-color-secondary)">≈ ${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                                                            </div>
                                                        </div>

                                                        {/* Dates Detail */}
                                                        <div className="flex flex-col gap-1 min-w-[120px]">
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">Requested</span>
                                                                <span className="font-mono text-[10px] text-(--text-color)">{new Date(r.date || r.created_at).toLocaleDateString()}</span>
                                                            </div>
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">Paid</span>
                                                                <span className="font-mono text-[10px] text-(--text-color)">{r.pay_date ? new Date(r.pay_date).toLocaleDateString() : '—'}</span>
                                                            </div>
                                                        </div>

                                                        {/* Tags Deployable List */}
                                                        {relatedIds.length > 0 && (
                                                            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                                                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">Tags ({relatedIds.length})</span>
                                                                <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto custom-scrollbar pr-2 mt-1">
                                                                    {relatedIds.map((id: string, i: number) => {
                                                                        const invItem = inventory.find(inv => inv.row === id || String(inv.row) === id || (inv.data as any).item_id === id || inv.data.itemId === id);
                                                                        let displayTag = id;
                                                                        if (invItem) {
                                                                            const norm = normalizeInventoryData(invItem.data);
                                                                            const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                                                            displayTag = (calculated.bookBardcode && calculated.bookBardcode !== '-') ? calculated.bookBardcode : (norm.itemNumber ? `#${norm.itemNumber}` : id);
                                                                        } else if (typeof id === 'string' && id.length > 10) {
                                                                            displayTag = id.slice(0, 8) + '...';
                                                                        }
                                                                        return (
                                                                            <span key={i} className="px-1.5 py-0.5 bg-(--glass-bg) border border-(--border-color) rounded font-mono text-[9px] font-black text-(--text-color-secondary)" title={id}>
                                                                                {displayTag}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Notes detail if any */}
                                                        {r.notes && (
                                                            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                                                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">Notes</span>
                                                                <p className="text-[10px] text-(--text-color) font-mono opacity-80 leading-snug">{r.notes}</p>
                                                            </div>
                                                        )}

                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr><td colSpan={7} className="px-4 py-16 text-center text-(--text-color-secondary) text-xs font-black tracking-[0.2em] uppercase">No payment records match criteria</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* SVG Icons for Wizard */}
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
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
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
        </div>
    );
};
