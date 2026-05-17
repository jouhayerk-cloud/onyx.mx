import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Barcode from 'react-barcode';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
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
    inventoryViewSliderAtom,
    filteredInventoryCountAtom,
    filteredInventoryTotalQtyAtom,
    filteredInventoryTotalValueAtom,
    filteredInventoryIdsAtom,
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
    paymentsArtifactConfigAtom,
    isInventorySelectionModeAtom,
    selectedInventoryIdsAtom,
    inventoryArtifactConfigAtom,
    themeAtom,
    storeShoppingBagAtom,
    isPackingPrintWizardOpenAtom,
    isPackingNFCWizardOpenAtom,
    isPackingCrateWizardOpenAtom,
    isPaymentWizardOpenAtom,
    inventoryStatusSetsAtom,
    isUploadWizardOpenAtom,
    uploadItemDataAtom
} from '../../lib/atoms';
import { useDatabase, useTranslation } from '../../lib/hooks';
import { calculateCodesAndPrices, normalizeInventoryData, handleFileUpload, readFileAsDataURL, getCleanImageUrl, isVideoFile, formatWeightImperial, formatDimensionsImperial, getStatusClass } from '../../lib/utils';
import { InventoryItemData, UploadedFile } from '../../lib/Types';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { InventorySkeletonGrid, InventorySkeletonList } from './InventorySkeleton';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { WireframeIcon } from './InventoryArtifact';
import { X, Edit2, ChevronDown, Menu, Filter, Upload, Video, Pencil, Maximize2, Trash2, ChevronLeft, ChevronRight, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown, Layers, Box, Tag, FileText, CloudUpload, Check, Share2, Copy, LayoutList, LayoutGrid, Layout, QrCode, ScanBarcode, Printer, Nfc, Package, CreditCard, Link } from 'lucide-react';


const lbl = "text-[11px] font-black text-(--text-color) opacity-30 uppercase tracking-[0.2em] block ml-1 opacity-60 mb-2";
const inp = "h-12 w-full px-4 bg-(--text-color)/[0.04] border border-(--text-color)/12 rounded-2xl text-sm text-(--text-color) placeholder-(--text-color)/30 outline-none focus:border-(--main-color)/50 focus:bg-(--text-color)/[0.08] transition-all";
const inpNum = inp + " font-mono text-center";

const FullscreenImageViewer = ({ src, mediaUrls = [], initialIdx = 0, onClose }: { src: string; mediaUrls?: string[]; initialIdx?: number; onClose: () => void }) => {
    const [currentIdx, setCurrentIdx] = useState(initialIdx);
    const activeSrc = mediaUrls.length > 0 ? mediaUrls[currentIdx] : src;
    const isVideo = isVideoFile(activeSrc);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Touch Swipe State
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const minSwipeDistance = 50;

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

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd || scale > 1) return; // Disable swipe when zoomed
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        
        if (isLeftSwipe) nav(1);
        if (isRightSwipe) nav(-1);
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-10000 bg-black/98 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300" 
            onClick={onClose} 
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <button onClick={onClose} className="absolute top-8 right-8 z-10 w-12 h-12 rounded-full bg-(--text-color)/5 border border-(--text-color)/10 flex items-center justify-center text-(--text-color) opacity-30 hover:opacity-100 hover:bg-(--text-color)/10 transition-all">
                <X className="w-6 h-6" />
            </button>
            {mediaUrls.length > 1 && (
                <div className="absolute inset-0 flex items-center justify-between px-8 pointer-events-none">
                    <button onClick={(e) => { e.stopPropagation(); nav(-1); }} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 hidden sm:flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all pointer-events-auto"><ChevronLeft size={32} /></button>
                    <button onClick={(e) => { e.stopPropagation(); nav(1); }} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 hidden sm:flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all pointer-events-auto"><ChevronRight size={32} /></button>
                </div>
            )}
            {isVideo ? (
                <video src={getCleanImageUrl(activeSrc)} controls autoPlay className="max-w-[90vw] max-h-[90vh] shadow-2xl rounded-2xl" onClick={(e) => e.stopPropagation()} />
            ) : (
                <img src={getCleanImageUrl(activeSrc)} alt="" draggable={false}
                    key={currentIdx}
                    className="max-w-[90vw] max-h-[90vh] object-contain select-none transition-transform animate-in fade-in zoom-in-95 duration-300"
                    style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                />
            )}
        </div>
, document.body
    );
};

