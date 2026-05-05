
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
import { X, Package, LayoutList, LayoutGrid, Layout, Share2, DollarSign, Tag, Info, Maximize2, Video, ExternalLink, Minimize2, Eye, TrendingUp, Shield } from 'lucide-react';

interface InventoryArtifactProps {
    ids: (string | number)[];
    onClose: () => void;
    initialView?: 'list' | 'grid' | 'gallery';
    viewMode?: 'modal' | 'sidebar' | 'embedded';
    title?: string;
    onItemClick?: (item: any) => void;
}

import { inventoryArtifactConfigAtom } from '../../lib/atoms';

export const InventoryArtifact = () => {
    const [config, setConfig] = useAtom(inventoryArtifactConfigAtom);
    if (!config.isOpen) return null;
    return (
        <InventoryArtifactInner 
            ids={config.itemIds} 
            onClose={() => setConfig({ ...config, isOpen: false })} 
            viewMode={config.viewMode}
            title={config.title}
        />
    );
};

// ── Fullscreen Image Viewer ─────────────────────────────────────────────
const FullscreenImageViewer = ({ src, mediaUrls = [], initialIdx = 0, onClose }: { src: string; mediaUrls?: string[]; initialIdx?: number; onClose: () => void }) => {
    const [currentIdx, setCurrentIdx] = useState(initialIdx);
    const activeSrc = mediaUrls.length > 0 ? mediaUrls[currentIdx] : src;
    const isVideo = isVideoFile(activeSrc);
    return createPortal(
        <div className="fixed inset-0 z-100000 bg-black/98 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300" onClick={onClose}>
            <button onClick={onClose} className="absolute top-8 right-8 z-10 w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"><X size={24} /></button>
            {isVideo ? (
                <video src={getCleanImageUrl(activeSrc)} controls autoPlay className="max-w-[90vw] max-h-[90vh] shadow-2xl rounded-2xl" onClick={(e) => e.stopPropagation()} />
            ) : (
                <img key={currentIdx} src={getCleanImageUrl(activeSrc)} alt="" className="max-w-[90vw] max-h-[90vh] object-contain animate-in fade-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()} />
            )}
        </div>, document.body
    );
};

