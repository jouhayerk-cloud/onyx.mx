import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import {
    uploadItemDataAtom, uploadMediaFilesAtom,
    userAtom, activeViewAtom, notificationsAtom, exchangeRateAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { handleFileUpload, generateUniqueId, readFileAsDataURL } from '../../lib/utils';
import { useDatabase } from '../../lib/hooks';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { UploadedFile } from '../../lib/Types';

// ── Styles ────────────────────────────────────────────────────────────────────
const lbl = "text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5";
const inp = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/15 focus:outline-none focus:border-[var(--main-color)]/50 focus:bg-white/[0.07] transition-all";
const inpNum = inp + " font-mono";

const MEDIA_TYPES = [
    { id: 'none', label: 'No Media', emoji: '—' },
    { id: 'single', label: 'Single Image', emoji: '🖼' },
    { id: 'sample', label: 'Sample', emoji: '🔍' },
    { id: 'lot', label: 'Lot Photo', emoji: '📦' },
    { id: 'video', label: 'Video', emoji: '🎥' },
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
                status: 'YES',
            });
        }
    }, []);

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
            }, 300);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db, itemData.vendorId]);

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
            const dataUrl = await readFileAsDataURL(file, type);
            uploaded.push({ type, dataUrl, localUrl: dataUrl, originalFile: file });
        }
        setMediaFiles(prev => [...prev, ...uploaded]);
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

            if (mediaFiles.length > 0 && itemData.mediaType !== 'none') {
                notify('loading', `Uploading ${mediaFiles.length} file(s)…`);
                for (const file of mediaFiles) {
                    if (file.originalFile) {
                        const result = await handleFileUpload(file.originalFile, user);
                        if (result) {
                            uploadedUrls.push(result.thumbnailUrl);
                            driveIds.push(result.fileId);
                        }
                    }
                }
            }

            const dbRow = {
                item_id: itemData.itemId,
                shape: itemData.shape,
                material: itemData.material,
                color: itemData.color,
                item_type: itemData.itemType,
                description: itemData.description,
                weight_kg: itemData.weightKg ? Number(itemData.weightKg) : null,
                width_cm: itemData.widthCm ? Number(itemData.widthCm) : null,
                height_cm: itemData.heightCm ? Number(itemData.heightCm) : null,
                length_cm: itemData.lengthCm ? Number(itemData.lengthCm) : null,
                price_mxn: itemData.price ? Number(itemData.price) : null,
                quantity: itemData.quantity ? Number(itemData.quantity) : 1,
                media_type: itemData.mediaType,
                vendor_id: itemData.vendorId,
                status: 'YES',
                image_urls: uploadedUrls,
                drive_ids: driveIds,
                created_at: new Date().toISOString(),
            };

            notify('loading', 'Saving to database…');
            const { error } = await supabase.from('inventory').upsert(dbRow, { onConflict: 'item_id' });
            if (error) throw error;

            notify('success', '✓ Item saved to inventory!');
            setItemData({ itemId: generateUniqueId(), vendorId: itemData.vendorId, quantity: '1', mediaType: 'none', status: 'YES' });
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

            {/* ── Row 1: Vendor + Quantity ── */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={lbl}>Vendor</label>
                    {canSelectVendor ? (
                        <select name="vendorId" value={itemData.vendorId || ''} onChange={handleChange} className={inp}>
                            {Object.keys(vendors).map(id => (
                                <option key={id} value={id}>{id}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-2.5">
                            <svg className="w-3.5 h-3.5 text-white/20"><use href="#lock" /></svg>
                            <span className="text-sm text-white/40">{itemData.vendorId}</span>
                        </div>
                    )}
                </div>
                <div>
                    <label className={lbl}>Quantity *</label>
                    <input required type="number" min="1" name="quantity"
                        value={itemData.quantity || '1'} onChange={handleChange}
                        className={inpNum} placeholder="1" />
                </div>
            </div>

            {/* ── Media type picker ── */}
            <div>
                <label className={lbl}>Media <span className="text-white/20 normal-case tracking-normal">(optional)</span></label>
                <div className="flex gap-2 flex-wrap">
                    {MEDIA_TYPES.map(m => (
                        <button key={m.id} type="button"
                            onClick={() => { set('mediaType', m.id); if (m.id === 'none') setMediaFiles([]); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all
                                ${itemData.mediaType === m.id
                                    ? 'bg-[var(--main-color)]/15 border-[var(--main-color)]/60 text-[var(--main-color)]'
                                    : 'bg-white/[0.03] border-white/[0.08] text-white/30 hover:text-white/60 hover:border-white/20'}`}>
                            <span>{m.emoji}</span>{m.label}
                        </button>
                    ))}
                </div>

                {/* File input — only when media type is not 'none' */}
                {needsFile && (
                    <div className="mt-3">
                        <label className="flex items-center gap-3 border border-dashed border-white/[0.12] rounded-xl px-4 py-3 cursor-pointer hover:border-white/25 hover:bg-white/[0.02] transition-all">
                            <svg className="w-5 h-5 text-white/20 shrink-0"><use href="#upload" /></svg>
                            <span className="text-xs text-white/30">
                                {itemData.mediaType === 'video' ? 'Upload video' : 'Upload image(s)'}
                                {mediaFiles.length > 0 && <span className="ml-2 text-[var(--main-color)] font-black">{mediaFiles.length} file{mediaFiles.length > 1 ? 's' : ''} selected</span>}
                            </span>
                            <input type="file" className="sr-only" onChange={handleFileChange}
                                accept={itemData.mediaType === 'video' ? 'video/*' : 'image/*'}
                                multiple={itemData.mediaType !== 'single' && itemData.mediaType !== 'video'} />
                        </label>
                        {mediaFiles.length > 0 && (
                            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                {mediaFiles.map((f, i) => (
                                    <div key={i} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-white/10 group">
                                        <img src={f.localUrl || f.dataUrl} alt="" className="w-full h-full object-cover" />
                                        <button type="button" onClick={() => removeFile(i)}
                                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-lg transition-opacity">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Description fields panel ── */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Item Description</p>

                {/* Color / Material row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={lbl}>Color</label>
                        <input type="text" name="color" value={itemData.color || ''} onChange={handleChange}
                            list="color-list" placeholder="e.g. Cream White" className={inp} autoComplete="off" />
                        <datalist id="color-list">{suggestions.color.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.color} current={itemData.color || ''} onSelect={v => set('color', v)} />
                    </div>
                    <div>
                        <label className={lbl}>Material</label>
                        <input type="text" name="material" value={itemData.material || ''} onChange={handleChange}
                            list="material-list" placeholder="e.g. Glazed Ceramic" className={inp} autoComplete="off" />
                        <datalist id="material-list">{suggestions.material.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.material} current={itemData.material || ''} onSelect={v => set('material', v)} />
                    </div>
                </div>

                {/* Object / Shape + Type row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={lbl}>Object / Shape</label>
                        <input type="text" name="shape" value={itemData.shape || ''} onChange={handleChange}
                            list="shape-list" placeholder="e.g. Vase, Bowl, Platter" className={inp} autoComplete="off" />
                        <datalist id="shape-list">{suggestions.shape.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.shape} current={itemData.shape || ''} onSelect={v => set('shape', v)} />
                    </div>
                    <div>
                        <label className={lbl}>Type / Style</label>
                        <input type="text" name="itemType" value={itemData.itemType || ''} onChange={handleChange}
                            list="type-list" placeholder="e.g. Decorative, Functional" className={inp} autoComplete="off" />
                        <datalist id="type-list">{suggestions.itemType.map(v => <option key={v} value={v} />)}</datalist>
                        <SuggestChips values={suggestions.itemType} current={itemData.itemType || ''} onSelect={v => set('itemType', v)} />
                    </div>
                </div>

                {/* Weight + Dims row */}
                <div>
                    <label className={lbl}>Weight & Dimensions</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { name: 'weightKg', placeholder: 'kg' },
                            { name: 'widthCm', placeholder: 'W cm' },
                            { name: 'heightCm', placeholder: 'H cm' },
                            { name: 'lengthCm', placeholder: 'L cm' },
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
                    <label className={lbl}>Description <span className="text-white/15 normal-case tracking-normal">(optional)</span></label>
                    <textarea name="description" rows={2} value={itemData.description || ''} onChange={handleChange}
                        placeholder="Additional notes, condition, origin…"
                        className={inp + " resize-none"} />
                </div>
            </div>

            {/* ── Price ── */}
            <div className="grid grid-cols-2 gap-4 items-start">
                <div>
                    <label className={lbl}>Cost (MXN) *</label>
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
                className="w-full py-3.5 bg-[#8DC63F] text-black text-[11px] font-black tracking-widest rounded-xl shadow-[0_0_24px_rgba(141,198,63,0.25)] hover:shadow-[0_0_40px_rgba(141,198,63,0.45)] hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none">
                {isSubmitting ? <><LoadingIndicator /> SAVING…</> : '✓ SAVE TO INVENTORY'}
            </button>
        </form>
    );
}
