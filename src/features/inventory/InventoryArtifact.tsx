
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai/react';
import { 
    inventoryAtom, 
    inventoryArtifactConfigAtom, 
    exchangeRateAtom, 
    showFinancialsAtom,
    financeDataAtom
} from '../../lib/atoms';
import { X, Package, ChevronRight } from 'lucide-react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { getStatusClass } from './UnifiedInventoryView';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

export const InventoryArtifact: React.FC = () => {
    const [config, setConfig] = useAtom(inventoryArtifactConfigAtom);
    const allItems = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const showFinancials = useAtomValue(showFinancialsAtom);
    const financeDocs = useAtomValue(financeDataAtom);

    const partialPayIds = useMemo(() => {
        const ids = new Set<string>();
        financeDocs.forEach(d => {
            if (d.status === 'Paid' && d.description?.includes('%')) {
                const rel = d.related_ids || (d.related_inventory_ids ? d.related_inventory_ids.split(',').map((s: string) => s.trim()) : []);
                if (Array.isArray(rel)) {
                    rel.forEach((id: string) => ids.add(String(id)));
                } else if (typeof rel === 'string' && rel.includes(',')) {
                    rel.split(',').forEach((id: string) => ids.add(id.trim()));
                }
            }
        });
        return ids;
    }, [financeDocs]);

    const filteredItems = useMemo(() => {
        if (!config.isOpen || !config.itemIds.length) return [];
        return allItems.filter(item => {
            const itemId = String(item.data.id);
            const itemCode = String(item.data.itemId || item.data.item_id);
            return config.itemIds.some(id => String(id) === itemId || String(id) === itemCode);
        });
    }, [allItems, config]);

    if (!config.isOpen) return null;

    const onClose = () => setConfig(prev => ({ ...prev, isOpen: false }));

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
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all shadow-lg border border-white/5"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    {filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <Package size={48} strokeWidth={1} />
                            <p className="text-xs font-black uppercase tracking-widest mt-4">No matching items</p>
                        </div>
                    ) : (
                        filteredItems.map((item) => {
                            const norm = normalizeInventoryData(item.data);
                            const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                            const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                            const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                            const imageUrl = getCleanImageUrl(norm.generatedPngUrl || norm.mediaUrls?.split(',')[0]);
                            const payStatus = getStatusClass(norm, partialPayIds);
                            const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : 'transparent';
                            
                            const itemPriceMXN = Math.ceil(Number(norm.price || 0));
                            const itemQuantity = Number(norm.quantity || 1);
                            const itemTotalMXN = itemPriceMXN * itemQuantity;

                            return (
                                <div 
                                    key={item.row} 
                                    className="flex items-stretch overflow-hidden bg-black/20 border border-white/5 rounded-2xl hover:border-white/20 transition-all group"
                                    style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 20%, rgba(255,255,255,0.05))` : undefined }}
                                >
                                    {/* Payment status accent stripe */}
                                    <div className="w-1 shrink-0 self-stretch" style={{ backgroundColor: payStatus ? accentColor : 'transparent', opacity: payStatus ? 0.7 : 0 }} />
                                    
                                    {/* Image */}
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-black/40 relative">
                                        {imageUrl ? (
                                            <img src={imageUrl} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full p-3 opacity-20 flex items-center justify-center">
                                                <OnyxMiniLogo className="w-full h-full object-contain" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Item Info */}
                                    <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center px-4 gap-4 min-w-0">
                                        {/* Title & Dims */}
                                        <div className="flex flex-col justify-center min-w-[140px] flex-1">
                                            <h3 className="text-[11px] sm:text-[13px] font-bold text-white truncate uppercase tracking-tight">
                                                {(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}
                                            </h3>
                                            <div className="flex items-center gap-2 text-[9px] text-white/30 uppercase tracking-widest font-black mt-1">
                                                {norm.color} <span className="opacity-30">·</span> {norm.material}
                                            </div>
                                        </div>

                                        {/* Tag ID */}
                                        <div className="flex flex-col min-w-[70px] shrink-0 justify-center">
                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1 leading-none">Tag ID</span>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-black text-[10px] sm:text-[11px] font-black uppercase tracking-tighter shadow-sm w-fit" style={{ backgroundColor: vendorColor }}>
                                                {calculated.bookBardcode || 'N/A'}
                                            </span>
                                        </div>

                                        {/* Financials */}
                                        <div className="flex items-center gap-6 shrink-0">
                                            <div className="flex flex-col min-w-[70px] items-end justify-center">
                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.15em] mb-1 leading-none">Price x Qty</span>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-[11px] sm:text-[12px] font-bold text-white/80">{showFinancials ? `$${itemPriceMXN}` : '***'}</span>
                                                    <span className="text-[9px] text-white/20 font-mono font-black">x{itemQuantity}</span>
                                                </div>
                                            </div>

                                            <div className="flex flex-col min-w-[80px] items-end justify-center">
                                                <span className="text-[8px] font-black text-(--main-color) opacity-50 uppercase tracking-[0.15em] mb-1 leading-none">Total MXN</span>
                                                <span className="text-[14px] sm:text-[16px] font-black text-(--main-color) font-mono">
                                                    {showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Pay Status */}
                                        {payStatus && (
                                            <div className="hidden sm:flex flex-col min-w-[80px] shrink-0 items-end justify-center">
                                                {(() => {
                                                    const cfg: Record<'GREEN'|'YELLOW'|'RED', { label: string; color: string; bg: string }> = {
                                                        GREEN:  { label: 'Paid',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
                                                        YELLOW: { label: 'Requested', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
                                                        RED:    { label: 'Partial',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
                                                    };
                                                    const { label, color, bg } = cfg[payStatus];
                                                    return (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest"
                                                            style={{ color, backgroundColor: bg }}>
                                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
                                                            {label}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Bar */}
                <div className="px-6 py-4 bg-black/40 border-t border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-1">Total Artifact Value</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-mono font-black text-(--main-color)">
                                    {showFinancials ? `$${Math.ceil(filteredItems.reduce((acc, item) => acc + (parseFloat(String(item.data.price || 0)) * (parseInt(String(item.data.quantity || 1)) || 1)), 0)).toLocaleString()}` : '***'}
                                </span>
                                <span className="text-[10px] font-black text-white/20 tracking-widest">MXN</span>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-(--main-color) text-black font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-(--main-color)/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
