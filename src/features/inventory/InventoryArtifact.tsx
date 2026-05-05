
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
import { X, Package, LayoutList, LayoutGrid, Layout, Share2, DollarSign, Tag, Info, Maximize2, Video, ExternalLink, Minimize2, Eye, TrendingUp, Shield, User } from 'lucide-react';

const VENDOR_COLORS: Record<string, string> = {
    'emmanuel': '#00AEEF', 'gerardo': '#F7941D', 'jose': '#6BCEBB', 'carlos': '#85C1E9',
    'angel': '#FFED00', 'susana': '#B19CD9', 'tellez': '#FFCB05', 'delfino': '#8DC63F',
    'maria': '#F9A17A', 'fountain': '#F36F21', 'eduardo': '#636466', 'alejandro': '#800020',
    'bernardo': '#603913', 'roberto': '#00A591', 'gift': '#D11C7E', 'cantera': '#A01E5D'
};

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
        <div className="fixed inset-0 z-100000 bg-black/95 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300" onClick={onClose}>
            <button onClick={onClose} className="absolute top-8 right-8 z-10 w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"><X size={24} /></button>
            {isVideo ? (
                <video src={getCleanImageUrl(activeSrc)} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-2xl" onClick={(e) => e.stopPropagation()} />
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
        ? "fixed top-0 right-0 h-full w-full sm:w-[500px] z-[9999] animate-in slide-in-from-right duration-700 flex flex-col bg-transparent backdrop-blur-[60px]"
        : "fixed inset-0 z-[9999] flex items-center justify-center p-0 animate-in fade-in duration-300 bg-transparent";

    const artifactContent = (
        <div className="relative w-full h-full flex flex-col overflow-hidden pointer-events-none">
            {/* FRAMELESS FREE FLOATING TOP ELEMENTS */}
            <div className={`absolute top-12 left-12 right-12 z-50 flex items-center justify-between pointer-events-auto transition-all duration-1000 ${isSidebar ? 'px-4 top-8' : ''}`}>
                <div className="flex items-center gap-6">
                    <Package size={24} className="text-white/20" />
                    <div className="flex flex-col">
                        <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight">{propTitle || "Manifest"}</h2>
                        <span className="text-[8px] font-black uppercase tracking-[0.6em] text-white/10">{allResolvedItems.length} Linked Assets</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDisplayMode('list')} className={`p-2 transition-all ${displayMode === 'list' ? 'text-white' : 'text-white/10 hover:text-white/40'}`}><LayoutList size={16} /></button>
                        <button onClick={() => setDisplayMode('grid')} className={`p-2 transition-all ${displayMode === 'grid' ? 'text-white' : 'text-white/10 hover:text-white/40'}`}><LayoutGrid size={16} /></button>
                        <button onClick={() => setDisplayMode('gallery')} className={`p-2 transition-all ${displayMode === 'gallery' ? 'text-white' : 'text-white/10 hover:text-white/40'}`}><Layout size={16} /></button>
                    </div>
                    {isSidebar ? (
                        <button onClick={() => setConfig(prev => ({ ...prev, viewMode: 'modal' }))} className="p-2 text-white/10 hover:text-white/40 transition-all"><Maximize2 size={18} /></button>
                    ) : (
                        <button onClick={() => setConfig(prev => ({ ...prev, viewMode: 'sidebar' }))} className="p-2 text-white/10 hover:text-white/40 transition-all"><Minimize2 size={18} /></button>
                    )}
                    <button onClick={onClose} className="p-2 text-white/20 hover:text-white transition-all"><X size={20} /></button>
                </div>
            </div>

            {/* MAIN CONTENT - TRUE BORDERLESS GRID */}
            <div className={`flex-1 overflow-y-auto no-scrollbar pointer-events-auto transition-all duration-700 ${isSidebar ? 'pt-32 px-8' : 'pt-40 px-12 md:px-32'}`}>
                <div className={`grid gap-10 md:gap-16 ${isSidebar ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                    {allResolvedItems.map((item: any) => {
                        const norm = normalizeInventoryData(item.data);
                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : '#38bdf8';
                        const mainImageUrl = norm.generatedPngUrl || norm.generated_png_url || norm.image_url || norm.item_image || (norm.mediaUrls && String(norm.mediaUrls).split(',')[0]);
                        const displayUrlsArr = [mainImageUrl].filter(Boolean);

                        return (
                            <div key={item.row} onClick={() => handleItemAction(item, displayUrlsArr, 0)}
                                className="group relative flex flex-col transition-all duration-1000 cursor-pointer min-h-[340px]">
                                <div className="aspect-[4/3] relative flex items-center justify-center bg-black/5 overflow-hidden rounded-[32px] transition-all duration-700 group-hover:bg-black/20">
                                    {mainImageUrl ? (
                                        <img src={getCleanImageUrl(mainImageUrl)} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-1000 opacity-60 group-hover:opacity-100" />
                                    ) : (
                                        <Package size={32} className="text-white/[0.03]" />
                                    )}
                                    <div className="absolute top-6 right-8 text-lg font-black text-white/60 group-hover:text-white transition-colors tabular-nums">${Math.ceil(norm.price || 0).toLocaleString()}</div>
                                    <div className="absolute top-6 left-8 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />
                                        <span className="text-[7px] font-black uppercase tracking-widest text-white/20 group-hover:text-white/40">{getStatusLabel(payStatus || '')}</span>
                                    </div>
                                </div>
                                <div className="p-6 flex flex-col gap-5">
                                    <div className="flex flex-col">
                                        <h3 className="text-lg md:text-xl font-black text-white/80 group-hover:text-white uppercase tracking-tighter transition-colors truncate">{(norm.shape || '') + ' ' + (norm.shortDescription || '')}</h3>
                                        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-white/10 group-hover:text-white/20 transition-colors">{norm.color} · {norm.material}</span>
                                    </div>
                                    <div className="flex items-center gap-6 opacity-40 group-hover:opacity-80 transition-opacity">
                                        <div className="flex flex-col">
                                            <span className="text-[6px] font-black text-white/40 uppercase">Qty</span>
                                            <span className="text-xs font-black text-white">x{norm.quantity || 1}</span>
                                        </div>
                                        <div className="flex flex-col border-l border-white/5 pl-6">
                                            <span className="text-[6px] font-black text-white/40 uppercase">Tag</span>
                                            <span className="text-xs font-black text-(--main-color) drop-shadow-[0_0_10px_var(--main-color)]">{calculated.bookBarcode}</span>
                                        </div>
                                        {norm.vendor && (
                                            <div className="flex flex-col border-l border-white/5 pl-6">
                                                <span className="text-[6px] font-black text-white/40 uppercase">Vendor</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: VENDOR_COLORS[String(norm.vendor).toLowerCase()] || '#fff' }} />
                                                    <span className="text-xs font-black uppercase tracking-widest" style={{ color: VENDOR_COLORS[String(norm.vendor).toLowerCase()] || '#fff' }}>{norm.vendor}</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex flex-col border-l border-white/5 pl-6">
                                            <span className="text-[6px] font-black text-white/40 uppercase">Dims</span>
                                            <span className="text-xs font-black text-white">{norm.width_cm || '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="h-64" />
            </div>

            {/* BORDERLESS FREE FLOATING BOTTOM DETAILS */}
            <div className={`absolute bottom-12 left-12 right-12 z-50 flex items-center justify-between pointer-events-auto transition-all duration-1000 ${isSidebar ? 'flex-col gap-8 items-start bottom-8 px-4' : ''}`}>
                <div className="flex items-center gap-16 md:gap-24 transition-all duration-1000">
                    <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.5em] mb-1">Session ID</span>
                        <span className="text-xl font-black text-white/20 tabular-nums">#{targetIds[0]?.slice(-4).toUpperCase() || 'NULL'}</span>
                    </div>
                </div>

                <button onClick={onClose} className="text-[10px] font-black uppercase tracking-[0.6em] text-white/10 hover:text-white transition-all">Dismiss Artifact</button>
            </div>
        </div>
    );

    return createPortal(
        <div className={containerClasses}>
            {/* ULTRA HIGH TRANSPARENCY GLASSMORPHIC BACKDROP */}
            {!isSidebar && <div className="absolute inset-0 bg-black/[0.01] backdrop-blur-[120px]" onClick={onClose} />}
            {showViewer && <FullscreenImageViewer src={viewerUrls[viewerIdx]} mediaUrls={viewerUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
            {artifactContent}
        </div>, document.body
    );
};
