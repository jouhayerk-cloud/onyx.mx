import React, { useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { 
    isPaymentWizardOpenAtom, 
    selectedInventoryIdsAtom, 
    inventoryAtom,
    logisticsDocsAtom,
    liveExchangeRateAtom,
    inventoryStatusSetsAtom,
    paymentsArtifactConfigAtom,
    inventoryArtifactConfigAtom,
    userAtom
} from '../../lib/atoms';
import { 
    X, CreditCard, CheckCircle2, AlertCircle, Clock, PlusCircle, 
    ChevronRight, ArrowRight, DollarSign, Wallet, Building2,
    Search, Info, ExternalLink, RefreshCw
} from 'lucide-react';
import { getStatusClass, normalizeInventoryData, calculateCodesAndPrices } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
import { createPortal } from 'react-dom';
import { tr } from '../../lib/i18n';

export const ItemsPayWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPaymentWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const allLogistics = useAtomValue(logisticsDocsAtom);
    const liveRate = useAtomValue(liveExchangeRateAtom) || 17;
    const { partialPayIds, fullPayIds, requestedAcqIds } = useAtomValue(inventoryStatusSetsAtom);
    const user = useAtomValue(userAtom);

    const setPaymentsArtifact = useSetAtom(paymentsArtifactConfigAtom);
    const setInventoryArtifact = useSetAtom(inventoryArtifactConfigAtom);

    const [isProcessing, setIsProcessing] = useState(false);

    // ── DATA GROUPING ────────────────────────────────────────────────────────
    const groups = useMemo(() => {
        const selectedItems = allInventory.filter(item => selectedIds.includes(String(item.row)));
        const selectedCrates = (allLogistics || []).filter(c => selectedIds.includes(String(c.id)));
        
        const res = {
            paid: [] as any[],
            requested: [] as any[],
            partial: [] as any[],
            new: [] as any[],
            newByVendor: {} as Record<string, any[]>
        };

        const processItem = (item: any, type: 'inv' | 'log') => {
            let norm, status, cost, vId;
            
            if (type === 'inv') {
                norm = normalizeInventoryData(item.data);
                status = getStatusClass(norm, partialPayIds, fullPayIds, requestedAcqIds);
                cost = Number(calculateCodesAndPrices(norm, liveRate).bookAcquisition) || 0;
                vId = norm.vendorId || String(norm.itemId || '').split('-')[0] || 'MISC';
            } else {
                norm = item;
                const payReq = String(item.pay_req || '').toLowerCase();
                status = (payReq === 'paid' || payReq === 'true') ? 'GREEN' : (payReq === 'requested' ? 'YELLOW' : 'NONE');
                cost = Number(item.cost_mxn || 0) / liveRate; // Convert to USD for grouping
                const searchStr = `${item.vendors || ''} ${item.description || ''} ${item.vendor_id || ''}`.toUpperCase();
                if (searchStr.includes('JUAN')) vId = 'JUAN';
                else if (searchStr.includes('SIMONA')) vId = 'SIMONA';
                else vId = (item.vendors || item.vendor_id || 'CRATES').toUpperCase();
            }

            const processed = { ...item, norm, cost, artifactType: type };

            if (status === 'GREEN') res.paid.push(processed);
            else if (status === 'YELLOW') res.requested.push(processed);
            else if (status === 'RED') res.partial.push(processed);
            else {
                res.new.push(processed);
                if (!res.newByVendor[vId]) res.newByVendor[vId] = [];
                res.newByVendor[vId].push(processed);
            }
        };

        selectedItems.forEach(i => processItem(i, 'inv'));
        selectedCrates.forEach(c => processItem(c, 'log'));

        return res;
    }, [allInventory, allLogistics, selectedIds, partialPayIds, fullPayIds, requestedAcqIds, liveRate]);

    if (!isOpen) return null;

    const handleClose = () => setIsOpen(false);

    const openPaymentsForItems = (items: any[], title: string) => {
        const ids = items.map(i => i.artifactType === 'inv' ? String(i.row) : String(i.id));
        setPaymentsArtifact({ isOpen: true, itemIds: ids, title });
    };

    const openInventoryForItems = (items: any[], title: string) => {
        const ids = items.map(i => String(i.row));
        setInventoryArtifact({ isOpen: true, itemIds: ids, title, displayMode: 'list' });
    };

    const handleRequestPaymentForVendor = async (vendorId: string, items: any[]) => {
        if (isProcessing) return;
        setIsProcessing(true);
        const tid = toast.loading(`Generating request for ${vendorId}...`);

        try {
            const totalMxn = items.reduce((acc, i) => {
                const qty = Number(i.norm.quantity || i.norm.qty || 1);
                if (i.artifactType === 'log') {
                    return acc + (Number(i.cost_mxn || 0) * qty);
                }
                return acc + (i.cost * liveRate * qty);
            }, 0);
            
            const itemIds = items.filter(i => i.artifactType === 'inv').map(i => String(i.row));
            const crateIds = items.filter(i => i.artifactType === 'log').map(i => String(i.id));
            
            // 1. Create Finance Record
            const { data: finData, error: finError } = await supabase.from('finance').insert({
                amount: totalMxn,
                currency: 'MXN',
                status: 'Requested',
                date: new Date().toISOString(),
                description: `Bulk Request: ${vendorId} (${items.length} units)`,
                vendor_id: vendorId,
                type: 'Expense',
                category: 'Acquisition',
                subcategory: items.some(i => i.artifactType === 'log') ? 'Logistics' : 'Acquisition',
                related_ids: [...itemIds, ...crateIds],
                notes: `Generated via ItemsPay Wizard by ${user?.name || 'Unknown'}. Includes ${itemIds.length} items and ${crateIds.length} crates.`,
                updated_at: new Date().toISOString()
            }).select();

            if (finError) throw finError;

            // 2. Update Inventory Items
            if (itemIds.length > 0) {
                const { error: invError } = await supabase.from('inventory')
                    .update({ 
                        pay_req: 'requested',
                        payment_ids: finData[0].id.toString()
                    })
                    .in('id', itemIds.map(Number));
                if (invError) throw invError;
            }

            // 3. Update Crates
            if (crateIds.length > 0) {
                const { error: crateError } = await supabase.from('logistics')
                    .update({ 
                        pay_req: 'requested',
                        payment_ids: finData[0].id.toString()
                    })
                    .in('id', crateIds.map(Number));
                if (crateError) throw crateError;
            }

            toast.success(`Request generated for ${vendorId}`, { id: tid });
        } catch (err: any) {
            toast.error(err.message || 'Generation failed', { id: tid });
        } finally {
            setIsProcessing(false);
        }
    };

    const groupTotals = {
        paid: groups.paid.reduce((acc, i) => acc + i.cost, 0),
        requested: groups.requested.reduce((acc, i) => acc + i.cost, 0),
        partial: groups.partial.reduce((acc, i) => acc + i.cost, 0),
        new: groups.new.reduce((acc, i) => acc + i.cost, 0)
    };

    const totalValue = Object.values(groupTotals).reduce((a, b) => a + b, 0);

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center animate-in fade-in duration-1000 overflow-hidden no-select">
            {/* ── ULTRA-HIGH FIDELITY GLASS BACKDROP ── */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[120px]" onClick={handleClose} />
            <div className="absolute inset-0 bg-gradient-to-br from-(--main-color)/5 via-transparent to-blue-500/5 pointer-events-none" />
            
            <div className="relative w-full h-full flex flex-col pointer-events-auto overflow-hidden animate-in slide-in-from-bottom-12 duration-1000 ease-out">
                
                {/* ── IMMERSIVE HEADER ─────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-8 md:px-20 py-10 md:py-16 z-20">
                    <div className="flex items-center gap-8 md:gap-12">
                        <div className="relative group cursor-pointer" onClick={handleClose}>
                            <OnyxMiniLogo className="w-10 h-10 md:w-14 md:h-14 text-white transition-all duration-1000 group-hover:rotate-180 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-white/20 blur-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-1000" />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-4 mb-2">
                                <h1 className="text-2xl md:text-5xl font-black uppercase tracking-[0.3em] leading-none text-white drop-shadow-2xl">
                                    {tr("PAYMENT")}<span className="text-white/20">.</span>{tr("PROTOCOL")}
                                </h1>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-black text-(--main-color) tracking-[0.5em] uppercase px-3 py-1 bg-(--main-color)/10 rounded-full border border-(--main-color)/20">
                                    {tr("ENGINE_ACTIVE")}
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-[0.8em] text-white/30">{tr("ID:")} {selectedIds.length > 0 ? `BATCH_0x${selectedIds.length.toString(16).toUpperCase()}` : tr("NULL_SESSION")}</span>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleClose} 
                        className="group relative w-16 h-16 flex items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-500 active:scale-90"
                    >
                        <X className="w-8 h-8 text-white/30 group-hover:text-white transition-colors duration-500" strokeWidth={1} />
                    </button>
                </div>

                {/* ── MAIN CONTENT (FREE FLOATING) ───────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto no-scrollbar px-8 md:px-20 pb-32">
                    <div className="max-w-[1800px] mx-auto space-y-24 md:space-y-40">
                        
                        {/* ── NEURAL CONTEXT BAR ── */}
                        <div className="flex flex-col xl:flex-row items-center justify-between gap-12 md:gap-24 animate-in fade-in slide-in-from-left-8 duration-1000">
                            <div className="flex items-center gap-10">
                                <div className="w-16 h-16 rounded-[24px] bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                    <Building2 size={32} className="text-blue-500" strokeWidth={1.5} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase tracking-[1em] mb-2 text-white/40">{tr("Verified Operator")}</span>
                                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                                        <span className="text-2xl md:text-4xl font-black uppercase tracking-[0.1em] text-white">{user?.name || tr("ROOT")}</span>
                                        <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl border border-white/10">
                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-white/60 lowercase tracking-widest">{user?.email || tr("admin@onyx.mx")}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-12">
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black uppercase tracking-[0.6em] mb-2 text-white/20">{tr("FX_CALIBRATION")}</span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl md:text-4xl font-black text-white tracking-tighter tabular-nums">{liveRate}</span>
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">{tr("MXN/USD")}</span>
                                    </div>
                                </div>
                                <div className="h-12 w-[1px] bg-white/10" />
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black uppercase tracking-[0.6em] mb-2 text-white/20">{tr("TIMESTAMP")}</span>
                                    <span className="text-xl font-black text-white/60 tracking-widest uppercase">{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            </div>
                        </div>

                        {/* ── STATUS GRID (HOLOGRAPHIC CARDS) ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-14 animate-in zoom-in-95 duration-1000 delay-300">
                            <StatusCard label={tr("Paid")} count={groups.paid.length} amount={groupTotals.paid} color="#22c55e" icon={CheckCircle2} onClick={() => openPaymentsForItems(groups.paid, 'Paid Items Detail')} />
                            <StatusCard label={tr("Requested")} count={groups.requested.length} amount={groupTotals.requested} color="#eab308" icon={Clock} onClick={() => openPaymentsForItems(groups.requested, 'Requested Items Detail')} />
                            <StatusCard label={tr("Partial")} count={groups.partial.length} amount={groupTotals.partial} color="#ef4444" icon={AlertCircle} onClick={() => openPaymentsForItems(groups.partial, 'Partial Items Detail')} />
                            <StatusCard label={tr("New")} count={groups.new.length} amount={groupTotals.new} color="#38bdf8" icon={PlusCircle} onClick={() => openInventoryForItems(groups.new, 'New Items Review')} />
                        </div>

                        {/* ── BATCH EXECUTION AREA ── */}
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-20 md:gap-32">
                            
                            {/* Brand Watermark Overlay */}
                            <div className="hidden xl:flex xl:col-span-4 flex-col justify-start pt-12 animate-in slide-in-from-left-20 duration-1000 delay-500">
                                <div className="sticky top-12 space-y-16">
                                    <div className="relative group">
                                        <OnyxLogo className="w-80 h-80 text-white/5 transition-all duration-1000 group-hover:text-white/10 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--main-color)_0%,transparent_70%)] opacity-10 blur-3xl" />
                                    </div>
                                    <div className="space-y-8 pl-8 border-l border-white/5">
                                        <div className="space-y-2">
                                            <h3 className="text-[11px] font-black uppercase tracking-[0.8em] text-white/40">{tr("Protocol Guidelines")}</h3>
                                            <div className="h-[2px] w-12 bg-(--main-color)" />
                                        </div>
                                        <p className="text-[12px] leading-relaxed text-white/20 uppercase tracking-widest max-w-xs font-medium">
                                            {tr("Executing batch requests will generate immediate financial artifacts in the main ledger. Ensure all inventory counts have been physically verified.")}
                                        </p>
                                        <div className="flex flex-col gap-4">
                                            {[tr("TRANSACTION_LOGGING"), tr("IDENTITY_VERIFIED"), tr("ENCRYPTION_ACTIVE")].map(txt => (
                                                <div key={txt} className="flex items-center gap-3">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                                    <span className="text-[8px] font-black uppercase tracking-[0.5em] text-white/10">{txt}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Vendor Panels */}
                            <div className="xl:col-span-8 space-y-16">
                                <div className="flex items-center gap-8 mb-12">
                                    <h2 className="text-[11px] font-black uppercase tracking-[1.2em] text-white/30 whitespace-nowrap">{tr("Execution Queues")}</h2>
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                                </div>

                                {Object.keys(groups.newByVendor).length === 0 ? (
                                    <div className="py-40 flex flex-col items-center justify-center rounded-[64px] bg-white/[0.01] border border-dashed border-white/5 group hover:bg-white/[0.02] transition-all duration-700">
                                        <div className="relative mb-10">
                                            <RefreshCw size={64} strokeWidth={1} className="text-white/5 animate-spin-slow" />
                                            <Search size={24} className="absolute inset-0 m-auto text-white/10" />
                                        </div>
                                        <p className="text-[10px] font-black uppercase tracking-[1em] text-white/10 group-hover:text-white/20 transition-colors">{tr("Registry Empty : Standing By")}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-10">
                                        {Object.entries(groups.newByVendor).map(([vId, items], idx) => {
                                            const vInfo = vendors[vId as keyof typeof vendors];
                                            const vColor = vInfo?.color || '#888';
                                            const total = items.reduce((acc, i) => acc + i.cost, 0);
                                            
                                            return (
                                                <div 
                                                    key={vId} 
                                                    className="group relative overflow-hidden p-12 md:p-16 rounded-[56px] bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-700 animate-in slide-in-from-right-12"
                                                    style={{ animationDelay: `${700 + (idx * 100)}ms` }}
                                                >
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 opacity-40 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: vColor }} />
                                                    <div className="absolute top-0 right-0 p-12 opacity-0 group-hover:opacity-5 transition-opacity duration-1000 pointer-events-none">
                                                        <OnyxMiniLogo className="w-40 h-40" />
                                                    </div>
                                                    
                                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 relative z-10">
                                                        <div className="flex items-center gap-12">
                                                            <div 
                                                                className="w-24 h-24 rounded-[32px] flex items-center justify-center text-black font-black text-xl shadow-2xl transition-all duration-700 group-hover:rotate-6 group-hover:scale-110" 
                                                                style={{ backgroundColor: vColor, boxShadow: `0 0 40px ${vColor}33` }}
                                                            >
                                                                {vId}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <h4 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-xl">{vInfo?.name || tr("Unknown Source")}</h4>
                                                                <div className="flex items-center gap-4">
                                                                    <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10">
                                                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{items.length} {tr("Units")}</span>
                                                                    </div>
                                                                    <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.4em] opacity-40 group-hover:opacity-100 transition-opacity whitespace-nowrap">{tr("Ready for Batch Request")}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between lg:justify-end gap-16 border-t lg:border-t-0 pt-8 lg:pt-0 border-white/5">
                                                            <div className="flex flex-col items-end">
                                                                <div className="flex items-baseline gap-2">
                                                                    <span className="text-sm font-black text-white/20 uppercase tracking-[0.4em] mb-1">$</span>
                                                                    <p className="text-4xl md:text-6xl font-black text-white tracking-tighter tabular-nums leading-none">{total.toLocaleString()}</p>
                                                                </div>
                                                                <p className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.5em] mt-3 opacity-60">{tr("AGGREGATE_TOTAL")}</p>
                                                            </div>
                                                            <button 
                                                                disabled={isProcessing}
                                                                onClick={() => handleRequestPaymentForVendor(vId, items)}
                                                                className="h-24 px-12 rounded-[32px] bg-white/5 border border-white/10 text-white hover:bg-white hover:text-black hover:border-white transition-all duration-500 flex items-center gap-6 group/btn shadow-[0_0_50px_rgba(0,0,0,0.3)] active:scale-95 disabled:opacity-20 relative overflow-hidden"
                                                            >
                                                                <div className="flex flex-col items-start">
                                                                    <span className="text-[9px] font-black uppercase tracking-[0.6em] mb-1 opacity-40 group-hover/btn:opacity-60">{tr("Protocol")}</span>
                                                                    <span className="text-sm font-black uppercase tracking-[0.3em]">{tr("EXECUTE")}</span>
                                                                </div>
                                                                <ArrowRight size={24} className="group-hover/btn:translate-x-3 transition-transform duration-500" strokeWidth={2.5} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── INTEGRATED CONTROL BAR ─────────────────────────────────────── */}
                <div className="mt-auto px-8 py-10 md:px-20 md:py-20 flex flex-col md:flex-row items-center justify-between gap-12 md:gap-24 animate-in slide-in-from-bottom-12 duration-1000 shrink-0 bg-gradient-to-t from-black/40 to-transparent backdrop-blur-md border-t border-white/5">
                    <div className="flex flex-col gap-4">
                        <span className="text-[11px] font-black uppercase tracking-[1em] text-white/20 ml-2">{tr("Session Aggregation")}</span>
                        <div className="flex items-center gap-6">
                            <span className="text-5xl md:text-9xl font-black tracking-tighter text-white tabular-nums drop-shadow-[0_0_50px_rgba(255,255,255,0.1)]">
                                <span className="text-white/10 text-3xl md:text-5xl mr-4">$</span>
                                {totalValue.toLocaleString()}
                            </span>
                            <div className="flex flex-col justify-center gap-2">
                                <span className="px-3 py-1 bg-white/5 rounded-lg border border-white/10 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">{tr("USD_TOTAL")}</span>
                                <span className="px-3 py-1 bg-(--main-color)/10 rounded-lg border border-(--main-color)/20 text-[10px] font-black text-(--main-color) uppercase tracking-widest text-center">{tr("NET_VAL")}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-8 w-full md:w-auto">
                        <button 
                            onClick={handleClose}
                            className="group relative flex-1 md:flex-initial h-24 px-20 flex items-center justify-center rounded-[32px] bg-white/5 border border-white/5 text-white/30 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-700 text-[12px] font-black uppercase tracking-[1.2em] active:scale-95 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                            {tr("CLOSE_SESSION")}
                        </button>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                    .shadow-holographic { box-shadow: 0 0 50px rgba(var(--main-color-rgb), 0.1), inset 0 0 20px rgba(255,255,255,0.05); }
                `}} />
            </div>
        </div>,
        document.body
    );
};

interface StatusCardProps {
    label: string;
    count: number;
    amount: number;
    color: string;
    icon: any;
    onClick: () => void;
}

const StatusCard: React.FC<StatusCardProps> = ({ label, count, amount, color, icon: Icon, onClick }) => (
    <button 
        onClick={onClick}
        className="relative group p-12 rounded-[56px] bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-white/20 transition-all duration-700 text-left flex flex-col gap-10 overflow-hidden shadow-2xl backdrop-blur-xl"
    >
        <div className="absolute -top-12 -right-12 p-6 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-1000 group-hover:scale-125 group-hover:-rotate-12">
            <Icon size={240} strokeWidth={1} />
        </div>
        
        <div className="flex items-center justify-between relative z-10">
            <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center shadow-inner transition-transform duration-700 group-hover:scale-110 group-hover:rotate-6" style={{ color }}>
                <Icon size={32} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col items-end">
                <span className="text-[20px] font-black text-white leading-none mb-1">{count}</span>
                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em]">{tr("Objects")}</span>
            </div>
        </div>

        <div className="relative z-10">
            <h4 className="text-[11px] font-black uppercase tracking-[0.6em] text-white/30 group-hover:text-white/60 transition-colors mb-4">{label}</h4>
            <div className="flex items-baseline gap-2">
                <span className="text-sm font-black text-white/20">$</span>
                <p className="text-4xl font-black text-white tracking-tighter tabular-nums leading-none">
                    {amount.toLocaleString()}
                </p>
            </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-[9px] font-black uppercase tracking-[0.5em] text-white/10 group-hover:text-white/40 transition-all duration-700">
            <div className="h-[1px] flex-1 bg-white/5 group-hover:bg-white/20 transition-all" />
            <span className="whitespace-nowrap">{tr("VIEW_DETAILS")}</span>
            <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
        </div>
    </button>
);
