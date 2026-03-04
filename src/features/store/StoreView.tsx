import React, { useState, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { userAtom, storeShoppingBagAtom, storeSearchTermAtom, exchangeRateAtom, liveExchangeRateAtom } from '../../lib/atoms';
import { extractFileId, calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { InventoryItemData, InventoryItem } from '../../lib/Types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Search, X, ChevronLeft, ChevronRight, Play, ShoppingBag, ZoomIn, Tag, PackageSearch } from 'lucide-react';

/* ─── Fullscreen Zoomable Image Viewer ─────────────────────────────── */
const FullscreenImageViewer = ({ src, onClose }: { src: string; onClose: () => void }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [lastTouchDist, setLastTouchDist] = useState<number | null>(null);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.002)));
    };
    const handleMouseDown = (e: React.MouseEvent) => { setIsDragging(true); setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y }); };
    const handleMouseMove = (e: React.MouseEvent) => { if (!isDragging) return; setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
    const handleMouseUp = () => setIsDragging(false);
    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            if (lastTouchDist !== null) setScale(s => Math.min(5, Math.max(0.5, s * (dist / lastTouchDist))));
            setLastTouchDist(dist);
        } else if (e.touches.length === 1 && scale > 1) {
            const touch = e.touches[0];
            setPosition(p => ({ x: p.x + touch.clientX - (dragStart.x || touch.clientX), y: p.y + touch.clientY - (dragStart.y || touch.clientY) }));
            setDragStart({ x: touch.clientX, y: touch.clientY });
        }
    };
    const handleTouchEnd = () => setLastTouchDist(null);
    const handleDoubleClick = () => { setScale(s => s > 1 ? 1 : 3); setPosition({ x: 0, y: 0 }); };

    return (
        <div className="fixed inset-0 z-200 bg-black/95 backdrop-blur-2xl flex items-center justify-center animate-in fade-in duration-200"
            onClick={onClose} onWheel={handleWheel}>
            <button onClick={onClose} className="absolute top-6 right-6 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-110 border border-white/10">
                <X className="w-5 h-5" />
            </button>
            <div className="absolute top-6 left-6 text-[10px] font-mono text-white/30 tracking-widest uppercase">
                Double-click to toggle zoom · Scroll to zoom · Drag to pan
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/5 backdrop-blur-md rounded-full px-5 py-2.5 border border-white/10">
                <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.5, s - 0.5)); }} className="text-white/50 hover:text-white w-6 h-6 flex items-center justify-center text-lg font-bold transition-colors">-</button>
                <span className="text-[10px] font-mono text-white/40 w-14 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.5)); }} className="text-white/50 hover:text-white w-6 h-6 flex items-center justify-center text-lg font-bold transition-colors">+</button>
            </div>
            <img src={src} alt="" draggable={false}
                className="max-w-[90vw] max-h-[90vh] object-contain select-none"
                style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in', transition: isDragging ? 'none' : 'transform 0.1s ease' }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            />
        </div>
    );
};

