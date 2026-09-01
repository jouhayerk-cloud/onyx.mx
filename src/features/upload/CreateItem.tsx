import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { uploadItemDataAtom, uploadMediaFilesAtom, userAtom, inventoryAtom, batchCreateModeAtom, isUploadWizardOpenAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { vendors } from '../../lib/consts';
import { BatchCreateWizard } from './BatchCreateWizard';
import { calculateCodesAndPrices, handleFileUpload, readFileAsDataURL, getTextColorForBg, generateUniqueId } from '../../lib/utils';
import toast from 'react-hot-toast';
import { Trash2, Save, UploadCloud, X, Plus, Image as ImageIcon, Layers } from 'lucide-react';
import { useDatabase } from '../../lib/hooks';
import { tr } from '../../lib/i18n';

const lbl = "text-[9px] font-black text-black/50 uppercase tracking-[0.1em] mb-1 flex items-center gap-1.5";
const inp = "h-10 w-full px-3 bg-black/[0.02] border border-black/5 rounded-lg text-[12px] font-bold text-black placeholder-black/20 outline-none focus:ring-2 focus:ring-(--main-color)/50 focus:bg-black/[0.04] transition-all";

export function CreateItem() {
    const [mode, setMode] = useAtom(batchCreateModeAtom);
    const allItems = useAtomValue(inventoryAtom);
    const [activeField, setActiveField] = useState<string | null>(null);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const [mediaFiles, setMediaFiles] = useAtom(uploadMediaFilesAtom);
    const user = useAtomValue(userAtom);
    const db = useDatabase();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [savingProgress, setSavingProgress] = useState(0);

    // ─── Legacy Add Entry wizard ──────────────────────────────────────────────
    // The wizard is mounted app-wide in MainAppView, so opening it here overlays
    // this view. It shares uploadItemDataAtom with us and clears that atom when it
    // saves, so this form's state is stashed on the way in and put back on the way
    // out — otherwise returning from the wizard would land on a blank Create Item.
    const [isWizardOpen, setIsWizardOpen] = useAtom(isUploadWizardOpenAtom);
    const preWizardData = useRef<typeof itemData | null>(null);

    const openLegacyWizard = () => {
        preWizardData.current = itemData;
        setItemData({
            // Carry the chosen vendor across; the season is picked in the wizard,
            // which now offers v826 alongside v326/v825.
            vendorId: itemData.vendorId,
            workbook: 'v326',
            quantity: '1'
        });
        setIsWizardOpen(true);
    };

    useEffect(() => {
        if (isWizardOpen || !preWizardData.current) return;
        setItemData(preWizardData.current);
        preWizardData.current = null;
    }, [isWizardOpen]);

    // Initialize ID and default season
    useEffect(() => {
        if (!itemData.itemId) {
            setItemData(prev => ({ ...prev, itemId: generateUniqueId(), workbook: 'v826', quantity: '1', itemNumber: '1' }));
        }
    }, []);

    const selectedVendorKey = itemData.vendorId;
    const vendorData = selectedVendorKey ? vendors[selectedVendorKey as keyof typeof vendors] : null;

    // Derived tag ID preview
    const tagPreview = useMemo(() => {
        if (!selectedVendorKey) return null;
        const finalItemId = `${selectedVendorKey}-${itemData.itemId || 'temp'}`;
        const calculated = calculateCodesAndPrices(
            { price: itemData.price, itemId: finalItemId, workbook: itemData.workbook || 'v826', itemNumber: itemData.itemNumber || '1' },
            19, // Exchange rate (mocked for preview, could use context if available)
            'v826'
        );
        return {
            vendor: selectedVendorKey,
            season: String(itemData.workbook || 'v826').replace('v', ''),
            count: itemData.itemNumber || '1',
            cypher: calculated.bookLandCode || 'XXXX',
            display: calculated.bookBarcodeDisplay
        };
    }, [selectedVendorKey, itemData.price, itemData.itemId, itemData.workbook, itemData.itemNumber]);

    // Smart Auto-Suggestions based on old DB
    const suggestions = useMemo(() => {
        const getCascadingVals = (targetField: string, dependencies: {field: string, value: string}[]) => {
            const counts: Record<string, number> = {};
            const labels: Record<string, string> = {};
            allItems.forEach(i => {
                const d = i.data || i;
                
                let matches = true;
                for (const dep of dependencies) {
                    if (dep.value) {
                        const dVal = String(d[dep.field] || '').trim().toUpperCase();
                        const desc = String(d.description || '').trim().toUpperCase();
                        if (dVal !== dep.value.toUpperCase() && !desc.includes(dep.value.toUpperCase())) {
                            matches = false;
                            break;
                        }
                    }
                }
                if (!matches) return;

                let val = String(d[targetField] || '').trim();

                // Fallbacks for mis-saved data in v326
                if (targetField === 'short_description' && (!val || val.toUpperCase() === 'NULL')) val = String(d.item_type || '').trim();

                if (val && val !== '-' && val.toUpperCase() !== 'NULL' && val.length > 1) {
                    // Count case-insensitively but offer the stored spelling.
                    // Uppercasing the value here meant the dropdown proposed
                    // PENDANT while the column holds Pendant, which is how the
                    // 69-variant / 47-real-value spread accumulated.
                    const key = val.toUpperCase();
                    if (!labels[key]) labels[key] = val;
                    counts[key] = (counts[key] || 0) + 1;
                }
            });
            return Object.entries(counts).sort((a,b) => b[1] - a[1]).map(e => labels[e[0]] ?? e[0]).slice(0, 8);
        };

        return {
            shape: getCascadingVals('shape', [{field: 'short_description', value: itemData.itemType || ''}]),
            itemType: getCascadingVals('short_description', [{field: 'shape', value: itemData.shape || ''}]),
            color: getCascadingVals('color', [{field: 'material', value: itemData.material || ''}]),
            material: getCascadingVals('material', [{field: 'color', value: itemData.color || ''}]),
            sizes: (() => {
                // Filter sizes based on shape and type
                const sizeCounts: Record<string, {w: string, l: string, h: string, count: number}> = {};
                allItems.forEach(i => {
                    const d = i.data || i;
                    const sh = String(d.shape || '').trim().toUpperCase();
                    const ty = String(d.short_description || d.item_type || '').trim().toUpperCase();
                    const ds = String(d.description || '').trim().toUpperCase();
                    
                    if (itemData.shape && sh !== itemData.shape.toUpperCase() && !ds.includes(itemData.shape.toUpperCase())) return;
                    if (itemData.itemType && ty !== itemData.itemType.toUpperCase() && !ds.includes(itemData.itemType.toUpperCase())) return;
                    
                    const w = d.width_cm; const l = d.length_cm; const h = d.height_cm;
                    if (w || l || h) {
                        const lbl = `${w||0}W x ${l||0}L x ${h||0}H`;
                        if (!sizeCounts[lbl]) sizeCounts[lbl] = { w: String(w||''), l: String(l||''), h: String(h||''), count: 0 };
                        sizeCounts[lbl].count++;
                    }
                });
                return Object.entries(sizeCounts)
                    .sort((a,b) => b[1].count - a[1].count)
                    .slice(0, 8)
                    .map(e => ({ label: e[0], ...e[1] }));
            })()
        };
    }, [allItems, itemData.shape, itemData.itemType, itemData.color, itemData.material]);

    const set = (key: string, val: string) => setItemData(prev => ({ ...prev, [key]: val }));

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const uploaded = [];
        for (const file of files) {
            const type = file.type.startsWith('video/') ? 'video' : 'image';
            const localUrl = await readFileAsDataURL(file, type);
            uploaded.push({ type, localUrl, originalFile: file, tag: 'Item' });
        }
        setMediaFiles(prev => [...prev, ...uploaded]);
    };

    const handleClear = () => {
        setItemData({ itemId: generateUniqueId(), workbook: 'v826', quantity: '1', itemNumber: '1', vendorId: '' });
        setMediaFiles([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedVendorKey) return toast.error(tr("Please select a vendor first"));
        
        setIsSaving(true);
        setSavingProgress(10);
        
        try {
            let uploadedUrls: string[] = [];
            
            if (mediaFiles.length > 0) {
                for (let i = 0; i < mediaFiles.length; i++) {
                    const file = mediaFiles[i];
                    if (file.originalFile) {
                        const result = await handleFileUpload(file.originalFile, user);
                        if (result) {
                            uploadedUrls.push(result.thumbnailUrl);
                        }
                    }
                    setSavingProgress(Math.round(10 + ((i + 1) / mediaFiles.length) * 60));
                }
            } else {
                setSavingProgress(70);
            }
            
            const finalItemId = `${selectedVendorKey}-${itemData.itemId}`;
            const calculated = calculateCodesAndPrices(
                { price: itemData.price, itemId: finalItemId, workbook: itemData.workbook || 'v826', itemNumber: itemData.itemNumber || '1' },
                19,
                'v826'
            );

            const dbRow = {
                item_id: finalItemId,
                item_number: itemData.itemNumber || '1',
                shape: itemData.shape,
                material: itemData.material,
                color: itemData.color,
                short_description: itemData.itemType,
                width_cm: itemData.widthCm ? Number(itemData.widthCm) : null,
                length_cm: itemData.lengthCm ? Number(itemData.lengthCm) : null,
                height_cm: itemData.heightCm ? Number(itemData.heightCm) : null,
                price_mxn: itemData.price ? Number(itemData.price) : null,
                quantity: itemData.quantity ? Number(itemData.quantity) : 1,
                status: 'Available',
                workbook: itemData.workbook || 'v826',
                media_urls: uploadedUrls.join(','),
                timestamp: new Date().toISOString(),
                book_barcode: calculated.bookBarcode,
                book_aq_code: calculated.bookAqCode,
                book_landed: isNaN(Number(calculated.bookLanded)) ? null : Number(calculated.bookLanded),
                book_retail: isNaN(Number(calculated.bookRetail)) ? null : Number(calculated.bookRetail)
            };
            
            setSavingProgress(90);
            const { data, error } = await supabase.from('inventory').insert(dbRow).select().single();
            if (error) throw error;
            
            if (db && data) {
                try {
                    await db.inventory.upsert({
                        ...data,
                        id: String(data.id),
                        workbook: data.workbook != null ? String(data.workbook) : null
                    });
                } catch(err) { console.error(err); }
            }
            
            setSavingProgress(100);
            toast.success(tr("Item saved!"));
            setTimeout(() => {
                setIsSaving(false);
                setSavingProgress(0);
                handleClear();
                setItemData(prev => ({ ...prev, itemNumber: String(Number(itemData.itemNumber || 1) + 1), vendorId: selectedVendorKey }));
            }, 500);

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Error saving item');
            setIsSaving(false);
            setSavingProgress(0);
        }
    };

    return (
        <div className="create-item flex flex-col gap-5 w-full max-w-5xl mx-auto pb-24 relative p-4 sm:p-6 rounded-none md:rounded-xl">
            {/* Mode Toggle + legacy wizard launcher */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                <div className="flex bg-black/[0.03] p-1 rounded-lg w-fit border border-black/5">
                    <button
                        type="button"
                        onClick={() => setMode('single')}
                        className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                            mode === 'single' ? 'bg-white shadow-sm text-black' : 'text-black/40 hover:text-black/60'
                        }`}
                    >
                        {tr("Single Item")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('batch')}
                        className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                            mode === 'batch' ? 'bg-white shadow-sm text-black' : 'text-black/40 hover:text-black/60'
                        }`}
                    >
                        {tr("Batch XLSX")}
                    </button>
                </div>

                {/* Opens the original Add Entry modal over this view. It covers every
                    season — Book 826 as well as the legacy 326/825 books. */}
                <button
                    type="button"
                    onClick={openLegacyWizard}
                    title={tr("Open the classic Add Entry wizard — supports Book 826, 326 and 825")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-black/10 bg-white text-black/60 hover:text-black hover:border-black/25 hover:shadow-sm text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
                >
                    <Layers size={13} strokeWidth={2.5} />
                    {tr("Add Entry")}
                    <span className="text-[8px] font-black text-black/30 tracking-[0.15em]">826 · 326 · 825</span>
                </button>
            </div>

            {/* Vendor Bar (Shared between modes) */}
            <div className="flex flex-col gap-4">
                {!selectedVendorKey ? (
                    <div className="flex gap-1 overflow-x-auto no-scrollbar animate-in fade-in zoom-in-95 duration-300 pb-1">
                        {Object.keys(vendors).filter(k => !['R', 'M', 'W', 'C', tr("ON"), 'SIMONA', 'JUAN'].includes(k)).sort().map(id => {
                            const v = vendors[id as keyof typeof vendors];
                            return (
                                <button
                                    type="button"
                                    key={id}
                                    onClick={() => set('vendorId', id)}
                                    className="min-w-0 flex-1 px-1 h-8 rounded text-[9px] font-black transition-all hover:-translate-y-1 active:translate-y-0 shadow-sm whitespace-nowrap"
                                    style={{ backgroundColor: v.color, color: getTextColorForBg(v.color) }}
                                >
                                    {id}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row items-start gap-4 animate-in slide-in-from-left-4 duration-300">
                        {/* Selected Vendor & Tag ID Preview */}
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => set('vendorId', '')} 
                                className="px-3 py-1 flex items-center justify-center text-2xl font-black transition-all active:scale-95 shadow-sm rounded"
                                style={{ backgroundColor: vendorData?.color || '#333', color: getTextColorForBg(vendorData?.color || '#333') }}>
                                <span>{tagPreview?.vendor} {tagPreview?.season}</span>
                            </button>
                            <div className="flex items-center gap-2 px-2">
                                <span className="text-2xl font-black text-black">{mode === 'single' ? tagPreview?.count : tr("BATCH")}</span>
                                <span className="text-2xl font-black text-black">{mode === 'single' ? tagPreview?.cypher : ''}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {mode === 'batch' ? (
                <BatchCreateWizard vendorKey={selectedVendorKey as string} />
            ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-5 relative">
                    {/* Media Area (Dashed box or Image) */}
            <div className="w-full">
                <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,video/*" onChange={handleFileChange} />
                
                <div className="flex flex-wrap gap-2 animate-in fade-in duration-300">
                    {mediaFiles.map((f, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden shadow-sm group shrink-0">
                            <img src={f.localUrl} className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                                className="absolute top-1 right-1 w-5 h-5 bg-white/80 rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-white hover:scale-110 shadow-sm">
                                <X size={12} strokeWidth={3} />
                            </button>
                        </div>
                    ))}
                    
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 border border-dashed border-black/20 rounded-xl flex items-center justify-center cursor-pointer hover:bg-black/5 hover:border-cyan-400 transition-all text-black/20 shrink-0">
                        <Plus size={24} />
                    </button>
                </div>
            </div>

            {/* Form Fields */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-black/5 mt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    
                    <div className="flex flex-col gap-1.5">
                        <label className={lbl}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                            {tr("SHAPE")}
                        </label>
                        <input type="text" value={itemData.shape || ''} onChange={e => set('shape', e.target.value)} onFocus={() => setActiveField('shape')} onBlur={() => setTimeout(() => setActiveField(null), 200)} className={inp} placeholder="" />
                        {activeField === 'shape' && suggestions.shape.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5 animate-in slide-in-from-top-1">
                                {suggestions.shape.map(s => (
                                    <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); set('shape', s); setActiveField(null); }} className="px-2 py-1 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded text-[9px] font-black uppercase tracking-wider transition-colors">{s}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className={lbl}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                            {tr("TYPE")}
                        </label>
                        <input type="text" value={itemData.itemType || ''} onChange={e => set('itemType', e.target.value)} onFocus={() => setActiveField('itemType')} onBlur={() => setTimeout(() => setActiveField(null), 200)} className={inp} placeholder="" />
                        {activeField === 'itemType' && suggestions.itemType.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5 animate-in slide-in-from-top-1">
                                {suggestions.itemType.map(s => (
                                    <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); set('itemType', s); setActiveField(null); }} className="px-2 py-1 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded text-[9px] font-black uppercase tracking-wider transition-colors">{s}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className={lbl}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            {tr("COLOR")}
                        </label>
                        <input type="text" value={itemData.color || ''} onChange={e => set('color', e.target.value)} onFocus={() => setActiveField('color')} onBlur={() => setTimeout(() => setActiveField(null), 200)} className={inp} placeholder="" />
                        {activeField === 'color' && suggestions.color.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5 animate-in slide-in-from-top-1">
                                {suggestions.color.map(s => (
                                    <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); set('color', s); setActiveField(null); }} className="px-2 py-1 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded text-[9px] font-black uppercase tracking-wider transition-colors">{s}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className={lbl}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.2 7.8l-7.7 7.7-4-4-5.7 5.7"></path><path d="M15 7h6v6"></path></svg>
                            {tr("MATERIAL")}
                        </label>
                        <input type="text" value={itemData.material || ''} onChange={e => set('material', e.target.value)} onFocus={() => setActiveField('material')} onBlur={() => setTimeout(() => setActiveField(null), 200)} className={inp} placeholder="" />
                        {activeField === 'material' && suggestions.material.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5 animate-in slide-in-from-top-1">
                                {suggestions.material.map(s => (
                                    <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); set('material', s); setActiveField(null); }} className="px-2 py-1 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded text-[9px] font-black uppercase tracking-wider transition-colors">{s}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="md:col-span-2 flex flex-col gap-1.5 bg-black/[0.02] p-4 rounded-xl border border-black/5">
                        <label className={lbl}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                            {tr("DIMENSIONS (CM)")}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            <input type="number" min="0" value={itemData.widthCm || ''} onChange={e => set('widthCm', e.target.value)} onFocus={() => setActiveField('size')} onBlur={() => setTimeout(() => setActiveField(null), 200)} className={inp + ' text-center'} placeholder={tr("Width")} />
                            <input type="number" min="0" value={itemData.lengthCm || ''} onChange={e => set('lengthCm', e.target.value)} onFocus={() => setActiveField('size')} onBlur={() => setTimeout(() => setActiveField(null), 200)} className={inp + ' text-center'} placeholder={tr("Length")} />
                            <input type="number" min="0" value={itemData.heightCm || ''} onChange={e => set('heightCm', e.target.value)} onFocus={() => setActiveField('size')} onBlur={() => setTimeout(() => setActiveField(null), 200)} className={inp + ' text-center'} placeholder={tr("Height")} />
                        </div>
                        {activeField === 'size' && suggestions.sizes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 animate-in slide-in-from-top-1">
                                {suggestions.sizes.map(s => (
                                    <button key={s.label} type="button" onMouseDown={(e) => { e.preventDefault(); set('widthCm', s.w); set('lengthCm', s.l); set('heightCm', s.h); setActiveField(null); }} className="px-2 py-1 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded text-[9px] font-black uppercase tracking-wider transition-colors">{s.label}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="md:col-span-2 flex items-center justify-between gap-6 bg-black/[0.02] p-4 rounded-xl border border-black/5">
                        <div className="flex flex-col gap-1 w-1/4">
                            <label className={`${lbl} mb-0 text-cyan-500 shrink-0`}>
                                <span className="text-cyan-500 font-mono text-sm leading-none">#</span> {tr("QTY")}
                            </label>
                            <input type="number" min="1" value={itemData.quantity || '1'} onChange={e => set('quantity', e.target.value)} className="w-full bg-transparent border-none text-2xl font-black outline-none text-black" />
                        </div>
                        <div className="flex flex-col justify-center flex-1 items-end">
                            <label className={`${lbl} justify-end`}>
                                <span className="text-black/60 font-mono text-sm leading-none">#</span> {tr("ACQ MXN")}
                            </label>
                            <input type="number" min="0" value={itemData.price || ''} onChange={e => set('price', e.target.value)} className={`w-full bg-transparent border-none text-4xl! font-black! text-right placeholder-black/10 outline-none`} placeholder="0" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="absolute -bottom-5 right-6 flex items-center gap-2 z-50">
                <button type="button" onClick={handleClear} disabled={isSaving}
                    className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-black/40 hover:text-red-500 transition-all shadow-sm disabled:opacity-50 border border-black/5">
                    <Trash2 size={16} />
                </button>
                <button type="submit" disabled={isSaving || !selectedVendorKey}
                    className="w-14 h-14 bg-white rounded-lg border-2 border-cyan-400 flex items-center justify-center text-cyan-400 hover:bg-cyan-50 transition-all shadow-sm disabled:opacity-50 disabled:grayscale">
                    {isSaving ? <span className="text-[10px] font-black uppercase tracking-widest">{savingProgress}%</span> : <Save size={20} strokeWidth={2.5} />}
                </button>
            </div>
            
            {/* Progress overlay */}
            {isSaving && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-xl z-40 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-48 h-2 bg-black/10 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${savingProgress}%` }} />
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest text-black drop-shadow-md">{tr("Saving Item...")}</span>
                    </div>
                </div>
            )}
        </form>
            )}
        </div>
    );
}
