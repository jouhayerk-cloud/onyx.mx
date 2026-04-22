import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import {
    uploadItemDataAtom, uploadMediaFilesAtom,
    userAtom, activeViewAtom, exchangeRateAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { handleFileUpload, generateUniqueId, readFileAsDataURL, calculateCodesAndPrices, getTextColorForBg } from '../../lib/utils';
import { useDatabase } from '../../lib/hooks';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { UploadedFile } from '../../lib/Types';
import { ai } from '../../lib/ai';
import { Type } from '@google/genai';
import toast from 'react-hot-toast';



const lbl = "text-[12px] font-black uppercase tracking-widest text-(--text-color-secondary) block mb-2 px-1";
const inp = "w-full bg-(--glass-bg) border border-(--border-color) rounded-[14px] px-5 py-3.5 text-base text-(--text-color) placeholder:text-(--text-color-secondary)/30 focus:outline-none focus:border-(--main-color)/50 transition-all shadow-sm";
const inpNum = inp + " font-mono text-center";

const MEDIA_TYPES = [
    { id: 'none', label: 'None', icon: 'x' },
    { id: 'single', label: 'Pic', icon: 'image' },
    { id: 'sample', label: 'Smp', icon: 'search' },
    { id: 'lot', label: 'Lot', icon: 'package' },
    { id: 'video', label: 'Vid', icon: 'video' },
];

const SuggestChips: React.FC<{
    values: string[];
    onSelect: (v: string) => void;
    current: string;
    query?: string;
}> = ({ values, onSelect, current, query }) => {
    const q = (query || '').toLowerCase();
    const filtered = values.filter(v => v.toLowerCase().includes(q)).slice(0, 10);
    if (!filtered.length) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1.5 animate-in fade-in duration-200">
            {filtered.map(v => (
                <button key={v} type="button" onClick={() => onSelect(v)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all
                        ${v === current ? 'border-(--main-color) text-(--main-color) bg-(--main-color)/10 shadow-[0_0_15px_rgba(var(--main-color-rgb),0.1)]'
                            : 'border-(--border-color) text-(--text-color-secondary) hover:border-(--main-color)/30 hover:text-(--text-color)'}`}>
                    {v}
                </button>
            ))}
        </div>
    );
};

import { CloudUpload, Check } from 'lucide-react';

export function UploadEntryForm() {
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const [mediaFiles, setMediaFiles] = useAtom(uploadMediaFilesAtom);
    const user = useAtomValue(userAtom);
    const setView = useSetAtom(activeViewAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savingProgress, setSavingProgress] = useState(0);
    const [vendorDocs, setVendorDocs] = useState<any[]>([]);

    const canSelectVendor = user?.role === 'Developer' || user?.role === 'Admin';
    const defaultVendorId = canSelectVendor
        ? (Object.keys(vendors)[0] || '')
        : (user?.id || user?.email || '');

    useEffect(() => {
        if (!itemData.itemId) {
            setItemData({
                itemId: generateUniqueId(),
                vendorId: defaultVendorId,
                status: 'Available',
                workbook: 'v326',
            });
        }
    }, [defaultVendorId, itemData.itemId, setItemData]);

    useEffect(() => {
        if (!db || !itemData.vendorId) return;
        let timer: any;
        const sub = db.inventory.find().$.subscribe((docs: any[]) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const filtered = docs
                    .map(d => d.toJSON())
                    .filter(d => !itemData.vendorId || d.item_id?.startsWith(itemData.vendorId));
                setVendorDocs(filtered);

                const maxNum = filtered.reduce((max, d) => {
                    const num = parseInt(d.item_number || '0', 10);
                    return !isNaN(num) && num > max ? num : max;
                }, 0);
                setItemData(prev => ({ ...prev, itemNumber: String(maxNum + 1) }));
            }, 300);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db, itemData.vendorId, setItemData]);

    const suggestions = useMemo(() => {
        const u = (keys: string[]): string[] => {
            const vals = new Set<string>();
            vendorDocs.forEach(d => {
                for (const k of keys) {
                    if (d[k]) {
                        vals.add(String(d[k]));
                        break;
                    }
                }
            });
            return Array.from(vals).sort();
        };
        return {
            shape: u(['shape', 'Shape']),
            material: u(['material', 'Material']),
            color: u(['color', 'Color']),
            itemType: u(['short_description', 'shortDescription', 'item_type', 'type']),
            weightKg: u(['weight_kg', 'weightKg']),
            widthCm: u(['width_cm', 'widthCm']),
            heightCm: u(['height_cm', 'heightCm']),
            lengthCm: u(['length_cm', 'lengthCm']),
            price: u(['price_mxn', 'priceMxn', 'price']),
        };
    }, [vendorDocs]);

    const set = (key: string, val: string) =>
        setItemData(prev => ({ ...prev, [key]: val }));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setItemData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const uploaded: UploadedFile[] = [];
        for (const file of files) {
            const type = file.type.startsWith('video/') ? 'video' : 'image';
            const localUrl = await readFileAsDataURL(file, type);
            uploaded.push({ type, localUrl, originalFile: file, tag: 'Item' });
        }
        setMediaFiles(prev => [...prev, ...uploaded]);
    };

    const updateFileTag = (i: number, tag: 'Item' | 'Lot') => {
        setMediaFiles(prev => prev.map((f, idx) => idx === i ? { ...f, tag } : f));
    };

    const removeFile = (i: number) =>
        setMediaFiles(prev => prev.filter((_, idx) => idx !== i));

    const notify = (type: string, message: string) => {
        if (type === 'error') toast.error(message);
        else if (type === 'success') toast.success(message);
        else toast(message, { icon: type === 'loading' ? '⌛' : 'ℹ️' });
    };

    useEffect(() => {
        if (itemData.workbook === 'v825') {
            setItemData(prev => ({ 
                ...prev, 
                status: 'Acquisition', 
                payReq: 'paid' 
            }));
        } else if (itemData.workbook === 'v326') {
             setItemData(prev => ({ 
                ...prev, 
                status: 'Available',
                payReq: ''
            }));
        }
    }, [itemData.workbook, setItemData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setIsSaving(true);
        setSavingProgress(10);

        try {
            let uploadedUrls: string[] = [];
            let driveIds: string[] = [];

            if (mediaFiles.length > 0) {
                for (let i = 0; i < mediaFiles.length; i++) {
                    const file = mediaFiles[i];
                    const fileToUpload = file.originalFile;
                    if (fileToUpload) {
                        try {
                            const result = await handleFileUpload(fileToUpload, user);
                            if (result) {
                                const taggedUrl = `${result.thumbnailUrl}${file.tag ? `&tag=${file.tag}` : ''}`;
                                uploadedUrls.push(taggedUrl);
                                driveIds.push(result.fileId);
                                console.log('[Upload] File uploaded:', fileToUpload.name, '=>', result.fileId);
                            }
                            setSavingProgress(Math.round(10 + ((i + 1) / mediaFiles.length) * 60));
                        } catch (uploadErr: any) {
                            console.error('[Upload] Single file failed:', fileToUpload.name, uploadErr);
                            throw new Error(`Upload failed for ${fileToUpload.name}: ${uploadErr.message}`);
                        }
                    }
                }
            } else {
                setSavingProgress(70);
            }

            const finalItemId = itemData.vendorId && !itemData.itemId.startsWith(itemData.vendorId)
                ? `${itemData.vendorId}-${itemData.itemId}`
                : itemData.itemId;

            const calculated = calculateCodesAndPrices(
                { price: itemData.price, itemId: finalItemId, workbook: itemData.workbook || 'v326', itemNumber: itemData.itemNumber || '1' },
                exchangeRate,
                'v326'
            );

            let translatedShape = itemData.shape;
            let translatedMaterial = itemData.material;
            let translatedColor = itemData.color;
            let translatedDesc = itemData.description;
            let translatedType = itemData.itemType;

            try {
                if (user?.role === 'Vendor' && (itemData.shape || itemData.material || itemData.color || itemData.description || itemData.itemType)) {
                    setSavingProgress(75);
                    const promptText = `Please translate the following product attributes from Spanish (or any language) to standard English, and correct any obvious spelling errors. If already in English, simply return the autocorrected English values. Do not change the meaning. Return a JSON object with only the properties provided:
                    shape: "${itemData.shape || ''}",
                    material: "${itemData.material || ''}",
                    color: "${itemData.color || ''}",
                    description: "${itemData.description || ''}",
                    itemType: "${itemData.itemType || ''}"`;

                    const schema = {
                        type: Type.OBJECT,
                        properties: {
                            shape: { type: Type.STRING },
                            material: { type: Type.STRING },
                            color: { type: Type.STRING },
                            description: { type: Type.STRING },
                            itemType: { type: Type.STRING }
                        }
                    };

                    const aiResult = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: promptText,
                        config: { responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: { thinkingBudget: 0 } }
                    });

                    const parsed = JSON.parse(aiResult.text.trim());
                    translatedShape = parsed.shape || translatedShape;
                    translatedMaterial = parsed.material || translatedMaterial;
                    translatedColor = parsed.color || translatedColor;
                    translatedDesc = parsed.description || translatedDesc;
                    translatedType = parsed.itemType || translatedType;
                }
            } catch (aiErr) {
                console.warn('AI Translation skipped/failed:', aiErr);

            }

            const dbRow = {
                item_id: finalItemId,
                item_number: itemData.itemNumber || '1',
                shape: translatedShape,
                material: translatedMaterial,
                color: translatedColor,
                description: translatedDesc,
                short_description: translatedType,
                weight_kg: itemData.weightKg ? Number(itemData.weightKg) : null,
                width_cm: itemData.widthCm ? Number(itemData.widthCm) : null,
                height_cm: itemData.heightCm ? Number(itemData.heightCm) : null,
                length_cm: itemData.lengthCm ? Number(itemData.lengthCm) : null,
                price_mxn: itemData.price ? Number(itemData.price) : null,
                quantity: itemData.quantity ? Number(itemData.quantity) : 1,
                status: itemData.status || 'Available',
                workbook: itemData.workbook || 'v326',
                pay_req: itemData.payReq || null,
                media_urls: uploadedUrls.join(','),
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
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
                } catch (rxErr) {
                    console.error('Local db sync error:', rxErr);
                }
            }

            if (user?.email) {
                const { data: userData } = await supabase.from('app_users').select('total_submits').eq('email', user.email).single();
                if (userData) {
                    await supabase.from('app_users').update({ total_submits: (userData.total_submits || 0) + 1 }).eq('email', user.email);
                }
            }

            setSavingProgress(100);
            notify('success', '✓ Item saved! Ready for next entry.');
            
            setTimeout(() => {
                setIsSaving(false);
                setSavingProgress(0);
                setIsSubmitting(false);
            }, 800);

            const nextNum = String((parseInt(itemData.itemNumber || '0') || 0) + 1);
            setItemData(prev => ({
                itemId: generateUniqueId(),
                vendorId: prev.vendorId,
                status: prev.status,
                workbook: prev.workbook || 'v326',
                itemNumber: nextNum,
                quantity: '1',
                mediaType: 'none',
            }));
            setMediaFiles([]);
            setIsSaving(false);
            setSavingProgress(0);
        } catch (err: any) {
            notify('error', err.message);
            setIsSubmitting(false);
            setIsSaving(false);
            setSavingProgress(0);
        }
    };

    const isDev = user?.role === 'Developer';
    const priceMxn = Number(itemData.price || 0);
    const priceUsd = exchangeRate > 0 ? (priceMxn / exchangeRate).toFixed(2) : '—';
    const needsFile = itemData.mediaType && itemData.mediaType !== 'none';

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-12 w-full pb-16">

            <div className="flex flex-col lg:flex-row gap-12 items-start">
                {/* ── Entry Status (Frameless) ── */}
                <div className="flex flex-col gap-3 min-w-[240px]">
                    <label className={`${lbl} text-[10px]`}>Entry Status</label>
                    <div className="flex flex-wrap gap-2.5 items-center">
                        {(['Available', 'Production', 'Acquisition'] as EntryStatus[]).map(status => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => set('status', status)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${itemData.status === status ? 'bg-(--main-color) text-black shadow-lg scale-105' : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10'}`}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full ${itemData.status === status ? 'bg-black' : 'bg-white/20'}`} />
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Vendor Selector (Frameless) ── */}
                <div className="flex-1 w-full">
                    <label className={lbl}>Vendor Selection</label>
                    {canSelectVendor ? (
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4 items-center">
                            {Object.keys(vendors).filter(k => !['R', 'M', 'W', 'C'].includes(k)).map(id => {
                                const v = vendors[id as keyof typeof vendors];
                                const isSelected = itemData.vendorId === id;
                                return (
                                    <button
                                        type="button"
                                        key={id}
                                        onClick={() => set('vendorId', id)}
                                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm md:text-lg font-black transition-all ${isSelected ? 'ring-4 ring-white/20 scale-110 shadow-2xl border-2 border-white/40 bg-white/10' : 'opacity-40 hover:opacity-100 ring-1 ring-white/10 grayscale hover:grayscale-0'}`}
                                        style={{ backgroundColor: v.color, color: getTextColorForBg(v.color) }}
                                    >
                                        {id}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 bg-white/2 border border-white/6 rounded-xl px-4 py-2.5 w-full">
                            <svg className="w-3.5 h-3.5 text-white/20"><use href="#lock" /></svg>
                            <span className="text-sm text-white/60">{itemData.vendorId}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Number + Quantity + Media Row (Horizontal Density) ── */}
            <div className="flex flex-col xl:flex-row gap-8 items-start">
                <div className="grid grid-cols-5 gap-0 items-end min-w-[280px] bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    <div className="col-span-2">
                        <label className={lbl + " text-[10px]"}>Num</label>
                        <input type="number" min="1" name="itemNumber"
                            value={itemData.itemNumber || ''} onChange={handleChange}
                            className={inpNum + " text-center! bg-transparent border-none!"} placeholder="1" />
                    </div>
                    <div className="col-span-3 pl-4 border-l border-white/10">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-(--main-color) block mb-1.5">Qty</label>
                        <input required type="number" min="1" name="quantity"
                            value={itemData.quantity || '1'} onChange={handleChange}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-base font-black font-mono text-white focus:outline-none focus:border-(--main-color)/50 transition-all" placeholder="1" />
                    </div>
                </div>

                <div className="flex-1 w-full flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <label className={lbl}>Media Attachments</label>
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{mediaFiles.length} Files</span>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 w-full">
                        <label className="lg:w-72 h-48 flex flex-col items-center justify-center border-2 border-dashed border-(--main-color)/20 hover:border-(--main-color)/50 rounded-3xl cursor-pointer transition-all bg-(--main-color)/5 group">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-(--main-color)/30 transition-all shadow-xl">
                                    <svg className="w-6 h-6 text-white/40 group-hover:text-(--main-color) transition-all"><use href="#upload" /></svg>
                                </div>
                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30 group-hover:text-white transition-all">Attach Studio Assets</span>
                            </div>
                            <input type="file" className="sr-only" onChange={handleFileChange} accept="image/*,video/*" multiple />
                        </label>

                        {mediaFiles.length > 0 && (
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {mediaFiles.map((f, i) => (
                                    <div key={i} className="flex flex-col gap-3 p-3 bg-white/5 border border-white/10 rounded-2xl group relative shadow-2xl">
                                        <div className="aspect-[4/3] rounded-xl overflow-hidden shrink-0 border border-white/10 relative">
                                            <img src={f.localUrl || f.dataUrl} alt="" className="w-full h-full object-cover" />
                                            {f.type === 'video' && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                    <svg className="w-8 h-8 text-white/90" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between px-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate">{f.originalFile?.name}</span>
                                            <button type="button" onClick={() => removeFile(i)} className="p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                                                <svg className="w-4 h-4"><use href="#x" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── DNA & Metrics Panel (Combined Horizon) ── */}
            <div className="flex flex-col lg:grid lg:grid-cols-12 gap-12">
                <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    <p className="col-span-full text-[9px] font-black uppercase tracking-widest text-white/20 mb-[-1.5rem]">DNA Characteristics</p>
                    
                    <div>
                        <label className={lbl}>Color</label>
                        <input type="text" name="color" value={itemData.color || ''} onChange={handleChange}
                            list="color-list" placeholder="Cream" className={inp} autoComplete="off" />
                        <datalist id="color-list">{suggestions.color.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.color} current={itemData.color || ''} query={itemData.color || ''} onSelect={v => set('color', v)} />
                    </div>
                    <div>
                        <label className={lbl}>Mat</label>
                        <input type="text" name="material" value={itemData.material || ''} onChange={handleChange}
                            list="material-list" placeholder="Ceramic" className={inp} autoComplete="off" />
                        <datalist id="material-list">{suggestions.material.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.material} current={itemData.material || ''} query={itemData.material || ''} onSelect={v => set('material', v)} />
                    </div>
                    <div>
                        <label className={lbl}>Shape</label>
                        <input type="text" name="shape" value={itemData.shape || ''} onChange={handleChange}
                            list="shape-list" placeholder="Vase" className={inp} autoComplete="off" />
                        <datalist id="shape-list">{suggestions.shape.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.shape} current={itemData.shape || ''} query={itemData.shape || ''} onSelect={v => set('shape', v)} />
                    </div>
                    <div>
                        <label className={lbl}>Type</label>
                        <input type="text" name="itemType" value={itemData.itemType || ''} onChange={handleChange}
                            list="type-list" placeholder="Decorative" className={inp} autoComplete="off" />
                        <datalist id="type-list">{suggestions.itemType.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.itemType} current={itemData.itemType || ''} query={itemData.itemType || ''} onSelect={v => set('itemType', v)} />
                    </div>
                    <div className="col-span-full">
                        <label className={lbl}>Metrics (Kg / W / H / L)</label>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { name: 'weightKg', placeholder: 'kg', suggestions: suggestions.weightKg },
                                { name: 'widthCm', placeholder: 'W', suggestions: suggestions.widthCm },
                                { name: 'heightCm', placeholder: 'H', suggestions: suggestions.heightCm },
                                { name: 'lengthCm', placeholder: 'L', suggestions: suggestions.lengthCm },
                            ].map(f => (
                                <div key={f.name}>
                                    <input type="number" step="0.01" min="0" name={f.name}
                                        value={(itemData as any)[f.name] || ''}
                                        onChange={handleChange}
                                        placeholder={f.placeholder}
                                        className={inpNum} />
                                    <SuggestChips values={f.suggestions} current={(itemData as any)[f.name] || ''} query={(itemData as any)[f.name] || ''} onSelect={v => set(f.name, v)} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-8">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-[-1rem]">Registry & Notes</p>
                    
                    <div className="grid grid-cols-2 gap-4 items-start">
                        <div>
                            <label className={lbl}>Cost</label>
                            <div className="relative">
                                <span className="absolute left-4 top-2.5 text-white/25 text-sm">$</span>
                                <input required type="number" step="0.01" name="price"
                                    value={itemData.price || ''} onChange={handleChange}
                                    placeholder="0.00" className={inpNum + " pl-8"} />
                                <SuggestChips values={suggestions.price} current={itemData.price || ''} query={itemData.price || ''} onSelect={v => set('price', v)} />
                            </div>
                        </div>
                        <div className="flex flex-col justify-end pb-1 h-[42px]">
                            <span className="text-[8px] font-black text-white/15 uppercase tracking-widest leading-none mb-1">≈ USD</span>
                            <span className="text-xl font-mono font-black text-white/30 leading-none">${priceUsd}</span>
                        </div>
                    </div>

                    <div>
                        <label className={lbl}>Notes</label>
                        <textarea name="description" rows={4} value={itemData.description || ''} onChange={handleChange}
                            placeholder="Technical specs..."
                            className={inp + " resize-none h-full min-h-[120px]"} />
                    </div>
                </div>
            </div>

            {/* ── Item ID (auto) ── */}
            <div className="flex items-center gap-3">
                <div className="flex-1 text-[8px] font-mono text-white/10 truncate">{itemData.itemId}</div>
            </div>

            {/* ── Submit ── */}
            <button type="submit" disabled={isSubmitting}
                className="button w-full bg-(--main-color) border-(--main-color) text-black hover:opacity-90 disabled:opacity-50">
                {isSubmitting ? <><LoadingIndicator /> WAIT</> : '✓ SAVE'}
            </button>
            {/* ── Progress Overlay ── */}
            {isSaving && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
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
                            {savingProgress < 10 ? 'Initializing...' : savingProgress < 75 ? 'Uploading Media...' : savingProgress < 95 ? 'Updating Registry...' : 'Artifact Synced'}
                        </p>
                    </div>
                </div>
            )}
        </form>
    );
}
