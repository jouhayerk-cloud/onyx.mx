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
import { calculateCodesAndPrices, normalizeInventoryData, handleFileUpload, readFileAsDataURL, getCleanImageUrl, isVideoFile } from '../../lib/utils';
import { InventoryItemData, UploadedFile } from '../../lib/Types';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { InventorySkeletonGrid, InventorySkeletonList } from './InventorySkeleton';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { X, Edit2, ChevronDown, Menu, Filter, Upload, Video, Pencil, Maximize2, Trash2, ChevronLeft, ChevronRight, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown, Layers, Box, Tag } from 'lucide-react';

export const getStatusClass = (item: any, partialPayIds?: Set<string>): 'RED' | 'YELLOW' | 'GREEN' | null => {
    const payReqStr = String(item.payReq || item.pay_req || '').toLowerCase();
    if (partialPayIds?.has(String(item.id)) || payReqStr.includes('%')) return 'RED';
    if (payReqStr === 'requested' || payReqStr === 'partial') return 'YELLOW';
    if (item.payDate || item.pay_date || payReqStr === 'true' || payReqStr === 'paid') return 'GREEN';
    return null;
};

const lbl = "text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1";
const inp = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2 text-sm text-white placeholder-white/15 focus:outline-none focus:border-(--main-color)/50 focus:bg-white/[0.07] transition-all";
const inpNum = inp + " font-mono text-center";

const FullscreenImageViewer = ({ src, mediaUrls = [], initialIdx = 0, onClose }: { src: string; mediaUrls?: string[]; initialIdx?: number; onClose: () => void }) => {
    const [currentIdx, setCurrentIdx] = useState(initialIdx);
    const activeSrc = mediaUrls.length > 0 ? mediaUrls[currentIdx] : src;
    const isVideo = isVideoFile(activeSrc);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [lastTouchDist, setLastTouchDist] = useState<number | null>(null);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (isVideo) return;
        e.preventDefault();
        setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.002)));
    }, [isVideo]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isVideo) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || isVideo) return;
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleMouseUp = () => setIsDragging(false);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (isVideo) return;
        if (e.touches.length === 2) {
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            if (lastTouchDist !== null) {
                const delta = dist / lastTouchDist;
                setScale(s => Math.min(5, Math.max(0.5, s * delta)));
            }
            setLastTouchDist(dist);
        } else if (e.touches.length === 1 && scale > 1) {
            const touch = e.touches[0];
            setPosition(p => ({ x: p.x + touch.clientX - (dragStart.x || touch.clientX), y: p.y + touch.clientY - (dragStart.y || touch.clientY) }));
            setDragStart({ x: touch.clientX, y: touch.clientY });
        }
    }, [lastTouchDist, scale, dragStart, isVideo]);

    const handleTouchEnd = () => setLastTouchDist(null);
    const handleDoubleClick = () => { if (isVideo) return; setScale(s => s > 1 ? 1 : 3); setPosition({ x: 0, y: 0 }); };

    const nav = (dir: number) => {
        if (mediaUrls.length === 0) return;
        setCurrentIdx(p => (p + dir + mediaUrls.length) % mediaUrls.length);
        setScale(1); setPosition({ x: 0, y: 0 });
    };

    return createPortal(
        <div className="fixed inset-0 z-10000 bg-black/95 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-300 overflow-hidden"
            onClick={onClose} onWheel={handleWheel}>
            <button onClick={onClose} className="absolute top-6 right-6 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all">
                <X className="w-5 h-5" />
            </button>

            {mediaUrls.length > 1 && (
                <div className="absolute inset-0 flex items-center justify-between px-8 pointer-events-none">
                    <button onClick={(e) => { e.stopPropagation(); nav(-1); }} className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all pointer-events-auto">
                        <ChevronLeft className="w-8 h-8" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); nav(1); }} className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all pointer-events-auto">
                        <ChevronRight className="w-8 h-8" />
                    </button>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black tracking-widest text-white/30 uppercase">
                        Artifact {currentIdx + 1} / {mediaUrls.length}
                    </div>
                </div>
            )}

            {!isVideo && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/5 backdrop-blur-md rounded-full px-4 py-2 border border-white/10">
                    <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.5, s - 0.5)); }} className="text-white/50 hover:text-white text-lg font-bold">âˆ’</button>
                    <span className="text-[10px] font-mono text-white/40 w-12 text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.5)); }} className="text-white/50 hover:text-white text-lg font-bold">+</button>
                </div>
            )}
            
            {isVideo ? (
                <video src={getCleanImageUrl(activeSrc)} controls autoPlay className="max-w-[90vw] max-h-[90vh] shadow-2xl rounded-2xl" onClick={(e) => e.stopPropagation()} />
            ) : (
                <img src={getCleanImageUrl(activeSrc)} alt="" draggable={false}
                    className="max-w-[90vw] max-h-[90vh] object-contain select-none transition-transform duration-100"
                    style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={handleDoubleClick}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                />
            )}
        </div>,
        document.body
    );
};

