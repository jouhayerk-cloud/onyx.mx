import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from '../../lib/atoms';
import { useDatabase, useTranslation } from '../../lib/hooks';
import { calculateCodesAndPrices, normalizeInventoryData, handleFileUpload, readFileAsDataURL, getCleanImageUrl } from '../../lib/utils';
import { InventoryItemData, UploadedFile } from '../../lib/Types';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { X, Edit2, ChevronDown, Menu, Filter, Upload, Video } from 'lucide-react';

const getStatusClass = (data: InventoryItemData): 'RED' | 'YELLOW' | 'GREEN' | '' => {
    if (data.payDate) return 'GREEN';
    if (data.payReq) return 'YELLOW';
    if (data.status === 'YES' || data.printDate) return 'RED';
    return '';
};

const lbl = "text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5";
const inp = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2 text-sm text-white placeholder-white/15 focus:outline-none focus:border-(--main-color)/50 focus:bg-white/[0.07] transition-all";
const inpNum = inp + " font-mono text-center";

// â”€â”€â”€ Fullscreen Image Viewer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FullscreenImageViewer = ({ src, onClose }: { src: string; onClose: () => void }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [lastTouchDist, setLastTouchDist] = useState<number | null>(null);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.002)));
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleMouseUp = () => setIsDragging(false);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
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
    }, [lastTouchDist, scale, dragStart]);

    const handleTouchEnd = () => setLastTouchDist(null);
    const handleDoubleClick = () => { setScale(s => s > 1 ? 1 : 3); setPosition({ x: 0, y: 0 }); };

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-300"
            onClick={onClose} onWheel={handleWheel}>
            <button onClick={onClose} className="absolute top-6 right-6 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all">
                <X className="w-5 h-5" />
            </button>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/5 backdrop-blur-md rounded-full px-4 py-2 border border-white/10">
                <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.5, s - 0.5)); }} className="text-white/50 hover:text-white text-lg font-bold">âˆ’</button>
                <span className="text-[10px] font-mono text-white/40 w-12 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.5)); }} className="text-white/50 hover:text-white text-lg font-bold">+</button>
            </div>
            <img src={src} alt="" draggable={false}
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
        </div>
    );
};

