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
    const currencyMode = 'MXN'; // Default to MXN for artifacts

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
            const baseItem = items.find(i => {
                const norm = i.data || i; // Handle both wrapper and raw objects
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

    // Dynamic Hydration: Fetch missing items if not in atom
    const [fetchedItems, setFetchedItems] = useState<any[]>([]);
    const [isHydrating, setIsHydrating] = useState(false);

    useEffect(() => {
        if (config.isOpen && filteredItems.length < targetIds.length && !isHydrating) {
            const missingIds = targetIds.filter(id => !filteredItems.some(fi => 
                String(fi.row) === id || 
                String(fi.data?.id) === id || 
                String(fi.data?.item_id).toUpperCase() === id.toUpperCase() || 
                String(fi.data?.book_barcode).toUpperCase() === id.toUpperCase()
            ));

            if (missingIds.length > 0) {
                setIsHydrating(true);
                import('../../lib/supabase').then(async ({ supabase }) => {
                    const { data, error } = await supabase
                        .from('inventory')
                        .select('*')
                        .or(`item_id.in.(${missingIds.map(id => `"${id}"`).join(',')}),book_barcode.in.(${missingIds.map(id => `"${id}"`).join(',')})`);
                    
                    if (data) {
                        setFetchedItems(prev => [...prev, ...data.map(d => ({ row: d.id, data: d }))]);
                    }
                    setIsHydrating(false);
                });
            }
        }
    }, [config.isOpen, targetIds, filteredItems, isHydrating]);

    const allResolvedItems = useMemo(() => {
        const combined = [...filteredItems, ...fetchedItems];
        // Deduplicate
        const seen = new Set();
        return combined.filter(item => {
            const id = String(item.row || item.data?.id);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [filteredItems, fetchedItems]);

    if (!config.isOpen) return null;
    if (allResolvedItems.length === 0 && isHydrating) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-xl">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-t-2 border-emerald-500 animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Manifesting Data...</span>
                </div>
            </div>
        );
    }
    if (allResolvedItems.length === 0) return null;

    const isEmbeddedArtifact = viewMode === 'embedded';
    
    const containerClasses = isEmbeddedArtifact
        ? "relative w-full h-full flex flex-col overflow-hidden"
        : isSidebar 
            ? "fixed top-0 right-0 h-full w-full sm:w-[560px] z-[9999] animate-in slide-in-from-right duration-700 flex flex-col"
            : "fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-10 animate-in fade-in duration-300";

    const artifactContent = (
        <div className={`relative w-full h-full ${(!isSidebar && !isEmbeddedArtifact) ? 'max-w-7xl h-[90vh] rounded-[40px] bg-[#0a0a0a]/80 border border-white/10 shadow-[0_50px_200px_rgba(0,0,0,0.8)] backdrop-blur-[100px]' : 'bg-transparent backdrop-blur-[80px]'} flex flex-col overflow-hidden transition-all duration-500`}>
            {(!isSidebar && !isEmbeddedArtifact) && (
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-(--main-color)/5 via-transparent to-transparent" />
            )}
            {(isSidebar || isEmbeddedArtifact) && (
                <>
                    <div className={`absolute inset-0 pointer-events-none bg-gradient-to-l ${isEmbeddedArtifact ? 'from-orange-500/[0.05]' : 'from-emerald-500/[0.05]'} to-transparent`} />
                    {/* Floating Close Button - Only for sidebar - SUPER LARGE */}
                    {isSidebar && (
                        <button 
                            onClick={onClose}
                            className="absolute top-10 -left-12 w-24 h-24 rounded-full bg-black/60 backdrop-blur-3xl border border-white/10 flex flex-col items-center justify-center text-white/40 hover:text-white hover:border-emerald-500/40 hover:text-emerald-400 transition-all shadow-[0_0_80px_rgba(0,0,0,0.8)] active:scale-95 group z-[1000]"
                        >
                            <X size={48} strokeWidth={1} className="group-hover:rotate-90 transition-transform duration-500" />
                            <span className="text-[7px] font-black uppercase tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Close</span>
                        </button>
                    )}
                </>
            )}
            
            {/* Modern Header */}
            <div className={`px-8 py-10 flex items-center justify-between shrink-0 ${(isSidebar || isEmbeddedArtifact) ? 'px-10 bg-transparent' : 'bg-white/2 border-b border-white/5'}`}>
                <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/10 ${(isSidebar || isEmbeddedArtifact) ? `${isEmbeddedArtifact ? 'bg-orange-500/10 border-orange-500/20 shadow-[0_0_30px_rgba(249,115,22,0.15)]' : 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.15)]'}` : ''}`}>
                        <Package size={(isSidebar || isEmbeddedArtifact) ? 28 : 24} className={(isSidebar || isEmbeddedArtifact) ? (isEmbeddedArtifact ? "text-orange-400" : "text-emerald-400") : "text-white/40"} />
                    </div>
                    <div className="flex flex-col">
                        <h2 className={`${(isSidebar || isEmbeddedArtifact) ? 'text-2xl tracking-tight' : 'text-xl'} font-black text-white uppercase leading-none`}>{propTitle || "Inventory Artifact"}</h2>
                        <p className={`font-black uppercase tracking-[0.4em] mt-2 ${(isSidebar || isEmbeddedArtifact) ? `text-[10px] ${isEmbeddedArtifact ? 'text-orange-500/60' : 'text-emerald-500/60'}` : 'text-[9px] text-white/20'}`}>{allResolvedItems.length} Items Indexed</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                    {/* Detach / Attach Toggle */}
                    {!isEmbeddedArtifact && (
                        <button 
                            onClick={() => setConfig(prev => ({ ...prev, viewMode: isSidebar ? 'modal' : 'sidebar' }))}
                            className={`p-3 rounded-2xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/5 ${isSidebar ? 'bg-black/20 backdrop-blur-xl' : ''}`}
                            title={isSidebar ? "Expand to Modal" : "Dock as Sidebar"}
                        >
                            {isSidebar ? <ExternalLink size={20} /> : <Minimize2 size={16} />}
                        </button>
                    )}

                    {isSidebar && (
                        <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5 active:scale-90 ml-2">
                            <X size={24} strokeWidth={1.5} />
                        </button>
                    )}
                    {(!isSidebar && !isEmbeddedArtifact) && (
                        <>
                            <div className="w-px h-6 bg-white/5 mx-1 hidden sm:block" />
                            <div className="flex items-center gap-1 bg-black/40 rounded-xl p-1 border border-white/5 scale-90 sm:scale-100">
                                <button onClick={() => setDisplayMode('list')} className={`p-2 rounded-lg transition-all ${displayMode === 'list' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white/40'}`}><LayoutList size={16} /></button>
                                <button onClick={() => setDisplayMode('grid')} className={`p-2 rounded-lg transition-all ${displayMode === 'grid' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white/40'}`}><LayoutGrid size={16} /></button>
                                <button onClick={() => setDisplayMode('gallery')} className={`p-2 rounded-lg transition-all ${displayMode === 'gallery' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white/40'}`}><Layout size={16} /></button>
                            </div>
                            <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5">&times;</button>
                        </>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className={`flex-1 overflow-y-auto custom-scrollbar ${(isSidebar || isEmbeddedArtifact) ? 'px-10 py-4' : 'px-8 py-8'}`}>
                    
                    {(() => {
                        const getStatusLabel = (s: string) => {
                            if (s === 'GREEN') return 'Paid';
                            if (s === 'YELLOW') return 'Requested';
                            if (s === 'RED') return 'Partial';
                            if (s === 'BLUE') return 'New';
                            if (s === 'PURPLE') return 'Acquired';
                            return s || 'New';
                        };
                        
                        if (displayMode === 'list') {
                            return (
                                <div className={`flex flex-col ${isSidebar ? 'gap-6 p-4' : 'gap-3'}`}>
                                    {filteredItems.map((item: any) => {
                                        const norm = normalizeInventoryData(item.data);
                                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : '#38bdf8';
                                        
                                        const mediaUrlsArr = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
                                        const displayUrlsArr = [mediaUrlsArr[0] || norm.generatedPngUrl, ...mediaUrlsArr.slice(1)].filter(Boolean).slice(0, 60);

                                        return (
                                            <div key={item.row} onClick={() => handleItemAction(item, displayUrlsArr, 0)}
                                                className={`flex items-center group transition-all cursor-pointer ${isSidebar ? 'py-3 hover:translate-x-2' : 'px-6 py-4 rounded-3xl bg-white/2 border border-white/5 hover:border-white/10 hover:scale-[1.01]'}`}>
                                                <div className={`relative shrink-0 overflow-hidden ${isSidebar ? 'w-14 h-14 rounded-2xl bg-black/40 mr-5' : 'w-12 h-12 rounded-xl bg-black/40 mr-6'}`}>
                                                    <img src={getCleanImageUrl(mediaUrlsArr[0] || norm.generatedPngUrl)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                                    {isSidebar && <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={`font-black text-white uppercase truncate ${isSidebar ? 'text-[13px] tracking-tight' : 'text-sm'}`}>{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                                    <div className={`text-[9px] font-black uppercase tracking-[0.2em] mt-1 ${isSidebar ? 'text-emerald-400' : 'text-white/20'}`}>{norm.color} · {norm.material}</div>
                                                </div>
                                                <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${isSidebar ? 'text-white/40 border border-white/5 mx-4' : 'text-black mx-6'}`} style={!isSidebar ? { backgroundColor: vendorColor } : { color: vendorColor, borderColor: vendorColor + '40' }}>{calculated.bookBardcode}</div>
                                                <div className={`text-right flex flex-col items-end ${isSidebar ? 'min-w-[60px]' : 'min-w-[120px]'}`}>
                                                    <span className={`text-[8px] font-black uppercase tracking-widest ${isSidebar ? 'text-emerald-500' : ''}`} style={!isSidebar ? { color: accentColor } : {}}>{getStatusLabel(payStatus || '')}</span>
                                                    {isSidebar && <span className="text-[7px] text-white/20 font-black uppercase tracking-widest mt-0.5">#{norm.itemId?.split('-').pop()}</span>}
                                                    {!isSidebar && <span className="text-[10px] font-mono font-black text-white/80 mt-1">${Math.ceil(norm.price || 0).toLocaleString()}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }

                        if (displayMode === 'grid') {
                            return (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                    {filteredItems.map((item: any) => {
                                        const norm = normalizeInventoryData(item.data);
                                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : '#38bdf8';
                                        
                                        const mediaUrlsArr = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
                                        const displayUrlsArr = [mediaUrlsArr[0] || norm.generatedPngUrl, ...mediaUrlsArr.slice(1)].filter(Boolean).slice(0, 60);

                                        return (
                                            <div key={item.row} onClick={() => handleItemAction(item, displayUrlsArr, 0)}
                                                className="flex flex-col rounded-[32px] overflow-hidden bg-white/2 border border-white/5 hover:border-white/10 transition-all group cursor-pointer">
                                                <div className="aspect-square relative flex items-center justify-center bg-black/20 p-6">
                                                    <img src={getCleanImageUrl(mediaUrlsArr[0] || norm.generatedPngUrl)} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700" />
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
                                                        {!isSidebar && <span className="text-[11px] font-mono font-bold text-white/60">${Math.ceil(norm.price || 0).toLocaleString()}</span>}
                                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">x{norm.quantity || 1}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }

                        if (displayMode === 'gallery') {
                            return (
                                <div className={`grid ${isSidebar ? 'grid-cols-2 gap-px bg-white/5' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8'} auto-rows-max`}>
                                    {filteredItems.map((item: any) => {
                                        const norm = normalizeInventoryData(item.data);
                                        const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                                        const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
                                        const vendorColor = (vendors as any)[vendorPrefix]?.color || '#ccc';
                                        const mediaUrlsArr = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
                                        const displayUrlsArr = [mediaUrlsArr[0] || norm.generatedPngUrl, ...mediaUrlsArr.slice(1)].filter(Boolean).slice(0, 60);
                                        const payStatus = getStatusClass(norm, partialPayIds, fullPayIds);
                                        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : '#38bdf8';
                                        
                                        if (isSidebar) {
                                            return (
                                                <div key={item.row} className="relative aspect-square bg-black/40 overflow-hidden group transition-all animate-in fade-in duration-700 border border-white/5">
                                                    {/* Image Scrollable Container */}
                                                    <div className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth">
                                                        {displayUrlsArr.map((url, i) => (
                                                            <div key={i} className="min-w-full h-full snap-center relative shrink-0">
                                                                <img 
                                                                    src={getCleanImageUrl(url)} 
                                                                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                                                                    onClick={() => handleItemAction(item, displayUrlsArr, i)}
                                                                />
                                                                {isVideoFile(url) && <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none"><Video size={24} className="text-white/60" /></div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    
                                                    {/* Text and Tags Overlay - HUD Style */}
                                                    <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none bg-gradient-to-t from-black/90 via-transparent to-black/20">
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex flex-col gap-1.5">
                                                                <div className="px-2 py-0.5 bg-black/60 backdrop-blur-md border border-white/10 text-[8px] font-black uppercase tracking-[0.2em] inline-block" style={{ color: accentColor }}>{getStatusLabel(payStatus || '')}</div>
                                                                <div className="px-2 py-0.5 bg-black/60 backdrop-blur-md border border-white/10 text-[8px] font-black uppercase tracking-[0.2em] inline-block" style={{ color: vendorColor }}>{calculated.bookBardcode}</div>
                                                            </div>
                                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest bg-black/40 px-1.5 py-0.5">#{norm.itemId?.split('-').pop()}</span>
                                                        </div>

                                                        <div className="flex flex-col">
                                                            <h3 className="text-xs font-black text-white uppercase tracking-tighter leading-tight mb-0.5 truncate">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.2em]">{norm.color}</span>
                                                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">x{norm.quantity || 1}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Tiny Image Indicators */}
                                                    {displayUrlsArr.length > 1 && (
                                                        <div className="absolute bottom-0 left-0 right-0 flex gap-0.5 h-0.5">
                                                            {displayUrlsArr.slice(0, 8).map((_, i) => (
                                                                <div key={i} className={`flex-1 ${i === 0 ? 'bg-emerald-500' : 'bg-white/10'}`} />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        const mediaCount = displayUrlsArr.length;
                                        const isLarge = mediaCount >= 1 && mediaCount < 10;
                                        const isFull = mediaCount >= 10;
                                        
                                        return (
                                            <div key={item.row} className={`break-inside-avoid flex flex-col rounded-[40px] overflow-hidden bg-white/2 border border-white/5 hover:border-white/10 transition-all group shadow-xl ${isFull ? 'md:col-span-full' : isLarge ? 'md:col-span-2' : ''}`}>
                                                {(() => {
                                                    const total = displayUrlsArr.length;
                                                    const displayCount = 24;
                                                    const visibleUrls = displayUrlsArr.slice(0, displayCount);
                                                    const remaining = total - displayCount;
                                                    
                                                    // Dynamic Grid Configuration - Full Aspect Ratio for few images
                                                    if (total === 1) {
                                                        return (
                                                            <div className="relative w-full bg-black/20 overflow-hidden cursor-pointer"
                                                                onClick={() => handleItemAction(item, displayUrlsArr, 0)}>
                                                                <img src={getCleanImageUrl(visibleUrls[0])} className="w-full h-auto max-h-[800px] object-contain transition-transform duration-1000 group-hover:scale-105" />
                                                                {isVideoFile(visibleUrls[0]) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={32} className="text-white/60" /></div>}
                                                                <div className="absolute top-6 left-6 z-10 flex flex-col gap-3">
                                                                    <div className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 flex items-center gap-2" style={{ color: accentColor }}>
                                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />
                                                                        {getStatusLabel(payStatus || '')}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 inline-flex" style={{ color: vendorColor, borderColor: vendorColor + '40' }}>
                                                                            {calculated.bookBardcode}
                                                                        </div>
                                                                        <div className="px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{calculated.bookAqCode}</div>
                                                                        <div className="px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{calculated.bookLandCode}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    
                                                    if (total <= 3) {
                                                        return (
                                                            <div className={`grid gap-px bg-black/20 ${total === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                                                {visibleUrls.map((url, i) => (
                                                                    <div key={i} className="relative overflow-hidden cursor-pointer bg-black/10"
                                                                        onClick={() => handleItemAction(item, displayUrlsArr, i)}>
                                                                        <img src={getCleanImageUrl(url)} className="w-full h-auto max-h-[700px] object-contain transition-transform duration-1000 group-hover:scale-110" />
                                                                        {i === 0 && (
                                                                            <div className="absolute top-6 left-6 z-10 flex flex-col gap-3">
                                                                                <div className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 flex items-center gap-2" style={{ color: accentColor }}>
                                                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />
                                                                                    {getStatusLabel(payStatus || '')}
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 inline-flex" style={{ color: vendorColor, borderColor: vendorColor + '40' }}>
                                                                                        {calculated.bookBardcode}
                                                                                    </div>
                                                                                    <div className="px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{calculated.bookAqCode}</div>
                                                                                    <div className="px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{calculated.bookLandCode}</div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {isVideoFile(url) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={24} className="text-white/60" /></div>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    }

                                                    const gridCols = total <= 6 ? 'grid-cols-3' : total <= 12 ? 'grid-cols-4 md:grid-cols-4' : 'grid-cols-4 md:grid-cols-6';

                                                    return (
                                                        <div className={`grid gap-px bg-black/20 ${gridCols}`}>
                                                            {visibleUrls.map((url, i) => (
                                                                <div key={i} className={`relative overflow-hidden aspect-square cursor-pointer`}
                                                                    onClick={() => handleItemAction(item, displayUrlsArr, i)}>
                                                                    <img src={getCleanImageUrl(url)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                                                                    {i === 0 && (
                                                                        <div className="absolute top-6 left-6 z-10 flex flex-col gap-3">
                                                                            <div className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 flex items-center gap-2" style={{ color: accentColor }}>
                                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />
                                                                                {getStatusLabel(payStatus || '')}
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 inline-flex" style={{ color: vendorColor, borderColor: vendorColor + '40' }}>
                                                                                    {calculated.bookBardcode}
                                                                                </div>
                                                                                <div className="px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{calculated.bookAqCode}</div>
                                                                                <div className="px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{calculated.bookLandCode}</div>
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
                                                <div className="p-8 flex flex-col gap-1 w-full">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-xl font-black text-white uppercase tracking-tighter leading-tight">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                                        {!isSidebar && <span className="text-lg font-mono font-black text-white/40">${Math.ceil(norm.price || 0).toLocaleString()}</span>}
                                                    </div>
                                                    <div className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] mt-2 mb-4">{norm.color} · {norm.material}</div>
                                                    <div className="flex items-center justify-between pt-6 border-t border-white/5 mt-4">
                                                        <div className="flex items-center gap-6">
                                                           <div className="flex flex-col">
                                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Qty</span>
                                                                <span className="text-xs font-black text-white/60">x{norm.quantity || 1}</span>
                                                           </div>
                                                           <div className="flex flex-col border-l border-white/10 pl-6">
                                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Tag</span>
                                                                <span className="text-xs font-black text-white/60">{norm.itemId}</span>
                                                           </div>
                                                           {(norm.weight_kg || norm.weightKg) && (
                                                                <div className="flex flex-col border-l border-white/10 pl-6">
                                                                    <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest mb-1">Weight</span>
                                                                    <span className="text-xs font-black text-white/60">{norm.weight_kg || norm.weightKg} kg</span>
                                                                </div>
                                                           )}
                                                           {(norm.width_cm || norm.height_cm || norm.length_cm) && (
                                                                <div className="flex flex-col border-l border-white/10 pl-6">
                                                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Dims</span>
                                                                    <span className="text-xs font-black text-white/60">
                                                                        {[norm.length_cm, norm.width_cm, norm.height_cm].filter(Boolean).join('×')}
                                                                    </span>
                                                                </div>
                                                           )}
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

                    {/* LARGE PERSISTENT CLOSE BUTTON */}
                    {!isEmbeddedArtifact && (
                       <div className="flex justify-center py-12">
                           <button 
                               onClick={onClose}
                               className="px-16 py-6 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-[0.5em] text-white/40 hover:text-white hover:bg-white/10 hover:border-emerald-500/40 hover:shadow-[0_0_50px_rgba(16,185,129,0.1)] transition-all active:scale-95 backdrop-blur-xl group"
                           >
                               <span className="group-hover:tracking-[0.7em] transition-all duration-500">Terminate Manifest</span>
                           </button>
                       </div>
                    )}

                    {/* Payments Traceability List */}
                    {!isSidebar && aggregateFinancials.uniquePayments.length > 0 && (
                        <div className="mt-20 border-t border-white/5 pt-12 space-y-6">
                            <h4 className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] px-4">Traceability Audit</h4>
                            <div className="grid gap-3">
                                {aggregateFinancials.uniquePayments.map((p, idx) => (
                                    <div key={p.id || idx} className="flex items-center justify-between p-6 px-8 rounded-3xl bg-white/1 border border-white/5 hover:border-white/10 transition-all">
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
                <div className={`px-10 py-12 bg-transparent flex items-center justify-between shrink-0 ${(isSidebar || isEmbeddedArtifact) ? 'px-10' : 'bg-white/1 border-t border-white/5'}`}>
                    <div className={`flex items-center gap-16 ${(isSidebar || isEmbeddedArtifact) ? 'grid grid-cols-2 gap-8 w-full' : ''}`}>
                        {(!isSidebar && !isEmbeddedArtifact) && (
                            <div className="flex flex-col border-l border-white/10 pl-16">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">Asset Inventory Value</span>
                                <span className="text-2xl font-mono font-black text-white/90">${Math.ceil(aggregateFinancials.listValue).toLocaleString()}</span>
                            </div>
                        )}
                        {(!isSidebar && !isEmbeddedArtifact) && (
                            <>
                                <div className="flex flex-col border-l border-white/10 pl-16">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">Net Paid To Date</span>
                                    <span className="text-2xl font-mono font-black text-emerald-400">${Math.ceil(aggregateFinancials.netPaid).toLocaleString()}</span>
                                </div>
                                <div className="flex flex-col border-l border-white/10 pl-16">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mb-1.5">Grand Sum</span>
                                    <span className="text-2xl font-mono font-black text-emerald-400/50">${Math.ceil(aggregateFinancials.total).toLocaleString()}</span>
                                </div>
                            </>
                        )}
                        {(isSidebar || isEmbeddedArtifact) && (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em] mb-1.5 opacity-40">Artifact Contents</span>
                                <span className="text-xl font-black text-white/90 uppercase tracking-tighter">Inventory Ledger</span>
                            </div>
                        )}
                    </div>
                    {(!isSidebar && !isEmbeddedArtifact) && (
                        <button onClick={onClose} className="h-14 px-10 rounded-2xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-[0.3em] text-white hover:bg-white/10 transition-all">Dismiss Artifact</button>
                    )}
                </div>

                {/* Selection indicators for embedded mode */}
                {isEmbeddedArtifact && (
                    <div className="absolute bottom-4 right-10 flex items-center gap-4 animate-in slide-in-from-bottom duration-500">
                        <div className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full">
                            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                            <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">Active Link</span>
                        </div>
                    </div>
                )}
            </div>
    );

    if (isEmbeddedArtifact) return <div className={containerClasses}>{artifactContent}</div>;

    return createPortal(
        <div className={containerClasses}>
            {!isSidebar && <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={onClose} />}
            {!isSidebar && (
                <button 
                    onClick={onClose}
                    className="absolute top-10 right-10 w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all z-[10000] shadow-2xl backdrop-blur-xl group"
                >
                    <X size={40} strokeWidth={1} className="group-hover:rotate-90 transition-transform duration-500" />
                </button>
            )}
            
            {showViewer && (
                <FullscreenImageViewer 
                    src={viewerUrls[viewerIdx]} 
                    mediaUrls={viewerUrls} 
                    initialIdx={viewerIdx} 
                    onClose={() => setShowViewer(false)} 
                />
            )}

            {artifactContent}
        </div>,
        document.body
    );
};
