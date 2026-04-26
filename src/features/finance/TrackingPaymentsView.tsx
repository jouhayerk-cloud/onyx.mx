
import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import { PaymentDestination, FinanceRecord, InventoryItem } from '../../lib/Types';
import { vendors, appUsers } from '../../lib/consts';
import { paymentsVersionAtom, userAtom, inventoryAtom, InventoryVersionAtom, paymentDestinationFilterAtom, exchangeRateAtom, paymentsOverviewModeAtom, liveExchangeRateAtom, paymentFilterBarModeAtom, financeSearchTermAtom, logisticsDataAtom, isSyncingAtom, inventoryArtifactConfigAtom, paymentsArtifactConfigAtom, currencyModeAtom, paymentCategoryFilterAtom, paymentVendorFilterAtom, paymentStatusFilterAtom } from '../../lib/atoms';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg, calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile, formatDimensionsImperial, formatWeightImperial } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';
import { 
    Calendar, Box, Users, Archive, Cpu, DollarSign, Activity, Wallet, 
    TrendingUp, Plus, Search, Filter, ArrowUpRight, CheckCircle, 
    Clock, AlertCircle, Info, ChevronDown, ChevronRight, LayoutGrid, List, Trash2, Receipt, Link, Pencil, Edit3, Video, Layers
} from 'lucide-react';
import { CurrencyTag } from '@/components/CurrencyTag';
import { InventoryArtifact } from '../inventory/InventoryArtifact';
import { WireframeCrate } from '../../components/CrateVisuals';

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