const UnifiedInventoryCard = ({ item, isExpanded = 0, onToggleExpand, exchangeRate, showFinancials, viewMode, partialPayIds, fullPayIds, requestedAcqIds, onEdit, financeDocs, deployedItemsMap }: any) => {
    const isSelectionMode = useAtomValue(isInventorySelectionModeAtom);
    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    const theme = useAtomValue(themeAtom);
    const qrColor = (theme === 'nacar' || theme === 'aqua') ? '#000000' : '#FFFFFF';
    
    // Store Bag Implementation
    const [bag, setBag] = useAtom(storeShoppingBagAtom);
    const inBag = bag.some((b: any) => b.row === item.row);
    const handleToggleBag = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (inBag) {
            setBag(bag.filter((b: any) => b.row !== item.row));
            toast.error('Removed from Store Bag', { icon: '🗑️' });
        } else {
            setBag([...bag, item]);
            toast.success('Added to Store Bag', { style: { background: 'var(--main-color)', color: '#000' }, icon: '🛍️' });
        }
    };

    const handleToggleSelection = (id: string | number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };
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
    const payStatus = getStatusClass(norm, partialPayIds, fullPayIds, requestedAcqIds);
    const col = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : 'transparent';
    const accentColor = col;

    // Derive deployed status from crates data (independent of payment)
    const itemKey = String(item.row ?? item.data?.id ?? '');
    const deployedInfo = deployedItemsMap?.get(itemKey) || null;

    const itemPriceMXN = Math.round(Number(norm.price || 0));
    const itemTotalMXN = itemPriceMXN * Number(norm.quantity || 1);

    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    const getPayLabel = () => {
        if (!payStatus) return 'New';
        if (payStatus === 'GREEN') return 'Paid';
        if (payStatus === 'YELLOW') return 'Requested';
        if (payStatus === 'RED') {
            const isProd = String(norm.status || item.status || item.source || '').toLowerCase().includes('production');
            return isProd ? 'Advance' : 'Partial';
        }
        if (payStatus === 'BLUE') return 'NEW';
        return 'New';
    };

    const itemPayments = useMemo(() => {
        if (!isExpanded || !financeDocs) return [];
        return financeDocs.filter((d: any) => {
            const rel = d.related_ids || d.related_inventory_ids || '';
            let relArray: string[] = [];
            if (Array.isArray(rel)) relArray = rel.map(id => String(id));
            else if (typeof rel === 'string') relArray = rel.split(',').map(s => s.trim()).filter(Boolean);
            return relArray.includes(String(item.data.id));
        }).sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    }, [isExpanded, financeDocs, item.data.id]);

    const renderPaymentHistory = () => {
        if (!itemPayments || itemPayments.length === 0) return null;
        return (
            <div className="col-span-full pt-6 mt-2 border-t border-(--border-color) space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color) opacity-40 mb-3 ml-1">Payment History (MXN)</h4>
                <div className="flex flex-col gap-2">
                    {itemPayments.map((p: any) => {
                        const net = p.amount || 0;
                        const fees = p.commission || 0;
                        const total = net + fees;
                        const format = (val: number) => showFinancials ? `$${val.toLocaleString('en-US')}` : '***';

                        return (
                            <div key={p.id} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 p-3 rounded-xl bg-(--text-color)/5 border border-(--border-color) transition-all hover:bg-(--text-color)/10">
                                <div className="flex flex-col min-w-[120px]">
                                    <span className="text-[11px] text-(--text-color) font-bold tracking-tight">{p.date ? new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date'}</span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${p.status === 'Paid' ? 'text-green-400' : p.status === 'Requested' ? 'text-yellow-400' : 'text-sky-400'}`}>{p.status || 'New'}</span>
                                </div>
                                <div className="flex items-center gap-6 sm:gap-12 w-full sm:w-auto no-scrollbar justify-between sm:justify-end">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-(--text-color) opacity-30 mb-0.5">Net Paid</span>
                                        <span className="text-[11px] font-mono font-bold text-(--text-color) opacity-80">{format(net)}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-(--text-color) opacity-30 mb-0.5">Taxes/Fees</span>
                                        <span className="text-[11px] font-mono font-bold text-red-400 opacity-80">{format(fees)}</span>
                                    </div>
                                    <div className="flex flex-col items-end border-l border-(--border-color) pl-6 sm:pl-12 min-w-[100px]">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-(--main-color) opacity-50 mb-0.5">Total</span>
                                        <span className="text-[13px] font-mono font-black text-(--main-color)">{format(total)}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

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
        return (
            <div className="flex flex-col gap-0.5">
                {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} mediaUrls={mediaUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
                <div className={`flex items-stretch overflow-hidden bg-(--sidebar-bg) border rounded-md hover:border-white/10 transition-all group shadow-sm cursor-pointer ${isExpanded > 0 ? 'ring-1 ring-(--main-color)/30' : ''}`}
                    onClick={() => onToggleExpand()} style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)' }}>
                    
                    {/* Selection Checkbox */}
                    {isSelectionMode && (
                        <div 
                            className="w-10 shrink-0 flex items-center justify-center border-r border-white/5 bg-white/[0.02] hover:bg-white/5 transition-all"
                            onClick={(e) => { e.stopPropagation(); handleToggleSelection(item.row ?? item.data?.id); }}
                        >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedIds.includes(item.row ?? item.data?.id) ? 'bg-(--main-color) border-(--main-color)' : 'border-white/20'}`}>
                                {selectedIds.includes(item.row ?? item.data?.id) && <Check size={14} className="text-black" strokeWidth={4} />}
                            </div>
                        </div>
                    )}

                    <div className="w-0.5 shrink-0 self-stretch" style={{ backgroundColor: payStatus ? accentColor : 'transparent', opacity: payStatus ? 0.7 : 0 }} />
                    <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-black/40 relative overflow-hidden group/listimg isolate" 
                        onMouseEnter={() => setIsHoveringCard(true)} onMouseLeave={() => { setIsHoveringCard(false); setCardIdx(0); }}
                        onClick={(e) => { e.stopPropagation(); if (mediaUrls.length > 1) { setCardIdx(p => (p + 1) % mediaUrls.length); } }}
                        onTouchStart={(e) => { e.stopPropagation(); setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }}
                        onTouchMove={(e) => { e.stopPropagation(); setTouchEnd(e.targetTouches[0].clientX); }}
                        onTouchEnd={(e) => {
                            e.stopPropagation();
                            if (!touchStart || !touchEnd) return;
                            const dist = touchStart - touchEnd;
                            if (dist > 30) setCardIdx(p => (p + 1) % mediaUrls.length);
                            if (dist < -30) setCardIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length);
                        }}>
                        {mediaUrls[cardIdx] ? <img key={cardIdx} src={getCleanImageUrl(mediaUrls[cardIdx])} className="w-full h-full object-cover animate-in fade-in duration-700" /> : <div className="w-full h-full opacity-60 flex items-center justify-center mix-blend-screen scale-[1.3]"><WireframeIcon item={norm} color={accentColor} /></div>}
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
                    <div className="flex-1 flex items-center px-4 gap-8 min-w-0 overflow-x-auto no-scrollbar relative pr-10 lg:pr-16">
                        <div className="flex flex-col shrink-0 min-w-[140px] py-1">
                            <div className="flex items-baseline gap-3">
                                <h3 className="text-base font-black text-(--text-color) uppercase tracking-tight whitespace-nowrap">{norm.shape || 'OBJ'} {norm.shortDescription && <span className="opacity-40 font-black ml-1 text-[11px] uppercase tracking-widest">{norm.shortDescription}</span>}</h3>
                                <span className="text-base font-black text-(--main-color) font-mono">x{norm.quantity || 1}</span>
                            </div>
                            <div className="text-[11px] text-(--text-color)/60 uppercase tracking-[0.2em] font-black whitespace-nowrap">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                        </div>
                        <div className="flex flex-col min-w-[100px] shrink-0 justify-center">
                            <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    navigator.clipboard.writeText(calculated.bookBarcode); 
                                    toast.success(`Tag ID Copied: ${calculated.bookBarcode}`, { icon: '📋' }); 
                                }}
                                className="inline-flex items-center px-3 py-1 rounded text-black text-[14px] font-black uppercase tracking-tight shadow-lg w-fit hover:scale-105 active:scale-95 transition-all" 
                                style={{ backgroundColor: vendorColor }}
                            >
                                {calculated.bookBarcodeDisplay || 'N/A'}
                            </button>
                        </div>
                        <div className="flex flex-col min-w-[140px] shrink-0"><span className="text-[10px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none">Size / Weight</span><div className="flex flex-col gap-0.5"><span className="text-[11px] font-mono text-(--text-color)/60">{dimensionsStr || '—'}</span><span className="text-[11px] font-mono text-(--text-color)/40">{weightStr || '—'}</span></div></div>
                        <div className="flex flex-col min-w-[90px] shrink-0"><span className="text-[10px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none">Price / Qty</span><div className="flex items-baseline gap-2"><span className="text-sm font-bold text-(--text-color)">{showFinancials ? `$${itemPriceMXN}` : '***'}</span></div></div>
                        <div className="flex flex-col min-w-[90px] shrink-0"><span className="text-[10px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none">Total MXN</span><span className="text-sm font-black text-(--main-color)">{showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}</span></div>
                        <div className="flex flex-col min-w-[70px] shrink-0"><span className="text-[10px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none">AQ Code</span><span className="text-[13px] text-(--text-color)/80 font-mono">{calculated.bookAqCode || '—'}</span></div>
                        <div className="flex flex-col min-w-[70px] shrink-0"><span className="text-[10px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none">LD Code</span><span className="text-[13px] text-yellow-500/80 font-mono">{calculated.bookLandCode || '—'}</span></div>
                        <div className="flex flex-col min-w-[90px] shrink-0 ml-auto items-end pr-4 gap-1">
                            <span className="text-[10px] font-black text-(--text-color)/30 uppercase tracking-widest leading-none mb-1">Status</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wide w-fit" style={{ color: accentColor || '#38bdf8', backgroundColor: accentColor ? `color-mix(in srgb, ${accentColor} 12%, transparent)` : '#38bdf810' }}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor || '#38bdf8' }} />
                                {getPayLabel()}
                            </span>
                            {deployedInfo && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide w-fit bg-teal-500/10 border border-teal-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                                    <span className="text-teal-400">
                                        {deployedInfo.manifestId
                                            ? deployedInfo.manifestId.replace('TRK-', 'TRK·')
                                            : `TRK·${new Date(deployedInfo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}`
                                        }
                                    </span>
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 border-l border-white/5 pl-4 ml-2 opacity-10">
                             {/* Expanded via row click */}
                        </div>
                    </div>
                </div>
                {isExpanded > 0 && (
                    <div className="w-full px-4 md:px-10 pb-6 pt-4 bg-black/30 backdrop-blur-sm border-t border-white/5 animate-in slide-in-from-top-2 duration-300 overflow-x-auto custom-scrollbar min-w-0">
                        {/* List View Thumbnail Gallery */}
                        {mediaUrls.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-6 shrink-0 mb-6">
                                {mediaUrls.map((u, i) => (
                                    <div key={i} onClick={(e) => { e.stopPropagation(); setViewerIdx(i); setShowViewer(true); }}
                                        className="w-16 h-16 rounded-xl bg-black/40 border border-white/5 overflow-hidden shrink-0 cursor-pointer hover:border-(--main-color)/50 transition-all group/thumb relative">
                                        <img src={getCleanImageUrl(u)} className="w-full h-full object-cover opacity-60 group-hover/thumb:opacity-100 transition-all" />
                                        {isVideoFile(u) && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/40 group-hover/thumb:text-white transition-all"><Video size={14} /></div>}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-2 min-w-fit">
                            <div><p className={lbl}>Dimensions</p><p className="text-[11px] font-mono text-(--text-color)/70">{dimensionsStr || '—'}</p></div>
                            <div><p className={lbl}>Weight</p><p className="text-[11px] font-mono text-(--text-color)/70">{weightStr || '—'}</p></div>
                            <div><p className={lbl}>Landed USD</p><p className="text-sm font-black text-yellow-300 font-mono">{showFinancials ? `$${calculated.bookLanded}` : '***'}</p></div>
                            <div><p className={lbl}>Retail USD</p><p className="text-sm font-black text-green-400 font-mono">{showFinancials ? `$${calculated.bookRetail}` : '***'}</p></div>
                        </div>
                        {/* Consolidated Artifact Identity Hub - List View */}
                        {isExpanded >= 2 && (
                            <div className="col-span-full animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex flex-col sm:flex-row items-center justify-center gap-12 sm:gap-20 w-full lg:px-20 min-w-fit">
                                    {/* Barcode Panel - High Density White */}
                                    <div className="w-full max-w-md mx-auto bg-white rounded-none p-2 shadow-xl border border-black/10 flex flex-col gap-2 overflow-hidden relative group/hub hover:shadow-lg transition-all duration-500">
                                        <div className="flex items-center justify-between px-1">
                                            <div className="flex items-center gap-1">
                                                <div className="w-1 h-1 rounded-none bg-black/20" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-1.5 py-0.5 rounded-none text-black text-[8px] font-black uppercase tracking-widest border border-black/5" style={{ backgroundColor: vendorColor }}>
                                                    {calculated.bookBarcode}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-center p-1 bg-white border border-black/5 rounded-none transition-all grayscale group-hover/hub:grayscale-0 overflow-hidden w-full">
                                            <Barcode 
                                                value={calculated.bookBarcode || 'N/A'} 
                                                format="CODE39" 
                                                width={4} 
                                                height={100} 
                                                displayValue={false}
                                                margin={0}
                                            />
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-(--main-color) opacity-20" />
                                    </div>

                                    {/* Free-Floating QR - SVG Theme Colored */}
                                    <div className="flex-none p-4 relative group/qr scale-90 sm:scale-100">
                                        <QRCodeSVG 
                                            value={`https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${calculated.bookBarcode}`}
                                            size={200}
                                            level="H"
                                            includeMargin={false}
                                            fgColor={qrColor}
                                            bgColor="transparent"
                                        />
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[7px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.3em]">Identity Hub</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Action Toolbar */}
                        <div className="flex items-center gap-6 col-span-full pt-8 mt-4 border-t border-white/5">
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleExpand(2);
                                }}
                                className={`p-2 -m-2 transition-all flex items-center gap-2 group ${isExpanded === 2 ? 'text-(--main-color)' : 'text-(--main-color)/60 hover:text-(--main-color)'}`}
                                title={isExpanded === 2 ? "Hide Identity Hub" : "Show Identity Hub (Barcode/QR)"}
                            >
                                <ScanBarcode size={18} strokeWidth={2} />
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Artifact Hub</span>
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(`https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${calculated.bookBarcode}`);
                                    toast.success('Trace Link Copied');
                                }}
                                className="p-2 -m-2 text-(--main-color)/60 hover:text-(--main-color) transition-all flex items-center gap-2 group"
                                title="Copy Trace Link"
                            >
                                <Copy size={18} strokeWidth={2} />
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Copy Link</span>
                            </button>
                            {isEditable && (
                                <button onClick={handleEdit} className="p-2 -m-2 text-(--main-color)/60 hover:text-(--main-color) transition-all flex items-center gap-2 group" title="Edit Item">
                                    <Pencil size={18} strokeWidth={2} />
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                                </button>
                            )}
                            {isInternalUser && (
                                <button onClick={handleDelete} className="p-2 -m-2 text-red-500/60 hover:text-red-500 transition-all flex items-center gap-2 group" title="Remove Artifact">
                                    <Trash2 size={18} />
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Delete</span>
                                </button>
                            )}
                        </div>
                        {renderPaymentHistory()}
                    </div>
                )}
            </div>
        );
    }


    const FullscreenModal = !!isExpanded && viewMode !== 'list' && createPortal(
        <div className="fixed inset-0 z-90 bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => onToggleExpand()}>
            <div className="relative w-full max-w-6xl bg-[#0e0e0e] rounded-[40px] overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[90vh]" onClick={e=>e.stopPropagation()}>
                <div className="absolute top-6 right-6 z-10 flex gap-2">
                    {isEditable && <button onClick={handleEdit} className="h-10 px-4 rounded-xl bg-(--main-color)/20 text-(--main-color) text-[10px] font-black uppercase tracking-widest hover:bg-(--main-color) hover:text-black transition-all">Edit Item</button>}
                    <button onClick={() => onToggleExpand()} className="h-10 px-4 rounded-xl bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all">Close</button>
                </div>
                <div className="h-72 sm:h-96 bg-black relative shrink-0 group/hero isolate">
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
                    ) : <div className="w-full h-full flex items-center justify-center opacity-80 mix-blend-screen scale-[1.5]"><WireframeIcon item={norm} color={accentColor} /></div>}
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
                    <div><h3 className="text-3xl font-black text-white tracking-tighter uppercase mb-1">{norm.shape || 'OBJ'} {norm.shortDescription}</h3><p className="text-[13px] font-bold text-white/50 uppercase tracking-[0.3em] font-mono">{norm.color} {norm.material}</p></div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 p-8 rounded-[32px] bg-white/2 border border-white/5">
                        <div><p className={lbl}>AQ Code</p><p className="text-2xl font-mono font-black text-(--main-color)">{calculated.bookAqCode || '—'}</p></div>
                        <div><p className={lbl}>LD Code</p><p className="text-2xl font-mono font-black text-yellow-500">{calculated.bookLandCode || '—'}</p></div>
                        <div><p className={lbl}>Acq. MXN</p><p className="text-2xl font-black text-green-400">{showFinancials ? `$${itemPriceMXN}` : '***'}</p></div>
                        <div><p className={lbl}>Acq. USD</p><p className="text-2xl font-black text-cyan-400">{showFinancials ? `$${calculated.bookAcquisition}` : '***'}</p></div>
                        <div><p className={lbl}>Landed USD</p><p className="text-2xl font-black text-yellow-300">{showFinancials ? `$${calculated.bookLanded}` : '***'}</p></div>
                        <div><p className={lbl}>Retail USD</p><p className="text-2xl font-black text-[#6BCEBB]">{showFinancials ? `$${calculated.bookRetail}` : '***'}</p></div>
                        <div><p className={lbl}>Dimensions</p><p className="text-[15px] font-mono font-bold text-white/50">{dimensionsStr || '—'}</p></div>
                        <div><p className={lbl}>Weight</p><p className="text-[15px] font-mono font-bold text-white/50">{weightStr || '—'}</p></div>
                        <div className="col-span-full border-t border-white/5 pt-6 flex items-center justify-between">
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(`https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${calculated.bookBarcode}`);
                                    toast.success('Trace Link Copied');
                                }}
                                className="flex items-center gap-2 h-10 px-4 rounded-xl bg-(--main-color)/10 text-(--main-color) hover:bg-(--main-color) hover:text-black transition-all text-[10px] font-black uppercase tracking-widest"
                                title="Copy Trace Link"
                            >
                                <Copy size={16} /> COPY TRACE LINK
                            </button>
                            {isInternalUser && (
                                <button onClick={handleDelete} className="flex items-center gap-2 h-10 px-4 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"><Trash2 size={16} /> REMOVE ARTIFACT</button>
                            )}
                        </div>
                    </div>
                    {/* Consolidated Artifact Identity Hub - Modal View */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row items-center gap-8 justify-center">
                            {/* Barcode Panel - Modal Scale */}
                            <div className="flex-none bg-white rounded-none p-1.5 shadow-2xl border border-black/10 flex flex-col gap-1.5 overflow-hidden relative group/hub hover:shadow-xl transition-all duration-500 w-full sm:w-64">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-none bg-black/20" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                navigator.clipboard.writeText(calculated.bookBarcode); 
                                                toast.success(`Tag ID Copied: ${calculated.bookBarcode}`, { icon: '📋' }); 
                                            }}
                                            className="px-2.5 py-1 rounded-none text-black text-[10px] font-black uppercase tracking-[0.2em] border border-black/5 hover:scale-105 active:scale-95 transition-all" 
                                            style={{ backgroundColor: vendorColor }}
                                        >
                                            {calculated.bookBarcodeDisplay}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-center p-1.5 bg-white border border-black/5 rounded-none transition-all grayscale group-hover/hub:grayscale-0 overflow-hidden w-full">
                                    <Barcode 
                                        value={calculated.bookBarcode || 'N/A'} 
                                        format="CODE39" 
                                        width={1.6} 
                                        height={50} 
                                        displayValue={false}
                                        margin={0}
                                    />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-(--main-color) opacity-25" />
                            </div>

                            {/* Free-Floating Modal QR - SVG Theme Colored */}
                            <div className="flex-none p-4 relative group/modal-qr">
                                <QRCodeSVG 
                                    value={`https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${calculated.bookBarcode}`}
                                    size={150}
                                    level="H"
                                    includeMargin={false}
                                    fgColor={qrColor}
                                    bgColor="transparent"
                                />
                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-black text-(--main-color) opacity-30 uppercase tracking-[0.4em] whitespace-nowrap">Secure Identity Artifact</div>
                            </div>
                        </div>
                    </div>
                    {renderPaymentHistory()}
                </div>
            </div>
        </div>, document.body
    );

    if (viewMode === 'gallery') {
        return (
            <>
            <div className={`group relative flex flex-col rounded-md overflow-hidden cursor-pointer bg-(--sidebar-bg) border transition-all duration-400 hover:-translate-y-1 hover:shadow-2xl ${isExpanded > 0 ? 'ring-2 ring-(--main-color)/40' : 'hover:border-(--main-color)/30'}`}
                 style={{ borderColor: payStatus ? `color-mix(in srgb, ${col} 35%, var(--border-color))` : 'var(--border-color)' }} onClick={() => onToggleExpand()}>
                
                {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} mediaUrls={mediaUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
                
                {(() => {
                    const total = mediaUrls.length;
                    const displayCount = 24;
                    const visibleUrls = mediaUrls.slice(0, displayCount);
                    const remaining = total - displayCount;
                    
                    // Dynamic Grid Configuration - Fixed Aspect Ratio for few images (Landscape/Portrait)
                    if (total === 1) {
                        return (
                            <div className="relative w-full bg-black/40 overflow-hidden cursor-pointer"
                                 onClick={(e) => { e.stopPropagation(); setViewerIdx(0); setShowViewer(true); }}>
                                <img src={getCleanImageUrl(visibleUrls[0])} className="w-full h-auto max-h-[800px] object-contain transition-transform duration-1000 hover:scale-105" />
                                {isVideoFile(visibleUrls[0]) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={32} className="text-white/60" /></div>}
                            </div>
                        );
                    }
                    
                    if (total <= 3) {
                        return (
                            <div className={`grid gap-px bg-black/40 ${total === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                {visibleUrls.map((url, i) => (
                                    <div key={i} className="relative overflow-hidden cursor-pointer bg-black/20"
                                         onClick={(e) => { e.stopPropagation(); setViewerIdx(i); setShowViewer(true); }}>
                                        <img src={getCleanImageUrl(url)} className="w-full h-auto max-h-[700px] object-contain transition-transform duration-1000 hover:scale-110" />
                                        {isVideoFile(url) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={24} className="text-white/60" /></div>}
                                    </div>
                                ))}
                            </div>
                        );
                    }

                    const gridCols = total <= 6 ? 'grid-cols-3' : total <= 12 ? 'grid-cols-4 md:grid-cols-4' : 'grid-cols-4 md:grid-cols-6';

                    return (
                        <div className={`grid gap-px bg-black/40 ${gridCols}`} style={{ aspectRatio: total > 6 ? (total > 18 ? 'auto' : '16/9') : '4/3' }}>
                            {visibleUrls.map((url, i) => (
                                <div key={i} className={`relative overflow-hidden group/galimg aspect-square cursor-pointer`}
                                     onClick={(e) => { e.stopPropagation(); setViewerIdx(i); setShowViewer(true); }}>
                                    <img src={getCleanImageUrl(url)} className="w-full h-full object-cover transition-transform duration-700 group-hover/galimg:scale-110" />
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

                <div className="p-5 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                             <div className="flex items-center gap-2">
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        navigator.clipboard.writeText(calculated.bookBarcode); 
                                        toast.success(`Tag ID Copied: ${calculated.bookBarcode}`, { icon: '📋' }); 
                                    }}
                                    className="px-3 py-1.5 rounded text-black text-[13px] font-black uppercase shadow-lg w-fit hover:scale-105 active:scale-95 transition-all" 
                                    style={{ backgroundColor: vendorColor }}
                                >
                                    {calculated.bookBarcodeDisplay || vendorPrefix || 'N/A'}
                                </button>
                                <div className="flex gap-1">
                                     <div className="px-1.5 py-1 rounded bg-white/5 border border-white/10 text-[8px] font-black text-white/40 uppercase tracking-widest">{calculated.bookAqCode}</div>
                                     <div className="px-1.5 py-1 rounded bg-white/5 border border-white/10 text-[8px] font-black text-white/40 uppercase tracking-widest">{calculated.bookLandCode}</div>
                                </div>
                             </div>
                             <h3 className="text-2xl font-black text-(--text-color) uppercase tracking-tighter leading-tight mt-1.5 truncate">
                                 {norm.shape || 'OBJECT'} 
                                 <span className="text-[12px] font-black text-(--text-color)/30 uppercase tracking-[0.25em] ml-2">{norm.shortDescription}</span>
                             </h3>
                             <div className="text-[12px] text-(--text-color)/70 uppercase tracking-widest font-black mt-1.5">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                        </div>
                        <div className="flex flex-col items-end ml-4 shrink-0">
                            <span className="text-[11px] font-black text-(--text-color)/40 uppercase tracking-[0.3em] mb-1">TOTAL MXN</span>
                            <span className="text-3xl font-mono font-black text-(--main-color) whitespace-nowrap leading-none">
                                {showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}
                            </span>
                            <div className="flex items-center gap-2 mt-2.5">
                                <span className="text-[12px] font-black text-(--text-color)/40 uppercase tracking-[0.3em]">QTY {norm.quantity || 1}</span>
                                <span className="w-px h-3 bg-white/10" />
                                <span className="text-[12px] font-mono font-bold text-(--text-color)/60">{showFinancials ? `$${itemPriceMXN.toLocaleString()}` : '***'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 py-3 border-y border-white/5">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-black text-(--text-color)/20 uppercase tracking-[0.15em]">Dimensions</span>
                            <span className="text-[12px] font-mono text-(--text-color)/60">{dimensionsStr || '—'}</span>
                        </div>
                        <div className="w-px h-6 bg-white/5" />
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-black text-(--text-color)/20 uppercase tracking-[0.15em]">Weight</span>
                            <span className="text-[12px] font-mono text-(--text-color)/60">{weightStr || '—'}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />
                            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: col }}>{getPayLabel()}</span>
                        </div>
                        {deployedInfo && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-teal-500/10 border border-teal-500/20 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-teal-400 leading-none">
                                    {deployedInfo.manifestId
                                        ? deployedInfo.manifestId.replace('TRK-', 'TRK·')
                                        : `TRK·${new Date(deployedInfo.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}`
                                    }
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                
                {isSelectionMode && (
                    <div className="absolute top-4 right-4 z-20" onClick={(e) => { e.stopPropagation(); handleToggleSelection(item.row ?? item.data?.id); }}>
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(item.row ?? item.data?.id) ? 'bg-(--main-color) border-(--main-color) shadow-lg' : 'bg-black/40 border-white/20 backdrop-blur-md'}`}>
                            {selectedIds.includes(item.row ?? item.data?.id) && <Check size={16} className="text-black" strokeWidth={4} />}
                        </div>
                    </div>
                )}
            </div>
            {FullscreenModal}
            </>
        );
    }


    return (
        <>
            <div className={`group relative flex flex-col rounded-md overflow-hidden cursor-pointer bg-(--sidebar-bg) border transition-all duration-400 hover:-translate-y-1 hover:shadow-xl ${isExpanded > 0 ? 'ring-1 ring-(--main-color)/30' : 'hover:border-(--main-color)/30'}`}
                 style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)' }} onClick={() => onToggleExpand()}
             onMouseEnter={() => setIsHoveringCard(true)} onMouseLeave={() => { setIsHoveringCard(false); setCardIdx(0); }}>
            {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} mediaUrls={mediaUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
            <div className="aspect-4/3 relative overflow-hidden bg-black/20 group/gridimg isolate" 
                onClick={(e) => { e.stopPropagation(); if (mediaUrls.length > 1) { setCardIdx(p => (p + 1) % mediaUrls.length); } }}
                onTouchStart={(e) => { e.stopPropagation(); setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }}
                onTouchMove={(e) => { e.stopPropagation(); setTouchEnd(e.targetTouches[0].clientX); }}
                onTouchEnd={(e) => {
                    e.stopPropagation();
                    if (!touchStart || !touchEnd) return;
                    const dist = touchStart - touchEnd;
                    if (dist > 30) setCardIdx(p => (p + 1) % mediaUrls.length);
                    if (dist < -30) setCardIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length);
                }}>
                {mediaUrls[cardIdx] ? <img key={cardIdx} src={getCleanImageUrl(mediaUrls[cardIdx])} className="w-full h-full object-cover group-hover:scale-105 transition-transform animate-in fade-in duration-700" /> : <div className="absolute inset-0 flex items-center justify-center opacity-80 mix-blend-screen scale-[1.3] group-hover:scale-[1.35] transition-transform duration-700"><WireframeIcon item={norm} color={accentColor} /></div>}
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
                
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        navigator.clipboard.writeText(calculated.bookBarcode); 
                        toast.success(`Tag ID Copied: ${calculated.bookBarcode}`, { icon: '📋' }); 
                    }}
                    className="absolute top-2 left-2 z-10 px-2.5 py-0.5 rounded text-[11px] font-black uppercase text-black shadow-md hover:scale-105 active:scale-95 transition-all" 
                    style={{ backgroundColor: vendorColor }}
                >
                    {calculated.bookBarcodeDisplay || vendorPrefix}
                </button>
            </div>
            <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between">
                    <div className="flex flex-col flex-1 min-w-0">
                        <div className="font-black text-[15px] text-(--text-color) uppercase tracking-tight truncate">{norm.shape || 'OBJ'}</div>
                        <div className="text-[11px] font-black text-(--text-color)/30 uppercase tracking-widest">{norm.shortDescription}</div>
                    </div>
                    <span className="text-[13px] font-black text-(--main-color) font-mono ml-2 shrink-0">x{norm.quantity || 1}</span>
                </div>
                <div className="text-[11px] text-(--text-color)/60 uppercase tracking-widest font-black truncate">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                <div className="flex flex-col gap-0.5 my-1">
                    <span className="text-[11px] font-mono text-(--text-color)/40 truncate">{dimensionsStr || '—'}</span>
                    <span className="text-[11px] font-mono text-(--text-color)/20 truncate">{weightStr || '—'}</span>
                </div>
                {/* Financial Summary Overlay */}
                <div className="flex flex-col gap-0.5 pt-2 mb-1 border-t border-white/5">
                    <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-tight">
                        <span className="text-(--text-color)/30">Cost MXN</span>
                        <span className="text-(--text-color)/80 font-mono">{showFinancials ? `$${itemPriceMXN.toLocaleString()}` : '***'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[13px] font-black uppercase tracking-tight">
                        <span className="text-(--main-color)/40">Total MXN</span>
                        <span className="text-(--main-color) font-mono">{showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}</span>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">{payStatus && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />}<span className="text-[11px] font-black uppercase tracking-widest text-(--text-color)/40" style={{ color: payStatus ? col : '#38bdf8' }}>{getPayLabel()}</span></div>
                {deployedInfo && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-teal-500/10 border border-teal-500/20 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                            <span className="text-[8px] font-black uppercase tracking-widest text-teal-400 leading-none">
                                {deployedInfo.manifestId
                                    ? deployedInfo.manifestId.replace('TRK-', 'TRK·')
                                    : `TRK·${new Date(deployedInfo.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}`
                                }
                            </span>
                        </div>
                    )}
                </div>
            </div>
            {isSelectionMode && (
                <div className="absolute top-4 right-4 z-20" onClick={(e) => { e.stopPropagation(); handleToggleSelection(item.row ?? item.data?.id); }}>
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(item.row ?? item.data?.id) ? 'bg-(--main-color) border-(--main-color) shadow-lg' : 'bg-black/40 border-white/20 backdrop-blur-md'}`}>
                        {selectedIds.includes(item.row ?? item.data?.id) && <Check size={16} className="text-black" strokeWidth={4} />}
                    </div>
                </div>
            )}
        </div>
        
        {FullscreenModal}
    </>
);
};

export const UnifiedInventoryView = () => {
    const t = useTranslation(); const db = useDatabase(); const items = useAtomValue(inventoryAtom); const financeDocs = useAtomValue(financeDataAtom);
    const [isLoading, setIsLoading] = useState(true); const [expandedCards, setExpandedCards] = useState<Record<string, number>>({});
    const [isFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom); 
    const viewSlider = useAtomValue(inventoryViewSliderAtom);
    const viewMode = viewSlider <= 33 ? 'list' : viewSlider <= 66 ? 'grid' : 'gallery';
    const listScale = viewMode === 'list' ? 0.85 + (viewSlider / 33) * 0.3 : 1;
    const gridScale = viewMode === 'grid' ? 0.85 + ((viewSlider - 34) / 32) * 0.6 : 1;
    const galleryScale = viewMode === 'gallery' ? 0.9 + ((viewSlider - 67) / 33) * 0.9 : 1;
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isInventoryVendorFilterOpenAtom);
    const setGlobalActiveVendors = useSetAtom(activeVendorsAtom); const exchangeRate = useAtomValue(exchangeRateAtom); const showFinancials = useAtomValue(showFinancialsAtom);
    const [itemData, setSelectedItemData] = useAtom(SelectedItemDataAtom); const [itemRow, setSelectedItemRow] = useAtom(SelectedItemRowAtom);
    const [mode, setMode] = useAtom(detailsPanelModeAtom); const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom); const searchTerm = useAtomValue(inventorySearchTermAtom);
    const [sortOrder, setSortOrder] = useAtom(inventorySortOrderAtom); const [sortKey, setSortKey] = useAtom(inventorySortKeyAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom); const [categoryFilter, setCategoryFilter] = useAtom(inventoryCategoryFilterAtom);
    const [isCategoryOpen, setIsCategoryOpen] = useAtom(isInventoryCategoryFilterOpenAtom); const [materialFilter, setMaterialFilter] = useAtom(inventoryMaterialFilterAtom);
    const [isMaterialOpen, setIsMaterialOpen] = useAtom(isInventoryMaterialFilterOpenAtom); const [isSortMenuOpen, setIsSortMenuOpen] = useAtom(isInventorySortMenuOpenAtom);
    const user = useAtomValue(userAtom); 
    const setFilteredCount = useSetAtom(filteredInventoryCountAtom); 
    const setFilteredTotalQty = useSetAtom(filteredInventoryTotalQtyAtom);
    const setFilteredTotalValue = useSetAtom(filteredInventoryTotalValueAtom);
    const setFilteredIds = useSetAtom(filteredInventoryIdsAtom);
    const setIsUploadWizardOpen = useSetAtom(isUploadWizardOpenAtom);
    const setUploadItemData = useSetAtom(uploadItemDataAtom);
    const [savingProgress, setSavingProgress] = useState(0);
    const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setIsPrintWizardOpen = useSetAtom(isPackingPrintWizardOpenAtom);
    const setIsNFCWizardOpen = useSetAtom(isPackingNFCWizardOpenAtom);
    const setIsPackingCrateWizardOpen = useSetAtom(isPackingCrateWizardOpenAtom);
    const setIsPaymentWizardOpen = useSetAtom(isPaymentWizardOpenAtom);

    // Load deployed crates to derive TRK-DATE tags on inventory items
    const [deployedCrates, setDeployedCrates] = useState<any[]>([]);
    useEffect(() => {
        supabase
            .from('logistics')
            .select('id, inventory_ids, updated_at, description')
            .eq('status', 'In Transit')
            .then(({ data }) => { if (data) setDeployedCrates(data); });
    }, []);

    // Map each inventory item row ID → deployed crate info for TRK tag
    const deployedItemsMap = useMemo(() => {
        const map = new Map<string, { crateId: string; date: string; manifestId: string }>();
        deployedCrates.forEach(crate => {
            if (!crate.inventory_ids) return;
            // Extract manifest ID from description field (POS:... pattern) or use crate id
            const manifestMatch = (crate.description || '').match(/(TRK-[\w-]+)/);
            const manifestId = manifestMatch ? manifestMatch[1] : '';
            const date = crate.updated_at || '';
            crate.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
                const itemId = entry.split(':')[0].trim();
                if (itemId && !map.has(itemId)) {
                    map.set(itemId, { crateId: crate.id, date, manifestId });
                }
            });
        });
        return map;
    }, [deployedCrates]);

    useEffect(() => {
        if (!user || (user.role !== 'Admin' && user.role !== 'Developer')) return;
        const sync825 = async () => {
            try {
                const { data, error } = await supabase
                    .from('inventory')
                    .update({ pay_req: 'paid' })
                    .or('workbook.eq.v825,workbook.eq.825')
                    .neq('pay_req', 'paid');
                if (error) console.error('Error syncing 825 items:', error);
            } catch (e) { console.error(e); }
        };
        sync825();
    }, [user]);

    const handleCopyShareLink = () => {
        const idsToShare = selectedIds.length > 0 ? selectedIds : filteredItems.map(i => i.row ?? i.data?.id).filter(Boolean);
        if (idsToShare.length === 0) return toast.error('No items to share.');
        const idsParam = encodeURIComponent(idsToShare.join(','));
        const viewParam = viewMode;
        const selectionParam = selectedIds.length > 0 ? '&selection=true' : '';
        const url = `${window.location.origin}${window.location.pathname}?artifact=inventory&ids=${idsParam}&view=${viewParam}${selectionParam}`;
        
        navigator.clipboard.writeText(url).then(() => {
            toast.success(selectedIds.length > 0 ? `Shared ${selectedIds.length} selected items!` : 'Share link copied!');
        });
    };
    
    const handleCopyTags = () => {
        if (selectedIds.length === 0) return toast.error('No items selected.');
        
        const tags = selectedIds.map(id => {
            const item = items.find(i => (i.row ?? i.data?.id) === id);
            if (!item) return null;
            const norm = normalizeInventoryData(item.data);
            const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
            return calculated.bookBarcode;
        }).filter(Boolean);

        if (tags.length === 0) return toast.error('No tags found for selection.');
        
        const tagString = tags.join(' ');
        navigator.clipboard.writeText(tagString).then(() => {
            toast.success(`Copied ${tags.length} Barcode Tags`, {
                icon: '📋',
                style: { background: 'var(--main-color)', color: '#000' }
            });
        });
    };

    const handleBulkRemove = async () => {
        if (selectedIds.length === 0) return toast.error('No items selected.');
        if (!window.confirm(`Are you sure you want to REMOVE ${selectedIds.length} items to Store?`)) return;

        const tid = toast.loading(`Moving ${selectedIds.length} items to Store...`);
        try {
            const inventoryIds: (string | number)[] = [];
            const productionIds: (string | number)[] = [];

            selectedIds.forEach(id => {
                const item = items.find(i => (i.row ?? i.data?.id) === id);
                if (item?.source === 'production') productionIds.push(id);
                else inventoryIds.push(id);
            });

            const timestamp = new Date().toISOString();
            
            const promises = [];
            if (inventoryIds.length > 0) {
                promises.push(supabase.from('inventory').update({ status: 'Available', updated_at: timestamp }).in('id', inventoryIds));
            }
            if (productionIds.length > 0) {
                promises.push(supabase.from('production').update({ status: 'Available', updated_at: timestamp }).in('id', productionIds));
            }

            const results = await Promise.all(promises);
            const error = results.find(r => r.error);
            if (error) throw error.error;

            toast.success(`Successfully moved ${selectedIds.length} items to Store`, { id: tid });
            setSelectedIds([]);
            setIsSelectionMode(false);
            setInventoryVersion(v => v + 1);
        } catch (err: any) {
            toast.error(`Remove failed: ${err.message}`, { id: tid });
        }
    };

    const handleSelectAll = () => {
        const allFilteredIds = filteredItems.map(i => i.row ?? i.data?.id).filter(Boolean);
        const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.includes(id));
        
        if (isAllSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(allFilteredIds);
        }
    };

    const handleToggleSelection = (id: string | number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const { partialPayIds, fullPayIds, requestedAcqIds } = useAtomValue(inventoryStatusSetsAtom);

    const handleEditItem = async (rowId: string, currentData: any) => {
        const item = items.find(i => (i.row ?? i.data?.id) === rowId);
        const dataToLoad = item ? { ...item.data, id: rowId } : { ...currentData, id: rowId };
        setUploadItemData(dataToLoad);
        setIsUploadWizardOpen(true);
    };

    const filteredItems = useMemo(() => {
        const filtered = items.filter(item => {
            if (item.data.is_hidden) return false;
            
            const status = getStatusClass(item.data, partialPayIds, fullPayIds);
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
            
            // Stackable Vendor Filter
            if (!vendorFilter.includes('All') && !vendorFilter.includes(vPre)) return false;
            
            const catNormalized = Array.from(new Set(`${item.data.shape || ''} ${item.data.shortDescription || item.data.short_description || ''}`.toUpperCase().split(/\s+/).filter(Boolean))).join(' ');
            const matNormalized = Array.from(new Set(`${item.data.color || ''} ${item.data.material || ''}`.toUpperCase().split(/\s+/).filter(Boolean))).join(' ');

            // Independent Attribute Filters
            if (categoryFilter !== 'All' && catNormalized !== categoryFilter.toUpperCase()) return false;
            if (materialFilter !== 'All' && matNormalized !== materialFilter.toUpperCase()) return false;
            if (searchTerm) {
                const itemId = String(item.data.itemId || item.data.item_id || '').toLowerCase();
                // Build a wide search string including all relevant fields
                const searchStr = [
                    itemId,
                    item.data.shape || '',
                    item.data.shortDescription || item.data.short_description || '',
                    item.data.color || '',
                    item.data.material || '',
                    String(item.data.price || item.data.price_mxn || ''),
                    String(item.data.quantity || ''),
                    String(item.data.widthCm || ''),
                    String(item.data.heightCm || ''),
                    String(item.data.lengthCm || ''),
                    String(item.data.weightKg || ''),
                ].join(' ').toLowerCase();

                // Space = OR between groups; + = AND within a group
                const groups = searchTerm.trim().split(/\s+/).filter(Boolean);
                const matchesAnyGroup = groups.some(group => {
                    const tokens = group.toLowerCase().split('+').filter(Boolean);
                    return tokens.every(t => searchStr.includes(t));
                });
                if (!matchesAnyGroup) return false;
            }
            return true;
        });
        return filtered.sort((a, b) => {
            const sA = getStatusClass(a.data, partialPayIds); const sB = getStatusClass(b.data, partialPayIds);
            if (sA === null && sB !== null) return -1; if (sA !== null && sB === null) return 1;
            let comp = 0;
            if (sortKey === 'Date') {
                const dA = new Date(a.data.timestamp || a.data.updated_at || 0).getTime();
                const dB = new Date(b.data.timestamp || b.data.updated_at || 0).getTime();
                comp = dB - dA;
            }
            else if (sortKey === 'Vendor') {
                const vA = String(a.data.itemId || a.data.item_id || '');
                const vB = String(b.data.itemId || b.data.item_id || '');
                comp = vA.localeCompare(vB);
            }
            else if (sortKey === 'Status') {
                const getVal = (s: string | null) => s === 'RED' ? 6 : s === 'YELLOW' ? 5 : s === 'GREEN' ? 4 : s === 'BLUE' ? 3 : s === 'PURPLE' ? 2 : 1;
                comp = getVal(sB) - getVal(sA);
            }
            else if (sortKey === 'Number') {
                const nA = parseInt(a.data.itemNumber || a.data.item_number || '0', 10);
                const nB = parseInt(b.data.itemNumber || b.data.item_number || '0', 10);
                comp = nA - nB;
            }
            else if (sortKey === 'Value') {
                const vA = (parseFloat(a.data.price_mxn || a.data.price || 0)) * (parseInt(a.data.quantity || 1));
                const vB = (parseFloat(b.data.price_mxn || b.data.price || 0)) * (parseInt(b.data.quantity || 1));
                comp = vB - vA;
            }
            else if (sortKey === 'Qty') {
                const qA = parseInt(a.data.quantity || 1);
                const qB = parseInt(b.data.quantity || 1);
                comp = qB - qA;
            }
            return sortOrder === 'desc' ? comp : -comp;
        });
    }, [items, statusFilter, vendorFilter, searchTerm, sortKey, sortOrder, partialPayIds, user, categoryFilter, materialFilter]);



    const activeVendors = useMemo(() => Array.from(new Set(items.map(i => i.data.itemId?.split('-')[0]).filter(Boolean))).sort(), [items]);
    const activeCategories = useMemo(() => Array.from(new Set(items.map(i => `${i.data.shape || ''} ${i.data.shortDescription || ''}`.trim()).filter(Boolean))).sort(), [items]);
    // Deduplicate materials cross-vendor: normalize color+material to lowercase for dedup, then Title Case
    const activeMaterials = useMemo(() => {
        const normalized = new Map<string, string>(); // key=lowercase, value=display
        items.forEach(i => {
            const raw = `${(i.data.color || '').trim()} ${(i.data.material || '').trim()}`.trim();
            if (!raw) return;
            const key = raw.toLowerCase();
            if (!normalized.has(key)) {
                const display = raw.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                normalized.set(key, display);
            }
        });
        return Array.from(normalized.values()).sort();
    }, [items]);
    
    const totalCount = useMemo(() => filteredItems.reduce((acc, i) => acc + (parseInt(i.data.quantity) || 1), 0), [filteredItems]);
    const totalValueMXN = useMemo(() => filteredItems.reduce((acc, i) => acc + ((parseInt(i.data.price) || 0) * (parseInt(i.data.quantity) || 1)), 0), [filteredItems]);

    useEffect(() => {
        setGlobalActiveVendors(activeVendors);
        setFilteredCount(filteredItems.length);
        setFilteredTotalQty(totalCount);
        setFilteredTotalValue(totalValueMXN);
        setFilteredIds(filteredItems.map(i => i.row ?? i.data?.id ?? i.data?.itemId ?? '').filter(Boolean));
        setIsLoading(items.length === 0);
    }, [activeVendors, filteredItems, items.length, totalCount, totalValueMXN]);

    // Ken Burns Logic
    const bgMediaUrls = useMemo(() => items.flatMap(i => (i.data as any)._allMedia || []).filter(u => !isVideoFile(u)).map(u => getCleanImageUrl(u)).slice(0, 20), [items]);
    const [bgIdx, setBgIdx] = useState(0);
    useEffect(() => { if (bgMediaUrls.length < 2) return; const i = setInterval(() => setBgIdx(p => (p + 1) % bgMediaUrls.length), 6000); return () => clearInterval(i); }, [bgMediaUrls]);

    const toggleExpandCard = (id: string, stage?: number) => setExpandedCards(prev => {
        const current = prev[id] || 0;
        let next: number;
        if (stage !== undefined) {
            next = current === stage ? 0 : stage; // Toggle to stage or collapse
        } else {
            // Card click toggle: 0 <-> 1 (collapse even if at 2)
            next = current === 0 ? 1 : 0;
        }
        const copy = { ...prev };
        if (next === 0) delete copy[id];
        else copy[id] = next;
        return copy;
    });
    return (
        <div className="flex-1 flex flex-col relative m-0 gap-0">
            {/* ── INFO PANEL ── */}
            <div className="flex-1 relative">
                {/* ── MAIN INVENTORY CONTENT ── */}
                <div 
                    className={`transition-all duration-700 ease-in-out ${
                        viewMode === 'grid' 
                            ? "grid gap-8 pb-32" 
                            : viewMode === 'gallery' 
                                ? "grid gap-10 pb-32 auto-rows-max" 
                                : "flex flex-col gap-4 pb-32 max-w-[1600px] mx-auto w-full"
                    }`}
                    style={
                        viewMode === 'grid' 
                            ? { gridTemplateColumns: `repeat(auto-fill, minmax(${200 * gridScale}px, 1fr))` } 
                            : viewMode === 'list' 
                                ? { zoom: listScale } as React.CSSProperties
                                : { gridTemplateColumns: `repeat(auto-fill, minmax(${300 * galleryScale}px, 1fr))` }
                    }
                >

                    {isLoading && items.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-white/20 font-black tracking-widest text-[10px] uppercase">Loading Artifacts...</div>
                    ) : (
                        filteredItems.map(item => {
                            const mediaCount = ((item.data.generatedPngUrl ? item.data.generatedPngUrl + ',' : '') + (item.data.mediaUrls || '')).split(',').map((u: string) => u.trim()).filter(Boolean).length;
                            const isLarge = mediaCount >= 1 && mediaCount < 10;
                            const isFull = mediaCount >= 10;
                            
                            return (
                                <div key={item.row} className={
                                    viewMode === 'gallery' 
                                        ? `break-inside-avoid ${isFull ? 'col-span-full' : isLarge ? 'md:col-span-2' : ''}` 
                                        : ""
                                }>
                                    <UnifiedInventoryCard 
                                        item={item} 
                                        isExpanded={expandedCards[String(item.row)] || 0} 
                                        onToggleExpand={(stage?: number) => toggleExpandCard(String(item.row), stage)} 
                                        exchangeRate={exchangeRate} 
                                        showFinancials={showFinancials} 
                                        viewMode={viewMode} 
                                        partialPayIds={partialPayIds} 
                                        fullPayIds={fullPayIds} 
                                        requestedAcqIds={requestedAcqIds}
                                        onEdit={handleEditItem} 
                                        financeDocs={financeDocs}
                                        deployedItemsMap={deployedItemsMap}
                                    />
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