const UnifiedInventoryCard = ({ item, isExpanded, onToggleExpand, exchangeRate, showFinancials, viewMode, partialPayIds }: any) => {
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
    const setGlobalSearchTerm = useSetAtom(inventorySearchTermAtom);
    const db = useDatabase();
    const norm = normalizeInventoryData(item.data);
    const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#ccc';
    const [showViewer, setShowViewer] = useState(false);

    const mediaUrls = useMemo(() => {
        const raw = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = norm.generatedPngUrl || (raw.length > 0 ? raw[0] : null);
        return [main, ...raw.filter(u => u !== main)].filter(Boolean) as string[];
    }, [norm.mediaUrls, norm.generatedPngUrl]);

    const [activeIdx, setActiveIdx] = useState(0);
    const rawImageUrl = mediaUrls[activeIdx] || null;
    const imageUrl = getCleanImageUrl(rawImageUrl);
    const isVideo = rawImageUrl ? isVideoFile(rawImageUrl) : false;

    const navMedia = (dir: number) => { setActiveIdx(prev => (prev + dir + mediaUrls.length) % mediaUrls.length); };

    const dimensionsStr = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('x') 
        ? `${[norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('x')}cm (${[(parseFloat(String(norm.widthCm))*0.393).toFixed(1), (parseFloat(String(norm.heightCm))*0.393).toFixed(1), (parseFloat(String(norm.lengthCm))*0.393).toFixed(1)].filter(s=>s!=='NaN').join('x')}in)` : '';
    const weightStr = norm.weightKg ? `${norm.weightKg}kg (${(parseFloat(String(norm.weightKg))*2.2).toFixed(1)}lbs)` : '';

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
        e.stopPropagation(); setSelectedItemRow(item.row); setSelectedItemData(item.data); setImageSrc(imageUrl); setDetailsPanelMode('edit');
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation(); if (!window.confirm('Hide this item?')) return;
        const tid = toast.loading('Hiding...');
        try {
            const tbl = item.source === 'production' ? 'production' : 'inventory';
            const { error } = await supabase.from(tbl).update({ is_hidden: true }).eq('id', item.row);
            if (error) throw error; toast.success('Hidden', { id: tid }); setInventoryVersion(v => v + 1);
        } catch (err: any) { toast.error(err.message, { id: tid }); }
    };

    const isAlreadyApproved = norm.dispersal_status === 'Approved';
    const handleApprove = async (e: React.MouseEvent) => {
        e.stopPropagation(); if (isAlreadyApproved) return;
        const tid = toast.loading('Approving...');
        try {
            const { error } = await supabase.from('inventory').update({ dispersal_status: 'Approved' }).eq('id', item.row);
            if (error) throw error; toast.success('Approved', { id: tid }); setInventoryVersion(v => v + 1);
        } catch (err: any) { toast.error(err.message, { id: tid }); }
    };

    if (viewMode === 'list') {
        const itemPriceMXN = Math.ceil(Number(norm.price || 0));
        const itemTotalMXN = itemPriceMXN * Number(norm.quantity || 1);
        const payStatus = getStatusClass(norm, partialPayIds);
        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : 'transparent';

        return (
            <div className="flex flex-col gap-0.5">
                {showViewer && imageUrl && <FullscreenImageViewer src={rawImageUrl} mediaUrls={mediaUrls} initialIdx={activeIdx} onClose={() => setShowViewer(false)} />}
                <div className={`flex items-stretch overflow-hidden bg-(--sidebar-bg) border rounded-lg hover:border-white/10 transition-all group shadow-sm cursor-pointer ${isExpanded ? 'ring-1 ring-(--main-color)/30' : ''}`}
                    onClick={onToggleExpand} style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)' }}>
                    <div className="w-0.5 shrink-0 self-stretch" style={{ backgroundColor: payStatus ? accentColor : 'transparent', opacity: payStatus ? 0.7 : 0 }} />
                    <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-black/40 relative overflow-hidden" onClick={(e) => { e.stopPropagation(); imageUrl && setShowViewer(true); }}>
                        {imageUrl ? <img src={imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full p-2 opacity-30 flex items-center justify-center"><OnyxMiniLogo className="w-full h-full object-contain" /></div>}
                        {isVideo && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Video size={16} /></div>}
                    </div>
                    <div className="flex-1 flex items-center px-3 gap-3 min-w-0 overflow-x-auto no-scrollbar">
                        <div className="flex flex-col flex-1 min-w-0">
                            <h3 className="text-xs sm:text-sm font-bold text-white truncate">{norm.shape || 'OBJ'} {norm.shortDescription && <span className="opacity-60 font-medium ml-2 text-[10px] sm:text-xs">{norm.shortDescription}</span>}</h3>
                            <div className="text-[9px] text-white/40 uppercase tracking-widest font-black truncate">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                        </div>
                        <div className="flex flex-col min-w-[70px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Tag ID</span><span className="inline-flex items-center px-1.5 py-0.5 rounded text-black text-[10px] font-black uppercase tracking-tight shadow-md w-fit" style={{ backgroundColor: vendorColor }}>{calculated.bookBardcode || 'N/A'}</span></div>
                        <div className="flex flex-col min-w-[80px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Price / Qty</span><div className="flex items-baseline gap-1"><span className="text-xs font-bold text-white">{showFinancials ? `$${itemPriceMXN}` : '***'}</span><span className="text-[10px] text-white/50 font-mono">x{norm.quantity || 1}</span></div></div>
                        <div className="flex flex-col min-w-[80px] shrink-0 border-r border-white/5 pr-3"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Total MXN</span><span className="text-xs font-black text-(--main-color)">{showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}</span></div>
                        <div className="flex flex-col min-w-[60px] shrink-0"><span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">AQ Code</span><span className="text-[11px] text-white/80 font-mono">{calculated.bookAqCode || '—'}</span></div>
                        <div className="flex flex-col min-w-[72px] shrink-0 pl-3">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Status</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide w-fit" style={{ color: accentColor || '#38bdf8', backgroundColor: accentColor ? `color-mix(in srgb, ${accentColor} 12%, transparent)` : '#38bdf810' }}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor || '#38bdf8' }} />
                                {payStatus === 'GREEN' ? 'Paid' : payStatus === 'YELLOW' ? 'Requested' : payStatus === 'RED' ? 'Partial' : 'New'}
                            </span>
                        </div>
                    </div>
                </div>
                {isExpanded && (
                    <div className="ml-14 mr-2 px-4 pb-4 pt-3 bg-black/30 backdrop-blur-sm border-x border-b border-white/5 rounded-b-2xl animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6 mb-4">
                            <div><p className={lbl}>Material</p><p className="text-[11px] font-bold text-white/70 uppercase">{norm.material || '—'}</p></div>
                            <div><p className={lbl}>Dimensions</p><p className="text-[11px] font-mono text-white/70">{dimensionsStr || '—'}</p></div>
                            <div><p className={lbl}>Landed USD</p><p className="text-sm font-black text-yellow-300 font-mono">{showFinancials ? `$${calculated.bookLanded}` : '***'}</p></div>
                            <div className="flex items-center gap-4 col-span-full pt-4">{isEditable && <button onClick={handleEdit} className="text-(--main-color) opacity-60 hover:opacity-100 transition-all"><Pencil size={18} /></button>}</div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const col = statusClass === 'GREEN' ? '#22c55e' : statusClass === 'YELLOW' ? '#eab308' : statusClass === 'RED' ? '#ef4444' : 'transparent';
    return (
        <div className={`group relative flex flex-col rounded-xl overflow-hidden cursor-pointer bg-(--sidebar-bg) border transition-all duration-400 hover:-translate-y-1 hover:shadow-xl ${isExpanded ? 'ring-1 ring-(--main-color)/30' : 'hover:border-(--main-color)/30'}`}
             style={{ borderColor: statusClass ? `color-mix(in srgb, ${col} 35%, var(--border-color))` : 'var(--border-color)' }} onClick={onToggleExpand}>
            {showViewer && imageUrl && <FullscreenImageViewer src={rawImageUrl} mediaUrls={mediaUrls} initialIdx={activeIdx} onClose={() => setShowViewer(false)} />}
            <div className="aspect-4/3 relative overflow-hidden bg-black/20">
                {imageUrl ? <img src={imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center"><OnyxMiniLogo className="w-16 h-16 opacity-10" /></div>}
                {isVideo && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Upload size={24} className="text-white/40" /></div>}
                <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-black" style={{ backgroundColor: vendorColor }}>{calculated.bookBardcode || vendorPrefix}</div>
            </div>
            <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="font-bold text-[13px] text-white truncate">{norm.shape || 'OBJ'} <span className="opacity-60 text-[11px]">{norm.shortDescription}</span></div>
                <div className="text-[9px] text-white/30 uppercase tracking-widest font-black truncate">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                        {statusClass && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />}
                        <span className="text-[13px] font-black text-(--main-color)">{showFinancials ? `$${Math.ceil(Number(norm?.price || 0))}` : '***'}</span>
                    </div>
                    <span className="text-[10px] font-black text-white/20 font-mono">x{norm.quantity || 1}</span>
                </div>
            </div>
            {isExpanded && createPortal(
                <div className="fixed inset-0 z-90 bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => onToggleExpand()}>
                    <div className="relative w-full max-w-2xl bg-[#0a0a0a] rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[90vh]" onClick={e=>e.stopPropagation()}>
                        <div className="absolute top-4 right-4 z-10 flex gap-2">
                            {isEditable && <button onClick={handleEdit} className="h-8 px-3 rounded-lg bg-(--main-color)/20 text-(--main-color) text-[10px] font-black uppercase">Edit</button>}
                            <button onClick={onToggleExpand} className="h-8 px-3 rounded-lg bg-white/5 text-white/60 text-[10px] font-black uppercase">Close</button>
                        </div>
                        <div className="h-64 bg-black relative">
                            {imageUrl ? <img src={imageUrl} className="w-full h-full object-contain" onClick={()=>setShowViewer(true)} /> : <div className="w-full h-full flex items-center justify-center opacity-10"><OnyxMiniLogo size={48} /></div>}
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                            <div><h3 className="text-xl font-black text-white">{norm.shape || 'OBJ'} {norm.shortDescription}</h3><p className="text-[11px] font-bold text-white/30 uppercase tracking-[0.2em]">{norm.color} {norm.material}</p></div>
                            <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-white/3 border border-white/5">
                                <div><p className={lbl}>AQ Code</p><p className="text-sm font-mono font-black text-(--main-color)">{calculated.bookAqCode || '—'}</p></div>
                                <div><p className={lbl}>LD Code</p><p className="text-sm font-mono font-black text-yellow-500">{calculated.bookLandCode || '—'}</p></div>
                                <div><p className={lbl}>Dimensions</p><p className="text-sm font-mono font-bold text-white/70">{dimensionsStr || '—'}</p></div>
                                <div><p className={lbl}>Price MXN</p><p className="text-sm font-black text-green-400">{showFinancials ? `$${Math.ceil(Number(norm.price || 0))}` : '***'}</p></div>
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
    const [itemData, setItemData] = useAtom(SelectedItemDataAtom); const [itemRow, setSelectedItemRow] = useAtom(SelectedItemRowAtom);
    const [mode, setMode] = useAtom(detailsPanelModeAtom); const [isSaving, setIsSaving] = useState(false); const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom); const searchTerm = useAtomValue(inventorySearchTermAtom);
    const [sortOrder, setSortOrder] = useAtom(inventorySortOrderAtom); const [sortKey, setSortKey] = useAtom(inventorySortKeyAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom); const [categoryFilter, setCategoryFilter] = useAtom(inventoryCategoryFilterAtom);
    const [isCategoryOpen, setIsCategoryOpen] = useAtom(isInventoryCategoryFilterOpenAtom); const [materialFilter, setMaterialFilter] = useAtom(inventoryMaterialFilterAtom);
    const [isMaterialOpen, setIsMaterialOpen] = useAtom(isInventoryMaterialFilterOpenAtom); const [isSortMenuOpen, setIsSortMenuOpen] = useAtom(isInventorySortMenuOpenAtom);
    const user = useAtomValue(userAtom); const setFilteredCount = useSetAtom(filteredInventoryCountAtom);
    const [editData, setEditData] = useState<any>(null); const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);

    const partialPayIds = useMemo(() => {
        const ids = new Set<string>();
        financeDocs.forEach(d => { if (d.status === 'Paid' && d.description?.includes('%')) { (d.related_ids || (d.related_inventory_ids ? d.related_inventory_ids.split(',') : [])).forEach((id:any)=>ids.add(String(id).trim())); } });
        return ids;
    }, [financeDocs]);

    useEffect(() => { if (mode === 'edit' && itemData) { setEditData({ ...normalizeInventoryData(itemData), vendorId: String(itemData.itemId || '').split('-')[0] }); setNewFiles([]); } }, [mode, itemData]);

    const handleEditChange = (e: any) => { const { name, value } = e.target; setEditData((prev: any) => ({ ...prev, [name]: value })); };
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []); const uploaded: UploadedFile[] = [];
        for (const file of files) { const type = file.type.startsWith('video/') ? 'video' : 'image'; const localUrl = await readFileAsDataURL(file, type); uploaded.push({ type, localUrl, originalFile: file, tag: 'Item' }); }
        setNewFiles(prev => [...prev, ...uploaded]);
    };

    const filteredItems = useMemo(() => {
        const filtered = items.filter(item => {
            if (item.data.is_hidden) return false;
            if (!item.data.status || ['Available', 'Catalog'].includes(item.data.status)) return false;
            const status = getStatusClass(item.data, partialPayIds);
            if (statusFilter !== 'All') {
                if (statusFilter === 'Partial' && status !== 'RED') return false;
                if (statusFilter === 'Requested' && status !== 'YELLOW') return false;
                if (statusFilter === 'Paid' && status !== 'GREEN') return false;
            }
            const vPre = item.data.itemId?.split('-')[0] || '';
            if (user?.role === 'Vendor' && vPre !== user?.name) return false;
            if (vendorFilter !== 'All' && vPre !== vendorFilter) return false;
            const cat = `${item.data.shape || ''} ${item.data.shortDescription || ''}`.trim();
            if (categoryFilter !== 'All' && cat !== categoryFilter) return false;
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
            else if (sortKey === 'Status') comp = ((sB==='RED'?3:sB==='YELLOW'?2:1)-(sA==='RED'?3:sA==='YELLOW'?2:1));
            return sortOrder === 'desc' ? comp : -comp;
        });
    }, [items, statusFilter, vendorFilter, searchTerm, sortKey, sortOrder, partialPayIds, exchangeRate, user, categoryFilter]);

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault(); if (!itemRow || !editData) return; setIsSaving(true); const tid = toast.loading('Syncing...');
        try {
            let uploaded: string[] = []; if (newFiles.length > 0) { for (const f of newFiles) { if (f.originalFile) { const r = await handleFileUpload(f.originalFile, user); if (r) uploaded.push(r.thumbnailUrl); } } }
            const news = [editData.mediaUrls || '', ...uploaded].filter(Boolean).join(',');
            const { error } = await supabase.from((itemData as any)?.source==='production'?'production':'inventory').update({ shape: editData.shape, material: editData.material, color: editData.color, short_description: editData.shortDescription, media_urls: news, updated_at: new Date().toISOString() }).eq('id', itemRow);
            if (error) throw error; toast.success('Saved', { id: tid }); setInventoryVersion(v => v + 1); setMode('view');
        } catch (err: any) { toast.error(err.message, { id: tid }); } finally { setIsSaving(false); }
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
                <div className="flex flex-col"><div className={lbl + " mb-0"}>Types</div><div className="text-xl font-bold text-white">{filteredItems.length.toLocaleString()}</div></div>
                <div className="w-px h-6 bg-white/5" />
                <div className="flex flex-col"><div className={lbl + " mb-0"}>Count</div><div className="text-xl font-bold text-[#6BCEBB]">{totalCount.toLocaleString()}</div></div>
                <div className="w-px h-6 bg-white/5" />
                <div className="flex flex-col"><div className={lbl + " mb-0"}>Total {showFinancials ? 'MXN' : ''}</div><div className="text-xl font-bold text-(--main-color)">{showFinancials ? `$${totalValueMXN.toLocaleString()}` : '***'}</div></div>
            </div>

            <div className={`z-40 shrink-0 overflow-hidden transition-all duration-500 ease-in-out ${(isFiltersOpen || isSortMenuOpen) ? 'h-16 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-6 bg-black/40 backdrop-blur-3xl border-b border-white/10 shadow-2xl">
                    <button onClick={() => setStatusFilter(statusFilter === 'All' ? 'Partial' : statusFilter === 'Partial' ? 'Requested' : statusFilter === 'Requested' ? 'Paid' : 'All')}
                            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all group">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 border-white/20 transition-all duration-500 ${statusFilter === 'All' ? 'bg-white/10' : statusFilter === 'Partial' ? 'bg-red-500' : statusFilter === 'Requested' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                        <span className="text-[10px] font-black tracking-widest text-white/50 uppercase group-hover:text-white">{statusFilter}</span>
                    </button>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="ml-auto flex items-center gap-6">
                        {isSortMenuOpen && (
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mr-2">Sort By</span>
                                {[{ key: 'Date', label: 'Date' }, { key: 'Status', label: 'Status' }, { key: 'Vendor', label: 'Vendor' }].map((o) => (
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
                                <button onClick={() => setIsCategoryOpen(!setIsCategoryOpen)} className={`p-2 rounded-xl transition-all ${isCategoryOpen ? 'bg-(--main-color) text-black shadow-lg' : 'bg-white/5 text-white/40'}`}><Layers size={16} /></button>
                                <button onClick={() => setIsMaterialOpen(!setIsMaterialOpen)} className={`p-2 rounded-xl transition-all ${isMaterialOpen ? 'bg-(--main-color) text-black shadow-lg' : 'bg-white/5 text-white/40'}`}><Box size={16} /></button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className={`shrink-0 z-30 overflow-hidden transition-all duration-300 ${isVendorFilterOpen ? 'h-14 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-2 bg-black/20 backdrop-blur-md border-b border-white/5 overflow-x-auto no-scrollbar">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 mr-4">Vendors</span>
                    <button onClick={() => setVendorFilter('All')} className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all ${vendorFilter === 'All' ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}>All</button>
                    {activeVendors.map(v => <button key={v} onClick={() => setVendorFilter(v)} className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${vendorFilter === v ? 'text-black border-transparent shadow-lg' : 'bg-white/5 border-white/10 text-white/50'}`} style={vendorFilter === v ? { backgroundColor: vendors[v as keyof typeof vendors]?.color || '#ccc' } : {}}>{v}</button>)}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6 pb-20" : "flex flex-col gap-3 pb-20"}>
                    {isLoading ? <div className="col-span-full">Loading...</div> : filteredItems.map(item => <UnifiedInventoryCard key={item.row} item={item} isExpanded={expandedCards.has(String(item.row))} onToggleExpand={() => toggleExpandCard(String(item.row))} exchangeRate={exchangeRate} showFinancials={showFinancials} viewMode={viewMode} partialPayIds={partialPayIds} />)}
                </div>
            </div>

            {mode === 'edit' && editData && (
                <div className="fixed inset-0 z-100 flex flex-col p-8 items-center justify-center animate-in fade-in zoom-in duration-300">
                    {bgMediaUrls.length > 0 && <img key={bgIdx} src={bgMediaUrls[bgIdx]} className="glass-bg-img" />}
                    <div className="glass-scrim" />
                    <div className="max-w-2xl w-full flex flex-col h-full overflow-hidden relative rounded-3xl p-8" style={{ zIndex: 2, background: 'color-mix(in srgb, var(--sidebar-bg) 80%, transparent)', backdropFilter: 'blur(24px)', border: '1px solid white/10' }}>
                        <div className="flex justify-between items-center mb-8 shrink-0">
                            <h2 className="text-3xl font-black text-white">EDIT ITEM</h2>
                            <button onClick={() => setMode('view')} className="text-4xl text-white/20 hover:text-white transition-all">&times;</button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="overflow-y-auto grow custom-scrollbar space-y-8 pr-4">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="flex flex-col gap-1.5"><label className={lbl}>Shape</label><input name="shape" value={editData.shape} onChange={handleEditChange} className={inp} /></div>
                                <div className="flex flex-col gap-1.5"><label className={lbl}>Material</label><input name="material" value={editData.material} onChange={handleEditChange} className={inp} /></div>
                            </div>
                            <div className="flex flex-col gap-1.5"><label className={lbl}>Short Description</label><textarea name="shortDescription" value={editData.shortDescription} onChange={handleEditChange} className={inp + " h-20 resize-none"} /></div>
                            <div className="pt-8 flex gap-6">
                                <button type="button" onClick={() => setMode('view')} className="flex-1 py-4 rounded-2xl bg-white/5 text-[11px] font-black tracking-widest uppercase text-white/30 hover:text-white">Abort</button>
                                <button type="submit" disabled={isSaving} className="flex-[2] py-4 rounded-2xl bg-(--main-color) text-black text-[11px] font-black tracking-widest uppercase">{isSaving ? 'Syncing...' : 'Commit Changes'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
