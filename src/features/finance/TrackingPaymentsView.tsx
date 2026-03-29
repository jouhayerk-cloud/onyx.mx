
import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import { PaymentDestination, FinanceRecord, InventoryItem } from '../../lib/Types';
import { vendors, appUsers } from '../../lib/consts';
import { paymentsVersionAtom, userAtom, inventoryAtom, InventoryVersionAtom, paymentDestinationFilterAtom, exchangeRateAtom, paymentsOverviewModeAtom, liveExchangeRateAtom, paymentFilterBarModeAtom, financeSearchTermAtom, logisticsDataAtom, isSyncingAtom, inventoryArtifactConfigAtom, currencyModeAtom } from '../../lib/atoms';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg, calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';
import { 
    Calendar, Box, Users, Archive, Cpu, DollarSign, Activity, Wallet, 
    TrendingUp, Plus, Search, Filter, ArrowUpRight, CheckCircle, 
    Clock, AlertCircle, Info, ChevronDown, ChevronRight, LayoutGrid, List, Trash2
} from 'lucide-react';
import { CurrencyTag } from '@/components/CurrencyTag';
import { InventoryArtifact } from '../inventory/InventoryArtifact';

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
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

const SUBCATEGORIES = ['All', 'Acq', 'Prod', 'Monthly', 'Sppl', 'Labr', 'Packing', 'Oprt'] as const;
type Subcategory = typeof SUBCATEGORIES[number];

