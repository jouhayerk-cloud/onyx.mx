
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { userAtom, isUploadWizardOpenAtom, inventoryAtom, exchangeRateAtom, isDummyModeAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg, handleFileUpload, formatCurrency, readFileAsDataURL, isVideoFile } from '../../lib/utils';
import { CloudUpload, Check, Trash2, Video, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { UploadedFile } from '../../lib/Types';

type EntryStatus = 'Available' | 'Production' | 'Acquisition';
type MediaType = 'Product' | 'Lot';

interface WizardMedia {
    file: File | null;
    preview: string | null;
    type: 'image' | 'video';
}

interface WizardState {
    status: EntryStatus;
    vendorId: string;
    itemNumber: string;
    quantity: string;
    mediaList: WizardMedia[];
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
    existingCount: number;
}

const INITIAL_STATE: WizardState = {
    status: 'Available',
    vendorId: '',
    itemNumber: '',
    quantity: '1',
    mediaList: [],
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
    existingCount: 0,
};

export const UploadWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isUploadWizardOpenAtom);
    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [savingProgress, setSavingProgress] = useState(0);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isOpenRef = useRef(isOpen);

    const isAdmin = user?.role === 'Admin' || user?.role === 'Developer';

    useEffect(() => {
        if (isOpen && !isOpenRef.current) {
            setStep(isAdmin ? 1 : 3);
            setState({
                ...INITIAL_STATE,
                status: 'Available',
                vendorId: user?.role === 'Vendor' ? (user.name || '') : '',
            });
        }
        isOpenRef.current = isOpen;
    }, [isOpen, isAdmin, user]);

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

    useEffect(() => {
        if (!db || !state.vendorId || !isOpen) return;
        const fetchNextNum = async () => {
            const items = await db.inventory.find({ selector: { item_id: { $regex: `^${state.vendorId}-` } } }).exec();
            let maxNum = 0;
            let existingCount = 0;
            items.forEach((i: any) => {
                const num = parseInt(i.item_number);
                if (!isNaN(num) && num > maxNum) maxNum = num;
                existingCount += parseInt(i.quantity) || 1;
            });
            setState(prev => ({ ...prev, itemNumber: String(maxNum + 1), existingCount }));
        };
        fetchNextNum();
    }, [db, state.vendorId, isOpen]);

    const set = (k: keyof WizardState, v: any) => setState(prev => ({ ...prev, [k]: v }));

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        
        const newMedia: WizardMedia[] = [];
        for (const file of files) {
            const type = file.type.startsWith('video/') ? 'video' : 'image';
            const preview = await readFileAsDataURL(file, type);
            newMedia.push({ file, preview, type });
        }
        setState(prev => ({ 
            ...prev, 
            mediaList: [...prev.mediaList, ...newMedia] 
        }));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeMedia = (idx: number) => {
        setState(prev => ({
            ...prev,
            mediaList: prev.mediaList.filter((_, i) => i !== idx)
        }));
    };

    const doSave = async (): Promise<boolean> => {
        if (!state.vendorId || !state.itemNumber) { toast.error('Missing Vendor or Item Number'); return false; }
        setSaving(true);
        setSavingProgress(10);
        
        try {
            if (isDummyMode) {
                for (let i = 20; i <= 100; i += 20) {
                    await new Promise(r => setTimeout(r, 300));
                    setSavingProgress(i);
                }
                toast.success('✓ Item saved! (Demo Mode)', { icon: '🧪' });
                return true;
            }

            let uploadedUrls: string[] = [];
            if (state.mediaList.length > 0) {
                for (let i = 0; i < state.mediaList.length; i++) {
                    const m = state.mediaList[i];
                    if (m.file) {
                        const res = await handleFileUpload(m.file, user);
                        if (res) {
                            const taggedUrl = `${res.thumbnailUrl}${state.mediaType ? `&tag=${state.mediaType}` : ''}`;
                            uploadedUrls.push(taggedUrl);
                        }
                    }
                    setSavingProgress(Math.round(10 + ((i + 1) / state.mediaList.length) * 70));
                }
            } else {
                setSavingProgress(80);
            }

            const finalItemId = `${state.vendorId}-${crypto.randomUUID().split('-')[0].toUpperCase()}`;
            const payload = {
                id: crypto.randomUUID(),
                item_id: finalItemId,
                vendor_id: state.vendorId, // CRITICAL: Explicitly add vendor_id
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
                media_urls: uploadedUrls.join(','),
                created_by: user?.name || user?.email,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                workbook: 'v326',
            };

            setSavingProgress(90);
            await supabase.from('inventory').insert(payload);
            if (db) await db.inventory.insert(payload);
            setSavingProgress(100);
            toast.success('✓ Item saved!');
            return true;
        } catch (err: any) {
            console.error('Wizard save error:', err);
            toast.error(err.message || 'Upload Failed');
            return false;
        } finally {
            setTimeout(() => {
                setSaving(false);
                setSavingProgress(0);
            }, 800);
        }
    };

    const handleSaveExit = async () => {
        const ok = await doSave();
        if (ok) setIsOpen(false);
    };

    const handleSaveNext = async () => {
        const currentVendorId = state.vendorId;
        const currentStatus = state.status;
        const currentItemNumber = parseInt(state.itemNumber || '1');
        const ok = await doSave();
        if (!ok) return;
        // Reset to fresh item, same vendor, bumped number, back to Step 3
        setState({
            ...INITIAL_STATE,
            status: currentStatus,
            vendorId: currentVendorId,
            itemNumber: String(currentItemNumber + 1),
            existingCount: state.existingCount + (parseInt(state.quantity) || 1),
        });
        setStep(3);
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

    const renderTagSelector = (field: keyof WizardState, fieldSuggestions: string[]) => {
        const query = (state[field] as string || '').toLowerCase();
        const filtered = fieldSuggestions.filter(tag => tag.toLowerCase().includes(query)).slice(0, 12);
        if (filtered.length === 0) return null;
        return (
            <div className="flex flex-wrap gap-2 mt-3 animate-in fade-in duration-200">
                {filtered.map(tag => (
                    <button key={tag} onClick={() => set(field, tag)}
                        className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${state[field] === tag ? 'bg-(--main-color) text-black shadow-sm' : 'bg-(--glass-bg) text-(--text-color-secondary) hover:text-(--text-color) border border-(--border-color)'}`}>
                        {tag.toUpperCase()}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4" onClick={() => setIsOpen(false)}>
            <div className="bg-(--c1) border border-(--border-color) rounded-[40px] w-full max-w-[640px] max-h-[90dvh] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-8 pt-8 pb-4 flex justify-between items-start shrink-0">
                    <div>
                        {renderProgress()}
                        {!isAdmin && (
                            <div className="flex items-center gap-2 mb-4 bg-(--glass-bg) px-3 py-1.5 rounded-full border border-(--border-color)">
                                <span className="w-2 h-2 rounded-full bg-(--main-color) animate-pulse shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
                                <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-widest">USER MODE: UPLOAD WIZARD</span>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setIsOpen(false)} className="w-10 h-10 rounded-full bg-(--glass-bg) border border-(--border-color) flex items-center justify-center text-(--text-color-secondary) hover:text-(--text-color) transition-all shrink-0">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="px-8 pb-8 flex flex-col flex-1 overflow-y-auto custom-scrollbar">

                    {/* Step 1: Entry Status */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-4xl font-black text-(--text-color) mb-1 leading-tight tracking-tighter uppercase">ENTRY<br />STATUS</h2>
                            <p className="text-[11px] text-(--text-color-secondary) opacity-70 mb-6 uppercase tracking-[0.3em] font-bold">Initial destination classification</p>

                            <div className="grid grid-cols-1 gap-4">
                                {(['Available', 'Production', 'Acquisition'] as EntryStatus[]).map(status => (
                                    <button key={status} onClick={() => { set('status', status); setStep(2); }}
                                        className="flex items-center justify-between p-7 rounded-[32px] bg-(--glass-bg) border border-(--border-color) hover:border-(--main-color)/50 hover:bg-(--main-color)/10 transition-all group">
                                        <div className="flex items-center gap-6">
                                            <div className="w-12 h-12 rounded-2xl border-2 border-(--border-color) flex items-center justify-center group-hover:scale-110 transition-transform bg-(--glass-bg)">
                                                {status === 'Available' ? (
                                                    <svg className="w-6 h-6 text-(--text-color-secondary) group-hover:text-(--main-color)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                                                ) : status === 'Production' ? (
                                                    <svg className="w-6 h-6 text-(--text-color-secondary) group-hover:text-(--main-color)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91 a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                                                ) : (
                                                    <svg className="w-6 h-6 text-(--text-color-secondary) group-hover:text-(--main-color)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                                )}
                                            </div>
                                            <div className="text-left">
                                                <span className="text-sm font-black text-(--text-color) uppercase tracking-widest block">{status}</span>
                                                <span className="text-[9px] text-(--text-color-secondary) font-bold uppercase tracking-tight">
                                                    {status === 'Available' ? 'Standard inventory listing' : status === 'Production' ? 'Custom manufacturing line' : 'Global bulk acquisition'}
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

                            <div className="flex overflow-x-auto gap-1 py-6 px-1 custom-scrollbar no-scrollbar scroll-smooth">
                                {Object.entries(vendors)
                                    .filter(([id]) => !['R', 'M', 'W', 'C'].includes(id))
                                    .map(([id, cfg]) => (
                                        <button key={id} onClick={() => { set('vendorId', id); setStep(3); }}
                                            className="shrink-0 flex flex-col items-center gap-2 group">
                                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-lg border-2 border-black/5 group-hover:border-black/10 group-hover:scale-105 group-hover:-translate-y-1 transition-all duration-300 group-active:scale-95"
                                                style={{ backgroundColor: cfg.color, color: getTextColorForBg(cfg.color) }}>
                                                {id}
                                            </div>
                                            <span className="text-[8px] font-black text-(--text-color-secondary) uppercase tracking-widest group-hover:text-(--text-color) transition-colors">{id}</span>
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
                                <div className="p-5 rounded-3xl border border-(--main-color)/20 bg-(--main-color)/5 shadow-inner">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black uppercase text-(--text-color-secondary) tracking-[0.2em]">New Item Number</span>
                                        <span className="text-xl font-mono font-black text-(--main-color)">{state.itemNumber}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black uppercase text-(--text-color-secondary) tracking-[0.2em]">Vendor Existing Units</span>
                                        <span className="text-sm font-mono font-black text-(--text-color-secondary)">{state.existingCount}</span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] text-(--text-color-secondary) opacity-40 font-black uppercase tracking-[0.3em] block ml-1">UNITS TO ADD</label>
                                    <input type="text" value={state.quantity} 
                                        placeholder="1"
                                        onChange={e => set('quantity', e.target.value.replace(/[^0-9]/g, ''))}
                                        className="w-full h-14 px-8 text-3xl font-black bg-(--glass-bg) border border-(--border-color) rounded-[24px] text-(--text-color) focus:border-(--main-color)/50 transition-all outline-none" />
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
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} accept="image/*,video/*" multiple />
                                        <div className="w-full min-h-[160px] p-6 rounded-[32px] border-2 border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-4 hover:bg-white/[0.05] hover:border-(--main-color)/30 transition-all group">
                                            <div className="flex flex-wrap justify-center gap-4 w-full">
                                                {state.mediaList.map((m, i) => (
                                                    <div key={i} className="w-24 h-24 rounded-2xl overflow-hidden border border-white/20 relative group/thumb shadow-xl bg-black/40">
                                                        {m.type === 'video' ? (
                                                            <div className="w-full h-full flex items-center justify-center bg-black/60"><Video size={20} className="text-white/40" /></div>
                                                        ) : (
                                                            <img src={m.preview || ''} className="w-full h-full object-cover" />
                                                        )}
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); removeMedia(i); }} 
                                                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100 transition-all flex items-center justify-center text-xs shadow-lg hover:bg-red-600">
                                                            &times;
                                                        </button>
                                                    </div>
                                                ))}
                                                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 hover:border-(--main-color)/50 transition-all bg-white/[0.02]">
                                                    <Plus size={20} className="text-white/20" />
                                                    <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em]">Add More</span>
                                                </div>
                                            </div>
                                            {state.mediaList.length === 0 && <span className="text-[9px] font-black text-(--text-color-secondary) uppercase tracking-[0.3em]">Click to upload photos</span>}
                                        </div>
                                    </div>
                                </div>

                                <button onClick={() => setStep(4)} className="w-full py-4 mt-2 bg-(--glass-bg) hover:bg-(--main-color) hover:text-black text-(--text-color) border border-(--border-color) hover:border-(--main-color) rounded-[24px] text-[12px] font-black tracking-[0.3em] transition-all uppercase shadow-xl hover:-translate-y-[2px] active:translate-y-0 shrink-0">
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

                                <button onClick={() => setStep(5)} className="w-full py-4 mt-2 bg-(--glass-bg) border border-(--border-color) hover:border-(--main-color) hover:bg-(--main-color) hover:text-black text-(--text-color) rounded-[24px] text-[12px] font-black tracking-[0.3em] transition-all uppercase shadow-xl hover:-translate-y-[2px] active:translate-y-0 shrink-0">
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

                                <div className="flex flex-col gap-3">
                                    <button onClick={handleSaveNext} disabled={saving}
                                        className="w-full py-5 mt-2 bg-(--main-color) text-black rounded-[24px] text-[14px] font-black tracking-[0.4em] transition-all uppercase hover:scale-[1.02] active:scale-[0.98] shadow-[0_20px_40px_rgba(0,0,0,0.4)] disabled:opacity-50 flex items-center justify-center gap-4 shrink-0">
                                        {saving ? (
                                            <div className="w-6 h-6 border-4 border-black/20 border-t-black rounded-full animate-spin" />
                                        ) : (
                                            <>SAVE & CONTINUE <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" /></svg></>
                                        )}
                                    </button>
                                    <button onClick={handleSaveExit} disabled={saving}
                                        className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-(--text-color-secondary) hover:text-(--text-color) rounded-[24px] text-[11px] font-black tracking-[0.3em] transition-all uppercase disabled:opacity-50 shrink-0">
                                        SAVE &amp; EXIT
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
                {/* Save Progress Overlay */}
                {saving && (
                    <div className="absolute inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300 rounded-[40px]">
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
                                        className="h-full bg-(--main-color) transition-all duration-500 ease-out"
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
            </div>
        </div>
    );
};