type VendorGroup = { vendorId: string; type: 'Acquisition' | 'Production' | 'Packing'; items: InventoryItem[]; total: number; totalQty: number; paidTotal: number };

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
    if (finalData) {
        // Also update related inventory items with the payment_id and internal status
        if (idsToLink) {
            const idStrs = idsToLink.split(',').map(s => s.trim());
            const idList = idStrs.map(s => Number(s)).filter(n => !isNaN(n));
            const barcodeList = idStrs.filter(s => isNaN(Number(s)));

            const updatePayload = {
                payment_ids: finalData.id.toString(),
                pay_req: String(payload.status).toLowerCase() === 'paid' ? 'true' : 'requested'
            };

            if (idList.length > 0) {
                await supabase.from('inventory').update(updatePayload).in('id', idList);
            }
            if (barcodeList.length > 0) {
                await supabase.from('inventory').update(updatePayload).in('book_barcode', barcodeList);
            }
        }

        if (db) {
            try {
                await db.finance.insert(finalData);
            } catch (e) {
                console.error('Local finance insert failed', e);
            }
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
            const group = (form.subcategory === 'Acq' || isProd || isPacking) 
                ? pendingGroups.find(g => g.vendorId === form.vendor_id && (isPacking ? g.type === 'Packing' : (isProd ? g.type === 'Production' : g.type === 'Acquisition'))) 
                : null;
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
                    await supabase.from('production').update(up).in('id', ids);
                    if (db) {
                        for (const iid of ids) {
                            try {
                                const lProd = await db.production.findOne({ selector: { id: iid } }).exec();
                                if (lProd) await lProd.patch(up);
                            } catch (e) { console.error(e); }
                        }
                    }
                } else {
                    const table = isProd ? 'production' : 'inventory';
                    await supabase.from(table).update({ pay_req: 'true' }).in('id', ids);
                    if (db) {
                        for (const iid of ids) {
                            try {
                                const coll = isProd ? db.production : db.inventory;
                                const doc = await coll.findOne({ selector: { id: iid } }).exec();
                                if (doc) await doc.patch({ pay_req: 'true', payReq: 'true' });
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

                            <div className="flex flex-wrap gap-4 justify-center">
                                {pendingGroups.length === 0 ? (
                                    <div className="text-center py-20 border-2 border-dashed border-(--border-color) rounded-[40px] w-full">
                                        <p className="text-(--text-color-secondary) opacity-40 text-[10px] font-black tracking-[0.3em] uppercase">No pending items found</p>
                                    </div>
                                ) : (
                                    pendingGroups
                                        .filter(g => {
                                            if (form.subcategory === 'Packing') return g.type === 'Packing' || g.vendorId === 'Crates';
                                            if (g.vendorId === 'Crates') return false;
                                            return form.subcategory === 'Prod' ? g.type === 'Production' : g.type === 'Acquisition';
                                        })
                                        .map(group => {
                                            const paidPerc = Math.round((group.paidTotal / group.total) * 100);
                                            const vendor = vendors[group.vendorId as keyof typeof vendors];
                                            const color = vendor?.color || '#333';
                                            const fullName = vendor?.name || group.vendorId;

                                            return (
                                                <button key={`${group.vendorId}-${group.type}`} 
                                                    onClick={() => {
                                                        set('vendor_id', group.vendorId);
                                                        set('amount', (group.total - group.paidTotal).toString());
                                                        if (form.subcategory === 'Packing' || group.vendorId === 'Crates') {
                                                            const sizesSet = new Set(group.items.map(i => {
                                                                const d = i.data as any;
                                                                return `${d.l_cm || 0}x${d.w_cm || 0}x${d.d_cm || 0}`;
                                                            }));
                                                            set('description', `Payment for ${group.items.length} Crates. Sizes: ${Array.from(sizesSet).join(', ')}`);
                                                        } else {
                                                            set('description', `${paidPerc > 0 ? 'Liquidation' : 'Payment'} for ${group.items.length} items from ${fullName}`);
                                                        }
                                                        setStep(4);
                                                    }}
                                                    className="group relative flex flex-col items-center gap-2 p-4 rounded-3xl transition-all hover:bg-white/5 border border-transparent hover:border-white/10">
                                                    <div className="w-16 h-16 rounded-[24px] flex flex-col items-center justify-center font-black text-sm shadow-xl border-2 border-white/5 relative overflow-hidden group-hover:scale-110 transition-transform"
                                                        style={{ backgroundColor: color, color: getTextColorForBg(color) }}>
                                                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        <span>{group.vendorId}</span>
                                                        <span className="text-[6px] opacity-60 mt-1">{group.type === 'Production' ? 'PROD' : 'ACQ'}</span>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-[9px] font-black text-white/60 uppercase tracking-widest truncate max-w-[100px]">{fullName}</p>
                                                        <p className="text-[10px] font-mono font-black text-(--main-color) mt-1">{fmtMXN(group.total - group.paidTotal)}</p>
                                                    </div>
                                                </button>
                                            );
                                        })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Stage 2.2: Expenses Stage 1 (Crates vs Specific) */}
                    {step === 2.2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight text-center">OPERATING COSTS</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-10 uppercase tracking-widest font-bold text-center">Classify the administrative cost</p>
                            <button onClick={() => setStep(1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-10 flex items-center gap-3 group transition-all">← BACK</button>

                            <div className="grid grid-cols-2 gap-5 w-full">
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
                                {['Sppl', 'Labr', 'Packing', 'Oprt', 'Monthly'].map(cat => {
                                    const labels: Record<string, { t: string, s: string, i: string }> = {
                                        Sppl: { t: 'SUPPLIES', s: 'Equipment & tools', i: '#hammer' },
                                        Labr: { t: 'LABOR', s: 'Workforce payments', i: '#user' },
                                        Packing: { t: 'PACKAGING', s: 'Shipping materials', i: '#label' },
                                        Oprt: { t: 'OPERATIONS', s: 'General services', i: '#settings' },
                                        Monthly: { t: 'MONTHLY', s: 'Fixed bills & subs', i: '#calendar' }
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

                                <div className="flex flex-col gap-5">
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-3">
                                            <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">AMOUNT (MXN)</label>
                                            <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                                                className="w-full h-16 px-6 font-mono text-xl font-bold bg-(--glass-bg) border border-(--border-color) rounded-[24px] text-(--text-color) outline-none focus:border-(--main-color)/50 transition-all" placeholder="0.00" />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">REFERENCE</label>
                                            <input value={form.reference} onChange={e => set('reference', e.target.value)}
                                                className="w-full h-16 px-6 rounded-[24px] bg-(--glass-bg) border border-(--border-color) text-(--text-color) placeholder:text-(--text-color-secondary)/30 outline-none focus:border-(--main-color)/50 transition-all" placeholder="Optional #" />
                                        </div>
                                    </div>

                                    {/* Recurring Toggle */}
                                    <div className={`flex items-center justify-between p-5 rounded-[28px] border transition-all ${form.recurring ? 'bg-(--main-color)/5 border-(--main-color)/30' : 'bg-(--glass-bg) border-(--border-color)'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${form.recurring ? 'bg-(--main-color)/20' : 'bg-white/5'}`}>
                                                <svg className={`w-5 h-5 transition-all ${form.recurring ? 'text-(--main-color) opacity-100' : 'text-white opacity-30'}`}><use href="#repeat" /></svg>
                                            </div>
                                            <div>
                                                <span className="text-[11px] font-black text-(--text-color) uppercase tracking-widest block">RECURRING</span>
                                                <span className="text-[9px] text-(--text-color-secondary) font-bold uppercase">Repeats monthly on a fixed day</span>
                                            </div>
                                        </div>
                                        <button onClick={() => { set('recurring', !form.recurring); if (form.recurring) set('recurring_day', 1); }}
                                            className={`w-14 h-8 rounded-full transition-all relative shrink-0 ${form.recurring ? 'bg-(--main-color)' : 'bg-white/10'}`}>
                                            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all shadow-md ${form.recurring ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    {/* Recurring Day — only when toggled on */}
                                    {form.recurring && (
                                        <div className="animate-in slide-in-from-top-2 duration-200 space-y-3">
                                            <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">DAY OF MONTH</label>
                                            <div className="flex items-center gap-4">
                                                <input type="number" min="1" max="31" value={form.recurring_day} onChange={e => set('recurring_day', parseInt(e.target.value) || 1)}
                                                    className="w-32 h-14 font-mono text-xl font-bold bg-(--glass-bg) border border-(--main-color)/30 rounded-[20px] text-(--text-color) outline-none focus:border-(--main-color)/60 transition-all text-center" />
                                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">of each month</span>
                                            </div>
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
    const amountToRequest = Math.round(Math.max(0, targetAmount - group.paidTotal));

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


// ─── Edit Payment Modal ────────────────────────────────────────────────────
const EditPaymentModal: React.FC<{
    record: any | null;
    onClose: () => void;
    onSaved: () => void;
}> = ({ record, onClose, onSaved }) => {
    const db = useDatabase();
    const [step, setStep] = useState(4);
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

    // Pre-populate form when record changes
    useEffect(() => {
        if (record) {
            const amt = record.amount ?? 0;
            const comm = record.commission ?? 0;
            // Try to detect if commission is IVA (16%) or bank (10%) or manual
            const ivaAmt = amt * 0.16;
            const commAmt = amt * 0.10;
            const isIva = Math.abs(comm - ivaAmt) < 1;
            const isComm = Math.abs(comm - commAmt) < 1;
            const manualFeeAmt = (!isIva && !isComm && comm > 0) ? comm : 0;

            setForm({
                description: record.description || '',
                amount: String(amt),
                subcategory: record.subcategory || record.category || 'Acq',
                vendor_id: record.vendor_id || '',
                destination: record.destination || null,
                reference: record.reference || '',
                payment_method: record.payment_method || 'Wire Transfer',
                notes: record.notes || '',
                recurring: record.recurring ?? false,
                recurring_day: record.recurring_day ?? new Date().getDate(),
                manualFee: manualFeeAmt > 0 ? String(manualFeeAmt) : '',
                includeIva: isIva,
                includeComm: isComm,
            });
            setStep(4);
        }
    }, [record]);

    const calculateIVA = (amt: number) => amt * 0.16;
    const calculateComm = (amt: number) => amt * 0.10;

    const handleUpdate = async () => {
        const amt = parseFloat(form.amount);
        if (!form.description || isNaN(amt) || amt <= 0 || !form.destination) {
            return toast.error('Fill in description, amount, and select an account.');
        }
        setSaving(true);
        const toastId = toast.loading('Updating payment…');
        try {
            const manualFeeAmt = parseFloat(form.manualFee) || 0;
            const ivaAmt = form.includeIva ? calculateIVA(amt) : 0;
            const commAmt = form.includeComm ? calculateComm(amt) : 0;
            const commission = manualFeeAmt + ivaAmt + commAmt;

            const updatePayload: any = {
                description: form.description,
                amount: amt,
                commission,
                destination: form.destination,
                subcategory: form.subcategory,
                vendor_id: form.vendor_id || null,
                reference: form.reference || null,
                payment_method: form.payment_method || null,
                notes: form.notes || null,
                recurring: form.recurring,
                recurring_day: form.recurring ? (form.recurring_day ?? null) : null,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase.from('finance').update(updatePayload).eq('id', record.id);
            if (error) throw error;

            // Sync to local DB if available
            if (db) {
                try {
                    const localDoc = await db.finance.findOne({ selector: { id: record.id } }).exec();
                    if (localDoc) await localDoc.patch(updatePayload);
                } catch (e) { console.error('Local sync failed', e); }
            }

            toast.success('Payment updated!', { id: toastId });
            onSaved();
            onClose();
        } catch (err: any) {
            toast.error(err.message, { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    if (!record) return null;

    const isOpen = !!record;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4" onClick={onClose}>
            <div className="bg-(--c1) border border-(--border-color) rounded-[40px] w-full max-w-[600px] max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 md:px-10 pt-8 pb-4 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-(--main-color)/15 border border-(--main-color)/30 flex items-center justify-center">
                            <Edit3 size={14} className="text-(--main-color)" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-(--main-color) uppercase tracking-[0.3em]">Editing Payment Record</p>
                            <p className="text-[10px] font-bold text-white/30 truncate max-w-[280px]">{record.description || 'Unnamed Transaction'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-(--glass-bg) flex items-center justify-center text-(--text-color-secondary) hover:text-(--text-color) transition-all text-sm shrink-0">✕</button>
                </div>

                <div className="px-6 md:px-10 pb-10 flex flex-col flex-1 overflow-y-auto custom-scrollbar min-h-[460px]">
                    {/* Step 1: Classification (re-classify if needed) */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 leading-tight tracking-tight uppercase">TRANSACTION<br />CLASSIFICATION</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-10 uppercase tracking-[0.3em] font-bold">Re-classify this transaction type</p>
                            <div className="grid grid-cols-2 gap-5">
                                <button onClick={() => setStep(2.1)}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-(--glass-bg) border border-(--border-color) hover:border-[#F7941D]/50 hover:bg-[#F7941D]/5 transition-all group">
                                    <div className="w-16 h-16 mb-6 rounded-full border-2 border-[#F7941D]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 text-[#F7941D] opacity-70"><use href="#pkg" /></svg>
                                    </div>
                                    <span className="text-[12px] font-black text-(--text-color) uppercase tracking-[0.2em]">MERCHANDISE</span>
                                </button>
                                <button onClick={() => setStep(2.2)}
                                    className="flex flex-col items-center p-10 rounded-[48px] bg-(--glass-bg) border border-(--border-color) hover:border-[#00AEEF]/50 hover:bg-[#00AEEF]/5 transition-all group">
                                    <div className="w-16 h-16 mb-6 rounded-full border-2 border-[#00AEEF]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-8 h-8 text-[#00AEEF] opacity-70"><use href="#dollar" /></svg>
                                    </div>
                                    <span className="text-[12px] font-black text-(--text-color) uppercase tracking-[0.2em]">OPERATIONS</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2.1: Merch Type */}
                    {step === 2.1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight">MERCHANDISE</h2>
                            <button onClick={() => setStep(1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-8 flex items-center gap-3 group transition-all"><span className="group-hover:-translate-x-1 transition-transform">←</span> BACK</button>
                            <div className="grid grid-cols-2 gap-5">
                                <button onClick={() => { set('subcategory', 'Acq'); setStep(4); }} className="flex flex-col items-center p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color) hover:border-(--text-color-secondary)/30 transition-all group">
                                    <span className="text-[11px] font-black text-(--text-color) uppercase tracking-[0.15em]">ACQUISITIONS</span>
                                </button>
                                <button onClick={() => { set('subcategory', 'Prod'); setStep(4); }} className="flex flex-col items-center p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color) hover:border-(--text-color-secondary)/30 transition-all group">
                                    <span className="text-[11px] font-black text-(--text-color) uppercase tracking-[0.15em]">PRODUCTION</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2.2: Op Type */}
                    {step === 2.2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight">OPERATING COSTS</h2>
                            <button onClick={() => setStep(1)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-8 flex items-center gap-3 group transition-all">← BACK</button>
                            <div className="grid grid-cols-2 gap-4">
                                {['Packing', 'Sppl', 'Labr', 'Oprt'].map(cat => (
                                    <button key={cat} onClick={() => { set('subcategory', cat); setStep(4); }}
                                        className="flex flex-col items-center p-6 rounded-[32px] bg-(--glass-bg) border border-(--border-color) hover:border-(--main-color)/40 transition-all">
                                        <span className="text-[10px] font-black text-(--text-color) uppercase tracking-widest text-center">{cat.toUpperCase()}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Core Details */}
                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-2 uppercase tracking-tight">DETAILS</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-8 uppercase tracking-widest font-bold">
                                Editing: <span className="text-(--main-color)">{normalizeSubcat(form.subcategory)}</span>
                                {form.vendor_id && <span className="ml-2 opacity-50">· {form.vendor_id}</span>}
                            </p>
                            <button onClick={() => setStep(1)} className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 hover:text-white/50 transition-colors">
                                <span>←</span> Re-classify Transaction
                            </button>

                            <div className="flex flex-col gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">DESCRIPTION</label>
                                    <input value={form.description} onChange={e => set('description', e.target.value)}
                                        className="w-full h-16 px-6 rounded-[24px] bg-(--glass-bg) border border-(--border-color) text-(--text-color) placeholder:text-(--text-color-secondary)/30 focus:border-(--main-color)/50 transition-all outline-none" placeholder="Brief summary of payment" />
                                </div>

                                <div className="flex flex-col gap-5">
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-3">
                                            <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">AMOUNT (MXN)</label>
                                            <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                                                className="w-full h-16 px-6 font-mono text-xl font-bold bg-(--glass-bg) border border-(--border-color) rounded-[24px] text-(--text-color) outline-none focus:border-(--main-color)/50 transition-all" placeholder="0.00" />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">REFERENCE</label>
                                            <input value={form.reference} onChange={e => set('reference', e.target.value)}
                                                className="w-full h-16 px-6 rounded-[24px] bg-(--glass-bg) border border-(--border-color) text-(--text-color) placeholder:text-(--text-color-secondary)/30 outline-none focus:border-(--main-color)/50 transition-all" placeholder="Optional #" />
                                        </div>
                                    </div>

                                    {/* Recurring Toggle */}
                                    <div className={`flex items-center justify-between p-5 rounded-[28px] border transition-all ${form.recurring ? 'bg-(--main-color)/5 border-(--main-color)/30' : 'bg-(--glass-bg) border-(--border-color)'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${form.recurring ? 'bg-(--main-color)/20' : 'bg-white/5'}`}>
                                                <svg className={`w-5 h-5 transition-all ${form.recurring ? 'text-(--main-color) opacity-100' : 'text-white opacity-30'}`}><use href="#repeat" /></svg>
                                            </div>
                                            <div>
                                                <span className="text-[11px] font-black text-(--text-color) uppercase tracking-widest block">RECURRING</span>
                                                <span className="text-[9px] text-(--text-color-secondary) font-bold uppercase">Repeats monthly on a fixed day</span>
                                            </div>
                                        </div>
                                        <button onClick={() => { set('recurring', !form.recurring); if (form.recurring) set('recurring_day', 1); }}
                                            className={`w-14 h-8 rounded-full transition-all relative shrink-0 ${form.recurring ? 'bg-(--main-color)' : 'bg-white/10'}`}>
                                            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all shadow-md ${form.recurring ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    {form.recurring && (
                                        <div className="animate-in slide-in-from-top-2 duration-200 space-y-3">
                                            <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">DAY OF MONTH</label>
                                            <div className="flex items-center gap-4">
                                                <input type="number" min="1" max="31" value={form.recurring_day} onChange={e => set('recurring_day', parseInt(e.target.value) || 1)}
                                                    className="w-32 h-14 font-mono text-xl font-bold bg-(--glass-bg) border border-(--main-color)/30 rounded-[20px] text-(--text-color) outline-none focus:border-(--main-color)/60 transition-all text-center" />
                                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">of each month</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">NOTES</label>
                                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                                        className="w-full h-20 px-6 py-4 rounded-[24px] bg-(--glass-bg) border border-(--border-color) text-(--text-color) placeholder:text-(--text-color-secondary)/30 focus:border-(--main-color)/50 transition-all outline-none resize-none text-sm" placeholder="Additional context…" />
                                </div>
                            </div>

                            <div className="flex gap-5 mt-10">
                                <button onClick={() => setStep(5)} className="flex-1 py-5 bg-(--main-color)/15 text-(--text-color) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--main-color)/25 transition-all">CONTINUE →</button>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Account Selection */}
                    {step === 5 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-3 uppercase tracking-tight">SOURCE</h2>
                            <p className="text-[11px] text-(--text-color-secondary) mb-8 uppercase tracking-widest font-bold">Select payment disbursement account</p>

                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(destinationsConfig).map(([key, cfg]) => (
                                    <button key={key} type="button"
                                        onClick={() => set('destination', key as PaymentDestination)}
                                        className={`flex flex-col items-center gap-3 p-6 rounded-[32px] border-2 transition-all ${form.destination === key ? 'border-(--main-color) bg-(--main-color)/10' : 'border-(--border-color) bg-(--glass-bg) hover:border-(--text-color-secondary)/30'}`}>
                                        <img src={cfg.icon} alt={cfg.name} className="h-10 w-auto object-contain mb-1" />
                                        <div className="text-[11px] font-black text-(--text-color) uppercase tracking-widest opacity-80">{cfg.name}</div>
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-5 mt-16">
                                <button onClick={() => setStep(4)} className="flex-1 py-5 border border-(--border-color) text-(--text-color-secondary) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--glass-bg) transition-all">BACK</button>
                                <button onClick={() => setStep(6)} disabled={!form.destination}
                                    className="flex-[1.5] py-5 bg-(--main-color)/15 text-(--text-color) rounded-[28px] text-[11px] font-black tracking-[0.2em] hover:bg-(--main-color)/25 transition-all disabled:opacity-40">CONTINUE TO TAXES</button>
                            </div>
                        </div>
                    )}

                    {/* Step 6: Taxes & Fees + Confirm */}
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
                                        <button onClick={() => { set('includeIva', !form.includeIva); if (!form.includeIva) set('includeComm', false); }}
                                            className={`w-14 h-8 rounded-full transition-all relative ${form.includeIva ? 'bg-green-500' : 'bg-white/10'}`}>
                                            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${form.includeIva ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between p-6 rounded-[32px] bg-(--glass-bg) border border-(--border-color)">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-(--text-color) uppercase tracking-widest">BANK COMISION (10%)</span>
                                            <span className="text-[9px] text-(--text-color-secondary) font-bold uppercase mt-1">Platform & transfer fees</span>
                                        </div>
                                        <button onClick={() => { set('includeComm', !form.includeComm); if (!form.includeComm) set('includeIva', false); }}
                                            className={`w-14 h-8 rounded-full transition-all relative ${form.includeComm ? 'bg-[#00AEEF]' : 'bg-white/10'}`}>
                                            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${form.includeComm ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-2">
                                    <label className="text-[10px] text-(--text-color-secondary) opacity-60 font-black uppercase tracking-[0.3em] block ml-1">MANUAL COMMISSION / FEE (MXN)</label>
                                    <input type="number" step="0.01" value={form.manualFee} onChange={e => set('manualFee', e.target.value)}
                                        className="w-full h-16 px-6 font-mono text-xl font-bold bg-(--glass-bg) border border-(--border-color) rounded-[24px] text-(--text-color) outline-none focus:border-(--main-color)/50 transition-all" placeholder="0.00" />
                                </div>

                                <div className="p-8 rounded-[40px] bg-(--glass-bg) border border-(--border-color)">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black text-(--text-color-secondary) uppercase tracking-[0.3em]">UPDATED TOTAL</span>
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
                                <button onClick={handleUpdate} disabled={saving}
                                    className="flex-[1.5] py-5 bg-(--main-color) text-black rounded-[28px] text-[11px] font-black tracking-[0.2em] disabled:opacity-40 transition-all shadow-xl hover:scale-[1.02] active:scale-95">
                                    {saving ? 'UPDATING…' : 'CONFIRM CHANGES'}
                                </button>
                            </div>
                        </div>
                    )}
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
    const [subcatFilter, setSubcatFilter] = useAtom(paymentCategoryFilterAtom);
    const [vendorFilter, setVendorFilter] = useAtom(paymentVendorFilterAtom);
    const [showAdd, setShowAdd] = useState(false);
    const [editRecord, setEditRecord] = useState<any | null>(null);
    const [requestGroup, setRequestGroup] = useState<VendorGroup | null>(null);
    const [overviewMode, setOverviewMode] = useAtom(paymentsOverviewModeAtom);
    const showFilters = useAtomValue(paymentFilterBarModeAtom) !== 'off';
    const financeSearch = useAtomValue(financeSearchTermAtom);
    const [liveExchangeRate, setLiveExchangeRate] = useAtom<number | null, [number | null], void>(liveExchangeRateAtom as any);
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useAtom(paymentStatusFilterAtom);
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

    // Auto-refresh payments list when finance or inventory data changes in the local RxDB.
    // This fires after any save (AddPayment, EditPayment, inventory update) without requiring a manual reload.
    useEffect(() => {
        if (!db) return;
        let timer: ReturnType<typeof setTimeout>;
        const triggerRefresh = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                setPaymentsVersion(v => v + 1);
                onRefresh();
            }, 300);
        };

        const finSub = db.finance.find().$.subscribe(triggerRefresh);
        const invSub = db.inventory.find().$.subscribe(triggerRefresh);

        return () => {
            clearTimeout(timer);
            finSub.unsubscribe();
            invSub.unsubscribe();
        };
    }, [db, onRefresh, setPaymentsVersion]);

    const pendingGroups = useMemo<VendorGroup[]>(() => {


        const targetStatuses = ['acquired', 'acquisition', 'acquisitions', 'production', 'new', 'scheduled', 'ready'];

        const pendingItems = inventory.filter(i => {
            const status = (i.data.status || '').toLowerCase();
            const payReqStr = String(i.data.payReq || (i.data as any).pay_req || '').toLowerCase();
            const workbook = String(i.data.workbook || '').toLowerCase();
            
            // Skip 825 and Prepaid items
            if (workbook === '825' || workbook === 'v825' || payReqStr === 'prepaid') return false;

            const isUnpaid = !['true', 'paid', 'requested', 'partial'].includes(payReqStr) && !payReqStr.includes('%');
            return targetStatuses.includes(status) && isUnpaid;
        });

        const pendingCrates = logisticsData.filter(c => {
            const payReqStr = String(c.pay_req || '').toLowerCase();
            const isUnpaid = !['true', 'paid', 'requested', 'partial'].includes(payReqStr) && !payReqStr.includes('%');
            return c.type === 'crate' && isUnpaid && (c.cost_mxn || 0) > 0;
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

        // Group by BOTH Vendor and Type (Production vs Acquisition)
        const groups: Record<string, VendorGroup & { type: 'Production' | 'Acquisition' }> = {};
        for (const item of itemsToProcess) {
            const data = item.data;
            const itemIdStr = String(data.item_id || data.itemId || '');
            let vid = data.vendor_id || data.vendorId;
            const status = (data.status || '').toLowerCase();
            const type = (status === 'production' || status === 'packing') ? 'Production' : 'Acquisition';

            if (!vid) {
                if (itemIdStr.includes('-')) {
                    vid = itemIdStr.split('-')[0];
                } else {
                    const prefix = Object.keys(vendors).find(v => itemIdStr.startsWith(v));
                    if (prefix) vid = prefix;
                }
            }
            if (!vid) vid = 'Unknown';

            const gKey = `${vid}-${type}`;
            if (!groups[gKey]) {
                groups[gKey] = { vendorId: vid, type, items: [], total: 0, totalQty: 0, paidTotal: 0 };
            }

            const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
            const qty = parseFloat(data.quantity || '1') || 1;
            groups[gKey].items.push(item);
            groups[gKey].total += (price * qty);
            groups[gKey].totalQty += qty;
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

                const statusMatch = statusFilter === 'All' || r.status === statusFilter;
                const searchMatch = searchWords.length === 0 || searchWords.every(word => searchSource.includes(word));

                return subcatMatch && destMatch && vendorMatch && statusMatch && searchMatch;
            })
            .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
    }, [docs, subcatFilter, destinationFilter, vendorFilter, financeSearch, statusFilter]);

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
                const rel = r.related_ids || r.related_inventory_ids || '';
                const idsArray = Array.isArray(rel) ? rel.map(id => String(id)) : (typeof rel === 'string' ? rel.split(',').map(s => s.trim()).filter(Boolean) : []);
                const idsStr = idsArray; // Now it's an array, let's keep consistency in names below if needed
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
        <div className="flex flex-col m-0 gap-0">
            <AddPaymentModal
                isOpen={showAdd}
                onClose={() => setShowAdd(false)}
                onSaved={() => { setPaymentsVersion(v => v + 1); setInventoryVersion(v => v + 1); onRefresh(); }}
                pendingGroups={pendingGroups}
            />
            <EditPaymentModal
                record={editRecord}
                onClose={() => setEditRecord(null)}
                onSaved={() => { setPaymentsVersion(v => v + 1); onRefresh(); }}
            />
            <RequestPaymentModal
                group={requestGroup}
                onClose={() => setRequestGroup(null)}
                onConfirm={handleRequestPayment}
            />

            {/* ── STICKY GLASSMORPHIC HEADER ── */}
            <div className="sticky top-20 sm:top-24 z-[95] flex flex-col bg-black/40 backdrop-blur-3xl border-b border-white/10 shadow-2xl">
                    {/* General Overview & Stats Grids */}
                    {overviewMode !== 'collapsed' && (
                        <div className={`flex flex-col shrink-0 border-b border-white/5 ${overviewMode === 'extended' ? 'p-3 px-6' : 'p-1.5 px-4'} transition-all duration-300 relative`}>
                            
                            {/* Compact Mode Vendor Bubbles */}
                            {overviewMode !== 'extended' && pendingGroups.length > 0 && (
                                <div className="flex items-center gap-2 mb-2 px-1 animate-in fade-in slide-in-from-left-2 duration-500">
                                    {pendingGroups.map(group => {
                                        const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#888';
                                        const paidPerc = Math.round((group.paidTotal / group.total) * 100);
                                        return (
                                            <button key={group.vendorId} 
                                                onClick={() => setPaymentsArtifactConfig({ isOpen: true, vendor: group.vendorId, title: `Payment History: ${group.vendorId}` })}
                                                className="group relative flex items-center justify-center w-6 h-6 rounded-full transition-all hover:scale-125 cursor-pointer ring-0 hover:ring-2 ring-(--text-color)/20"
                                                title={`${group.vendorId}: ${paidPerc}% Paid (${fmtMXN(group.total - group.paidTotal)} pending)`}
                                                style={{ 
                                                    background: `conic-gradient(${color} 0% ${paidPerc}%, var(--border-color) ${paidPerc}% 100%)`,
                                                    padding: '1.5px'
                                                }}>
                                                <div className="w-full h-full rounded-full bg-black/80 flex items-center justify-center text-[7px] font-black backdrop-blur-sm shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                                                    style={{ color }}>
                                                    {group.vendorId[0]}
                                                </div>
                                                {/* Minimal pulse indicator if 0% paid */}
                                                {paidPerc === 0 && (
                                                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-(--text-color)/20 animate-pulse border border-(--text-color)/10" style={{ backgroundColor: color }} />
                                                )}
                                            </button>
                                        );
                                    })}
                                    <div className="w-px h-3 bg-white/10 mx-1" />
                                    <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">Ongoing Liquidations</span>
                                </div>
                            )}
                            {/* Primary Grid: Rates & Summary Totals */}
                            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${overviewMode === 'extended' ? 'gap-3' : 'gap-1.5'} mb-1`}>
                                {/* Exchange Rates Card */}
                                <div className={`group relative flex flex-col ${overviewMode === 'extended' ? 'p-3 px-4' : 'p-2 px-3'} rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all`}>
                                    <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <TrendingUp size={14} className="text-[#6BCEBB]" />
                                    </div>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1 leading-none">FX Rates</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-bold text-white/10 uppercase mb-0.5">Wbk</span>
                                            <span className={`font-mono font-black text-[#FACC15] ${overviewMode === 'extended' ? 'text-[14px]' : 'text-[11px]'}`}>{exchangeRate.toFixed(2)}</span>
                                        </div>
                                        <div className="flex flex-col border-l border-white/5 pl-3">
                                            <span className="text-[8px] font-bold text-white/10 uppercase mb-0.5">Live</span>
                                            <span className={`font-mono font-black text-[#6BCEBB] ${overviewMode === 'extended' ? 'text-[14px]' : 'text-[11px]'}`}>{liveExchangeRate ? liveExchangeRate.toFixed(2) : '...'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Paid Total Card */}
                                <div className={`group relative flex flex-col ${overviewMode === 'extended' ? 'p-3 px-4' : 'p-2 px-3'} rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all`}>
                                    <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <CheckCircle size={14} className="text-[#6BCEBB]" />
                                    </div>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1 leading-none">Total Paid</span>
                                    <div className="flex items-center gap-2 leading-tight">
                                        <span className={`font-black font-mono text-[#6BCEBB] tracking-tighter ${overviewMode === 'extended' ? 'text-[22px]' : 'text-[16px]'}`}>
                                            {currencyMode === 'MXN' ? fmtMXN(statusTotals.Paid || 0) : fmtUSD((statusTotals.Paid || 0) / rate)}
                                        </span>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5`}>
                                            {currencyMode}
                                        </span>
                                    </div>
                                </div>

                                {/* Pending Total Card */}
                                <div className={`group relative flex flex-col ${overviewMode === 'extended' ? 'p-3 px-4' : 'p-2 px-3'} rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all`}>
                                    <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <Clock size={14} className="text-[#FACC15]" />
                                    </div>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1 leading-none">Total Pending</span>
                                    <div className="flex items-center gap-2 leading-tight">
                                        <span className={`font-black font-mono text-[#FACC15] tracking-tighter ${overviewMode === 'extended' ? 'text-[22px]' : 'text-[16px]'}`}>
                                            {currencyMode === 'MXN' ? fmtMXN(statusTotals.Requested + statusTotals.Pending || 0) : fmtUSD((statusTotals.Requested + statusTotals.Pending || 0) / rate)}
                                        </span>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5`}>
                                            {currencyMode}
                                        </span>
                                    </div>
                                </div>

                                {/* Summary View / Currency Toggle Card */}
                                <div className={`group relative flex flex-col ${overviewMode === 'extended' ? 'p-3 px-4' : 'p-2 px-3'} rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all`}>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1 leading-none">Perspective</span>
                                    <div className="flex items-center justify-between gap-2 h-full">
                                        <div className="flex items-center gap-1.5 bg-black/20 p-1 rounded-xl border border-white/5">
                                            <button onClick={() => setCurrencyMode('MXN')} className={`px-2 py-1 rounded-lg text-[9px] font-black transition-all ${currencyMode === 'MXN' ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>MXN</button>
                                            <button onClick={() => setCurrencyMode('USD')} className={`px-2 py-1 rounded-lg text-[9px] font-black transition-all ${currencyMode === 'USD' ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>USD</button>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => setOverviewMode(p => p === 'extended' ? 'compact' : 'extended')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/30 hover:text-white hover:bg-white/10 transition-all">
                                                {overviewMode === 'extended' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                            </button>
                                            <button onClick={() => setOverviewMode('collapsed')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Extended Mode: Individual Vendor Progress Bars */}
                            {overviewMode === 'extended' && pendingGroups.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-2 pt-3 border-t border-white/5 animate-in slide-in-from-top duration-500">
                                    {pendingGroups.map(group => {
                                        const color = vendors[group.vendorId as keyof typeof vendors]?.color || '#888';
                                        const paidPerc = Math.round((group.paidTotal / group.total) * 100);
                                        return (
                                            <div key={group.vendorId} className="flex flex-col gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/5 group/v">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-lg flex items-center justify-center text-[8px] font-black text-black" style={{ backgroundColor: color }}>{group.vendorId[0]}</div>
                                                        <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">{group.vendorId}</span>
                                                    </div>
                                                    {paidPerc > 0 ? <span className="text-[9px] font-black text-white/20 uppercase tracking-tighter">{paidPerc}% PAID</span> : <div />}
                                                </div>
                                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                                    <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${paidPerc}%`, backgroundColor: color, boxShadow: `0 0 10px ${color}40` }} />
                                                </div>
                                                <div className="flex items-center justify-between mt-1">
                                                    {paidPerc > 0 ? <span className="text-[9px] font-black text-white/30 uppercase">{paidPerc}% Paid</span> : <div />}
                                                    <div className="flex items-center gap-3">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const ids = group.items.map(i => i.row || (i.data as any).id).filter(Boolean);
                                                                setArtifactConfig({ isOpen: true, itemIds: ids, title: `Items for ${group.vendorId}` });
                                                            }}
                                                            className="flex items-center gap-1.5 text-[9px] font-black text-(--main-color)/60 hover:text-(--main-color) transition-colors uppercase tracking-widest"
                                                        >
                                                            <LayoutGrid size={11} /> Items
                                                        </button>
                                                        <button 
                                                            onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  setPaymentsArtifactConfig({ isOpen: true, vendor: group.vendorId, title: `Payment History: ${group.vendorId}` });
                                                              }}
                                                            className="flex items-center gap-1.5 text-[9px] font-black text-sky-400/60 hover:text-sky-400 transition-colors uppercase tracking-widest border-l border-white/10 pl-3"
                                                        >
                                                            <Receipt size={11} /> Ledger
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

                    {/* ── Toggleable Filter Bar LIFTED TO MainAppView ── */}
                </div>

                <div className="p-2 space-y-1 pb-32">
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

                            const accentColor = r.status === 'Paid' ? '#22c55e' : '#eab308';

                            return (
                                    <div key={r.id} 
                                        className={`group relative flex flex-col p-3 bg-(--text-color)/5 border-b border-(--text-color)/5 transition-all hover:bg-(--text-color)/7 ${isExpanded ? 'bg-(--text-color)/8 my-3 rounded-xl border z-10' : ''}`}
                                        style={{ 
                                            borderColor: isExpanded ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)',
                                            borderLeftWidth: isExpanded ? '1px' : '4px',
                                            borderLeftColor: accentColor,
                                            boxShadow: isExpanded ? `0 20px 50px -12px color-mix(in srgb, ${accentColor}, transparent 90%)` : 'none'
                                        }}>
                                    
                                    <div className="flex items-center gap-2 cursor-pointer no-select" onClick={() => toggleRow(r.id)}>
                                        {/* Column 1: Compact Icon + Date Stack */}
                                        <div className="shrink-0 flex items-center gap-2 sm:gap-3 border-r border-(--text-color)/5 pr-2 sm:pr-4 min-w-[80px] sm:min-w-[120px]">
                                            <cat.icon size={14} style={{ color: cat.color }} className="shrink-0 opacity-80" />
                                            <div className="flex flex-col items-start justify-center gap-1">
                                                <span className="text-[10px] sm:text-[11px] font-black tracking-tighter text-(--text-color) opacity-80 leading-none">{r.date ? new Date(r.date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}</span>
                                                {/* Payment Status Indicator Pill */}
                                                {(() => {
                                                    const isPartial = String(r.description || '').includes('%');
                                                    const isPaid = r.status === 'Paid';
                                                    if (isPartial && isPaid) return (
                                                        <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full text-[6px] sm:text-[7px] font-black uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/20">
                                                            <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-orange-400 animate-pulse" />PARTIAL
                                                        </span>
                                                    );
                                                    if (isPaid) return (
                                                        <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full text-[6px] sm:text-[7px] font-black uppercase tracking-wider bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/20">
                                                            <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-[#22c55e]" />PAID
                                                        </span>
                                                    );
                                                    if (isPartial) return (
                                                        <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full text-[6px] sm:text-[7px] font-black uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/20">
                                                            <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-red-400 animate-pulse" />PARTIAL
                                                        </span>
                                                    );
                                                    return (
                                                        <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full text-[6px] sm:text-[7px] font-black uppercase tracking-wider bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20">
                                                            <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-[#eab308] animate-pulse" />PENDING
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Column 2: Simplified Vendor / Description Logic */}
                                        <div className="flex-1 min-w-0 px-2 sm:px-3 flex items-center gap-2 sm:gap-4 overflow-hidden">
                                             {/* Vendor Tag First as Solid Block */}
                                             {r.vendor_id === 'CRATES' ? (
                                                 <div className="flex items-center gap-1 py-1 sm:py-1.5 px-2 rounded bg-white/5 border border-white/10 shrink-0">
                                                     <Box size={10} className="text-white/40" />
                                                     <span className="text-[8px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest leading-none">CRATES</span>
                                                 </div>
                                             ) : r.vendor_id && (
                                                 <span className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded text-[8px] sm:text-[11px] font-black uppercase tracking-tight whitespace-nowrap shrink-0 shadow-sm" 
                                                       style={{ backgroundColor: vendorColor, color: getTextColorForBg(vendorColor) }}>
                                                     {r.vendor_id}
                                                 </span>
                                             )}

                                            <div className="min-w-0 flex-1 flex items-center gap-2">
                                                <h4 className="text-[12px] sm:text-[14px] font-black text-white uppercase tracking-wider truncate leading-none">{r.description || r.notes || 'Unnamed Transaction'}</h4>
                                                {r.recurring && <Clock size={10} className="text-orange-500 opacity-50 shrink-0" />}
                                            </div>
                                        </div>

                                        {/* Column 3: Financials & Account Icon Segment */}
                                        <div className="shrink-0 flex items-center justify-end gap-2 sm:gap-4 w-auto min-w-[90px] sm:min-w-[170px]">
                                            <div className="flex items-center gap-2 sm:gap-4">
                                                {(r.commission || 0) > 0 && (
                                                     <>
                                                         <div className="hidden xl:flex flex-col items-end gap-0.5">
                                                             <span className="text-[7px] font-black uppercase tracking-widest text-(--text-color)/30">Net Paid</span>
                                                             <span className="text-[10px] sm:text-[11px] font-mono font-bold text-(--text-color)/70">
                                                                 {currencyMode === 'MXN' ? fmtMXN(r.amount || 0) : fmtUSD((r.amount || 0) / (liveExchangeRate || exchangeRate))}
                                                             </span>
                                                         </div>
                                                         <div className="hidden xl:flex flex-col items-end gap-0.5">
                                                             <span className="text-[7px] font-black uppercase tracking-widest text-red-500/40">Taxes</span>
                                                             <span className="text-[10px] sm:text-[11px] font-mono font-bold text-red-400/80">
                                                                 {currencyMode === 'MXN' ? fmtMXN(r.commission || 0) : fmtUSD((r.commission || 0) / (liveExchangeRate || exchangeRate))}
                                                             </span>
                                                         </div>
                                                     </>
                                                )}
                                                <div className={`flex flex-col items-end gap-0.5 ${(r.commission || 0) > 0 ? 'xl:border-l xl:border-(--text-color)/10 xl:pl-4' : ''}`}>
                                                    <span className={`text-[7px] font-black uppercase tracking-widest ${(r.commission || 0) > 0 ? 'text-sky-400/50' : 'text-(--text-color)/30'}`}>Total {currencyMode}</span>
                                                    <div className="flex items-center justify-end gap-1 sm:gap-1.5 leading-none">
                                                        <span className="text-[13px] sm:text-[16px] font-black font-mono text-(--text-color) tracking-tighter">
                                                            {currencyMode === 'MXN' ? fmtMXN(totalNet) : fmtUSD(totalUSD)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card Icon */}
                                            <div className="shrink-0 w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center relative">
                                                {destCfg ? (
                                                    <img src={destCfg.icon} className="max-w-full max-h-full object-contain brightness-110 drop-shadow-[0_0_12px_rgba(255,255,255,0.15)] group-hover:scale-110 transition-transform" />
                                                ) : (
                                                    <Info size={12} className="text-(--text-color)/10" />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Content: High-Density Metadata Strip */}
                                    {isExpanded && (
                                        <div className="mt-3 pt-3 border-t border-(--text-color)/5 animate-in slide-in-from-top-2 duration-300">
                                            {/* Scrollable Metadata Strip */}
                                            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-3 mb-2 px-1">
                                                {/* Detail Block 1: Notes/Description */}
                                                <div className="shrink-0 min-w-[180px] sm:min-w-[240px]">
                                                    <span className="text-[8px] sm:text-[9px] font-black text-(--text-color)/20 uppercase tracking-widest block mb-1">Transactional Context</span>
                                                    <p className="text-[10px] sm:text-[12px] font-medium text-(--text-color)/60 leading-tight italic truncate max-w-[300px]">"{r.notes || r.description || 'No additional notes.'}"</p>
                                                </div>

                                                <div className="w-px h-8 bg-(--text-color)/5 shrink-0" />

                                                {/* Detail Block 2: Taxes/Fees */}
                                                <div className="shrink-0 text-right">
                                                    <span className="text-[8px] sm:text-[9px] font-black text-(--text-color)/20 uppercase tracking-widest block mb-1">Tax</span>
                                                    <span className="text-[9px] sm:text-[11px] font-mono font-bold text-red-500/60 whitespace-nowrap">
                                                        {currencyMode === 'MXN' ? fmtMXN(r.commission || 0) : fmtUSD((r.commission || 0) / (liveExchangeRate || exchangeRate))}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Linked Assets Strip (Asset Hub) */}
                                            <div className="pt-2 border-t border-(--text-color)/5 mt-2">
                                                <div className="flex items-center justify-between mb-2 px-1">
                                                    <span className="text-[8px] sm:text-[9px] font-black text-(--text-color)/20 uppercase tracking-[0.3em] block">Linked Assets & Traceability</span>
                                                </div>
                                                    {(() => {
                                                        const rel = r.related_ids || r.related_inventory_ids || '';
                                                        const rawIds = Array.isArray(rel) ? rel.map(id => String(id)) : (typeof rel === 'string' ? rel.split(',').map(s => s.trim()).filter(Boolean) : []);

                                                        if (rawIds.length === 0) return (
                                                            <div className="py-8 border border-dashed border-(--text-color)/10 rounded-xl flex items-center justify-center opacity-20">
                                                                <span className="text-[10px] font-mono uppercase tracking-[0.2em]">No direct items linked</span>
                                                            </div>
                                                        );

                                                        // Grouping Phase
                                                        const grouped: Record<string, { 
                                                            id: string; 
                                                            ids: string[];
                                                            invItem: any; 
                                                            logCrate: any; 
                                                            groupCount: number;
                                                        }> = {};

                                                        rawIds.forEach(id => {
                                                            const invItem = inventory.find(i => String(i.row) === id || i.data.itemId === id || i.data.item_id === id || i.data.id === id);
                                                            const logCrate = logisticsData.find(l => String(l.id) === id);

                                                            // Uniqueness fingerprint
                                                            let key = id;
                                                            if (invItem) {
                                                                key = `inv_${invItem.data.itemId || invItem.data.id}_${invItem.data.vendor_id || invItem.data.vendorId}`;
                                                            } else if (logCrate) {
                                                                key = `log_${logCrate.type}_${logCrate.width_cm}_${logCrate.length_cm}_${logCrate.height_cm}_${logCrate.vendor_id}`;
                                                            }

                                                            if (!grouped[key]) {
                                                                grouped[key] = { id, ids: [id], invItem, logCrate, groupCount: 1 };
                                                            } else {
                                                                grouped[key].groupCount++;
                                                                grouped[key].ids.push(id);
                                                            }
                                                        });
                                                        
                                                        return (
                                                            <div className="flex flex-col gap-2 overflow-x-auto no-scrollbar pb-2">
                                                                {Object.values(grouped).map(({ id, ids, invItem, logCrate, groupCount }) => {
                                                                    if (!invItem && !logCrate) return (
                                                                        <div key={id} className="h-10 shrink-0 flex items-center gap-3 px-3 grayscale opacity-30">
                                                                            <span className="text-[9px] font-mono uppercase truncate opacity-50">{id}</span>
                                                                        </div>
                                                                    );

                                                                    const norm = invItem ? normalizeInventoryData(invItem.data) : null;
                                                                    const codes = norm ? calculateCodesAndPrices(norm, liveExchangeRate || exchangeRate, '326') : null;
                                                                    
                                                                    const subcat = invItem?.data.category || logCrate?.type || 'Asset';
                                                                    const img = invItem?.imageUrl || (invItem?.data.mediaUrls ? invItem.data.mediaUrls.split(',')[0] : null);
                                                                    const priceNum = parseFloat(String(invItem?.data.price_mxn || invItem?.data.price || logCrate?.cost_mxn || '0'));
                                                                    const vId = invItem?.data.vendor_id || invItem?.data.vendorId || logCrate?.vendor_id || r.vendor_id || 'UNKNOWN';
                                                                    const vColor = vendors[vId as keyof typeof vendors]?.color || '#888';
                                                                    
                                                                    const baseTag = codes?.bookBarcode || id;
                                                                    const tagId = groupCount > 1 ? `${baseTag.slice(0, 10)}... +${groupCount - 1}` : baseTag;
                                                                    const shape = norm?.shape || (logCrate?.type === 'pallet' ? 'Pallet' : 'Crate');
                                                                    const material = norm?.material || '';
                                                                    const color = norm?.color || '';
                                                                    
                                                                    const packedItems = logCrate?.inventory_ids ? logCrate.inventory_ids.split(',').filter(Boolean).length : 0;
                                                                    const unitQty = norm?.quantity || (logCrate ? (packedItems || 1) : 1);
                                                                    const totalQty = unitQty * groupCount;
                                                                    const totalLine = priceNum * (logCrate ? groupCount : totalQty); 

                                                                    const dims = invItem 
                                                                        ? formatDimensionsImperial(norm.widthCm, norm.heightCm, norm.lengthCm) 
                                                                        : (logCrate ? `${logCrate.width_cm}×${logCrate.length_cm}×${logCrate.height_cm} CM` : '');
                                                                    const weight = invItem ? formatWeightImperial(norm.weightKg) : '';

                                                                    return (
                                                                        <div key={id} className="flex items-center gap-8 py-4 px-4 hover:bg-(--text-color)/5 border border-(--text-color)/5 rounded-xl transition-all group/item relative shrink-0 min-w-[1200px]">
                                                                            {/* Thumbnail / Wireframe */}
                                                                            <div className="w-16 h-16 rounded-xl bg-black/40 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center relative">
                                                                                {invItem ? (
                                                                                    img ? (
                                                                                        <img src={getCleanImageUrl(img) || ''} className="w-full h-full object-cover opacity-60 group-hover/item:opacity-100 transition-opacity" />
                                                                                    ) : (
                                                                                        <Box size={20} className="text-white/10" />
                                                                                    )
                                                                                ) : logCrate ? (
                                                                                    <div className="opacity-80 group-hover/item:opacity-100 transition-opacity relative">
                                                                                        <WireframeCrate 
                                                                                            w={logCrate.width_cm} 
                                                                                            l={logCrate.length_cm} 
                                                                                            h={logCrate.height_cm} 
                                                                                            type={logCrate.type}
                                                                                            vibrant
                                                                                            size={40}
                                                                                        />
                                                                                        {groupCount > 1 && (
                                                                                            <div className="absolute -bottom-1 -right-1 bg-(--main-color) text-black text-[8px] font-black px-1 rounded-sm shadow-xl border border-black/20 flex items-center h-4">
                                                                                                x{groupCount}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <Box size={20} className="text-white/10" />
                                                                                )}
                                                                            </div>

                                                                            {/* Primary Info Block */}
                                                                            <div className="flex flex-col min-w-[200px] max-w-[250px]">
                                                                                <div className="flex items-baseline gap-2 mb-1">
                                                                                    <span className="text-[13px] font-black text-(--text-color)/90 uppercase tracking-tight">{shape}</span>
                                                                                    <span className="text-[10px] font-bold text-(--text-color)/40 uppercase tracking-widest">{subcat}</span>
                                                                                    <span className="text-[12px] font-black text-(--main-color) ml-2">x{totalQty} {logCrate ? 'units' : ''}</span>
                                                                                </div>
                                                                                <span className="text-[9px] font-bold text-(--text-color)/20 uppercase tracking-[0.2em] leading-none truncate">
                                                                                    {invItem ? [color, material].filter(Boolean).join(' • ') : (logCrate?.description || 'LOGISTICS UNIT')}
                                                                                </span>
                                                                            </div>

                                                                            {/* Identity Hub Pill */}
                                                                            <div className={`flex flex-col shrink-0 min-w-[80px] transition-opacity ${logCrate ? 'opacity-0 pointer-events-none' : ''}`}>
                                                                                <span className="text-[8px] font-black text-(--text-color)/10 uppercase tracking-widest leading-none mb-2">Tag ID</span>
                                                                                <span className="px-2 py-1 rounded-[6px] text-[9px] font-black uppercase tracking-tight shadow-lg" style={{ backgroundColor: vColor, color: getTextColorForBg(vColor) }}>
                                                                                    {tagId}
                                                                                </span>
                                                                            </div>

                                                                            {/* Technical Spec Column */}
                                                                            <div className="flex flex-col shrink-0 min-w-[200px]">
                                                                                <span className="text-[8px] font-black text-(--text-color)/10 uppercase tracking-widest leading-none mb-2">Size / Weight</span>
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[11px] font-black text-(--text-color)/60 uppercase leading-tight tracking-widest">{dims || 'N/A'}</span>
                                                                                    {logCrate ? (
                                                                                        <span className="text-[8px] font-bold text-(--text-color)/20 uppercase leading-none mt-1 font-mono tracking-tighter">
                                                                                            {ids[0].toUpperCase()} {groupCount > 1 ? ` (+${groupCount - 1} MORE)` : ''}
                                                                                        </span>
                                                                                    ) : weight && (
                                                                                        <span className="text-[9px] font-bold text-(--text-color)/30 uppercase leading-tight">{weight}</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            {/* Financial Column: Price */}
                                                                            <div className="flex flex-col shrink-0 min-w-[100px]">
                                                                                <span className="text-[8px] font-black text-(--text-color)/10 uppercase tracking-widest leading-none mb-2">Unit Price</span>
                                                                                <span className="text-[11px] font-black text-(--text-color)/70 uppercase tracking-widest leading-none">
                                                                                    {fmtMXN(priceNum)}
                                                                                </span>
                                                                            </div>

                                                                            {/* Financial Column: Total */}
                                                                            <div className="flex flex-col shrink-0 min-w-[120px]">
                                                                                <span className="text-[8px] font-black text-(--text-color)/10 uppercase tracking-widest leading-none mb-2">Line Total</span>
                                                                                <span className="text-[12px] font-black text-(--main-color) uppercase tracking-widest leading-none">
                                                                                    {fmtMXN(totalLine)}
                                                                                </span>
                                                                            </div>

                                                                            {/* Diagnostic Columns: AQ/LD Codes */}
                                                                            <div className="flex items-center gap-8 ml-auto pr-4">
                                                                                <div className="flex flex-col items-center">
                                                                                    <span className="text-[8px] font-black text-(--text-color)/10 uppercase tracking-widest leading-none mb-2">AQ Code</span>
                                                                                    <span className="text-[11px] font-black text-(--text-color)/60 font-mono">{codes?.bookAqCode || '—'}</span>
                                                                                </div>
                                                                                <div className="flex flex-col items-center">
                                                                                    <span className="text-[8px] font-black text-(--text-color)/10 uppercase tracking-widest leading-none mb-2">LD Code</span>
                                                                                    <span className="text-[11px] font-black text-(--main-color) font-mono opacity-80">{codes?.bookLandCode || '—'}</span>
                                                                                </div>
                                                                                <div className="flex flex-col items-end">
                                                                                    <span className="text-[8px] font-black text-(--text-color)/10 uppercase tracking-widest leading-none mb-2">Status</span>
                                                                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20">
                                                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                                                                                        <span className="text-[8px] font-black text-[#22c55e] uppercase">Paid</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    })()}
                                            </div>

                                                    {/* Relocated Actions Footnote */}
                                                    <div className="mt-6 pt-4 border-t border-(--text-color)/5 flex items-center justify-between px-1">
                                                        <div className="flex items-center gap-3">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleToggleStatus(r); }}
                                                                className={`flex items-center gap-2 h-8 px-4 rounded-lg border transition-all hover:scale-105 active:scale-95 ${r.status === 'Paid' ? 'bg-[#22c55e]/10 border-[#22c55e]/20 text-[#22c55e]' : 'bg-[#eab308]/10 border-[#eab308]/20 text-[#eab308]'}`}>
                                                                {r.status === 'Requested' ? <Clock size={14} /> : <CheckCircle size={14} />}
                                                                <span className="text-[9px] font-black uppercase tracking-widest">Mark as {r.status === 'Requested' ? 'Paid' : 'Requested'}</span>
                                                            </button>
                                                            {(user?.role === 'Admin' || user?.role === 'Developer') && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setEditRecord(r); }}
                                                                    className="flex items-center gap-2 h-8 px-4 rounded-lg bg-(--text-color)/5 border border-(--text-color)/10 text-(--text-color)/40 hover:text-(--text-color) hover:bg-(--text-color)/10 transition-all hover:scale-105 active:scale-95">
                                                                    <Pencil size={14} />
                                                                    <span className="text-[9px] font-black uppercase tracking-widest">Edit Payment</span>
                                                                </button>
                                                            )}
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

            {/* ── NEW REQUEST TRIGGER (Glassmorphic Bar) ── */}
                {(user?.role === 'Admin' || user?.role === 'Developer') && (
                    <div className="sticky bottom-0 left-0 right-0 z-50">
                        <button 
                            onClick={() => setShowAdd(true)}
                            className="w-full flex items-center justify-center gap-4 py-8 bg-black/40 backdrop-blur-3xl border-t border-white/10 text-(--main-color) hover:bg-(--main-color)/10 hover:text-white active:bg-(--main-color)/20 transition-all group shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
                        >
                            <div className="relative">
                                <Plus className="w-8 h-8 sm:w-10 sm:h-10 stroke-[3] group-hover:scale-110 transition-transform" />
                                <div className="absolute -inset-2 bg-(--main-color)/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="flex flex-col items-start text-left">
                                <span className="text-sm sm:text-base font-black uppercase tracking-[0.5em] leading-none">New Request</span>
                                <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-1">Launch Payment Wizard</span>
                            </div>
                        </button>
                    </div>
                )}
            

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
                        <path d="m15 12-8.5 8.5" /><path d="M12 9l3-3" /><path d="m21 7-2 2" /><path d="M11 11l5 5" />
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
        </div>
    );
};
