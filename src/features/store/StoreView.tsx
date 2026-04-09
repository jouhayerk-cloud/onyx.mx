
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    storeSearchTermAtom, 
    storeActiveVendorFilterAtom, 
    storeViewModeAtom,
    storeShoppingBagAtom,
    isStoreBagOpenAtom,
    activeViewAtom,
    storeInventoryAtom,
    dashboardStatusFilterAtom,
    liveExchangeRateAtom,
    exchangeRateAtom,
    userAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { normalizeInventoryData, getCleanImageUrl, handleFileUpload, readFileAsDataURL } from '../../lib/utils';
import { 
    ShoppingBag, Search, Filter, LayoutGrid, LayoutList, Layout, 
    ChevronRight, ArrowRight, X, Heart, Star, Info, Trash2, Box, PackageSearch,
    ChevronLeft, ChevronRight as ChevronRightIcon, Plus, Check, Minus, Maximize2, Zap,
    Edit3, Ruler, Layers, CloudUpload, Pencil, Tag, FileText, Upload, Video
} from 'lucide-react';
import { useTranslation } from '../../lib/hooks';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { ShoppingBagDrawer } from './ShoppingBagDrawer';
import { atom } from 'jotai';

// --- Atoms for Fullscreen Gallery State ---
const ActiveGalleryIndexAtom = atom(0);
const ActiveGalleryMediaAtom = atom<string[]>([]);

const isVideoFile = (url: string) => {
    const u = url.toLowerCase();
    return u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm');
};

const StarRating = ({ rating, onChange, size = 12 }: { rating: number; onChange: (r: number) => void; size?: number }) => (
    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => onChange(s)} className="transition-all hover:scale-125 group">
                <Star
                    size={size}
                    fill={s <= rating ? 'var(--main-color)' : 'none'}
                    className={s <= rating ? 'text-(--main-color) drop-shadow-[0_0_5px_var(--main-color)]' : 'text-white/10 group-hover:text-white/40'}
                    strokeWidth={s <= rating ? 0 : 2}
                />
            </button>
        ))}
    </div>
);

/* ─── cmToImperial Helper ─── */
const cmToImperial = (cm: number | string | undefined) => {
    const val = typeof cm === 'string' ? parseFloat(cm) : cm;
    if (!val || isNaN(val)) return '';
    
    const totalInches = val / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    const wholeInches = Math.floor(inches);
    const fractionalInches = inches - wholeInches;
    
    const sixteenths = Math.round(fractionalInches * 16);
    let finalFeet = feet;
    let finalInches = wholeInches;
    let num = sixteenths;
    let den = 16;

    if (sixteenths === 16) {
        finalInches += 1;
        num = 0;
    }
    if (finalInches === 12) {
        finalFeet += 1;
        finalInches = 0;
    }

    if (num > 0) {
        while (num % 2 === 0 && den % 2 === 0) {
            num /= 2; den /= 2;
        }
    }

    const ftPart = finalFeet > 0 ? `${finalFeet}' ` : '';
    const inPart = finalInches > 0 || num > 0 ? `${finalInches}${num > 0 ? ` ${num}/${den}` : ''}"` : '';
    
    return `${ftPart}${inPart}`.trim() || '0"';
};

