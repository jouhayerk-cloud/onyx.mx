/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { userAtom, isUploadWizardOpenAtom, inventoryAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg, handleFileUpload } from '../../lib/utils';

// --- Types ---
type EntryStatus = 'Catalog' | 'Production' | 'Acquisition';

interface WizardState {
    status: EntryStatus;
    vendorId: string;
    itemNumber: string;
    quantity: string;
    media: File | null;
    mediaPreview: string | null;
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
    const db = useDatabase();
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = user?.role === 'Admin' || user?.role === 'Developer';

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setStep(isAdmin ? 1 : 3);
            setState({
                ...INITIAL_STATE,
                status: 'Catalog',
                vendorId: user?.role === 'Vendor' ? user.id : '',
            });
        }
    }, [isOpen, isAdmin, user]);

    // Fetch suggestions for tags
    useEffect(() => {
        if (!db || !isOpen) return;
        const fetchTags = async (col: string) => {
            try {
                const items = await db.inventory.find().exec();
                const values = Array.from(new Set(items.map((i: any) => i[col]).filter(Boolean)));
                setSuggestions(prev => ({ ...prev, [col]: values as string[] }));
            } catch (e) { console.error(e); }
        };
        ['shape', 'material', 'color', 'type'].forEach(fetchTags);
    }, [db, isOpen]);

    // Auto-fetch next item number when vendor is selected
    useEffect(() => {
        if (!db || !state.vendorId || !isOpen) return;
        const fetchNextNum = async () => {
            const items = await db.inventory.find({ selector: { itemId: state.vendorId } }).exec();
            // Simple increment for now, could be improved to find max
            let maxNum = 0;
            items.forEach((i: any) => {
                const num = parseInt(i.itemNumber);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            });
            setState(prev => ({ ...prev, itemNumber: String(maxNum + 1).padStart(4, '0') }));
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
            let mediaUrl = '';
            if (state.media) {
                const res = await handleFileUpload(state.media, user);
                if (res) mediaUrl = res.thumbnailUrl;
            }

            const payload = {
                id: crypto.randomUUID(),
                itemId: state.vendorId,
                itemNumber: state.itemNumber,
                status: state.status,
                quantity: state.quantity,
                shape: state.shape,
                material: state.material,
                color: state.color,
                category: state.type,
                weightKg: state.weightKg,
                widthCm: state.widthCm,
                heightCm: state.heightCm,
                lengthCm: state.lengthCm,
                price: state.price,
                notes: state.notes,
                mediaUrls: mediaUrl,
                createdBy: user?.name || user?.email,
                timestamp: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                workbook: '326',
            };

            await db.inventory.insert(payload);
            toast.success('Entry Uploaded Successfully!', { id: tid });
            setIsOpen(false);
        } catch (err: any) {
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
                    className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${state[field] === tag ? 'bg-(--main-color) text-black' : 'bg-white/5 text-white/40 hover:text-white/70 border border-white/5'}`}>
                    {tag.toUpperCase()}
                </button>
            ))}
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4" onClick={() => setIsOpen(false)}>
            <div className="bg-[#0b0b15] border border-white/10 rounded-[40px] w-full max-w-[640px] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-10 pt-10 flex justify-between items-start">
                    <div>
                        {renderProgress()}
                        {!isAdmin && (
                            <div className="flex items-center gap-2 mb-4 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">USER MODE: UPLOAD WIZARD</span>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setIsOpen(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">✕</button>
                </div>

                <div className="px-10 pb-12 flex flex-col min-h-[500px]">

                    {/* Step 1: Entry Status */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-white mb-2 leading-tight tracking-tighter uppercase">ENTRY<br />STATUS</h2>
                            <p className="text-[11px] text-white/30 mb-10 uppercase tracking-[0.3em] font-bold">Classify the initial destination of this item</p>

                            <div className="grid grid-cols-1 gap-4">
                                {(['Catalog', 'Production', 'Acquisition'] as EntryStatus[]).map(status => (
                                    <button key={status} onClick={() => { set('status', status); setStep(2); }}
                                        className="flex items-center justify-between p-8 rounded-[32px] bg-white/2 border border-white/5 hover:border-(--main-color)/50 hover:bg-(--main-color)/5 transition-all group">
                                        <div className="flex items-center gap-6">
                                            <div className="w-12 h-12 rounded-2xl border-2 border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <span className="text-xl">{status === 'Catalog' ? '📖' : status === 'Production' ? '🛠️' : '📦'}</span>
                                            </div>
                                            <div className="text-left">
                                                <span className="text-sm font-black text-white uppercase tracking-widest block">{status}</span>
                                                <span className="text-[9px] text-white/20 font-bold uppercase tracking-tight">
                                                    {status === 'Catalog' ? 'Standard inventory listing' : status === 'Production' ? 'Custom manufacturing line' : 'Global bulk acquisition'}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-(--main-color) opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Vendor */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-white mb-2 uppercase tracking-tighter">VENDORS</h2>
                            {renderBackButton(1)}

                            <div className="grid grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                {Object.entries(vendors).map(([id, cfg]) => (
                                    <button key={id} onClick={() => { set('vendorId', id); setStep(3); }}
                                        className="flex items-center gap-4 p-4 rounded-[28px] bg-white/2 border border-white/5 hover:bg-white/5 hover:border-white/20 transition-all text-left group">
                                        <div className="w-12 h-12 rounded-[20px] flex items-center justify-center font-black text-lg shadow-xl"
                                            style={{ backgroundColor: cfg.color, color: getTextColorForBg(cfg.color) }}>
                                            {id}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-white leading-none mb-1">{id}</p>
                                            <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">Select</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Quantity & Media */}
                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-white mb-2 uppercase tracking-tighter">QUANTITY</h2>
                            {isAdmin && renderBackButton(2)}
                            {!isAdmin && <p className="text-[11px] text-white/30 mb-8 uppercase tracking-[0.3em] font-bold">Step 1: Quantity and visual proof</p>}

                            <div className="flex flex-col gap-8">
                                <div className="space-y-4">
                                    <label className="text-[10px] opacity-40 font-black uppercase tracking-[0.3em] block ml-1">UNITS TO ADD</label>
                                    <input type="number" value={state.quantity} onChange={e => set('quantity', e.target.value)}
                                        className="w-full h-20 px-8 text-4xl font-black bg-white/5 border border-white/10 rounded-[32px] text-white focus:border-(--main-color)/50 transition-all outline-none" />
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] opacity-40 font-black uppercase tracking-[0.3em] block ml-1">MEDIA / PHOTO</label>
                                    <div className="relative group/media cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} accept="image/*" />
                                        {state.mediaPreview ? (
                                            <div className="w-full h-48 rounded-[32px] overflow-hidden border border-white/20">
                                                <img src={state.mediaPreview} alt="Preview" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/media:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                                                    <span className="text-xs font-black text-white uppercase tracking-widest">Change Image</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-48 rounded-[32px] border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-4 bg-white/2 hover:bg-white/5 transition-all">
                                                <span className="text-3xl opacity-30">📷</span>
                                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">Click to upload item photo</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button onClick={() => setStep(4)} className="w-full py-6 mt-4 bg-white/10 hover:bg-(--main-color) hover:text-black text-white rounded-[32px] text-[12px] font-black tracking-[0.3em] transition-all uppercase">
                                    CONTINUE →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Attributes */}
                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-white mb-2 uppercase tracking-tighter">DNA</h2>
                            {renderBackButton(3)}

                            <div className="flex flex-col gap-6 overflow-y-auto max-h-[450px] pr-2 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block ml-1">SHAPE</label>
                                        <input value={state.shape} onChange={e => set('shape', e.target.value)}
                                            className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="e.g. Round" />
                                        {renderTagSelector('shape', suggestions.shape || [])}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block ml-1">MATERIAL</label>
                                        <input value={state.material} onChange={e => set('material', e.target.value)}
                                            className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="e.g. Amethyst" />
                                        {renderTagSelector('material', suggestions.material || [])}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block ml-1">COLOR</label>
                                        <input value={state.color} onChange={e => set('color', e.target.value)}
                                            className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="e.g. Purple" />
                                        {renderTagSelector('color', suggestions.color || [])}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block ml-1">TYPE</label>
                                        <input value={state.type} onChange={e => set('type', e.target.value)}
                                            className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="e.g. Slice" />
                                        {renderTagSelector('type', suggestions.type || [])}
                                    </div>
                                </div>

                                <button onClick={() => setStep(5)} className="w-full py-6 mt-4 bg-white/10 hover:bg-(--main-color) hover:text-black text-white rounded-[32px] text-[12px] font-black tracking-[0.3em] transition-all uppercase">
                                    NEXT DETAILS →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Dimensions & Save */}
                    {step === 5 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-5xl font-black text-white mb-2 uppercase tracking-tighter">FINALIZE</h2>
                            {renderBackButton(4)}

                            <div className="flex flex-col gap-6">
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block">WEIGHT (KG)</label>
                                        <input type="number" value={state.weightKg} onChange={e => set('weightKg', e.target.value)}
                                            className="w-full h-12 px-3 bg-white/5 border border-white/10 rounded-2xl text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="0.0" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block">WIDTH (CM)</label>
                                        <input type="number" value={state.widthCm} onChange={e => set('widthCm', e.target.value)}
                                            className="w-full h-12 px-3 bg-white/5 border border-white/10 rounded-2xl text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="0" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block">HEIGHT (CM)</label>
                                        <input type="number" value={state.heightCm} onChange={e => set('heightCm', e.target.value)}
                                            className="w-full h-12 px-3 bg-white/5 border border-white/10 rounded-2xl text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="0" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block">DEPTH (CM)</label>
                                        <input type="number" value={state.lengthCm} onChange={e => set('lengthCm', e.target.value)}
                                            className="w-full h-12 px-3 bg-white/5 border border-white/10 rounded-2xl text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="0" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block ml-1">UNIT PRICE (MXN)</label>
                                    <input type="number" value={state.price} onChange={e => set('price', e.target.value)}
                                        className="w-full h-16 px-6 text-2xl font-mono font-black bg-white/5 border border-white/10 rounded-[28px] text-white focus:border-(--main-color)/50 outline-none" placeholder="0.00" />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] opacity-40 font-black uppercase tracking-widest block ml-1">NOTES</label>
                                    <textarea value={state.notes} onChange={e => set('notes', e.target.value)}
                                        className="w-full h-24 px-6 py-4 bg-white/5 border border-white/10 rounded-[28px] text-white text-xs outline-none focus:border-(--main-color)/50" placeholder="Internal notes, deploy details..." />
                                </div>

                                <button onClick={handleSave} disabled={saving}
                                    className="w-full py-8 mt-2 bg-(--main-color) text-black rounded-[32px] text-[14px] font-black tracking-[0.4em] transition-all uppercase hover:scale-[1.02] active:scale-[0.98] shadow-2xl disabled:opacity-50">
                                    {saving ? 'PROCESSING...' : 'SAVE TO SYSTEM ✨'}
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
