
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { 
    inventoryAtom, 
    storeInventoryAtom,
    inventoryArtifactConfigAtom, 
    exchangeRateAtom, 
    showFinancialsAtom,
    financeDataAtom,
    currencyModeAtom,
    paymentsArtifactConfigAtom
} from '../../lib/atoms';
import { X, Package, LayoutList, LayoutGrid } from 'lucide-react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, getStatusClass } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

export const InventoryArtifact: React.FC = () => {
    const [viewMode, setViewMode] = React.useState<'list' | 'gallery'>('list');
    const [config, setConfig] = useAtom(inventoryArtifactConfigAtom);
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
    const wipItems = useAtomValue(inventoryAtom);
    const storeItems = useAtomValue(storeInventoryAtom);
    const allItems = useMemo(() => [...wipItems, ...storeItems], [wipItems, storeItems]);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const showFinancials = useAtomValue(showFinancialsAtom);
    const financeDocs = useAtomValue(financeDataAtom);
    const currencyMode = useAtomValue(currencyModeAtom);

    const { partialPayIds, fullPayIds } = useMemo(() => {
        const pIds = new Set<string>();
        const fIds = new Set<string>();
        financeDocs.forEach((d: any) => {
            if (d.status === 'Paid') {
                const rel = d.related_ids || d.related_inventory_ids || '';
                let relArray: string[] = [];
                if (Array.isArray(rel)) {
                    relArray = rel.map(id => String(id));
                } else if (typeof rel === 'string') {
                    relArray = rel.split(',').map(s => s.trim()).filter(Boolean);
                }
                if (d.description?.includes('%')) {
                    relArray.forEach(id => pIds.add(id));
                } else {
                    relArray.forEach(id => fIds.add(id));
                }
            }
        });
        return { partialPayIds: pIds, fullPayIds: fIds };
    }, [financeDocs]);

    const filteredItems = useMemo(() => {
        if (!config.isOpen || !config.itemIds.length) return [];
        return allItems.filter(item => {
            if (!item || !item.data) return false;
            const itemId = String(item.data.id || '');
            const itemCode = String(item.data.itemId || item.data.item_id || '');
            return config.itemIds.some(id => {
                const sId = String(id);
                return sId === itemId || sId === itemCode;
            });
        });
    }, [allItems, config]);

    const aggregateFinancials = useMemo(() => {
        if (!filteredItems.length) return { listValue: 0, netPaid: 0, taxes: 0, total: 0 };
        
        const listValue = filteredItems.reduce((acc, item) => 
            acc + (parseFloat(String(item.data.price || 0)) * (parseInt(String(item.data.quantity || 1)) || 1)), 0);
            
        // Collect all unique relevant payments
        const uniquePayments = new Map<string, any>();
        filteredItems.forEach(item => {
            financeDocs.forEach((d: any) => {
                const rel = d.related_ids || d.related_inventory_ids || '';
                let relArray: string[] = [];
                if (Array.isArray(rel)) relArray = rel.map(id => String(id));
                else if (typeof rel === 'string') relArray = rel.split(',').map(s => s.trim()).filter(Boolean);
                
                if (relArray.includes(String(item.data.id))) {
                    uniquePayments.set(d.id, d);
                }
            });
        });
        
        let netPaid = 0;
        let taxes = 0;
        uniquePayments.forEach(p => {
            netPaid += (p.amount || 0);
            taxes += (p.commission || 0);
        });
        
        return { listValue, netPaid, taxes, total: netPaid + taxes };
    }, [filteredItems, financeDocs]);

    if (!config.isOpen) return null;

    const onClose = () => setConfig(prev => ({ ...prev, isOpen: false }));

    const uniqueRelatedPayments = useMemo(() => {
        const paymentMap = new Map<string, any>();
        financeDocs.forEach((d: any) => {
            const rel = d.related_ids || d.related_inventory_ids || '';
            let relArray: string[] = [];
            if (Array.isArray(rel)) relArray = rel.map(id => String(id));
            else if (typeof rel === 'string') relArray = rel.split(',').map(s => s.trim()).filter(Boolean);
            
            if (relArray.some(rid => config.itemIds.includes(rid))) {
                paymentMap.set(d.id, d);
            }
        });
        return Array.from(paymentMap.values()).sort((a,b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });
    }, [financeDocs, config.itemIds]);

    return createPortal(
        <div className="fixed inset-0 z-10000 flex items-center justify-center p-4 sm:p-6 md:p-12 animate-in fade-in duration-300">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={onClose} />
            
            {/* Artifact Container */}
            <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-(--sidebar-bg)/90 backdrop-blur-xl animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-(--main-color)/10 text-(--main-color)">
                            <Package size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
                                {config.title || 'Inventory Artifact'}
                            </h2>
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                                {filteredItems.length} {filteredItems.length === 1 ? 'Item' : 'Items'} Found
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* View Switcher */}
                        <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-white/5 mr-4 overflow-hidden">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    viewMode === 'list' 
                                        ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' 
                                        : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                                }`}
                            >
                                <LayoutList size={14} />
                                <span className="hidden sm:inline">List</span>
                            </button>
                            <button
                                onClick={() => setViewMode('gallery')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    viewMode === 'gallery' 
                                        ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' 
                                        : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                                }`}
                            >
                                <LayoutGrid size={14} />
                                <span className="hidden sm:inline">Gallery</span>
                            </button>
                        </div>

                        <button 
                            onClick={onClose}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all shadow-lg border border-white/5"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <Package size={48} strokeWidth={1} />
                            <p className="text-xs font-black uppercase tracking-widest mt-4">No matching items</p>
                        </div>
                    ) : (
                        <>
                            {viewMode === 'list' && (
                                <div className="space-y-2">
                                    {filteredItems.map((item) => {
                                        const norm = normalizeInventoryData(item.data);
                                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                                        const imageUrl = getCleanImageUrl(norm.generatedPngUrl || norm.mediaUrls?.split(',')[0]);
                                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : 'transparent';
                                        
                                        const itemPriceMXN = Math.ceil(Number(norm.price || 0));
                                        const itemQuantity = Number(norm.quantity || 1);
                                        const itemTotalMXN = itemPriceMXN * itemQuantity;

                                        return (
                                            <div key={item.row} className="flex items-stretch overflow-hidden bg-black/20 border border-white/5 rounded-2xl hover:border-white/20 transition-all group"
                                                style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 20%, rgba(255,255,255,0.05))` : undefined }}>
                                                
                                                <div className="w-1 shrink-0 self-stretch" style={{ backgroundColor: payStatus ? accentColor : 'transparent', opacity: payStatus ? 0.7 : 0 }} />
                                                
                                                <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-black/40 relative">
                                                    {imageUrl ? (
                                                        <img src={imageUrl} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <div className="w-full h-full p-3 opacity-20 flex items-center justify-center">
                                                            <OnyxMiniLogo className="w-full h-full object-contain" />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center px-4 gap-4 min-w-0">
                                                    <div className="flex flex-col justify-center min-w-[140px] flex-1">
                                                        <h3 className="text-[11px] sm:text-[13px] font-bold text-white truncate uppercase tracking-tight">
                                                            {(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}
                                                        </h3>
                                                        <div className="flex items-center gap-2 text-[9px] text-white/30 uppercase tracking-widest font-black mt-1">
                                                            {norm.color} <span className="opacity-30">·</span> {norm.material}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col min-w-[70px] shrink-0 justify-center">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1 leading-none">Tag ID</span>
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-black text-[10px] sm:text-[11px] font-black uppercase tracking-tighter shadow-sm w-fit" style={{ backgroundColor: vendorColor }}>
                                                            {calculated.bookBardcode || 'N/A'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-6 shrink-0">
                                                        <div className="flex flex-col min-w-[70px] items-end justify-center">
                                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.15em] mb-1 leading-none">Price x Qty</span>
                                                            <div className="flex items-baseline gap-1">
                                                                <span className="text-[11px] sm:text-[12px] font-bold text-white/80">
                                                                    {showFinancials 
                                                                        ? (currencyMode === 'MXN' ? `$${itemPriceMXN.toLocaleString()}` : `$${(itemPriceMXN / exchangeRate).toFixed(2)}`) 
                                                                        : '***'}
                                                                </span>
                                                                <span className="text-[9px] text-white/20 font-mono font-black">x{itemQuantity}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col min-w-[80px] items-end justify-center">
                                                            <span className={`text-[8px] font-black uppercase tracking-[0.15em] mb-1 leading-none ${currencyMode === 'USD' ? 'text-emerald-400/50' : 'text-sky-400/50'}`}>Total {currencyMode}</span>
                                                            <span className={`text-[12px] sm:text-[14px] font-black font-mono ${currencyMode === 'USD' ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                                {showFinancials 
                                                                ? (currencyMode === 'MXN' ? `$${itemTotalMXN.toLocaleString()}` : `$${(itemTotalMXN / exchangeRate).toFixed(2)}`) 
                                                                : '***'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="hidden sm:flex flex-col min-w-[80px] shrink-0 items-end justify-center">
                                                        {payStatus ? (
                                                            (() => {
                                                                const cfg: Record<'GREEN'|'YELLOW'|'RED'|'BLUE'|'PURPLE', { label: string; color: string; bg: string }> = {
                                                                    GREEN:  { label: 'Paid',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
                                                                    YELLOW: { label: 'Requested', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
                                                                    RED:    { label: 'Partial',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
                                                                    BLUE:   { label: 'Production', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
                                                                    PURPLE: { label: 'Acquired',   color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
                                                                };
                                                                const { label, color, bg } = cfg[payStatus as keyof typeof cfg] || { label: 'New', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' };
                                                                return (
                                                                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all"
                                                                        style={{ color, backgroundColor: bg }}>
                                                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
                                                                        {label}
                                                                    </div>
                                                                );
                                                            })()
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide w-fit border border-[#38bdf8]/30 text-[#38bdf8] bg-[#38bdf8]/5 shadow-[0_0_10px_rgba(56,189,248,0.1)]">
                                                                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#38bdf8]" />
                                                                New
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {viewMode === 'gallery' && (
                                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6 items-start">
                                    {filteredItems.map((item) => {
                                        const norm = normalizeInventoryData(item.data);
                                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                                        
                                        const mediaUrls = (norm.mediaUrls || norm.generatedPngUrl || '').split(',').map(s => s.trim()).filter(Boolean);
                                        const primaryImage = getCleanImageUrl(mediaUrls[0]);
                                        const secondaryImages = mediaUrls.slice(1, 5).map(u => getCleanImageUrl(u));
                                        
                                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : 'transparent';
                                        
                                        const itemPriceMXN = Math.ceil(Number(norm.price || 0));
                                        const itemQuantity = Number(norm.quantity || 1);
                                        const itemTotalMXN = itemPriceMXN * itemQuantity;

                                        // Dynamic size: Items with multiple images span more columns
                                        const colSpan = mediaUrls.length > 1 ? 'md:col-span-4 lg:col-span-3' : 'md:col-span-2 lg:col-span-2';

                                        return (
                                            <div key={item.row} className={`${colSpan} bg-black/40 border border-white/10 rounded-[32px] overflow-hidden flex flex-col group hover:border-white/20 transition-all hover:bg-black/60 shadow-2xl relative`}>
                                                
                                                {/* Header Frame Info */}
                                                <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-black text-white truncate uppercase tracking-tight">
                                                            {(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}
                                                        </span>
                                                        <span className="text-[8px] text-white/30 uppercase tracking-widest font-black mt-0.5">
                                                            {norm.color} · {norm.material}
                                                        </span>
                                                    </div>
                                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-black text-[10px] font-black uppercase tracking-tight shadow-md" style={{ backgroundColor: vendorColor }}>
                                                        {calculated.bookBardcode || 'N/A'}
                                                    </span>
                                                </div>

                                                <div className="flex flex-1 min-h-[300px] gap-1 p-1 bg-black/40">
                                                    {/* Primary Image */}
                                                    <div className="flex-1 h-full bg-black/80 relative overflow-hidden group-hover:bg-black/40 transition-colors">
                                                        {primaryImage ? (
                                                            <img src={primaryImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center opacity-10">
                                                                <OnyxMiniLogo className="w-1/2" />
                                                            </div>
                                                        )}
                                                        
                                                        {/* Status Overlay */}
                                                        <div className="absolute top-4 left-4">
                                                            {payStatus ? (
                                                                (() => {
                                                                    const cfg: Record<'GREEN'|'YELLOW'|'RED'|'BLUE'|'PURPLE', { label: string; color: string; bg: string }> = {
                                                                        GREEN:  { label: 'Paid',      color: '#22c55e', bg: 'rgba(0,0,0,0.6)' },
                                                                        YELLOW: { label: 'Requested', color: '#eab308', bg: 'rgba(0,0,0,0.6)' },
                                                                        RED:    { label: 'Partial',   color: '#ef4444', bg: 'rgba(0,0,0,0.6)' },
                                                                        BLUE:   { label: 'Production', color: '#38bdf8', bg: 'rgba(0,0,0,0.6)' },
                                                                        PURPLE: { label: 'Acquired',   color: '#a855f7', bg: 'rgba(0,0,0,0.6)' },
                                                                    };
                                                                    const { label, color, bg } = cfg[payStatus as keyof typeof cfg] || { label: 'New', color: '#38bdf8', bg: 'rgba(0,0,0,0.6)' };
                                                                    return (
                                                                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest backdrop-blur-md shadow-lg border border-white/10"
                                                                            style={{ color, backgroundColor: bg }}>
                                                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
                                                                            {label}
                                                                        </div>
                                                                    );
                                                                })()
                                                            ) : (
                                                                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest backdrop-blur-md bg-black/60 text-sky-400 border border-sky-400/20 shadow-lg">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                                                                    New
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Gallery sidebar (multi image) */}
                                                    {secondaryImages.length > 0 && (
                                                        <div className="w-24 md:w-32 lg:w-40 flex flex-col gap-1 overflow-y-auto no-scrollbar">
                                                            {secondaryImages.map((img, i) => (
                                                                <div key={i} className="flex-1 min-h-[80px] bg-black/40 hover:bg-black/20 transition-colors cursor-pointer group/thumb">
                                                                    <img src={img} className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform" alt="" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Bottom Frame Details */}
                                                <div className="p-4 bg-black/60 border-t border-white/5 flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Total MXN</span>
                                                        <span className="text-sm font-black font-mono text-white/90">
                                                            {showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Unit Cost</span>
                                                        <span className="text-[10px] font-bold text-white/50">
                                                            {showFinancials ? `$${itemPriceMXN.toLocaleString()}` : '***'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            
                            {/* Unique Payments Summary List */}
                            {uniqueRelatedPayments.length > 0 && (
                                <div className="mt-8 space-y-3 pt-6 border-t border-white/10">
                                    <div className="px-2 pb-2">
                                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Payment Details</span>
                                    </div>
                                    {uniqueRelatedPayments.map((p, idx) => {
                                        const net = p.amount || 0;
                                        const fees = p.commission || 0;
                                        const total = net + fees;
                                        const format = (val: number) => {
                                            if (!showFinancials) return '***';
                                            if (currencyMode === 'USD') return `$${(val / exchangeRate).toFixed(2)}`;
                                            return `$${val.toLocaleString()}`;
                                        };

                                        return (
                                            <div key={p.id || idx} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 p-4 rounded-2xl bg-black/20 border border-white/5 shadow-sm group hover:border-white/10 transition-all">
                                                <div className="flex flex-col min-w-[120px]">
                                                    <span className="text-[11px] text-white font-bold">{p.date ? new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date'}</span>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${p.status === 'Paid' ? 'bg-green-400/10 text-green-400' : p.status === 'Requested' ? 'bg-yellow-400/10 text-yellow-400' : 'bg-sky-400/10 text-sky-400'}`}>{p.status || 'New'}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-1 items-center gap-6 sm:gap-10 justify-end overflow-hidden">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-0.5">Net Paid</span>
                                                        <span className="text-[11px] font-mono font-bold text-white/70">{format(net)}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-0.5">Taxes/Fees</span>
                                                        <span className="text-[11px] font-mono font-bold text-red-400/60">{format(fees)}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end border-l border-white/10 pl-6 sm:pl-10">
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400/40 mb-0.5">Total</span>
                                                        <span className="text-[13px] font-mono font-black text-emerald-400">{format(total)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Bar */}
                <div className="px-6 py-6 bg-black/60 border-t border-white/10 flex flex-wrap sm:flex-nowrap items-center justify-between gap-6 shrink-0">
                    <div className="flex flex-wrap items-center gap-6 sm:gap-14">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">List Value</span>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-2xl font-mono font-black ${currencyMode === 'USD' ? 'text-emerald-400' : 'text-sky-400'}`}>
                                    {showFinancials 
                                        ? (currencyMode === 'MXN' ? `$${Math.ceil(aggregateFinancials.listValue).toLocaleString()}` : `$${(aggregateFinancials.listValue / exchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`) 
                                        : '***'}
                                </span>
                                <span className={`text-[10px] font-black tracking-widest ${currencyMode === 'USD' ? 'text-emerald-400/40' : 'text-sky-400/40'}`}>{currencyMode}</span>
                            </div>
                        </div>

                        <div className="flex flex-col border-l border-white/10 pl-6 sm:pl-12">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">Net Paid</span>
                            <span className="text-base sm:text-lg font-mono font-black text-white/60">
                                {showFinancials 
                                    ? (currencyMode === 'MXN' ? `$${Math.ceil(aggregateFinancials.netPaid).toLocaleString()}` : `$${(aggregateFinancials.netPaid / exchangeRate).toFixed(2)}`) 
                                    : '***'}
                            </span>
                        </div>

                        <div className="flex flex-col border-l border-white/10 pl-6 sm:pl-12">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">Taxes / Fees</span>
                            <span className="text-base sm:text-lg font-mono font-black text-red-400/40">
                                {showFinancials 
                                    ? (currencyMode === 'MXN' ? `$${Math.ceil(aggregateFinancials.taxes).toLocaleString()}` : `$${(aggregateFinancials.taxes / exchangeRate).toFixed(2)}`) 
                                    : '***'}
                            </span>
                        </div>

                        <div className="flex flex-col border-l border-white/10 pl-6 sm:pl-12">
                            <span className="text-[8px] font-black text-emerald-400/40 uppercase tracking-[0.3em] mb-1.5">Grand Total</span>
                            <span className="text-xl sm:text-2xl font-mono font-black text-emerald-400">
                                {showFinancials 
                                    ? (currencyMode === 'MXN' ? `$${Math.ceil(aggregateFinancials.total).toLocaleString()}` : `$${(aggregateFinancials.total / exchangeRate).toFixed(2)}`) 
                                    : '***'}
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="px-8 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-[0.2em] border border-white/10 hover:border-white/20 transition-all active:scale-95"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
