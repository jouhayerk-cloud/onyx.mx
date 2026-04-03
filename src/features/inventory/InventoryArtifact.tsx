import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAtomValue, useAtom } from 'jotai';
import { 
    inventoryAtom, 
    financeDataAtom, 
    exchangeRateAtom, 
    showFinancialsAtom,
    inventoryViewModeAtom,
    logisticsDataAtom
} from '../../lib/atoms';
import { 
    normalizeInventoryData, 
    calculateCodesAndPrices, 
    getCleanImageUrl, 
    isVideoFile,
    getStatusClass 
} from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { X, Package, LayoutList, LayoutGrid, Layout, Share2, DollarSign, Tag, Info, Maximize2, Video } from 'lucide-react';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

interface InventoryArtifactProps {
    ids: (string | number)[];
    onClose: () => void;
    initialView?: 'list' | 'grid' | 'gallery';
}

import { inventoryArtifactConfigAtom } from '../../lib/atoms';

export const InventoryArtifact = () => {
    const [config, setConfig] = useAtom(inventoryArtifactConfigAtom);
    
    if (!config.isOpen) return null;
    
    return (
        <InventoryArtifactInner 
            ids={config.itemIds} 
            onClose={() => setConfig({ ...config, isOpen: false })} 
        />
    );
};