const UnifiedInventoryCard = ({ item, isExpanded, onToggleExpand, exchangeRate, showFinancials, viewMode }: any) => {
    const norm = normalizeInventoryData(item.data);
    const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#ccc';
    const [showViewer, setShowViewer] = useState(false);

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
    const statusClass = getStatusClass(norm);
    const baseImg = norm?.generatedPngUrl || (norm?.mediaUrls ? String(norm.mediaUrls).split(',')[0].trim() : null);
    const imageUrl = getCleanImageUrl(baseImg);

    const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);
    const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
    const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
    const setImageSrc = useSetAtom(ImageSrcAtom);

    const descLine = [norm.color, norm.material, norm.shape, norm.shortDescription].filter(Boolean).map(s => s.toUpperCase()).join(' Â· ');

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedItemRow(item.row);
        setSelectedItemData(item.data);
        setImageSrc(imageUrl);
        setDetailsPanelMode('edit');
    };

    // â”€â”€ LIST VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (viewMode === 'list') {
        return (
            <div className="flex flex-col gap-1">
                {showViewer && imageUrl && <FullscreenImageViewer src={imageUrl} onClose={() => setShowViewer(false)} />}
                <div className={`flex items-center gap-4 bg-black/20 hover:bg-black/40 border border-white/5 p-2 pr-4 rounded-xl transition-all group ${isExpanded ? 'border-(--main-color)/30 bg-black/40 shadow-lg' : ''}`}>
                    {/* Thumbnail â€” clickable for fullscreen */}
                    <div className={`w-12 h-12 rounded-lg overflow-hidden bg-black/40 grow-0 shrink-0 border border-white/10 ${imageUrl ? 'cursor-pointer hover:ring-1 hover:ring-(--main-color)/40' : ''}`}
                        onClick={() => imageUrl && setShowViewer(true)}>
                        {imageUrl ? <img src={imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full p-2.5 opacity-30 flex items-center justify-center"><OnyxMiniLogo className="w-full h-full object-contain" /></div>}
                    </div>

                    {/* Meta & Description */}
                    <div className="grow min-w-0 flex flex-col justify-center max-w-[300px]">
                        <div className="flex items-center gap-2">
                            <div className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-black text-black leading-none" style={{ backgroundColor: vendorColor }}>
                                {vendorPrefix}
                            </div>
                            <span className="text-[10px] font-mono font-bold text-white/40 tracking-tighter">{norm.itemNumber}</span>
                            <span className="text-xs font-black text-white truncate">{(norm.shape || '') + ' ' + (norm.shortDescription || '')}</span>
                            <span className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-black bg-white/10 text-white/50 whitespace-nowrap">QTY: {norm.quantity || 1}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-[9px] text-white/20 font-medium uppercase tracking-tighter">{dimensionsStr || 'NO DIMENSIONS'} Â· {weightStr || 'NO WEIGHT'}</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusClass === 'GREEN' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : statusClass === 'YELLOW' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`} />
                        </div>
                    </div>

                    {/* Data Dense Center â€” removed BOOK column */}
                    <div className="hidden md:flex items-center gap-4 grow justify-around border-x border-white/5 px-4 max-w-[400px]">
                        <div className="flex flex-col min-w-[100px]">
                            <span className="text-[7px] font-black text-white/15 uppercase tracking-[0.25em] mb-1 leading-none">TAG ID</span>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-[4px] text-black w-fit whitespace-nowrap" style={{ backgroundColor: vendorColor }}>{calculated.bookBardcode || 'N/A'}</span>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <span className="text-[7px] font-black text-white/15 uppercase tracking-[0.25em] mb-1 text-center leading-none">AQ CODE</span>
                                <span className="text-[11px] font-mono font-black text-(--main-color)/80 shadow-sm">{calculated.bookAqCode || 'â€”'}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-[7px] font-black text-white/15 uppercase tracking-[0.25em] mb-1 text-center leading-none">LD CODE</span>
                                <span className="text-[11px] font-mono font-black text-yellow-500/80 shadow-sm">{calculated.bookLandCode || 'â€”'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Pricing & Actions */}
                    <div className="flex items-center gap-6 shrink-0 ml-auto">
                        <div className="flex flex-col items-end mr-2">
                            <span className="text-[8px] font-black text-white/15 uppercase tracking-widest mb-0.5">ACQ COST</span>
                            <span className="text-base font-mono font-black text-(--main-color)">{showFinancials ? `$${Math.ceil(Number(norm.price || 0))}` : '***'}</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleEdit} className="h-9 px-3 flex items-center justify-center gap-2 bg-white/5 hover:bg-(--main-color)/10 border border-white/10 rounded-xl text-white/30 hover:text-(--main-color) transition-all group/edit" title="Edit Item">
                                <Edit2 className="w-3.5 h-3.5 transition-transform group-hover/edit:scale-110" />
                                <span className="text-[9px] font-black uppercase tracking-widest hidden lg:inline">Edit</span>
                            </button>
                            <button onClick={onToggleExpand} className="h-9 px-3 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/30 hover:text-white transition-all group/expand" title="Item Details">
                                <ChevronDown className={`w-3.5 h-3.5 transition-all group-hover/expand:scale-110 ${isExpanded ? 'rotate-180 text-(--main-color)' : ''}`} />
                                <span className="text-[9px] font-black uppercase tracking-widest hidden lg:inline">{isExpanded ? 'Close' : 'Details'}</span>
                            </button>
                        </div>
                    </div>
                </div>
                {isExpanded && (
                    <div className="ml-16 mr-4 p-5 bg-black/40 backdrop-blur-md border-x border-b border-white/5 rounded-b-2xl grid grid-cols-2 md:grid-cols-4 gap-6 animate-in slide-in-from-top-4 duration-500 ease-out z-0 relative">
                        <div><p className={lbl}>Material</p><p className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{norm.material || 'â€”'}</p></div>
                        <div><p className={lbl}>Status</p><p className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{norm.status}</p></div>
                        <div><p className={lbl}>Quantity</p><p className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{norm.quantity || 1}</p></div>
                        <div className="flex flex-col"><span className={lbl}>Landed USD</span><span className="text-sm font-black text-yellow-300 font-mono tracking-tight">{showFinancials ? `$${calculated.bookLanded}` : '***'}</span></div>
                        <div className="flex flex-col"><span className={lbl}>Retail USD</span><span className="text-sm font-black text-green-400 font-mono tracking-tight">{showFinancials ? `$${calculated.bookRetail}` : '***'}</span></div>
                    </div>
                )}
            </div>
        );
    }

    // â”€â”€ GRID VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    return (
        <div className={`inventory-item-card relative overflow-hidden flex flex-col transition-all duration-500 group rounded-2xl border border-white/5 bg-black/40 hover:border-white/10 shadow-lg ${isExpanded ? 'col-span-full md:col-span-2 lg:col-span-3 min-h-[500px] ring-1 ring-white/10' : 'col-span-1'}`}>
            {showViewer && imageUrl && <FullscreenImageViewer src={imageUrl} onClose={() => setShowViewer(false)} />}
            <div className={`w-full flex ${isExpanded ? 'h-full flex-col md:flex-row' : 'aspect-4/5 flex-col'} relative`}>
                <div className={`${isExpanded ? 'relative h-64 md:h-full md:w-2/5' : 'absolute inset-0'} overflow-hidden flex items-center justify-center bg-black/50`}>
                    {imageUrl ? (
                        <img src={imageUrl} className={`w-full h-full object-cover transition-transform duration-[2s] ${!isExpanded && 'group-hover:scale-110 opacity-80 group-hover:opacity-100'} ${isExpanded ? 'cursor-pointer' : ''}`}
                            onClick={() => isExpanded && setShowViewer(true)} />
                    ) : (
                        <div className="absolute inset-0 p-6 sm:p-10 opacity-10 flex items-center justify-center pointer-events-none">
                            <OnyxMiniLogo className="w-full h-full object-contain" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

                    {/* Top bar: vendor tag left, toggle button right */}
                    <div className="absolute top-0 inset-x-0 p-3 flex justify-between items-start z-10">
                        {calculated.bookBardcode ? (
                            <div className="px-2 py-1 rounded border border-black text-black font-black text-[10px] shadow-lg flex items-center pointer-events-none" style={{ backgroundColor: vendorColor }}>
                                <span>{calculated.bookBardcode}</span>
                            </div>
                        ) : (
                            <div className="h-6 px-2 rounded flex items-center justify-center font-bold text-black border border-black shadow-lg text-[10px] pointer-events-none" style={{ backgroundColor: vendorColor }}>{vendorPrefix || '?'}</div>
                        )}
                        {!isExpanded && (
                            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="pointer-events-auto p-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-lg border border-white/10 text-white/40 hover:text-white transition-all">
                                <Menu className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {!isExpanded && (
                        <div className="absolute bottom-0 inset-x-0 p-3 pt-10 flex flex-col justify-end text-left pointer-events-none z-10 bg-linear-to-t from-black via-black/60 to-transparent">
                            <div className="flex items-end justify-between mb-1 gap-2">
                                <p className="font-black text-(--main-color) text-base leading-none truncate">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</p>
                                <div className="flex flex-col items-end shrink-0">
                                    <span className="text-[10px] font-black text-(--main-color) font-mono leading-none">{showFinancials ? `$${Math.ceil(Number(norm?.price || 0))}` : '***'}</span>
                                    <span className="text-[8px] font-black text-white/40 font-mono mt-0.5">x{norm.quantity || 1}</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <p className="text-[9px] uppercase font-black tracking-widest text-(--secondary-color) truncate">{(norm.color || '') + ' ' + (norm.material || '')}</p>
                                <div className="flex items-center justify-between gap-2 mt-1">
                                    <div className="flex flex-col">
                                        <p className="text-[11px] font-black text-white/60 font-mono tracking-tight uppercase leading-none mb-1">{dimensionsStr || 'NO DIM'}</p>
                                        <div className="flex gap-2">
                                            <span className="text-[8px] font-bold text-(--main-color) font-mono">AQ: {calculated.bookAqCode}</span>
                                            <span className="text-[8px] font-bold text-yellow-500 font-mono">LD: {calculated.bookLandCode}</span>
                                        </div>
                                    </div>
                                    {/* Edit button at bottom-right */}
                                    <button onClick={(e) => { e.stopPropagation(); handleEdit(e); }} className="pointer-events-auto p-1.5 px-2.5 bg-white/5 hover:bg-(--main-color)/20 rounded-lg border border-white/10 text-white/30 hover:text-(--main-color) transition-all" title="Edit">
                                        <Edit2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {isExpanded && (
                    <div className="flex-1 min-h-0 flex flex-col p-6 overflow-hidden bg-(--glass-bg) backdrop-blur-md">
                        {/* Top-right: Close + Edit */}
                        <div className="absolute right-4 top-4 z-50 flex flex-col gap-2">
                            <button onClick={onToggleExpand} className="h-8 px-3 flex items-center justify-center gap-1.5 border border-white/10 rounded-xl text-(--text-color) hover:opacity-100 opacity-60 transition-all text-[10px] font-black uppercase tracking-widest">
                                <X className="w-3 h-3" />Close
                            </button>
                            <button onClick={handleEdit} className="h-8 px-3 flex items-center justify-center gap-1.5 bg-(--main-color)/10 hover:bg-(--main-color)/20 border border-(--main-color)/30 rounded-xl text-(--main-color) transition-all text-[10px] font-black uppercase tracking-widest">
                                <Edit2 className="w-3 h-3" />Edit
                            </button>
                        </div>
                        <div className="overflow-y-auto grow pr-2 custom-scrollbar">
                            <div className="flex justify-between items-start mb-6 pr-24">
                                <div className="min-w-0">
                                    <h3 className="text-3xl font-black text-(--text-color) truncate">{(norm.shape || 'OBJ') + ' ' + (norm.shortDescription || '')}</h3>
                                    <p className="text-[12px] font-black uppercase text-(--text-color-secondary) tracking-[0.2em] mt-1 truncate">{(norm.color || '') + ' ' + (norm.material || '')}</p>
                                    <div className="flex gap-4 mt-3">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">AQ Code</span>
                                            <span className="text-base font-mono font-black text-(--main-color)">{calculated.bookAqCode}</span>
                                        </div>
                                        <div className="flex flex-col border-l border-(--border-color) pl-4">
                                            <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">LD Code</span>
                                            <span className="text-base font-mono font-black text-yellow-500">{calculated.bookLandCode}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-6 mb-8 bg-black/5 dark:bg-black/20 p-5 rounded-2xl border border-(--border-color)">
                                <div><p className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1.5">Material</p><p className="text-lg font-bold text-(--text-color)">{norm.material || '—'}</p></div>
                                <div><p className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1.5">Dimensions</p><p className="text-lg font-bold text-(--text-color) font-mono">{dimensionsStr || '—'}</p></div>
                                <div><p className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1.5">Weight</p><p className="text-lg font-bold text-(--text-color) font-mono">{weightStr || '—'}</p></div>
                                <div><p className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1.5">Quantity</p><p className="text-lg font-bold text-(--text-color) font-mono">{norm.quantity || 1}</p></div>
                            </div>
                            <div className="p-6 bg-(--glass-bg) rounded-2xl border border-(--border-color) shadow-inner">
                                <h4 className="text-[11px] font-black uppercase text-(--text-color-secondary) tracking-[0.2em] mb-4">Financial Analysis</h4>
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="flex flex-col"><span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">Acq</span><span className="text-2xl font-black text-[#6BCEBB] font-mono leading-none">{showFinancials ? `$${Math.ceil(parseFloat(String(norm.price || 0)) / exchangeRate)}` : '***'}</span></div>
                                    <div className="flex flex-col"><span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">Land</span><span className="text-2xl font-black text-yellow-500 font-mono leading-none">{showFinancials ? `$${calculated.bookLanded}` : '***'}</span></div>
                                    <div className="flex flex-col"><span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">Ret</span><span className="text-2xl font-black text-green-500 font-mono leading-none">{showFinancials ? `$${calculated.bookRetail}` : '***'}</span></div>
                                </div>
                            </div>
                            {norm.description && (
                                <div className="mt-8 bg-black/5 dark:bg-black/10 p-5 rounded-2xl border border-(--border-color)">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary) mb-1.5">Notes</p>
                                    <p className="text-sm text-(--text-color) leading-relaxed font-medium">{norm.description}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};



export const UnifiedInventoryView = () => {
    const t = useTranslation();
    const db = useDatabase();
    const [items, setItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [viewMode, setViewMode] = useAtom(inventoryViewModeAtom);

    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const searchTerm = useAtomValue(inventorySearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryActiveFilterAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const showFinancials = useAtomValue(showFinancialsAtom);

    const [itemData, setItemData] = useAtom(SelectedItemDataAtom);
    const [itemRow, setSelectedItemRow] = useAtom(SelectedItemRowAtom);
    const [mode, setMode] = useAtom(detailsPanelModeAtom);
    const [isSaving, setIsSaving] = useState(false);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const user = useAtomValue(userAtom);
    const setFilteredCount = useSetAtom(filteredInventoryCountAtom);

    const [editData, setEditData] = useState<any>(null);
    const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);
    const imageUrl = itemData?.generatedPngUrl || (itemData?.mediaUrls ? itemData.mediaUrls.split(',')[0].trim() : null);

    useEffect(() => {
        if (mode === 'edit' && itemData) {
            setEditData({
                itemNumber: itemData.itemNumber || '',
                shape: itemData.shape || '',
                material: itemData.material || '',
                color: itemData.color || '',
                itemType: itemData.shortDescription || '',
                description: itemData.description || '',
                weightKg: itemData.weightKg || '',
                widthCm: itemData.widthCm || '',
                heightCm: itemData.heightCm || '',
                lengthCm: itemData.lengthCm || '',
                price: itemData.price || '',
                quantity: itemData.quantity || '1',
                status: itemData.status || 'Available',
                workbook: itemData.workbook || '326',
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

    const updateFileTag = (i: number, tag: 'Item' | 'Lot') => {
        setNewFiles(prev => prev.map((f, idx) => idx === i ? { ...f, tag } : f));
    };

    const removeNewFile = (i: number) => {
        setNewFiles(prev => prev.filter((_, idx) => idx !== i));
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
            const existingPhotos = itemData?.mediaUrls ? itemData.mediaUrls.split(',').map((u: string) => u.trim()).filter(Boolean) : [];
            const mediaUrlsStr = [...existingPhotos, ...uploadedUrls].join(',');

            const dbRow = {
                item_number: editData.itemNumber,
                shape: editData.shape,
                material: editData.material,
                color: editData.color,
                short_description: editData.itemType,
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
                updated_at: new Date().toISOString()
            };

            const tableName = (itemData as any)?.source === 'production' ? 'production' : 'inventory';
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
        if (!db) return;
        setIsLoading(true);
        const subs = [
            db.inventory.find({ selector: { status: { $ne: 'Pending Deletion' } } }).$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'inventory', row: x.id, data: normalizeInventoryData(x.toJSON()) }));
                setItems(prev => [...prev.filter(p => p.source !== 'inventory'), ...mapped]);
            }),
            db.production.find().$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'production', row: x.id, data: normalizeInventoryData(x.toJSON()) }));
                setItems(prev => [...prev.filter(p => p.source !== 'production'), ...mapped]);
            }),
        ];
        setTimeout(() => setIsLoading(false), 500);
        return () => subs.forEach(s => s.unsubscribe());
    }, [db]);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            if (statusFilter === 'Available') {
                if (item.data.status && !['Available', 'Catalog'].includes(item.data.status)) return false;
            } else if (statusFilter === 'Acquisition') {
                if (!['Acquired', 'Acquisitions', 'Acquisition'].includes(item.data.status)) return false;
            } else if (statusFilter === 'Production') {
                if (item.source !== 'production' && item.data.status !== 'Production') return false;
            }
            const vendorPrefix = item.data.itemId?.split('-')[0] || '';
            if (vendorFilter !== 'All' && vendorPrefix !== vendorFilter) return false;
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
        }).sort((a, b) => (new Date(b.data.updatedAt || 0).getTime()) - (new Date(a.data.updatedAt || 0).getTime()));
    }, [items, statusFilter, vendorFilter, searchTerm]);

    useEffect(() => {
        setFilteredCount(filteredItems.length);
    }, [filteredItems.length, setFilteredCount]);

    const activeVendors = useMemo(() => {
        return Array.from(new Set(items.map(item => item.data.itemId?.split('-')[0]).filter(Boolean))).sort();
    }, [items]);

    const totalCount = useMemo(() => {
        return filteredItems.reduce((acc, item) => acc + (parseInt(item.data.quantity) || 1), 0);
    }, [filteredItems]);

    return (
        <div className="flex flex-col h-full overflow-hidden relative m-4 mt-0 gap-2">

            {/* Top row with Types, Count, toggle Display, and Filter expander */}
            <div className="flex justify-between items-center px-5 py-3 mt-4 bg-(--glass-bg) backdrop-blur-xl rounded-2xl border border-(--border-color) mx-2 shrink-0 z-30 relative">
                <div className="flex gap-8 items-center">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) mb-0.5">Types</span>
                        <span className="text-sm font-mono font-black text-(--text-color) leading-none">{filteredItems.length.toLocaleString('en-US')}</span>
                    </div>
                    <div className="w-px h-8 bg-(--border-color)" />
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#6BCEBB]/60 mb-0.5">Count</span>
                        <span className="text-sm font-mono font-black text-[#6BCEBB] leading-none">{totalCount.toLocaleString('en-US')}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-(--glass-bg) border border-(--border-color) hover:bg-(--main-color)/10 text-(--text-color-secondary) hover:text-(--text-color) transition-all"
                        title={viewMode === 'grid' ? "Switch to List View" : "Switch to Grid View"}>
                        <span className="text-lg! leading-none font-black opacity-80">{viewMode === 'grid' ? '☰' : '⊞'}</span>
                    </button>

                    <button
                        onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                        className={`px-4 h-10 flex items-center gap-2.5 rounded-xl transition-all border ${isFiltersOpen ? 'bg-[#6BCEBB]/15 border-[#6BCEBB]/30 text-[#6BCEBB]' : 'bg-(--glass-bg) border-(--border-color) text-(--text-color-secondary) hover:text-(--text-color) hover:bg-(--main-color)/10'}`}>
                        <Filter className={`w-4 h-4 transition-transform duration-300 ${isFiltersOpen ? 'rotate-180' : ''}`} />
                        <span className="text-[10px] uppercase font-black tracking-[0.1em] hidden sm:block mt-0.5">Filters</span>
                    </button>
                </div>
            </div>

            {/* Collapsible Filters Panel */}
            <div className={`transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] shrink-0 overflow-hidden relative z-20 ${isFiltersOpen ? 'max-h-64 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-4 -mt-4'}`}>
                <div className="flex flex-col md:flex-row items-center gap-4 px-2 py-2 mx-2">
                    <div className="flex bg-(--glass-bg) p-1.5 rounded-xl border border-(--border-color) shrink-0 w-full md:w-auto overflow-x-auto custom-scrollbar no-scrollbar">
                        {['All', 'Available', 'Production', 'Acquisition'].map(s => (
                            <button key={s} onClick={() => setStatusFilter(s as any)} className={`px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all whitespace-nowrap ${statusFilter === s ? 'bg-[#6BCEBB] text-black shadow-lg translate-y-[-1px]' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}>{s}</button>
                        ))}
                    </div>
                    <div className="flex bg-(--glass-bg) p-1.5 rounded-xl border border-(--border-color) overflow-x-auto grow custom-scrollbar no-scrollbar w-full">
                        <button onClick={() => setVendorFilter('All')} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 rounded-lg transition-all shrink-0 ${vendorFilter === 'All' ? 'bg-white/15 text-white shadow-sm' : 'hover:text-white hover:bg-white/5'}`}>ALL</button>
                        <div className="w-px h-6 bg-white/10 mx-2 self-center shrink-0" />
                        {activeVendors.map(v => {
                            const color = vendors[v as keyof typeof vendors]?.color || '#ccc';
                            return <button key={v} onClick={() => setVendorFilter(v)} className={`px-3 py-1.5 mx-0.5 text-[10px] font-black rounded-lg transition-all shrink-0 ${vendorFilter === v ? 'opacity-100 shadow-md translate-y-[-1px]' : 'opacity-30 hover:opacity-60'}`} style={{ backgroundColor: vendorFilter === v ? color : 'transparent', color: vendorFilter === v ? 'black' : color, border: vendorFilter === v ? 'none' : `1px solid ${color}` }}>{v}</button>;
                        })}
                    </div>
                </div>
            </div>

            <div className="grow min-h-0 overflow-hidden glass-panel shadow-2xl rounded-[2rem] m-2 mt-0">
                <div className="h-full overflow-y-auto p-4 md:p-6 custom-scrollbar scroll-smooth">
                    <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 pb-20" : "flex flex-col gap-3 pb-20"}>
                        {isLoading ? (
                            <div className="col-span-full h-64 flex items-center justify-center opacity-40">
                                <LoadingIndicator />
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
                                    isExpanded={expandedCardId === item.row}
                                    onToggleExpand={() => setExpandedCardId(prev => prev === item.row ? null : item.row)}
                                    exchangeRate={exchangeRate}
                                    showFinancials={showFinancials}
                                    viewMode={viewMode}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            {mode === 'edit' && editData && (
                <div className="fixed inset-0 z-100 bg-black/98 backdrop-blur-2xl flex flex-col p-8 items-center justify-center animate-in fade-in zoom-in duration-500">
                    <div className="max-w-2xl w-full flex flex-col h-full overflow-hidden">
                        <div className="flex justify-between items-center mb-10 shrink-0">
                            <div className="flex items-center gap-5">
                                <div className="p-4 bg-white/5 rounded-3xl border border-(--main-color)/20 shadow-[0_0_40px_rgba(var(--main-color-rgb),0.15)]"><Edit2 className="w-10 h-10 text-(--main-color)" /></div>
                                <div><h2 className="text-3xl font-black text-white leading-none tracking-tighter">EDITING ITEM</h2><p className="text-[10px] font-mono font-black text-white/30 mt-1.5 uppercase tracking-[0.4em]">{itemData?.itemId}</p></div>
                            </div>
                            <button onClick={() => setMode('view')} className="text-4xl text-white/20 hover:text-white transition-all hover:rotate-90">&times;</button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="overflow-y-auto grow pr-6 custom-scrollbar space-y-10 pb-12">
                            {/* â”€â”€ Attach Media Section (Moved to Top) â”€â”€ */}
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
                                <div><label className={lbl}>Status</label><select name="status" value={editData.status} onChange={handleEditChange} className={inp}><option value="Avaiable">Avaiable</option><option value="Production">Production</option><option value="Acquired">Acquired</option><option value="Requested">Requested</option><option value="Payed">Payed</option><option value="Packed">Packed</option><option value="Shipped">Shipped</option></select></div>
                                <div><label className={lbl}>Tag Number</label><input type="text" name="itemNumber" value={editData.itemNumber} onChange={handleEditChange} className={inpNum} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className={lbl}>Color Tone</label><input type="text" name="color" value={editData.color} onChange={handleEditChange} className={inp} /></div>
                                <div><label className={lbl}>Composition</label><input type="text" name="material" value={editData.material} onChange={handleEditChange} className={inp} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className={lbl}>Geometric Shape</label><input type="text" name="shape" value={editData.shape} onChange={handleEditChange} className={inp} /></div>
                                <div><label className={lbl}>Product Category</label><input type="text" name="itemType" value={editData.itemType} onChange={handleEditChange} className={inp} /></div>
                            </div>
                            <div><label className={lbl}>Technical Notes</label><textarea name="description" value={editData.description} onChange={handleEditChange} rows={4} className={inp + " resize-none leading-relaxed"} /></div>
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
