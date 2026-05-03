
import React, { useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { 
    isPaymentWizardOpenAtom, 
    selectedInventoryIdsAtom, 
    inventoryAtom,
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

export const ItemsPayWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPaymentWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const liveRate = useAtomValue(liveExchangeRateAtom) || 17;
    const { partialPayIds, fullPayIds, requestedAcqIds } = useAtomValue(inventoryStatusSetsAtom);
    const user = useAtomValue(userAtom);

    const setPaymentsArtifact = useSetAtom(paymentsArtifactConfigAtom);
    const setInventoryArtifact = useSetAtom(inventoryArtifactConfigAtom);

    const [isProcessing, setIsProcessing] = useState(false);

    // ── DATA GROUPING ────────────────────────────────────────────────────────
    const groups = useMemo(() => {
        const selectedItems = allInventory.filter(item => selectedIds.includes(String(item.row)));
        
        const res = {
            paid: [] as any[],
            requested: [] as any[],
            partial: [] as any[],
            new: [] as any[],
            newByVendor: {} as Record<string, any[]>
        };

        selectedItems.forEach(item => {
            const norm = normalizeInventoryData(item.data);
            const status = getStatusClass(norm, partialPayIds, fullPayIds, requestedAcqIds);
            
            const cost = calculateCodesAndPrices(norm, liveRate);
            const itemWithCost = { ...item, norm, cost: Number(cost.bookAcquisition) || 0 };

            if (status === 'GREEN') res.paid.push(itemWithCost);
            else if (status === 'YELLOW') res.requested.push(itemWithCost);
            else if (status === 'RED') res.partial.push(itemWithCost);
            else {
                res.new.push(itemWithCost);
                const vId = norm.vendorId || String(norm.itemId || '').split('-')[0] || 'MISC';
                if (!res.newByVendor[vId]) res.newByVendor[vId] = [];
                res.newByVendor[vId].push(itemWithCost);
            }
        });

        return res;
    }, [allInventory, selectedIds, partialPayIds, fullPayIds, requestedAcqIds, liveRate]);

    if (!isOpen) return null;

    const handleClose = () => setIsOpen(false);

    const openPaymentsForItems = (items: any[], title: string) => {
        const ids = items.map(i => String(i.row));
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
            const totalMxn = items.reduce((acc, i) => acc + (i.cost * liveRate), 0);
            const itemIds = items.map(i => String(i.row));
            
            // 1. Create Finance Record
            const { data: finData, error: finError } = await supabase.from('finance').insert({
                amount: totalMxn,
                currency: 'MXN',
                status: 'Requested',
                date: new Date().toISOString(),
                description: `Bulk Acq: ${vendorId} (${items.length} items)`,
                vendor_id: vendorId,
                type: 'Expense',
                category: 'Acquisition',
                subcategory: 'acq',
                related_ids: itemIds,
                notes: `Generated via ItemsPay Wizard by ${user?.name || 'Unknown'}`,
                updated_at: new Date().toISOString()
            }).select();

            if (finError) throw finError;

            // 2. Update Inventory Items
            const { error: invError } = await supabase.from('inventory')
                .update({ 
                    pay_req: 'requested',
                    payment_ids: finData[0].id.toString()
                })
                .in('id', itemIds.map(Number));

            if (invError) throw invError;

            toast.success(`Request generated for ${vendorId}`, { id: tid });
            // Close wizard if all done? Or just refresh? 
            // Better to refresh via atom update (if handled by sync engine)
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

    return (
        <div className="absolute inset-0 z-[1000] flex flex-col pointer-events-none animate-in fade-in duration-700 overflow-hidden">
            <div className="absolute inset-0 backdrop-blur-xl bg-black/40 pointer-events-auto" onClick={handleClose} />
            
            <div className="relative w-full h-full flex flex-col pointer-events-auto overflow-y-auto bg-black/10 backdrop-blur-3xl">
                
                {/* Floating Close Button - Studio Standard */}
                <button 
                    onClick={handleClose} 
                    className="fixed top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                >
                    <X size={32} className="md:w-[48px] md:h-[48px] group-hover:rotate-90 transition-transform duration-700" strokeWidth={1} />
                </button>

                <div className="flex-1 flex flex-col p-8 md:p-12 lg:p-16 max-w-7xl mx-auto w-full">
                    
                    {/* Header - Studio Style */}
                    <div className="flex justify-between items-start mb-16 shrink-0">
                        <div className="flex flex-col gap-5">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_30px_rgba(var(--main-color-rgb),0.4)]">
                                    <CreditCard size={24} strokeWidth={2.5} />
                                </div>
                                <div className="flex flex-col">
                                    <h2 className="text-3xl font-black text-white tracking-[0.3em] uppercase leading-none">PAY</h2>
                                    <span className="text-[10px] font-black text-white/20 tracking-[1em] uppercase mt-3">BULK_DISBURSEMENT_PROTOCOL</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[1em] mb-2">ARTIFACT_COUNT</span>
                            <span className="text-6xl font-black text-(--main-color) leading-none tabular-nums tracking-tighter">{selectedIds.length}</span>
                        </div>
                    </div>

                    {/* CONTENT */}
                    <div className="flex-1 space-y-16">
                    
                    {/* STATUS SUMMARY CARDS */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatusCard 
                            label="Paid" 
                            count={groups.paid.length} 
                            amount={groupTotals.paid} 
                            color="#22c55e" 
                            icon={CheckCircle2} 
                            onClick={() => openPaymentsForItems(groups.paid, 'Paid Items Detail')}
                        />
                        <StatusCard 
                            label="Requested" 
                            count={groups.requested.length} 
                            amount={groupTotals.requested} 
                            color="#eab308" 
                            icon={Clock} 
                            onClick={() => openPaymentsForItems(groups.requested, 'Requested Items Detail')}
                        />
                        <StatusCard 
                            label="Partial" 
                            count={groups.partial.length} 
                            amount={groupTotals.partial} 
                            color="#ef4444" 
                            icon={AlertCircle} 
                            onClick={() => openPaymentsForItems(groups.partial, 'Partial Items Detail')}
                        />
                        <StatusCard 
                            label="New" 
                            count={groups.new.length} 
                            amount={groupTotals.new} 
                            color="#38bdf8" 
                            icon={PlusCircle} 
                            onClick={() => openInventoryForItems(groups.new, 'New Items Review')}
                        />
                    </div>

                    {/* ACTIONABLE: NEW ITEMS BY VENDOR */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between border-b border-white/5 pb-4">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">Pending Payment Requests</h3>
                            <span className="text-[10px] font-black text-(--main-color) bg-(--main-color)/10 px-3 py-1 rounded-full uppercase tracking-widest">
                                {Object.keys(groups.newByVendor).length} Vendors Found
                            </span>
                        </div>

                        {Object.keys(groups.newByVendor).length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center opacity-20 border-2 border-dashed border-white/5 rounded-[32px]">
                                <RefreshCw size={40} strokeWidth={1} className="mb-4" />
                                <p className="text-xs font-black uppercase tracking-[0.2em]">No new items pending request</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {Object.entries(groups.newByVendor).map(([vId, items]) => {
                                    const vInfo = vendors[vId as keyof typeof vendors];
                                    const vColor = vInfo?.color || '#888';
                                    const total = items.reduce((acc, i) => acc + i.cost, 0);
                                    
                                    return (
                                        <div key={vId} className="group relative flex items-center justify-between p-6 rounded-3xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all overflow-hidden">
                                            <div className="absolute left-0 top-0 bottom-0 w-1 opacity-50" style={{ backgroundColor: vColor }} />
                                            
                                            <div className="flex items-center gap-6">
                                                <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl text-black font-black text-xs shadow-lg" style={{ backgroundColor: vColor }}>
                                                    {vId}
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-white uppercase tracking-tight">{vInfo?.name || 'Unknown Vendor'}</h4>
                                                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">
                                                        {items.length} {items.length === 1 ? 'Artifact' : 'Artifacts'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-10">
                                                <div className="text-right">
                                                    <p className="text-xl font-mono font-black text-white">${total.toLocaleString()}</p>
                                                    <p className="text-[9px] font-black text-(--main-color) uppercase tracking-widest mt-1">≈ ${(total * liveRate).toLocaleString()} MXN</p>
                                                </div>
                                                <button 
                                                    disabled={isProcessing}
                                                    onClick={() => handleRequestPaymentForVendor(vId, items)}
                                                    className="h-14 px-8 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-(--main-color) hover:text-black hover:border-(--main-color) transition-all flex items-center gap-3 group/btn"
                                                >
                                                    <span className="text-[11px] font-black uppercase tracking-widest">Request Pay</span>
                                                    <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    </div>

                    {/* FOOTER - Minimalist Studio Style */}
                    <div className="mt-auto pt-16 flex justify-between items-end border-t border-white/5">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-2">Total Selected Value</span>
                            <div className="flex items-baseline gap-3">
                                <span className="text-4xl font-mono font-black text-white leading-none">
                                    ${Object.values(groupTotals).reduce((a, b) => a + b, 0).toLocaleString()}
                                </span>
                                <span className="text-sm font-black text-white/20">USD</span>
                            </div>
                        </div>
                        <button 
                            onClick={handleClose}
                            className="px-12 py-5 rounded-2xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all text-[11px] font-black uppercase tracking-[0.5em] active:scale-95"
                        >
                            Terminate Wizard
                        </button>
                    </div>
                </div>
            </div>
        </div>
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
        className="relative group p-6 rounded-[32px] bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all text-left flex flex-col gap-4 overflow-hidden"
    >
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Icon size={64} />
        </div>
        <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-white/5" style={{ color }}>
                <Icon size={18} strokeWidth={3} />
            </div>
            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md">
                {count}
            </span>
        </div>
        <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 group-hover:text-white/60 transition-colors">{label}</h4>
            <p className="text-xl font-mono font-black text-white mt-1">${amount.toLocaleString()}</p>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/10 group-hover:text-(--main-color) transition-colors">
            <span>View Records</span>
            <ExternalLink size={8} />
        </div>
    </button>
);