type VendorGroup = { vendorId: string; items: InventoryItem[]; total: number; totalQty: number; paidTotal: number };

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
    const finalData = data?.[0];
    if (finalData && db) {
        try {
            await db.finance.insert(finalData);
        } catch (e) {
            console.error('Local finance insert failed', e);
        }
    }
    return data;
};

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
        manualFee: '',
        includeIva: false,
        includeComm: false,
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
                manualFee: '',
                includeIva: false,
                includeComm: false,
            });
        }
    }, [isOpen]);

    const calculateIVA = (amt: number) => amt * 0.16;
    const calculateComm = (amt: number) => amt * 0.10;

    const handleSubmit = async () => {
        const amt = parseFloat(form.amount);
        if (!form.description || isNaN(amt) || amt <= 0 || !form.destination) {
            return toast.error('Fill in description, amount, and select an account.');
        }
        setSaving(true);
        const toastId = toast.loading('Saving…');
        try {
            const manualFeeAmt = parseFloat(form.manualFee) || 0;
            const ivaAmt = form.includeIva ? calculateIVA(amt) : 0;
            const commAmt = form.includeComm ? calculateComm(amt) : 0;
            const commission = manualFeeAmt + ivaAmt + commAmt;

            const isProd = form.subcategory === 'Prod';
            const isPacking = form.subcategory === 'Packing';
            const group = (form.subcategory === 'Acq' || isProd || isPacking) ? pendingGroups.find(g => g.vendorId === form.vendor_id) : null;
            const inventoryItemRows = group ? group.items.map(i => i.row).join(',') : null;
            const ids = inventoryItemRows ? inventoryItemRows.split(',') : [];

            if (ids.length > 0) {
                const isPartial = group && amt < (group.total - group.paidTotal);
                const perc = group ? Math.round(((group.paidTotal + amt) / group.total) * 100) : 100;
                
                if (isPacking) {
                    const upStatus = isPartial ? `requested ${perc}%` : 'true';
                    await supabase.from('logistics').update({ pay_req: upStatus }).in('id', ids);
                    if (db) {
                        for (const iid of ids) {
                            try {
                                const lLog = await db.logistics.findOne({ selector: { id: iid } }).exec();
                                if (lLog) await lLog.patch({ pay_req: upStatus });
                            } catch (e) { console.error(e); }
                        }
                    }
                } else if (isProd && isPartial) {
                    const up = { pay_req: `requested ${perc}%`, notes: `Partial payment of ${amt} recorded.` };
                    await supabase.from('inventory').update(up).in('id', ids);
                    if (db) {
                        for (const iid of ids) {
                            try {
                                const lInv = await db.inventory.findOne({ selector: { id: iid } }).exec();
                                if (lInv) await lInv.patch({ ...up, payReq: up.pay_req });
                            } catch (e) { console.error(e); }
                        }
                    }
                } else {
                    await supabase.from('inventory').update({ pay_req: 'true' }).in('id', ids);
                    if (db) {
                        for (const iid of ids) {
                            try {
                                const lInv = await db.inventory.findOne({ selector: { id: iid } }).exec();
                                if (lInv) await lInv.patch({ pay_req: 'true', payReq: 'true' });
                            } catch (e) { console.error(e); }
                        }
                    }
                }
            }

            await appendExpense({
                ...form,
                amount: amt,
                commission,
                inventoryItemRows: (form.subcategory === 'Acq' && !form.vendor_id.includes('%')) ? inventoryItemRows : null,
                linkedRows: (form.subcategory === 'Prod' || form.subcategory === 'Packing' || form.vendor_id.includes('%')) ? inventoryItemRows : null
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
            <div className="bg-(--c1) border border-(--border-color) rounded-[40px] w-full max-w-[600px] max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Progress Header */}
                <div className="px-6 md:px-10 pt-8 pb-4 flex justify-between items-center shrink-0">
                    <div className="flex gap-2">
                        {[1, 2, 3, 4, 5, 6].map(s => (
                            <div key={s} className={`h-1 rounded-full transition-all duration-500 ${step >= s ? 'w-8 bg-(--main-color)' : 'w-4 bg-(--border-color)'}`} />
                        ))}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-(--glass-bg) flex items-center justify-center text-(--text-color-secondary) hover:text-(--text-color) transition-all text-sm">✕</button>
                </div>

                <div className="px-6 md:px-10 pb-10 flex flex-col flex-1 overflow-y-auto custom-scrollbar min-h-[460px]">
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
                            <button onClick={() => setStep(form.subcategory === 'Packing' ? 2.2 : 2.1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-8 flex items-center gap-3 group transition-all">
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
                                            if (form.subcategory === 'Packing') return g.vendorId === 'Crates';
                                            if (g.vendorId === 'Crates') return false; // Hide from Acq/Prod
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
                                                        if (form.subcategory === 'Packing') {
                                                            const sizesSet = new Set(group.items.map(i => {
                                                                const d = i.data as any;
                                                                return `${d.l_cm || 0}x${d.w_cm || 0}x${d.d_cm || 0}`;
                                                            }));
                                                            set('description', `Payment for ${group.items.length} Crates. Sizes: ${Array.from(sizesSet).join(', ')}`);
                                                        } else {
                                                            set('description', `${paidPerc > 0 ? 'Liquidation' : 'Payment'} for ${group.items.length} items from ${group.vendorId}`);
                                                        }
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

                            <div className="grid grid-cols-3 gap-5 w-full">
                                <button onClick={() => { set('subcategory', 'Monthly'); setStep(4); }}
                                    className="flex flex-col items-center p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color) hover:border-(--text-color-secondary)/30 transition-all group">
                                    <div className="w-14 h-14 mb-4 rounded-full border border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-7 h-7 opacity-50 text-(--text-color-secondary)"><use href="#calendar" /></svg>
                                    </div>
                                    <span className="text-[10px] font-black text-(--text-color) uppercase tracking-widest text-center">MONTHLY FIXED</span>
                                    <span className="text-[8px] text-(--text-color-secondary) font-bold mt-2 uppercase leading-tight text-center">Recurring bills<br />& subscriptions</span>
                                </button>
                                <button onClick={() => { 
                                    set('subcategory', 'Packing');
                                    setStep(3.1);
                                }}
                                    className="flex flex-col items-center p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color) hover:border-[#8DC63F]/50 hover:bg-[#8DC63F]/5 transition-all group">
                                    <div className="w-14 h-14 mb-4 rounded-full border border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-7 h-7 opacity-50 text-[#8DC63F]"><use href="#pkg" /></svg>
                                    </div>
                                    <span className="text-[10px] font-black text-(--text-color) uppercase tracking-widest text-center">CRATES</span>
                                    <span className="text-[8px] text-(--text-color-secondary) font-bold mt-2 uppercase leading-tight text-center">Material Packing<br />& Shipments</span>
                                </button>
                                <button onClick={() => { setStep(3.2); }}
                                    className="flex flex-col items-center p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color) hover:border-(--text-color-secondary)/30 transition-all group">
                                    <div className="w-14 h-14 mb-4 rounded-full border border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-7 h-7 opacity-50 text-(--text-color-secondary)"><use href="#file" /></svg>
                                    </div>
                                    <span className="text-[10px] font-black text-(--text-color) uppercase tracking-widest text-center">OTHER</span>
                                    <span className="text-[8px] text-(--text-color-secondary) font-bold mt-2 uppercase leading-tight text-center">Variable operations<br />expenditure</span>
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
                                {['Sppl', 'Labr', 'Packing', 'Oprt'].map(cat => {
                                    const labels: Record<string, { t: string, s: string, i: string }> = {
                                        Sppl: { t: 'SUPPLIES', s: 'Equipment & tools', i: '#hammer' },
                                        Labr: { t: 'LABOR', s: 'Workforce payments', i: '#user' },
                                        Packing: { t: 'PACKAGING', s: 'Shipping materials', i: '#label' },
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
                                    if (form.subcategory === 'Packing' && form.vendor_id === 'Crates') setStep(2.2);
                                    else if (form.vendor_id) setStep(3.1);
                                    else if (['Sppl', 'Labr', 'Packing', 'Oprt'].includes(form.subcategory)) setStep(3.2);
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
                                    return (
                                        <button key={key} type="button"
                                            onClick={() => set('destination', key as PaymentDestination)}
                                            className={`flex flex-col items-center gap-3 p-6 rounded-[32px] border-2 transition-all ${form.destination === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-(--border-color) bg-(--glass-bg) hover:border-(--text-color-secondary)/30'}`}
                                        >
                                            <img src={cfg.icon} alt={cfg.name} className="h-10 w-auto object-contain mb-1" />
                                            <div className="text-center">
                                                <div className="text-[11px] font-black text-(--text-color) uppercase tracking-widest opacity-80">{cfg.name}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-5 mt-16">
                                <button onClick={() => setStep(4)} className="flex-1 py-5 border border-(--border-color) text-(--text-color-secondary) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--glass-bg) transition-all">BACK</button>
                                <button onClick={() => setStep(6)} disabled={!form.destination}
                                    className="flex-[1.5] py-5 bg-(--main-color)/15 text-(--text-color) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--main-color)/25 transition-all outline-none">
                                    CONTINUE TO TAXES
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stage 6: Taxes & Fees */}
                    {step === 6 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight">ADJUSTMENTS</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-10 uppercase tracking-widest font-bold">Optional taxes and transaction fees</p>

                            <div className="flex flex-col gap-10">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between p-6 rounded-[32px] bg-(--glass-bg) border border-(--border-color)">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-(--text-color) uppercase tracking-widest">ADD 16% IVA</span>
                                        <span className="text-[9px] text-(--text-color-secondary) font-bold uppercase mt-1">Value added tax calculation</span>
                                    </div>
                                    <button onClick={() => {
                                        set('includeIva', !form.includeIva);
                                        if (!form.includeIva) set('includeComm', false);
                                    }}
                                        className={`w-14 h-8 rounded-full transition-all relative ${form.includeIva ? 'bg-green-500' : 'bg-white/10'}`}>
                                        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${form.includeIva ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-6 rounded-[32px] bg-(--glass-bg) border border-(--border-color)">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-(--text-color) uppercase tracking-widest">BANK COMISION (10%)</span>
                                        <span className="text-[9px] text-(--text-color-secondary) font-bold uppercase mt-1">Platform & transfer fees</span>
                                    </div>
                                    <button onClick={() => {
                                        set('includeComm', !form.includeComm);
                                        if (!form.includeComm) set('includeIva', false);
                                    }}
                                        className={`w-14 h-8 rounded-full transition-all relative ${form.includeComm ? 'bg-[#00AEEF]' : 'bg-white/10'}`}>
                                        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${form.includeComm ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4 pt-6">
                                    <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">MANUAL COMMISSION / FEE (MXN)</label>
                                    <input type="number" step="0.01" value={form.manualFee} onChange={e => set('manualFee', e.target.value)}
                                        className="w-full h-16 px-6 font-mono text-xl font-bold bg-(--glass-bg) border border-(--border-color) rounded-[24px] text-(--text-color) outline-none focus:border-(--main-color)/50 transition-all" placeholder="0.00" />
                                </div>

                                <div className="p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color)">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black text-(--text-color-secondary) uppercase tracking-[0.3em]">PAYMENT SUMMARY</span>
                                        <span className="text-xs font-mono text-(--text-color-secondary)">{fmtMXN(parseFloat(form.amount) || 0)} BASE</span>
                                    </div>
                                    <div className="text-4xl font-mono font-black text-(--text-color) tracking-tighter">
                                        {fmtMXN((parseFloat(form.amount) || 0) + (parseFloat(form.manualFee) || 0) + (form.includeIva ? calculateIVA(parseFloat(form.amount) || 0) : 0) + (form.includeComm ? calculateComm(parseFloat(form.amount) || 0) : 0))}
                                    </div>
                                    <div className="flex gap-4 mt-3 opacity-60">
                                        {form.includeIva && <span className="text-[9px] font-black uppercase tracking-widest text-[#8DC63F]">+ IVA {fmtMXN(calculateIVA(parseFloat(form.amount) || 0))}</span>}
                                        {form.includeComm && <span className="text-[9px] font-black uppercase tracking-widest text-[#00AEEF]">+ BNK {fmtMXN(calculateComm(parseFloat(form.amount) || 0))}</span>}
                                        {(parseFloat(form.manualFee) || 0) > 0 && <span className="text-[9px] font-black uppercase tracking-widest text-[#00AEEF]">+ FEE {fmtMXN(parseFloat(form.manualFee) || 0)}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-5 mt-12">
                                <button onClick={() => setStep(5)} className="flex-1 py-5 border border-(--border-color) text-(--text-color-secondary) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--glass-bg) transition-all">BACK</button>
                                <button onClick={handleSubmit} disabled={saving}
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

const RequestPaymentModal: React.FC<{
    group: VendorGroup | null;
    onClose: () => void;
    onConfirm: (dest: PaymentDestination, percentage: number, manualFee: number, includeIva: boolean, includeComm: boolean) => void;
}> = ({ group, onClose, onConfirm }) => {
    const [dest, setDest] = useState<PaymentDestination | null>(null);
    const [manualFee, setManualFee] = useState('');
    const [includeIva, setIncludeIva] = useState(false);
    const [includeComm, setIncludeComm] = useState(false);
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
    const amountToRequest = Number(Math.max(0, targetAmount - group.paidTotal).toFixed(2));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4" onClick={onClose}>
            <div className="bg-(--c1) border border-(--border-color) rounded-[40px] w-full max-w-[500px] max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                <div className="px-6 md:px-10 pt-8 pb-4 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-(--text-color) uppercase tracking-tight">
                            {paidPerc > 0 && percentage === 100 ? 'LIQUIDATE BALANCE' : 'PAYMENT REQUEST'}
                        </h3>
                        <p className="text-[10px] text-(--text-color-secondary) uppercase tracking-widest font-bold mt-1">FOR {group.vendorId}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-(--glass-bg) flex items-center justify-center text-(--text-color-secondary) hover:text-(--text-color) transition-all text-sm">✕</button>
                </div>

                <div className="px-6 md:px-10 pb-10 flex-1 overflow-y-auto custom-scrollbar">
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
                                <p className="text-3xl font-mono font-black text-(--text-color)">{fmtMXN(group.total)}</p>
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

                        {/* Adjustments Section */}
                        <div className="flex flex-col gap-4 mt-2">
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-(--glass-bg) border border-(--border-color)">
                                <span className="text-[10px] font-black text-(--text-color) uppercase tracking-widest">ADD 16% IVA</span>
                                <button onClick={() => {
                                    setIncludeIva(!includeIva);
                                    if (!includeIva) setIncludeComm(false);
                                }}
                                    className={`w-12 h-7 rounded-full transition-all relative ${includeIva ? 'bg-green-500' : 'bg-white/10'}`}>
                                    <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${includeIva ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-(--glass-bg) border border-(--border-color)">
                                <span className="text-[10px] font-black text-(--text-color) uppercase tracking-widest">BANK COMISION (10%)</span>
                                <button onClick={() => {
                                    setIncludeComm(!includeComm);
                                    if (!includeComm) setIncludeIva(false);
                                }}
                                    className={`w-12 h-7 rounded-full transition-all relative ${includeComm ? 'bg-[#00AEEF]' : 'bg-white/10'}`}>
                                    <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${includeComm ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>
                            <div className="relative group/fee">
                                <label className="absolute -top-2 left-4 px-2 bg-(--c1) text-[8px] font-black text-(--text-color-secondary) uppercase tracking-widest">MANUAL FEE (MXN)</label>
                                <input type="number" step="0.01" value={manualFee} onChange={e => setManualFee(e.target.value)}
                                    className="w-full h-12 px-5 font-mono text-sm font-bold bg-(--glass-bg) border border-(--border-color) rounded-2xl text-(--text-color) outline-none focus:border-(--main-color)/50 transition-all" placeholder="0.00" />
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="p-6 rounded-[32px] bg-(--glass-bg) border border-(--border-color)">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">TOTAL DISBURSEMENT</span>
                                <span className="text-[10px] font-mono text-(--text-color-secondary)">{fmtMXN(amountToRequest)} BASE</span>
                            </div>
                            <div className="text-3xl font-mono font-black text-(--text-color)">
                                {fmtMXN(amountToRequest + (parseFloat(manualFee) || 0) + (includeIva ? (amountToRequest * 0.16) : 0) + (includeComm ? (amountToRequest * 0.10) : 0))}
                            </div>
                        </div>

                        <div className="flex gap-4 mt-2">
                            <button onClick={onClose} className="flex-1 py-5 border border-(--border-color) text-(--text-color-secondary) rounded-[24px] text-[10px] font-black tracking-widest hover:bg-(--glass-bg) transition-all">CANCEL</button>
                            <button onClick={() => dest && onConfirm(dest, percentage, parseFloat(manualFee) || 0, includeIva, includeComm)} disabled={!dest || amountToRequest <= 0}
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

export const TrackingPaymentsView: React.FC<{ docs: any[]; exchangeRate: number; onRefresh: () => void }> = ({ docs, exchangeRate, onRefresh }) => {
    const db = useDatabase();
    const user = useAtomValue(userAtom);
    // Use inventoryAtom as a read-only live feed from DataSyncProvider (reactive via Supabase realtime)
    const inventory = useAtomValue(inventoryAtom);
    const logisticsData = useAtomValue(logisticsDataAtom);
    const isLoading = useAtomValue(isSyncingAtom);
    const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [paymentsVersion, setPaymentsVersion] = useAtom(paymentsVersionAtom);
    const [destinationFilter, setDestinationFilter] = useAtom(paymentDestinationFilterAtom);
    const [subcatFilter, setSubcatFilter] = useState<Subcategory>('All');
    const [vendorFilter, setVendorFilter] = useState<string>('All');
    const [showAdd, setShowAdd] = useState(false);
    const [requestGroup, setRequestGroup] = useState<VendorGroup | null>(null);
    const [overviewMode, setOverviewMode] = useAtom(paymentsOverviewModeAtom);
    const showFilters = useAtomValue(paymentFilterBarModeAtom) !== 'off';
    const financeSearch = useAtomValue(financeSearchTermAtom);
    const [liveExchangeRate, setLiveExchangeRate] = useAtom<number | null, [number | null], void>(liveExchangeRateAtom as any);
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const currencyMode = useAtomValue(currencyModeAtom);

    const toggleRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        if (liveExchangeRate) return;
        fetch('https://open.er-api.com/v6/latest/USD')
            .then(r => r.json())
            .then(d => { if (d?.rates?.MXN) setLiveExchangeRate(d.rates.MXN); })
            .catch(() => { });
    }, [liveExchangeRate, setLiveExchangeRate]);

    const pendingGroups = useMemo<VendorGroup[]>(() => {


        const targetStatuses = ['acquired', 'acquisition', 'acquisitions', 'production'];

        const pendingItems = inventory.filter(i => {
            const status = (i.data.status || '').toLowerCase();
            const payReqStr = String(i.data.payReq || (i.data as any).pay_req || '').toLowerCase();
            return targetStatuses.includes(status) && payReqStr !== 'true' && payReqStr !== 'paid';
        });

        const pendingCrates = logisticsData.filter(c => {
            const payReqStr = String(c.pay_req || '').toLowerCase();
            return c.type === 'crate' && payReqStr !== 'true' && payReqStr !== 'paid' && (c.cost_mxn || 0) > 0;
        }).map(c => ({
            row: c.id,
            label: c.description || `Crate ${c.id}`,
            imageUrl: '',
            data: {
                ...c,
                status: 'Packing', 
                item_id: c.id,
                vendor_id: 'Crates',
                price: c.cost_mxn,
                quantity: c.quantity || 1
            }
        } as any));

        const itemsToProcess = [...pendingItems, ...pendingCrates];

        const groups: Record<string, VendorGroup> = {};
        for (const item of itemsToProcess) {




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

        const groupList = Object.values(groups);
        for (const group of groupList) {
            const itemIds = new Set(group.items.map(i => String(i.row)));
            const relatedExpenses = docs.filter(d =>
                d.vendor_id === group.vendorId &&
                ['Requested', 'Paid', 'Sent', 'Dispersed'].includes(d.status) &&
                (d.related_ids?.some((id: any) => itemIds.has(String(id))) ||
                    d.related_inventory_ids?.split(',').some((id: any) => itemIds.has(String(id))))
            );

            group.paidTotal = relatedExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        }

        return groupList.filter(g => (g.total - g.paidTotal) > 0.5);
    }, [inventory, docs, logisticsData]);

    const vendorTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        docs.filter(e => e.status === 'Requested').forEach(e => {
            const vid = getVendorIdFromDescription(e.description || '');
            if (vid) totals[vid] = (totals[vid] || 0) + (e.amount || 0) + (e.commission || 0);
        });
        return totals;
    }, [docs]);

    const filtered = useMemo(() => {
        const searchWords = financeSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);

        return [...docs]
            .filter(r => {
                const subcatValue = normalizeSubcat(r.subcategory || r.category || '');
                const subcatMatch = subcatFilter === 'All' || subcatValue === subcatFilter;
                const destMatch = destinationFilter === 'All' || r.destination === destinationFilter;
                const vendorMatch = vendorFilter === 'All' || getVendorIdFromDescription(r.description || '') === vendorFilter;

                let searchMatch = true;
                if (searchWords.length > 0) {
                    const searchSource = [
                        r.description || '',
                        r.notes || '',
                        r.vendor_id || '',
                        r.subcategory || '',
                        r.category || '',
                        r.reference || '',
                        r.destination || '',
                        r.status || 'Requested'
                    ].join(' ').toLowerCase();

                    searchMatch = searchWords.every(word => searchSource.includes(word));
                }

                return subcatMatch && destMatch && vendorMatch && searchMatch;
            })
            .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
    }, [docs, subcatFilter, destinationFilter, vendorFilter, financeSearch]);

    const handleRequestPayment = async (dest: PaymentDestination, percentage: number, manualFee: number = 0, includeIva: boolean = false, includeComm: boolean = false) => {
        if (!requestGroup) return;
        const toastId = toast.loading('Sending request…');
        try {
            const targetAmount = requestGroup.total * (percentage / 100);
            const amount = Number(Math.max(0, targetAmount - requestGroup.paidTotal).toFixed(2));

            if (amount <= 0 && percentage < 100) {
                toast.error('No balance remaining at this percentage.', { id: toastId });
                return;
            }

            const commission = Number((manualFee + (includeIva ? amount * 0.16 : 0) + (includeComm ? amount * 0.10 : 0)).toFixed(2));

            const isProduction = requestGroup.items.some(i => (i.data.status || '').toLowerCase() === 'production');
            const isPartial = percentage < 100;
            const desc = isPartial
                ? `Partial Payment (${percentage}%) for ${requestGroup.items.length} items from ${requestGroup.vendorId}`
                : `Liquidation Payment for ${requestGroup.items.length} items from ${requestGroup.vendorId}`;

            const itemIdsStr = requestGroup.items.map(i => String(i.row)).join(',');
            const ids = itemIdsStr.split(',');

            const isCrateGroup = requestGroup.vendorId === 'Pack';
            const upVal = 'true';
            
            if (isCrateGroup) {
                await supabase.from('logistics').update({ pay_req: upVal }).in('id', ids);
                if (db) {
                    for (const iid of ids) {
                        try {
                            const lLog = await db.logistics.findOne({ selector: { id: iid } }).exec();
                            if (lLog) await lLog.patch({ pay_req: upVal });
                        } catch (e) { console.error(e); }
                    }
                }
            } else {
                await supabase.from('inventory').update({ pay_req: upVal }).in('id', ids);
                if (db) {
                    for (const iid of ids) {
                        try {
                            const lInv = await db.inventory.findOne({ selector: { id: iid } }).exec();
                            if (lInv) await lInv.patch({ pay_req: upVal, payReq: upVal });
                        } catch (e) { console.error(e); }
                    }
                }
            }

            await appendExpense({
                description: desc,
                amount: amount,
                commission,
                destination: dest,
                status: 'Requested',
                subcategory: requestGroup.vendorId === 'Pack' ? 'Pack' : (isProduction ? 'Prod' : 'Acq'),
                vendor_id: requestGroup.vendorId,
                inventoryItemRows: isPartial ? null : itemIdsStr,
                linkedRows: isPartial ? itemIdsStr : null,
                notes: isPartial ? `Partial payment for total ${fmtMXN(requestGroup.total)}. Current paid: ${fmtMXN(requestGroup.paidTotal + amount)}` : null
            }, db);

            toast.success(isPartial ? `Partial payment requested.` : `Liquidation requested.`, { id: toastId });
            setInventoryVersion(v => v + 1);
            setPaymentsVersion(v => v + 1);
            onRefresh && onRefresh();
        } catch (err: any) { toast.error(err.message, { id: toastId }); }
        setRequestGroup(null);
    };

    const handleDeletePayment = async (r: any) => {
        if (!confirm('Are you sure you want to delete this payment record?')) return;
        const { error } = await supabase.from('finance').delete().eq('id', r.id);
        if (error) {
            toast.error(error.message);
        } else {
            try {
                const idsStr = r.related_ids || (r.related_inventory_ids ? r.related_inventory_ids.split(',').map((s: string) => s.trim()) : []);
                if (idsStr && idsStr.length > 0) {
                    const isCrate = r.subcategory === 'Packing';
                    if (isCrate) {
                        await supabase.from('logistics').update({ pay_req: null }).in('id', idsStr);
                        if (db) {
                            for (const iid of idsStr) {
                                try {
                                    const lLog = await db.logistics.findOne({ selector: { id: iid } }).exec();
                                    if (lLog) await lLog.patch({ pay_req: null });
                                } catch (e) {}
                            }
                        }
                    } else {
                        await supabase.from('inventory').update({ pay_req: null }).in('id', idsStr);
                        if (db) {
                            for (const iid of idsStr) {
                                try {
                                    const lInv = await db.inventory.findOne({ selector: { id: iid } }).exec();
                                    if (lInv) await lInv.patch({ pay_req: null, payReq: null });
                                } catch (e) {
                                    console.error('Error patching local inventory', e);
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error updating local docs', e);
            }
            toast.success('Payment deleted');
            setPaymentsVersion(v => v + 1);
            setInventoryVersion(v => v + 1);
            onRefresh();
        }
    };

    const handleToggleStatus = async (r: any) => {
        const next = r.status === 'Requested' ? 'Paid' : 'Requested';
        const nowIso = new Date().toISOString();
        const updatePayload = {
            status: next,
            pay_date: next === 'Paid' ? nowIso : null,
            updated_at: nowIso
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

            // Stamp / clear pay_date on linked inventory items
            const ids: string[] = (() => {
                if (r.related_ids?.length > 0) return r.related_ids.map((i: any) => String(i));
                if (r.related_inventory_ids) return r.related_inventory_ids.split(',').map((s: string) => s.trim()).filter(Boolean);
                return [];
            })();

            if (ids.length > 0) {
                const isCrate = r.subcategory === 'Pack' || r.subcategory === 'Packing';
                if (next === 'Paid') {
                    if (isCrate) {
                        const upStr = 'true';
                        await supabase.from('logistics').update({ pay_req: upStr }).in('id', ids);
                        if (db) {
                            for (const iid of ids) {
                                try {
                                    const lLog = await db.logistics.findOne({ selector: { id: iid } }).exec();
                                    if (lLog) await lLog.patch({ pay_req: upStr });
                                } catch (e) {}
                            }
                        }
                    } else {
                        if (r.description?.includes('%')) {
                            const upStr = 'true';
                            await supabase.from('inventory').update({ pay_req: upStr }).in('id', ids);
                            if (db) {
                                for (const iid of ids) {
                                    try {
                                        const lInv = await db.inventory.findOne({ selector: { id: iid } }).exec();
                                        if (lInv) await lInv.patch({ pay_req: upStr, payReq: upStr });
                                    } catch (e) { console.error(e); }
                                }
                            }
                        } else {
                            // Full liquidation — mark paid and stamp pay_date
                            const isProdPayment = r.subcategory === 'Prod' || r.description?.toLowerCase().includes('liquidation');
                            const invUpdate: any = { pay_req: 'true', pay_date: nowIso };
                            if (isProdPayment) invUpdate.status = 'Acquisition';

                            await supabase.from('inventory').update(invUpdate).in('id', ids);
                            if (db) {
                                const lUpdates: any = { pay_req: 'true', payReq: 'true', pay_date: nowIso, payDate: nowIso };
                                if (isProdPayment) lUpdates.status = 'Acquisition';
                                for (const iid of ids) {
                                    try {
                                        const lInv = await db.inventory.findOne({ selector: { id: iid } }).exec();
                                        if (lInv) await lInv.patch(lUpdates);
                                    } catch (e) { console.error(e); }
                                }
                            }
                        }
                    }
                } else {
                    // Reverted to Requested — clear pay_date on inventory items
                    if (!isCrate) {
                        await supabase.from('inventory').update({ pay_date: null }).in('id', ids);
                        if (db) {
                            for (const iid of ids) {
                                try {
                                    const lInv = await db.inventory.findOne({ selector: { id: iid } }).exec();
                                    if (lInv) await lInv.patch({ pay_date: null, payDate: null });
                                } catch (e) { console.error(e); }
                            }
                        }
                    }
                }
            }

            setPaymentsVersion(v => v + 1);
            setInventoryVersion(v => v + 1);
            onRefresh();
        }
    };

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

    const rate = liveExchangeRate || exchangeRate;

    if (isLoading) return <div className="h-full flex items-center justify-center"><LoadingIndicator /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <AddPaymentModal
                isOpen={showAdd}
                onClose={() => setShowAdd(false)}
                onSaved={() => { setPaymentsVersion(v => v + 1); setInventoryVersion(v => v + 1); onRefresh(); }}
                pendingGroups={pendingGroups}
            />
            <RequestPaymentModal
                group={requestGroup}
                onClose={() => setRequestGroup(null)}
                onConfirm={handleRequestPayment}
            />

            {/* ── General Overview & Stats Grids ── */}
            {overviewMode !== 'collapsed' && (
                <div className={`flex flex-col shrink-0 border-b border-white/5 bg-black/10 ${overviewMode === 'extended' ? 'p-3' : 'p-1.5'} transition-all duration-300 relative`}>
                    
                    {/* Compact Mode Vendor Bubbles */}
                    {overviewMode !== 'extended' && pendingGroups.length > 0 && (
                        <div className="flex items-center gap-2 mb-2 px-1 animate-in fade-in slide-in-from-left-2 duration-500">
                            {pendingGroups.map(group => {
                                const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#888';
                                const paidPerc = Math.round((group.paidTotal / group.total) * 100);
                                return (
                                    <div key={group.vendorId} 
                                        className="group relative flex items-center justify-center w-6 h-6 rounded-full transition-all hover:scale-125 cursor-help"
                                        title={`${group.vendorId}: ${paidPerc}% Paid (${fmtMXN(group.total - group.paidTotal)} pending)`}
                                        style={{ 
                                            background: `conic-gradient(${color} 0% ${paidPerc}%, rgba(255,255,255,0.05) ${paidPerc}% 100%)`,
                                            padding: '1.5px'
                                        }}>
                                        <div className="w-full h-full rounded-full bg-black/80 flex items-center justify-center text-[7px] font-black backdrop-blur-sm"
                                            style={{ color }}>
                                            {group.vendorId[0]}
                                        </div>
                                        {/* Minimal pulse indicator if 0% paid */}
                                        {paidPerc === 0 && (
                                            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse border border-white/10" style={{ backgroundColor: color }} />
                                        )}
                                    </div>
                                );
                            })}
                            <div className="w-px h-3 bg-white/10 mx-1" />
                            <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">Ongoing Liquidations</span>
                        </div>
                    )}
                    {/* Primary Grid: Rates & Summary Totals */}
                    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${overviewMode === 'extended' ? 'gap-2.5' : 'gap-1'} mb-1`}>
                        {/* Exchange Rates Card */}
                        <div className={`group relative flex flex-col ${overviewMode === 'extended' ? 'p-2.5' : 'p-1 px-2'} rounded-xl bg-white/2 border border-white/5 hover:border-white/10 transition-all`}>
                            <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                <TrendingUp size={12} className="text-[#6BCEBB]" />
                            </div>
                            <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] mb-0.5 leading-none">FX Rates</span>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col">
                                    <span className="text-[7px] font-bold text-white/10 uppercase mb-0.5">Wbk</span>
                                    <span className={`font-mono font-black text-[#FACC15] ${overviewMode === 'extended' ? 'text-[11px]' : 'text-[9px]'}`}>{exchangeRate.toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col border-l border-white/5 pl-2">
                                    <span className="text-[7px] font-bold text-white/10 uppercase mb-0.5">Live</span>
                                    <span className={`font-mono font-black text-[#6BCEBB] ${overviewMode === 'extended' ? 'text-[11px]' : 'text-[9px]'}`}>{liveExchangeRate ? liveExchangeRate.toFixed(2) : '...'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Paid Total Card */}
                        <div className={`group relative flex flex-col ${overviewMode === 'extended' ? 'p-2.5' : 'p-1 px-2'} rounded-xl bg-white/2 border border-white/5 hover:border-white/10 transition-all`}>
                            <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                <CheckCircle size={12} className="text-[#6BCEBB]" />
                            </div>
                            <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] mb-0.5 leading-none">Total Paid</span>
                            <div className="flex items-center gap-1.5 leading-tight">
                                <span className={`font-black font-mono text-[#6BCEBB] tracking-tighter ${overviewMode === 'extended' ? 'text-[18px]' : 'text-xs'}`}>
                                    {currencyMode === 'MXN' ? fmtMXN(statusTotals.Paid || 0) : fmtUSD((statusTotals.Paid || 0) / rate)}
                                </span>
                                <span className={`text-[8px] font-black px-1 rounded ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                    {currencyMode}
                                </span>
                            </div>
                        </div>

                        {/* Pending Total Card */}
                        <div className={`group relative flex flex-col ${overviewMode === 'extended' ? 'p-2.5' : 'p-1 px-2'} rounded-xl bg-white/2 border border-white/5 hover:border-white/10 transition-all`}>
                            <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                <Clock size={12} className="text-[#FACC15]" />
                            </div>
                            <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] mb-0.5 leading-none">Total Pending</span>
                            <div className="flex items-center gap-1.5 leading-tight">
                                <span className={`font-black font-mono text-[#FACC15] tracking-tighter ${overviewMode === 'extended' ? 'text-[18px]' : 'text-xs'}`}>
                                    {currencyMode === 'MXN' ? fmtMXN(statusTotals.Requested + statusTotals.Pending || 0) : fmtUSD((statusTotals.Requested + statusTotals.Pending || 0) / rate)}
                                </span>
                                <span className={`text-[8px] font-black px-1 rounded ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                    {currencyMode}
                                </span>
                            </div>
                        </div>

                        {/* Active Selection Card */}
                        <div className={`group relative flex flex-col ${overviewMode === 'extended' ? 'p-2.5' : 'p-1 px-2'} rounded-xl bg-(--main-color)/5 border border-(--main-color)/20`}>
                            <span className="text-[7px] font-black text-(--main-color) opacity-50 uppercase tracking-[0.2em] mb-0.5 leading-none">Active Account</span>
                            {destinationFilter !== 'All' ? (
                                <div className="flex items-center justify-between gap-1 leading-tight relative z-10">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-4 h-4 flex items-center justify-center bg-white/10 rounded p-0.5 border border-white/10">
                                            <img src={destinationsConfig[destinationFilter].icon} className="max-w-full max-h-full object-contain" />
                                        </div>
                                        <span className={`font-black font-mono text-white tracking-tighter ${overviewMode === 'extended' ? 'text-[18px]' : 'text-xs'}`}>
                                            {currencyMode === 'MXN' ? fmtMXN(activeDestReqNetMXN) : fmtUSD(activeDestReqNetMXN / rate)}
                                        </span>
                                    </div>
                                    <span className={`text-[8px] font-black px-1 rounded ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                        {currencyMode}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center relative z-10">
                                    <span className="text-[8px] font-black text-white/10 uppercase tracking-widest">No Selection</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Secondary Grid: Vendor Request Cards (Upcoming) */}
                    {overviewMode === 'extended' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
                            {pendingGroups.map(group => {
                                const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#888';
                                const paidPerc = Math.round((group.paidTotal / group.total) * 100);
                                return (
                                    <div key={group.vendorId}
                                        className="group relative flex flex-col p-2 rounded-xl bg-white/2 border border-white/5 hover:border-white/10 transition-all shadow-lg overflow-hidden"
                                        style={{ borderTop: `2px solid ${color}` }}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="text-[9px] font-black uppercase tracking-wider block" style={{ color }}>{group.vendorId}</span>
                                                <span className="text-[7px] font-bold text-white/40 uppercase tracking-widest leading-none">{group.items.length} Units</span>
                                            </div>
                                            <div className="p-1 bg-white/5 rounded-md border border-white/10 opacity-30 group-hover:opacity-100 transition-opacity">
                                                <Archive size={11} style={{ color }} />
                                            </div>
                                        </div>
                                        <div className="mt-auto">
                                            <div className="flex items-center gap-1.5 mb-1.5 overflow-hidden">
                                                <span className="text-[14px] font-black font-mono text-white leading-none whitespace-nowrap">
                                                    {currencyMode === 'MXN' ? fmtMXN(group.total) : fmtUSD(group.total / rate)}
                                                </span>
                                                <span className={`text-[7px] font-black px-1 rounded shrink-0 ${currencyMode === 'USD' ? 'text-emerald-400/50' : 'text-sky-400/50'}`}>
                                                    {currencyMode}
                                                </span>
                                            </div>
                                            <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-(--main-color) opacity-80" style={{ width: `${paidPerc || 0}%` }} />
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                                {paidPerc > 0 ? <span className="text-[7px] font-black text-white/30 uppercase">{paidPerc}% Paid</span> : <div />}
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const ids = group.items.map(i => i.row || (i.data as any).id).filter(Boolean);
                                                        setArtifactConfig({ isOpen: true, itemIds: ids, title: `Items for ${group.vendorId}` });
                                                    }}
                                                    className="flex items-center gap-1 text-[7px] font-black text-(--main-color)/60 hover:text-(--main-color) transition-colors uppercase tracking-[0.1em]"
                                                >
                                                    <LayoutGrid size={9} /> View Items
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Toggleable Filter Bar ── */}
            {showFilters && (
                <div className="flex-none flex flex-col bg-(--glass-bg) border-b border-white/5 animate-in slide-in-from-top-2 duration-300 relative z-10">
                    <div className="flex flex-col md:flex-row items-center justify-between px-4 py-2 gap-4">
                        {/* Subcategories Filter */}
                        <div className="flex items-center gap-0.5 overflow-x-auto custom-scrollbar w-full md:w-auto py-1 no-scrollbar">
                            {SUBCATEGORIES.map(s => {
                                const labels: Record<string, { label: string; icon: any; color: string }> = {
                                    'All': { label: 'ALL', icon: LayoutGrid, color: '#888' },
                                    'Acq': { label: 'ACQUISITION', icon: DollarSign, color: '#10b981' },
                                    'Prod': { label: 'PRODUCTION', icon: Cpu, color: '#6366f1' },
                                    'Monthly': { label: 'MONTHLY', icon: Calendar, color: '#38bdf8' },
                                    'Oprt': { label: 'OPERATION', icon: Activity, color: '#818cf8' },
                                    'Packing': { label: 'PACKING', icon: Archive, color: '#fb7185' },
                                    'Sppl': { label: 'SUPPLIES', icon: Box, color: '#34d399' },
                                    'Labr': { label: 'LABOR', icon: Users, color: '#fbbf24' }
                                };
                                const cfg = labels[s];
                                const isActive = subcatFilter === s;
                                return (
                                    <button key={s} onClick={() => setSubcatFilter(s as Subcategory)}
                                        className={`flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-xl border border-transparent transition-all whitespace-nowrap shrink-0 group/f hover:bg-white/5 ${isActive ? 'bg-white/5 border-white/5' : ''}`}>
                                        <cfg.icon size={16} style={{ color: cfg.color }} className={`transition-all ${isActive ? 'scale-110 opacity-100' : 'opacity-30 group-hover/f:opacity-100 group-hover/f:scale-110'}`} />
                                        <span className={`text-[7px] font-black tracking-[0.2em] transition-all uppercase ${isActive ? 'opacity-100' : 'opacity-20 group-hover/f:opacity-60'}`} style={{ color: cfg.color }}>
                                            {cfg.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Account Filter (Large Free-Floating Icons) */}
                        <div className="flex items-center gap-2 shrink-0 px-2 lg:px-4">
                            {Object.entries(destinationsConfig).map(([key, cfg]) => {
                                const isActive = destinationFilter === key;
                                return (
                                    <button key={key} onClick={() => setDestinationFilter(destinationFilter === key ? 'All' : key as PaymentDestination)}
                                        className={`relative group transition-all transform hover:scale-110 active:scale-95 ${isActive ? 'grayscale-0 opacity-100' : 'grayscale opacity-30 hover:opacity-100 hover:grayscale-0'}`}>
                                        <div className="w-10 h-7 flex items-center justify-center">
                                            <img src={cfg.icon} alt={cfg.name} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                                        </div>
                                        {isActive && (
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-(--main-color) shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                                        )}
                                        {/* Hover Label */}
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-0.5 rounded text-[7px] font-black text-white/60 uppercase opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none tracking-widest border border-white/10">
                                            {cfg.name}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col min-h-0">
                {/* High Density Payment Card List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {/* Large Primary Action: Initialize Transaction (Restricted to Admins/Developers) */}
                    {(user?.role === 'Admin' || user?.role === 'Developer') && (
                        <button
                            onClick={() => setShowAdd(true)}
                            className="w-full mb-2 flex items-center justify-center gap-4 py-4 px-6 rounded-[24px] border border-white/5 bg-white/5 hover:bg-(--main-color)/10 transition-all group relative overflow-hidden active:scale-95 duration-200"
                        >
                            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 group-hover:bg-(--main-color)/20 group-hover:border-(--main-color)/20 transition-all duration-300">
                                <Plus className="w-6 h-6 text-white/40 group-hover:text-(--main-color) transition-colors" />
                            </div>
                            <div className="text-left flex-1">
                                <span className="block text-[10px] font-black uppercase tracking-[0.3em] text-white/30 group-hover:text-white group-hover:opacity-100 transition-all">New Transaction</span>
                                <span className="block text-[8px] font-bold text-white/10 uppercase tracking-widest mt-0.5 group-hover:text-(--main-color)/60 transition-colors">Launch Payment Wizard UI</span>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus size={20} className="text-(--main-color) opacity-20" />
                            </div>
                        </button>
                    )}

                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <Info size={40} className="mb-4" />
                            <p className="text-xs font-black uppercase tracking-[0.3em]">No Records Found</p>
                        </div>
                    ) : ( 
                        filtered.map(r => {
                            const isExpanded = expandedRows.has(r.id);
                            const totalNet = (r.amount || 0) + (r.commission || 0);
                            const totalUSD = totalNet / (liveExchangeRate || exchangeRate);
                            const vendorColor = vendors[r.vendor_id as keyof typeof vendors]?.color || '#888';
                            const destCfg = r.destination ? destinationsConfig[r.destination as PaymentDestination] : null;
                            
                            const labels: Record<string, { label: string; icon: any; color: string }> = {
                                'All': { label: 'All', icon: LayoutGrid, color: '#888' },
                                'Acq': { label: 'Acquis', icon: DollarSign, color: '#10b981' },
                                'Prod': { label: 'Produc', icon: Cpu, color: '#6366f1' },
                                'Monthly': { label: 'Monthly', icon: Calendar, color: '#38bdf8' },
                                'Oprt': { label: 'Operat', icon: Activity, color: '#818cf8' },
                                'Packing': { label: 'Packing', icon: Archive, color: '#fb7185' },
                                'Sppl': { label: 'Supply', icon: Box, color: '#34d399' },
                                'Labr': { label: 'Labor', icon: Users, color: '#fbbf24' }
                            };
                            const cat = labels[normalizeSubcat(r.subcategory || r.category)] || labels['All'];

                            return (
                                <div key={r.id} 
                                    className={`group relative flex flex-col p-2 bg-white/5 border-b border-white/5 transition-all hover:bg-white/7 ${isExpanded ? 'bg-white/8 my-2 rounded-xl border-x border-white/10 shadow-2xl z-10' : ''} border-l-4 ${r.status === 'Paid' ? 'border-l-[#8DC63F]' : 'border-l-[#FACC15]'}`}>
                                    
                                    <div className="flex items-center gap-2 cursor-pointer no-select" onClick={() => toggleRow(r.id)}>
                                        {/* Column 1: Compact Icon + Date Stack */}
                                        <div className="shrink-0 flex items-center gap-2.5 border-r border-white/5 pr-3 min-w-[85px]">
                                            <cat.icon size={14} style={{ color: cat.color }} className="shrink-0 opacity-80" />
                                            <div className="flex flex-col items-start justify-center">
                                                <span className="text-[10px] font-black tracking-tighter text-white opacity-80 leading-none mb-1">{r.date ? new Date(r.date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}</span>
                                                <span className={`text-[7px] font-black uppercase tracking-widest opacity-40 leading-none truncate`} style={{ color: cat.color }}>{cat.label}</span>
                                            </div>
                                        </div>

                                        {/* Column 2: Simplified Vendor / CRATES logic */}
                                        <div className="flex-1 min-w-0 px-2 flex items-center gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <h4 className="text-[10px] sm:text-[11px] font-black text-white uppercase tracking-wider truncate">{r.description || r.notes || 'Unnamed Transaction'}</h4>
                                                    {r.recurring && <Clock size={10} className="text-orange-500 opacity-50 shrink-0" />}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                     {r.vendor_id === 'CRATES' ? (
                                                         <div className="flex items-center gap-1.5 py-0.5">
                                                             <Box size={10} className="text-white/40" />
                                                             <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">CRATES</span>
                                                         </div>
                                                     ) : r.vendor_id && (
                                                         <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap" style={{ color: vendorColor }}>{r.vendor_id}</span>
                                                     )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Column 3: Financials & Account Icon Segment */}
                                        <div className="shrink-0 flex items-center justify-end gap-3 w-[150px]">
                                            <div className="flex flex-col items-end gap-0 min-w-[90px]">
                                                <div className="flex items-center justify-end gap-1.5 leading-none">
                                                     <span className="text-[12px] sm:text-[14px] font-black font-mono text-white tracking-tighter">
                                                         {currencyMode === 'MXN' ? fmtMXN(totalNet) : fmtUSD(totalUSD)}
                                                     </span>
                                                    <span className={`text-[7px] font-black px-1 rounded ${currencyMode === 'USD' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-sky-500/10 text-sky-400/60'}`}>
                                                        {currencyMode}
                                                    </span>
                                                </div>
                                                {(r.commission || 0) > 0 && (
                                                    <div className="flex items-center gap-1 opacity-60 mt-0.5">
                                                         <span className="text-[9px] sm:text-[11px] font-mono font-black text-white/50 tracking-tighter">
                                                             + {currencyMode === 'MXN' ? fmtMXN(r.commission) : fmtUSD(r.commission / (liveExchangeRate || exchangeRate))}
                                                         </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Free-Floating Card/Account Icon */}
                                            <div className="shrink-0 w-8 h-8 flex items-center justify-center relative">
                                                {destCfg ? (
                                                    <img src={destCfg.icon} className="max-w-[100%] max-h-[100%] object-contain brightness-110 drop-shadow-[0_0_12px_rgba(255,255,255,0.15)] group-hover:scale-110 transition-transform" title={destCfg.name} />
                                                ) : (
                                                    <Info size={12} className="text-white/10" />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Content: Deep Metadata */}
                                    {isExpanded && (
                                        <div className="mt-4 pt-4 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {/* Logic Details */}
                                                <div className="space-y-4">
                                                    <div>
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-2">Transactional Detail</span>
                                                         <p className="text-[10px] sm:text-[11px] font-medium text-white/70 leading-relaxed italic">"{r.notes || r.description || 'No additional notes provided.'}"</p>
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        <div>
                                                             <span className="text-[8px] sm:text-[10px] font-black text-white/20 uppercase tracking-widest">Payment Method</span>
                                                             <span className="text-[8px] sm:text-[10px] font-black text-white/80 uppercase block">{r.payment_method || 'Standard Wire'}</span>
                                                        </div>
                                                        <div>
                                                             <span className="text-[7px] sm:text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Fee %</span>
                                                             <span className="text-[9px] sm:text-[10px] font-mono font-black text-white/80">{((r.commission || 0) / (r.amount || 1) * 100).toFixed(1)}%</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Linked Items / Artifact Trigger */}
                                                <div className="lg:col-span-2">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] block">Linked Traceability</span>
                                                    </div>
                                                    {(() => {
                                                        const rawIds = r.related_ids || (r.related_inventory_ids ? r.related_inventory_ids.split(',').map((s: string) => s.trim()) : []);
                                                        const ids = Array.isArray(rawIds) ? rawIds : (typeof rawIds === 'string' ? rawIds.split(',').filter(Boolean) : []);
                                                        if (ids.length === 0) return <span className="text-[10px] font-mono text-white/10 uppercase">No items linked</span>;
                                                        
                                                        return (
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setArtifactConfig({ isOpen: true, itemIds: ids, title: `Items for ${r.vendor_id || 'Transaction'}` });
                                                                }}
                                                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all group/items"
                                                            >
                                                                <LayoutGrid size={14} className="text-(--main-color)" />
                                                                <span className="text-[10px] font-black text-white/60 group-hover/items:text-white uppercase tracking-widest">Launch Items View ({ids.length})</span>
                                                            </button>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Relocated Actions Footnote */}
                                            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleToggleStatus(r); }}
                                                        className={`flex items-center gap-2 h-8 px-4 rounded-lg border transition-all hover:scale-105 active:scale-95 ${r.status === 'Paid' ? 'bg-[#8DC63F]/10 border-[#8DC63F]/20 text-[#8DC63F]' : 'bg-[#FACC15]/10 border-[#FACC15]/20 text-[#FACC15]'}`}>
                                                        {r.status === 'Requested' ? <Clock size={14} /> : <CheckCircle size={14} />}
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Mark as {r.status === 'Requested' ? 'Paid' : 'Requested'}</span>
                                                    </button>
                                                </div>
                                                {(user?.role === 'Admin' || user?.role === 'Developer') && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeletePayment(r); }}
                                                        className="flex items-center gap-2 h-8 px-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500/60 hover:text-red-500 transition-all hover:scale-105 active:scale-95">
                                                        <Trash2 size={14} />
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Delete Payment</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
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
                        <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 a2.12 2.12 0 0 1 0-3L12 9" /><path d="M17.64 15 22 10.64" /><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.23V5a2 2 0 0 0-2-2h-3a2 2 0 0 0-2 2v2.46c0 .83-.34 1.63-.93 2.23l-1.25 1.25" /><path d="m15 15 5 5" /><path d="m12 12 5 5" />
                    </symbol>
                    <symbol id="user" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </symbol>
                    <symbol id="label" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
                    </symbol>
                    <symbol id="repeat" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 23-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </symbol>
                </defs>
            </svg>
            <InventoryArtifact />
        </div>
    );
};
