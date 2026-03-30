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
                    <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.5, s - 0.5)); }} className="text-white/50 hover:text-white text-lg font-bold">−</button>
                    <span className="text-[10px] font-mono text-white/40 w-12 text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.5)); }} className="text-white/50 hover:text-white text-lg font-bold">+</button>
                </div>
            )}
            
            {isVideo ? (
                <video 
                    src={getCleanImageUrl(activeSrc)} 
                    controls 
                    autoPlay 
                    className="max-w-[90vw] max-h-[90vh] shadow-2xl rounded-2xl"
                    onClick={(e) => e.stopPropagation()}
                />
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
        const others = raw.filter(u => u !== main);
        return [main, ...others].filter(Boolean) as string[];
    }, [norm.mediaUrls, norm.generatedPngUrl]);

    const [activeIdx, setActiveIdx] = useState(0);
    const rawImageUrl = mediaUrls[activeIdx] || null;
    const imageUrl = getCleanImageUrl(rawImageUrl);
    const isVideo = rawImageUrl ? isVideoFile(rawImageUrl) : false;

    const handleNextMedia = (e: React.MouseEvent) => { e.stopPropagation(); setActiveIdx(prev => (prev + 1) % mediaUrls.length); };
    const handlePrevMedia = (e: React.MouseEvent) => { e.stopPropagation(); setActiveIdx(prev => (prev - 1 + mediaUrls.length) % mediaUrls.length); };

    const wInch = norm.widthCm ? (parseFloat(String(norm.widthCm)) * 0.393701).toFixed(1) : '';
    const hInch = norm.heightCm ? (parseFloat(String(norm.heightCm)) * 0.393701).toFixed(1) : '';
    const lInch = norm.lengthCm ? (parseFloat(String(norm.lengthCm)) * 0.393701).toFixed(1) : '';
    const dimensionsCm = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('x');
    const dimensionsInch = [wInch, hInch, lInch].filter(Boolean).join('x');
    const dimensionsStr = dimensionsCm ? `${dimensionsCm}cm (${dimensionsInch}")` : '';

    const weightKg = norm.weightKg ? parseFloat(String(norm.weightKg)) : null;
    const weightLbs = weightKg ? (weightKg * 2.20462).toFixed(1) : null;
    const weightStr = weightKg ? `${weightKg}kg (${weightLbs}lbs)` : '';

    const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
    const statusClass = getStatusClass(norm, partialPayIds);

    const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);
    const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
    const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
    const setImageSrc = useSetAtom(ImageSrcAtom);
    const user = useAtomValue(userAtom);
    const isEditable = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor';

    const descLine = [norm.color, norm.material, norm.shape, norm.shortDescription].filter(Boolean).map(s => s.toUpperCase()).join(' · ');

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedItemRow(item.row);
        setSelectedItemData(item.data);
        setImageSrc(imageUrl);
        setDetailsPanelMode('edit');
    };

    const isInternalUser = user?.role === 'Developer' || user?.role === 'Admin';
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to mark this item for deletion? it will be hidden from the inventory.')) return;
        const toastId = toast.loading('Hiding item...');
        try {
            const tableName = item.source === 'production' ? 'production' : 'inventory';
            const { error } = await supabase.from(tableName).update({ is_hidden: true, hidden_reason: 'Marked by user' }).eq('id', item.row);
            if (error) throw error;
            toast.success('Item Hidden', { id: toastId });
            setInventoryVersion(v => v + 1);
        } catch (err: any) {
            toast.error(`Error hiding item: ${err.message}`, { id: toastId });
        }
    };

    const isAlreadyApproved = norm.dispersal_status === 'Approved';
    const handleApprove = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isAlreadyApproved) return;
        const toastId = toast.loading('Marking as Approved...');
        try {
            const { error } = await supabase.from('inventory').update({ dispersal_status: 'Approved', updated_at: new Date().toISOString() }).eq('id', item.row);
            if (error) throw error;
            if (db) {
                try {
                    const lInv = await db.inventory.findOne({ selector: { id: String(item.row) } }).exec();
                    if (lInv) await lInv.patch({ dispersal_status: 'Approved' });
                } catch (e) { console.error(e); }
            }
            toast.success('Item Approved', { id: toastId });
            setInventoryVersion(v => v + 1);
        } catch (err: any) {
            toast.error(`Error: ${err.message}`, { id: toastId });
        }
    };

    if (viewMode === 'list') {
        const itemPriceMXN = Math.ceil(Number(norm.price || 0));
        const itemQuantity = Number(norm.quantity || 1);
        const itemTotalMXN = itemPriceMXN * itemQuantity;
        const payStatus = getStatusClass(norm, partialPayIds);
        const accentColor = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : 'transparent';

        return (
            <div className="flex flex-col gap-0.5">
                {showViewer && imageUrl && <FullscreenImageViewer src={rawImageUrl} mediaUrls={mediaUrls} initialIdx={activeIdx} onClose={() => setShowViewer(false)} />}
                <div className={`flex items-stretch overflow-hidden bg-(--sidebar-bg) border rounded-lg hover:border-white/10 transition-all group shadow-sm cursor-pointer ${isExpanded ? 'ring-1 ring-(--main-color)/30' : ''}`}
                    onClick={onToggleExpand}
                    style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)' }}>
                    {/* Payment status accent stripe */}
                    <div className="w-0.5 shrink-0 self-stretch" style={{ backgroundColor: payStatus ? accentColor : 'transparent', opacity: payStatus ? 0.7 : 0 }} />
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-black/40 relative group/img overflow-hidden ${imageUrl ? 'cursor-pointer' : ''}`}
                        onClick={(e) => { e.stopPropagation(); imageUrl && setShowViewer(true); }}>
                        {imageUrl ? (
                            <>
                                <img src={imageUrl} className="w-full h-full object-cover" />
                                {isVideo && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Video className="w-4 h-4 sm:w-6 sm:h-6" /></div>}
                                {mediaUrls.length > 1 && <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20"><div className="h-full bg-(--main-color)/60 transition-all duration-300" style={{ width: `${((activeIdx + 1) / mediaUrls.length) * 100}%` }} /></div>}
                            </>
                        ) : <div className="w-full h-full p-2 opacity-30 flex items-center justify-center"><OnyxMiniLogo className="w-full h-full object-contain" /></div>}
                        
                        {mediaUrls.length > 1 && (
                            <div className="absolute inset-0 flex items-center justify-between px-1 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none z-20">
                                <button onClick={handlePrevMedia} className="text-white drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] hover:text-(--main-color) pointer-events-auto transition-transform hover:scale-125">
                                    <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                                </button>
                                <button onClick={handleNextMedia} className="text-white drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] hover:text-(--main-color) pointer-events-auto transition-transform hover:scale-125">
                                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-x-auto no-scrollbar flex items-center px-2 sm:px-3 gap-3 min-w-0">
                        <div className="flex flex-col flex-1 min-w-0">
                            {/* Title area: Shape + Optional Description */}
                            <div className="flex items-center gap-2 overflow-hidden truncate">
                                <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                                    {(norm.shape || 'OBJ')}
                                    {(norm.shortDescription && norm.shortDescription !== norm.shape) && (
                                        <span className="opacity-60 font-medium ml-2 text-[10px] sm:text-xs">
                                            {norm.shortDescription}
                                        </span>
                                    )}
                                </h3>
                            </div>
                            
                            {/* Metadata row: Color + Material */}
                            <div className="flex items-center gap-2 mb-auto overflow-hidden">
                                {(norm.color || norm.material) && (
                                    <div className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-black truncate">
                                        {[norm.color, norm.material].filter(Boolean).join(' + ')}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-white/30 pt-1">
                                <span className="truncate">Dim: <span className="text-white/60">{dimensionsStr || '—'}</span></span>
                            </div>
                        </div>

                        <div className="flex flex-col min-w-[70px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Tag ID</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-black text-[10px] sm:text-[11px] font-black uppercase tracking-tight shadow-md w-fit" style={{ backgroundColor: vendorColor }}>
                                {calculated.bookBardcode || 'N/A'}
                            </span>
                        </div>

                        <div className="flex flex-col min-w-[80px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Price / Qty</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xs sm:text-[13px] font-bold text-white">{showFinancials ? `$${itemPriceMXN}` : '***'}</span>
                                <span className="text-[10px] text-white/50 font-mono">x{itemQuantity}</span>
                            </div>
                        </div>

                        <div className="flex flex-col min-w-[80px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Total MXN</span>
                            <span className="text-xs sm:text-[14px] font-black text-(--main-color)">{showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}</span>
                        </div>

                        <div className="flex flex-col min-w-[60px] shrink-0 border-r border-white/5 pr-3 justify-center h-full gap-0.5">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">AQ Code</span>
                            <span className="text-[11px] sm:text-[13px] text-white/80 font-mono">{calculated.bookAqCode || '—'}</span>
                        </div>

                        <div className="flex flex-col min-w-[60px] shrink-0 justify-center h-full gap-0.5">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">LD Code</span>
                            <span className="text-[11px] sm:text-[13px] text-white/80 font-mono">{calculated.bookLandCode || '—'}</span>
                        </div>
                        {payStatus ? (
                            <div className="flex flex-col min-w-[72px] shrink-0 pl-3 justify-center h-full gap-0.5">
                                <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Pay Status</span>
                                <button 
                                    onClick={(e) => {
                                        if (payStatus === 'GREEN' || payStatus === 'YELLOW') {
                                            e.stopPropagation();
                                            setPaymentsArtifactConfig({
                                                isOpen: true,
                                                title: `PAYMENT: ${calculated.bookBardcode || norm.id}`,
                                                itemIds: [calculated.bookBardcode || norm.id],
                                                paymentIds: norm.payment_ids ? norm.payment_ids.split(',').map(id => id.trim()) : undefined
                                            });
                                        }
                                    }}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide w-fit transition-all ${
                                        payStatus === 'GREEN' || payStatus === 'YELLOW' ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                                    }`}
                                    style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}
                                >
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor, boxShadow: `0 0 4px ${accentColor}` }} />
                                    {payStatus === 'GREEN' ? 'Paid' : payStatus === 'YELLOW' ? 'Requested' : 'Partial'}
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col min-w-[72px] shrink-0 pl-3 justify-center h-full gap-0.5">
                                <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none">Status</span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide w-fit border border-[#38bdf8]/30 text-[#38bdf8] bg-[#38bdf8]/5 shadow-[0_0_10px_rgba(56,189,248,0.1)]">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#38bdf8]" />
                                    New
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-2 shrink-0 bg-white/5 border-l border-white/5 backdrop-blur-md">
                        {/* Client Approve button */}
                        {user?.role === 'Client' && (
                            <button
                                onClick={handleApprove}
                                title={isAlreadyApproved ? 'Already Approved' : 'Approve this item'}
                                className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${
                                    isAlreadyApproved
                                        ? 'bg-green-500/15 text-green-400 cursor-default'
                                        : 'bg-white/5 text-white/40 hover:bg-green-500/15 hover:text-green-400'
                                }`}
                            >
                                {isAlreadyApproved ? '✓ Aprd' : 'Approve'}
                            </button>
                        )}
                        {isAlreadyApproved && (
                            <div className="px-2 py-1 rounded-md bg-green-500/15 text-green-400 text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle size={10} strokeWidth={3} />
                                <span>Aprd</span>
                            </div>
                        )}
                    </div>
                </div>
                {isExpanded && (
                    <div 
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                        className="ml-14 mr-2 px-4 pb-4 pt-3 bg-black/30 backdrop-blur-sm border-x border-b border-white/5 rounded-b-2xl animate-in slide-in-from-top-2 duration-300 z-0 relative cursor-pointer hover:bg-black/40 transition-all"
                    >
                        {/* Summary Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3 mb-6">
                            <div><p className={lbl}>Material</p><p className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{norm.material || '—'}</p></div>
                            <div><p className={lbl}>Dimensions</p><p className="text-[11px] font-mono font-bold text-white/70">{dimensionsStr || '—'}</p></div>
                            <div><p className={lbl}>Weight</p><p className="text-[11px] font-mono font-bold text-white/70">{weightStr || '—'}</p></div>
                            <div><p className={lbl}>Status</p><p className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{norm.status}</p></div>
                            <div className="flex flex-col"><span className={lbl}>Landed USD</span><span className="text-sm font-black text-yellow-300 font-mono">{showFinancials ? `$${calculated.bookLanded}` : '***'}</span></div>
                            <div className="flex flex-col"><span className={lbl}>Retail USD</span><span className="text-sm font-black text-green-400 font-mono">{showFinancials ? `$${calculated.bookRetail}` : '***'}</span></div>
                        </div>
                        
                        {/* Mini Gallery Strip in Expanded View */}
                        {mediaUrls.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar">
                                {mediaUrls.map((url, i) => (
                                    <div key={i} 
                                        onClick={() => { setActiveIdx(i); setShowViewer(true); }}
                                        className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 cursor-pointer transition-all ${i === activeIdx ? 'border-(--main-color) scale-105 shadow-lg' : 'border-white/5 opacity-40 hover:opacity-80'}`}>
                                        <img src={getCleanImageUrl(url)} className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="pt-4 mt-2 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                {user?.role === 'Client' && !isAlreadyApproved && (
                                    <button onClick={handleApprove} className="text-green-500/60 hover:text-green-400 transition-all hover:scale-110 active:scale-95" title="Approve Item">
                                        <CheckCircle size={18} strokeWidth={2.5} />
                                    </button>
                                )}
                                {isEditable && (
                                    <button onClick={handleEdit} className="text-(--main-color) opacity-60 hover:opacity-100 transition-all hover:scale-110 active:scale-95" title="Edit Item">
                                        <Pencil size={18} strokeWidth={2.5} />
                                    </button>
                                )}
                            </div>
                            {isInternalUser && (
                                <button onClick={handleDelete} className="text-red-500/40 hover:text-red-500 transition-all hover:scale-110 active:scale-95" title="Delete Item">
                                    <Trash2 size={18} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const accentColor = statusClass === 'GREEN' ? '#22c55e' : statusClass === 'YELLOW' ? '#eab308' : statusClass === 'RED' ? '#ef4444' : 'transparent';

    return (
        <div
            className={`group relative flex flex-col rounded-xl overflow-hidden cursor-pointer bg-(--sidebar-bg) border transition-all duration-400 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/40 ${isExpanded ? 'ring-1 ring-(--main-color)/30' : 'hover:border-(--main-color)/30'}`}
            style={{ borderColor: statusClass ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)' }}
            onClick={onToggleExpand}
        >
            {showViewer && imageUrl && <FullscreenImageViewer src={rawImageUrl} mediaUrls={mediaUrls} initialIdx={activeIdx} onClose={() => setShowViewer(false)} />}

            {/* Image section */}
            <div className="aspect-4/3 relative overflow-hidden bg-black/20 group/img">
                {imageUrl ? (
                    <>
                        <img src={imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
                        {isVideo && (
                           <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                               <div className="p-3 bg-white/20 backdrop-blur-md rounded-full border border-white/30 text-white scale-110 group-hover/img:scale-125 transition-transform duration-500 shadow-2xl">
                                   <Video className="w-10 h-10 fill-white/20" />
                               </div>
                           </div>
                        )}
                        {mediaUrls.length > 1 && (
                            <>
                                <div className="absolute inset-y-0 left-0 w-12 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity z-20 pointer-events-none">
                                    <button onClick={handlePrevMedia} className="text-white drop-shadow-xl hover:text-(--main-color) pointer-events-auto transition-transform hover:scale-125">
                                        <ChevronLeft className="w-8 h-8" />
                                    </button>
                                </div>
                                <div className="absolute inset-y-0 right-0 w-12 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity z-20 pointer-events-none">
                                    <button onClick={handleNextMedia} className="text-white drop-shadow-xl hover:text-(--main-color) pointer-events-auto transition-transform hover:scale-125">
                                        <ChevronRight className="w-8 h-8" />
                                    </button>
                                </div>
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-20 group-hover:translate-y-[-4px] transition-transform duration-300">
                                    {mediaUrls.map((_, i) => (
                                        <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === activeIdx ? 'w-5 bg-(--main-color)' : 'w-1 bg-white/40'}`} />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <OnyxMiniLogo className="w-16 h-16 opacity-10 object-contain" />
                    </div>
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Vendor TAG ID / Status indicator top left */}
                <div className="absolute top-2 left-2 z-10 flex gap-1">
                    {calculated.bookBardcode ? (
                        <div className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-black shadow-lg" style={{ backgroundColor: vendorColor }}>
                            {calculated.bookBardcode}
                        </div>
                    ) : (
                        <div className="h-4 px-1.5 rounded flex items-center justify-center font-black text-black shadow-lg text-[9px]" style={{ backgroundColor: vendorColor }}>{vendorPrefix || '?'}</div>
                    )}
                </div>
            </div>

            {/* Card Body */}
            <div className="p-3.5 flex flex-col gap-2 flex-1 relative">
                <div className="flex justify-between items-start">
                    <div className="truncate pr-2">
                        <div className="font-bold text-sm text-(--text-color) leading-tight truncate w-full flex items-center gap-1.5 pt-1">
                            {(norm.shape || 'OBJ')}
                            <span className="opacity-60 font-medium truncate text-xs">{(norm.shortDescription || norm.material || '')}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 overflow-hidden">
                            {(norm.color || norm.material) && (
                                <div className="text-[9px] text-(--text-color-secondary) uppercase tracking-[0.2em] font-black truncate opacity-40">
                                    {[norm.color, norm.material].filter(Boolean).join(' + ')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Dimensions and Codes */}
                <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-(--text-color-secondary) uppercase tracking-widest mb-0.5 leading-none">DIMENSIONS</span>
                        <span className="text-[10px] font-bold text-white/80 font-mono truncate">{dimensionsStr || 'NO DIM'}</span>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-(--text-color-secondary) uppercase tracking-[0.2em] mb-0.5 leading-none">AQ</span>
                            <span className="text-[10px] font-mono font-black text-(--main-color)/90">{calculated.bookAqCode || 'A—'}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-(--text-color-secondary) uppercase tracking-[0.2em] mb-0.5 leading-none">LD</span>
                            <span className="text-[10px] font-mono font-black text-yellow-500/90">{calculated.bookLandCode || 'L—'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/10">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            {statusClass && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />}
                            <span className="text-[13px] font-black text-(--main-color)">{showFinancials ? `$${Math.ceil(Number(norm?.price || 0))}` : '***'}</span>
                        </div>
                        <span className="text-[9px] font-bold text-white/30 tracking-widest uppercase mt-0.5">COST</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-white/20 px-2 py-0.5 rounded font-mono">x{norm.quantity || 1}</span>
                        {isEditable && (
                            <button onClick={(e) => handleEdit(e)} className="text-white/40 hover:text-(--main-color) transition-all hover:scale-110 active:scale-95" title="Edit Item">
                                <Pencil className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                        )}
                        {isInternalUser && (
                            <button onClick={(e) => handleDelete(e)} className="text-white/20 hover:text-red-500 transition-all hover:scale-110 active:scale-95" title="Delete Item">
                                <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Center Modal Overlay for Grid Card Detail */}
            {isExpanded && createPortal(
                <div className="fixed inset-0 z-90 bg-black/70 backdrop-blur-md animate-in fade-in duration-300 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}>
                    <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 cursor-default"
                        style={{ background: 'color-mix(in srgb, var(--sidebar-bg) 97%, transparent)', backdropFilter: 'blur(40px)', border: '1px solid color-mix(in srgb, var(--text-color) 12%, transparent)' }}
                        onClick={e => e.stopPropagation()}>

                        {/* Modal action bar */}
                        <div className="absolute right-4 top-4 z-101 flex gap-2">
                            {isEditable && (
                                <button onClick={handleEdit} className="h-9 px-4 flex items-center justify-center gap-1.5 bg-(--main-color)/10 hover:bg-(--main-color)/20 border border-(--main-color)/30 rounded-xl text-(--main-color) transition-all text-xs font-black uppercase tracking-widest">
                                    <Edit2 className="w-3.5 h-3.5" /> Edit
                                </button>
                            )}
                            <button onClick={onToggleExpand} className="h-9 px-4 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/80 transition-all text-xs font-black uppercase tracking-widest">
                                <X className="w-3.5 h-3.5" /> Close
                            </button>
                        </div>

                        {/* Modal Image Header — landscape strip */}
                        <div className="h-[38vh] relative shrink-0 group/modalimg bg-black/40">
                            {imageUrl ? (
                                <>
                                    {isVideo ? (
                                        <div className="w-full h-full relative cursor-pointer group" onClick={() => setShowViewer(true)}>
                                            <img src={imageUrl} className="w-full h-full object-cover opacity-60" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white scale-110 group-hover:scale-125 transition-transform duration-500 shadow-2xl">
                                                    <Video className="w-10 h-10 fill-white" />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <img src={imageUrl} onClick={() => setShowViewer(true)} className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                                    )}
                                    
                                    {mediaUrls.length > 1 && (
                                        <>
                                            <div className="absolute inset-y-0 left-0 w-20 flex items-center justify-center opacity-0 group-hover/modalimg:opacity-100 transition-opacity z-20 pointer-events-none">
                                                <button onClick={handlePrevMedia} className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/80 flex items-center justify-center text-white pointer-events-auto border border-white/10 shadow-2xl transition-all hover:scale-110">
                                                    <ChevronLeft className="w-8 h-8" />
                                                </button>
                                            </div>
                                            <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-center opacity-0 group-hover/modalimg:opacity-100 transition-opacity z-20 pointer-events-none">
                                                <button onClick={handleNextMedia} className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/80 flex items-center justify-center text-white pointer-events-auto border border-white/10 shadow-2xl transition-all hover:scale-110">
                                                    <ChevronRight className="w-8 h-8" />
                                                </button>
                                            </div>

                                            {/* Mini Thumbnail Strip for Modal */}
                                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 p-1.5 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl z-20 shadow-2xl scale-90 group-hover/modalimg:scale-100 transition-transform duration-500">
                                                {mediaUrls.map((url, i) => {
                                                    const clean = getCleanImageUrl(url);
                                                    const isVid = isVideoFile(url);
                                                    return (
                                                        <div key={i} 
                                                            onClick={(e) => { e.stopPropagation(); setActiveIdx(i); }}
                                                            className={`w-12 h-12 rounded-xl border-2 transition-all cursor-pointer overflow-hidden leading-none flex items-center justify-center bg-black/20 ${i === activeIdx ? 'border-(--main-color) scale-110 ring-4 ring-(--main-color)/20 shadow-lg' : 'border-white/10 opacity-40 hover:opacity-100'}`}>
                                                            {isVid ? <Video className="w-6 h-6 text-white" /> : <img src={clean} className="w-full h-full object-cover" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </>
                            ) : (
                                <div className="w-full h-full bg-black/40 flex items-center justify-center">
                                    <OnyxMiniLogo className="w-32 h-32 opacity-20" />
                                </div>
                            )}
                            <div className="absolute top-4 left-4 z-101">
                                {calculated.bookBardcode && (
                                    <div className="px-3 py-1.5 rounded-lg border border-black text-black font-black text-xs shadow-lg" style={{ backgroundColor: vendorColor }}>
                                        {calculated.bookBardcode}
                                    </div>
                                )}
                            </div>
                            <div className="absolute inset-0 bg-linear-to-t from-black via-transparent pointer-events-none" />
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-5" style={{ background: 'color-mix(in srgb, var(--background-color) 50%, transparent)' }}>
                            <div>
                                <h3 className="text-2xl font-black text-(--text-color) truncate">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                <p className="text-sm font-bold uppercase text-(--text-color-secondary) tracking-widest mt-1">{(norm.color || '') + ' ' + (norm.material || '')}</p>
                            </div>

                            {/* Codes row */}
                            <div className="flex gap-6">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-black text-(--text-color-secondary) uppercase tracking-widest">AQ Code</span>
                                    <span className="text-lg font-mono font-black text-(--main-color)">{calculated.bookAqCode || '—'}</span>
                                </div>
                                <div className="w-px bg-(--border-color)" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-black text-(--text-color-secondary) uppercase tracking-widest">LD Code</span>
                                    <span className="text-lg font-mono font-black text-yellow-500">{calculated.bookLandCode || '—'}</span>
                                </div>
                            </div>

                            {/* Details grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 p-5 rounded-2xl border border-(--border-color)" style={{ background: 'color-mix(in srgb, var(--text-color) 3%, transparent)' }}>
                                <div><p className="text-[11px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1">Material</p><p className="text-[14px] font-bold text-(--text-color)">{norm.material || '—'}</p></div>
                                <div><p className="text-[11px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1">Dimensions</p><p className="text-[14px] font-bold text-(--text-color) font-mono">{dimensionsStr || '—'}</p></div>
                                <div><p className="text-[11px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1">Weight</p><p className="text-[14px] font-bold text-(--text-color) font-mono">{weightStr || '—'}</p></div>
                                <div><p className="text-[11px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1">Quantity</p><p className="text-[14px] font-bold text-(--text-color) font-mono">{norm.quantity || 1}</p></div>
                            </div>

                            {/* Financial analysis */}
                            <div className="p-5 rounded-2xl border border-(--border-color)" style={{ background: 'color-mix(in srgb, var(--sidebar-bg) 70%, transparent)' }}>
                                <h4 className="text-xs font-black uppercase text-(--text-color-secondary) tracking-[0.2em] mb-4">Financial Analysis</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="flex flex-col"><span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">Acq</span><span className="text-[15px] font-black text-[#6BCEBB] font-mono leading-none">{showFinancials ? `$${Math.ceil(parseFloat(String(norm.price || 0)) / exchangeRate)}` : '***'}</span></div>
                                    <div className="flex flex-col"><span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">Land</span><span className="text-[15px] font-black text-yellow-500 font-mono leading-none">{showFinancials ? `$${calculated.bookLanded}` : '***'}</span></div>
                                    <div className="flex flex-col"><span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">Ret</span><span className="text-[15px] font-black text-green-500 font-mono leading-none">{showFinancials ? `$${calculated.bookRetail}` : '***'}</span></div>
                                </div>
                            </div>

                            {norm.description && (
                                <div className="p-5 rounded-2xl border border-(--border-color)" style={{ background: 'color-mix(in srgb, var(--text-color) 4%, transparent)' }}>
                                    <p className="text-[11px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1">Notes</p>
                                    <p className="text-[15px] text-(--text-color) leading-relaxed">{norm.description}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};



export const UnifiedInventoryView = () => {
    const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
    const t = useTranslation();
    const db = useDatabase();
    const items = useAtomValue(inventoryAtom);
    const financeDocs = useAtomValue(financeDataAtom);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [viewMode, setViewMode] = useAtom(inventoryViewModeAtom);
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isInventoryVendorFilterOpenAtom);
    
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

    const toggleExpandCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const searchTerm = useAtomValue(inventorySearchTermAtom);
    const setGlobalSearchTerm = useSetAtom(inventorySearchTermAtom);
    const [sortOrder, setSortOrder] = useAtom(inventorySortOrderAtom);
    const [sortKey, setSortKey] = useAtom(inventorySortKeyAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const [categoryFilter, setCategoryFilter] = useAtom(inventoryCategoryFilterAtom);
    const [isCategoryOpen, setIsCategoryOpen] = useAtom(isInventoryCategoryFilterOpenAtom);
    const [materialFilter, setMaterialFilter] = useAtom(inventoryMaterialFilterAtom);
    const [isMaterialOpen, setIsMaterialOpen] = useAtom(isInventoryMaterialFilterOpenAtom);
    const [isSortMenuOpen, setIsSortMenuOpen] = useAtom(isInventorySortMenuOpenAtom);

    const setGlobalActiveVendors = useSetAtom(activeVendorsAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const showFinancials = useAtomValue(showFinancialsAtom);

    const [itemData, setItemData] = useAtom(SelectedItemDataAtom);
    const [itemRow, setSelectedItemRow] = useAtom(SelectedItemRowAtom);
    const [mode, setMode] = useAtom(detailsPanelModeAtom);
    const [isSaving, setIsSaving] = useState(false);
    const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const user = useAtomValue(userAtom);
    const setFilteredCount = useSetAtom(filteredInventoryCountAtom);

    const [editData, setEditData] = useState<any>(null);
    const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);
    const rawImageUrl = itemData?.generatedPngUrl || (itemData?.mediaUrls ? itemData.mediaUrls.split(',')[0].trim() : null);
    const imageUrl = getCleanImageUrl(rawImageUrl);

    // Auto-cycling media gallery for bg of edit panel
    const bgMediaUrls = useMemo(() => {
        const urls: string[] = [];
        items.forEach(item => {
            const media: string[] = (item.data as any)._allMedia || [];
            media.filter((u: string) => !u.match(/\.(mp4|webm|ogg|mov)$/i)).forEach((u: string) => urls.push(u));
        });
        return urls.filter(Boolean).map(u => getCleanImageUrl(u)).slice(0, 25);
    }, [items]);
    const [bgIdx, setBgIdx] = useState(0);
    useEffect(() => {
        if (bgMediaUrls.length < 2) return;
        const t = setInterval(() => setBgIdx(i => (i + 1) % bgMediaUrls.length), 6000);
        return () => clearInterval(t);
    }, [bgMediaUrls.length]);

    useEffect(() => {
        if (mode === 'edit' && itemData) {
            setEditData({
                itemNumber: itemData.itemNumber || '',
                shape: itemData.shape || '',
                material: itemData.material || '',
                color: itemData.color || '',
                shortDescription: itemData.shortDescription || itemData.short_description || '',
                description: itemData.description || '',
                weightKg: itemData.weightKg || '',
                widthCm: itemData.widthCm || '',
                heightCm: itemData.heightCm || '',
                lengthCm: itemData.lengthCm || '',
                price: itemData.price || '',
                quantity: itemData.quantity || '1',
                status: itemData.status || 'Available',
                workbook: itemData.workbook || '326',
                itemId: itemData.itemId || itemData.item_id || '',
                generatedDescription: itemData.generatedDescription || '',
                detailedDescription: itemData.detailedDescription || '',
                generatedPngUrl: itemData.generatedPngUrl || '',
                mediaUrls: itemData.mediaUrls || '',
            });
            setNewFiles([]);
        } else {
            setEditData(null);
        }
    }, [mode, itemData]);

    const handleEditChange = (e: any) => {
        const { name, value } = e.target;
        setEditData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const uploaded: UploadedFile[] = [];
        for (const file of files) {
            const type = file.type.startsWith('video/') ? 'video' : 'image';
            const localUrl = await readFileAsDataURL(file, type);
            uploaded.push({ type, localUrl, originalFile: file, tag: 'Item' });
        }
        setNewFiles(prev => [...prev, ...uploaded]);
    };

    const filteredItems = useMemo(() => {
        // 1. Single-pass Filter Logic
        const filtered = items.filter(item => {
            // Global Hidden Filter
            if (item.data.is_hidden) return false;

            // Hide Available / Catalog items — they belong to the Store view
            if (!item.data.status || ['Available', 'available', 'Avaiable', 'Catalog', 'catalog'].includes(item.data.status)) return false;

            const status = getStatusClass(item.data, partialPayIds);
            if (statusFilter !== 'All') {
                if (statusFilter === 'Partial' && status !== 'RED') return false;
                if (statusFilter === 'Requested' && status !== 'YELLOW') return false;
                if (statusFilter === 'Paid' && status !== 'GREEN') return false;
                if (statusFilter === 'New' && status !== null) return false;
            }
            
            const vendorPrefix = item.data.itemId?.split('-')[0] || '';

            // Vendors only see their own items (data isolation)
            if (user?.role === 'Vendor' && vendorPrefix !== user?.name) return false;

            if (vendorFilter !== 'All' && vendorPrefix !== vendorFilter) return false;

            const categoryCombo = `${item.data.shape || ''} ${item.data.shortDescription || item.data.short_description || ''}`.trim();
            if (categoryFilter !== 'All' && categoryCombo !== categoryFilter) return false;

            const materialCombo = `${item.data.color || ''} ${item.data.material || ''}`.trim();
            if (materialFilter !== 'All' && materialCombo !== materialFilter) return false;

            if (searchTerm) {
                const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
                const norm = item.data;
                const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
                const searchableFields = [
                    norm.itemId,
                    norm.itemNumber,
                    norm.color,
                    norm.material,
                    norm.shape,
                    norm.shortDescription,
                    norm.description,
                    norm.widthCm,
                    norm.heightCm,
                    norm.lengthCm,
                    norm.weightKg,
                    calculated.bookAqCode,
                    calculated.bookLandCode,
                    calculated.bookBardcode,
                    norm.status,
                    norm.workbook,
                ].map(v => String(v || '').toLowerCase());
                const searchableString = searchableFields.join(' ');
                if (!terms.every(term => searchableString.includes(term))) return false;
            }
            return true;
        });

        // 2. Sorting Logic
        return filtered.sort((a, b) => {
            // GLOBAL PRIORITY: "New" (blue tagged) items first
            const sA = getStatusClass(a.data, partialPayIds);
            const sB = getStatusClass(b.data, partialPayIds);
            
            if (sA === null && sB !== null) return -1;
            if (sA !== null && sB === null) return 1;

            // SECONDARY PRIORITY: Selected Sort Key
            let comparison = 0;
            if (sortKey === 'Date') {
                comparison = (new Date(b.data.updated_at || b.data.timestamp || 0).getTime()) - (new Date(a.data.updated_at || a.data.timestamp || 0).getTime());
            } else if (sortKey === 'Vendor') {
                const vA = (a.data.itemId || '').split('-')[0];
                const vB = (b.data.itemId || '').split('-')[0];
                comparison = vA.localeCompare(vB);
            } else if (sortKey === 'Status') {
                const weight = (s: any) => s === 'RED' ? 3 : s === 'YELLOW' ? 2 : s === 'GREEN' ? 1 : 0;
                comparison = weight(sB) - weight(sA);
            } else if (sortKey === 'Shape+Type') {
                const comboA = `${a.data.shape || ''} ${a.data.shortDescription || ''}`.trim();
                const comboB = `${b.data.shape || ''} ${b.data.shortDescription || ''}`.trim();
                comparison = comboA.localeCompare(comboB);
            } else if (sortKey === 'Color+Material') {
                const comboA = `${a.data.color || ''} ${a.data.material || ''}`.trim();
                const comboB = `${b.data.color || ''} ${b.data.material || ''}`.trim();
                comparison = comboA.localeCompare(comboB);
            }

            return sortOrder === 'desc' ? comparison : -comparison;
        });
    }, [items, statusFilter, vendorFilter, searchTerm, sortKey, sortOrder, partialPayIds, exchangeRate, user?.role, user?.name, categoryFilter, materialFilter]);

    const updateFileTag = (i: number, tag: 'Item' | 'Lot') => {
        setNewFiles(prev => prev.map((f, idx) => idx === i ? { ...f, tag } : f));
    };

    const removeNewFile = (i: number) => {
        setNewFiles(prev => prev.filter((_, idx) => idx !== i));
    };

    const removeExistingMedia = (index: number) => {
        const currentExtras = editData.mediaUrls ? editData.mediaUrls.split(',').map((u:any) => u.trim()).filter(Boolean) : [];
        const newExtras = currentExtras.filter((_:any, i:number) => i !== index);
        setEditData((prev: any) => ({ ...prev, mediaUrls: newExtras.join(',') }));
    };

    const removeMainImage = () => {
        setEditData((prev: any) => ({ ...prev, generatedPngUrl: '' }));
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!itemRow || !editData) return;
        setIsSaving(true);
        const toastId = toast.loading('Synchronizing...');
        try {
            let uploadedUrls: string[] = [];
            if (newFiles.length > 0) {
                for (const file of newFiles) {
                    if (file.originalFile) {
                        const result = await handleFileUpload(file.originalFile, user);
                        if (result) {
                            const taggedUrl = `${result.thumbnailUrl}${file.tag ? `&tag=${file.tag}` : ''}`;
                            uploadedUrls.push(taggedUrl);
                        }
                    }
                }
            }
            const mediaUrlsStr = [editData.mediaUrls || '', ...uploadedUrls].filter(Boolean).join(',');

            let dbRow: any = {
                item_number: editData.itemNumber,
                shape: editData.shape,
                material: editData.material,
                color: editData.color,
                short_description: editData.shortDescription,
                description: editData.description,
                weight_kg: editData.weightKg ? Number(editData.weightKg) : null,
                height_cm: editData.heightCm ? Number(editData.heightCm) : null,
                width_cm: editData.widthCm ? Number(editData.widthCm) : null,
                length_cm: editData.lengthCm ? Number(editData.lengthCm) : null,
                price_mxn: editData.price ? Number(editData.price) : null,
                quantity: editData.quantity ? Number(editData.quantity) : 1,
                status: editData.status,
                workbook: editData.workbook,
                media_urls: mediaUrlsStr,
                generated_png_url: editData.generatedPngUrl,
                updated_at: new Date().toISOString()
            };

            const tableName = (itemData as any)?.source === 'production' ? 'production' : 'inventory';

            if (tableName === 'inventory') {
                dbRow.item_id = editData.itemId;
                dbRow.generated_description = editData.generatedDescription;
                dbRow.detailed_description = editData.detailedDescription;
            } else {
                // Production specific fields if needed, like vendor_id vs item_id
                dbRow.vendor_id = editData.itemId;
                // remove fields not likely in production table
                delete dbRow.short_description;
                delete dbRow.shape;
                delete dbRow.material;
                delete dbRow.color;
                delete dbRow.weight_kg;
                delete dbRow.height_cm;
                delete dbRow.width_cm;
                delete dbRow.length_cm;
            }
            const { error } = await supabase.from(tableName).update(dbRow).eq('id', itemRow);
            if (error) throw error;
            toast.success('Saved Successfully', { id: toastId });
            setInventoryVersion(v => v + 1);
            setMode('view');
            setSelectedItemRow(null);
            setItemData(null);
        } catch (err: any) {
            toast.error(`Save Error: ${err.message}`, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if (items.length > 0) {
            const vendorsSet = new Set<string>();
            items.forEach(i => {
                const vId = i.data.itemId?.split('-')[0];
                if (vId) vendorsSet.add(vId);
            });
            setGlobalActiveVendors(Array.from(vendorsSet));
            setIsLoading(false);
        } else if (!db) {
            // Wait for DB initialization
            setIsLoading(true);
        } else {
            // DB is ready but items might still be loading in provider
            setIsLoading(items.length === 0);
        }
    }, [items, setGlobalActiveVendors, db]);

    useEffect(() => {
        setFilteredCount(filteredItems.length);
    }, [filteredItems.length, setFilteredCount]);

    const activeVendors = useMemo(() => {
        return Array.from(new Set(items.map(item => item.data.itemId?.split('-')[0]).filter(Boolean))).sort();
    }, [items]);

    const activeCategories = useMemo(() => {
        const combos = new Set<string>();
        items.forEach(i => {
            const combo = `${i.data.shape || ''} ${i.data.shortDescription || i.data.short_description || ''}`.trim();
            if (combo) combos.add(combo);
        });
        return Array.from(combos).sort();
    }, [items]);

    const activeMaterials = useMemo(() => {
        const combos = new Set<string>();
        items.forEach(i => {
            const combo = `${i.data.color || ''} ${i.data.material || ''}`.trim();
            if (combo) combos.add(combo);
        });
        return Array.from(combos).sort();
    }, [items]);

    useEffect(() => {
        setGlobalActiveVendors(activeVendors);
    }, [activeVendors, setGlobalActiveVendors]);

    const totalCount = useMemo(() => {
        return filteredItems.reduce((acc, item) => acc + (parseInt(item.data.quantity) || 1), 0);
    }, [filteredItems]);

    const totalValueMXN = useMemo(() => {
        return filteredItems.reduce((acc, item) => {
            const price = Math.ceil(Number(item.data.price_mxn || item.data.price || 0));
            const quantity = Number(item.data.quantity || 1);
            return acc + (price * quantity);
        }, 0);
    }, [filteredItems]);

    return (
        <div className="flex flex-col h-full overflow-hidden relative m-4 mt-0 gap-0">


            {/* Glass Sub-Header - Redesigned for v1.54.0 */}
            <div className="z-40 flex items-center gap-6 px-6 py-3 shrink-0 backdrop-blur-xl border-b border-white/5 bg-[#0a0a0a]/40">

                <div className="flex flex-col">
                    <div className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-0.5 leading-none">
                        Types
                    </div>
                    <div className="text-xl font-bold text-white leading-none tracking-tighter">
                        {filteredItems.length.toLocaleString('en-US')}
                    </div>
                </div>
                <div className="w-px h-6 bg-white/5" />
                <div className="flex flex-col">
                    <div className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-0.5 leading-none">
                        Count
                    </div>
                    <div className="text-xl font-bold text-[#6BCEBB] leading-none tracking-tighter">
                        {totalCount.toLocaleString('en-US')}
                    </div>
                </div>
                <div className="w-px h-6 bg-white/5" />
                <div className="flex flex-col">
                    <div className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-0.5 leading-none">
                        Total {showFinancials ? 'MXN' : ''}
                    </div>
                    <div className="text-xl font-bold text-(--main-color) leading-none tracking-tighter">
                        {showFinancials ? `$${totalValueMXN.toLocaleString('en-US')}` : '***'}
                    </div>
                </div>

                <div className="ml-auto flex items-center gap-3">
                    {/* Discovery Triggers */}
                    <button 
                        onClick={() => setIsVendorFilterOpen(!isVendorFilterOpen)}
                        className={`p-2 rounded-xl transition-all ${isVendorFilterOpen ? 'bg-(--main-color) text-black shadow-[0_0_15px_rgba(var(--main-color-rgb),0.3)]' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                        title="Vendor Discovery"
                    >
                        <Tag size={18} />
                    </button>
                    <button 
                        onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                        className={`p-2 rounded-xl transition-all ${isSortMenuOpen ? 'bg-(--main-color) text-black shadow-[0_0_15px_rgba(var(--main-color-rgb),0.3)]' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                        title="Sort Control"
                    >
                        <ArrowUpDown size={18} />
                    </button>
                    <div className="w-px h-6 bg-white/5 mx-1" />
                    <button 
                        onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                        className={`p-2 rounded-xl transition-all ${isCategoryOpen ? 'bg-(--main-color) text-black shadow-[0_0_15px_rgba(var(--main-color-rgb),0.3)]' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                        title="Category Discovery"
                    >
                        <Layers size={18} />
                    </button>
                    <button 
                        onClick={() => setIsMaterialOpen(!isMaterialOpen)}
                        className={`p-2 rounded-xl transition-all ${isMaterialOpen ? 'bg-(--main-color) text-black shadow-[0_0_15px_rgba(var(--main-color-rgb),0.3)]' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                        title="Material Discovery"
                    >
                        <Box size={18} />
                    </button>
                </div>
            </div>

            {/* Discovery Panels - Flex Flow (Natural stacking) */}
            
            {/* 1. Vendor Discovery Panel */}
            <div className={`shrink-0 z-30 overflow-hidden transition-all duration-300 ease-in-out ${isVendorFilterOpen ? 'h-14 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-2 overflow-x-auto no-scrollbar bg-black/20 backdrop-blur-md border-b border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 shrink-0 mr-4">Vendors</span>
                    <button
                        onClick={() => setVendorFilter('All')}
                        className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${vendorFilter === 'All' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                        All
                    </button>
                    {activeVendors.map(v => {
                        const color = vendors[v as keyof typeof vendors]?.color || '#ccc';
                        const isActive = vendorFilter === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setVendorFilter(v)}
                                className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${isActive ? 'text-black border-transparent shadow-lg shadow-black/20' : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'}`}
                                style={isActive ? { backgroundColor: color } : { borderColor: color + '40' }}
                            >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                {v}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. Category Discovery Panel */}
            <div className={`shrink-0 z-20 overflow-hidden transition-all duration-300 ease-in-out ${isCategoryOpen ? 'h-14 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-2 overflow-x-auto no-scrollbar bg-black/20 backdrop-blur-md border-b border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 shrink-0 mr-4">Categories</span>
                    <button
                        onClick={() => setCategoryFilter('All')}
                        className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${categoryFilter === 'All' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                        All
                    </button>
                    {activeCategories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${categoryFilter === cat ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. Material Discovery Panel */}
            <div className={`shrink-0 z-10 overflow-hidden transition-all duration-300 ease-in-out ${isMaterialOpen ? 'h-14 opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
                <div className="h-full flex items-center px-6 gap-2 overflow-x-auto no-scrollbar bg-black/20 backdrop-blur-md border-b border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 shrink-0 mr-4">Materials</span>
                    <button
                        onClick={() => setMaterialFilter('All')}
                        className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${materialFilter === 'All' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                        All
                    </button>
                    {activeMaterials.map(mat => (
                        <button
                            key={mat}
                            onClick={() => setMaterialFilter(mat)}
                            className={`shrink-0 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${materialFilter === mat ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                        >
                            {mat}
                        </button>
                    ))}
                </div>
            </div>


            {/* Sort Menu Panel (Vertical Deployable) */}
            <div className={`absolute top-[52px] right-6 z-100 w-48 overflow-hidden transition-all duration-500 ease-out ${isSortMenuOpen ? 'max-h-80 opacity-100 translate-y-0 translate-x-0' : 'max-h-0 opacity-0 -translate-y-4 translate-x-4 pointer-events-none'}`}>
                <div className="m-2 p-2 rounded-2xl bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col gap-1">
                    {[
                        { key: 'Date', label: 'By Date' },
                        { key: 'Status', label: 'By Status' },
                        { key: 'Vendor', label: 'By Vendor' },
                        { key: 'Shape+Type', label: 'By Category' },
                        { key: 'Color+Material', label: 'By Material' }
                    ].map((opt) => (
                        <button
                            key={opt.key}
                            onClick={() => { setSortKey(opt.key as any); setIsSortMenuOpen(false); }}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortKey === opt.key ? 'bg-(--main-color) text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                        >
                            {opt.label}
                            {sortKey === opt.key && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                                    className="p-1 rounded bg-black/20 text-black hover:bg-black/30"
                                >
                                    {sortOrder === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                                </button>
                            )}
                        </button>
                    ))}
                    <div className="h-px bg-white/5 my-1 mx-2" />
                    <div className="px-3 py-2 flex items-center justify-between">
                         <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Order</span>
                         <button 
                            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 text-[9px] font-black text-white/60 hover:text-white transition-all uppercase tracking-tighter"
                         >
                            {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                         </button>
                    </div>
                </div>
            </div>

            {/* Items Area - Flex auto-fill height */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 custom-scrollbar scroll-smooth">

                    <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 pb-20" : "flex flex-col gap-3 pb-20"}>
                        {isLoading ? (
                            <div className="col-span-full">
                                {viewMode === 'grid'
                                    ? <InventorySkeletonGrid />
                                    : <InventorySkeletonList />}
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="col-span-full h-64 flex items-center justify-center text-[10px] font-black uppercase tracking-[0.3em] text-(--text-color-secondary) opacity-40">
                                No items found
                            </div>
                        ) : (
                            filteredItems.map(item => (
                                <UnifiedInventoryCard
                                    key={item.row}
                                    item={item}
                                    isExpanded={expandedCards.has(String(item.row))}
                                    onToggleExpand={() => toggleExpandCard(String(item.row))}
                                    exchangeRate={exchangeRate}
                                    showFinancials={showFinancials}
                                    viewMode={viewMode}
                                    partialPayIds={partialPayIds}
                                />
                            ))
                        )}
                    </div>
                </div>

            {mode === 'edit' && editData && (
                <div className="fixed inset-0 z-100 flex flex-col p-8 items-center justify-center animate-in fade-in zoom-in duration-300">
                    {/* Ken Burns bg gallery */}
                    {bgMediaUrls.length > 0 && (
                        <img
                            key={bgIdx}
                            src={bgMediaUrls[bgIdx]}
                            aria-hidden="true"
                            className="glass-bg-img"
                        />
                    )}
                    {/* Scrim */}
                    <div className="glass-scrim" />
                    <div className="max-w-2xl w-full flex flex-col h-full overflow-hidden relative rounded-3xl p-1" style={{ zIndex: 2, background: 'color-mix(in srgb, var(--sidebar-bg) 80%, transparent)', backdropFilter: 'blur(24px)', border: '1px solid color-mix(in srgb, var(--text-color) 10%, transparent)' }}>
                        <div className="flex justify-between items-center mb-10 shrink-0">
                            <div className="flex items-center gap-5">
                                <div className="p-4 rounded-3xl border border-(--main-color)/20 shadow-lg" style={{ background: 'color-mix(in srgb, var(--main-color) 10%, transparent)' }}><Edit2 className="w-10 h-10 text-(--main-color)" /></div>
                                <div><h2 className="text-3xl font-black text-(--text-color) leading-none tracking-tighter">EDITING ITEM</h2><p className="text-[10px] font-mono font-black text-(--text-color)/30 mt-1.5 uppercase tracking-[0.4em]">{itemData?.itemId}</p></div>
                            </div>
                            <button onClick={() => setMode('view')} className="text-4xl text-(--text-color)/20 hover:text-(--text-color) transition-all hover:rotate-90">&times;</button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="overflow-y-auto grow pr-6 custom-scrollbar space-y-10 pb-12">
                            {/* â”€â”€ Gallery Management â”€â”€ */}
                            <div className="bg-white/2 border border-white/6 rounded-2xl p-6 space-y-6">
                                <h3 className="text-[10px] font-black uppercase text-white/20 tracking-widest leading-none">Manage Gallery</h3>
                                
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {/* Main Image */}
                                    {editData.generatedPngUrl && (
                                        <div className="aspect-square rounded-xl bg-black/40 border-2 border-(--main-color)/30 p-2 relative group overflow-hidden">
                                            <img src={getCleanImageUrl(editData.generatedPngUrl)} className="w-full h-full object-contain" />
                                            <div className="absolute top-1 left-1 bg-(--main-color) text-black text-[7px] font-black px-1.5 py-0.5 rounded leading-none">MAIN</div>
                                            <button type="button" onClick={removeMainImage} className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Existing Additional Media */}
                                    {(editData.mediaUrls ? editData.mediaUrls.split(',').map((u:any)=>u.trim()).filter(Boolean) : []).map((url: string, idx: number) => {
                                        const clean = getCleanImageUrl(url);
                                        const isVid = isVideoFile(url);
                                        return (
                                            <div key={idx} className="aspect-square rounded-xl bg-black/40 border border-white/10 p-2 relative group overflow-hidden">
                                                {isVid ? (
                                                    <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                                                        <Video className="w-8 h-8 text-white" />
                                                        <span className="text-[8px] font-black text-white/40 mt-1">MOV/MP4</span>
                                                    </div>
                                                ) : (
                                                    <img src={clean} className="w-full h-full object-cover" />
                                                )}
                                                <button type="button" onClick={() => removeExistingMedia(idx)} className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="h-px bg-white/5 mx-2" />
                            </div>

                            {/* â”€â”€ Attach Media Section â”€â”€ */}
                            <div className="bg-white/2 border border-white/6 rounded-2xl p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-black uppercase text-white/20 tracking-widest">Attach Media</h3>
                                    <span className="text-[10px] font-mono text-white/10">{newFiles.length} New Files</span>
                                </div>

                                <label className="flex items-center justify-center gap-3 border-2 border-dashed border-white/10 rounded-2xl py-10 cursor-pointer hover:border-(--main-color)/40 hover:bg-white/2 transition-all group">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Upload className="w-6 h-6 text-white/20 group-hover:text-(--main-color)" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white/60">Import New Media</p>
                                            <p className="text-[8px] text-white/10 mt-1 uppercase tracking-wider">Images & Videos Supported</p>
                                        </div>
                                    </div>
                                    <input type="file" className="sr-only" onChange={handleFileChange} accept="image/*,video/*" multiple />
                                </label>

                                {newFiles.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {newFiles.map((f, i) => (
                                            <div key={i} className="flex gap-4 p-4 bg-white/3 border border-white/5 rounded-2xl relative group">
                                                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-black/40">
                                                    {f.type === 'video' ? (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Video className="w-8 h-8 text-white/20" />
                                                        </div>
                                                    ) : (
                                                        <img src={f.localUrl || f.dataUrl} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col justify-between grow min-w-0">
                                                    <div className="flex items-start justify-between">
                                                        <p className="text-[9px] font-bold text-white/20 truncate pr-2">{f.originalFile?.name}</p>
                                                        <button type="button" onClick={() => removeNewFile(i)} className="text-white/10 hover:text-red-400 transition-colors shrink-0">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    <div className="flex gap-1.5 mt-2">
                                                        {['Item', 'Lot'].map((tag) => (
                                                            <button
                                                                key={tag}
                                                                type="button"
                                                                onClick={() => updateFileTag(i, tag as 'Item' | 'Lot')}
                                                                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all
                                                                    ${f.tag === tag
                                                                        ? 'bg-(--main-color) text-black border-(--main-color) shadow-sm'
                                                                        : 'bg-white/3 border-white/10 text-white/20 hover:bg-white/10 hover:text-white/40'}`}
                                                            >
                                                                {tag}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {imageUrl && <div className="h-56 w-full rounded-[2.5rem] overflow-hidden border border-white/5 relative shrink-0 shadow-2xl"><img src={imageUrl} className="w-full h-full object-cover opacity-60" /><div className="absolute inset-0 bg-linear-to-t from-black via-transparent" /><div className="absolute bottom-6 left-8"><p className="text-[10px] font-black uppercase text-(--main-color) tracking-[0.4em] mb-2">Live Preview</p><h3 className="text-2xl font-black text-white tracking-tight">{editData.shape}</h3></div></div>}
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className={lbl}>Status</label><select name="status" value={editData.status} onChange={handleEditChange} className={inp}>
                                    <option value="Available">Available</option>
                                    <option value="Acquisition">Acquisition</option>
                                    <option value="Production">Production</option>
                                    <option value="Acquired">Acquired</option>
                                    <option value="Requested">Requested</option>
                                    <option value="Paid">Paid</option>
                                    <option value="Packed">Packed</option>
                                    <option value="Shipped">Shipped</option>
                                </select></div>
                                <div><label className={lbl}>Vendor ID</label><select name="itemId" value={editData.itemId} onChange={handleEditChange} className={inp}>
                                    <option value="" disabled>Select Vendor...</option>
                                    {Object.keys(vendors).map(v => <option key={v} value={v}>{v}</option>)}
                                </select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className={lbl}>Tag Number</label><input type="text" name="itemNumber" value={editData.itemNumber} onChange={handleEditChange} className={inpNum} /></div>
                                <div><label className={lbl}>Workbook</label><input type="text" name="workbook" value={editData.workbook} onChange={handleEditChange} className={inpNum} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className={lbl}>Quantity</label><input type="number" min="1" step="1" name="quantity" value={editData.quantity} onChange={handleEditChange} className={inpNum} /></div>
                                <div><label className={lbl}>Unit Cost (MXN)</label><input type="number" step="0.01" name="price" value={editData.price} onChange={handleEditChange} className={inpNum} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className={lbl}>Color Tone</label><input type="text" name="color" value={editData.color} onChange={handleEditChange} className={inp} /></div>
                                <div><label className={lbl}>Composition</label><input type="text" name="material" value={editData.material} onChange={handleEditChange} className={inp} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className={lbl}>Geometric Shape</label><input type="text" name="shape" value={editData.shape} onChange={handleEditChange} className={inp} /></div>
                                <div><label className={lbl}>Product Category</label><input type="text" name="shortDescription" value={editData.shortDescription} onChange={handleEditChange} className={inp} /></div>
                            </div>
                            <div><label className={lbl}>Manual Description</label><textarea name="description" value={editData.description} onChange={handleEditChange} rows={3} className={inp + " resize-none leading-relaxed"} /></div>
                            <div><label className={lbl}>Generated Description (Gemini)</label><textarea name="generatedDescription" value={editData.generatedDescription} onChange={handleEditChange} rows={4} className={inp + " resize-none text-[12px] leading-relaxed"} /></div>
                            <div><label className={lbl}>Detailed Description (HTML)</label><textarea name="detailedDescription" value={editData.detailedDescription} onChange={handleEditChange} rows={6} className={inp + " resize-none font-mono text-[11px] leading-relaxed"} /></div>
                            <div className="grid grid-cols-4 gap-6">
                                <div><label className={lbl}>Mass (kg)</label><input type="number" step="0.01" name="weightKg" value={editData.weightKg} onChange={handleEditChange} className={inpNum} /></div>
                                <div><label className={lbl}>W (cm)</label><input type="number" step="0.1" name="widthCm" value={editData.widthCm} onChange={handleEditChange} className={inpNum} /></div>
                                <div><label className={lbl}>H (cm)</label><input type="number" step="0.1" name="heightCm" value={editData.heightCm} onChange={handleEditChange} className={inpNum} /></div>
                                <div><label className={lbl}>L (cm)</label><input type="number" step="0.1" name="lengthCm" value={editData.lengthCm} onChange={handleEditChange} className={inpNum} /></div>
                            </div>

                            <div className="pt-8 border-t border-white/10 flex gap-6">
                                <button type="button" onClick={() => setMode('view')} className="button bg-white/5! border-none! grow py-5! text-[11px] font-black tracking-[0.3em] uppercase opacity-40 hover:opacity-100 transition-all">Abort Changes</button>
                                <button type="submit" disabled={isSaving} className="button bg-(--main-color)! text-black! grow py-5! text-[11px] font-black tracking-[0.3em] uppercase shadow-lg hover:scale-[1.02] active:scale-98 transition-all">{isSaving ? 'UPLOADING...' : 'SAVE MODULE'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