export const InventoryArtifactInner: React.FC<InventoryArtifactProps> = ({ ids, onClose, initialView, viewMode: propViewMode, title: propTitle, onItemClick }) => {
    const [config, setConfig] = useAtom(inventoryArtifactConfigAtom);
    const viewMode = propViewMode || config.viewMode || 'modal';
    const isSidebar = viewMode === 'sidebar';
    
    const items = useAtomValue(inventoryAtom);
    const financeDocs = useAtomValue(financeDataAtom);
    const logisticsDocs = useAtomValue(logisticsDataAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const [displayMode, setDisplayMode] = useState<'list' | 'grid' | 'gallery'>(config.displayMode || initialView || 'gallery');

    const [showViewer, setShowViewer] = useState(false);
    const [viewerIdx, setViewerIdx] = useState(0);
    const [viewerUrls, setViewerUrls] = useState<string[]>([]);

    const handleItemAction = (item: any, urls: string[], idx: number) => {
        if (onItemClick) onItemClick(item);
        else if (urls.length > 0) { setViewerUrls(urls); setViewerIdx(idx); setShowViewer(true); }
    };

    const targetIds = useMemo(() => ids.map(id => String(id)), [ids]);

    const filteredItems = useMemo(() => {
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
            const baseItem = items.find(i => {
                const norm = i.data || i;
                return String(i.row) === id || String(norm.id) === id || String(norm.item_id).toUpperCase() === id.toUpperCase() || String(norm.book_barcode).toUpperCase() === id.toUpperCase();
            });
            if (!baseItem) return null;
            return { ...baseItem, logistics: logMap.get(id) || [] };
        }).filter(Boolean);
    }, [targetIds, items, logisticsDocs]);

    const { partialPayIds, fullPayIds } = useMemo(() => {
        const pIds = new Set<string>();
        const fIds = new Set<string>();
        financeDocs.forEach(d => {
            const rel = d.related_ids || d.related_inventory_ids || '';
            const relArray = typeof rel === 'string' ? rel.split(',').map(s => s.trim()) : Array.isArray(rel) ? rel.map(id => String(id)) : [];
            if (String(d.status).toLowerCase().includes('partial')) relArray.forEach(id => pIds.add(id));
            else if (d.status === 'Paid') relArray.forEach(id => fIds.add(id));
        });
        return { partialPayIds: pIds, fullPayIds: fIds };
    }, [financeDocs]);

    const aggregateFinancials = useMemo(() => {
        let listValue = 0, netPaid = 0, taxes = 0;
        filteredItems.forEach((item: any) => {
            const norm = normalizeInventoryData(item.data);
            listValue += Number(norm.price || 0) * Number(norm.quantity || 1);
        });
        const relatedPayments = financeDocs.filter(d => {
            const rel = d.related_ids || d.related_inventory_ids || '';
            const relArray = typeof rel === 'string' ? rel.split(',').map(s => s.trim()) : Array.isArray(rel) ? rel.map(id => String(id)) : [];
            return relArray.some(rid => targetIds.includes(rid));
        });
        relatedPayments.forEach(p => { netPaid += (p.amount || 0); taxes += (p.commission || 0); });
        return { listValue, netPaid, taxes, total: netPaid + taxes };
    }, [filteredItems, financeDocs, targetIds]);

    const [fetchedItems, setFetchedItems] = useState<any[]>([]);
    useEffect(() => {
        const resolvedIds = new Set([...filteredItems.map(fi => String(fi.row)), ...filteredItems.map(fi => String(fi.data?.id)), ...fetchedItems.map(fi => String(fi.row))]);
        const missingIds = targetIds.filter(id => !resolvedIds.has(id));
        if (missingIds.length > 0) {
            import('../../lib/supabase').then(async ({ supabase }) => {
                const { data } = await supabase.from('inventory').select('*').or(`id.in.(${missingIds.join(',')}),item_id.in.(${missingIds.join(',')}),book_barcode.in.(${missingIds.join(',')})`);
                if (data) setFetchedItems(prev => [...prev, ...data.map(d => ({ row: d.id, data: d }))]);
            });
        }
    }, [targetIds, filteredItems, fetchedItems]);

    const allResolvedItems = useMemo(() => {
        const combined = [...filteredItems, ...fetchedItems];
        const seen = new Set();
        return combined.filter(item => {
            const id = String(item.row || item.data?.id);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [filteredItems, fetchedItems]);

    if (!config.isOpen || allResolvedItems.length === 0) return null;

    const getStatusLabel = (s: string) => s === 'GREEN' ? 'Paid' : s === 'YELLOW' ? 'Requested' : s === 'RED' ? 'Partial' : s === 'BLUE' ? 'New' : 'New';

    const containerClasses = viewMode === 'sidebar' 
        ? "fixed top-0 right-0 h-full w-full sm:w-[500px] z-[9999] animate-in slide-in-from-right duration-700 flex flex-col bg-transparent backdrop-blur-[80px]"
        : "fixed inset-0 z-[9999] flex items-center justify-center p-0 animate-in fade-in duration-300 bg-transparent";

    const artifactContent = (
        <div className="relative w-full h-full flex flex-col overflow-hidden pointer-events-none">
            {/* FREE FLOATING TOP TITLE & ELEMENTS */}
            <div className={`absolute top-12 left-12 right-12 z-50 flex items-center justify-between pointer-events-auto transition-all duration-700 ${isSidebar ? 'px-4 top-8' : ''}`}>
                <div className="flex items-center gap-6">
                    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/5 backdrop-blur-xl flex items-center justify-center">
                        <Package size={18} className="text-white/20" />
                    </div>
                    <div className="flex flex-col">
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">{propTitle || "Manifest"}</h2>
                        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-white/20">{allResolvedItems.length} Assets Linked</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-white/5 backdrop-blur-xl rounded-full p-1 border border-white/5">
                        <button onClick={() => setDisplayMode('list')} className={`p-2 rounded-full transition-all ${displayMode === 'list' ? 'bg-white/10 text-white' : 'text-white/20'}`}><LayoutList size={14} /></button>
                        <button onClick={() => setDisplayMode('grid')} className={`p-2 rounded-full transition-all ${displayMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/20'}`}><LayoutGrid size={14} /></button>
                        <button onClick={() => setDisplayMode('gallery')} className={`p-2 rounded-full transition-all ${displayMode === 'gallery' ? 'bg-white/10 text-white' : 'text-white/20'}`}><Layout size={14} /></button>
                    </div>
                    {isSidebar ? (
                        <button onClick={() => setConfig(prev => ({ ...prev, viewMode: 'modal' }))} className="w-10 h-10 rounded-full bg-white/5 border border-white/5 backdrop-blur-xl flex items-center justify-center text-white/40"><Maximize2 size={16} /></button>
                    ) : (
                        <button onClick={() => setConfig(prev => ({ ...prev, viewMode: 'sidebar' }))} className="w-10 h-10 rounded-full bg-white/5 border border-white/5 backdrop-blur-xl flex items-center justify-center text-white/40"><Minimize2 size={16} /></button>
                    )}
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 border border-white/5 backdrop-blur-xl flex items-center justify-center text-white/40 hover:text-white transition-all"><X size={18} /></button>
                </div>
            </div>

            {/* MAIN CONTENT - BORDERLESS GRID */}
            <div className={`flex-1 overflow-y-auto no-scrollbar pointer-events-auto transition-all duration-700 ${isSidebar ? 'pt-32 px-8' : 'pt-40 px-12 md:px-24'}`}>
                <div className={`grid gap-6 md:gap-10 ${isSidebar ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                    {allResolvedItems.map((item: any) => {
                        const norm = normalizeInventoryData(item.data);
                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : '#38bdf8';
                        const mainImageUrl = norm.generatedPngUrl || norm.generated_png_url || norm.image_url || norm.item_image || (norm.mediaUrls && String(norm.mediaUrls).split(',')[0]);
                        const displayUrlsArr = [mainImageUrl].filter(Boolean);

                        return (
                            <div key={item.row} onClick={() => handleItemAction(item, displayUrlsArr, 0)}
                                className="group relative flex flex-col rounded-[32px] overflow-hidden bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-700 cursor-pointer min-h-[360px]">
                                <div className="aspect-[4/3] relative flex items-center justify-center bg-black/40 overflow-hidden">
                                    {mainImageUrl ? (
                                        <img src={getCleanImageUrl(mainImageUrl)} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-1000 opacity-80 group-hover:opacity-100" />
                                    ) : (
                                        <Package size={40} className="text-white/5" />
                                    )}
                                    <div className="absolute top-5 right-6 text-lg font-black text-white/80">${Math.ceil(norm.price || 0).toLocaleString()}</div>
                                    <div className="absolute top-5 left-6 px-2 py-1 rounded-full backdrop-blur-xl bg-black/40 border border-white/5 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-white/40">{getStatusLabel(payStatus || '')}</span>
                                    </div>
                                </div>
                                <div className="p-6 flex flex-col gap-4">
                                    <div className="flex flex-col">
                                        <h3 className="text-lg font-black text-white uppercase tracking-tighter truncate">{(norm.shape || '') + ' ' + (norm.shortDescription || '')}</h3>
                                        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/10">{norm.color} · {norm.material}</span>
                                    </div>
                                    <div className="flex items-center gap-4 pt-4 border-t border-white/5">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[7px] font-black text-white/10 uppercase">Qty</span>
                                            <span className="text-xs font-black text-white/60">x{norm.quantity || 1}</span>
                                        </div>
                                        <div className="flex flex-col gap-0.5 border-l border-white/5 pl-4">
                                            <span className="text-[7px] font-black text-white/10 uppercase">Tag</span>
                                            <span className="text-xs font-black text-white/60">{calculated.bookBarcode}</span>
                                        </div>
                                        <div className="flex flex-col gap-0.5 border-l border-white/5 pl-4">
                                            <span className="text-[7px] font-black text-white/10 uppercase">Dims</span>
                                            <span className="text-xs font-black text-white/60">{norm.width_cm || '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="h-64" /> {/* Spacer for footer */}
            </div>

            {/* SMALL BOTTOM DETAILS PANEL - FREE FLOATING */}
            <div className={`absolute bottom-12 left-12 right-12 z-50 flex items-center justify-between pointer-events-auto transition-all duration-700 ${isSidebar ? 'flex-col gap-6 items-start bottom-8' : ''}`}>
                <div className={`flex items-center gap-12 bg-white/[0.02] backdrop-blur-3xl border border-white/5 p-6 rounded-[2rem] shadow-2xl ${isSidebar ? 'w-full grid grid-cols-2 gap-4 p-4' : ''}`}>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <TrendingUp size={10} className="text-white/20" />
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Inventory Value</span>
                        </div>
                        <span className="text-xl font-black text-white/90 tabular-nums">${Math.ceil(aggregateFinancials.listValue).toLocaleString()}</span>
                    </div>
                    <div className={`flex flex-col gap-1 ${isSidebar ? '' : 'border-l border-white/5 pl-12'}`}>
                        <div className="flex items-center gap-2">
                            <Shield size={10} className="text-emerald-500/40" />
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Paid To Date</span>
                        </div>
                        <span className="text-xl font-black text-emerald-400 tabular-nums">${Math.ceil(aggregateFinancials.netPaid).toLocaleString()}</span>
                    </div>
                    {!isSidebar && (
                        <div className="flex flex-col gap-1 border-l border-white/5 pl-12">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Grand Sum</span>
                            <span className="text-xl font-black text-emerald-400/40 tabular-nums">${Math.ceil(aggregateFinancials.total).toLocaleString()}</span>
                        </div>
                    )}
                </div>

                <button onClick={onClose} className="h-14 px-10 rounded-full border border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-[0.4em] text-white/40 hover:text-white hover:bg-white/10 transition-all backdrop-blur-xl">Dismiss Artifact</button>
            </div>
        </div>
    );

    return createPortal(
        <div className={containerClasses}>
            {/* TRUE TRANSPARENT GLASSMORPHIC BACKGROUND */}
            {!isSidebar && <div className="absolute inset-0 bg-transparent backdrop-blur-[100px]" onClick={onClose} />}
            {showViewer && <FullscreenImageViewer src={viewerUrls[viewerIdx]} mediaUrls={viewerUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
            {artifactContent}
        </div>, document.body
    );
};
