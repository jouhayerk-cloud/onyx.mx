
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
import { X, Package, LayoutList, LayoutGrid, Layout, Share2, DollarSign, Tag, Info, Maximize2, Video, ExternalLink, Minimize2, Eye } from 'lucide-react';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { 
    ChevronLeft, ChevronRight 
} from 'lucide-react';

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

// ── Fullscreen Image Viewer (Universal Swipe Support) ───────────────────
const FullscreenImageViewer = ({ src, mediaUrls = [], initialIdx = 0, onClose }: { src: string; mediaUrls?: string[]; initialIdx?: number; onClose: () => void }) => {
    const [currentIdx, setCurrentIdx] = useState(initialIdx);
    const activeSrc = mediaUrls.length > 0 ? mediaUrls[currentIdx] : src;
    const isVideo = isVideoFile(activeSrc);
    
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const minSwipeDistance = 50;

    const nav = (dir: number) => {
        if (mediaUrls.length === 0) return; 
        setCurrentIdx(p => (p + dir + mediaUrls.length) % mediaUrls.length);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        if (distance > minSwipeDistance) nav(1);
        if (distance < -minSwipeDistance) nav(-1);
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-100000 bg-black/98 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300" 
            onClick={onClose}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <button onClick={onClose} className="absolute top-8 right-8 z-10 w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all">
                <X size={24} />
            </button>
            {mediaUrls.length > 1 && (
                <div className="absolute inset-0 flex items-center justify-between px-8 pointer-events-none">
                    <button onClick={(e) => { e.stopPropagation(); nav(-1); }} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 hidden sm:flex items-center justify-center text-white/30 hover:text-white transition-all pointer-events-auto"><ChevronLeft size={32} /></button>
                    <button onClick={(e) => { e.stopPropagation(); nav(1); }} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 hidden sm:flex items-center justify-center text-white/30 hover:text-white transition-all pointer-events-auto"><ChevronRight size={32} /></button>
                </div>
            )}
            {isVideo ? (
                <video src={getCleanImageUrl(activeSrc)} controls autoPlay className="max-w-[90vw] max-h-[90vh] shadow-2xl rounded-2xl" onClick={(e) => e.stopPropagation()} />
            ) : (
                <img key={currentIdx} src={getCleanImageUrl(activeSrc)} alt="" draggable={false}
                    className="max-w-[90vw] max-h-[90vh] object-contain select-none animate-in fade-in zoom-in-95 duration-300"
                    onClick={(e) => e.stopPropagation()}
                />
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
    const showFinancials = useAtomValue(showFinancialsAtom);
    const [displayMode, setDisplayMode] = useState<'list' | 'grid' | 'gallery'>(config.displayMode || initialView || 'gallery');

    // Sync displayMode if config changes
    useEffect(() => {
        if (config.displayMode) setDisplayMode(config.displayMode);
    }, [config.displayMode]);
    const [showViewer, setShowViewer] = useState(false);
    const [viewerIdx, setViewerIdx] = useState(0);
    const [viewerUrls, setViewerUrls] = useState<string[]>([]);

    const handleItemAction = (item: any, urls: string[], idx: number) => {
        if (onItemClick) {
            onItemClick(item);
        } else if (urls.length > 0) {
            setViewerUrls(urls);
            setViewerIdx(idx);
            setShowViewer(true);
        }
    };

    // Standardize IDs
    const targetIds = useMemo(() => ids.map(id => String(id)), [ids]);

    // Filter and combine data
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
                return String(i.row) === id || 
                       String(norm.id) === id || 
                       String(norm.item_id).toUpperCase() === id.toUpperCase() || 
                       String(norm.book_barcode).toUpperCase() === id.toUpperCase();
            });
            if (!baseItem) return null;
            return {
                ...baseItem,
                logistics: logMap.get(id) || []
            };
        }).filter(Boolean);
    }, [targetIds, items, logisticsDocs]);

    // Financial Mapping
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

    // Dynamic Hydration
    const [fetchedItems, setFetchedItems] = useState<any[]>([]);
    const [isHydrating, setIsHydrating] = useState(false);

    useEffect(() => {
        if (!config.isOpen || isHydrating) return;
        const resolvedIds = new Set([
            ...filteredItems.map(fi => String(fi.row)),
            ...filteredItems.map(fi => String(fi.data?.id)),
            ...filteredItems.map(fi => String(fi.data?.item_id).toUpperCase()),
            ...filteredItems.map(fi => String(fi.data?.book_barcode).toUpperCase()),
            ...fetchedItems.map(fi => String(fi.row)),
            ...fetchedItems.map(fi => String(fi.data?.id)),
            ...fetchedItems.map(fi => String(fi.data?.item_id).toUpperCase()),
            ...fetchedItems.map(fi => String(fi.data?.book_barcode).toUpperCase())
        ]);
        const missingIds = targetIds.filter(id => !resolvedIds.has(String(id).toUpperCase()) && !resolvedIds.has(String(id)));
        if (missingIds.length > 0) {
            setIsHydrating(true);
            import('../../lib/supabase').then(async ({ supabase }) => {
                try {
                    const cleanIds = missingIds.map(id => String(id).replace(/"/g, ''));
                    const idList = `(${cleanIds.map(id => `"${id}"`).join(',')})`;
                    const filter = `id.in.${idList},item_id.in.${idList},book_barcode.in.${idList}`;
                    const { data } = await supabase.from('inventory').select('*').or(filter);
                    if (data && data.length > 0) {
                        setFetchedItems(prev => [...prev, ...data.map(d => ({ row: d.id, data: d }))]);
                    }
                } catch (e) {} finally { setIsHydrating(false); }
            });
        }
    }, [config.isOpen, targetIds, filteredItems, fetchedItems, isHydrating]);

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

    if (!config.isOpen) return null;
    
    // Loading State
    if (targetIds.length > 0 && allResolvedItems.length === 0) {
        return (
            <div className={`fixed z-[9999] bg-black/60 backdrop-blur-3xl flex items-center justify-center transition-all duration-700 ${isSidebar ? 'top-0 right-0 h-full w-full sm:w-[560px] border-l border-white/5' : 'inset-0'}`}>
                <div className="flex flex-col items-center gap-4 animate-pulse">
                    <div className="w-12 h-12 rounded-full border-t-2 border-(--main-color) animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Syncing Manifest...</span>
                </div>
            </div>
        );
    }

    if (allResolvedItems.length === 0) return null;
    const isEmbeddedArtifact = viewMode === 'embedded';

    const getStatusLabel = (s: string) => {
        if (s === 'GREEN') return 'Paid';
        if (s === 'YELLOW') return 'Requested';
        if (s === 'RED') return 'Partial';
        if (s === 'BLUE') return 'New';
        if (s === 'PURPLE') return 'Acquired';
        return s || 'New';
    };

    const containerClasses = isEmbeddedArtifact
        ? "relative w-full h-full flex flex-col overflow-hidden"
        : isSidebar 
            ? "fixed top-0 right-0 h-full w-full sm:w-[560px] z-[9999] animate-in slide-in-from-right duration-700 flex flex-col bg-black/40 backdrop-blur-[50px] border-l border-white/10 shadow-[-50px_0_100px_rgba(0,0,0,0.5)]"
            : "fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300";

    const artifactContent = (
        <div className={`relative w-full h-full ${(!isSidebar && !isEmbeddedArtifact) ? 'max-w-[1400px] h-[92vh] rounded-[48px] bg-black/40 border border-white/5 shadow-[0_80px_250px_rgba(0,0,0,0.9)] backdrop-blur-[120px]' : 'bg-transparent'} flex flex-col overflow-hidden transition-all duration-500`}>
            
            {/* Modern STUDIO Header */}
            <div className={`px-10 py-12 flex items-center justify-between shrink-0 ${(isSidebar || isEmbeddedArtifact) ? 'px-8 bg-transparent' : 'bg-transparent border-b border-white/5'}`}>
                <div className="flex items-center gap-8">
                    <div className="w-16 h-16 rounded-[2.5rem] bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                        <Package size={28} className="text-white/20" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h2 className="text-3xl font-black text-white uppercase tracking-tight leading-none">{propTitle || "Artifact Manifest"}</h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20 mt-1">{allResolvedItems.length} Items Indexed</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Compact View Toggles */}
                    <div className="flex items-center gap-1 bg-white/5 rounded-2xl p-1.5 border border-white/5">
                        <button onClick={() => setDisplayMode('list')} className={`p-2.5 rounded-xl transition-all ${displayMode === 'list' ? 'bg-white/10 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}><LayoutList size={18} /></button>
                        <button onClick={() => setDisplayMode('grid')} className={`p-2.5 rounded-xl transition-all ${displayMode === 'grid' ? 'bg-white/10 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}><LayoutGrid size={18} /></button>
                        <button onClick={() => setDisplayMode('gallery')} className={`p-2.5 rounded-xl transition-all ${displayMode === 'gallery' ? 'bg-white/10 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}><Layout size={18} /></button>
                    </div>
                    
                    {!isSidebar && !isEmbeddedArtifact && (
                        <button onClick={() => setConfig(prev => ({ ...prev, viewMode: 'sidebar' }))} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white border border-white/5 transition-all"><Minimize2 size={18} /></button>
                    )}
                    
                    <button onClick={onClose} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/20 hover:text-white border border-white/5 hover:bg-white/10 transition-all">&times;</button>
                </div>
            </div>

            {/* Content Area - STUDIO STYLE DATA DENSE */}
            <div className={`flex-1 overflow-y-auto custom-scrollbar px-10 py-6`}>
                <div className={`grid gap-8 ${
                    displayMode === 'list' ? 'grid-cols-1' : 
                    displayMode === 'grid' ? 'grid-cols-2 lg:grid-cols-4' : 
                    'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                }`}>
                    {allResolvedItems.map((item: any) => {
                        const norm = normalizeInventoryData(item.data);
                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : '#38bdf8';
                        
                        const mediaUrlsArr = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
                        const displayUrlsArr = [mediaUrlsArr[0] || norm.generatedPngUrl, ...mediaUrlsArr.slice(1)].filter(Boolean).slice(0, 4);

                        return (
                            <div key={item.row} onClick={() => handleItemAction(item, displayUrlsArr, 0)}
                                className="group relative flex flex-col rounded-[40px] overflow-hidden bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-700 cursor-pointer shadow-2xl">
                                
                                {/* Image Section */}
                                <div className="aspect-[4/3] relative flex items-center justify-center bg-black/40 overflow-hidden">
                                    <img src={getCleanImageUrl(displayUrlsArr[0])} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 opacity-60 group-hover:opacity-100" />
                                    
                                    {/* Floating Price */}
                                    <div className="absolute top-6 right-8">
                                        <span className="text-xl font-black text-white/90 drop-shadow-lg">${Math.ceil(norm.price || 0).toLocaleString()}</span>
                                    </div>

                                    {/* Status Indicator */}
                                    <div className="absolute top-6 left-8">
                                        <div className="px-3 py-1.5 rounded-full backdrop-blur-xl bg-black/40 border border-white/10 flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ backgroundColor: accentColor, boxShadow: `0 0 12px ${accentColor}` }} />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/60">{getStatusLabel(payStatus || '')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Data Dense Card Info */}
                                <div className="p-8 flex flex-col gap-6">
                                    <div className="flex flex-col gap-1.5">
                                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-tight truncate">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">{norm.color} · {norm.material}</p>
                                    </div>

                                    <div className="h-px w-full bg-white/5" />

                                    {/* Specs Grid */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[8px] font-black text-white/10 uppercase tracking-widest">Qty</span>
                                            <span className="text-[14px] font-black text-white/60 tabular-nums">x{norm.quantity || 1}</span>
                                        </div>
                                        <div className="flex flex-col gap-1.5 border-l border-white/5 pl-4">
                                            <span className="text-[8px] font-black text-white/10 uppercase tracking-widest">Tag</span>
                                            <span className="text-[14px] font-black text-white/60">{calculated.bookBarcode}</span>
                                        </div>
                                        <div className="flex flex-col gap-1.5 border-l border-white/5 pl-4">
                                            <span className="text-[8px] font-black text-white/10 uppercase tracking-widest">Dims</span>
                                            <span className="text-[14px] font-black text-white/60">{[norm.length_cm, norm.width_cm].filter(Boolean).join('×') || '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* STUDIO FOOTER TOTALS */}
            <div className={`px-12 py-12 bg-black/40 backdrop-blur-3xl flex items-center justify-between shrink-0 border-t border-white/5`}>
                <div className="flex items-center gap-24">
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black text-white/10 uppercase tracking-[0.4em]">Asset Inventory Value</span>
                        <span className="text-4xl font-black text-white/90 tabular-nums">${Math.ceil(aggregateFinancials.listValue).toLocaleString()}</span>
                    </div>
                    <div className="h-16 w-px bg-white/5" />
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black text-white/10 uppercase tracking-[0.4em]">Net Paid To Date</span>
                        <span className="text-4xl font-black text-emerald-400 tabular-nums">${Math.ceil(aggregateFinancials.netPaid).toLocaleString()}</span>
                    </div>
                    <div className="h-16 w-px bg-white/5" />
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black text-white/10 uppercase tracking-[0.4em]">Grand Sum</span>
                        <span className="text-4xl font-black text-emerald-400/40 tabular-nums">${Math.ceil(aggregateFinancials.total).toLocaleString()}</span>
                    </div>
                </div>

                <button 
                    onClick={onClose}
                    className="h-16 px-12 rounded-full border border-white/10 bg-white/5 text-[11px] font-black uppercase tracking-[0.3em] text-white hover:bg-white/10 hover:border-white/20 transition-all shadow-2xl"
                >
                    Dismiss Artifact
                </button>
            </div>
        </div>
    );

    if (isEmbeddedArtifact) return <div className={containerClasses}>{artifactContent}</div>;

    return createPortal(
        <div className={containerClasses}>
            {!isSidebar && <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={onClose} />}
            
            {showViewer && (
                <FullscreenImageViewer 
                    src={viewerUrls[viewerIdx]} 
                    mediaUrls={viewerUrls} 
                    initialIdx={viewerIdx} 
                    onClose={() => setShowViewer(false)} 
                />
            )}

            {artifactContent}
        </div>, document.body
    );
};
