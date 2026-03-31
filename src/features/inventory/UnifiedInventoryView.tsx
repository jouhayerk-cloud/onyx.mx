import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import {
    inventoryStatusFilterAtom,
    showFinancialsAtom,
    inventorySearchTermAtom,
    inventoryActiveFilterAtom,
    exchangeRateAtom,
    isDetailsPanelOpenAtom,
    detailsPanelModeAtom,
    SelectedItemDataAtom,
    SelectedItemRowAtom,
    ImageSrcAtom,
    InventoryVersionAtom,
    userAtom,
    inventoryViewModeAtom,
    filteredInventoryCountAtom,
    activeVendorsAtom,
    inventoryVendorFilterAtom,
    isInventoryVendorFilterOpenAtom,
    inventorySortKeyAtom,
    inventorySortOrderAtom,
    inventoryCategoryFilterAtom,
    isInventoryCategoryFilterOpenAtom,
    inventoryMaterialFilterAtom,
    isInventoryMaterialFilterOpenAtom,
    isInventorySortMenuOpenAtom,
    isInventoryFiltersPanelOpenAtom,
    inventoryAtom,
    financeDataAtom,
    paymentsArtifactConfigAtom
} from '../../lib/atoms';
import { useDatabase, useTranslation } from '../../lib/hooks';
import { calculateCodesAndPrices, normalizeInventoryData, handleFileUpload, readFileAsDataURL, getCleanImageUrl, isVideoFile, formatWeightImperial, formatDimensionsImperial } from '../../lib/utils';
import { InventoryItemData, UploadedFile } from '../../lib/Types';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { InventorySkeletonGrid, InventorySkeletonList } from './InventorySkeleton';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { X, Edit2, ChevronDown, Menu, Filter, Upload, Video, Pencil, Maximize2, Trash2, ChevronLeft, ChevronRight, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown, Layers, Box, Tag, FileText, CloudUpload, Check } from 'lucide-react';

export const getStatusClass = (item: any, partialPayIds?: Set<string>): 'RED' | 'YELLOW' | 'GREEN' | 'BLUE' | 'PURPLE' | null => {
    const payReqStr = String(item.payReq || item.pay_req || '').toLowerCase();
    const statusStr = String(item.status || item.item_status || '').toLowerCase();
    const dispStatus = String(item.dispersal_status || '').toLowerCase();
    
    // 1. Highest priority: Partial Payments (WIP) - Must check BEFORE Paid
    if (partialPayIds?.has(String(item.id)) || payReqStr.includes('%')) return 'RED';
    
    // 2. High priority: Paid/Dispersed (Terminal state)
    if (item.payDate || item.pay_date || payReqStr === 'paid' || dispStatus === 'dispersed') return 'GREEN';
    
    // 3. Low priority: Requests (Initial state)
    if (payReqStr === 'requested' || payReqStr === 'true' || payReqStr === 'partial' || statusStr === 'requested' || dispStatus === 'requested' || dispStatus === 'sent') return 'YELLOW';
    
    // Default to BLUE for 'New' items instead of null
    return 'BLUE';
};

const lbl = "text-[9px] font-black text-white/30 uppercase tracking-[0.2em] block ml-1 opacity-60 mb-2";
const inp = "h-12 w-full px-4 bg-white/[0.04] border border-white/[0.08] rounded-2xl text-xs text-white placeholder-white/20 outline-none focus:border-(--main-color)/50 focus:bg-white/[0.08] transition-all";
const inpNum = inp + " font-mono text-center";

const FullscreenImageViewer = ({ src, mediaUrls = [], initialIdx = 0, onClose }: { src: string; mediaUrls?: string[]; initialIdx?: number; onClose: () => void }) => {
    const [currentIdx, setCurrentIdx] = useState(initialIdx);
    const activeSrc = mediaUrls.length > 0 ? mediaUrls[currentIdx] : src;
    const isVideo = isVideoFile(activeSrc);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (isVideo) return; e.preventDefault();
        setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.002)));
    }, [isVideo]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isVideo) return; setIsDragging(true); setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || isVideo) return; setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleMouseUp = () => setIsDragging(false);

    const nav = (dir: number) => {
        if (mediaUrls.length === 0) return; setCurrentIdx(p => (p + dir + mediaUrls.length) % mediaUrls.length);
        setScale(1); setPosition({ x: 0, y: 0 });
    };

    return createPortal(
        <div className="fixed inset-0 z-10000 bg-black/98 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300" onClick={onClose} onWheel={handleWheel}>
            <button onClick={onClose} className="absolute top-8 right-8 z-10 w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all">
                <X className="w-6 h-6" />
            </button>
            {mediaUrls.length > 1 && (
                <div className="absolute inset-0 flex items-center justify-between px-8 pointer-events-none">
                    <button onClick={(e) => { e.stopPropagation(); nav(-1); }} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all pointer-events-auto"><ChevronLeft size={32} /></button>
                    <button onClick={(e) => { e.stopPropagation(); nav(1); }} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all pointer-events-auto"><ChevronRight size={32} /></button>
                </div>
            )}
            {isVideo ? (
                <video src={getCleanImageUrl(activeSrc)} controls autoPlay className="max-w-[90vw] max-h-[90vh] shadow-2xl rounded-2xl" onClick={(e) => e.stopPropagation()} />
            ) : (
                <img src={getCleanImageUrl(activeSrc)} alt="" draggable={false}
                    className="max-w-[90vw] max-h-[90vh] object-contain select-none transition-transform duration-100"
                    style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                />
            )}
        </div>, document.body
    );
};

