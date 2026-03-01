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
} from '../../lib/atoms';
import { useDatabase, useTranslation } from '../../lib/hooks';
import { calculateCodesAndPrices, normalizeInventoryData, handleFileUpload, readFileAsDataURL } from '../../lib/utils';
import { InventoryItemData, UploadedFile } from '../../lib/Types';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

const getStatusClass = (data: InventoryItemData): 'RED' | 'YELLOW' | 'GREEN' | '' => {
    if (data.payDate) return 'GREEN';
    if (data.payReq) return 'YELLOW';
    if (data.status === 'YES' || data.printDate) return 'RED';
    return '';
};

const lbl = "text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5";
const inp = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2 text-sm text-white placeholder-white/15 focus:outline-none focus:border-(--main-color)/50 focus:bg-white/[0.07] transition-all";
const inpNum = inp + " font-mono text-center";

const UnifiedInventoryCard = ({ item, isExpanded, onToggleExpand, exchangeRate, showFinancials, viewMode }: any) => {
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

    const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);
    const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
    const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
    const setImageSrc = useSetAtom(ImageSrcAtom);

    // Combined COLOR MATERIAL SHAPE TYPE description
    const descLine = [norm.color, norm.material, norm.shape, norm.shortDescription].filter(Boolean).map(s => s.toUpperCase()).join(' · ');

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedItemRow(item.row);
        setSelectedItemData(item.data);
        setImageSrc(imageUrl);
        setDetailsPanelMode('edit');
    };

    if (viewMode === 'list') {
        return (
            <div className="flex flex-col gap-1">
                <div className={`flex items-center gap-4 bg-black/20 hover:bg-black/40 border border-white/5 p-2 rounded-xl transition-all group ${isExpanded ? 'border-(--main-color)/30 bg-black/40' : ''}`}>
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/40 grow-0 shrink-0 border border-white/10">
                        {imageUrl ? <img src={imageUrl} className="w-full h-full object-cover" /> : <div className="p-3 opacity-20"><OnyxMiniLogo /></div>}
                    </div>
                    <div className="grow min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-white/40">{vendorPrefix}-{norm.itemNumber}</span>
                            <span className="text-xs font-black text-white truncate">{descLine || 'NO DESCRIPTION'}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[9px] text-white/20 uppercase tracking-tighter">{dimensionsStr || 'NO DIMENSIONS'} · {weightStr || 'NO WEIGHT'}</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusClass === 'GREEN' ? 'bg-green-500' : statusClass === 'YELLOW' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 px-2">
                        <span className="text-xs font-mono font-bold text-(--main-color)">{showFinancials ? `$${Math.ceil(Number(norm.price || 0))}` : '***'}</span>
                        <div className="flex gap-1">
                            <button onClick={handleEdit} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors" title="Edit">
                                <svg className="w-3.5 h-3.5"><use href="#edit" /></svg>
                            </button>
                            <button onClick={onToggleExpand} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors" title="Expand">
                                <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><use href="#chevron-down" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
                {isExpanded && (
                    <div className="ml-16 mr-2 p-4 bg-white/[0.02] border-x border-b border-white/5 rounded-b-xl grid grid-cols-2 md:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-300">
                        <div><p className={lbl}>Material</p><p className="text-[10px] text-white/60">{norm.material || '—'}</p></div>
                        <div><p className={lbl}>Status</p><p className="text-[10px] text-white/60 capitalize">{norm.status}</p></div>
                        <div><p className={lbl}>Source</p><p className="text-[10px] text-white/60 capitalize">{item.source}</p></div>
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col"><span className="text-[8px] text-white/20 font-black uppercase tracking-widest">Landed</span><span className="text-xs font-black text-yellow-300/80 font-mono">{showFinancials ? `$${calculated.bookLanded}` : '***'}</span></div>
                            <div className="flex flex-col"><span className="text-[8px] text-white/20 font-black uppercase tracking-widest">Retail</span><span className="text-xs font-black text-green-400/80 font-mono">{showFinancials ? `$${calculated.bookRetail}` : '***'}</span></div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`inventory-item-card relative overflow-hidden flex flex-col transition-all duration-500 group rounded-2xl border border-white/5 bg-black/40 hover:border-white/10 shadow-lg ${isExpanded ? 'col-span-full md:col-span-2 lg:col-span-3 min-h-[500px] ring-1 ring-white/10' : 'col-span-1'}`}>
            <div className={`w-full flex ${isExpanded ? 'h-full flex-col md:flex-row' : 'aspect-[4/5] flex-col'} relative`}>
                <div className={`${isExpanded ? 'h-64 md:h-full md:w-2/5' : 'absolute inset-0'} relative overflow-hidden flex items-center justify-center bg-black/50`}>
                    {imageUrl ? <img src={imageUrl} className={`w-full h-full object-cover transition-transform duration-[2s] ${!isExpanded && 'group-hover:scale-110 opacity-80 group-hover:opacity-100'}`} /> : <div className="p-3 opacity-20"><OnyxMiniLogo /></div>}
                    <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent pointer-events-none" />
                    <div className="absolute top-0 inset-x-0 p-3 flex justify-between items-start pointer-events-none z-10">
                        {calculated.bookBardcode ? (
                            <div className="px-2 py-1 rounded border border-black text-black font-black text-[10px] shadow-lg flex items-center gap-1" style={{ backgroundColor: vendorColor }}>
                                <span>{vendorPrefix || '?'}</span>
                                <span className="opacity-40">|</span>
                                <span>{calculated.bookBardcode}</span>
                            </div>
                        ) : (
                            <div className="h-6 px-2 rounded flex items-center justify-center font-bold text-black border border-black shadow-lg text-[10px]" style={{ backgroundColor: vendorColor }}>{vendorPrefix || '?'}</div>
                        )}
                        <div className={`status-dot ${statusClass} shadow-md`} />
                    </div>
                    {!isExpanded && (
                        <div className="absolute bottom-0 inset-x-0 p-3 pt-10 flex flex-col justify-end text-left pointer-events-none z-10 bg-linear-to-t from-black via-black/60 to-transparent">
                            <div className="flex items-end justify-between mb-1 gap-2">
                                <p className="font-black text-white text-base leading-none truncate drop-shadow-md">{norm.shape || 'OBJ'}</p>
                                <span className="text-[10px] font-black text-(--main-color) font-mono shrink-0">{showFinancials ? `$${Math.ceil(Number(norm.price || 0))}` : '***'}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <p className="text-[9px] uppercase font-black tracking-widest text-(--main-color) truncate">{descLine || 'ITEM DESCRIPTION'}</p>
                                <div className="flex items-center justify-between gap-2 mt-1">
                                    <p className="text-[9px] text-white/40 font-mono tracking-tighter truncate">{dimensionsStr || 'NO DIM'}</p>
                                    <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="p-1 px-2 pointer-events-auto bg-white/5 hover:bg-white/10 rounded-md border border-white/5 text-white/30 hover:text-white transition-all">
                                        <svg className="w-3 h-3"><use href="#arrow-up-left" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {isExpanded && (
                    <div className="flex-1 min-h-0 flex flex-col p-6 overflow-hidden bg-black/40 backdrop-blur-md">
                        <div className="overflow-y-auto grow pr-2 custom-scrollbar">
                            <div className="flex justify-between items-start mb-6">
                                <div className="min-w-0">
                                    <h3 className="text-2xl font-black text-white truncate">{norm.shape || 'OBJ'}</h3>
                                    <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] mt-1 truncate">{descLine}</p>
                                    <p className="text-[10px] text-white/20 font-mono mt-2 uppercase tracking-widest">Item: #{norm.itemNumber} | Vendor: {vendorPrefix}</p>
                                </div>
                                <button onClick={handleEdit} className="button secondary py-1.5! px-4! text-[10px] font-black tracking-widest uppercase shrink-0"><svg className="w-3 h-3 inline-block mr-1.5"><use href="#edit" /></svg>Edit</button>
                            </div>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-6 mb-8">
                                <div><p className={lbl}>Material</p><p className="text-sm font-medium text-white/80">{norm.material || '—'}</p></div>
                                <div><p className={lbl}>Dimensions</p><p className="text-sm font-medium text-white/80 font-mono">{dimensionsStr || '—'}</p></div>
                                <div><p className={lbl}>Weight</p><p className="text-sm font-medium text-white/80 font-mono">{weightStr || '—'}</p></div>
                                <div><p className={lbl}>Source</p><p className="text-sm font-medium capitalize text-white/80">{item.source}</p></div>
                            </div>
                            <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 shadow-inner">
                                <h4 className="text-[9px] font-black uppercase text-white/20 tracking-[0.2em] mb-4">Financial Analysis</h4>
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="flex flex-col"><span className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-1">Acq</span><span className="text-lg font-black text-[#AEE6F5] font-mono leading-none">{showFinancials ? `$${Math.ceil(parseFloat(String(norm.price || 0)) / exchangeRate)}` : '***'}</span></div>
                                    <div className="flex flex-col"><span className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-1">Land</span><span className="text-lg font-black text-yellow-300 font-mono leading-none">{showFinancials ? `$${calculated.bookLanded}` : '***'}</span></div>
                                    <div className="flex flex-col"><span className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-1">Ret</span><span className="text-lg font-black text-green-400 font-mono leading-none">{showFinancials ? `$${calculated.bookRetail}` : '***'}</span></div>
                                </div>
                            </div>
                            {norm.description && (
                                <div className="mt-8">
                                    <p className={lbl}>Notes</p>
                                    <p className="text-xs text-white/60 leading-relaxed font-medium">{norm.description}</p>
                                </div>
                            )}
                        </div>
                        <div className="mt-6 pt-5 border-t border-white/10 flex gap-3 shrink-0">
                            <button onClick={onToggleExpand} className="button bg-white/5! border border-white/10 grow py-3! text-[10px] font-black uppercase tracking-[0.2em]">Close View</button>
                            <button onClick={handleEdit} className="button bg-(--main-color)! text-black! grow py-3! text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)]">Edit Item</button>
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
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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
                status: itemData.status || 'Catalog',
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
            const dataUrl = await readFileAsDataURL(file, type);
            uploaded.push({ type, dataUrl, localUrl: dataUrl, originalFile: file });
        }
        setNewFiles(prev => [...prev, ...uploaded]);
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
                        if (result) uploadedUrls.push(result.thumbnailUrl);
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

            const tableName = itemData?.source === 'production' ? 'production' : 'inventory';
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
                if (item.data.status !== 'Available') return false;
            } else if (statusFilter === 'Acquisition') {
                if (!['Acquired', 'Acquisitions', 'Acquisition'].includes(item.data.status)) return false;
            } else if (statusFilter === 'Production') {
                if (item.source !== 'production' && item.data.status !== 'Production') return false;
            }
            const vendorPrefix = item.data.itemId?.split('-')[0] || '';
            if (vendorFilter !== 'All' && vendorPrefix !== vendorFilter) return false;
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                if (!Object.values(item.data).some(v => String(v).toLowerCase().includes(lowerSearch))) return false;
            }
            return true;
        }).sort((a, b) => (new Date(b.data.updatedAt || 0).getTime()) - (new Date(a.data.updatedAt || 0).getTime()));
    }, [items, statusFilter, vendorFilter, searchTerm]);

    const activeVendors = useMemo(() => {
        return Array.from(new Set(items.map(item => item.data.itemId?.split('-')[0]).filter(Boolean))).sort();
    }, [items]);

    return (
        <div className="flex flex-col h-full overflow-hidden relative m-4 mt-0 gap-4">
            <div className="flex flex-col md:flex-row items-center gap-4 shrink-0 px-2 py-1">
                <div className="flex bg-black/20 p-1 rounded-xl border border-white/5 shrink-0">
                    {['All', 'Available', 'Production', 'Acquisition'].map(s => (
                        <button key={s} onClick={() => setStatusFilter(s as any)} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all ${statusFilter === s ? 'bg-(--main-color) text-black shadow-lg' : 'text-white/30 hover:text-white/60'}`}>{s.slice(0, 3)}</button>
                    ))}
                </div>
                <div className="flex bg-black/20 p-1 rounded-xl border border-white/5 shrink-0">
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all flex items-center gap-2 ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}>
                        <svg className="w-4 h-4"><use href="#layout-grid" /></svg>
                        <span className="text-[8px] font-black uppercase tracking-widest hidden sm:inline">Grid</span>
                    </button>
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all flex items-center gap-2 ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}>
                        <svg className="w-4 h-4"><use href="#list-bullet" /></svg>
                        <span className="text-[8px] font-black uppercase tracking-widest hidden sm:inline">List</span>
                    </button>
                </div>
                <div className="flex bg-black/20 p-1 rounded-xl border border-white/5 overflow-x-auto grow custom-scrollbar no-scrollbar">
                    <button onClick={() => setVendorFilter('All')} className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/40 rounded transition-all ${vendorFilter === 'All' ? 'bg-white/10 text-white' : 'hover:text-white'}`}>ALL</button>
                    {activeVendors.map(v => {
                        const color = vendors[v as keyof typeof vendors]?.color || '#ccc';
                        return <button key={v} onClick={() => setVendorFilter(v)} className={`px-2.5 py-1 mx-0.5 text-[10px] font-black rounded transition-all ${vendorFilter === v ? 'opacity-100 shadow-sm' : 'opacity-30 hover:opacity-60'}`} style={{ backgroundColor: vendorFilter === v ? color : 'transparent', color: vendorFilter === v ? 'black' : color, border: vendorFilter === v ? 'none' : `1px solid ${color}` }}>{v}</button>;
                    })}
                </div>
                <div className="text-[10px] font-mono text-white/15 uppercase tracking-[0.3em] shrink-0 font-black">{filteredItems.length} ITEMS</div>
            </div>

            <div className="grow min-h-0 overflow-hidden glass-panel shadow-2xl rounded-3xl m-2">
                <div className="h-full overflow-y-auto p-6 custom-scrollbar scroll-smooth">
                    <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 pb-20" : "flex flex-col gap-3 pb-20"}>
                        {isLoading ? (
                            <div className="col-span-full h-64 flex items-center justify-center opacity-40">
                                <LoadingIndicator />
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="col-span-full h-64 flex items-center justify-center text-[10px] font-black uppercase tracking-[0.3em] text-white/10">
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
                <div className="fixed inset-0 z-[100] bg-black/98 backdrop-blur-2xl flex flex-col p-8 items-center justify-center animate-in fade-in zoom-in duration-500">
                    <div className="max-w-2xl w-full flex flex-col h-full overflow-hidden">
                        <div className="flex justify-between items-center mb-10 shrink-0">
                            <div className="flex items-center gap-5">
                                <div className="p-4 bg-white/5 rounded-3xl border border-(--main-color)/20 shadow-[0_0_40px_rgba(var(--main-color-rgb),0.15)]"><svg className="w-10 h-10 text-(--main-color)"><use href="#edit" /></svg></div>
                                <div><h2 className="text-3xl font-black text-white leading-none tracking-tighter">EDITING ITEM</h2><p className="text-[10px] font-mono font-black text-white/30 mt-1.5 uppercase tracking-[0.4em]">{itemData?.itemId}</p></div>
                            </div>
                            <button onClick={() => setMode('view')} className="text-4xl text-white/20 hover:text-white transition-all hover:rotate-90">&times;</button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="overflow-y-auto grow pr-6 custom-scrollbar space-y-10 pb-12">
                            {imageUrl && <div className="h-56 w-full rounded-[2.5rem] overflow-hidden border border-white/5 relative shrink-0 shadow-2xl"><img src={imageUrl} className="w-full h-full object-cover opacity-60" /><div className="absolute inset-0 bg-linear-to-t from-black via-transparent" /><div className="absolute bottom-6 left-8"><p className="text-[10px] font-black uppercase text-(--main-color) tracking-[0.4em] mb-2">Live Preview</p><h3 className="text-2xl font-black text-white tracking-tight">{editData.shape}</h3></div></div>}
                            <div className="grid grid-cols-2 gap-8">
                                <div><label className={lbl}>Status</label><select name="status" value={editData.status} onChange={handleEditChange} className={inp}><option value="Catalog">Catalog</option><option value="Production">Production</option><option value="Acquired">Acquired</option><option value="Archive">Archive</option><option value="Shipped">Shipped</option></select></div>
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
                                <button type="submit" disabled={isSaving} className="button bg-(--main-color)! text-black! grow py-5! text-[11px] font-black tracking-[0.3em] uppercase shadow-[0_0_50px_rgba(var(--main-color-rgb),0.25)] hover:scale-[1.02] active:scale-98 transition-all">{isSaving ? 'UPLOADING...' : 'SAVE MODULE'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