export function StoreView() {
    const [search, setSearch] = useAtom(storeSearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
    const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
    const [bag, setBag] = useAtom(storeShoppingBagAtom);
    const [isBagOpen, setIsBagOpen] = useAtom(isStoreBagOpenAtom);
    const storeItems = useAtomValue(storeInventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const liveRate = useAtomValue(liveExchangeRateAtom);
    const setView = useSetAtom(activeViewAtom);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);

    const user = useAtomValue(userAtom);
    const [editData, setEditData] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [savingProgress, setSavingProgress] = useState(0);
    const [newFiles, setNewFiles] = useState<any[]>([]);

    const activeVendors = useMemo(() => Array.from(new Set(storeItems.map(i => i.data.itemId?.split('-')[0]).filter(Boolean))).sort(), [storeItems]);

    // CSS class helpers for the form
    const lbl = "text-[10px] text-white/40 font-black uppercase tracking-[0.3em] font-mono";
    const inp = "w-full h-14 px-6 bg-white/5 border border-white/10 rounded-[20px] text-white focus:border-(--main-color) transition-all outline-none text-[13px] font-bold";
    const inpNum = "w-full h-14 px-6 bg-white/5 border border-white/10 rounded-[20px] text-white focus:border-(--main-color) transition-all outline-none font-mono text-[13px] font-black tracking-widest";

    const vendorIndices = useMemo(() => {
        const counts = new Map<string, number>();
        const idxs = new Map<number, number>();
        storeItems.forEach(item => {
            const n = normalizeInventoryData(item.data);
            const vp = n.itemId?.split('-')[0] || 'UNK';
            const c = (counts.get(vp) || 0) + 1;
            counts.set(vp, c);
            idxs.set(item.row, c);
        });
        return idxs;
    }, [storeItems]);

    const filteredItems = useMemo(() => {
        return storeItems.filter(item => {
            const n = normalizeInventoryData(item.data);
            const matchesVendor = vendorFilter === 'All' || n.itemId?.startsWith(vendorFilter);
            const searchStr = `${n.itemId} ${n.shortDescription} ${n.color} ${n.material}`.toLowerCase();
            const matchesSearch = !search || searchStr.includes(search.toLowerCase());
            return matchesVendor && matchesSearch;
        });
    }, [storeItems, vendorFilter, search]);

    const toggleBag = (item: any) => {
        const isInBag = bag.some(b => b.row === item.row);
        if (isInBag) {
            setBag(prev => prev.filter(b => b.row !== item.row));
            toast.success("Removed from bag");
        } else {
            setBag(prev => [...prev, item]);
            toast.success("Added to bag", {
                icon: '🛍️',
                style: { background: 'black', color: 'var(--main-color)', border: '1px solid var(--main-color)' }
            });
        }
    };

    const handleRemoveFromStore = async (item: any) => {
        const tableName = item.table_name || 'inventory';
        const { error } = await supabase.from(tableName).delete().eq('id', item.id);
        if (error) {
            toast.error(`Remove failed: ${error.message}`);
        } else {
            toast.success("Item removed from store");
            setSelectedItem(null);
        }
    };

    const handleAcquireItem = async (item: any) => {
        const tid = toast.loading("Updating status...");
        try {
            const tableName = item.table_name || 'inventory';
            const { error } = await supabase.from(tableName).update({ 
                status: 'Acquired',
                updated_at: new Date().toISOString()
            }).eq('id', item.id);
            if (error) throw error;
            toast.success("Item Acquired!", { id: tid });
            setSelectedItem(null);
        } catch (err: any) {
            toast.error(err.message, { id: tid });
        }
    };

    const handleBatchAcquire = async () => {
        if (bag.length === 0) return;
        const tid = toast.loading(`Processing ${bag.length} acquisitions...`);
        try {
            for (const item of bag) {
                const tableName = item.table_name || 'inventory';
                const { error } = await supabase.from(tableName).update({ 
                    status: 'Acquired',
                    updated_at: new Date().toISOString()
                }).eq('id', item.id);
                if (error) throw error;
            }
            toast.success("Batch Acquisition Complete!", { id: tid });
            setBag([]);
            setIsBagOpen(false);
        } catch (err: any) {
            toast.error(`Batch failed: ${err.message}`, { id: tid });
        }
    };

    const handleUpdateRating = async (item: any, rating: number) => {
        if (!item?.id) return;
        try {
            const tableName = item.table_name || 'inventory';
            const { error } = await supabase.from(tableName).update({ rating }).eq('id', item.id);
            if (error) throw error;
        } catch (err: any) {
            console.error("Rating update failed:", err);
        }
    };

    const handleEditChange = (e: any) => { const { name, value } = e.target; setEditData((prev: any) => ({ ...prev, [name]: value })); };
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []); const uploaded: any[] = [];
        for (const file of files) { const type = file.type.startsWith('video/') ? 'video' : 'image'; const localUrl = await readFileAsDataURL(file, type); uploaded.push({ type, localUrl, originalFile: file, tag: 'Item' }); }
        setNewFiles(prev => [...prev, ...uploaded]);
    };
    
    const handleDeleteExistingMedia = (url: string) => {
        const urls = (editData.mediaUrls || '').split(',').map((u:string) => u.trim()).filter(Boolean);
        const filtered = urls.filter((u:string) => u !== url).join(',');
        setEditData((p: any) => ({ ...p, mediaUrls: filtered }));
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault(); if (!selectedItem || !editData) return; 
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
            const tableName = selectedItem.table_name || 'inventory';
            const { error } = await supabase.from(tableName).update(payload).eq('id', selectedItem.id);
            if (error) throw error; 
            
            setSavingProgress(100);
            toast.success('Sync Complete', { id: tid }); 
            setSelectedItem(null);
            setEditData(null);
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

    return (
        <div className="h-full overflow-hidden bg-transparent animate-in fade-in duration-1000" style={{ fontFamily: 'Inter, sans-serif' }}>
            <main className="h-full overflow-hidden relative flex flex-col">
                {/* View Modes */}
                <div className="flex-1 overflow-hidden relative">
                    {viewMode === 'grid' && (
                        <div className="h-full overflow-y-auto custom-scrollbar scroll-smooth p-4 md:p-10">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xxl:grid-cols-5 gap-4 md:gap-10 max-w-[2400px] mx-auto">
                                {filteredItems.map((item, idx) => (
                                    <ArtifactCard 
                                        key={item.row} 
                                        item={item} 
                                        onClick={() => setSelectedItem(item)} 
                                        onToggleBag={() => toggleBag(item)}
                                        inBag={bag.some(b => b.row === item.row)}
                                        delay={idx % 20}
                                    />
                                ))}
                            </div>
                            {filteredItems.length === 0 && (
                                <div className="h-full flex items-center justify-center py-40 opacity-20 gap-8 text-center">
                                    <Box size={100} strokeWidth={0.5} />
                                    <p className="text-xl font-black uppercase tracking-widest">No artifacts found</p>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'list' && (
                        <div className="h-full overflow-y-auto custom-scrollbar scroll-smooth p-6">
                            <div className="flex flex-col divide-y divide-white/5 border-t border-b border-white/5 w-full max-w-[1600px] mx-auto">
                                {filteredItems.map((item, idx) => (
                                    <StoreListItem 
                                        key={item.row} 
                                        item={item} 
                                        onClick={() => setSelectedItem(item)}
                                        onToggleBag={() => toggleBag(item)}
                                        inBag={bag.some(b => b.row === item.row)}
                                        exchangeRate={liveRate || exchangeRate}
                                        vendorIndex={vendorIndices.get(item.row)}
                                    />
                                ))}
                            </div>
                            {filteredItems.length === 0 && (
                                <div className="h-full flex items-center justify-center py-20 opacity-20 gap-4 text-center">
                                    <Box size={40} strokeWidth={1} />
                                    <p className="text-sm font-black uppercase tracking-widest">No artifacts found</p>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'gallery' && (
                        <div className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar">
                            {filteredItems.map((item) => (
                                <div key={item.row} className="h-full w-full snap-start shrink-0">
                                    <GalleryFullItem 
                                        item={item} 
                                        onOpenDetails={() => setSelectedItem(item)}
                                        inBag={bag.some(b => b.row === item.row)}
                                        onToggleBag={() => toggleBagItem(item)}
                                    />
                                </div>
                            ))}
                            {filteredItems.length === 0 && (
                                <div className="h-full flex items-center justify-center py-40 opacity-20 gap-8 text-center">
                                    <Box size={100} strokeWidth={0.5} />
                                    <p className="text-xl font-black uppercase tracking-widest">No artifacts found</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Selection Panel Overlay */}
            {selectedItem && (
                <DetailPanel 
                    item={selectedItem} 
                    exchangeRate={liveRate || exchangeRate}
                    onClose={() => setSelectedItem(null)}
                    inBag={bag.some(b => b.row === selectedItem.row)}
                    onToggleBag={() => toggleBag(selectedItem)}
                    onRemove={handleRemoveFromStore}
                    onAcquire={handleAcquireItem}
                    onUpdateRating={(r: number) => handleUpdateRating(selectedItem, r)}
                    onEditItem={() => {
                        setEditData({ ...normalizeInventoryData(selectedItem.data), vendorId: String(selectedItem.data.itemId || '').split('-')[0] });
                        setNewFiles([]);
                    }}
                />
            )}

            {/* Edit Panel Modal */}
            {editData && (
                <div className="fixed inset-0 z-150 flex flex-col p-4 sm:p-8 items-center justify-center animate-in fade-in zoom-in duration-500 overflow-hidden">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl cursor-pointer" onClick={() => setEditData(null)} />
                    <div className="max-w-[820px] w-full flex flex-col max-h-[92dvh] overflow-hidden relative rounded-[48px] p-8 sm:p-12 z-10" style={{ background: 'color-mix(in srgb, #0a0a0a 90%, transparent)', backdropFilter: 'blur(40px)', border: '1px solid white/10', boxShadow: '0 50px 150px rgba(0,0,0,0.8)' }}>
                        <div className="flex justify-between items-center mb-12 shrink-0">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10"><FileText size={28} className="text-white/40" /></div>
                                <div className="flex flex-col">
                                    <h2 className="text-3xl font-black text-white leading-none tracking-tighter uppercase">MANUAL ENTRY FORM</h2>
                                    <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em] mt-2 ml-0.5">Store Details Editor</p>
                                </div>
                            </div>
                            <button onClick={() => setEditData(null)} className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all text-2xl font-light">&times;</button>
                        </div>
                        
                        <form onSubmit={handleSaveEdit} className="overflow-y-auto grow custom-scrollbar space-y-12 pr-4 -mr-4">
                            
                            {/* Entry Status Section */}
                            <div className="space-y-5">
                                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.25em] ml-1">ENTRY STATUS</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    {['Available', 'Production', 'Acquisition'].map(s => (
                                        <button key={s} type="button" onClick={() => setEditData((p:any) => ({ ...p, status: s }))}
                                            className={`h-16 rounded-2xl border transition-all flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-widest ${editData.status === s ? 'bg-white/10 border-(--main-color) text-(--main-color) shadow-[0_0_20px_rgba(var(--main-color-rgb),0.1)]' : 'bg-white/5 border-white/5 text-white/20 hover:text-white hover:bg-white/10'}`}>
                                            {s === 'Production' && <Pencil size={16} />}
                                            {s === 'Acquisition' && <Tag size={16} />}
                                            {s === 'Available' && <LayoutGrid size={16} />}
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Vendor Selection Section */}
                            <div className="space-y-5">
                                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.25em] ml-1">VENDOR SELECTION</h3>
                                <div className="flex flex-wrap gap-4 p-8 rounded-[32px] bg-white/2 border border-white/5">
                                    {activeVendors.map((v: string) => {
                                        const color = vendors[v as keyof typeof vendors]?.color || '#ccc';
                                        const isActive = editData.vendorId === v;
                                        return (
                                            <button key={v} type="button" onClick={() => setEditData((p:any) => ({ ...p, vendorId: v }))}
                                                className={`w-12 h-12 rounded-full border-2 transition-all flex items-center justify-center text-[10px] font-black uppercase tracking-tight ${isActive ? 'scale-110 shadow-lg relative' : 'opacity-40 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-105'}`}
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
                                        <div className="h-48 rounded-[32px] border-2 border-dashed border-white/10 bg-white/2 flex flex-col items-center justify-center gap-4 group-hover:bg-white/5 group-hover:border-white/20 transition-all">
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
                                    <label className={lbl}>PRICE (MXN)</label>
                                    <input type="number" name="price" value={editData.price || 0} onChange={handleEditChange} className={inp + " text-2xl font-black text-green-400 font-mono"} />
                                </div>
                            </div>

                            <div className="pt-16 flex gap-6 pb-4">
                                <button type="button" onClick={() => setEditData(null)} className="h-20 px-10 rounded-3xl bg-white/5 border border-white/10 text-[11px] font-black tracking-[0.4em] uppercase text-white/30 hover:text-white hover:bg-white/10 transition-all">ABORT SYNC</button>
                                <button type="submit" disabled={isSaving} className="flex-1 h-20 rounded-3xl bg-(--main-color) text-black text-[13px] font-black tracking-[0.5em] uppercase shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50">
                                    {isSaving ? 'SYNCING ARTIFACT...' : 'COMMIT CHANGES →'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Save Progress Overlay */}
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

            <style>{`
                @keyframes loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .animate-loading-bar { animation: loading-bar 1.5s infinite cubic-bezier(0.7, 0, 0.3, 1); }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>
        </div>
    );
}


/* ─── Compact Elements ─── */

const ArtifactCard = ({ item, onClick, onToggleBag, inBag, delay }: { item: any, onClick: () => void, onToggleBag: () => void, inBag: boolean, delay: number }) => {
    const n = normalizeInventoryData(item.data);
    const rawUrls = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
    const mainImg = (rawUrls.length > 0 ? rawUrls[0] : '') || n.generatedPngUrl;
    const vPrefix = n.itemId?.split('-')[0];
    const vColor = vendors[vPrefix as keyof typeof vendors]?.color || 'var(--main-color)';

    return (
        <div 
            onClick={onClick}
            className="aspect-card bg-black/40 border border-white/5 relative group overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500 rounded-2xl cursor-pointer"
            style={{ animationDelay: `${delay * 30}ms` }}
        >
            <div className="absolute top-4 left-4 z-10">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 w-fit shadow-xl">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: vColor, boxShadow: `0 0 10px ${vColor}` }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] italic" style={{ color: vColor }}>{vPrefix}-{String(n.itemNumber || 0).padStart(2, '0')}</span>
                </div>
            </div>
            
            <div className="flex-1 relative overflow-hidden bg-black/20">
                {mainImg ? (
                    <img 
                        src={getCleanImageUrl(mainImg)} 
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 grayscale-[0.2] group-hover:grayscale-0"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10">
                        <PackageSearch size={60} strokeWidth={1} />
                    </div>
                )}
            </div>
            <div className="p-6 flex flex-col gap-3 bg-black/60 backdrop-blur-3xl border-t border-white/5">
                <div className="flex justify-between items-start gap-4">
                    <span className="text-base lg:text-lg font-black text-white italic tracking-tighter uppercase leading-tight max-w-[70%] text-left">{n.shape} {n.shortDescription}</span>
                    <span className="text-sm lg:text-base font-black text-(--main-color) font-mono italic tracking-tighter">${(Number(n.price_mxn || n.price || 0) / 1000).toFixed(1)}K</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] lg:text-xs font-black text-white/40 uppercase tracking-widest">{n.color}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    <span className="text-[10px] lg:text-xs font-black text-white/40 uppercase tracking-widest">{n.material}</span>
                </div>
                {/* Dimensions & Mass */}
                <div className="flex items-center gap-2 mt-2 pt-4 border-t border-white/5">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClick(); }} 
                        className="flex-1 bg-white text-black py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md"
                    >
                        GET THIS!
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleBag(); }}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all border ${inBag ? 'bg-(--main-color) text-black border-(--main-color) shadow-[0_0_10px_var(--main-color)]' : 'bg-transparent border-white/20 text-white/50'}`}
                    >
                        {inBag ? 'IN BAG' : 'ADD TO BAG'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const StoreListItem = ({ item, onClick, onToggleBag, inBag, exchangeRate }: any) => {
    const n = normalizeInventoryData(item.data);
    const vendorPrefix = n.itemId?.split('-')[0] || '';
    const shortId = n.itemId ? `${vendorPrefix}-${String(n.itemNumber || 0).padStart(2, '0')}` : '';
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || 'var(--main-color)';
    const rawUrls = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
    const mainImg = (rawUrls.length > 0 ? rawUrls[0] : '') || n.generatedPngUrl;
    
    // Quantity calculation
    const qty = Math.max(1, Number(n.quantity || n.currentStockLevel || 1));
    const unitPrice = Number(n.price_mxn || n.price || 0);

    return (
        <div className="group flex items-center gap-6 lg:gap-8 py-4 px-4 md:px-6 hover:bg-white/5 transition-all animate-in fade-in slide-in-from-left duration-300 cursor-pointer w-full" onClick={onClick}>
            {/* Thumbnail */}
            <div className="w-16 h-16 lg:w-24 lg:h-24 shrink-0 rounded-lg overflow-hidden bg-black/40 relative group/thumb shadow-xl">
                {mainImg ? (
                    <img src={getCleanImageUrl(mainImg)} className="w-full h-full object-cover opacity-80 group-hover/thumb:opacity-100 transition-opacity" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10"><PackageSearch size={24} strokeWidth={1} /></div>
                )}
            </div>

            {/* Core Info - Scrollable Justified Layout on Mobile */}
            <div className="flex-1 w-full flex flex-row overflow-x-auto no-scrollbar justify-between items-center gap-6 min-w-0 py-2">
                {/* Artifact Identity */}
                <div className="flex flex-col gap-1.5 w-[250px] md:w-[25%] shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: vendorColor, boxShadow: `0 0 10px ${vendorColor}` }} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] italic" style={{ color: vendorColor }}>{shortId}</span>
                    </div>
                    <h3 className="text-sm md:text-base font-black text-white uppercase italic truncate tracking-tighter leading-none">{n.shape} {n.shortDescription}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="px-1.5 py-0.5 bg-white/5 rounded text-[9px] font-black text-white/50 uppercase tracking-widest">{n.color || 'N/A'}</span>
                        <span className="px-1.5 py-0.5 bg-white/5 rounded text-[9px] font-black text-white/50 uppercase tracking-widest">{n.material || 'N/A'}</span>
                    </div>
                </div>

                {/* Dimensional Data */}
                <div className="flex flex-col gap-1.5 w-[200px] md:w-[20%] shrink-0 pl-4 border-l border-white/5 md:border-0 md:pl-0">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em]">Dimensions & Mass</span>
                    <div className="flex flex-col leading-tight">
                        <span className="text-xs md:text-sm font-black text-white/80 tracking-widest uppercase">{n.widthCm}x{n.lengthCm}x{n.heightCm} <span className="opacity-40 text-[9px]">CM</span></span>
                        <span className="text-[10px] font-bold text-white/40 tracking-wider uppercase">{cmToImperial(n.widthCm)}x{cmToImperial(n.lengthCm)}x{cmToImperial(n.heightCm)} <span className="opacity-40 text-[8px]">IN</span></span>
                        <span className="text-xs font-black text-white/60 tracking-widest uppercase mt-1">{n.weightKg} <span className="opacity-40 text-[9px]">KG</span></span>
                    </div>
                </div>

                {/* Valuation */}
                <div className="flex flex-col gap-1.5 w-[120px] md:w-[15%] shrink-0 pl-4 border-l border-white/5 md:border-0 md:pl-0">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em]">Unit Val.</span>
                    <div className="flex flex-col leading-tight">
                        <span className="text-sm md:text-base font-black text-(--main-color) font-mono italic">${(unitPrice / 1000).toFixed(1)}K <span className="text-[9px] opacity-40">MXN</span></span>
                        <span className="text-[10px] md:text-xs font-black text-white/30 font-mono tracking-tighter">${(unitPrice / (exchangeRate || 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="opacity-40 tracking-widest uppercase text-[7px]">USD</span></span>
                    </div>
                </div>

                {/* Inventory Overview */}
                <div className="flex flex-col gap-1.5 w-[150px] md:w-[20%] shrink-0 pl-4 border-l border-white/5 md:border-0 md:pl-0">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em]">Inventory Total</span>
                    <div className="flex flex-col leading-tight">
                        <span className="text-sm md:text-base font-black text-white uppercase italic">{qty} <span className="text-[9px] opacity-40 uppercase tracking-widest">Units</span></span>
                        <span className="text-[10px] md:text-xs font-black text-(--main-color)/70 font-mono tracking-tighter">Total: ${(unitPrice * qty / 1000).toFixed(1)}K <span className="opacity-40 tracking-widest uppercase text-[7px]">MXN</span></span>
                    </div>
                </div>

                {/* Action Suite */}
                <div className="flex justify-end items-center gap-3 shrink-0 px-6 md:px-0">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClick(); }} 
                        className="bg-white text-black px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-md mr-2"
                    >
                        GET THIS!
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleBag(); }}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${inBag ? 'bg-(--main-color) text-black rotate-12 shadow-xl shadow-(--main-color)/20' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 hover:scale-110'}`}
                    >
                        {inBag ? <Check size={20} strokeWidth={3} /> : <Plus size={20} strokeWidth={2} />}
                    </button>
                    <div className="w-10 h-10 flex items-center justify-center text-white/20 group-hover:text-white transition-all group/info">
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>
            </div>
        </div>
    );
};

const DetailPanel = ({ item, exchangeRate, onClose, inBag, onToggleBag, onRemove, onAcquire, onUpdateRating, onEditItem }: any) => {
    const n = normalizeInventoryData(item.data);
    const [rating, setRating] = useState(n.rating || 0);
    const [activeMediaIndex, setActiveMediaIndex] = useState(0);
    const [showFullscreen, setShowFullscreen] = useState(false);
    const setGalleryMedia = useSetAtom(ActiveGalleryMediaAtom);
    const setGalleryIndex = useSetAtom(ActiveGalleryIndexAtom);
    const [detailScrollY, setDetailScrollY] = useState(0);
    const [pullOffset, setPullOffset] = useState(0);
    const [startPullOffset, setStartPullOffset] = useState(0);
    const [touchStartY, setTouchStartY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [showConfirmRemove, setShowConfirmRemove] = useState(false);
    const detailContainerRef = useRef<HTMLDivElement>(null);

    const mediaList = useMemo(() => {
        const raw = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = (raw.length > 0 ? raw[0] : null) || n.generatedPngUrl;
        return [main, ...raw.filter(u => u !== main && u !== n.generatedPngUrl), n.generatedPngUrl].filter(Boolean) as string[];
    }, [n.generatedPngUrl, n.mediaUrls]);

    const activeMediaUrl = mediaList[activeMediaIndex] || '';
    const activeIsVideo = isVideoFile(activeMediaUrl);

    useEffect(() => {
        setGalleryMedia(mediaList);
    }, [mediaList, setGalleryMedia]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (!showFullscreen && !showConfirmRemove) {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, showFullscreen, showConfirmRemove]);

    const handleUpdateRating = (val: number) => {
        setRating(val);
        onUpdateRating(val);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        const scrollIndex = Math.round(container.scrollLeft / container.clientWidth);
        if (scrollIndex !== activeMediaIndex && scrollIndex >= 0 && scrollIndex < mediaList.length) {
            setActiveMediaIndex(scrollIndex);
        }
    };

    const handleDetailScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const st = e.currentTarget.scrollTop;
        if (st >= 0) {
            setDetailScrollY(st);
        }
        
        // Momentum parallax past top auto-compacts details panel
        if (st < -30 && pullOffset === 0) {
            setPullOffset(400);
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStartY(e.touches[0].clientY);
        setStartPullOffset(pullOffset);
        setIsDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;
        
        const isAtTop = (detailContainerRef.current?.scrollTop || 0) <= 0;

        if (isAtTop && deltaY > 0) {
            // Pulling down at top -> compact the panel
            setPullOffset(Math.min(400, startPullOffset + deltaY));
        } else if (startPullOffset > 0 && deltaY < 0) {
            // Pulling up while compacted -> expand the panel
            setPullOffset(Math.max(0, startPullOffset + deltaY));
            if (detailContainerRef.current) {
                detailContainerRef.current.scrollTop = 0; // Lock scroll while panel expands
            }
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        // Snap behavior: expand or compact based on threshold
        if (pullOffset > 200 || (pullOffset > startPullOffset && pullOffset > 75)) {
            setPullOffset(400);
        } else {
            setPullOffset(0);
        }
    };

    const toggleCompaction = () => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setPullOffset(prev => prev > 100 ? 0 : 400);
        }
    };


    const handleAcquire = () => {
        onAcquire(item);
    };

    // Calculate dynamic styles for bidirectional immersion
    const compaction = Math.min(1, pullOffset / 400); // 0.0 to 1.0 (visual shrink mode)
    const scrollGrowth = Math.min(1, detailScrollY / 500) * 50; // 0 to 50% growth
    const pullShrink = compaction * 20; // 0 to 20% shrink
    const mobilePanelHeight = 45 + scrollGrowth - pullShrink; 
    const totalParallaxScale = 1 + (scrollGrowth * 0.05) + (compaction * 0.4); // Max ~1.45x scale when shrunk
    
    // Parallax centering: Start at -25vh (pushed up above panel), move to 0vh (centered) when compacted. Push further up on scroll.
    const totalParallaxYVh = -25 + (compaction * 25) - (scrollGrowth * 1.5);

    // Dynamic style helpers for "data dense" mode
    const dGap = (val: number) => typeof window !== 'undefined' && window.innerWidth < 768 ? Math.max(val * 0.1, val * (1 - compaction)) : val;
    const dText = (val: number) => typeof window !== 'undefined' && window.innerWidth < 768 ? Math.max(val * 0.5, val * (1 - compaction * 0.45)) : val;
    const dPad = (val: number) => typeof window !== 'undefined' && window.innerWidth < 768 ? Math.max(val * 0.1, val * (1 - compaction)) : val;




    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xl animate-in fade-in duration-300">
            {/* Navigation Controls (Floating Icons) */}
            <div className="absolute top-6 right-6 md:top-10 md:right-10 z-100 flex items-center gap-8 pointer-events-auto">
                <button onClick={onClose} className="text-white/60 hover:text-white bg-black/40 backdrop-blur-md p-3 md:p-4 rounded-full border border-white/10 transition-all transform hover:scale-110 active:scale-90 shadow-xl">
                    <X size={24} strokeWidth={1.5} />
                </button>
            </div>

            {/* Visual Media Canvas (Fullscreen Background) */}
            <div 
                className={`absolute inset-0 md:bottom-0 md:pr-[620px] bg-black overflow-hidden flex items-center justify-center cursor-zoom-in group/canvas ${isDragging ? '' : 'transition-all duration-300 ease-out'}`}
                style={{ 
                    bottom: '0',
                    transform: typeof window !== 'undefined' && window.innerWidth < 768 ? `translateY(${totalParallaxYVh}vh) scale(${totalParallaxScale})` : 'none'
                }}
                onClick={() => { setGalleryIndex(activeMediaIndex); setShowFullscreen(true); }}
            >
                <div 
                    className="h-full w-full overflow-x-auto snap-x snap-mandatory no-scrollbar flex scroll-smooth" 
                    onScroll={handleScroll}
                >
                    {mediaList.map((url, idx) => (
                        <div key={idx} className="h-full w-full snap-center shrink-0 flex items-center justify-center relative bg-black/20">
                            {isVideoFile(url) ? (
                                <video src={url} className="h-full w-full object-cover" autoPlay muted loop />
                            ) : (
                                <img src={getCleanImageUrl(url)} className="h-full w-full object-cover" />
                            )}
                        </div>
                    ))}
                </div>

                <button 
                    onClick={() => { setGalleryIndex(activeMediaIndex); setShowFullscreen(true); }}
                    className="absolute bottom-10 right-10 text-white/40 hover:text-white transition-all hover:scale-110 active:scale-90 bg-black/40 backdrop-blur-md p-4 rounded-full border border-white/10"
                >
                    <Maximize2 size={24} strokeWidth={1.5} />
                </button>

                {/* Progress Indicators */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-3">
                    {mediaList.map((_, idx) => (
                        <div key={idx} className={`h-1.5 rounded-full transition-all duration-500 ${idx === activeMediaIndex ? 'bg-white w-10' : 'bg-white/10 w-2'}`} />
                    ))}
                </div>
            </div>

            {/* Cinematic Detail Panel (Glassmorphic) */}
            <div 
                className={`absolute bottom-0 md:bottom-10 left-0 right-0 md:left-auto md:right-10 md:top-10 w-full md:w-[580px] bg-black/40 backdrop-blur-3xl border-t md:border border-white/5 rounded-t-[32px] md:rounded-[32px] shadow-2xl z-10 pointer-events-auto flex flex-col overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-right ${isDragging ? '' : 'transition-all duration-500 cubic-bezier(0.33, 1, 0.68, 1)'}`}
                style={{ 
                    height: typeof window !== 'undefined' && window.innerWidth < 768 ? `${mobilePanelHeight}%` : 'calc(100vh - 80px)' 
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Drag Handle (Mobile Only) - Tap to Toggle */}
                <div 
                    className="md:hidden w-full flex justify-center py-4 shrink-0 active:bg-white/5 transition-colors cursor-pointer"
                    onClick={toggleCompaction}
                >
                    <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                </div>

                <div 
                    ref={detailContainerRef}
                    onScroll={handleDetailScroll}
                    className="flex-1 overflow-y-auto custom-scrollbar"
                    style={{ padding: `${dPad(24)}px ${dPad(24)}px` }}
                >
                    <div className="flex flex-col relative" style={{ gap: `${dGap(24)}px` }}>
                    {/* Add to Bag (Large floating top icon inside panel) */}
                    <div className="absolute top-0 right-0 z-20">
                        <button onClick={onToggleBag} className={`flex items-center justify-center transition-all transform hover:scale-110 active:scale-90 ${inBag ? 'text-black bg-(--main-color) shadow-[0_0_25px_rgba(var(--main-color-rgb),0.5)] rotate-12 p-5 rounded-full' : 'text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-5 rounded-full border border-white/5'}`}>
                            {inBag ? <Check size={32} strokeWidth={3} /> : <ShoppingBag size={32} strokeWidth={1.5} />}
                        </button>
                    </div>

                    {/* Identity Core (Transform into Bottom Bar) */}
                    <div className={`flex pr-20 transition-all ${compaction > 0.8 ? 'flex-row justify-between items-center' : 'flex-col'}`} style={{ gap: `${dGap(16)}px` }}>
                        <h2 className="font-black text-white italic tracking-tighter leading-[1] uppercase" style={{ fontSize: `${dText(22)}px` }}>
                            {n.shape} {n.shortDescription}
                        </h2>
                        
                            <div className="flex flex-col transition-all">
                                 <div className="flex items-baseline gap-1.5 focus:outline-none">
                                    <span className="font-black text-white font-mono tracking-tighter italic" style={{ fontSize: `${dText(22)}px` }}>
                                        ${Number(n.price_mxn || n.price || 0).toLocaleString()}
                                    </span>
                                    {compaction < 0.6 && <span className="font-black text-white/20 uppercase tracking-[0.3em] mr-2" style={{ fontSize: `${dText(5.5)}px` }}>MXN</span>}
                                    
                                    <span className="font-black text-white/40 font-mono tracking-tighter italic" style={{ fontSize: `${dText(14)}px` }}>
                                        ${(Number(n.price_mxn || n.price || 0) / (exchangeRate || 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </span>
                                    {compaction < 0.6 && <span className="font-black text-white/10 uppercase tracking-[0.3em]" style={{ fontSize: `${dText(5.5)}px` }}>USD</span>}
                                 </div>
                            </div>
                    </div>

                    {/* Specification Grid & Advanced Reveal Content */}
                    <div 
                        className="grid grid-cols-1 transition-all duration-500 overflow-hidden" 
                        style={{ 
                            gap: `${dGap(32)}px`,
                            opacity: 1 - compaction * 1.5,
                            transform: `translateY(${compaction * 20}px) scale(${1 - compaction * 0.1})`,
                            maxHeight: compaction > 0.8 ? '0px' : '500px'
                        }}
                    >
                        {/* Dimensional Architecture */}
                        <div className="flex flex-col" style={{ gap: `${dGap(6)}px` }}>
                            <div className="flex flex-col" style={{ gap: `${dGap(6)}px` }}>
                                <div className="flex items-baseline gap-3">
                                    <span className="font-black text-white italic tracking-tight uppercase leading-none" style={{ fontSize: `${dText(18)}px` }}>
                                        {n.widthCm} x {n.lengthCm} x {n.heightCm} 
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-3 text-white/30">
                                    <span className="font-black italic tracking-wide uppercase" style={{ fontSize: `${dText(12)}px` }}>
                                        {cmToImperial(n.widthCm)} x {cmToImperial(n.lengthCm)} x {cmToImperial(n.heightCm)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Compositional Identity */}
                        <div className="flex flex-col" style={{ gap: `${dGap(10)}px` }}>
                            <div className="flex flex-wrap" style={{ gap: `${dGap(32)}px` }}>
                                <div className="flex flex-col">
                                    <span className="font-black text-white/50 uppercase tracking-tight" style={{ fontSize: `${dText(11)}px` }}>{n.color}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-black text-white/50 uppercase tracking-tight" style={{ fontSize: `${dText(11)}px` }}>{n.material}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-black text-white/50 font-mono tracking-tight" style={{ fontSize: `${dText(11)}px` }}>{n.weightKg}KG</span>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>

                {/* Immersive Acquisition Call */}
                    <div className="flex flex-col" style={{ gap: `${dGap(16)}px`, marginTop: `${dPad(6)}px`, paddingTop: `${dPad(12)}px` }}>
                        <button 
                            onClick={handleAcquire}
                            className="w-full bg-white text-black font-black uppercase tracking-[0.8em] rounded-[24px] hover:bg-(--main-color) hover:scale-[1.02] transition-all flex items-center justify-center group"
                            style={{ padding: `${dText(14)}px`, fontSize: `${dText(10)}px`, gap: `${dGap(12)}px` }}
                        >
                            GET IT! <ArrowRight size={dText(16)} className="group-hover:translate-x-5 transition-transform" />
                        </button>

                        {/* Admin Action Icons */}
                        <div className="flex items-center justify-center gap-10 mt-2 opacity-30 hover:opacity-100 transition-opacity">
                            <button onClick={() => onEditItem(n)} className="text-white/40 hover:text-white transition-all transform hover:scale-125 active:scale-90">
                                <Edit3 size={18} strokeWidth={2} />
                            </button>
                            <button onClick={() => setShowConfirmRemove(true)} className="text-rose-500/40 hover:text-rose-500 transition-all transform hover:scale-125 active:scale-90">
                                <Trash2 size={18} strokeWidth={2} />
                            </button>
                        </div>
                    </div>
                </div>

            {/* Deletion Interface */}
            {showConfirmRemove && (
                <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8 md:p-12 text-center pointer-events-auto rounded-none md:rounded-[32px]">
                    <div className="flex flex-col gap-10 animate-in zoom-in duration-300">
                        <div className="flex flex-col gap-4">
                            <span className="text-rose-500 font-black uppercase tracking-[0.8em] text-[10px] md:text-[11px]">Secure Protocol Deletion</span>
                            <h3 className="text-5xl md:text-6xl font-black text-white uppercase italic tracking-tighter leading-[0.8] mb-4">Discard<br/>Artifact?</h3>
                            </div>
                            <div className="flex flex-col gap-4">
                                <button onClick={() => { onRemove(item); onClose(); }} className="w-full py-8 bg-rose-600 text-white text-[12px] font-black uppercase tracking-widest hover:bg-rose-500 transition-all font-mono">Confirm Erasure</button>
                                <button onClick={() => setShowConfirmRemove(false)} className="w-full py-6 bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel Operation</button>
                        </div>
                    </div>
                </div>
            )}



            {showFullscreen && <FullscreenImageViewer src={activeMediaUrl!} isVideo={activeIsVideo} rating={rating} onUpdateRating={(r: number) => handleUpdateRating(r)} onClose={() => setShowFullscreen(false)} />}
        </div>
    );
};


/* ─── Gallery Full Item ─── */

const GalleryFullItem = ({ item, onOpenDetails, inBag, onToggleBag }: { item: any; onOpenDetails: () => void; inBag: boolean; onToggleBag: () => void }) => {
    const n = normalizeInventoryData(item.data);
    const mediaUrls = useMemo(() => {
        const raw = n.mediaUrls ? String(n.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        const main = (raw.length > 0 ? raw[0] : null) || n.generatedPngUrl;
        return [main, ...raw.filter(u => u !== main && u !== n.generatedPngUrl), n.generatedPngUrl].filter(Boolean) as string[];
    }, [n.generatedPngUrl, n.mediaUrls]);

    const primaryMedia = mediaUrls[0] || '';
    const isVideo = primaryMedia.toLowerCase().endsWith('.mp4') || primaryMedia.toLowerCase().endsWith('.mov');
    const vendorPrefix = n.itemId?.split('-')[0];
    const vColor = vendors[vendorPrefix as keyof typeof vendors]?.color || 'var(--main-color)';

    return (
        <div className="h-full w-full bg-black relative flex flex-col justify-center items-center overflow-hidden cursor-pointer" onClick={onOpenDetails}>
            {/* Immersive Background */}
            <div className="absolute inset-0 z-0">
                {primaryMedia ? (
                    isVideo ? (
                        <video src={primaryMedia} className="w-full h-full object-cover grayscale-[0.2]" autoPlay muted loop />
                    ) : (
                        <img src={getCleanImageUrl(primaryMedia)} className="w-full h-full object-cover grayscale-[0.2]" />
                    )
                ) : (
                   <div className="w-full h-full bg-black/40 flex items-center justify-center">
                       <PackageSearch size={160} className="text-white/5" strokeWidth={1} />
                   </div>
                )}
                <div className="absolute inset-0 bg-linear-to-b from-black/40 via-transparent to-black/90" />
                <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
            </div>

            {/* UI Overlay */}
            <div className="absolute inset-0 z-10 p-10 flex flex-col justify-between pointer-events-none">
                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2 animate-in slide-in-from-top duration-700">
                        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 w-fit">
                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: vColor, boxShadow: `0 0 10px ${vColor}` }} />
                            <span className="text-[12px] font-black italic uppercase tracking-[0.4em]" style={{ color: vColor }}>{vendorPrefix}-{String(n.itemNumber || 0).padStart(2, '0')}</span>
                        </div>
                        <h2 className="text-5xl font-black text-white uppercase italic tracking-tighter leading-none max-w-xl">{n.shape} {n.shortDescription}</h2>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom duration-700">
                        <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-black text-white tracking-tighter italic">${Number(n.price_mxn || n.price || 0).toLocaleString()}</span>
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">MXN</span>
                        </div>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">{n.color} | {n.material}</p>
                        
                        <div className="flex items-center gap-6 mt-2 pt-4 border-t border-white/10">
                            <div className="flex flex-col text-left">
                                <span className="text-[12px] font-black text-white/80 tracking-widest uppercase">{n.widthCm}x{n.lengthCm}x{n.heightCm} <span className="opacity-40 text-[10px]">CM</span></span>
                                <span className="text-[10px] font-bold text-white/40 tracking-wider uppercase">{cmToImperial(n.widthCm)}x{cmToImperial(n.lengthCm)}x{cmToImperial(n.heightCm)} <span className="opacity-40 text-[8px]">IN</span></span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[12px] font-black text-white/60 tracking-widest uppercase">{n.weightKg} <span className="opacity-40 text-[10px]">KG</span></span>
                                <span className="text-[8px] font-black text-white/20 tracking-wider uppercase opacity-0">...</span>
                            </div>
                        </div>
                    </div>

                    <div className="pointer-events-auto mb-4 flex items-center gap-4 animate-in slide-in-from-bottom duration-700" style={{ animationDelay: '200ms' }}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}
                            className="flex items-center gap-4 text-black bg-white px-8 py-4 rounded-[24px] group/acq hover:scale-105 transition-all w-[240px] justify-between"
                        >
                            <span className="text-sm font-black uppercase tracking-[0.4em]">GET THIS!</span>
                            <ArrowRight size={20} strokeWidth={2.5} className="group-hover/acq:translate-x-2 transition-transform" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggleBag(); }}
                            className={`flex items-center gap-3 px-8 py-4 rounded-[24px] border border-white/10 backdrop-blur-md hover:scale-105 transition-all w-[240px] justify-between text-white ${inBag ? 'bg-(--main-color) text-black border-(--main-color) shadow-[0_0_20px_var(--main-color)]' : 'bg-black/40 hover:bg-white/10'}`}
                        >
                            <span className="text-sm font-black uppercase tracking-[0.4em]">{inBag ? 'IN BAG' : 'ADD TO BAG'}</span>
                            {inBag ? <Check size={20} strokeWidth={2.5} /> : <ShoppingBag size={20} strokeWidth={2} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Hint for vertical scroll */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-20 flex flex-col items-center gap-2">
                 <div className="w-px h-10 bg-white" />
                 <span className="text-[8px] font-black uppercase tracking-[1em] rotate-90 ml-2">Scroll</span>
            </div>
        </div>
    );
};

/* ─── Fullscreen Image Viewer ─── */

const FullscreenImageViewer = ({ src, isVideo, rating, onUpdateRating, onClose }: { src: string; isVideo: boolean; rating: number; onUpdateRating: (r: number) => void; onClose: () => void }) => {
    const mediaUrls = useAtomValue(ActiveGalleryMediaAtom);
    const [activeIndex, setActiveIndex] = useAtom(ActiveGalleryIndexAtom);

    // Zoom State
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [startDist, setStartDist] = useState(0);
    const [lastScale, setLastScale] = useState(1);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (scale !== 1) return; // Disable gallery swiping when zoomed
        const container = e.currentTarget;
        const scrollIndex = Math.round(container.scrollLeft / container.clientWidth);
        if (scrollIndex !== activeIndex && scrollIndex >= 0 && scrollIndex < mediaUrls.length) {
            setActiveIndex(scrollIndex);
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch' && (e as any).nativeEvent.touches.length === 2) {
            const t = (e as any).nativeEvent.touches;
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            setStartDist(dist);
            setLastScale(scale);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch' && (e as any).nativeEvent.touches.length === 2) {
            const t = (e as any).nativeEvent.touches;
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            const factor = dist / startDist;
            const newScale = Math.min(Math.max(lastScale * factor, 1), 5);
            setScale(newScale);
        }
    };

    const resetZoom = () => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return createPortal(
        <div 
            className="fixed inset-0 z-100000 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500 overflow-hidden flex flex-col items-center justify-center"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
        >
            {/* Top Navigation / Progress */}
            <div className="absolute top-8 left-6 md:top-10 md:left-10 z-50 pointer-events-auto">
                <button 
                    onClick={onClose} 
                    className="flex items-center gap-2 md:gap-4 text-white/50 hover:text-white transition-all bg-black/40 backdrop-blur-md px-4 md:px-6 py-3 md:py-4 rounded-full border border-white/5 active:scale-95"
                >
                    <ChevronLeft size={20} strokeWidth={2} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] hidden md:block">Return</span>
                </button>
            </div>

            <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-6 z-50 pointer-events-none">
                <div className="flex gap-2">
                    {mediaUrls.map((_, idx) => (
                        <div 
                            key={idx} 
                            className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${idx === activeIndex ? 'bg-(--main-color) w-8' : 'bg-white/20'}`} 
                        />
                    ))}
                </div>
            </div>

            {/* Scale Indicator */}
            {scale > 1 && (
                <div className="absolute top-24 px-4 py-1 bg-white/10 rounded-full text-[10px] font-black text-white/40 uppercase tracking-widest z-50">
                    Zoom: {scale.toFixed(1)}x
                </div>
            )}

            {/* Main scrollable gallery */}
            <div 
                className={`w-full h-full flex scroll-smooth ${scale === 1 ? 'overflow-x-auto snap-x snap-mandatory no-scrollbar' : 'overflow-hidden'}`}
                onScroll={handleScroll}
            >
                {mediaUrls.map((url, idx) => (
                    <div key={idx} className="h-full w-full snap-start shrink-0 relative flex items-center justify-center p-4 overflow-hidden">
                        {isVideoFile(url) ? (
                            <video src={url} controls autoPlay className="max-h-full max-w-full object-contain" />
                        ) : (
                            <div 
                                style={{ 
                                    transform: `scale(${idx === activeIndex ? scale : 1}) translate(${offset.x}px, ${offset.y}px)`,
                                    transition: startDist === 0 ? 'transform 0.1s ease-out' : 'none'
                                }}
                                className="w-full h-full flex items-center justify-center touch-none"
                            >
                                <img 
                                    src={getCleanImageUrl(url)} 
                                    className="max-h-full max-w-full object-contain select-none shadow-2xl" 
                                    alt="" 
                                    onDoubleClick={() => scale === 1 ? setScale(2.5) : resetZoom()}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="absolute bottom-10 inset-x-0 px-20 flex items-center justify-between z-50 pointer-events-none">
                <div className="bg-black/40 backdrop-blur-xl border border-white/5 px-6 py-3 rounded-full pointer-events-auto">
                    <StarRating rating={rating} onChange={onUpdateRating} size={14} />
                </div>
                
                <div className="flex gap-4 pointer-events-auto">
                    {scale > 1 && (
                        <button 
                            onClick={resetZoom}
                            className="w-14 h-14 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-all uppercase text-[8px] font-black tracking-tighter"
                        >
                            Reset
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="group w-14 h-14 bg-white/5 hover:bg-white text-white hover:text-black border border-white/10 transition-all rounded-full flex items-center justify-center"
                    >
                        <X size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default StoreView;