const UnifiedInventoryCard = ({ item, isExpanded, onToggleExpand, exchangeRate, showFinancials, viewMode, partialPayIds, onEdit }: any) => {
    const db = useDatabase();
    const norm = normalizeInventoryData(item.data);
    const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#ccc';
    const [showViewer, setShowViewer] = useState(false);
    const [viewerIdx, setViewerIdx] = useState(0);
    const [modalIdx, setModalIdx] = useState(0);
    const [cardIdx, setCardIdx] = useState(0);
    const [isHoveringCard, setIsHoveringCard] = useState(false);


    const mediaUrls = useMemo(() => {
        const raw = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = norm.generatedPngUrl || (raw.length > 0 ? raw[0] : null);
        return [main, ...raw.filter(u => u !== main)].filter(Boolean) as string[];
    }, [norm.mediaUrls, norm.generatedPngUrl]);


    const activeIdx = 0;
    const rawImageUrl = mediaUrls[activeIdx] || null;
    const imageUrl = getCleanImageUrl(rawImageUrl);
    const isVideo = rawImageUrl ? isVideoFile(rawImageUrl) : false;

    const dimensionsStr = formatDimensionsImperial(norm.widthCm, norm.heightCm, norm.lengthCm);
    const weightStr = formatWeightImperial(norm.weightKg);

    const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
    const statusClass = getStatusClass(norm, partialPayIds);

    const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);
    const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
    const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
    const setImageSrc = useSetAtom(ImageSrcAtom);
    const user = useAtomValue(userAtom);
    const isEditable = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor';
    const isInternalUser = user?.role === 'Developer' || user?.role === 'Admin';
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation(); if (onEdit) onEdit(item.row, item.data);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation(); if (!window.confirm('PERMANENTLY REMOVE this item from registry?')) return;
        const tid = toast.loading('Removing Artifact...');
        try {
            const tbl = item.source === 'production' ? 'production' : 'inventory';
            const { error } = await supabase.from(tbl).update({ is_hidden: true }).eq('id', item.row);
            if (error) throw error; toast.success('Removed', { id: tid }); setInventoryVersion(v => v + 1);
        } catch (err: any) { toast.error(err.message, { id: tid }); }
    };

    if (viewMode === 'list') {
        const itemPriceMXN = Math.ceil(Number(norm.price || 0));
        const itemTotalMXN = itemPriceMXN * Number(norm.quantity || 1);
        const payStatus = getStatusClass(norm, partialPayIds);
        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : 'transparent';

        return (
            <div className="flex flex-col gap-0.5">
                {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} mediaUrls={mediaUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
                <div className={`flex items-stretch overflow-hidden bg-(--sidebar-bg) border rounded-lg hover:border-white/10 transition-all group shadow-sm cursor-pointer ${isExpanded ? 'ring-1 ring-(--main-color)/30' : ''}`}
                    onClick={onToggleExpand} style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)' }}>
                    <div className="w-0.5 shrink-0 self-stretch" style={{ backgroundColor: payStatus ? accentColor : 'transparent', opacity: payStatus ? 0.7 : 0 }} />
                    <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-black/40 relative overflow-hidden group/listimg" 
                        onMouseEnter={() => setIsHoveringCard(true)} onMouseLeave={() => { setIsHoveringCard(false); setCardIdx(0); }}
                        onClick={(e) => { e.stopPropagation(); if (mediaUrls.length > 1) { setCardIdx(p => (p + 1) % mediaUrls.length); } }}>
                        {mediaUrls[cardIdx] ? <img key={cardIdx} src={getCleanImageUrl(mediaUrls[cardIdx])} className="w-full h-full object-cover animate-in fade-in duration-700" /> : <div className="w-full h-full p-2 opacity-30 flex items-center justify-center"><OnyxMiniLogo className="w-full h-full object-contain" /></div>}
                        {isVideoFile(mediaUrls[cardIdx]) && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Video size={16} /></div>}
                        
                        {/* List View Card Navigation Chevrons */}
                        {mediaUrls.length > 1 && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setCardIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length); }}
                                    className="absolute left-0 top-1/2 -translate-y-1/2 text-white/40 opacity-0 group-hover/listimg:opacity-100 hover:text-white transition-all drop-shadow-md">
                                    <ChevronLeft size={16} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setCardIdx(p => (p + 1) % mediaUrls.length); }}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 text-white/40 opacity-0 group-hover/listimg:opacity-100 hover:text-white transition-all drop-shadow-md">
                                    <ChevronRight size={16} />
                                </button>
                            </>
                        )}
                    </div>
                    <div className="flex-1 flex items-center px-3 gap-3 min-w-0 overflow-x-auto no-scrollbar">
                        <div className="flex flex-col flex-1 min-w-0">
                            <h3 className="text-xs sm:text-sm font-bold text-white truncate">{norm.shape || 'OBJ'} {norm.shortDescription && <span className="opacity-60 font-medium ml-2 text-[10px] sm:text-xs">{norm.shortDescription}</span>}</h3>
                            <div className="text-[9px] text-white/40 uppercase tracking-widest font-black truncate">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                        </div>
                        <div className="flex flex-col min-w-[70px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Tag ID</span><span className="inline-flex items-center px-1.5 py-0.5 rounded text-black text-[10px] font-black uppercase tracking-tight shadow-md w-fit" style={{ backgroundColor: vendorColor }}>{calculated.bookBardcode || 'N/A'}</span></div>
                        <div className="flex flex-col min-w-[100px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Size / Weight</span><div className="flex flex-col gap-0.5"><span className="text-[9px] font-mono text-white/60 truncate max-w-[100px]">{dimensionsStr || '—'}</span><span className="text-[9px] font-mono text-white/40 truncate max-w-[100px]">{weightStr || '—'}</span></div></div>
                        <div className="flex flex-col min-w-[80px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Price / Qty</span><div className="flex items-baseline gap-1"><span className="text-xs font-bold text-white">{showFinancials ? `$${itemPriceMXN}` : '***'}</span><span className="text-[10px] text-white/50 font-mono">x{norm.quantity || 1}</span></div></div>
                        <div className="flex flex-col min-w-[80px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Total MXN</span><span className="text-xs font-black text-(--main-color)">{showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}</span></div>
                        <div className="flex flex-col min-w-[60px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">AQ Code</span><span className="text-[11px] text-white/80 font-mono">{calculated.bookAqCode || '—'}</span></div>
                        <div className="flex flex-col min-w-[60px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">LD Code</span><span className="text-[11px] text-yellow-500/80 font-mono">{calculated.bookLandCode || '—'}</span></div>
                        <div className="flex flex-col min-w-[72px] shrink-0 pl-3">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Status</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide w-fit" style={{ color: accentColor || '#38bdf8', backgroundColor: accentColor ? `color-mix(in srgb, ${accentColor} 12%, transparent)` : '#38bdf810' }}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor || '#38bdf8' }} />
                                {payStatus === 'GREEN' ? 'Paid' : payStatus === 'YELLOW' ? 'Requested' : payStatus === 'RED' ? 'Partial' : payStatus === 'BLUE' ? 'NEW' : payStatus === 'PURPLE' ? 'Acquired' : 'New'}
                            </span>
                        </div>
                    </div>
                </div>
                {isExpanded && (
                    <div className="ml-14 mr-2 px-4 pb-4 pt-4 bg-black/30 backdrop-blur-sm border-x border-b border-white/5 rounded-b-2xl animate-in slide-in-from-top-2 duration-300">
                        {/* List View Thumbnail Gallery */}
                        {mediaUrls.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-6 shrink-0 border-b border-white/5 mb-6">
                                {mediaUrls.map((u, i) => (
                                    <div key={i} onClick={(e) => { e.stopPropagation(); setViewerIdx(i); setShowViewer(true); }}
                                        className="w-16 h-16 rounded-xl bg-black/40 border border-white/5 overflow-hidden shrink-0 cursor-pointer hover:border-(--main-color)/50 transition-all group/thumb relative">
                                        <img src={getCleanImageUrl(u)} className="w-full h-full object-cover opacity-60 group-hover/thumb:opacity-100 transition-all" />
                                        {isVideoFile(u) && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/40 group-hover/thumb:text-white transition-all"><Video size={14} /></div>}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6 mb-4">
                            <div><p className={lbl}>Material</p><p className="text-[11px] font-bold text-white/70 uppercase">{norm.material || '—'}</p></div>
                            <div><p className={lbl}>Dimensions</p><p className="text-[11px] font-mono text-white/70">{dimensionsStr || '—'}</p></div>
                            <div><p className={lbl}>Weight</p><p className="text-[11px] font-mono text-white/70">{weightStr || '—'}</p></div>
                            <div><p className={lbl}>Landed USD</p><p className="text-sm font-black text-yellow-300 font-mono">{showFinancials ? `$${calculated.bookLanded}` : '***'}</p></div>
                            <div><p className={lbl}>Retail USD</p><p className="text-sm font-black text-green-400 font-mono">{showFinancials ? `$${calculated.bookRetail}` : '***'}</p></div>
                            <div className="flex items-center gap-6 col-span-full pt-4 border-t border-white/5 mt-2">
                                {isEditable && (
                                    <button onClick={handleEdit} className="p-2 -m-2 text-(--main-color)/60 hover:text-(--main-color) transition-all" title="Edit Item">
                                        <Pencil size={18} />
                                    </button>
                                )}
                                {isInternalUser && (
                                    <button onClick={handleDelete} className="p-2 -m-2 text-red-500/60 hover:text-red-500 transition-all" title="Remove Artifact">
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const col = statusClass === 'GREEN' ? '#22c55e' : statusClass === 'YELLOW' ? '#eab308' : statusClass === 'RED' ? '#ef4444' : statusClass === 'BLUE' ? '#38bdf8' : statusClass === 'PURPLE' ? '#a855f7' : 'transparent';
    return (
        <div className={`group relative flex flex-col rounded-xl overflow-hidden cursor-pointer bg-(--sidebar-bg) border transition-all duration-400 hover:-translate-y-1 hover:shadow-xl ${isExpanded ? 'ring-1 ring-(--main-color)/30' : 'hover:border-(--main-color)/30'}`}
             style={{ borderColor: statusClass ? `color-mix(in srgb, ${col} 35%, var(--border-color))` : 'var(--border-color)' }} onClick={onToggleExpand}
             onMouseEnter={() => setIsHoveringCard(true)} onMouseLeave={() => { setIsHoveringCard(false); setCardIdx(0); }}>
            {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} mediaUrls={mediaUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
            <div className="aspect-4/3 relative overflow-hidden bg-black/20 group/gridimg" onClick={(e) => { e.stopPropagation(); if (mediaUrls.length > 1) { setCardIdx(p => (p + 1) % mediaUrls.length); } }}>
                {mediaUrls[cardIdx] ? <img key={cardIdx} src={getCleanImageUrl(mediaUrls[cardIdx])} className="w-full h-full object-cover group-hover:scale-105 transition-transform animate-in fade-in duration-700" /> : <div className="w-full h-full flex items-center justify-center"><OnyxMiniLogo className="w-16 h-16 opacity-10" /></div>}
                {isVideoFile(mediaUrls[cardIdx]) && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Upload size={24} className="text-white/40" /></div>}
                
                {/* Grid View Card Navigation Chevrons */}
                {mediaUrls.length > 1 && (
                    <>
                        <button onClick={(e) => { e.stopPropagation(); setCardIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length); }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 opacity-0 group-hover/gridimg:opacity-100 hover:text-white transition-all drop-shadow-lg">
                            <ChevronLeft size={28} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setCardIdx(p => (p + 1) % mediaUrls.length); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 opacity-0 group-hover/gridimg:opacity-100 hover:text-white transition-all drop-shadow-lg">
                            <ChevronRight size={28} />
                        </button>

                        {/* Progress Dots */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/gridimg:opacity-100 transition-opacity">
                            {mediaUrls.map((_, i) => (
                                <div key={i} className={`w-1 h-1 rounded-full ${cardIdx === i ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-white/20'}`} />
                            ))}
                        </div>
                    </>
                )}
                
                <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-black" style={{ backgroundColor: vendorColor }}>{calculated.bookBardcode || vendorPrefix}</div>
            </div>
            <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="font-bold text-[13px] text-white truncate">{norm.shape || 'OBJ'} <span className="opacity-60 text-[11px]">{norm.shortDescription}</span></div>
                <div className="text-[9px] text-white/30 uppercase tracking-widest font-black truncate">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                <div className="flex flex-col gap-0.5 my-1">
                    <span className="text-[9px] font-mono text-white/40 truncate">{dimensionsStr || '—'}</span>
                    <span className="text-[9px] font-mono text-white/20 truncate">{weightStr || '—'}</span>
                </div>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                        {statusClass && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />}
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40" style={{ color: statusClass ? col : '#38bdf8' }}>{statusClass === 'GREEN' ? 'Paid' : statusClass === 'YELLOW' ? 'Requested' : statusClass === 'RED' ? 'Partial' : statusClass === 'BLUE' ? 'NEW' : statusClass === 'PURPLE' ? 'Acquired' : 'New'}</span>
                    </div>
                    <span className="text-[10px] font-black text-white/20 font-mono">x{norm.quantity || 1}</span>
                </div>
            </div>
            {isExpanded && createPortal(
                <div className="fixed inset-0 z-90 bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => onToggleExpand()}>
                    <div className="relative w-full max-w-2xl bg-[#0e0e0e] rounded-[40px] overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[90vh]" onClick={e=>e.stopPropagation()}>
                        <div className="absolute top-6 right-6 z-10 flex gap-2">
                            {isEditable && <button onClick={handleEdit} className="h-10 px-4 rounded-xl bg-(--main-color)/20 text-(--main-color) text-[10px] font-black uppercase tracking-widest hover:bg-(--main-color) hover:text-black transition-all">Edit Item</button>}
                            <button onClick={onToggleExpand} className="h-10 px-4 rounded-xl bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all">Close</button>
                        </div>
                        <div className="h-72 sm:h-96 bg-black relative shrink-0 group/hero">
                            {mediaUrls[modalIdx] ? (
                                <div className="w-full h-full relative cursor-zoom-in" onClick={() => { setViewerIdx(modalIdx); setShowViewer(true); }}>
                                    {isVideoFile(mediaUrls[modalIdx]) ? (
                                        <video src={getCleanImageUrl(mediaUrls[modalIdx])} className="w-full h-full object-contain" autoPlay muted loop />
                                    ) : (
                                        <img src={getCleanImageUrl(mediaUrls[modalIdx])} className="w-full h-full object-contain" />
                                    )}
                                    
                                    {/* Modal Hero Navigation Chevrons */}
                                    {mediaUrls.length > 1 && (
                                        <>
                                            <button onClick={(e) => { e.stopPropagation(); setModalIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length); }}
                                                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/50 opacity-0 group-hover/hero:opacity-100 hover:text-white transition-all">
                                                <ChevronLeft size={24} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setModalIdx(p => (p + 1) % mediaUrls.length); }}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/50 opacity-0 group-hover/hero:opacity-100 hover:text-white transition-all">
                                                <ChevronRight size={24} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ) : <div className="w-full h-full flex items-center justify-center opacity-10"><OnyxMiniLogo width={64} height={64} /></div>}
                        </div>

                        {/* Modal Thumbnail Gallery Bar */}
                        {mediaUrls.length > 1 && (
                            <div className="px-8 py-3 bg-black/40 border-b border-white/5 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                                {mediaUrls.map((u, i) => (
                                    <div key={i} onClick={() => setModalIdx(i)}
                                        className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 cursor-pointer transition-all border-2 ${modalIdx === i ? 'border-(--main-color) scale-110' : 'border-transparent opacity-40 hover:opacity-100'}`}>
                                        <img src={getCleanImageUrl(u)} className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="p-8 overflow-y-auto grow custom-scrollbar flex flex-col gap-8">
                            <div><h3 className="text-2xl font-black text-white tracking-tighter uppercase mb-1">{norm.shape || 'OBJ'} {norm.shortDescription}</h3><p className="text-[11px] font-bold text-white/20 uppercase tracking-[0.3em] font-mono">{norm.color} {norm.material}</p></div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 p-8 rounded-[32px] bg-white/2 border border-white/5">
                                <div><p className={lbl}>AQ Code</p><p className="text-xl font-mono font-black text-(--main-color)">{calculated.bookAqCode || '—'}</p></div>
                                <div><p className={lbl}>LD Code</p><p className="text-xl font-mono font-black text-yellow-500">{calculated.bookLandCode || '—'}</p></div>
                                <div><p className={lbl}>Dimensions</p><p className="text-[13px] font-mono font-bold text-white/50">{dimensionsStr || '—'}</p></div>
                                <div><p className={lbl}>Weight</p><p className="text-[13px] font-mono font-bold text-white/50">{weightStr || '—'}</p></div>
                                <div><p className={lbl}>Acq. MXN</p><p className="text-xl font-black text-green-400">{showFinancials ? `$${Math.ceil(Number(norm.price || 0))}` : '***'}</p></div>
                                <div><p className={lbl}>Landed USD</p><p className="text-xl font-black text-yellow-300">{showFinancials ? `$${calculated.bookLanded}` : '***'}</p></div>
                                <div><p className={lbl}>Retail USD</p><p className="text-xl font-black text-[#6BCEBB]">{showFinancials ? `$${calculated.bookRetail}` : '***'}</p></div>
                                {isInternalUser && (
                                    <div className="col-span-full border-t border-white/5 pt-6 flex justify-end">
                                        <button onClick={handleDelete} className="flex items-center gap-2 h-10 px-4 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"><Trash2 size={16} /> REMOVE ARTIFACT</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export const UnifiedInventoryView = () => {
    const t = useTranslation(); const db = useDatabase(); const items = useAtomValue(inventoryAtom); const financeDocs = useAtomValue(financeDataAtom);
    const [isLoading, setIsLoading] = useState(true); const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const [isFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom); const [viewMode] = useAtom(inventoryViewModeAtom);
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isInventoryVendorFilterOpenAtom);
    const setGlobalActiveVendors = useSetAtom(activeVendorsAtom); const exchangeRate = useAtomValue(exchangeRateAtom); const showFinancials = useAtomValue(showFinancialsAtom);
    const [itemData, setSelectedItemData] = useAtom(SelectedItemDataAtom); const [itemRow, setSelectedItemRow] = useAtom(SelectedItemRowAtom);
    const [mode, setMode] = useAtom(detailsPanelModeAtom); const [isSaving, setIsSaving] = useState(false); const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom); const searchTerm = useAtomValue(inventorySearchTermAtom);
    const [sortOrder, setSortOrder] = useAtom(inventorySortOrderAtom); const [sortKey, setSortKey] = useAtom(inventorySortKeyAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom); const [categoryFilter, setCategoryFilter] = useAtom(inventoryCategoryFilterAtom);
    const [isCategoryOpen, setIsCategoryOpen] = useAtom(isInventoryCategoryFilterOpenAtom); const [materialFilter, setMaterialFilter] = useAtom(inventoryMaterialFilterAtom);
    const [isMaterialOpen, setIsMaterialOpen] = useAtom(isInventoryMaterialFilterOpenAtom); const [isSortMenuOpen, setIsSortMenuOpen] = useAtom(isInventorySortMenuOpenAtom);
    const user = useAtomValue(userAtom); const setFilteredCount = useSetAtom(filteredInventoryCountAtom);
    const [editData, setEditData] = useState<any>(null); const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);
    const [savingProgress, setSavingProgress] = useState(0);

    const partialPayIds = useMemo(() => {
        const ids = new Set<string>();
        financeDocs.forEach(d => { 
            const isPartial = String(d.status).toLowerCase().includes('partial') || 
                             String(d.description).includes('%') || 
                             String(d.status).toLowerCase().includes('requested') && String(d.description).toLowerCase().includes('partial');

            if ((d.status === 'Paid' || d.status === 'Partial') && isPartial) { 
                const rel = d.related_ids || d.related_inventory_ids || '';
                let relArray: string[] = [];
                if (Array.isArray(rel)) relArray = rel.map(id => String(id));
                else if (typeof rel === 'string') relArray = rel.split(',').map(s => s.trim()).filter(Boolean);
                relArray.forEach(id => ids.add(id));
            } 
        });
        return ids;
    }, [financeDocs]);

    useEffect(() => { if (mode === 'edit' && itemData) { setEditData({ ...normalizeInventoryData(itemData), vendorId: String(itemData.itemId || '').split('-')[0] }); setNewFiles([]); } }, [mode, itemData]);

    const handleEditChange = (e: any) => { const { name, value } = e.target; setEditData((prev: any) => ({ ...prev, [name]: value })); };
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []); const uploaded: UploadedFile[] = [];
        for (const file of files) { const type = file.type.startsWith('video/') ? 'video' : 'image'; const localUrl = await readFileAsDataURL(file, type); uploaded.push({ type, localUrl, originalFile: file, tag: 'Item' }); }
        setNewFiles(prev => [...prev, ...uploaded]);
    };

    const handleEditItem = async (rowId: string, currentData: any) => {
        setSelectedItemRow(rowId);
        setSelectedItemData(currentData); // Fallback immediately
        setMode('edit');
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('inventory').select('*').eq('id', rowId).single();
            if (data && !error) {
                const norm = normalizeInventoryData(data);
                setSelectedItemData(norm);
                // Also update editData immediately to sync with the now-open form
                setEditData({ ...norm, vendorId: String(norm.itemId || '').split('-')[0] });
            }
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteExistingMedia = (url: string) => {
        const urls = (editData.mediaUrls || '').split(',').map((u:string) => u.trim()).filter(Boolean);
        const filtered = urls.filter((u:string) => u !== url).join(',');
        setEditData((p: any) => ({ ...p, mediaUrls: filtered }));
    };

    const filteredItems = useMemo(() => {
        const filtered = items.filter(item => {
            if (item.data.is_hidden) return false;
            
            const status = getStatusClass(item.data, partialPayIds);
            if (statusFilter !== 'All') {
                if (statusFilter === 'Partial' && status !== 'RED') return false;
                if (statusFilter === 'Requested' && status !== 'YELLOW') return false;
                if (statusFilter === 'Paid' && status !== 'GREEN') return false;
                if (statusFilter === 'New' && status !== 'BLUE') return false;
            }
            const itemIdStr = String(item.data.itemId || item.data.item_id || '');
            let vPre = item.data.vendor_id || item.data.vendorId || '';
            if (!vPre) {
                if (itemIdStr.includes('-')) vPre = itemIdStr.split('-')[0];
                else {
                    const vKeys = Object.keys(vendors).sort((a,b) => b.length - a.length);
                    const prefix = vKeys.find(v => itemIdStr.startsWith(v));
                    if (prefix) vPre = prefix;
                }
            }
            if (user?.role === 'Vendor' && vPre !== user?.name) return false;
            if (vendorFilter !== 'All' && vPre !== vendorFilter) return false;
            const cat = `${item.data.shape || ''} ${item.data.shortDescription || item.data.short_description || ''}`.trim();
            if (categoryFilter !== 'All' && cat !== categoryFilter) return false;
            const mat = `${item.data.color || ''} ${item.data.material || ''}`.trim();
            if (materialFilter !== 'All' && mat !== materialFilter) return false;
            if (searchTerm) {
                const s = `${item.data.itemId} ${item.data.shape} ${item.data.shortDescription} ${item.data.color}`.toLowerCase();
                if (!searchTerm.toLowerCase().split(' ').every(t => s.includes(t))) return false;
            }
            return true;
        });
        return filtered.sort((a, b) => {
            const sA = getStatusClass(a.data, partialPayIds); const sB = getStatusClass(b.data, partialPayIds);
            if (sA === null && sB !== null) return -1; if (sA !== null && sB === null) return 1;
            let comp = 0;
            if (sortKey === 'Date') comp = (new Date(b.data.updated_at || 0).getTime()) - (new Date(a.data.updated_at || 0).getTime());
            else if (sortKey === 'Vendor') comp = (a.data.itemId||'').localeCompare(b.data.itemId||'');
            else if (sortKey === 'Status') comp = ((sB==='RED'?6:sB==='YELLOW'?5:sB==='GREEN'?4:sB==='BLUE'?3:sB==='PURPLE'?2:1)-(sA==='RED'?6:sA==='YELLOW'?5:sA==='GREEN'?4:sA==='BLUE'?3:sA==='PURPLE'?2:1));
            else if (sortKey === 'Number') {
                const nA = parseInt(a.data.itemNumber || a.data.item_number || '0', 10);
                const nB = parseInt(b.data.itemNumber || b.data.item_number || '0', 10);
                comp = nA - nB;
            }
            return sortOrder === 'desc' ? comp : -comp;
        });
    }, [items, statusFilter, vendorFilter, searchTerm, sortKey, sortOrder, partialPayIds, user, categoryFilter]);

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault(); if (!itemRow || !editData) return; 
        setIsSaving(true); setSavingProgress(10);
        const tid = toast.loading('Syncing Artifact...');
        try {
            let uploaded: string[] = []; 
            if (newFiles.length > 0) { 
                for (let i = 0; i < newFiles.length; i++) { 
                    const f = newFiles[i];
                    if (f.originalFile) { 
                        const r = await handleFileUpload(f.originalFile, user); 
                        if (r) uploaded.push(r.thumbnailUrl); 
                    } 
                    setSavingProgress(Math.round(10 + ((i + 1) / newFiles.length) * 70));
                } 
            } else {
                setSavingProgress(80);
            }
            
            const news = [editData.mediaUrls || '', ...uploaded].filter(Boolean).join(',');
            const payload = {
                status: editData.status,
                shape: editData.shape,
                material: editData.material,
                color: editData.color,
                short_description: editData.shortDescription || editData.short_description || '',
                quantity: parseInt(editData.quantity) || 1,
                price_mxn: parseFloat(editData.price) || 0,
                weight_kg: parseFloat(editData.weightKg) || null,
                width_cm: parseFloat(editData.widthCm) || null,
                height_cm: parseFloat(editData.heightCm) || null,
                length_cm: parseFloat(editData.lengthCm) || null,
                media_urls: news,
                updated_at: new Date().toISOString()
            };
            
            setSavingProgress(90);
            const { error } = await supabase.from((itemData as any)?.source==='production'?'production':'inventory').update(payload).eq('id', itemRow);
            if (error) throw error; 
            
            setSavingProgress(100);
            toast.success('Sync Complete', { id: tid }); 
            setInventoryVersion(v => v + 1); 
            setMode('view');
        } catch (err: any) { 
            toast.error(err.message, { id: tid }); 
            setIsSaving(false);
        } finally { 
            setTimeout(() => {
                setIsSaving(false);
                setSavingProgress(0);
            }, 800);
        }
    };

    const activeVendors = useMemo(() => Array.from(new Set(items.map(i => i.data.itemId?.split('-')[0]).filter(Boolean))).sort(), [items]);
    const activeCategories = useMemo(() => Array.from(new Set(items.map(i => `${i.data.shape || ''} ${i.data.shortDescription || ''}`.trim()).filter(Boolean))).sort(), [items]);
    const activeMaterials = useMemo(() => Array.from(new Set(items.map(i => `${i.data.color || ''} ${i.data.material || ''}`.trim()).filter(Boolean))).sort(), [items]);
    
    useEffect(() => { setGlobalActiveVendors(activeVendors); setFilteredCount(filteredItems.length); setIsLoading(items.length === 0); }, [activeVendors, filteredItems.length, items.length]);

    const totalCount = useMemo(() => filteredItems.reduce((acc, i) => acc + (parseInt(i.data.quantity) || 1), 0), [filteredItems]);
    const totalValueMXN = useMemo(() => filteredItems.reduce((acc, i) => acc + ((parseInt(i.data.price) || 0) * (parseInt(i.data.quantity) || 1)), 0), [filteredItems]);

    // Ken Burns Logic
    const bgMediaUrls = useMemo(() => items.flatMap(i => (i.data as any)._allMedia || []).filter(u => !isVideoFile(u)).map(u => getCleanImageUrl(u)).slice(0, 20), [items]);
    const [bgIdx, setBgIdx] = useState(0);
    useEffect(() => { if (bgMediaUrls.length < 2) return; const i = setInterval(() => setBgIdx(p => (p + 1) % bgMediaUrls.length), 6000); return () => clearInterval(i); }, [bgMediaUrls]);

    const toggleExpandCard = (id: string) => setExpandedCards(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    return (
        <div className="flex flex-col h-full overflow-hidden relative m-4 mt-0 gap-0">
            <div className="z-40 flex items-center gap-6 px-6 py-3 shrink-0 backdrop-blur-xl border-b border-white/5 bg-[#0a0a0a]/40">
                <div className="flex flex-col"><div className={lbl + " mb-0"}>Types</div><div className="text-xl font-bold text-white leading-none">{filteredItems.length.toLocaleString()}</div></div>
                <div className="w-px h-6 bg-white/5" />
                <div className="flex flex-col"><div className={lbl + " mb-0"}>Count</div><div className="text-xl font-bold text-[#6BCEBB] leading-none">{totalCount.toLocaleString()}</div></div>
                <div className="w-px h-6 bg-white/5" />
                <div className="flex flex-col"><div className={lbl + " mb-0"}>Total {showFinancials ? 'MXN' : ''}</div><div className="text-xl font-bold text-(--main-color) leading-none">{showFinancials ? `$${totalValueMXN.toLocaleString()}` : '***'}</div></div>
            </div>

            <div className={`z-40 shrink-0 overflow-hidden transition-all duration-500 ease-in-out ${(isFiltersOpen || isSortMenuOpen) ? 'h-16 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-6 bg-black/40 backdrop-blur-3xl border-b border-white/10 shadow-2xl">
                    <button onClick={() => setStatusFilter(statusFilter === 'All' ? 'New' : statusFilter === 'New' ? 'Partial' : statusFilter === 'Partial' ? 'Requested' : statusFilter === 'Requested' ? 'Paid' : 'All')}
                            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all group">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 border-white/20 transition-all duration-500 ${statusFilter === 'All' ? 'bg-white/10' : statusFilter === 'Partial' ? 'bg-red-500' : statusFilter === 'Requested' ? 'bg-yellow-500' : statusFilter === 'Paid' ? 'bg-green-500' : statusFilter === 'New' ? 'bg-blue-500' : 'bg-white/20'}`} />
                        <span className="text-[10px] font-black tracking-widest text-white/50 uppercase group-hover:text-white">{statusFilter}</span>
                    </button>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="ml-auto flex items-center gap-6">
                        {isSortMenuOpen && (
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mr-2">Sort By</span>
                                {[{ key: 'Date', label: 'Date' }, { key: 'Status', label: 'Status' }, { key: 'Vendor', label: 'Vendor' }, { key: 'Number', label: 'Number' }].map((o) => (
                                    <button key={o.key} onClick={() => sortKey === o.key ? setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc') : setSortKey(o.key as any)}
                                            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${sortKey === o.key ? 'bg-(--main-color) text-black' : 'bg-white/5 text-white/40'}`}>{o.label}</button>
                                ))}
                            </div>
                        )}
                        {(isSortMenuOpen && isFiltersOpen) && <div className="w-px h-6 bg-white/10" />}
                        {isFiltersOpen && (
                            <div className="flex items-center gap-3">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mr-1">Discovery</span>
                                <button onClick={() => setIsVendorFilterOpen(!isVendorFilterOpen)} className={`p-2 rounded-xl transition-all ${isVendorFilterOpen ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'bg-white/5 text-white/40'}`}><Tag size={16} /></button>
                                <button onClick={() => setIsCategoryOpen(!isCategoryOpen)} className={`p-2 rounded-xl transition-all ${isCategoryOpen ? 'bg-(--main-color) text-black shadow-lg' : 'bg-white/5 text-white/40'}`}><Layers size={16} /></button>
                                <button onClick={() => setIsMaterialOpen(!isMaterialOpen)} className={`p-2 rounded-xl transition-all ${isMaterialOpen ? 'bg-(--main-color) text-black shadow-lg' : 'bg-white/5 text-white/40'}`}><Box size={16} /></button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className={`shrink-0 z-30 overflow-hidden transition-all duration-300 ${isVendorFilterOpen ? 'h-14 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-2 bg-black/20 backdrop-blur-md border-b border-white/5 overflow-x-auto no-scrollbar">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 shrink-0 mr-4">Vendors</span>
                    <button onClick={() => setVendorFilter('All')} className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all ${vendorFilter === 'All' ? 'bg-white text-black shadow-lg shadow-black/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>All</button>
                    {activeVendors.map(v => {
                        const color = vendors[v as keyof typeof vendors]?.color || '#ccc';
                        const isActive = vendorFilter === v;
                        return (
                            <button key={v} onClick={() => setVendorFilter(v)} className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${isActive ? 'text-black border-transparent shadow-lg shadow-black/20' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`} style={isActive ? { backgroundColor: color } : { borderColor: color + '40' }}>
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                {v}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={`shrink-0 z-30 overflow-hidden transition-all duration-300 ${isCategoryOpen ? 'h-14 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-2 bg-black/20 backdrop-blur-md border-b border-white/5 overflow-x-auto no-scrollbar">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 shrink-0 mr-4">Type</span>
                    <button onClick={() => setCategoryFilter('All')} className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all ${categoryFilter === 'All' ? 'bg-(--main-color) text-black shadow-lg' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>All</button>
                    {activeCategories.map(c => (
                        <button key={c} onClick={() => setCategoryFilter(c)} className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${categoryFilter === c ? 'bg-white text-black border-transparent' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>{c}</button>
                    ))}
                </div>
            </div>

            <div className={`shrink-0 z-30 overflow-hidden transition-all duration-300 ${isMaterialOpen ? 'h-14 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-2 bg-black/20 backdrop-blur-md border-b border-white/5 overflow-x-auto no-scrollbar">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 shrink-0 mr-4">Material</span>
                    <button onClick={() => setMaterialFilter('All')} className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all ${materialFilter === 'All' ? 'bg-(--main-color) text-black shadow-lg' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>All</button>
                    {activeMaterials.map(m => (
                        <button key={m} onClick={() => setMaterialFilter(m)} className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${materialFilter === m ? 'bg-white text-black border-transparent' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>{m}</button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6 pb-20" : "flex flex-col gap-3 pb-20"}>
                    {isLoading && items.length === 0 ? <div className="col-span-full py-12 text-center text-white/20 font-black tracking-widest text-[10px] uppercase">Loading Artifacts...</div> : filteredItems.map(item => <UnifiedInventoryCard key={item.row} item={item} isExpanded={expandedCards.has(String(item.row))} onToggleExpand={() => toggleExpandCard(String(item.row))} exchangeRate={exchangeRate} showFinancials={showFinancials} viewMode={viewMode} partialPayIds={partialPayIds} onEdit={handleEditItem} />)}
                </div>
            </div>

            {mode === 'edit' && editData && (
                <div className="fixed inset-0 z-100 flex flex-col p-4 sm:p-8 items-center justify-center animate-in fade-in zoom-in duration-500 overflow-hidden">
                    {bgMediaUrls.length > 0 && <img key={bgIdx} src={bgMediaUrls[bgIdx]} className="glass-bg-img" />}
                    <div className="glass-scrim" />
                    <div className="max-w-[820px] w-full flex flex-col max-h-[92dvh] overflow-hidden relative rounded-[48px] p-8 sm:p-12" style={{ zIndex: 2, background: 'color-mix(in srgb, #0a0a0a 90%, transparent)', backdropFilter: 'blur(40px)', border: '1px solid white/10', boxShadow: '0 50px 150px rgba(0,0,0,0.8)' }}>
                        
                        {/* Header Section */}
                        <div className="flex justify-between items-center mb-12 shrink-0">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10"><FileText size={28} className="text-white/40" /></div>
                                <div className="flex flex-col">
                                    <h2 className="text-3xl font-black text-white leading-none tracking-tighter uppercase">MANUAL ENTRY FORM</h2>
                                    <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em] mt-2 ml-0.5">Inventory Management Suite</p>
                                </div>
                            </div>
                            <button onClick={() => setMode('view')} className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all text-2xl font-light">&times;</button>
                        </div>

                        <form onSubmit={handleSaveEdit} className="overflow-y-auto grow custom-scrollbar space-y-12 pr-4 -mr-4">
                            
                            {/* Entry Status Section */}
                            <div className="space-y-5">
                                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.25em] ml-1">ENTRY STATUS</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {['Production', 'Acquisition'].map(s => (
                                        <button key={s} type="button" onClick={() => setEditData((p:any) => ({ ...p, status: s }))}
                                            className={`h-16 rounded-2xl border transition-all flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-widest ${editData.status === s ? 'bg-white/10 border-(--main-color) text-(--main-color) shadow-[0_0_20px_rgba(var(--main-color-rgb),0.1)]' : 'bg-white/5 border-white/5 text-white/20 hover:text-white hover:bg-white/10'}`}>
                                            {s === 'Production' && <Pencil size={16} />}
                                            {s === 'Acquisition' && <Tag size={16} />}
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Vendor Selection Section */}
                            <div className="space-y-5">
                                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.25em] ml-1">VENDOR SELECTION</h3>
                                <div className="flex flex-wrap gap-4 p-8 rounded-[32px] bg-white/[0.02] border border-white/5">
                                    {activeVendors.map(v => {
                                        const color = vendors[v as keyof typeof vendors]?.color || '#ccc';
                                        const isActive = editData.vendorId === v;
                                        return (
                                            <button key={v} type="button" onClick={() => setEditData((p:any) => ({ ...p, vendorId: v }))}
                                                className={`w-12 h-12 rounded-full border-2 transition-all flex items-center justify-center text-[10px] font-black uppercase tracking-tight ${isActive ? 'scale-110 shadow-lg' : 'opacity-40 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-105'}`}
                                                style={{ borderColor: isActive ? color : 'transparent', backgroundColor: color, color: '#000' }}>
                                                {v}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Identity Fields Section */}
                            <div className="grid grid-cols-2 gap-x-8 gap-y-10">
                                <div className="flex flex-col gap-2.5"><label className={lbl}>NUM</label><input disabled className={inpNum + " opacity-50 cursor-not-allowed"} value={editData.itemNumber || '--'} /></div>
                                <div className="flex flex-col gap-2.5"><label className={lbl}>ITEM QUANTITY</label><input type="text" name="quantity" value={editData.quantity} placeholder="1" onChange={(e) => setEditData((p:any) => ({ ...p, quantity: e.target.value.replace(/[^0-9]/g, '') }))} className={inp + " text-2xl font-black"} /></div>
                                
                                {/* Media Section */}
                                <div className="space-y-5 col-span-2">
                                    <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.25em] ml-1">MEDIA ATTACHMENTS</h3>
                                    
                                    {/* Saved Gallery */}
                                    {editData.mediaUrls && (
                                        <div className="flex flex-wrap gap-4 mb-6">
                                            {editData.mediaUrls.split(',').filter(Boolean).map((url: string, i: number) => (
                                                <div key={`existing-${i}`} className="w-24 h-24 rounded-2xl overflow-hidden border border-white/20 relative group bg-white/5">
                                                    {isVideoFile(url) ? (
                                                        <div className="w-full h-full flex items-center justify-center bg-black/40"><Video size={20} className="text-white/40" /></div>
                                                    ) : (
                                                        <img src={getCleanImageUrl(url)} className="w-full h-full object-cover" />
                                                    )}
                                                    <button type="button" onClick={() => handleDeleteExistingMedia(url)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-xs shadow-lg hover:bg-red-600">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="relative group">
                                        <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                        <div className="h-48 rounded-[32px] border-2 border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-4 group-hover:bg-white/[0.05] group-hover:border-white/20 transition-all">
                                            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10"><Upload size={24} className="text-white/20 group-hover:text-white transition-all" /></div>
                                            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] group-hover:text-white transition-all">ATTACH NEW MEDIA (IMAGES / VIDEO)</p>
                                        </div>
                                    </div>
                                    {newFiles.length > 0 && (
                                        <div className="flex flex-wrap gap-4 pt-4 border-t border-white/5">
                                            {newFiles.map((f, i) => (
                                                <div key={`new-${i}`} className="w-24 h-24 rounded-2xl overflow-hidden border border-(--main-color)/30 relative group shadow-lg shadow-(--main-color)/5">
                                                    <img src={f.localUrl} className="w-full h-full object-cover" />
                                                    <button type="button" onClick={() => setNewFiles(p => p.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-xs">&times;</button>
                                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-(--main-color)/50" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Detail Fields Section (DESC) */}
                            <div className="space-y-8">
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="flex flex-col gap-2.5"><label className={lbl}>COLOR</label><input name="color" value={editData.color} onChange={handleEditChange} className={inp} placeholder="Identify pigment..." /></div>
                                    <div className="flex flex-col gap-2.5"><label className={lbl}>MAT</label><input name="material" value={editData.material} onChange={handleEditChange} className={inp} placeholder="Identify mineral..." /></div>
                                    <div className="flex flex-col gap-2.5"><label className={lbl}>SHAPE</label><input name="shape" value={editData.shape} onChange={handleEditChange} className={inp} placeholder="Identify geometry..." /></div>
                                    <div className="flex flex-col gap-2.5"><label className={lbl}>TYPE</label><input name="shortDescription" value={editData.shortDescription} onChange={handleEditChange} className={inp} placeholder="Identify class..." /></div>
                                </div>
                            </div>

                            {/* Logistics Section */}
                            <div className="pt-8 border-t border-white/5 space-y-8">
                                <div className="grid grid-cols-4 gap-6">
                                    <div className="flex flex-col gap-2.5"><label className={lbl}>WEIGHT (KG)</label><input type="number" step="0.01" name="weightKg" value={editData.weightKg} onChange={handleEditChange} className={inpNum} /></div>
                                    <div className="flex flex-col gap-2.5"><label className={lbl}>W (CM)</label><input type="number" name="widthCm" value={editData.widthCm} onChange={handleEditChange} className={inpNum} /></div>
                                    <div className="flex flex-col gap-2.5"><label className={lbl}>H (CM)</label><input type="number" name="heightCm" value={editData.heightCm} onChange={handleEditChange} className={inpNum} /></div>
                                    <div className="flex flex-col gap-2.5"><label className={lbl}>D (CM)</label><input type="number" name="lengthCm" value={editData.lengthCm} onChange={handleEditChange} className={inpNum} /></div>
                                </div>
                            </div>

                            {/* Financial Assets Section */}
                            <div className="pt-8 border-t border-white/5 lg:flex items-center gap-12 space-y-8 lg:space-y-0">
                                <div className="grow space-y-2">
                                    <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.25em]">FINANCIAL INTEGRITY</h3>
                                    <p className="text-[10px] text-white/10 font-medium leading-relaxed max-w-sm">Artifact values are stored in MXN and calculated against active exchange rates for global parity.</p>
                                </div>
                                <div className="w-full lg:w-72 flex flex-col gap-2.5">
                                    <label className={lbl}>ACQ PRICE (MXN)</label>
                                    <input type="number" name="price" value={editData.price} onChange={handleEditChange} className={inp + " text-2xl font-black text-green-400 font-mono"} />
                                </div>
                            </div>

                            <div className="pt-16 flex gap-6 pb-4">
                                <button type="button" onClick={() => setMode('view')} className="h-20 px-10 rounded-3xl bg-white/5 border border-white/10 text-[11px] font-black tracking-[0.4em] uppercase text-white/30 hover:text-white hover:bg-white/10 transition-all">ABORT SYNC</button>
                                <button type="submit" disabled={isSaving} className="flex-1 h-20 rounded-3xl bg-(--main-color) text-black text-[13px] font-black tracking-[0.5em] uppercase shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50">
                                    {isSaving ? 'SYNCING ARTIFACT...' : 'COMMIT CHANGES â†’'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isSaving && (
                <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-[320px] p-10 rounded-[40px] bg-white/3 border border-white/10 flex flex-col items-center gap-8 shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-linear-to-b from-(--main-color)/5 to-transparent opacity-50" />
                        
                        <div className="relative">
                            <div className="w-20 h-20 rounded-3xl bg-(--main-color)/10 flex items-center justify-center border border-(--main-color)/20 animate-pulse">
                                <CloudUpload size={40} className="text-(--main-color)" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center border-4 border-[#0a0a0a] transition-all duration-500" style={{ transform: savingProgress === 100 ? 'scale(1)' : 'scale(0)' }}>
                                <Check size={14} className="text-white font-bold" />
                            </div>
                        </div>

                        <div className="w-full space-y-4 relative">
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Synchronization</span>
                                <span className="text-sm font-mono font-black text-(--main-color)">{savingProgress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <div 
                                    className="h-full bg-linear-to-r from-(--main-color)/50 to-(--main-color) transition-all duration-500 ease-out"
                                    style={{ width: `${savingProgress}%` }}
                                />
                            </div>
                        </div>

                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] animate-pulse text-center">
                            {savingProgress < 80 ? 'Uploading Media...' : savingProgress < 100 ? 'Updating Registry...' : 'Artifact Synced'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
