import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { userAtom, storeShoppingBagAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { InventoryItemData, InventoryItem } from '../../lib/Types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export function StoreView() {
    const [user] = useAtom(userAtom);
    const [shoppingBag, setShoppingBag] = useAtom(storeShoppingBagAtom);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isBagOpen, setIsBagOpen] = useState(false);
    const [storeLogo, setStoreLogo] = useState('');

    const isClient = user?.role === 'Client';
    const isVendor = user?.role === 'Vendor';
    const isDevAdmin = user?.role === 'Developer' || user?.role === 'Admin';

    useEffect(() => {
        async function fetchStoreItems() {
            setLoading(true);
            let query = supabase.from('inventory').select('*').eq('status', 'Available');

            if (isVendor) {
                // Vendors only see their own items
                query = query.eq('vendor_id', user?.id || '');
            } else if (isClient) {
                // Clients see all available, perhaps restricted by active store logic
            }

            const { data, error } = await query.order('created_at', { ascending: false });
            if (!error && data) {
                const mappedItems: InventoryItem[] = data.map(d => ({
                    row: d.id,
                    label: d.name || d.item_id || 'Item',
                    imageUrl: d.image_urls?.[0] || d.generatedPngUrl || null,
                    data: { ...d, itemId: d.item_id, itemNumber: d.item_number } as InventoryItemData
                }));
                setItems(mappedItems);
            }
            setLoading(false);
        }

        async function fetchUserStoreSettings() {
            if (user?.id) {
                const { data } = await supabase.from('app_users').select('store_logo, store_enabled').eq('id', user.id).single();
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

    const handleAddToCart = (item: InventoryItem) => {
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

        if (isClient) {
            // Clients acquire items, pending admin review
            await supabase.from('inventory')
                .update({ status: 'Acquisition', acquired_by: user?.id })
                .in('item_id', itemIds);

            alert('Items acquired! Pending Admin / Developer review.');
        } else if (isVendor) {
            // Vendors register sale -> Delete Requested and Export Excel/PDF
            await supabase.from('inventory')
                .update({ status: 'Delete Requested' })
                .in('item_id', itemIds);

            exportPDF();
            exportXLSX();
            alert('Sale recorded and items requested for deletion. PDF and XLSX files generated.');
        } else if (isDevAdmin) {
            // Just test export for Developer
            exportPDF();
            exportXLSX();
            alert('Test checkout. Files generated. Database not mutated for Admin test.');
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
            const baseVal = calculatePrice(item.data); // vendor includes 5% in calculatePrice
            const ivaVal = baseVal * 0.15;
            const totalVal = baseVal + ivaVal;

            sumBase += baseVal;
            sumIva += ivaVal;
            sumTotal += totalVal;

            const itemData = [
                item.data.shape,
                item.data.material,
                item.data.color,
                item.data.itemNumber,
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
                ItemNumber: item.data.itemNumber,
                Shape: item.data.shape,
                Material: item.data.material,
                Color: item.data.color,
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

    // Calculate base display price (Vendors get +5%)
    const calculatePrice = (item: InventoryItemData) => {
        let basePrice = parseFloat(item.price || item.price_mxn?.toString() || '0');
        if (isNaN(basePrice)) basePrice = 0;

        if (isVendor) {
            // 5% commission for vendors
            return basePrice * 1.05;
        }
        return basePrice;
    };

    const getPriceLabel = (item: InventoryItemData) => {
        const val = calculatePrice(item);
        if (isVendor) {
            return `MXN $${val.toFixed(2)}`;
        }
        // Client views retail mxn acquisition price, here we'll assume val is MXN baseline
        return `MXN $${val.toFixed(2)}`;
    };

    const cartTotal = shoppingBag.reduce((sum, item) => sum + calculatePrice(item.data), 0);
    const cartIva = isVendor ? cartTotal * 0.15 : 0;
    const finalTotal = cartTotal + cartIva;

    // Convert metrics
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

    return (
        <div className="flex flex-col h-full overflow-hidden bg-(--background-color) relative">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div>
                    <h1 className="text-xl font-black uppercase tracking-widest text-white">
                        {isVendor ? 'Brand Storefront' : (isClient ? 'Catalog' : 'Global Store')}
                    </h1>
                    <p className="text-sm text-(--text-color-secondary)">
                        {isVendor ? 'Point of sale & basic sales printing' : 'Exclusive items available for acquisition'}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setIsBagOpen(true)}
                        className="relative p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        {shoppingBag.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-(--main-color) text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                {shoppingBag.length}
                            </span>
                        )}
                    </button>
                    {(isVendor || isClient) && (
                        <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center font-bold text-xs uppercase overflow-hidden border border-white/10">
                            {storeLogo ? (
                                <img src={storeLogo} className="w-full h-full object-contain" alt="Logo" />
                            ) : (
                                "LOGO"
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <span className="text-sm font-bold text-white/50 tracking-widest uppercase">Loading catalog...</span>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex items-center justify-center h-40">
                        <span className="text-sm font-bold text-white/50 tracking-widest uppercase">No items available.</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {items.map(item => (
                            <div key={item.row} className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden hover:border-(--main-color)/50 transition-colors group flex flex-col cursor-pointer relative">
                                <div className="aspect-square bg-white/5 relative flex items-center justify-center overflow-hidden p-2">
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.label} className="w-full h-full object-contain filter group-hover:brightness-110 transition-all drop-shadow-md" />
                                    ) : (
                                        <svg className="w-10 h-10 opacity-20"><use href="#image" /></svg>
                                    )}
                                </div>
                                <div className="p-3 flex flex-col gap-1 flex-1">
                                    <div className="font-bold text-xs text-white truncate">{item.data.shape} {item.data.material}</div>
                                    <div className="text-[9px] text-white/40 uppercase tracking-widest">{item.data.color}</div>

                                    {!isVendor && (
                                        <div className="flex flex-col gap-0.5 mt-2">
                                            <div className="text-[9px] font-mono text-(--text-color-secondary) uppercase truncate" title={getSizesString(item.data)}>
                                                {getSizesString(item.data)}
                                            </div>
                                            <div className="text-[9px] font-mono text-(--main-color) uppercase mt-1">
                                                ID: {item.data.itemNumber}
                                            </div>
                                            <div className="text-[9px] font-mono text-(--main-color) uppercase">
                                                CODE: {item.data.bookAqCode || item.data.bookLanded || 'N/A'}
                                            </div>
                                            <div className="text-[9px] font-mono text-(--main-color) uppercase">
                                                LANDED: {item.data.bookLanded || '—'}
                                            </div>
                                            <div className="text-[9px] font-mono text-(--main-color) uppercase">
                                                RETAIL: {item.data.bookRetail || '—'}
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-auto pt-2 flex items-center justify-between">
                                        <span className="text-sm font-black tracking-wider text-white">
                                            {getPriceLabel(item.data)}
                                        </span>
                                    </div>
                                </div>
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                    <button
                                        onClick={() => handleAddToCart(item)}
                                        className="button text-xs font-black tracking-widest py-2! px-4! bg-(--main-color) text-black rounded-xl translate-y-4 group-hover:translate-y-0 transition-all"
                                    >
                                        ADD TO BAG
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Shopping Bag Drawer / Overlay */}
            {isBagOpen && (
                <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-black/95 backdrop-blur-xl border-l border-white/10 flex flex-col z-50 animate-in slide-in-from-right-8 duration-300">
                    <div className="flex items-center justify-between p-5 border-b border-white/10">
                        <h2 className="text-sm font-black uppercase tracking-widest text-white">Shopping Bag</h2>
                        <button onClick={() => setIsBagOpen(false)} className="p-2 text-white/50 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                        {shoppingBag.length === 0 ? (
                            <p className="text-xs text-white/40 uppercase tracking-widest text-center mt-10">Your bag is empty.</p>
                        ) : (
                            shoppingBag.map(item => (
                                <div key={item.row} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                    <div className="w-12 h-12 bg-black/40 rounded-lg flex items-center justify-center p-1">
                                        {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-contain" /> : <svg className="w-5 h-5 opacity-20"><use href="#image" /></svg>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-white truncate">{item.data.shape} {item.data.material}</p>
                                        <p className="text-[10px] text-(--main-color) font-mono">{getPriceLabel(item.data)}</p>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveFromCart(item.row)}
                                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-5 border-t border-white/10 bg-white/2 flex flex-col gap-3">
                        <div className="flex justify-between text-xs font-bold tracking-wider text-white/60 uppercase">
                            <span>Subtotal</span>
                            <span>${cartTotal.toFixed(2)}</span>
                        </div>
                        {isVendor && (
                            <div className="flex justify-between text-xs font-bold tracking-wider text-white/60 uppercase">
                                <span>IVA (15%)</span>
                                <span>${cartIva.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-base font-black tracking-widest text-white uppercase mt-2 pt-2 border-t border-white/10">
                            <span>Total</span>
                            <span>{isVendor ? 'MXN' : 'MXN'} ${finalTotal.toFixed(2)}</span>
                        </div>
                        <button
                            disabled={shoppingBag.length === 0}
                            onClick={handleCheckout}
                            className={`mt-4 w-full py-4 rounded-xl text-sm font-black tracking-widest transition-all ${shoppingBag.length > 0 ? 'bg-(--main-color) text-black hover:brightness-110 cursor-pointer shadow-lg shadow-(--main-color)/20' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
                        >
                            {isVendor ? 'REGISTER SALE & EXPORT' : 'ACQUIRE ITEMS'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
