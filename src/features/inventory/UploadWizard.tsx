/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { userAtom, isUploadWizardOpenAtom, inventoryAtom, exchangeRateAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg, handleFileUpload, formatCurrency } from '../../lib/utils';

// --- Types ---
type EntryStatus = 'Catalog' | 'Production' | 'Acquisition';
type MediaType = 'Product' | 'Lot';

interface WizardState {
    status: EntryStatus;
    vendorId: string;
    itemNumber: string;
    quantity: string;
    media: File | null;
    mediaPreview: string | null;
    mediaType: MediaType;
    shape: string;
    material: string;
    color: string;
    type: string;
    weightKg: string;
    widthCm: string;
    heightCm: string;
    lengthCm: string;
    price: string;
    notes: string;
}

const INITIAL_STATE: WizardState = {
    status: 'Catalog',
    vendorId: '',
    itemNumber: '',
    quantity: '1',
    media: null,
    mediaPreview: null,
    mediaType: 'Product',
    shape: '',
    material: '',
    color: '',
    type: '',
    weightKg: '',
    widthCm: '',
    heightCm: '',
    lengthCm: '',
    price: '',
    notes: '',
};

export const UploadWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isUploadWizardOpenAtom);
    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isOpenRef = useRef(isOpen);

    const isAdmin = user?.role === 'Admin' || user?.role === 'Developer';

    // Reset state ONLY when opening (transition from closed to open)
    useEffect(() => {
        if (isOpen && !isOpenRef.current) {
            setStep(isAdmin ? 1 : 3);
            setState({
                ...INITIAL_STATE,
                status: 'Catalog',
                vendorId: user?.role === 'Vendor' ? user.id : '',
            });
        }
        isOpenRef.current = isOpen;
    }, [isOpen, isAdmin, user]);

    // Fetch suggestions for tags
    useEffect(() => {
        if (!db || !isOpen) return;
        const fetchTags = async () => {
            try {
                const items = await db.inventory.find().exec();
                const u = (cols: string[]) => Array.from(new Set(items.map((i: any) => {
                    for (const c of cols) if (i[c]) return String(i[c]);
                    return null;
                }).filter(Boolean))).sort().slice(0, 15);

                setSuggestions({
                    shape: u(['shape']),
                    material: u(['material']),
                    color: u(['color']),
                    type: u(['short_description', 'shortDescription', 'item_type', 'type']),
                    weightKg: u(['weight_kg', 'weightKg']),
                    widthCm: u(['width_cm', 'widthCm']),
                    heightCm: u(['height_cm', 'heightCm']),
                    lengthCm: u(['length_cm', 'lengthCm']),
                    price: u(['price_mxn', 'priceMxn', 'price'])
                } as any);
            } catch (e) { console.error(e); }
        };
        fetchTags();
    }, [db, isOpen]);

    // Auto-fetch next item number when vendor is selected
    useEffect(() => {
        if (!db || !state.vendorId || !isOpen) return;
        const fetchNextNum = async () => {
            const items = await db.inventory.find({ selector: { item_id: { $regex: `^${state.vendorId}-` } } }).exec();
            let maxNum = 0;
            items.forEach((i: any) => {
                const num = parseInt(i.item_number);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            });
            setState(prev => ({ ...prev, itemNumber: String(maxNum + 1) }));
        };
        fetchNextNum();
    }, [db, state.vendorId, isOpen]);

    const set = (k: keyof WizardState, v: any) => setState(prev => ({ ...prev, [k]: v }));

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            set('media', file);
            set('mediaPreview', URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        if (!state.vendorId || !state.itemNumber) return toast.error('Missing Vendor or Item Number');
        setSaving(true);
        const tid = toast.loading('Uploading Entry...');
        try {
            let uploadedUrl = '';
            if (state.media) {
                const res = await handleFileUpload(state.media, user);
                if (res) {
                    uploadedUrl = `${res.thumbnailUrl}${state.mediaType ? `&tag=${state.mediaType}` : ''}`;
                }
            }

            const finalItemId = `${state.vendorId}-${crypto.randomUUID().split('-')[0].toUpperCase()}`;

            const payload = {
                id: crypto.randomUUID(),
                item_id: finalItemId,
                item_number: state.itemNumber,
                status: state.status,
                quantity: parseInt(state.quantity) || 1,
                shape: state.shape,
                material: state.material,
                color: state.color,
                short_description: state.type,
                weight_kg: parseFloat(state.weightKg) || null,
                width_cm: parseFloat(state.widthCm) || null,
                height_cm: parseFloat(state.heightCm) || null,
                length_cm: parseFloat(state.lengthCm) || null,
                price_mxn: parseFloat(state.price) || null,
                description: state.notes,
                media_urls: uploadedUrl,
                created_by: user?.name || user?.email,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                workbook: 'v326',
            };

            await supabase.from('inventory').insert(payload);
            if (db) await db.inventory.insert(payload);

            toast.success('✓ Item saved to system!', { id: tid });
            setIsOpen(false);
        } catch (err: any) {
            console.error('Wizard save error:', err);
            toast.error(err.message || 'Upload Failed', { id: tid });
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const renderProgress = () => (
        <div className="flex gap-2 mb-8">
            {[1, 2, 3, 4, 5].map(s => (
                <div key={s} className={`h-1 rounded-full transition-all duration-500 ${step >= s ? 'w-8 bg-(--main-color)' : 'w-4 bg-white/10'}`} />
            ))}
        </div>
    );

    const renderBackButton = (prevStep: number) => (
        <button onClick={() => setStep(prevStep)} className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.2em] mb-8 flex items-center gap-3 group transition-all">
            <span className="group-hover:-translate-x-1 transition-transform">←</span> BACK
        </button>
    );

    const renderTagSelector = (field: keyof WizardState, fieldSuggestions: string[]) => (
        <div className="flex flex-wrap gap-2 mt-3">
            {fieldSuggestions.slice(0, 12).map(tag => (
                <button key={tag} onClick={() => set(field, tag)}
                    className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${state[field] === tag ? 'bg-(--main-color) text-black shadow-sm' : 'bg-(--glass-bg) text-(--text-color-secondary) hover:text-(--text-color) border border-(--border-color)'}`}>
                    {tag.toUpperCase()}
                </button>
            ))}
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/80 backdrop-blur-xl p-4" onClick={() => setIsOpen(false)}>
            <div className="bg-(--bg-color) border border-(--border-color) rounded-[40px] w-full max-w-[640px] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-10 pt-10 flex justify-between items-start">
                    <div>
                        {renderProgress()}
                        {!isAdmin && (
                            <div className="flex items-center gap-2 mb-4 bg-(--glass-bg) px-3 py-1.5 rounded-full border border-(--border-color)">
                                <span className="w-2 h-2 rounded-full bg-(--main-color) animate-pulse shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">USER MODE: UPLOAD WIZARD</span>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setIsOpen(false)} className="w-10 h-10 rounded-full bg-(--glass-bg) border border-(--border-color) flex items-center justify-center text-(--text-color-secondary) hover:text-(--text-color) transition-all">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="px-10 pb-12 flex flex-col min-h-[500px]">

                    {/* Step 1: Entry Status */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-(--text-color) mb-2 leading-tight tracking-tighter uppercase">ENTRY<br />STATUS</h2>
                            <p className="text-[11px] text-(--text-color-secondary) opacity-70 mb-10 uppercase tracking-[0.3em] font-bold">Initial destination classification</p>

                            <div className="grid grid-cols-1 gap-4">
                                {(['Catalog', 'Production', 'Acquisition'] as EntryStatus[]).map(status => (
                                    <button key={status} onClick={() => { set('status', status); setStep(2); }}
                                        className="flex items-center justify-between p-7 rounded-[32px] bg-(--glass-bg) border border-(--border-color) hover:border-(--main-color)/50 hover:bg-(--main-color)/10 transition-all group">
                                        <div className="flex items-center gap-6">
                                            <div className="w-12 h-12 rounded-2xl border-2 border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform bg-(--glass-bg)">
                                                {status === 'Catalog' ? (
                                                    <svg className="w-6 h-6 text-(--text-color-secondary) group-hover:text-(--main-color)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                                                ) : status === 'Production' ? (
                                                    <svg className="w-6 h-6 text-(--text-color-secondary) group-hover:text-(--main-color)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                                                ) : (
                                                    <svg className="w-6 h-6 text-(--text-color-secondary) group-hover:text-(--main-color)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                                )}
                                            </div>
                                            <div className="text-left">
                                                <span className="text-sm font-black text-(--text-color) uppercase tracking-widest block">{status}</span>
                                                <span className="text-[9px] text-(--text-color-secondary) font-bold uppercase tracking-tight">
                                                    {status === 'Catalog' ? 'Standard inventory listing' : status === 'Production' ? 'Custom manufacturing line' : 'Global bulk acquisition'}
                                                </span>
                                            </div>
                                        </div>
                                        <svg className="w-4 h-4 text-(--main-color) opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Vendor */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-(--text-color) mb-2 uppercase tracking-tighter">VENDORS</h2>
                            {renderBackButton(1)}

                            <div className="flex overflow-x-auto gap-4 py-8 px-2 custom-scrollbar no-scrollbar scroll-smooth">
                                {Object.entries(vendors)
                                    .filter(([id]) => !['R', 'M', 'W', 'C'].includes(id))
                                    .map(([id, cfg]) => (
                                        <button key={id} onClick={() => { set('vendorId', id); setStep(3); }}
                                            className="flex-shrink-0 flex flex-col items-center gap-4 group">
                                            <div className="w-20 h-20 rounded-[32px] flex items-center justify-center font-black text-xl shadow-xl border-4 border-black/10 dark:border-white/10 group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-300 group-active:scale-95"
                                                style={{ backgroundColor: cfg.color, color: getTextColorForBg(cfg.color) }}>
                                                {id}
                                            </div>
                                            <span className="text-[10px] font-black text-(--text-color-secondary) uppercase tracking-widest group-hover:text-(--text-color) transition-colors">{id}</span>
                                        </button>
                                    ))}
                            </div>
                            <p className="text-center text-[9px] text-(--text-color-secondary) opacity-70 font-bold uppercase tracking-[0.4em] mt-8">Scroll horizontally to browse vendors</p>
                        </div>
                    )}

                    {/* Step 3: Quantity & Media */}
                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-(--text-color) mb-2 uppercase tracking-tighter">QUANTITY</h2>
                            {isAdmin && renderBackButton(2)}
                            {!isAdmin && <p className="text-[11px] text-(--text-color-secondary) opacity-70 mb-8 uppercase tracking-[0.3em] font-bold">Step 1: Units and visual evidence</p>}

                            <div className="flex flex-col gap-6">
                                <div className="space-y-4">
                                    <label className="text-[10px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-[0.3em] block ml-1">UNITS TO ADD</label>
                                    <input type="number" value={state.quantity} onChange={e => set('quantity', e.target.value)}
                                        className="w-full h-20 px-8 text-4xl font-black bg-(--glass-bg) border border-(--border-color) rounded-[32px] text-(--text-color) focus:border-(--main-color)/50 transition-all outline-none" />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-end ml-1">
                                        <label className="text-[10px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-[0.3em]">MEDIA TYPE</label>
                                        <div className="flex gap-2">
                                            {(['Product', 'Lot'] as MediaType[]).map(t => (
                                                <button key={t} onClick={() => set('mediaType', t)}
                                                    className={`px-3 py-1 rounded-lg text-[9px] font-black tracking-widest transition-all ${state.mediaType === t ? 'bg-(--main-color) text-black shadow-md' : 'bg-(--glass-bg) text-(--text-color-secondary) border border-(--border-color) hover:text-(--text-color)'}`}>
                                                    {t.toUpperCase()}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="relative group/media cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} accept="image/*" />
                                        {state.mediaPreview ? (
                                            <div className="w-full h-40 rounded-[32px] overflow-hidden border border-(--border-color) group-hover:border-(--main-color)/50 transition-all shadow-2xl">
                                                <img src={state.mediaPreview} alt="Preview" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/media:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                                                    <span className="text-xs font-black text-white uppercase tracking-widest">Change Image</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-40 rounded-[32px] border-2 border-dashed border-(--border-color) flex flex-col items-center justify-center gap-4 bg-(--glass-bg) hover:bg-black/5 dark:hover:bg-white/5 hover:border-(--main-color)/30 transition-all group">
                                                <svg className="w-8 h-8 text-(--text-color-secondary) group-hover:text-(--main-color) transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-[0.3em]">Click to upload photo</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button onClick={() => setStep(4)} className="w-full py-6 mt-4 bg-black/5 dark:bg-white/10 hover:bg-(--main-color) hover:text-black text-(--text-color) border border-(--border-color) hover:border-(--main-color) rounded-[32px] text-[12px] font-black tracking-[0.3em] transition-all uppercase shadow-xl hover:translate-y-[-2px] active:translate-y-0">
                                    CONTINUE →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Attributes */}
                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-(--text-color) mb-2 uppercase tracking-tighter">DNA</h2>
                            {renderBackButton(3)}

                            <div className="flex flex-col gap-6 overflow-y-auto max-h-[450px] pr-2 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block ml-1">SHAPE</label>
                                        <input value={state.shape} onChange={e => set('shape', e.target.value)}
                                            className="w-full h-12 px-4 bg-(--glass-bg) border border-(--border-color) rounded-2xl text-(--text-color) text-xs outline-none focus:border-(--main-color)/50" placeholder="e.g. Round" />
                                        {renderTagSelector('shape', suggestions.shape || [])}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block ml-1">MATERIAL</label>
                                        <input value={state.material} onChange={e => set('material', e.target.value)}
                                            className="w-full h-12 px-4 bg-(--glass-bg) border border-(--border-color) rounded-2xl text-(--text-color) text-xs outline-none focus:border-(--main-color)/50" placeholder="e.g. Amethyst" />
                                        {renderTagSelector('material', suggestions.material || [])}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block ml-1">COLOR</label>
                                        <input value={state.color} onChange={e => set('color', e.target.value)}
                                            className="w-full h-12 px-4 bg-(--glass-bg) border border-(--border-color) rounded-2xl text-(--text-color) text-xs outline-none focus:border-(--main-color)/50" placeholder="e.g. Purple" />
                                        {renderTagSelector('color', suggestions.color || [])}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block ml-1">TYPE</label>
                                        <input value={state.type} onChange={e => set('type', e.target.value)}
                                            className="w-full h-12 px-4 bg-(--glass-bg) border border-(--border-color) rounded-2xl text-(--text-color) text-xs outline-none focus:border-(--main-color)/50" placeholder="e.g. Slice" />
                                        {renderTagSelector('type', suggestions.type || [])}
                                    </div>
                                </div>

                                <button onClick={() => setStep(5)} className="w-full py-6 mt-4 bg-black/5 dark:bg-white/10 border border-(--border-color) hover:border-(--main-color) hover:bg-(--main-color) hover:text-black text-(--text-color) rounded-[32px] text-[12px] font-black tracking-[0.3em] transition-all uppercase shadow-xl hover:translate-y-[-2px]">
                                    EXTENDED SPECS →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Dimensions & Save */}
                    {step === 5 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-(--text-color) mb-2 uppercase tracking-tighter">FINALIZE</h2>
                            {renderBackButton(4)}

                            <div className="flex flex-col gap-5 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block">KG</label>
                                        <input type="number" value={state.weightKg} onChange={e => set('weightKg', e.target.value)}
                                            className="w-full h-12 px-3 bg-(--glass-bg) border border-(--border-color) rounded-xl text-(--text-color) text-xs outline-none focus:border-(--main-color)/50" placeholder="0.0" />
                                        {renderTagSelector('weightKg', suggestions.weightKg || [])}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block">W (CM)</label>
                                        <input type="number" value={state.widthCm} onChange={e => set('widthCm', e.target.value)}
                                            className="w-full h-12 px-3 bg-(--glass-bg) border border-(--border-color) rounded-xl text-(--text-color) text-xs outline-none focus:border-(--main-color)/50" placeholder="0" />
                                        {renderTagSelector('widthCm', suggestions.widthCm || [])}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block">H (CM)</label>
                                        <input type="number" value={state.heightCm} onChange={e => set('heightCm', e.target.value)}
                                            className="w-full h-12 px-3 bg-(--glass-bg) border border-(--border-color) rounded-xl text-(--text-color) text-xs outline-none focus:border-(--main-color)/50" placeholder="0" />
                                        {renderTagSelector('heightCm', suggestions.heightCm || [])}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block">D (CM)</label>
                                        <input type="number" value={state.lengthCm} onChange={e => set('lengthCm', e.target.value)}
                                            className="w-full h-12 px-3 bg-(--glass-bg) border border-(--border-color) rounded-xl text-(--text-color) text-xs outline-none focus:border-(--main-color)/50" placeholder="0" />
                                        {renderTagSelector('lengthCm', suggestions.lengthCm || [])}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-end ml-1">
                                        <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block">UNIT PRICE (MXN)</label>
                                        {state.price && exchangeRate && (
                                            <span className="text-[10px] font-black text-(--main-color) uppercase tracking-widest">
                                                ≈ {formatCurrency(parseFloat(state.price) / exchangeRate, 'USD')} USD
                                            </span>
                                        )}
                                    </div>
                                    <input type="number" value={state.price} onChange={e => set('price', e.target.value)}
                                        className="w-full h-16 px-6 text-2xl font-mono font-black bg-(--glass-bg) border border-(--border-color) rounded-[28px] text-(--text-color) focus:border-(--main-color)/50 outline-none" placeholder="0.00" />
                                    {renderTagSelector('price', suggestions.price || [])}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-widest block ml-1">FINAL NOTES</label>
                                    <textarea value={state.notes} onChange={e => set('notes', e.target.value)}
                                        className="w-full h-20 px-6 py-4 bg-(--glass-bg) border border-(--border-color) rounded-[24px] text-(--text-color) text-[11px] outline-none focus:border-(--main-color)/50 resize-none" placeholder="Special requirements, lot details..." />
                                </div>

                                <button onClick={handleSave} disabled={saving}
                                    className="w-full py-7 mt-2 bg-(--main-color) text-black rounded-[32px] text-[14px] font-black tracking-[0.4em] transition-all uppercase hover:scale-[1.02] active:scale-[0.98] shadow-[0_20px_40px_rgba(0,0,0,0.4)] disabled:opacity-50 flex items-center justify-center gap-4">
                                    {saving ? (
                                        <div className="w-6 h-6 border-4 border-black/20 border-t-black rounded-full animate-spin" />
                                    ) : (
                                        <>SAVE TO SYSTEM <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg></>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
