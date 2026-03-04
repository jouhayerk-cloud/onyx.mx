import React, { useState, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { userAtom, storeShoppingBagAtom, storeSearchTermAtom, exchangeRateAtom, liveExchangeRateAtom } from '../../lib/atoms';
import { extractFileId } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { InventoryItemData, InventoryItem } from '../../lib/Types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Search, X, ChevronLeft, ChevronRight, Play, ShoppingBag } from 'lucide-react';

export function StoreView() {
    const [user] = useAtom(userAtom);
    const [shoppingBag, setShoppingBag] = useAtom(storeShoppingBagAtom);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isBagOpen, setIsBagOpen] = useState(false);
    const [storeLogo, setStoreLogo] = useState('');
    const searchTerm = useAtomValue(storeSearchTermAtom);

    // Floating Panel State
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [galleryIndex, setGalleryIndex] = useState(0);

    const isClient = user?.role === 'Client';
    const isVendor = user?.role === 'Vendor';

    const liveExchangeRate = useAtomValue(liveExchangeRateAtom);
    const fallbackExchangeRate = useAtomValue(exchangeRateAtom);
    const exchangeRate = liveExchangeRate || fallbackExchangeRate || 18;

    useEffect(() => {
        async function fetchStoreItems() {
            setLoading(true);
            let query = supabase.from('inventory').select('*').in('status', ['Available', 'Avaiable', 'Catalog']);

            const { data, error } = await query.order('timestamp', { ascending: false });
            if (!error && data) {
                let mappedItems: InventoryItem[] = data.map(d => {
                    // Parse multiple images and videos
                    let mediaList: string[] = [];
                    if (Array.isArray(d.image_urls)) {
                        mediaList.push(...d.image_urls);
                    } else if (d.image_urls) {
                        try {
                            const parsed = JSON.parse(d.image_urls);
                            if (Array.isArray(parsed)) mediaList.push(...parsed);
                            else mediaList.push(d.image_urls);
                        } catch (e) {
                            mediaList.push(d.image_urls);
                        }
                    }
                    if (d.media_urls) {
                        const mUrls = d.media_urls.split(',').map((u: string) => u.trim()).filter(Boolean);
                        mediaList.push(...mUrls);
                    }
                    if (d.generatedPngUrl && !mediaList.includes(d.generatedPngUrl)) {
                        mediaList.push(d.generatedPngUrl);
                    }

                    // Handle Google Drive links for direct image rendering
                    mediaList = mediaList.map(url => {
                        const clean = url.trim();
                        const fileId = extractFileId(clean);
                        if (fileId && clean.toLowerCase().includes('drive.google.com')) {
                            // Video files might not work via lh3, but standard images do
                            if (!clean.match(/\.(mp4|webm|ogg|mov)$/i)) {
                                return `https://lh3.googleusercontent.com/d/${fileId}`;
                            }
                        }
                        return clean;
                    }).filter(Boolean);

                    return {
                        row: d.id,
                        label: d.name || d.item_id || 'Item',
                        imageUrl: mediaList[0] || null, // Primary thumbnail
                        data: { ...d, itemId: d.item_id, itemNumber: d.item_number, _allMedia: mediaList } as InventoryItemData & { _allMedia?: string[] }
                    };
                });

                // Client-side filtering for Vendors based on their name prefix (e.g. 'JM', 'EM')
                if (isVendor && user?.name) {
                    mappedItems = mappedItems.filter((m) =>
                        m.data.itemId && m.data.itemId.toUpperCase().startsWith(user.name.toUpperCase())
                    );
                }

                setItems(mappedItems);
            }
            setLoading(false);
        }

        async function fetchUserStoreSettings() {
            if (user?.id) {
                const { data } = await supabase.from('app_users').select('*').eq('id', user.id).single();
                if (data) {
                    setStoreLogo(data.store_logo || '');
                }
            }
        }

        if (user) {
            fetchStoreItems();
            fetchUserStoreSettings();
        }
    }, [user, isVendor, isClient]);

    const handleAddToCart = (item: InventoryItem, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!shoppingBag.find(b => b.row === item.row)) {
            setShoppingBag(prev => [...prev, item]);
        }
    };

    const handleRemoveFromCart = (rowId: string | number) => {
        setShoppingBag(prev => prev.filter(b => b.row !== rowId));
    };

    const handleCheckout = async () => {
        if (shoppingBag.length === 0) return;
        const itemIds = shoppingBag.map(i => i.data.itemId || i.row);

        if (isVendor) {
            await supabase.from('inventory')
                .update({ status: 'Delete Requested' })
                .in('item_id', itemIds);

            exportPDF();
            exportXLSX();
            alert('Sale recorded and items requested for deletion. PDF and XLSX files generated.');
        } else {
            await supabase.from('inventory')
                .update({ status: 'Acquisition', acquired_by: user?.id })
                .in('item_id', itemIds);

            alert('Items acquired! (Acquisition recorded)');
        }

        setShoppingBag([]);
        setIsBagOpen(false);
    };

    const exportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text('Sales Note', 14, 22);

        doc.setFontSize(12);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 32);
        doc.text(`User: ${user?.name || user?.email}`, 14, 40);

        const tableColumn = ["Shape", "Material", "Color", "Item No", "Base+Comm", "IVA(15%)", "Total"];
        const tableRows: any[][] = [];

        let sumBase = 0;
        let sumIva = 0;
        let sumTotal = 0;

        shoppingBag.forEach(item => {
            const baseVal = calculatePrice(item.data);
            const ivaVal = baseVal * 0.15;
            const totalVal = baseVal + ivaVal;

            sumBase += baseVal;
            sumIva += ivaVal;
            sumTotal += totalVal;

            const itemData = [
                item.data.shape || '-',
                item.data.material || '-',
                item.data.color || '-',
                item.data.itemNumber || '-',
                '$' + baseVal.toFixed(2),
                '$' + ivaVal.toFixed(2),
                '$' + totalVal.toFixed(2)
            ];
            tableRows.push(itemData);
        });

        tableRows.push(["", "", "", "TOTALS", '$' + sumBase.toFixed(2), '$' + sumIva.toFixed(2), '$' + sumTotal.toFixed(2)]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 50,
        });

        doc.save(`SalesNote_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const exportXLSX = () => {
        const rows = shoppingBag.map(item => {
            const baseVal = calculatePrice(item.data);
            const ivaVal = baseVal * 0.15;
            return {
                ItemNumber: item.data.itemNumber || '-',
                Shape: item.data.shape || '-',
                Material: item.data.material || '-',
                Color: item.data.color || '-',
                PriceMXN: baseVal,
                IVAMXN: ivaVal,
                TotalMXN: baseVal + ivaVal,
            };
        });
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");
        XLSX.writeFile(workbook, `SalesData_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const calculatePrice = (item: InventoryItemData) => {
        let basePrice = parseFloat(item.price || item.price_mxn?.toString() || '0');
        if (isNaN(basePrice)) basePrice = 0;

        if (isVendor) {
            return basePrice * 1.05;
        }
        return basePrice;
    };

    const getPriceLabel = (item: InventoryItemData) => {
        const val = calculatePrice(item);
        return `MXN $${val.toFixed(2)}`;
    };

    const getPriceUSD = (item: InventoryItemData) => {
        return calculatePrice(item) / exchangeRate;
    };

    const cartTotal = shoppingBag.reduce((sum, item) => sum + calculatePrice(item.data), 0);
    const cartIva = isVendor ? cartTotal * 0.15 : 0;
    const finalTotal = cartTotal + cartIva;

    const cartTotalUSD = cartTotal / exchangeRate;
    const finalTotalUSD = finalTotal / exchangeRate;

    const getSizesString = (item: InventoryItemData) => {
        const cmH = parseFloat(item.heightCm || '0');
        const cmW = parseFloat(item.widthCm || '0');
        const cmL = parseFloat(item.lengthCm || '0');
        const kg = parseFloat(item.weightKg || '0');

        if (!cmH && !cmW && !cmL && !kg) return '';

        const inH = (cmH / 2.54).toFixed(1);
        const inW = (cmW / 2.54).toFixed(1);
        const inL = (cmL / 2.54).toFixed(1);
        const lbs = (kg * 2.20462).toFixed(1);

        return `${cmL}x${cmW}x${cmH}cm (${inL}x${inW}x${inH}") - ${kg}kg (${lbs}lbs)`;
    };

    // Filter Items
    const filteredItems = items.filter(item => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            (item.data.shape || '').toLowerCase().includes(s) ||
            (item.data.material || '').toLowerCase().includes(s) ||
            (item.data.color || '').toLowerCase().includes(s) ||
            (item.data.itemNumber || '').toString().includes(s) ||
            (item.data.itemId || '').toLowerCase().includes(s)
        );
    });

    const openPanel = (item: InventoryItem) => {
        setSelectedItem(item);
        setGalleryIndex(0);
    };

    const closePanel = () => {
        setSelectedItem(null);
        setGalleryIndex(0);
    };

    const renderGalleryMedia = (url: string) => {
        const isVideo = url.match(/\.(mp4|webm|ogg|mov)$/i);
        if (isVideo) {
            return (
                <video src={url} controls autoPlay loop muted playsInline className="w-full h-full object-contain backdrop-blur-md rounded-2xl border border-white/5" />
            );
        }
        return (
            <img src={url} alt="Gallery item" className="w-full h-full object-contain drop-shadow-2xl rounded-2xl" />
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-(--background-color) relative">
            <div className="flex items-center justify-end p-6 border-b border-white/5 gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setIsBagOpen(true)}
                        className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10 flex items-center justify-center"
                    >
                        <ShoppingBag className="w-5 h-5 text-white opacity-80" strokeWidth={2} />
                        {shoppingBag.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-(--main-color) text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-black/20 shadow-lg shadow-(--main-color)/20">
                                {shoppingBag.length}
                            </span>
                        )}
                    </button>
                    {(isVendor || isClient) && storeLogo && (
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-white/5 flex items-center justify-center font-bold text-xs uppercase overflow-hidden border border-white/10 shadow-lg">
                            <img src={storeLogo} className="w-full h-full object-contain p-1" alt="Store Logo" />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8">
                {loading ? (
                    <div className="flex items-center justify-center h-40 animate-pulse">
                        <span className="text-sm font-black text-white/30 tracking-widest uppercase">Loading exclusive catalog...</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-60">
                        <ShoppingBag size={32} className="text-white/20" />
                        <span className="text-sm font-black text-white/50 tracking-widest uppercase text-center">No items matched your search</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 antialiased">
                        {filteredItems.map(item => {
                            const hasMultipleMedia = ((item.data as any)._allMedia?.length || 0) > 1;
                            const isVideo = item.imageUrl?.match(/\.(mp4|webm|ogg|mov)$/i);

                            return (
                                <div
                                    key={item.row}
                                    onClick={() => openPanel(item)}
                                    className="bg-white/3 border border-white/5 rounded-2xl overflow-hidden hover:border-(--main-color)/40 hover:bg-white/5 transition-all duration-300 group flex flex-col cursor-pointer relative shadow-lg hover:shadow-2xl hover:shadow-(--main-color)/5 hover:-translate-y-1"
                                >
                                    <div className="aspect-square bg-black/40 relative flex items-center justify-center overflow-hidden p-0">
                                        {isVideo ? (
                                            <div className="w-full h-full relative">
                                                <video src={item.imageUrl!} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" muted loop playsInline />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Play className="w-8 h-8 text-white/60 drop-shadow-lg" fill="currentColor" />
                                                </div>
                                            </div>
                                        ) : item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.label} className="w-full h-full object-cover filter brightness-90 group-hover:brightness-110 group-hover:scale-105 transition-all duration-500 ease-out" />
                                        ) : (
                                            <svg className="w-12 h-12 opacity-10 text-white"><use href="#image" /></svg>
                                        )}

                                        {hasMultipleMedia && (
                                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg text-[9px] font-black text-white/80 border border-white/10 flex items-center gap-1 shadow-md">
                                                {(item.data as any)._allMedia.length} Media
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-4 flex flex-col gap-1.5 flex-1 relative z-10 bg-linear-to-t from-black/40 to-transparent">
                                        <div className="font-bold text-sm text-white truncate drop-shadow-sm">{item.data.shape} {item.data.material}</div>
                                        <div className="text-[10px] text-white/50 uppercase tracking-widest font-semibold">{item.data.color}</div>

                                        <div className="mt-auto pt-3 flex items-center justify-between border-t border-white/5">
                                            <span className="text-[13px] font-black tracking-wider text-(--main-color) drop-shadow-sm">
                                                {getPriceLabel(item.data)}
                                                {!isVendor && <span className="text-[9px] text-white/40 ml-1">(${getPriceUSD(item.data).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD)</span>}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center backdrop-blur-[2px] z-20">
                                        <button
                                            onClick={(e) => handleAddToCart(item, e)}
                                            className="button text-xs font-black tracking-widest py-3! px-6! bg-(--main-color) text-black rounded-xl translate-y-4 group-hover:translate-y-0 transition-all duration-300 shadow-xl hover:scale-105"
                                        >
                                            QUICK ADD
                                        </button>
                                        <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest mt-4 translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-75">Click to view details</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Dynamic Fullscreen Item Viewer Panel */}
            {selectedItem && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-(--background-color)/90 backdrop-blur-xl animate-in fade-in duration-300 p-4 sm:p-8">
                    <button onClick={closePanel} className="absolute top-6 right-6 p-3 bg-(--text-color)/10 hover:bg-(--text-color)/20 text-(--text-color) rounded-full transition-all z-50 shadow-xl border border-(--text-color)/10 hover:scale-110">
                        <X size={24} strokeWidth={2} />
                    </button>

                    <div className="w-full max-w-6xl h-full max-h-[90vh] bg-(--background-color) rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row border border-(--text-color)/10 relative">

                        {/* Media Gallery Section */}
                        <div className="w-full md:w-3/5 lg:w-2/3 h-64 md:h-full bg-black/5 relative flex items-center justify-center group overflow-hidden border-b md:border-b-0 md:border-r border-(--text-color)/5">
                            {(() => {
                                const mediaFiles = (selectedItem.data as any)._allMedia || [];
                                if (mediaFiles.length === 0) {
                                    return <span className="text-(--text-color) opacity-30 font-bold uppercase tracking-widest">No Media Available</span>;
                                }

                                const currentMediaUrl = mediaFiles[galleryIndex];

                                return (
                                    <>
                                        <div className="w-full h-full animate-in fade-in slide-in-from-bottom-4 duration-500 p-2 md:p-8">
                                            {renderGalleryMedia(currentMediaUrl)}
                                        </div>

                                        {mediaFiles.length > 1 && (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setGalleryIndex(prev => prev === 0 ? mediaFiles.length - 1 : prev - 1); }}
                                                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-(--background-color)/50 hover:bg-(--background-color)/80 text-(--text-color) rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 border border-(--text-color)/10"
                                                >
                                                    <ChevronLeft size={24} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setGalleryIndex(prev => prev === mediaFiles.length - 1 ? 0 : prev + 1); }}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-(--background-color)/50 hover:bg-(--background-color)/80 text-(--text-color) rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 border border-(--text-color)/10"
                                                >
                                                    <ChevronRight size={24} />
                                                </button>

                                                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-(--background-color)/50 backdrop-blur-md rounded-2xl border border-(--text-color)/10">
                                                    {mediaFiles.map((_: any, idx: number) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => setGalleryIndex(idx)}
                                                            className={`w-2 h-2 rounded-full transition-all ${idx === galleryIndex ? 'bg-(--main-color) w-6' : 'bg-(--text-color) opacity-30 hover:opacity-60'}`}
                                                        />
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* Details Section */}
                        <div className="w-full md:w-2/5 lg:w-1/3 h-full overflow-y-auto p-6 md:p-10 flex flex-col custom-scrollbar bg-linear-to-br from-(--text-color)/5 to-transparent">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-(--main-color) bg-(--main-color)/10 inline-block w-fit px-3 py-1 rounded-full mb-4 border border-(--main-color)/20">
                                {selectedItem.data.itemNumber ? `ID: ${selectedItem.data.itemNumber}` : 'Item Info'}
                            </span>

                            <h2 className="text-3xl font-black text-(--text-color) mb-2 leading-tight">
                                {selectedItem.data.shape} <span className="opacity-50">{selectedItem.data.material}</span>
                            </h2>
                            <p className="text-sm font-bold text-(--text-color) opacity-60 uppercase tracking-widest mb-6 pb-6 border-b border-(--text-color)/10">
                                {selectedItem.data.color}
                            </p>

                            <div className="flex-1 space-y-6">
                                {(selectedItem.data as any).short_description && (
                                    <div>
                                        <h3 className="text-[10px] text-(--text-color) opacity-40 uppercase tracking-widest font-black mb-2">About</h3>
                                        <p className="text-sm text-(--text-color) opacity-80 leading-relaxed font-medium">
                                            {(selectedItem.data as any).short_description}
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <h3 className="text-[10px] text-(--text-color) opacity-40 uppercase tracking-widest font-black mb-3">Specifications</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-(--text-color)/5 p-3 rounded-xl border border-(--text-color)/5">
                                            <span className="block text-[9px] text-(--text-color) opacity-40 uppercase tracking-wider mb-1">Dimensions</span>
                                            <span className="block text-xs font-mono font-bold text-(--text-color) opacity-90">
                                                {selectedItem.data.lengthCm}x{selectedItem.data.widthCm}x{selectedItem.data.heightCm} cm
                                            </span>
                                            <span className="block text-[10px] font-mono text-(--text-color) opacity-50 mt-1">
                                                {selectedItem.data.lengthCm && !isNaN(Number(selectedItem.data.lengthCm)) ? (Number(selectedItem.data.lengthCm) / 2.54).toFixed(1) : '-'}x{selectedItem.data.widthCm && !isNaN(Number(selectedItem.data.widthCm)) ? (Number(selectedItem.data.widthCm) / 2.54).toFixed(1) : '-'}x{selectedItem.data.heightCm && !isNaN(Number(selectedItem.data.heightCm)) ? (Number(selectedItem.data.heightCm) / 2.54).toFixed(1) : '-'} in
                                            </span>
                                        </div>
                                        <div className="bg-(--text-color)/5 p-3 rounded-xl border border-(--text-color)/5">
                                            <span className="block text-[9px] text-(--text-color) opacity-40 uppercase tracking-wider mb-1">Weight</span>
                                            <span className="block text-xs font-mono font-bold text-(--text-color) opacity-90">
                                                {selectedItem.data.weightKg || '-'} kg
                                            </span>
                                            <span className="block text-[10px] font-mono text-(--text-color) opacity-50 mt-1">
                                                {selectedItem.data.weightKg && !isNaN(Number(selectedItem.data.weightKg)) ? (Number(selectedItem.data.weightKg) * 2.20462).toFixed(1) : '-'} lbs
                                            </span>
                                        </div>
                                        {!isVendor && selectedItem.data.bookAqCode && (
                                            <div className="bg-(--text-color)/5 p-3 rounded-xl border border-(--text-color)/5">
                                                <span className="block text-[9px] text-(--text-color) opacity-40 uppercase tracking-wider mb-1">AQC Code</span>
                                                <span className="text-xs font-mono font-bold text-(--main-color)">
                                                    {selectedItem.data.bookAqCode}
                                                </span>
                                            </div>
                                        )}
                                        {!isVendor && selectedItem.data.bookLanded && (
                                            <div className="bg-(--text-color)/5 p-3 rounded-xl border border-(--text-color)/5">
                                                <span className="block text-[9px] text-(--text-color) opacity-40 uppercase tracking-wider mb-1">Landed</span>
                                                <span className="text-xs font-mono font-bold text-(--main-color)">
                                                    {selectedItem.data.bookLanded}
                                                </span>
                                            </div>
                                        )}
                                        {!isVendor && selectedItem.data.bookRetail && (
                                            <div className="bg-(--text-color)/5 p-3 rounded-xl border border-(--text-color)/5">
                                                <span className="block text-[9px] text-(--text-color) opacity-40 uppercase tracking-wider mb-1">Retail</span>
                                                <span className="text-xs font-mono font-bold text-green-500">
                                                    {selectedItem.data.bookRetail}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-(--text-color)/10 flex items-end justify-between gap-4">
                                <div>
                                    <span className="block text-[10px] text-(--text-color) opacity-40 uppercase tracking-widest font-black mb-1">Acquisition Price</span>
                                    <span className="text-2xl font-black text-(--text-color)">
                                        {getPriceLabel(selectedItem.data)}
                                    </span>
                                    {!isVendor && (
                                        <span className="text-sm font-bold text-(--text-color) opacity-40 ml-2">
                                            ≈ ${getPriceUSD(selectedItem.data).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleAddToCart(selectedItem)}
                                    className="button py-4! px-8! bg-(--main-color) text-black rounded-2xl font-black tracking-widest text-sm shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)] hover:shadow-[0_0_40px_rgba(var(--main-color-rgb),0.5)] transition-all hover:-translate-y-1 whitespace-nowrap"
                                >
                                    ADD TO BAG
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Shopping Bag Drawer / Overlay */}
            {isBagOpen && (
                <div className="absolute inset-y-0 right-0 w-full sm:w-[400px] bg-(--background-color) backdrop-blur-2xl border-l border-(--text-color)/10 flex flex-col z-50 animate-in slide-in-from-right-8 duration-300 shadow-2xl">
                    <div className="flex items-center justify-between p-6 border-b border-(--text-color)/10 bg-(--text-color)/5">
                        <div className="flex items-center gap-3">
                            <ShoppingBag className="w-5 h-5 text-(--main-color)" />
                            <h2 className="text-sm font-black uppercase tracking-widest text-(--text-color)">Acquisition Bag</h2>
                        </div>
                        <button onClick={() => setIsBagOpen(false)} className="p-2 text-(--text-color) opacity-50 hover:opacity-100 bg-(--text-color)/5 hover:bg-(--text-color)/10 rounded-full transition-all">
                            <X className="w-5 h-5" strokeWidth={2} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 custom-scrollbar text-(--text-color)">
                        {shoppingBag.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full opacity-40 gap-4">
                                <ShoppingBag className="w-12 h-12 opacity-50" />
                                <p className="text-xs font-black uppercase tracking-widest text-center">Your bag is empty.</p>
                            </div>
                        ) : (
                            shoppingBag.map(item => (
                                <div key={item.row} className="flex items-center gap-4 p-4 bg-(--text-color)/5 hover:bg-(--text-color)/10 rounded-2xl border border-(--text-color)/5 transition-colors group">
                                    <div className="w-16 h-16 bg-black/20 rounded-xl flex items-center justify-center p-0.5 overflow-hidden shadow-inner border border-(--text-color)/5 shrink-0">
                                        {item.imageUrl?.match(/\.(mp4|webm|ogg|mov)$/i) ? (
                                            <video src={item.imageUrl} className="w-full h-full object-cover rounded-lg opacity-80" />
                                        ) : item.imageUrl ? (
                                            <img src={item.imageUrl} className="w-full h-full object-cover rounded-lg" />
                                        ) : (
                                            <svg className="w-6 h-6 opacity-20"><use href="#image" /></svg>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <p className="text-xs font-bold truncate leading-tight mb-1">{item.data.shape} <span className="opacity-60">{item.data.material}</span></p>
                                        <p className="text-[10px] opacity-40 font-black uppercase tracking-widest truncate">{item.data.color}</p>
                                        <p className="text-xs text-(--main-color) font-black mt-2">
                                            {getPriceLabel(item.data)}
                                            {!isVendor && <span className="text-[9px] opacity-40 ml-1">≈ ${getPriceUSD(item.data).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</span>}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveFromCart(item.row)}
                                        className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors opacity-50 group-hover:opacity-100"
                                    >
                                        <X className="w-5 h-5" strokeWidth={2.5} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-6 border-t border-(--text-color)/10 bg-(--background-color) backdrop-blur-md flex flex-col gap-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] text-(--text-color)">
                        <div className="flex justify-between text-[11px] font-bold tracking-widest opacity-50 uppercase">
                            <span>Subtotal ({shoppingBag.length} item{shoppingBag.length !== 1 && 's'})</span>
                            <span className="">${cartTotal.toFixed(2)}</span>
                        </div>
                        {isVendor && (
                            <div className="flex justify-between text-[11px] font-bold tracking-widest opacity-50 uppercase">
                                <span>IVA (15%)</span>
                                <span className="">${cartIva.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-lg font-black tracking-widest uppercase mt-2 pt-4 border-t border-(--text-color)/10">
                            <span>Total</span>
                            <div className="flex flex-col items-end">
                                <span className="text-(--main-color)">MXN ${finalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                {!isVendor && <span className="text-[10px] opacity-40">≈ ${finalTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>}
                            </div>
                        </div>
                        <button
                            disabled={shoppingBag.length === 0}
                            onClick={handleCheckout}
                            className={`mt-4 w-full py-4 rounded-xl text-sm font-black tracking-widest transition-all ${shoppingBag.length > 0 ? 'bg-(--main-color) text-black hover:brightness-110 cursor-pointer shadow-lg shadow-(--main-color)/20 hover:-translate-y-1' : 'bg-(--text-color)/5 border border-(--text-color)/10 opacity-50 cursor-not-allowed'}`}
                        >
                            {isVendor ? 'REGISTER SALE & EXPORT' : 'ACQUIRE ITEMS'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