/* ─── Main Store Component ──────────────────────────────────────────── */
export function StoreView() {
    const [user] = useAtom(userAtom);
    const [shoppingBag, setShoppingBag] = useAtom(storeShoppingBagAtom);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isBagOpen, setIsBagOpen] = useState(false);
    const [storeLogo, setStoreLogo] = useState('');
    const searchTerm = useAtomValue(storeSearchTermAtom);

    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [showFullscreenViewer, setShowFullscreenViewer] = useState(false);

    const isClient = user?.role === 'Client';
    const isVendor = user?.role === 'Vendor';

    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const fallbackExchangeRate = useAtomValue(exchangeRateAtom);
    const exchangeRate = liveExchangeRate || fallbackExchangeRate || 18;

    useEffect(() => {
        async function fetchStoreItems() {
            setLoading(true);
            const { data, error } = await supabase.from('inventory').select('*').in('status', ['Available', 'Avaiable', 'Catalog']).order('timestamp', { ascending: false });
            if (!error && data) {
                let mappedItems: InventoryItem[] = data.map(d => {
                    let mediaList: string[] = [];
                    if (Array.isArray(d.image_urls)) mediaList.push(...d.image_urls);
                    else if (d.image_urls) {
                        try { const p = JSON.parse(d.image_urls); if (Array.isArray(p)) mediaList.push(...p); else mediaList.push(d.image_urls); } catch { mediaList.push(d.image_urls); }
                    }
                    if (d.media_urls) mediaList.push(...d.media_urls.split(',').map((u: string) => u.trim()).filter(Boolean));
                    if (d.generatedPngUrl && !mediaList.includes(d.generatedPngUrl)) mediaList.push(d.generatedPngUrl);
                    mediaList = mediaList.map(url => {
                        const clean = url.trim();
                        const fileId = extractFileId(clean);
                        if (fileId && clean.toLowerCase().includes('drive.google.com') && !clean.match(/\.(mp4|webm|ogg|mov)$/i)) {
                            return `https://lh3.googleusercontent.com/d/${fileId}`;
                        }
                        return clean;
                    }).filter(Boolean);
                    return {
                        row: d.id,
                        label: d.name || d.item_id || 'Item',
                        imageUrl: mediaList[0] || null,
                        data: { ...d, itemId: d.item_id, itemNumber: d.item_number, _allMedia: mediaList } as InventoryItemData & { _allMedia?: string[] }
                    };
                });
                if (isVendor && user?.name) mappedItems = mappedItems.filter(m => m.data.itemId?.toUpperCase().startsWith(user.name.toUpperCase()));
                setItems(mappedItems);
            }
            setLoading(false);
        }
        async function fetchUserStoreSettings() {
            if (user?.id) {
                const { data } = await supabase.from('app_users').select('*').eq('id', user.id).single();
                if (data) setStoreLogo(data.store_logo || '');
            }
        }
        if (user) { fetchStoreItems(); fetchUserStoreSettings(); }
    }, [user, isVendor, isClient]);

    const handleAddToCart = (item: InventoryItem, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!shoppingBag.find(b => b.row === item.row)) setShoppingBag(prev => [...prev, item]);
    };
    const handleRemoveFromCart = (rowId: string | number) => setShoppingBag(prev => prev.filter(b => b.row !== rowId));

    const handleCheckout = async () => {
        if (shoppingBag.length === 0) return;
        const itemIds = shoppingBag.map(i => i.data.itemId || i.row);
        if (isVendor) {
            await supabase.from('inventory').update({ status: 'Delete Requested' }).in('item_id', itemIds);
            exportPDF(); exportXLSX();
            alert('Sale recorded and items requested for deletion. PDF and XLSX files generated.');
        } else {
            await supabase.from('inventory').update({ status: 'Acquisition', acquired_by: user?.id }).in('item_id', itemIds);
            alert('Items acquired! (Acquisition recorded)');
        }
        setShoppingBag([]); setIsBagOpen(false);
    };

    const exportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(20); doc.text('Sales Note', 14, 22);
        doc.setFontSize(12); doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 32); doc.text(`User: ${user?.name || user?.email}`, 14, 40);
        const tableColumn = ["Shape", "Material", "Color", "Item No", "Base+Comm", "IVA(15%)", "Total"];
        const tableRows: any[][] = [];
        let sumBase = 0, sumIva = 0, sumTotal = 0;
        shoppingBag.forEach(item => {
            const baseVal = calculatePrice(item.data), ivaVal = baseVal * 0.15, totalVal = baseVal + ivaVal;
            sumBase += baseVal; sumIva += ivaVal; sumTotal += totalVal;
            tableRows.push([item.data.shape || '-', item.data.material || '-', item.data.color || '-', item.data.itemNumber || '-', '$' + baseVal.toFixed(2), '$' + ivaVal.toFixed(2), '$' + totalVal.toFixed(2)]);
        });
        tableRows.push(["", "", "", "TOTALS", '$' + sumBase.toFixed(2), '$' + sumIva.toFixed(2), '$' + sumTotal.toFixed(2)]);
        autoTable(doc, { head: [tableColumn], body: tableRows, startY: 50 });
        doc.save(`SalesNote_${new Date().toISOString().split('T')[0]}.pdf`);
    };
    const exportXLSX = () => {
        const rows = shoppingBag.map(item => {
            const baseVal = calculatePrice(item.data), ivaVal = baseVal * 0.15;
            return { ItemNumber: item.data.itemNumber || '-', Shape: item.data.shape || '-', Material: item.data.material || '-', Color: item.data.color || '-', PriceMXN: baseVal, IVAMXN: ivaVal, TotalMXN: baseVal + ivaVal };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sales");
        XLSX.writeFile(wb, `SalesData_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const calculatePrice = (item: InventoryItemData) => {
        let base = parseFloat(item.price || item.price_mxn?.toString() || '0');
        if (isNaN(base)) base = 0;
        return isVendor ? base * 1.05 : base;
    };
    const getPriceLabel = (item: InventoryItemData) => `MXN $${calculatePrice(item).toFixed(2)}`;
    const getPriceUSD = (item: InventoryItemData) => calculatePrice(item) / exchangeRate;

    const cartTotal = shoppingBag.reduce((sum, item) => sum + calculatePrice(item.data), 0);
    const cartIva = isVendor ? cartTotal * 0.15 : 0;
    const finalTotal = cartTotal + cartIva;
    const finalTotalUSD = finalTotal / exchangeRate;

    const filteredItems = items.filter(item => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (item.data.shape || '').toLowerCase().includes(s) || (item.data.material || '').toLowerCase().includes(s) || (item.data.color || '').toLowerCase().includes(s) || (item.data.itemNumber || '').toString().includes(s) || (item.data.itemId || '').toLowerCase().includes(s);
    });

    const openPanel = (item: InventoryItem) => { setSelectedItem(item); setGalleryIndex(0); setShowFullscreenViewer(false); };
    const closePanel = () => { setSelectedItem(null); setGalleryIndex(0); setShowFullscreenViewer(false); };

    const renderGalleryMedia = (url: string) => {
        if (url.match(/\.(mp4|webm|ogg|mov)$/i))
            return <video src={url} controls autoPlay loop muted playsInline className="w-full h-full object-contain rounded-2xl" />;
        return <img src={url} alt="Gallery item" className="w-full h-full object-contain drop-shadow-2xl rounded-2xl" />;
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-(--background-color) relative">
            {/* Top bar */}
            <div className="flex items-center justify-end px-6 py-4 border-b border-white/5 gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsBagOpen(true)}
                        className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 flex items-center justify-center hover:scale-105">
                        <ShoppingBag className="w-5 h-5 text-white opacity-80" strokeWidth={2} />
                        {shoppingBag.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-(--main-color) text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-black/20 shadow-lg shadow-(--main-color)/20 animate-in zoom-in duration-200">
                                {shoppingBag.length}
                            </span>
                        )}
                    </button>
                    {(isVendor || isClient) && storeLogo && (
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 shadow-lg">
                            <img src={storeLogo} className="w-full h-full object-contain p-1" alt="Store Logo" />
                        </div>
                    )}
                </div>
            </div>

            {/* Catalog Grid */}
            <div className="flex-1 overflow-y-auto p-5 md:p-7 custom-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <div className="w-8 h-8 border-2 border-(--main-color)/40 border-t-(--main-color) rounded-full animate-spin" />
                        <span className="text-xs font-black text-white/30 tracking-[0.3em] uppercase">Loading catalog...</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4 opacity-50">
                        <PackageSearch size={40} className="text-white/20" />
                        <span className="text-sm font-black text-white/50 tracking-widest uppercase text-center">No items matched your search</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 antialiased">
                        {filteredItems.map(item => {
                            const hasMultipleMedia = ((item.data as any)._allMedia?.length || 0) > 1;
                            const isVideo = item.imageUrl?.match(/\.(mp4|webm|ogg|mov)$/i);
                            const normCard = normalizeInventoryData(item.data);
                            const calcCard = calculateCodesAndPrices({ ...normCard, price: normCard.price_mxn || normCard.price }, exchangeRate, '326');
                            const inBag = shoppingBag.some(b => b.row === item.row);

                            return (
                                <div
                                    key={item.row}
                                    onClick={() => openPanel(item)}
                                    className="group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer bg-white/[0.03] border border-white/[0.06] hover:border-(--main-color)/30 transition-all duration-400 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-(--main-color)/10"
                                >
                                    {/* Image */}
                                    <div className="aspect-[4/3] relative overflow-hidden bg-gradient-to-br from-white/5 to-black/30">
                                        {isVideo ? (
                                            <div className="w-full h-full relative">
                                                <video src={item.imageUrl!} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" muted loop playsInline />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                    <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                                                        <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.label}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <PackageSearch className="w-10 h-10 opacity-10 text-white" />
                                            </div>
                                        )}

                                        {/* Gradient overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                        {/* Media count badge */}
                                        {hasMultipleMedia && (
                                            <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-black text-white/70 border border-white/10 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-(--main-color)" />
                                                {(item.data as any)._allMedia.length}
                                            </div>
                                        )}

                                        {/* In-bag indicator */}
                                        {inBag && (
                                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-(--main-color) flex items-center justify-center shadow-lg shadow-(--main-color)/40">
                                                <ShoppingBag size={11} strokeWidth={2.5} className="text-black" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-3.5 flex flex-col gap-2 flex-1">
                                        <div>
                                            <div className="font-bold text-sm text-white leading-tight truncate">{normCard.shape} <span className="opacity-60 font-medium">{normCard.material}</span></div>
                                            {normCard.color && <div className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mt-0.5 truncate">{normCard.color}</div>}
                                        </div>

                                        {/* Internal codes */}
                                        <div className="text-[9px] font-mono space-y-0.5 border-t border-white/5 pt-2">
                                            <div className="flex items-center gap-1">
                                                <Tag size={8} className="opacity-40 shrink-0" />
                                                <span className="text-white/40">TAG:</span>
                                                <span className="text-white/80 font-bold">{calcCard.bookBardcode || normCard.itemNumber || '—'}</span>
                                            </div>
                                            {!isVendor && calcCard.bookAqCode && (
                                                <>
                                                    <div className="flex items-center gap-2 text-white/50">
                                                        <span className="text-white/30">ACQ</span><span className="text-white/70">{calcCard.bookAqCode}</span>
                                                        <span className="text-white/20">·</span>
                                                        <span className="text-white/30">LND</span><span className="text-white/70">{calcCard.bookLandCode}</span>
                                                    </div>
                                                    <div className="text-white/40">
                                                        RT USD: <span className="text-(--main-color) font-bold">${calcCard.bookRetail}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Price row */}
                                        <div className="mt-auto pt-2 flex items-center justify-between border-t border-white/5">
                                            <div>
                                                <span className="text-sm font-black text-(--main-color)">{getPriceLabel(item.data)}</span>
                                                {!isVendor && <div className="text-[9px] text-white/30 mt-0.5">${getPriceUSD(item.data).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</div>}
                                            </div>
                                            <button
                                                onClick={(e) => handleAddToCart(item, e)}
                                                className={`p-2 rounded-xl transition-all hover:scale-110 ${inBag ? 'bg-(--main-color)/20 text-(--main-color) border border-(--main-color)/30' : 'bg-white/5 text-white/50 hover:bg-(--main-color) hover:text-black border border-white/10 hover:border-(--main-color)'}`}
                                            >
                                                <ShoppingBag size={13} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ─── Detail Panel ────────────────────────────────────────────── */}
            {selectedItem && (() => {
                const norm = normalizeInventoryData(selectedItem.data);
                const calculated = calculateCodesAndPrices({ ...norm, price: norm.price_mxn || norm.price }, exchangeRate, '326');
                const mediaFiles = (selectedItem.data as any)._allMedia || [];
                const currentMediaUrl = mediaFiles[galleryIndex] || '';
                const isCurrentVideo = currentMediaUrl.match(/\.(mp4|webm|ogg|mov)$/i);

                return (
                    <div className="fixed inset-0 z-100 flex items-center justify-center animate-in fade-in duration-200"
                        onClick={closePanel}>

                        {/* Blurred background image — uses <img> to handle cross-origin sources */}
                        {currentMediaUrl && !isCurrentVideo && (
                            <img
                                src={currentMediaUrl}
                                aria-hidden="true"
                                className="absolute inset-0 w-full h-full object-cover scale-110 pointer-events-none select-none"
                                style={{ filter: 'blur(48px) brightness(0.25) saturate(1.8)' }}
                            />
                        )}
                        {/* Overlay scrim */}
                        <div className="absolute inset-0 bg-black/50" />

                        {/* Close button */}
                        <button onClick={closePanel}
                            className="absolute top-5 right-5 z-50 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all hover:scale-110 border border-white/10 backdrop-blur-md">
                            <X size={20} strokeWidth={2} />
                        </button>

                        {/* Panel */}
                        <div className="relative z-10 w-full max-w-6xl h-full max-h-[92vh] flex flex-col md:flex-row rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4 duration-300 m-4"
                            onClick={(e) => e.stopPropagation()}>

                            {/* Media Side */}
                            <div className="w-full md:w-3/5 h-56 md:h-full relative flex items-center justify-center group overflow-hidden bg-black/20">
                                {mediaFiles.length === 0 ? (
                                    <div className="flex flex-col items-center gap-3 opacity-30">
                                        <PackageSearch size={40} />
                                        <span className="text-xs font-black uppercase tracking-widest">No Media</span>
                                    </div>
                                ) : (
                                    <>
                                        {/* Main media */}
                                        <div className="w-full h-full p-4 md:p-8 cursor-pointer animate-in fade-in duration-300" onClick={() => !isCurrentVideo && setShowFullscreenViewer(true)}>
                                            {renderGalleryMedia(currentMediaUrl)}
                                        </div>

                                        {/* Zoom hint */}
                                        {!isCurrentVideo && (
                                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] text-white/60 font-bold uppercase tracking-widest">
                                                <ZoomIn size={12} />
                                                Click to zoom
                                            </div>
                                        )}

                                        {/* Nav arrows */}
                                        {mediaFiles.length > 1 && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); setGalleryIndex(prev => prev === 0 ? mediaFiles.length - 1 : prev - 1); }}
                                                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/40 hover:bg-black/70 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 border border-white/10">
                                                    <ChevronLeft size={20} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setGalleryIndex(prev => prev === mediaFiles.length - 1 ? 0 : prev + 1); }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/40 hover:bg-black/70 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 border border-white/10">
                                                    <ChevronRight size={20} />
                                                </button>
                                                {/* Dot nav */}
                                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                                                    {mediaFiles.map((_: any, idx: number) => (
                                                        <button key={idx} onClick={() => setGalleryIndex(idx)}
                                                            className={`rounded-full transition-all duration-200 ${idx === galleryIndex ? 'w-5 h-1.5 bg-(--main-color)' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60'}`}
                                                        />
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Details Side */}
                            <div className="w-full md:w-2/5 h-full overflow-y-auto flex flex-col custom-scrollbar bg-black/40 backdrop-blur-2xl border-l border-white/10">
                                <div className="p-6 md:p-8 flex flex-col h-full">
                                    {/* Vendor color-coded TAG ID — large, prominent */}
                                    {(() => {
                                        const tagId = calculated.bookBardcode || norm.itemNumber || '';
                                        const vendorPrefix = String(norm.itemId || '').split('-')[0] || '';
                                        const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || 'var(--main-color)';
                                        return (
                                            <div className="mb-5 flex flex-col gap-2">
                                                {/* Large TAG ID */}
                                                <div
                                                    className="flex items-center gap-2 px-4 py-3 rounded-2xl border"
                                                    style={{
                                                        background: `${vendorColor}18`,
                                                        borderColor: `${vendorColor}40`,
                                                    }}
                                                >
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                                        style={{ background: vendorColor, boxShadow: `0 0 8px ${vendorColor}` }}
                                                    />
                                                    <Tag size={13} style={{ color: vendorColor }} />
                                                    <span
                                                        className="text-sm font-black tracking-[0.2em] uppercase font-mono"
                                                        style={{ color: vendorColor }}
                                                    >
                                                        {tagId || 'ITEM'}
                                                    </span>
                                                    {vendorPrefix && (
                                                        <span
                                                            className="ml-auto text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                                                            style={{ background: `${vendorColor}30`, color: vendorColor }}
                                                        >
                                                            {vendorPrefix}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Status pill */}
                                                {norm.status && (
                                                    <span className="self-start text-[9px] font-black uppercase tracking-widest text-white/30 bg-white/5 px-2 py-1 rounded-full border border-white/5">
                                                        {norm.status}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Title */}
                                    <h2 className="text-2xl md:text-3xl font-black text-white leading-tight mb-1">
                                        {norm.shape}
                                    </h2>
                                    <p className="text-sm font-semibold text-white/50 mb-1">{norm.material}</p>
                                    <p className="text-xs font-bold text-white/30 uppercase tracking-widest pb-5 mb-5 border-b border-white/10">{norm.color}</p>

                                    {/* Body */}
                                    <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar">
                                        {/* Description */}
                                        {norm.shortDescription && (
                                            <div>
                                                <h3 className="text-[9px] text-white/30 uppercase tracking-[0.25em] font-black mb-2">About</h3>
                                                <p className="text-sm text-white/70 leading-relaxed">{norm.shortDescription}</p>
                                            </div>
                                        )}

                                        {/* Specifications */}
                                        <div>
                                            <h3 className="text-[9px] text-white/30 uppercase tracking-[0.25em] font-black mb-3">Specifications</h3>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                                    <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">Dimensions</span>
                                                    <span className="block text-xs font-mono font-bold text-white/90">
                                                        {norm.lengthCm || '-'}×{norm.widthCm || '-'}×{norm.heightCm || '-'} cm
                                                    </span>
                                                    <span className="block text-[10px] font-mono text-white/40 mt-0.5">
                                                        {norm.lengthCm && !isNaN(Number(norm.lengthCm)) ? (Number(norm.lengthCm) / 2.54).toFixed(1) : '-'}×{norm.widthCm && !isNaN(Number(norm.widthCm)) ? (Number(norm.widthCm) / 2.54).toFixed(1) : '-'}×{norm.heightCm && !isNaN(Number(norm.heightCm)) ? (Number(norm.heightCm) / 2.54).toFixed(1) : '-'} in
                                                    </span>
                                                </div>
                                                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                                    <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">Weight</span>
                                                    <span className="block text-xs font-mono font-bold text-white/90">{norm.weightKg || '-'} kg</span>
                                                    <span className="block text-[10px] font-mono text-white/40 mt-0.5">
                                                        {norm.weightKg && !isNaN(Number(norm.weightKg)) ? (Number(norm.weightKg) * 2.20462).toFixed(1) : '-'} lbs
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pricing codes — non-vendor only */}
                                        {!isVendor && calculated.bookAqCode && (
                                            <div>
                                                <h3 className="text-[9px] text-white/30 uppercase tracking-[0.25em] font-black mb-3">Internal Codes</h3>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                                        <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">AQC Code</span>
                                                        <span className="text-sm font-mono font-black text-(--main-color)">{calculated.bookAqCode}</span>
                                                    </div>
                                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                                        <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">LND Code</span>
                                                        <span className="text-sm font-mono font-black text-yellow-400">{calculated.bookLandCode}</span>
                                                    </div>
                                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                                        <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">Landed USD</span>
                                                        <span className="text-sm font-mono font-black text-white/80">${parseFloat(calculated.bookLanded).toFixed(2)}</span>
                                                    </div>
                                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                                        <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">Retail USD</span>
                                                        <span className="text-sm font-mono font-black text-emerald-400">${parseFloat(calculated.bookRetail).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Footer CTA */}
                                    <div className="mt-6 pt-6 border-t border-white/10 flex items-end justify-between gap-4">
                                        <div>
                                            <span className="block text-[9px] text-white/30 uppercase tracking-widest font-black mb-1">Acquisition Price</span>
                                            <span className="text-2xl font-black text-white">{getPriceLabel(selectedItem.data)}</span>
                                            {!isVendor && (
                                                <span className="block text-xs font-bold text-white/30 mt-0.5">≈ ${getPriceUSD(selectedItem.data).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleAddToCart(selectedItem)}
                                            className="flex items-center gap-2 py-3 px-6 bg-(--main-color) text-black rounded-2xl font-black tracking-widest text-sm shadow-lg shadow-(--main-color)/20 hover:brightness-110 hover:-translate-y-0.5 transition-all whitespace-nowrap"
                                        >
                                            <ShoppingBag size={16} strokeWidth={2.5} />
                                            ADD TO BAG
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Fullscreen Image Viewer */}
            {showFullscreenViewer && selectedItem && (() => {
                const mediaFiles = (selectedItem.data as any)._allMedia || [];
                const url = mediaFiles[galleryIndex];
                if (!url || url.match(/\.(mp4|webm|ogg|mov)$/i)) return null;
                return <FullscreenImageViewer src={url} onClose={() => setShowFullscreenViewer(false)} />;
            })()}

            {/* ─── Shopping Bag Drawer ─────────────────────────────────── */}
            {isBagOpen && (
                <div className="absolute inset-y-0 right-0 w-full sm:w-[400px] bg-(--background-color)/95 backdrop-blur-2xl border-l border-white/10 flex flex-col z-50 animate-in slide-in-from-right-8 duration-300 shadow-2xl">
                    <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.03]">
                        <div className="flex items-center gap-3">
                            <ShoppingBag className="w-5 h-5 text-(--main-color)" />
                            <h2 className="text-sm font-black uppercase tracking-widest text-(--text-color)">Acquisition Bag</h2>
                        </div>
                        <button onClick={() => setIsBagOpen(false)} className="p-2 text-(--text-color) opacity-50 hover:opacity-100 bg-white/5 hover:bg-white/10 rounded-full transition-all">
                            <X className="w-5 h-5" strokeWidth={2} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 custom-scrollbar text-(--text-color)">
                        {shoppingBag.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                                <ShoppingBag className="w-12 h-12" />
                                <p className="text-xs font-black uppercase tracking-widest text-center">Your bag is empty</p>
                            </div>
                        ) : shoppingBag.map(item => (
                            <div key={item.row} className="flex items-center gap-3 p-3.5 bg-white/[0.04] hover:bg-white/[0.07] rounded-2xl border border-white/[0.06] transition-colors group">
                                <div className="w-14 h-14 bg-black/20 rounded-xl overflow-hidden border border-white/5 shrink-0">
                                    {item.imageUrl?.match(/\.(mp4|webm|ogg|mov)$/i) ? (
                                        <video src={item.imageUrl} className="w-full h-full object-cover opacity-80" />
                                    ) : item.imageUrl ? (
                                        <img src={item.imageUrl} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center"><PackageSearch size={16} className="opacity-20" /></div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">{item.data.shape} <span className="opacity-50">{item.data.material}</span></p>
                                    <p className="text-[10px] opacity-30 font-black uppercase tracking-widest truncate">{item.data.color}</p>
                                    <p className="text-xs text-(--main-color) font-black mt-1.5">
                                        {getPriceLabel(item.data)}
                                        {!isVendor && <span className="text-[9px] opacity-40 ml-1">≈ ${getPriceUSD(item.data).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</span>}
                                    </p>
                                </div>
                                <button onClick={() => handleRemoveFromCart(item.row)}
                                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                    <X className="w-4 h-4" strokeWidth={2.5} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="p-5 border-t border-white/10 flex flex-col gap-3 bg-black/20 backdrop-blur-md text-(--text-color)">
                        <div className="flex justify-between text-[11px] font-bold tracking-widest opacity-50 uppercase">
                            <span>Subtotal ({shoppingBag.length} item{shoppingBag.length !== 1 && 's'})</span>
                            <span>MXN ${cartTotal.toFixed(2)}</span>
                        </div>
                        {isVendor && (
                            <div className="flex justify-between text-[11px] font-bold tracking-widest opacity-50 uppercase">
                                <span>IVA (15%)</span>
                                <span>MXN ${cartIva.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-base font-black tracking-widest uppercase mt-1 pt-3 border-t border-white/10">
                            <span>Total</span>
                            <div className="flex flex-col items-end">
                                <span className="text-(--main-color)">MXN ${finalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                {!isVendor && <span className="text-[10px] opacity-40 font-bold">≈ ${finalTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>}
                            </div>
                        </div>
                        <button
                            disabled={shoppingBag.length === 0}
                            onClick={handleCheckout}
                            className={`mt-2 w-full py-4 rounded-xl text-sm font-black tracking-widest transition-all ${shoppingBag.length > 0 ? 'bg-(--main-color) text-black hover:brightness-110 hover:-translate-y-0.5 shadow-lg shadow-(--main-color)/20' : 'bg-white/5 border border-white/10 opacity-30 cursor-not-allowed'}`}
                        >
                            {isVendor ? 'REGISTER SALE & EXPORT' : 'ACQUIRE ITEMS'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
