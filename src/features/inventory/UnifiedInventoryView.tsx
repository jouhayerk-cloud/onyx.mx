import React, { useState, useEffect, useMemo, useRef } from 'react';
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
} from '../../lib/atoms';
import { useDatabase, useTranslation } from '../../lib/hooks';
import { calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { InventoryItemData, InventoryItem } from '../../lib/Types';

const getStatusClass = (data: InventoryItemData): 'RED' | 'YELLOW' | 'GREEN' | '' => {
    if (data.payDate) return 'GREEN';
    if (data.payReq) return 'YELLOW';
    if (data.status === 'YES' || data.printDate) return 'RED';
    return '';
};
import { vendors } from '../../lib/consts';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { DetailsPanel } from '../catalog/DetailsPanel';

const UnifiedInventoryCard = ({ item, isExpanded, onExpand, exchangeRate, showFinancials }: any) => {
    const norm = normalizeInventoryData(item.data);
    const vendorPrefix = norm.itemId?.split('-')[0] || '';
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#ccc';

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

    const imageUrl = norm.generatedPngUrl || (norm.mediaUrls ? norm.mediaUrls.split(',')[0].trim() : null);

    const setIsDetailsPanelOpen = useSetAtom(isDetailsPanelOpenAtom);
    const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);
    const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
    const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
    const setImageSrc = useSetAtom(ImageSrcAtom);

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedItemRow(item.row);
        setSelectedItemData(item.data);
        setImageSrc(imageUrl);
        setDetailsPanelMode('edit');
        setIsDetailsPanelOpen(true);
    };

    return (
        <div
            className={`inventory-item-card relative overflow-hidden flex flex-col transition-all duration-300 group rounded-2xl border border-white/5 bg-black/40 hover:border-white/20 shadow-md ${isExpanded ? 'col-span-1 md:col-span-2 lg:col-span-3 row-span-2' : 'col-span-1'}`}
            onClick={onExpand}
        >
            <div className={`w-full flex ${isExpanded ? 'h-full flex-col md:flex-row' : 'aspect-[4/3] flex-col'} relative`}>
                {/* Image Section */}
                <div className={`${isExpanded ? 'h-48 md:h-full md:w-1/3' : 'absolute inset-0'} relative overflow-hidden flex items-center justify-center bg-black/50`}>
                    {imageUrl ? (
                        <img src={imageUrl} className={`w-full h-full object-cover transition-transform duration-[2s] ${!isExpanded && 'group-hover:scale-110 opacity-80 group-hover:opacity-100'}`} />
                    ) : (
                        <div className="w-1/3 h-1/3 opacity-20 text-[var(--secondary-color)]">
                            <OnyxMiniLogo />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />

                    {/* Top badges */}
                    <div className="absolute top-0 inset-x-0 p-3 flex justify-between items-start pointer-events-none z-10">
                        {calculated.bookBardcode ? (
                            <div
                                className="px-2 py-1 rounded border border-black text-black font-black text-[10px] shadow-lg flex items-center gap-1"
                                style={{ backgroundColor: vendorColor }}
                                title={`Vendor: ${vendorPrefix}`}>
                                <span>{vendorPrefix || '?'}</span>
                                <span className="opacity-40">|</span>
                                <span>{calculated.bookBardcode}</span>
                            </div>
                        ) : (
                            <div
                                className="h-6 px-2 rounded flex items-center justify-center font-bold text-black border border-black shadow-lg text-[10px]"
                                style={{ backgroundColor: vendorColor }}
                                title={`Vendor: ${vendorPrefix}`}>
                                {vendorPrefix || '?'}
                            </div>
                        )}
                        <div className={`status-dot ${statusClass} shadow-md`} title={`Status: ${item.source}`} />
                    </div>

                    {/* Bottom Info for Collapsed State */}
                    {!isExpanded && (
                        <div className="absolute bottom-0 inset-x-0 p-3 pt-8 flex flex-col justify-end text-left pointer-events-none z-10">
                            <div className="flex items-end justify-between mb-1">
                                <p className="font-black text-white text-base leading-tight truncate drop-shadow-md">{norm.shape || 'Unknown Object'}</p>
                            </div>
                            <div className="flex flex-col gap-0.5 mb-2">
                                <p className="text-[10px] uppercase font-medium tracking-wide text-white/80 truncate drop-shadow-md">
                                    {norm.material || 'Mixed Material'} · {norm.shortDescription || 'Misc'}
                                </p>
                                {(dimensionsStr || weightStr) && (
                                    <p className="text-[9px] text-white/60 tracking-wider truncate drop-shadow-md">
                                        {dimensionsStr} {dimensionsStr && weightStr ? ' · ' : ''} {weightStr}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center justify-center bg-white/10 rounded-lg px-2 py-1.5 backdrop-blur-sm border border-white/5 pointer-events-auto">
                                <span className="font-bold text-[11px] text-[#AEE6F5]">
                                    {showFinancials ? `$${norm.price || 0} MXN` : '***'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                    <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-2xl font-black text-white">{norm.shape || 'Unknown Object'}</h3>
                                        {calculated.bookBardcode && (
                                            <span
                                                className="px-2 py-0.5 text-[10px] font-black tracking-wider rounded border border-black text-black shadow-sm"
                                                style={{ backgroundColor: vendorColor }}
                                            >
                                                TAG: {calculated.bookBardcode}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-white/60 font-mono mt-1">
                                        Item: #{norm.itemNumber} | Vendor: {vendorPrefix}
                                    </p>
                                </div>
                                <button onClick={handleEdit} className="button secondary !py-1 !px-4 text-xs">Edit</button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <p className="text-[10px] uppercase text-white/40 tracking-wider">Material</p>
                                    <p className="text-sm font-medium">{norm.material || 'Mixed'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase text-white/40 tracking-wider">Dimensions</p>
                                    <p className="text-sm font-medium">{dimensionsStr || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase text-white/40 tracking-wider">Weight</p>
                                    <p className="text-sm font-medium">{weightStr || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase text-white/40 tracking-wider">Source</p>
                                    <p className="text-sm font-medium capitalize">{item.source}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                            <h4 className="text-[10px] uppercase text-white/40 tracking-wider mb-3">Financials & Logistics</h4>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex flex-col">
                                    <span className="text-xs text-white/60">Acquisition</span>
                                    <span className="font-bold text-[#AEE6F5]">{showFinancials ? `$${(parseFloat(String(norm.price || 0)) / exchangeRate).toFixed(2)}` : '***'}</span>
                                    <span className="text-[8px] font-mono text-white/30">{calculated.bookAqCode}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs text-white/60">Landed</span>
                                    <span className="font-bold text-yellow-300">{showFinancials ? `$${calculated.bookLanded}` : '***'}</span>
                                    <span className="text-[8px] font-mono text-white/30">{calculated.bookLandCode}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs text-white/60">Retail</span>
                                    <span className="font-bold text-green-400">{showFinancials ? `$${calculated.bookRetail}` : '***'}</span>
                                    <span className="text-[8px] font-mono text-white/30">{calculated.bookBardcode || 'N/A'}</span>
                                </div>
                            </div>
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

    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const searchTerm = useAtomValue(inventorySearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryActiveFilterAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const showFinancials = useAtomValue(showFinancialsAtom);

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
            // Status Filter Logic
            if (statusFilter === 'Available' && item.source !== 'inventory') return false;
            // Assuming Acquisitions could be items in inventory that have status 'Acquisitions'
            if (statusFilter === 'Acquisition' && item.source !== 'inventory') return false;
            if (statusFilter === 'Production' && item.source !== 'production') return false;

            // Vendor Filter
            const vendorPrefix = item.data.itemId?.split('-')[0] || '';
            if (vendorFilter !== 'All' && vendorPrefix !== vendorFilter) return false;

            // Search Term
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                const matches = Object.values(item.data).some(v => String(v).toLowerCase().includes(lowerSearch));
                if (!matches) return false;
            }

            return true;
        }).sort((a, b) => (b.data.updatedAt || 0) - (a.data.updatedAt || 0));
    }, [items, statusFilter, vendorFilter, searchTerm]);

    const activeVendors = useMemo(() => {
        const vendorNames = Array.from(new Set(items.map(item => item.data.itemId?.split('-')[0]).filter(Boolean)));
        return vendorNames.sort();
    }, [items]);

    const handleExpandCard = (id: string) => {
        setExpandedCardId(prev => prev === id ? null : id);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden relative m-4 mt-0 gap-4">
            {/* Top Bar for Unified View */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0 overflow-x-auto pb-2">
                <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
                    {['All', 'Available', 'Production', 'Acquisition'].map(status => (
                        <button
                            key={status}
                            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${statusFilter === status ? 'bg-[var(--accent-color)] text-white shadow-md' : 'text-white/40 hover:text-white/80'}`}
                            onClick={() => setStatusFilter(status as any)}>
                            {status}
                        </button>
                    ))}
                </div>

                {/* Vendor Filter Pills */}
                <div className="flex bg-black/20 p-1 rounded-xl border border-white/5 shrink-0 overflow-x-auto w-full sm:w-auto">
                    <button
                        className={`px-3 py-1 text-xs font-bold rounded min-w-max transition-all ${vendorFilter === 'All' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/80'}`}
                        onClick={() => setVendorFilter('All')}>
                        All Vendors
                    </button>
                    {activeVendors.map(vendor => {
                        const vendorColor = vendors[vendor as keyof typeof vendors]?.color || '#ccc';
                        return (
                            <button
                                key={vendor}
                                className={`px-2 py-1 mx-0.5 text-[10px] font-black tracking-widest uppercase rounded min-w-max transition-all ${vendorFilter === vendor ? 'opacity-100 shadow-sm border border-black/20' : 'opacity-40 hover:opacity-100'}`}
                                style={{
                                    backgroundColor: vendorFilter === vendor ? vendorColor : 'transparent',
                                    color: vendorFilter === vendor ? 'black' : vendorColor,
                                    border: vendorFilter !== vendor ? `1px solid ${vendorColor}` : 'none'
                                }}
                                onClick={() => setVendorFilter(vendor)}>
                                {vendor}
                            </button>
                        );
                    })}
                </div>

                <div className="text-xs text-white/40 font-mono my-auto shrink-0 ml-auto">
                    {filteredItems.length} items found
                </div>
            </div>

            {/* Main Content: Inventory Grid */}
            <div className="flex-grow h-full glass-panel overflow-y-auto p-4 pr-2 -mr-2">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full"><LoadingIndicator /></div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex justify-center items-center h-full text-[var(--text-color-secondary)]">No items match your criteria.</div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filteredItems.map(item => (
                            <UnifiedInventoryCard
                                key={item.row}
                                item={item}
                                isExpanded={expandedCardId === item.row}
                                onExpand={() => handleExpandCard(item.row)}
                                exchangeRate={exchangeRate}
                                showFinancials={showFinancials}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Details Panel for Side Drawer when Editing */}
            <DetailsPanel />
        </div>
    );
};
