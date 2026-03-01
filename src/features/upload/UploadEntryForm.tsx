import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import {
    uploadItemDataAtom, uploadMediaFilesAtom,
    userAtom, activeViewAtom, notificationsAtom, exchangeRateAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { handleFileUpload, generateUniqueId, readFileAsDataURL, calculateCodesAndPrices } from '../../lib/utils';
import { useDatabase } from '../../lib/hooks';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { UploadedFile } from '../../lib/Types';

// ── Styles ────────────────────────────────────────────────────────────────────
const lbl = "text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5";
const inp = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/15 focus:outline-none focus:border-[var(--main-color)]/50 focus:bg-white/[0.07] transition-all";
const inpNum = inp + " font-mono";

const MEDIA_TYPES = [
    { id: 'none', label: 'None', icon: 'x' },
    { id: 'single', label: 'Pic', icon: 'image' },
    { id: 'sample', label: 'Smp', icon: 'search' },
    { id: 'lot', label: 'Lot', icon: 'package' },
    { id: 'video', label: 'Vid', icon: 'video' },
];

// ── Helper: suggestion chips ──────────────────────────────────────────────────
const SuggestChips: React.FC<{
    values: string[];
    onSelect: (v: string) => void;
    current: string;
}> = ({ values, onSelect, current }) => {
    if (!values.length) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-1.5">
            {values.slice(0, 10).map(v => (
                <button key={v} type="button" onClick={() => onSelect(v)}
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all
                        ${v === current ? 'border-[var(--main-color)] text-[var(--main-color)] bg-[var(--main-color)]/10'
                            : 'border-white/10 text-white/25 hover:border-white/30 hover:text-white/60'}`}>
                    {v}
                </button>
            ))}
        </div>
    );
};

// ── Main form ─────────────────────────────────────────────────────────────────
export function UploadEntryForm() {
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const [mediaFiles, setMediaFiles] = useAtom(uploadMediaFilesAtom);
    const user = useAtomValue(userAtom);
    const setView = useSetAtom(activeViewAtom);
    const setNotifications = useSetAtom(notificationsAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [vendorDocs, setVendorDocs] = useState<any[]>([]);

    const canSelectVendor = user?.role === 'Developer' || user?.role === 'Admin';
    const defaultVendorId = canSelectVendor
        ? (Object.keys(vendors)[0] || '')
        : (user?.id || user?.email || '');

    // Init form
    useEffect(() => {
        if (!itemData.itemId) {
            setItemData({
                itemId: generateUniqueId(),
                vendorId: defaultVendorId,
                quantity: '1',
                mediaType: 'none',
                status: 'Catalog',
                workbook: 'v326',
            });
        }
    }, [defaultVendorId, itemData.itemId, setItemData]);

    // Fetch vendor-specific inventory docs for autocomplete
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

    // Build unique suggestion lists from vendor docs
    const suggestions = useMemo(() => {
        const uniq = (key: string): string[] =>
            [...new Set(vendorDocs.map(d => d[key]).filter(Boolean))].sort();
        return {
            shape: uniq('shape'),
            material: uniq('material'),
            color: uniq('color'),
            itemType: uniq('item_type'),
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
        const id = Date.now();
        setNotifications((prev: any) => [...prev, { id, type, message }]);
        if (type !== 'loading') setTimeout(() => setNotifications((prev: any) => prev.filter((n: any) => n.id !== id)), 3500);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            let uploadedUrls: string[] = [];
            let driveIds: string[] = [];

            if (mediaFiles.length > 0) {
                notify('loading', `Uploading ${mediaFiles.length} file(s) to Drive…`);
                for (const file of mediaFiles) {
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
                        } catch (uploadErr: any) {
                            console.error('[Upload] Single file failed:', fileToUpload.name, uploadErr);
                            throw new Error(`Upload failed for ${fileToUpload.name}: ${uploadErr.message}`);
                        }
                    }
                }
            }

            const finalItemId = itemData.vendorId && !itemData.itemId.startsWith(itemData.vendorId)
                ? `${itemData.vendorId}-${itemData.itemId}`
                : itemData.itemId;

            const calculated = calculateCodesAndPrices(
                { price: itemData.price, itemId: finalItemId, workbook: itemData.workbook || 'v326', itemNumber: itemData.itemNumber || '1' },
                exchangeRate,
                'v326'
            );

            const dbRow = {
                item_id: finalItemId,
                item_number: itemData.itemNumber || '1',
                shape: itemData.shape,
                material: itemData.material,
                color: itemData.color,
                description: itemData.description,
                short_description: itemData.itemType,
                weight_kg: itemData.weightKg ? Number(itemData.weightKg) : null,
                width_cm: itemData.widthCm ? Number(itemData.widthCm) : null,
                height_cm: itemData.heightCm ? Number(itemData.heightCm) : null,
                price_mxn: itemData.price ? Number(itemData.price) : null,
                quantity: itemData.quantity ? Number(itemData.quantity) : 1,
                status: itemData.status || 'Catalog',
                workbook: itemData.workbook || 'v326',
                media_urls: uploadedUrls.join(','),
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            notify('loading', 'Saving to database…');
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

            // Increment user's total_submits in the app_users table
            if (user?.email) {
                const { data: userData } = await supabase.from('app_users').select('total_submits').eq('email', user.email).single();
                if (userData) {
                    await supabase.from('app_users').update({ total_submits: (userData.total_submits || 0) + 1 }).eq('email', user.email);
                }
            }

            notify('success', '✓ Item saved to inventory!');
            setItemData({ itemId: generateUniqueId(), vendorId: itemData.vendorId, quantity: '1', mediaType: 'none', status: 'Catalog', workbook: itemData.workbook || 'v326' });
            setMediaFiles([]);
            setTimeout(() => setView('inventory'), 1200);
        } catch (err: any) {
            notify('error', `Failed: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const priceMxn = Number(itemData.price || 0);
    const priceUsd = exchangeRate > 0 ? (priceMxn / exchangeRate).toFixed(2) : '—';
    const needsFile = itemData.mediaType && itemData.mediaType !== 'none';

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full max-w-2xl mx-auto pb-8">

            {/* ── Row 1: Book & Status ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className={lbl}>Book</label>
                    <input type="text" name="workbook" value={itemData.workbook || 'v326'} onChange={handleChange} className={inpNum} placeholder="v326" />
                </div>
                <div>
                    <label className={lbl}>Stat</label>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {['Catalog', 'Production', 'Acquisitions'].map(s => (
                            <button
                                key={s} type="button"
                                onClick={() => set('status', s)}
                                className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${itemData.status === s ? 'bg-[var(--main-color)] text-black border-[var(--main-color)] shadow-md' : 'bg-white/3 border-white/10 text-white/40 hover:border-white/30 hover:text-white/80'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Row 2: Vendor + Quantity ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="flex flex-col h-full justify-start">
                    <label className={lbl}>Vend</label>
                    {canSelectVendor ? (
                        <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar items-center">
                            {Object.keys(vendors).filter(k => !['R', 'M', 'W', 'C'].includes(k)).map(id => {
                                const v = vendors[id as keyof typeof vendors];
                                const isSelected = itemData.vendorId === id;
                                return (
                                    <button
                                        type="button"
                                        key={id}
                                        onClick={() => set('vendorId', id)}
                                        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${isSelected ? 'ring-2 ring-white scale-110 shadow-lg' : 'opacity-50 hover:opacity-100 hover:scale-105 saturate-50 hover:saturate-100 ring-1 ring-white/20'}`}
                                        style={{ backgroundColor: v.color, color: '#000' }}
                                    >
                                        {id}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 bg-white/2 border border-white/6 rounded-xl px-4 py-2.5 w-fit">
                            <svg className="w-3.5 h-3.5 text-white/20"><use href="#lock" /></svg>
                            <span className="text-sm text-white/40">{itemData.vendorId}</span>
                        </div>
                    )}
                </div>
                <div>
                    <label className={lbl}>Num</label>
                    <input type="number" min="1" name="itemNumber"
                        value={itemData.itemNumber || ''} onChange={handleChange}
                        className={inpNum} placeholder="1" />
                </div>
                <div>
                    <label className={lbl}>Qty</label>
                    <input required type="number" min="1" name="quantity"
                        value={itemData.quantity || '1'} onChange={handleChange}
                        className={inpNum} placeholder="1" />
                </div>
            </div>

            {/* ── Media Upload Section ── */}
            <div className="bg-white/2 border border-white/6 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <label className={lbl}>Media Attachments</label>
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{mediaFiles.length} Files</span>
                </div>

                <div className="flex gap-3 items-center">
                    <label className="flex-1 flex items-center justify-center gap-3 border-2 border-dashed border-white/10 rounded-xl py-8 cursor-pointer hover:border-[var(--main-color)]/40 hover:bg-white/2 transition-all group">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <svg className="w-5 h-5 text-white/40 group-hover:text-[var(--main-color)]"><use href="#upload" /></svg>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/25 group-hover:text-white/60">Attach Media (Images / Video)</span>
                        </div>
                        <input type="file" className="sr-only" onChange={handleFileChange} accept="image/*,video/*" multiple />
                    </label>
                </div>

                {mediaFiles.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        {mediaFiles.map((f, i) => (
                            <div key={i} className="flex gap-4 p-3 bg-white/3 border border-white/5 rounded-xl group relative">
                                <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-white/10">
                                    {f.type === 'video' ? (
                                        <div className="w-full h-full bg-black flex items-center justify-center">
                                            <svg className="w-6 h-6 text-white/40"><use href="#video" /></svg>
                                        </div>
                                    ) : (
                                        <img src={f.localUrl || f.dataUrl} alt="" className="w-full h-full object-cover" />
                                    )}
                                </div>
                                <div className="flex flex-col justify-between grow">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-white/30 truncate max-w-[120px]">{f.originalFile?.name}</span>
                                        <button type="button" onClick={() => removeFile(i)} className="text-white/20 hover:text-red-400 transition-colors">
                                            <svg className="w-3.5 h-3.5"><use href="#x" /></svg>
                                        </button>
                                    </div>
                                    <div className="flex gap-1.5 mt-1">
                                        {['Item', 'Lot'].map((tag) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => updateFileTag(i, tag as 'Item' | 'Lot')}
                                                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all
                                                    ${f.tag === tag
                                                        ? 'bg-(--main-color) text-black border-(--main-color)'
                                                        : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'}`}
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

            {/* ── Description fields panel ── */}
            <div className="bg-white/2 border border-white/6 rounded-2xl p-5 flex flex-col gap-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Desc</p>

                {/* Color / Material row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={lbl}>Color</label>
                        <input type="text" name="color" value={itemData.color || ''} onChange={handleChange}
                            list="color-list" placeholder="Cream" className={inp} autoComplete="off" />
                        <datalist id="color-list">{suggestions.color.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.color} current={itemData.color || ''} onSelect={v => set('color', v)} />
                    </div>
                    <div>
                        <label className={lbl}>Mat</label>
                        <input type="text" name="material" value={itemData.material || ''} onChange={handleChange}
                            list="material-list" placeholder="Ceramic" className={inp} autoComplete="off" />
                        <datalist id="material-list">{suggestions.material.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.material} current={itemData.material || ''} onSelect={v => set('material', v)} />
                    </div>
                </div>

                {/* Object / Shape + Type row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={lbl}>Shape</label>
                        <input type="text" name="shape" value={itemData.shape || ''} onChange={handleChange}
                            list="shape-list" placeholder="Vase" className={inp} autoComplete="off" />
                        <datalist id="shape-list">{suggestions.shape.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.shape} current={itemData.shape || ''} onSelect={v => set('shape', v)} />
                    </div>
                    <div>
                        <label className={lbl}>Type</label>
                        <input type="text" name="itemType" value={itemData.itemType || ''} onChange={handleChange}
                            list="type-list" placeholder="e.g. Decorative, Functional" className={inp} autoComplete="off" />
                        <datalist id="type-list">{suggestions.itemType.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.itemType} current={itemData.itemType || ''} onSelect={v => set('itemType', v)} />
                    </div>
                </div>

                {/* Weight + Dims row */}
                <div>
                    <label className={lbl}>Dims</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { name: 'weightKg', placeholder: 'kg' },
                            { name: 'widthCm', placeholder: 'W' },
                            { name: 'heightCm', placeholder: 'H' },
                            { name: 'lengthCm', placeholder: 'L' },
                        ].map(f => (
                            <input key={f.name} type="number" step="0.01" min="0" name={f.name}
                                value={(itemData as any)[f.name] || ''}
                                onChange={handleChange}
                                placeholder={f.placeholder}
                                className={inpNum} />
                        ))}
                    </div>
                </div>

                {/* Description textarea */}
                <div>
                    <label className={lbl}>Notes <span className="text-white/15 normal-case tracking-normal">(opt)</span></label>
                    <textarea name="description" rows={2} value={itemData.description || ''} onChange={handleChange}
                        placeholder="..."
                        className={inp + " resize-none"} />
                </div>
            </div>

            {/* ── Price ── */}
            <div className="grid grid-cols-2 gap-4 items-start">
                <div>
                    <label className={lbl}>Cost</label>
                    <div className="relative">
                        <span className="absolute left-4 top-2.5 text-white/25 text-sm">$</span>
                        <input required type="number" step="0.01" name="price"
                            value={itemData.price || ''} onChange={handleChange}
                            placeholder="0.00" className={inpNum + " pl-8"} />
                    </div>
                </div>
                <div className="flex flex-col justify-end pb-1">
                    <span className="text-[8px] font-black text-white/15 uppercase tracking-widest">≈ USD</span>
                    <span className="text-lg font-mono font-black text-white/30">${priceUsd}</span>
                </div>
            </div>

            {/* ── Item ID (auto) ── */}
            <div className="flex items-center gap-3">
                <div className="flex-1 text-[8px] font-mono text-white/10 truncate">{itemData.itemId}</div>
            </div>

            {/* ── Submit ── */}
            <button type="submit" disabled={isSubmitting}
                className="w-full py-3.5 bg-(--main-color) text-black text-[11px] font-black tracking-widest rounded-xl shadow-[0_0_24px_rgba(141,198,63,0.25)] hover:shadow-[0_0_40px_rgba(141,198,63,0.45)] hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none">
                {isSubmitting ? <><LoadingIndicator /> WAIT</> : '✓ SAVE'}
            </button>
        </form>
    );
}