export const InventoryArtifactInner: React.FC<InventoryArtifactProps> = ({ ids, onClose, initialView }) => {
    const items = useAtomValue(inventoryAtom);
    const financeDocs = useAtomValue(financeDataAtom);
    const logisticsDocs = useAtomValue(logisticsDataAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const showFinancials = useAtomValue(showFinancialsAtom);
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'gallery'>(initialView || 'gallery');
    const currencyMode = 'MXN'; // Default to MXN for artifacts

    // Standardize IDs
    const targetIds = useMemo(() => ids.map(id => String(id)), [ids]);

    // Filter and combine data
    const filteredItems = useMemo(() => {
        // Create a map of logistics for faster lookup
        const logMap = new Map();
        logisticsDocs.forEach(l => {
            const rel = l.related_ids || l.related_inventory_ids || '';
            const relArray = typeof rel === 'string' ? rel.split(',').map(s => s.trim()) : Array.isArray(rel) ? rel.map(id => String(id)) : [];
            relArray.forEach(rid => {
                if (!logMap.has(rid)) logMap.set(rid, []);
                logMap.get(rid).push(l);
            });
        });

        return targetIds.map(id => {
            const baseItem = items.find(i => String(i.row) === id || String(i.data?.id) === id);
            if (!baseItem) return null;
            return {
                ...baseItem,
                logistics: logMap.get(id) || []
            };
        }).filter(Boolean);
    }, [targetIds, items, logisticsDocs]);

    // Financial Mapping (for status detection)
    const { partialPayIds, fullPayIds } = useMemo(() => {
        const pIds = new Set<string>();
        const fIds = new Set<string>();
        financeDocs.forEach(d => {
            const isPartial = String(d.status).toLowerCase().includes('partial') || String(d.description).includes('%');
            const rel = d.related_ids || d.related_inventory_ids || '';
            const relArray = typeof rel === 'string' ? rel.split(',').map(s => s.trim()) : Array.isArray(rel) ? rel.map(id => String(id)) : [];
            
            if ((d.status === 'Paid' || d.status === 'Partial') && isPartial) {
                relArray.forEach(id => pIds.add(id));
            } else if (d.status === 'Paid') {
                relArray.forEach(id => fIds.add(id));
            }
        });
        return { partialPayIds: pIds, fullPayIds: fIds };
    }, [financeDocs]);

    // Aggregates
    const aggregateFinancials = useMemo(() => {
        let listValue = 0;
        let netPaid = 0;
        let taxes = 0;

        filteredItems.forEach((item: any) => {
            const norm = normalizeInventoryData(item.data);
            const qty = Number(norm.quantity || 1);
            const price = Number(norm.price || 0);
            listValue += price * qty;
        });

        // Unique related payments for the summary list
        const relatedPayments = financeDocs.filter(d => {
            const rel = d.related_ids || d.related_inventory_ids || '';
            const relArray = typeof rel === 'string' ? rel.split(',').map(s => s.trim()) : Array.isArray(rel) ? rel.map(id => String(id)) : [];
            return relArray.some(rid => targetIds.includes(rid));
        });

        relatedPayments.forEach(p => {
            netPaid += (p.amount || 0);
            taxes += (p.commission || 0);
        });

        return {
            listValue,
            netPaid,
            taxes,
            total: netPaid + taxes,
            uniquePayments: relatedPayments
        };
    }, [filteredItems, financeDocs, targetIds]);

    if (filteredItems.length === 0) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-10 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={onClose} />
            
            <div className="relative w-full max-w-7xl h-[90vh] bg-[#0a0a0a] border border-white/10 rounded-[40px] shadow-2xl flex flex-col overflow-hidden">
                
                {/* Modern Header */}
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                            <Package size={24} className="text-white/40" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-xl font-black text-white tracking-tighter uppercase leading-none">Inventory Artifact</h2>
                            <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.2em] mt-1.5">{filteredItems.length} Items Indexed</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* View Switcher */}
                        <div className="flex items-center gap-1 bg-black/40 rounded-xl p-1 border border-white/5">
                            <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white/40'}`}><LayoutList size={16} /></button>
                            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white/40'}`}><LayoutGrid size={16} /></button>
                            <button onClick={() => setViewMode('gallery')} className={`p-2 rounded-lg transition-all ${viewMode === 'gallery' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white/40'}`}><Layout size={16} /></button>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5">&times;</button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
                    
                    {(() => {
                        const getStatusLabel = (s: string) => {
                            if (s === 'GREEN') return 'Paid';
                            if (s === 'YELLOW') return 'Requested';
                            if (s === 'RED') return 'Partial';
                            if (s === 'BLUE') return 'New';
                            if (s === 'PURPLE') return 'Acquired';
                            return s || 'New';
                        };
                        
                        if (viewMode === 'list') {
                            return (
                                <div className="flex flex-col gap-3">
                                    {filteredItems.map((item: any) => {
                                        const norm = normalizeInventoryData(item.data);
                                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : '#38bdf8';
                                        
                                        return (
                                            <div key={item.row} className="flex items-center px-6 py-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 mr-6 shrink-0">
                                                    <img src={getCleanImageUrl(norm.generatedPngUrl || norm.mediaUrls?.split(',')[0])} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-sm font-black text-white uppercase truncate">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                                    <div className="text-[9px] text-white/20 font-black uppercase tracking-widest mt-1">{norm.color} · {norm.material}</div>
                                                </div>
                                                <div className="px-3 py-1 rounded-lg text-black text-[10px] font-black uppercase tracking-tight mx-6" style={{ backgroundColor: vendorColor }}>{calculated.bookBardcode}</div>
                                                <div className="text-right flex flex-col items-end min-w-[120px]">
                                                    <span className="text-[10px] font-mono font-black text-white/80">${Math.ceil(norm.price || 0).toLocaleString()}</span>
                                                    <span className="text-[8px] font-black uppercase tracking-widest mt-1" style={{ color: accentColor }}>{getStatusLabel(payStatus || '')}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }

                        if (viewMode === 'grid') {
                            return (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                    {filteredItems.map((item: any) => {
                                        const norm = normalizeInventoryData(item.data);
                                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : '#38bdf8';
                                        
                                        return (
                                            <div key={item.row} className="flex flex-col rounded-[32px] overflow-hidden bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group">
                                                <div className="aspect-square relative flex items-center justify-center bg-black/20 p-6">
                                                    <img src={getCleanImageUrl(norm.generatedPngUrl || norm.mediaUrls?.split(',')[0])} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700" />
                                                    <div className="absolute top-4 left-4 z-10">
                                                        <div className="px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-md bg-black/60 border border-white/10" style={{ color: accentColor }}>{getStatusLabel(payStatus || '')}</div>
                                                    </div>
                                                    <div className="absolute bottom-4 right-4 z-10">
                                                        <div className="px-2 py-0.5 rounded text-[8px] font-bold text-black" style={{ backgroundColor: vendorColor }}>{calculated.bookBardcode}</div>
                                                    </div>
                                                </div>
                                                <div className="p-5 flex flex-col gap-2">
                                                    <h3 className="text-[12px] font-black text-white uppercase truncate">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                                    <div className="flex justify-between items-center mt-2">
                                                        <span className="text-[11px] font-mono font-bold text-white/60">${Math.ceil(norm.price || 0).toLocaleString()}</span>
                                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">x{norm.quantity || 1}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }

                        if (viewMode === 'gallery') {
                            return (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 auto-rows-max">
                                    {filteredItems.map((item: any) => {
                                        const norm = normalizeInventoryData(item.data);
                                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                                        const mediaUrls = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
                                        const displayUrls = [norm.generatedPngUrl || mediaUrls[0], ...mediaUrls.slice(norm.generatedPngUrl ? 0 : 1)].filter(Boolean).slice(0, 60);
                                        const mediaCount = displayUrls.length;
                                        const isLarge = mediaCount >= 4 && mediaCount < 10;
                                        const isFull = mediaCount >= 10;
                                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : '#38bdf8';
                                        
                                        return (
                                            <div key={item.row} className={`break-inside-avoid flex flex-col rounded-[40px] overflow-hidden bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group shadow-xl ${isFull ? 'md:col-span-full' : isLarge ? 'md:col-span-2' : ''}`}>
                                                {(() => {
                                                    const total = displayUrls.length;
                                                    const gridCols = total <= 2 ? 'grid-cols-2' : total <= 6 ? 'grid-cols-3' : total <= 12 ? 'grid-cols-4 md:grid-cols-4' : 'grid-cols-4 md:grid-cols-6';
                                                    const displayCount = 24;
                                                    const visibleUrls = displayUrls.slice(0, displayCount);
                                                    const remaining = total - displayCount;

                                                    return (
                                                        <div className={`grid gap-0.5 bg-black/20 ${gridCols}`}>
                                                            {visibleUrls.map((url, i) => (
                                                                <div key={i} className={`relative overflow-hidden aspect-square cursor-pointer`}>
                                                                    <img src={getCleanImageUrl(url)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                                                                    {i === 0 && (
                                                                        <div className="absolute top-6 left-6 z-10 flex flex-col gap-3">
                                                                            <div className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 flex items-center gap-2" style={{ color: accentColor }}>
                                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />
                                                                                {getStatusLabel(payStatus || '')}
                                                                            </div>
                                                                            <div className="flex flex-col gap-2">
                                                                                <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 inline-flex" style={{ color: vendorColor, borderColor: vendorColor + '40' }}>
                                                                                    {calculated.bookBardcode}
                                                                                </div>
                                                                                <div className="flex gap-2">
                                                                                    <div className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{calculated.bookAqCode}</div>
                                                                                    <div className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{calculated.bookLandCode}</div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {isVideoFile(url) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={16} className="text-white/60" /></div>}
                                                                    {i === visibleUrls.length - 1 && remaining > 0 && (
                                                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                                                            <div className="flex flex-col items-center">
                                                                                <span className="text-xl font-black text-white">+{remaining}</span>
                                                                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1">More</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                                <div className="p-8 flex flex-col gap-1 inline-flex w-full">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-xl font-black text-white uppercase tracking-tighter leading-tight">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                                        <span className="text-lg font-mono font-black text-white/40">${Math.ceil(norm.price || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] mt-2 mb-4">{norm.color} · {norm.material}</div>
                                                    <div className="flex items-center justify-between pt-6 border-t border-white/5 mt-4">
                                                        <div className="flex items-center gap-6">
                                                           <div className="flex flex-col">
                                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Quantity</span>
                                                                <span className="text-xs font-black text-white/60">x{norm.quantity || 1}</span>
                                                           </div>
                                                           <div className="flex flex-col border-l border-white/10 pl-6">
                                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Tag ID</span>
                                                                <span className="text-xs font-black text-white/60">{norm.itemId}</span>
                                                           </div>
                                                        </div>
                                                        <Maximize2 size={16} className="text-white/10 group-hover:text-white/40 transition-all" />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }
                    })()}

                    {/* Payments Traceability List */}
                    {aggregateFinancials.uniquePayments.length > 0 && (
                        <div className="mt-20 border-t border-white/5 pt-12 space-y-6">
                            <h4 className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] px-4">Traceability Audit</h4>
                            <div className="grid gap-3">
                                {aggregateFinancials.uniquePayments.map((p, idx) => (
                                    <div key={p.id || idx} className="flex items-center justify-between p-6 px-8 rounded-3xl bg-white/[0.01] border border-white/5 hover:border-white/10 transition-all">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-bold text-white/80">{p.date ? new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pending'}</span>
                                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">{p.voucher_id || 'System Ledger'}</span>
                                        </div>
                                        <div className="flex items-center gap-12 text-right">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Status</span>
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${p.status === 'Paid' ? 'text-green-400' : 'text-yellow-400'}`}>{p.status}</span>
                                            </div>
                                            <div className="flex flex-col min-w-[120px]">
                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Total MXN</span>
                                                <span className="text-sm font-mono font-black text-white/90">${(p.amount + (p.commission || 0)).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Totals */}
                <div className="px-10 py-8 bg-white/[0.01] border-t border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-16">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">Asset Inventory Value</span>
                            <span className="text-2xl font-mono font-black text-white/90">${Math.ceil(aggregateFinancials.listValue).toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col border-l border-white/10 pl-16">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">Net Paid To Date</span>
                            <span className="text-2xl font-mono font-black text-emerald-400">${Math.ceil(aggregateFinancials.netPaid).toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col border-l border-white/10 pl-16">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">Grand Sum</span>
                            <span className="text-2xl font-mono font-black text-emerald-400/50">${Math.ceil(aggregateFinancials.total).toLocaleString()}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="h-14 px-10 rounded-2xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-[0.3em] text-white hover:bg-white/10 transition-all">Dismiss Artifact</button>
                </div>
            </div>
        </div>,
        document.body
    );
};
