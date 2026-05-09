
import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import { PaymentDestination, FinanceRecord, InventoryItem } from '../../lib/Types';
import { vendors, appUsers } from '../../lib/consts';
import { paymentsVersionAtom, userAtom, inventoryAtom, InventoryVersionAtom, paymentDestinationFilterAtom, exchangeRateAtom, paymentsOverviewModeAtom, liveExchangeRateAtom, paymentFilterBarModeAtom, financeSearchTermAtom, logisticsDataAtom, isSyncingAtom, inventoryArtifactConfigAtom, paymentsArtifactConfigAtom, currencyModeAtom, paymentCategoryFilterAtom, paymentVendorFilterAtom, paymentStatusFilterAtom, financeTotalsAtom } from '../../lib/atoms';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { useDatabase, useNotify } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg, calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, isVideoFile, formatDimensionsImperial, formatWeightImperial } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';
import { 
    Calendar, Box, Users, Archive, Cpu, DollarSign, Activity, Wallet, 
    TrendingUp, Plus, Search, Filter, ArrowUpRight, CheckCircle, 
    Clock, AlertCircle, Info, ChevronDown, ChevronRight, LayoutGrid, List, Trash2, Receipt, Link, Pencil, Edit3, Video, Layers, Minimize2, X as CloseIcon
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
    const notify = useNotify();
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
            return notify.error('Fill in description, amount, and select an account.');
        }
        setSaving(true);
        const toastId = notify.loading('Saving artifact…');
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
                } else {
                    const table = isProd ? 'production' : 'inventory';
                    const upStatus = isPartial ? `requested ${perc}%` : 'true';
                    const upPayload = { pay_req: upStatus, payReq: upStatus };
                    
                    await supabase.from(table).update({ pay_req: upStatus }).in('id', ids);
                    if (db) {
                        for (const iid of ids) {
                            try {
                                const coll = isProd ? db.production : db.inventory;
                                const doc = await coll.findOne({ selector: { id: iid } }).exec();
                                if (doc) await doc.patch(upPayload);
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

            notify.success('Record added!', { id: toastId });
            onSaved();
            onClose();
        } catch (err: any) {
            notify.error(err.message, { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[1000] flex justify-center items-start pt-12 md:pt-24 animate-in fade-in duration-1000 overflow-hidden">
            {/* ── IMMERSIVE BACKDROP ── */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-xl" onClick={onClose} />
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-orange-500/5 pointer-events-none" />

            <div className="relative w-full max-w-5xl h-[85vh] bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-[48px] flex flex-col overflow-hidden animate-in slide-in-from-bottom-12 duration-1000 ease-out no-select shadow-[0_0_120px_rgba(0,0,0,0.6)]" onClick={e => e.stopPropagation()}>

                {/* ── IMMERSIVE HEADER ─────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-8 md:px-20 py-10 md:py-16 z-20 shrink-0">
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-6">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                <Wallet size={24} className="text-(--main-color)" />
                            </div>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-4 mb-1">
                                    <h1 className="text-xl md:text-3xl font-black uppercase tracking-[0.4em] leading-none text-white">PROTOCOL</h1>
                                    <span className="h-[1px] w-8 bg-white/20" />
                                    <span className="text-[10px] font-black text-blue-500 tracking-[0.3em] uppercase">Disbursement</span>
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-[0.6em] text-white/30">V.04_FINANCE_MODULE</span>
                            </div>
                        </div>
                        
                        {/* High-Fidelity Progress Strip */}
                        <div className="flex gap-4">
                            {[1, 2.1, 3.1, 4, 5, 6].map((s, idx) => {
                                const isActive = step === s || (s === 2.1 && step === 2.2) || (s === 3.1 && step === 3.2);
                                const isPassed = step > s || (step === 2.2 && s < 2) || (step === 3.2 && s < 3);
                                return (
                                    <div key={idx} className="flex flex-col gap-2">
                                        <div className={`h-1.5 rounded-full transition-all duration-1000 ${isActive ? 'w-16 bg-(--main-color) shadow-[0_0_20px_rgba(var(--main-color-rgb),0.5)]' : isPassed ? 'w-8 bg-white/40' : 'w-4 bg-white/5'}`} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <button 
                        onClick={onClose} 
                        className="group relative w-16 h-16 flex items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-500 active:scale-90"
                    >
                        <CloseIcon className="w-8 h-8 text-white/40 group-hover:text-white transition-colors" strokeWidth={1} />
                        <div className="absolute inset-0 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 blur-xl transition-opacity" />
                    </button>
                </div>

                {/* ── MAIN CONTENT (FREE FLOATING) ───────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden px-8 md:px-20 pb-12">
                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        {/* Stage 1: Classification */}
                        {step === 1 && (
                            <div className="h-full flex flex-col justify-center items-center max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-20 duration-1000">
                                <div className="text-center mb-16">
                                    <p className="text-[11px] text-white uppercase tracking-[1em] font-black drop-shadow-lg">
                                        SELECT_PROTOCOL
                                    </p>
                                </div>

                                <div className="flex flex-col md:flex-row items-center justify-center gap-20 md:gap-40 w-full">
                                    <button onClick={() => setStep(2.1)}
                                        className="group relative flex flex-col items-center text-center transition-all duration-700">
                                        <div className="relative w-32 h-32 mb-8 flex items-center justify-center text-orange-500 transition-all duration-700 group-hover:scale-125">
                                            <Layers size={80} strokeWidth={1} className="opacity-100 transition-all drop-shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                                            <div className="absolute inset-0 bg-orange-500/20 blur-[80px] opacity-0 group-hover:opacity-60 transition-opacity" />
                                        </div>
                                        <span className="relative text-[12px] font-black text-white uppercase tracking-[0.8em] group-hover:text-orange-400 transition-all">MERCHANDISE</span>
                                    </button>

                                    <button onClick={() => setStep(2.2)}
                                        className="group relative flex flex-col items-center text-center transition-all duration-700">
                                        <div className="relative w-32 h-32 mb-8 flex items-center justify-center text-blue-500 transition-all duration-700 group-hover:scale-125">
                                            <DollarSign size={80} strokeWidth={1} className="opacity-100 transition-all drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]" />
                                            <div className="absolute inset-0 bg-blue-500/20 blur-[80px] opacity-0 group-hover:opacity-60 transition-opacity" />
                                        </div>
                                        <span className="relative text-[12px] font-black text-white uppercase tracking-[0.8em] group-hover:text-blue-400 transition-all">OPERATIONS</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Stage 2.1: Merch Type */}
                        {step === 2.1 && (
                            <div className="h-full flex flex-col justify-center max-w-6xl mx-auto animate-in fade-in slide-in-from-right-12 duration-1000">
                                <div className="mb-16">
                                    <button onClick={() => setStep(1)} className="group flex items-center gap-4 text-[11px] font-black text-white uppercase tracking-[0.8em] mb-12 hover:text-(--main-color) transition-all">
                                        <span className="group-hover:-translate-x-2 transition-transform">←</span> REVERT
                                    </button>
                                    <p className="text-[11px] text-white uppercase tracking-[1em] font-black drop-shadow-lg">
                                        MERCH_CONTEXT
                                    </p>
                                </div>

                                <div className="flex flex-col md:flex-row items-center gap-20 max-w-4xl">
                                    <button onClick={() => { set('subcategory', 'Acq'); setStep(3.1); }}
                                        className="group relative flex flex-col items-center transition-all duration-700">
                                        <div className="w-32 h-32 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 transition-all group-hover:scale-110">
                                            <Package size={64} className="text-orange-500" />
                                            <div className="absolute inset-0 bg-orange-500/20 blur-[60px] opacity-0 group-hover:opacity-40 transition-opacity" />
                                        </div>
                                        <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.8em] group-hover:text-white">ACQUISITIONS</span>
                                    </button>

                                    <button onClick={() => { set('subcategory', 'Prod'); setStep(3.1); }}
                                        className="group relative flex flex-col items-center transition-all duration-700">
                                        <div className="w-32 h-32 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 transition-all group-hover:scale-110">
                                            <Cpu size={64} className="text-blue-500" />
                                            <div className="absolute inset-0 bg-blue-500/20 blur-[60px] opacity-0 group-hover:opacity-40 transition-opacity" />
                                        </div>
                                        <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.8em] group-hover:text-white">PRODUCTION</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Stage 3.1: Vendor Selection */}
                        {step === 3.1 && (
                            <div className="h-full flex flex-col max-w-6xl mx-auto animate-in fade-in slide-in-from-right-12 duration-1000 pt-12">
                                <div className="mb-16">
                                    <button onClick={() => setStep(form.subcategory === 'Packing' ? 2.2 : 2.1)} className="group flex items-center gap-4 text-[11px] font-black text-white uppercase tracking-[0.8em] mb-12 hover:text-(--main-color) transition-all">
                                        <span className="group-hover:-translate-x-2 transition-transform">←</span> REVERT
                                    </button>
                                    <p className="text-[11px] text-white uppercase tracking-[1em] font-black drop-shadow-lg">
                                        VENDORS_ARTIFACTS
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                                    {pendingGroups.filter(g => {
                                        if (form.subcategory === 'Packing') return g.type === 'Packing';
                                        return form.subcategory === 'Prod' ? g.type === 'Production' : g.type === 'Acquisition';
                                    }).length === 0 ? (
                                        <div className="col-span-full py-40 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-[64px] bg-white/[0.02]">
                                            <AlertCircle size={48} className="text-white/10 mb-6" />
                                            <p className="text-white/20 text-[12px] font-black tracking-[0.8em] uppercase">No artifacts pending request</p>
                                        </div>
                                    ) : (
                                        pendingGroups
                                            .filter(g => {
                                                if (form.subcategory === 'Packing') return g.type === 'Packing';
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
                                                                set('description', `${paidPerc > 0 ? 'Liquidation' : 'Initial Payment'} for ${group.items.length} items from ${fullName}`);
                                                            }
                                                            setStep(4);
                                                        }}
                                                        className="group relative flex flex-col items-center gap-6 p-10 rounded-[48px] transition-all duration-700 bg-white/[0.03] border border-white/5 hover:border-white/20 hover:bg-white/10 hover:-translate-y-4 shadow-2xl">
                                                        <div className="w-24 h-24 rounded-[36px] flex flex-col items-center justify-center font-black text-2xl shadow-2xl border border-white/20 relative overflow-hidden transition-all duration-700 group-hover:rotate-12"
                                                            style={{ backgroundColor: color, color: getTextColorForBg(color) }}>
                                                            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            <span className="drop-shadow-lg">{group.vendorId}</span>
                                                            <span className="text-[9px] font-black opacity-60 mt-2 uppercase tracking-[0.2em]">{group.type.slice(0,4)}</span>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-[12px] font-black text-white uppercase tracking-[0.2em] mb-2 truncate max-w-[140px] drop-shadow-lg">{fullName}</p>
                                                            <div className="h-[2px] w-12 bg-white/40 mx-auto mb-3" />
                                                            <p className="text-2xl font-mono font-black text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.3)]">{fmtMXN(group.total - group.paidTotal)}</p>
                                                        </div>
                                                        {paidPerc > 0 && (
                                                            <div className="absolute top-4 right-4 px-4 py-2 rounded-xl bg-blue-500 border border-blue-400 text-[10px] font-black text-white uppercase tracking-widest shadow-2xl">
                                                                {paidPerc}% PAID
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Stage 2.2: Ops Logic */}
                        {step === 2.2 && (
                            <div className="h-full flex flex-col justify-center max-w-6xl mx-auto animate-in fade-in slide-in-from-right-12 duration-1000">
                                <div className="mb-16">
                                    <button onClick={() => setStep(1)} className="group flex items-center gap-4 text-[11px] font-black text-white uppercase tracking-[0.8em] mb-12 hover:text-(--main-color) transition-all">
                                        <span className="group-hover:-translate-x-2 transition-transform">←</span> REVERT
                                    </button>
                                    <p className="text-[11px] text-white uppercase tracking-[1em] font-black drop-shadow-lg">
                                        OPERATIONS_LOGIC
                                    </p>
                                </div>

                                <div className="flex flex-col md:flex-row items-center gap-20 max-w-4xl">
                                    <button onClick={() => { set('subcategory', 'Packing'); setStep(3.1); }}
                                        className="group relative flex flex-col items-center transition-all duration-700">
                                        <div className="w-32 h-32 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 transition-all group-hover:scale-110">
                                            <Box size={64} className="text-green-500" />
                                            <div className="absolute inset-0 bg-green-500/20 blur-[60px] opacity-0 group-hover:opacity-40 transition-opacity" />
                                        </div>
                                        <span className="text-[11px] font-black text-white uppercase tracking-[0.8em] group-hover:text-green-500 transition-all">CRATES</span>
                                    </button>
                                    
                                    <button onClick={() => setStep(3.2)}
                                        className="group relative flex flex-col items-center transition-all duration-700">
                                        <div className="w-32 h-32 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 transition-all group-hover:scale-110">
                                            <Filter size={64} className="text-white" />
                                            <div className="absolute inset-0 bg-white/10 blur-[60px] opacity-0 group-hover:opacity-40 transition-opacity" />
                                        </div>
                                        <span className="text-[11px] font-black text-white uppercase tracking-[0.8em] group-hover:text-(--main-color) transition-all">OTHER</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Stage 3.2: Expense Categories */}
                        {step === 3.2 && (
                            <div className="h-full flex flex-col max-w-6xl mx-auto animate-in fade-in slide-in-from-right-12 duration-1000 pt-12">
                                <div className="mb-16">
                                    <button onClick={() => setStep(2.2)} className="group flex items-center gap-4 text-[11px] font-black text-white uppercase tracking-[0.8em] mb-12 hover:text-(--main-color) transition-all">
                                        <span className="group-hover:-translate-x-2 transition-transform">←</span> REVERT
                                    </button>
                                    <p className="text-[11px] text-white uppercase tracking-[1em] font-black drop-shadow-lg">
                                        COST_CENTERS
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-12">
                                    {[
                                        { id: 'Sppl', t: 'SUPPLIES', s: 'Tools & Assets', i: TrendingUp, c: 'text-cyan-500' },
                                        { id: 'Labr', t: 'LABOR', s: 'Workforce Cycles', i: Users, c: 'text-purple-500' },
                                        { id: 'Packing', t: 'PACKAGING', s: 'Transit Materials', i: Box, c: 'text-green-500' },
                                        { id: 'Oprt', t: 'OPERATIONS', s: 'Service General', i: Activity, c: 'text-blue-500' },
                                        { id: 'Monthly', t: 'MONTHLY', s: 'Fixed Recurring', i: Calendar, c: 'text-pink-500' }
                                    ].map(cat => (
                                        <button key={cat.id}
                                            onClick={() => { set('subcategory', cat.id); setStep(4); }}
                                            className="group relative flex flex-col items-center gap-6 transition-all duration-700"
                                        >
                                            <div className={`w-24 h-24 flex items-center justify-center transition-all duration-700 group-hover:scale-125 ${cat.c}`}>
                                                <cat.i size={56} strokeWidth={1} className="opacity-100 transition-all drop-shadow-lg" />
                                                <div className="absolute inset-0 bg-white/10 blur-[60px] opacity-0 group-hover:opacity-40 transition-opacity" />
                                            </div>
                                            <span className="text-[12px] font-black text-white uppercase tracking-[0.6em] group-hover:scale-110 transition-all">{cat.t}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Stage 4: Form */}
                        {step === 4 && (
                            <div className="h-full flex flex-col max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-12 duration-1000 pt-12">
                                <div className="mb-16">
                                    <p className="text-[11px] text-white uppercase tracking-[1em] font-black drop-shadow-lg">
                                        DETAILS_SCHEMA
                                    </p>
                                </div>

                                <div className="grid gap-12 max-w-4xl">
                                    <div className="space-y-6">
                                        <label className="text-[11px] text-white/30 font-black uppercase tracking-[0.8em] block ml-4">Transactional Description</label>
                                        <input value={form.description} onChange={e => set('description', e.target.value)}
                                            className="w-full h-24 px-10 rounded-[40px] bg-white/[0.03] border border-white/5 text-2xl font-bold text-white placeholder:text-white/10 focus:border-(--main-color)/40 focus:bg-white/[0.06] transition-all outline-none shadow-inner" placeholder="Session summary" />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                        <div className="space-y-6">
                                            <label className="text-[11px] text-white/30 font-black uppercase tracking-[0.8em] block ml-4">Volume (MXN)</label>
                                            <div className="relative group">
                                                <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                                                    className="w-full h-24 px-10 pl-16 font-mono text-5xl font-black bg-white/[0.03] border border-white/5 rounded-[40px] text-white outline-none focus:border-(--main-color)/40 focus:bg-white/[0.06] transition-all shadow-inner" />
                                                <span className="absolute left-10 top-1/2 -translate-y-1/2 text-2xl font-black text-white/20">$</span>
                                            </div>
                                        </div>
                                        <div className="space-y-6">
                                            <label className="text-[11px] text-white/30 font-black uppercase tracking-[0.8em] block ml-4">Reference Protocol</label>
                                            <input value={form.reference} onChange={e => set('reference', e.target.value)}
                                                className="w-full h-24 px-10 rounded-[40px] bg-white/[0.03] border border-white/5 text-2xl font-bold text-white placeholder:text-white/10 outline-none focus:border-(--main-color)/40 focus:bg-white/[0.06] transition-all shadow-inner" placeholder="Optional identifier" />
                                        </div>
                                    </div>

                                    <div className={`flex items-center justify-between p-10 rounded-[48px] border transition-all duration-700 ${form.recurring ? 'bg-(--main-color)/5 border-(--main-color)/40' : 'bg-white/[0.03] border-white/5'}`}>
                                        <div className="flex items-center gap-10">
                                            <div className={`w-20 h-20 rounded-[28px] flex items-center justify-center transition-all duration-700 ${form.recurring ? 'bg-(--main-color) text-black shadow-2xl' : 'bg-white/5 text-white/20'}`}>
                                                <Calendar size={32} strokeWidth={1.5} />
                                            </div>
                                            <div className="flex flex-col text-left">
                                                <span className="text-xl font-black text-white uppercase tracking-widest mb-1">RECURRING DISBURSEMENT</span>
                                                <span className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em]">Automatic monthly persistence</span>
                                            </div>
                                        </div>
                                        <button onClick={() => { set('recurring', !form.recurring); if (form.recurring) set('recurring_day', 1); }}
                                            className={`group w-24 h-12 rounded-full transition-all relative shrink-0 overflow-hidden p-1 ${form.recurring ? 'bg-(--main-color)' : 'bg-white/10'}`}>
                                            <div className={`absolute top-1 w-10 h-10 rounded-full bg-white transition-all shadow-2xl ${form.recurring ? 'left-13' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    {form.recurring && (
                                        <div className="animate-in slide-in-from-top-4 duration-700 space-y-6 pl-6 border-l-2 border-(--main-color)/20 ml-10">
                                            <label className="text-[11px] text-white/30 font-black uppercase tracking-[0.8em] block">Persistence Window Day</label>
                                            <div className="flex items-center gap-8">
                                                <input type="number" min="1" max="31" value={form.recurring_day} onChange={e => set('recurring_day', parseInt(e.target.value) || 1)}
                                                    className="w-48 h-20 font-mono text-4xl font-black bg-white/[0.03] border border-(--main-color)/30 rounded-[32px] text-white outline-none focus:border-(--main-color) transition-all text-center shadow-inner" />
                                                <span className="text-[12px] font-black text-white/20 uppercase tracking-[0.6em]">of each financial period</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-8 mt-24 max-w-4xl">
                                    <button onClick={() => {
                                        if (form.subcategory === 'Packing' && form.vendor_id === 'Crates') setStep(2.2);
                                        else if (form.vendor_id) setStep(3.1);
                                        else if (['Sppl', 'Labr', 'Packing', 'Oprt'].includes(form.subcategory)) setStep(3.2);
                                        else setStep(2.2);
                                    }} className="flex-1 h-20 border border-white/10 text-white/40 rounded-[32px] text-[11px] font-black tracking-[0.8em] hover:bg-white/5 hover:text-white transition-all uppercase">REVERT_PHASE</button>
                                    <button onClick={() => {
                                        if (!form.amount || parseFloat(form.amount) <= 0) return notify.error('Enter valid amount');
                                        setStep(5);
                                    }} className="flex-[2] h-20 bg-(--main-color) text-black rounded-[32px] text-[11px] font-black tracking-[0.8em] hover:scale-[1.02] active:scale-95 transition-all shadow-2xl shadow-(--main-color)/20 uppercase">PROCEED_TO_SOURCE →</button>
                                </div>
                            </div>
                        )}

                        {/* Step 5: Account */}
                        {step === 5 && (
                            <div className="h-full flex flex-col max-w-6xl mx-auto animate-in fade-in slide-in-from-right-12 duration-1000 pt-12">
                                <div className="mb-20">
                                    <button onClick={() => setStep(3.1)} className="group flex items-center gap-4 text-[11px] font-black text-white uppercase tracking-[0.8em] mb-12 hover:text-(--main-color) transition-all">
                                        <span className="group-hover:-translate-x-2 transition-transform">←</span> REVERT
                                    </button>
                                    <h2 className="text-7xl md:text-9xl font-black text-white tracking-tighter uppercase leading-[0.8] mb-6">
                                        SOURCE<br /><span className="opacity-20">PROTOCOL</span>
                                    </h2>
                                    <p className="text-[14px] text-white/30 uppercase tracking-[0.6em] font-medium">Select disbursement node</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                                    {Object.entries(destinationsConfig).map(([key, dest]) => (
                                        <button key={key} type="button"
                                            onClick={() => set('destination', key as PaymentDestination)}
                                            className={`group flex flex-col items-center p-12 rounded-[64px] border-2 transition-all duration-700 ${form.destination === key ? 'border-(--main-color) bg-(--main-color)/10 shadow-2xl scale-105' : 'border-white/5 bg-white/[0.03] hover:border-white/20 hover:bg-white/5'}`}>
                                            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-all duration-500">
                                                <CreditCard size={28} className="text-white drop-shadow-lg" />
                                            </div>
                                            <div className="flex-1 text-center">
                                                <p className="text-[14px] font-black text-white uppercase tracking-[0.2em] mb-1 drop-shadow-lg">{dest.name}</p>
                                                <p className="text-[10px] font-mono font-bold text-white/60 tracking-widest">{dest.accountNumber}</p>
                                            </div>
                                            <div className="mt-6 pt-6 border-t border-white/10 w-full text-center">
                                                <p className="text-2xl font-mono font-black text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.3)]">{fmtMXN(dest.balance)}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                <div className="flex gap-8 mt-24 max-w-4xl">
                                    <button onClick={() => setStep(4)} className="flex-1 h-20 border border-white/10 text-white/40 rounded-[32px] text-[11px] font-black tracking-[0.8em] hover:bg-white/5 hover:text-white transition-all uppercase">REVERT_PHASE</button>
                                    <button onClick={() => setStep(6)} disabled={!form.destination}
                                        className="flex-[2] h-20 bg-(--main-color) text-black rounded-[32px] text-[11px] font-black tracking-[0.8em] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-10 uppercase shadow-2xl shadow-(--main-color)/20">
                                        CALIBRATE_ADJUSTMENTS →
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 6: Taxes */}
                        {step === 6 && (
                            <div className="h-full flex flex-col max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-12 duration-1000 pt-12">
                                <div className="mb-20">
                                    <h2 className="text-7xl md:text-9xl font-black text-white tracking-tighter uppercase leading-[0.8] mb-6">
                                        ADJUST<br /><span className="opacity-20">FACTORS</span>
                                    </h2>
                                    <p className="text-[14px] text-white/30 uppercase tracking-[0.6em] font-medium">Fiscal & platform calibration</p>
                                </div>

                                <div className="grid gap-12 max-w-4xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <button onClick={() => { set('includeIva', !form.includeIva); if (!form.includeIva) set('includeComm', false); }}
                                            className={`flex items-center justify-between p-10 rounded-[48px] border transition-all duration-700 ${form.includeIva ? 'bg-green-500/10 border-green-500/40 text-green-500' : 'bg-white/[0.03] border-white/5 text-white/20 hover:text-white/40 hover:bg-white/5'}`}>
                                            <div className="flex flex-col text-left">
                                                <span className="text-xl font-black uppercase tracking-widest mb-1">ADD 16% IVA</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Value added tax</span>
                                            </div>
                                            <div className={`w-16 h-10 rounded-full relative transition-all ${form.includeIva ? 'bg-green-500' : 'bg-white/10'}`}>
                                                <div className={`absolute top-1.5 w-7 h-7 rounded-full bg-white transition-all ${form.includeIva ? 'left-7.5' : 'left-1.5'}`} />
                                            </div>
                                        </button>

                                        <button onClick={() => { set('includeComm', !form.includeComm); if (!form.includeComm) set('includeIva', false); }}
                                            className={`flex items-center justify-between p-10 rounded-[48px] border transition-all duration-700 ${form.includeComm ? 'bg-blue-500/10 border-blue-500/40 text-blue-500' : 'bg-white/[0.03] border-white/5 text-white/20 hover:text-white/40 hover:bg-white/5'}`}>
                                            <div className="flex flex-col text-left">
                                                <span className="text-xl font-black uppercase tracking-widest mb-1">BANK FEE (10%)</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Processing overhead</span>
                                            </div>
                                            <div className={`w-16 h-10 rounded-full relative transition-all ${form.includeComm ? 'bg-blue-500' : 'bg-white/10'}`}>
                                                <div className={`absolute top-1.5 w-7 h-7 rounded-full bg-white transition-all ${form.includeComm ? 'left-7.5' : 'left-1.5'}`} />
                                            </div>
                                        </button>
                                    </div>

                                    <div className="space-y-6">
                                        <label className="text-[11px] text-white/30 font-black uppercase tracking-[0.8em] block ml-4">Manual commission / fee (MXN)</label>
                                        <div className="relative group">
                                            <input type="number" step="0.01" value={form.manualFee} onChange={e => set('manualFee', e.target.value)}
                                                className="w-full h-24 px-10 pl-16 font-mono text-5xl font-black bg-white/[0.03] border border-white/5 rounded-[40px] text-white outline-none focus:border-(--main-color)/40 focus:bg-white/[0.06] transition-all shadow-inner" />
                                            <span className="absolute left-10 top-1/2 -translate-y-1/2 text-2xl font-black text-white/20">$</span>
                                        </div>
                                    </div>

                                    {/* Final Summary Card */}
                                    <div className="p-16 rounded-[64px] bg-white/[0.04] border border-white/10 relative overflow-hidden group shadow-2xl">
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none" />
                                        <div className="relative flex justify-between items-center mb-10">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-white/30 uppercase tracking-[1em] mb-2">ARTIFACT TOTAL DISBURSEMENT</span>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-[12px] font-mono font-black text-white/40 tracking-widest bg-white/5 px-4 py-1 rounded-full">{fmtMXN(parseFloat(form.amount) || 0)} BASE_VAL</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end opacity-40 gap-2">
                                                {form.includeIva && <span className="text-[10px] font-black uppercase tracking-[0.4em] text-green-500">+ IVA {fmtMXN(calculateIVA(parseFloat(form.amount) || 0))}</span>}
                                                {form.includeComm && <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">+ BNK {fmtMXN(calculateComm(parseFloat(form.amount) || 0))}</span>}
                                                {(parseFloat(form.manualFee) || 0) > 0 && <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white">+ FEE {fmtMXN(parseFloat(form.manualFee) || 0)}</span>}
                                            </div>
                                        </div>
                                        <div className="relative text-7xl md:text-9xl font-mono font-black text-white tracking-tighter leading-none drop-shadow-2xl">
                                            {fmtMXN((parseFloat(form.amount) || 0) + (parseFloat(form.manualFee) || 0) + (form.includeIva ? calculateIVA(parseFloat(form.amount) || 0) : 0) + (form.includeComm ? calculateComm(parseFloat(form.amount) || 0) : 0))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-8 mt-24 max-w-4xl pb-12">
                                    <button onClick={() => setStep(5)} className="flex-1 h-20 border border-white/10 text-white/40 rounded-[32px] text-[11px] font-black tracking-[0.8em] hover:bg-white/5 hover:text-white transition-all uppercase">REVERT_SOURCE</button>
                                    <button onClick={handleSubmit} disabled={saving}
                                        className="flex-[2] h-20 bg-(--main-color) text-black rounded-[32px] text-[11px] font-black tracking-[0.8em] hover:scale-[1.02] active:scale-95 transition-all shadow-2xl shadow-(--main-color)/20 disabled:opacity-20 uppercase">
                                        {saving ? 'RECORDING ARTIFACT…' : 'CONFIRM DISBURSEMENT PROTOCOL'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                `}} />
            </div>
        </div>
    );
};


const RequestPaymentModal: React.FC<{
    group: VendorGroup | null;
    onClose: () => void;
    onConfirm: (dest: PaymentDestination, percentage: number, manualFee: number, includeIva: boolean, includeComm: boolean) => void;
}> = ({ group, onClose, onConfirm }) => {
    const notify = useNotify();
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
    const isProduction = group.type === 'Production';

    const targetAmount = group.total * (percentage / 100);
    const amountToRequest = Math.round(Math.max(0, targetAmount - group.paidTotal));

    return (
        <div className="absolute inset-0 z-[1000] flex justify-center items-start pt-12 md:pt-24 animate-in fade-in duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[120px]" onClick={onClose} />
            <div className="w-full max-w-[650px] h-[80vh] flex flex-col relative animate-in zoom-in-95 duration-700 no-select" onClick={e => e.stopPropagation()}>
                
                {/* Glassmorphic Background Layer */}
                <div className="absolute inset-0 bg-white/[0.02] border border-white/5 rounded-[80px] shadow-[0_0_150px_rgba(0,0,0,0.8)] pointer-events-none" />

                <div className="px-12 pt-12 pb-6 flex justify-between items-start shrink-0">
                    <div className="flex flex-col gap-2">
                        <h3 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">
                            {paidPerc > 0 && percentage === 100 ? 'LIQUIDATION' : 'REQUEST'}
                        </h3>
                        <p className="text-[10px] text-white/20 uppercase tracking-[0.5em] font-black">
                            {group.type} PROTOCOL · {group.vendorId}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-14 h-14 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 hover:rotate-90 transition-all duration-500">
                        <CloseIcon size={24} strokeWidth={1.5} />
                    </button>
                </div>

                <div className="px-12 pb-12 flex-1 overflow-y-auto custom-scrollbar space-y-12 relative z-10">
                    <div className="flex flex-col gap-10">
                        {/* High-Level Overview Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-8 rounded-[40px] bg-white/[0.03] border border-white/5">
                                <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-2">CONTRACT TOTAL</p>
                                <p className="text-3xl font-mono font-black text-white leading-none">{fmtMXN(group.total)}</p>
                            </div>
                            <div className="p-8 rounded-[40px] bg-white/[0.03] border border-white/5 flex flex-col justify-center">
                                <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-2">ASSET COUNT</p>
                                <p className="text-xl font-black text-(--main-color) uppercase tracking-widest">{group.items.length} ITEMS</p>
                            </div>
                        </div>

                        {/* Visual Progress Architecture */}
                        <div className="bg-white/5 rounded-[48px] p-10 border border-white/5">
                            <div className="flex justify-between items-end mb-6">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em] mb-1">CUMULATIVE PROGRESS</span>
                                    <span className="text-4xl font-mono font-black text-white leading-none">{paidPerc}% COMPLETE</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em] mb-1">STAKED</span>
                                    <span className="text-xl font-mono font-black text-white/40">{fmtMXN(group.paidTotal)}</span>
                                </div>
                            </div>
                            <div className="h-4 w-full bg-black/40 rounded-full overflow-hidden flex gap-1 p-1 border border-white/5">
                                <div className="h-full bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)] rounded-full transition-all duration-1000" style={{ width: `${paidPerc}%` }} />
                                {percentage > paidPerc && (
                                    <div className="h-full bg-(--main-color)/40 rounded-full animate-pulse transition-all duration-500" style={{ width: `${percentage - paidPerc}%` }} />
                                )}
                            </div>
                        </div>

                        {/* Partial Payment Logic Slider */}
                        {isProduction ? (
                            <div className="space-y-8">
                                <div className="flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em] mb-1">TARGET PERCENTAGE</label>
                                        <span className="text-4xl font-mono font-black text-(--main-color) leading-none tracking-tighter">{percentage}%</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em] mb-1">DELTA TO DISBURSE</span>
                                        <span className="text-2xl font-mono font-black text-white leading-none">{fmtMXN(amountToRequest)}</span>
                                    </div>
                                </div>
                                <div className="relative py-4">
                                    <input type="range" min={Math.max(10, paidPerc + 5)} max="100" step="5" value={percentage} onChange={e => setPercentage(parseInt(e.target.value))}
                                        className="w-full h-3 bg-white/5 rounded-full appearance-none cursor-pointer accent-(--main-color) shadow-inner" />
                                </div>
                            </div>
                        ) : (
                            <div className="p-10 rounded-[48px] bg-white/5 border border-white/5 text-center flex flex-col items-center">
                                <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.5em] mb-4">TOTAL LIQUIDATION PROTOCOL</p>
                                <p className="text-5xl font-mono font-black text-white tracking-tighter leading-none">{fmtMXN(amountToRequest)}</p>
                            </div>
                        )}

                        {/* Disbursement Hub Selection */}
                        <div className="grid grid-cols-4 gap-4">
                            {Object.entries(destinationsConfig).map(([key, cfg]) => (
                                <button key={key} type="button" onClick={() => setDest(key as PaymentDestination)}
                                    className={`group flex flex-col items-center gap-4 p-6 rounded-[32px] border-2 transition-all duration-500 ${dest === key ? 'border-(--main-color) bg-(--main-color)/10 shadow-[0_0_40px_rgba(var(--main-color-rgb),0.1)]' : 'border-white/5 bg-white/5 hover:border-white/20'}`}>
                                    <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center transition-all ${dest === key ? 'bg-white text-black' : 'text-white/20'}`}>
                                        <CreditCard size={20} />
                                    </div>
                                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest text-center leading-tight group-hover:text-white/60">{cfg.name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <button onClick={() => { setIncludeIva(!includeIva); if (!includeIva) setIncludeComm(false); }}
                                className={`flex flex-col items-center justify-center p-8 rounded-[40px] border-2 transition-all duration-700 ${includeIva ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-white/[0.03] border-white/5 text-white/20 hover:text-white/40'}`}>
                                <Percent size={24} className="mb-2" />
                                <span className="text-[9px] font-black uppercase tracking-widest">ADD 16% IVA</span>
                            </button>
                            <button onClick={() => { setIncludeComm(!includeComm); if (!includeComm) setIncludeIva(false); }}
                                className={`flex flex-col items-center justify-center p-8 rounded-[40px] border-2 transition-all duration-700 ${includeComm ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-white/[0.03] border-white/5 text-white/20 hover:text-white/40'}`}>
                                <DollarSign size={24} className="mb-2" />
                                <span className="text-[9px] font-black uppercase tracking-widest">BANK (10%)</span>
                            </button>
                        </div>

                        <div className="relative group/fee">
                            <label className="text-[9px] text-white/20 font-black uppercase tracking-[0.4em] mb-4 block text-center">MANUAL FEE (MXN)</label>
                            <input type="number" step="0.01" value={manualFee} onChange={e => setManualFee(e.target.value)}
                                className="w-full h-16 px-8 font-mono text-xl font-black bg-white/[0.03] border border-white/10 rounded-[32px] text-white text-center outline-none focus:border-(--main-color) focus:bg-white/[0.08] transition-all" placeholder="0.00" />
                        </div>

                        <div className="pt-8 flex gap-6">
                            <button onClick={onClose} className="flex-1 py-7 border-2 border-white/10 text-white font-black rounded-[32px] text-[10px] tracking-[0.4em] hover:bg-white/10 transition-all uppercase">TERMINATE</button>
                            <button onClick={() => dest && onConfirm(dest, percentage, parseFloat(manualFee) || 0, includeIva, includeComm)} disabled={!dest || amountToRequest <= 0}
                                className="flex-[2] py-7 bg-(--main-color) text-black rounded-[32px] text-[10px] font-black tracking-[0.4em] disabled:opacity-20 uppercase transition-all shadow-[0_0_30px_rgba(var(--main-color-rgb),0.4)] hover:scale-[1.02] active:scale-95">
                                {paidPerc > 0 && percentage === 100 ? 'CONFIRM LIQUIDATION' : 'CONFIRM REQUEST'}
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

    return (
        <div className="absolute inset-0 z-[1000] flex justify-center items-start pt-12 md:pt-24 animate-in fade-in duration-1000 overflow-hidden">
            {/* ── IMMERSIVE BACKDROP ── */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-2xl" onClick={onClose} />
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-orange-500/5 pointer-events-none" />

            <div className="relative w-full max-w-4xl h-[80vh] bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-[48px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-1000 no-select shadow-[0_0_120px_rgba(0,0,0,0.6)]" onClick={e => e.stopPropagation()}>
                
                {/* ── IMMERSIVE HEADER ─────────────────────────────────────────── */}
                <div className="px-10 pt-10 pb-6 flex justify-between items-center shrink-0 relative z-20">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-(--main-color)/15 border border-(--main-color)/30 flex items-center justify-center text-(--main-color)">
                            <Edit3 size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.4em] mb-1">Editing Payment Record</p>
                            <p className="text-xl font-black text-white/90 truncate max-w-[350px] tracking-tight">{record.description || 'Unnamed Transaction'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-14 h-14 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 hover:rotate-90 transition-all duration-500">
                        <CloseIcon size={24} strokeWidth={1.5} />
                    </button>
                </div>

                <div className="px-12 pb-12 flex flex-col flex-1 overflow-y-auto custom-scrollbar relative z-10">
                    {/* Step 4: Details */}
                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-12 pt-4">
                            <div className="flex flex-col">
                                <h2 className="text-5xl font-black text-white mb-2 tracking-tighter uppercase leading-none">DETAILS</h2>
                                <p className="text-[11px] text-white/20 uppercase tracking-[0.3em] font-black">Refine transactional metadata</p>
                            </div>

                            <div className="grid gap-10">
                                <div className="space-y-4">
                                    <label className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] block ml-1">DESCRIPTION</label>
                                    <input value={form.description} onChange={e => set('description', e.target.value)}
                                        className="w-full h-20 px-8 rounded-[32px] bg-white/5 border border-white/5 text-xl font-medium text-white placeholder:text-white/10 focus:border-(--main-color)/40 focus:bg-white/[0.08] transition-all outline-none" placeholder="Brief summary" />
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <label className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] block ml-1">AMOUNT (MXN)</label>
                                        <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                                            className="w-full h-20 px-8 font-mono text-3xl font-black bg-white/5 border border-white/5 rounded-[32px] text-white outline-none focus:border-(--main-color)/40 focus:bg-white/[0.08] transition-all" />
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] block ml-1">REFERENCE</label>
                                        <input value={form.reference} onChange={e => set('reference', e.target.value)}
                                            className="w-full h-20 px-8 rounded-[32px] bg-white/5 border border-white/5 text-xl font-medium text-white placeholder:text-white/10 outline-none focus:border-(--main-color)/40 focus:bg-white/[0.08] transition-all" placeholder="Optional #" />
                                    </div>
                                </div>

                                <div className={`flex items-center justify-between p-8 rounded-[40px] border transition-all duration-500 ${form.recurring ? 'bg-(--main-color)/10 border-(--main-color)/40 shadow-[0_0_40px_rgba(var(--main-color-rgb),0.1)]' : 'bg-white/5 border-white/5'}`}>
                                    <div className="flex items-center gap-6">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${form.recurring ? 'bg-(--main-color) text-black shadow-lg' : 'bg-white/5 text-white/20'}`}>
                                            <Calendar size={28} />
                                        </div>
                                        <div>
                                            <span className="text-[13px] font-black text-white uppercase tracking-widest block mb-1">RECURRING DISBURSEMENT</span>
                                            <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Automatic monthly persistence</span>
                                        </div>
                                    </div>
                                    <button onClick={() => { set('recurring', !form.recurring); if (form.recurring) set('recurring_day', 1); }}
                                        className={`w-16 h-10 rounded-full transition-all relative shrink-0 ${form.recurring ? 'bg-(--main-color)' : 'bg-white/10'}`}>
                                        <div className={`absolute top-1.5 w-7 h-7 rounded-full bg-white transition-all shadow-xl ${form.recurring ? 'left-7.5' : 'left-1.5'}`} />
                                    </button>
                                </div>

                                {form.recurring && (
                                    <div className="animate-in slide-in-from-top-4 duration-500 space-y-4">
                                        <label className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] block ml-1">MONTHLY PERSISTENCE DAY</label>
                                        <div className="flex items-center gap-6">
                                            <input type="number" min="1" max="31" value={form.recurring_day} onChange={e => set('recurring_day', parseInt(e.target.value) || 1)}
                                                className="w-40 h-16 font-mono text-2xl font-black bg-white/5 border border-(--main-color)/30 rounded-[28px] text-white outline-none focus:border-(--main-color)/60 transition-all text-center" />
                                            <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.4em]">of each period</span>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <label className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] block ml-1">NOTES / CONTEXT</label>
                                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                                        className="w-full h-32 px-8 py-6 rounded-[32px] bg-white/5 border border-white/5 text-lg font-medium text-white placeholder:text-white/10 focus:border-(--main-color)/40 focus:bg-white/[0.08] transition-all outline-none resize-none" placeholder="Additional context…" />
                                </div>
                            </div>

                            <button onClick={() => setStep(5)} className="w-full py-8 bg-(--main-color) text-black rounded-[32px] text-[13px] font-black tracking-[0.4em] hover:scale-[1.02] active:scale-95 transition-all shadow-2xl uppercase mt-8">CONTINUE TO SOURCE →</button>
                        </div>
                    )}

                    {/* Step 5: Account Selection */}
                    {step === 5 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-12 pt-4">
                            <div className="flex flex-col">
                                <h2 className="text-5xl font-black text-white mb-2 tracking-tighter uppercase leading-none">SOURCE</h2>
                                <p className="text-[11px] text-white/20 uppercase tracking-[0.3em] font-black">Select disbursement protocol</p>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {Object.entries(destinationsConfig).map(([key, dest]) => (
                                    <button key={key} type="button"
                                        onClick={() => set('destination', key as PaymentDestination)}
                                        className={`flex flex-col items-center p-10 rounded-[48px] border-2 transition-all duration-500 ${form.destination === key ? 'border-(--main-color) bg-(--main-color)/10 scale-105' : 'border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]'}`}>
                                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/20 flex items-center justify-center mb-6">
                                            <CreditCard size={28} className="text-white" />
                                        </div>
                                        <div className="text-[13px] font-black text-white uppercase tracking-[0.3em] opacity-80">{dest.name}</div>
                                        <div className="mt-4 text-[10px] font-mono text-white/40">{dest.accountNumber}</div>
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-6 mt-16">
                                <button onClick={() => setStep(4)} className="flex-1 py-7 border border-white/10 text-white/40 rounded-[32px] text-[11px] font-black tracking-[0.4em] hover:bg-white/5 hover:text-white transition-all uppercase">BACK</button>
                                <button onClick={() => setStep(6)} disabled={!form.destination}
                                    className="flex-[2] py-7 bg-(--main-color) text-black rounded-[32px] text-[11px] font-black tracking-[0.4em] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 uppercase">CONTINUE TO TAXES</button>
                            </div>
                        </div>
                    )}

                    {/* Step 6: Adjustments */}
                    {step === 6 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-12 pt-4">
                            <div className="flex flex-col">
                                <h2 className="text-5xl font-black text-white mb-2 tracking-tighter uppercase leading-none">ADJUSTMENTS</h2>
                                <p className="text-[11px] text-white/20 uppercase tracking-[0.3em] font-black">Tax & fee calibration</p>
                            </div>

                            <div className="grid gap-10">
                                <div className="grid gap-4">
                                    <div className="flex items-center justify-between p-8 rounded-[40px] bg-white/5 border border-white/5">
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-black text-white uppercase tracking-widest">ADD 16% IVA</span>
                                            <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-1">Value added tax calculation</span>
                                        </div>
                                        <button onClick={() => { set('includeIva', !form.includeIva); if (!form.includeIva) set('includeComm', false); }}
                                            className={`w-16 h-10 rounded-full transition-all relative ${form.includeIva ? 'bg-green-500' : 'bg-white/10'}`}>
                                            <div className={`absolute top-1.5 w-7 h-7 rounded-full bg-white transition-all ${form.includeIva ? 'left-7.5' : 'left-1.5'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between p-8 rounded-[40px] bg-white/5 border border-white/5">
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-black text-white uppercase tracking-widest">BANK COMISION (10%)</span>
                                            <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-1">Platform processing fee</span>
                                        </div>
                                        <button onClick={() => { set('includeComm', !form.includeComm); if (!form.includeComm) set('includeIva', false); }}
                                            className={`w-16 h-10 rounded-full transition-all relative ${form.includeComm ? 'bg-blue-500' : 'bg-white/10'}`}>
                                            <div className={`absolute top-1.5 w-7 h-7 rounded-full bg-white transition-all ${form.includeComm ? 'left-7.5' : 'left-1.5'}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] block ml-1">MANUAL COMMISSION / FEE (MXN)</label>
                                    <input type="number" step="0.01" value={form.manualFee} onChange={e => set('manualFee', e.target.value)}
                                        className="w-full h-20 px-8 font-mono text-3xl font-black bg-white/5 border border-white/5 rounded-[32px] text-white outline-none focus:border-(--main-color)/40 focus:bg-white/[0.08] transition-all" />
                                </div>

                                <div className="p-10 rounded-[56px] bg-white/[0.03] border border-white/5 relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-(--main-color)/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                    <div className="relative flex justify-between items-center mb-4">
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.5em]">ARTIFACT TOTAL</span>
                                        <span className="text-[11px] font-mono font-bold text-white/40 tracking-widest">{fmtMXN(parseFloat(form.amount) || 0)} BASE</span>
                                    </div>
                                    <div className="relative text-6xl font-mono font-black text-white tracking-tighter leading-none mb-4">
                                        {fmtMXN((parseFloat(form.amount) || 0) + (parseFloat(form.manualFee) || 0) + (form.includeIva ? calculateIVA(parseFloat(form.amount) || 0) : 0) + (form.includeComm ? calculateComm(parseFloat(form.amount) || 0) : 0))}
                                    </div>
                                    <div className="relative flex gap-6 opacity-40">
                                        {form.includeIva && <span className="text-[10px] font-black uppercase tracking-widest text-green-500">+ IVA {fmtMXN(calculateIVA(parseFloat(form.amount) || 0))}</span>}
                                        {form.includeComm && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">+ BNK {fmtMXN(calculateComm(parseFloat(form.amount) || 0))}</span>}
                                        {(parseFloat(form.manualFee) || 0) > 0 && <span className="text-[10px] font-black uppercase tracking-widest text-white">+ FEE {fmtMXN(parseFloat(form.manualFee) || 0)}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-6 mt-16">
                                <button onClick={() => setStep(5)} className="flex-1 py-7 border border-white/10 text-white/40 rounded-[32px] text-[11px] font-black tracking-[0.4em] hover:bg-white/5 hover:text-white transition-all uppercase">BACK</button>
                                <button onClick={handleUpdate} disabled={saving}
                                    className="flex-[2] py-7 bg-(--main-color) text-black rounded-[32px] text-[11px] font-black tracking-[0.4em] hover:scale-[1.02] active:scale-95 transition-all shadow-2xl disabled:opacity-20 uppercase">
                                    {saving ? 'UPDATING ARTIFACT…' : 'CONFIRM UPDATES'}
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
    const notify = useNotify();
    const setFinanceTotals = useSetAtom(financeTotalsAtom);

    const pendingGroups = useMemo<VendorGroup[]>(() => {
        const targetStatuses = ['acquired', 'acquisition', 'acquisitions', 'production', 'new', 'scheduled', 'ready'];

        const pendingItems = inventory.filter(i => {
            const status = (i.data.status || '').toLowerCase();
            const payReqStr = String(i.data.payReq || (i.data as any).pay_req || '').toLowerCase();
            const workbook = String(i.data.workbook || '').toLowerCase();
            
            // Skip 825 and Prepaid items
            if (workbook === '825' || workbook === 'v825' || payReqStr === 'prepaid') return false;

            // Only exclude items explicitly marked as fully PAID or already REQUESTED (true)
            const isUnpaid = !['true', 'paid'].includes(payReqStr);
            return targetStatuses.includes(status) && isUnpaid;
        });

        const pendingCrates = logisticsData.filter(c => {
            const payReqStr = String(c.pay_req || '').toLowerCase();
            const isUnpaid = !['true', 'paid'].includes(payReqStr);
            return c.type === 'crate' && isUnpaid && (c.cost_mxn || 0) > 0;
        }).map(c => ({
            row: c.id,
            label: c.description || `Crate ${c.id}`,
            imageUrl: '',
            data: {
                ...c,
                status: 'Packing', 
                item_id: c.id,
                vendor_id: c.vendor_id || 'CRATES',
                price: c.cost_mxn,
                quantity: c.quantity || 1
            }
        } as any));

        const itemsToProcess = [...pendingItems, ...pendingCrates];

        // Group by BOTH Vendor and Type (Production vs Acquisition vs Packing)
        const groups: Record<string, VendorGroup> = {};
        for (const item of itemsToProcess) {
            const data = item.data;
            const itemIdStr = String(data.item_id || data.itemId || '');
            let vid = data.vendor_id || data.vendorId;
            const status = (data.status || '').toLowerCase();
            const type: 'Acquisition' | 'Production' | 'Packing' = 
                status === 'packing' ? 'Packing' : 
                (status === 'production' ? 'Production' : 'Acquisition');

            if (!vid) {
                if (itemIdStr.includes('-')) {
                    vid = itemIdStr.split('-')[0];
                } else {
                    const prefix = Object.keys(vendors).find(v => itemIdStr.startsWith(v));
                    if (prefix) vid = prefix;
                }
            }
            if (!vid) vid = 'Unknown';

            // Explicitly handle Juan/Simona crates
            if (type === 'Packing') {
                const searchStr = `${data.vendors || ''} ${data.description || ''}`.toUpperCase();
                if (searchStr.includes('JUAN')) vid = 'JUAN';
                else if (searchStr.includes('SIMONA')) vid = 'SIMONA';
            }

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

    useEffect(() => {
        const queueItems = docs.filter(r => r.status === 'Requested');
        setFinanceTotals({
            queueLength: queueItems.length,
            queueMxn: queueItems.reduce((s, r) => s + (r.amount || 0) + (r.commission || 0), 0),
            upcomingLength: pendingGroups.length,
            upcomingMxn: pendingGroups.reduce((s, g) => s + (g.total - g.paidTotal), 0),
            pendingGroups
        });
    }, [docs, pendingGroups, setFinanceTotals]);

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



                <div className="pt-0 p-2 space-y-1 pb-32">
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

                                    {/* Progress Bar for Partial Payments */}
                                    {(() => {
                                        const match = String(r.description || '').match(/(\d+)%/);
                                        if (match) {
                                            const perc = parseInt(match[1]);
                                            return (
                                                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5 overflow-hidden">
                                                    <div className="h-full bg-(--main-color) shadow-[0_0_15px_rgba(var(--main-color-rgb),0.5)] transition-all duration-1000" style={{ width: `${perc}%` }} />
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
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
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        setEditRecord(r);
                                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                                    }}
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
