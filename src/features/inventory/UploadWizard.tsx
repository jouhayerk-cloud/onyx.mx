
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { userAtom, isUploadWizardOpenAtom, inventoryAtom, exchangeRateAtom, isDummyModeAtom, sidebarStateAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg, handleFileUpload, formatCurrency, readFileAsDataURL, isVideoFile } from '../../lib/utils';
import { X, ArrowRight, Video, Plus, Database, Store, Hash, Dna, Ruler, Upload, CheckCircle2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const sidebarState = useAtomValue(sidebarStateAtom);
    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    // ... [existing state] ...
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [savingProgress, setSavingProgress] = useState(0);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isOpenRef = useRef(isOpen);

    const isAdmin = user?.role === 'Admin' || user?.role === 'Developer';

    // Sidebar integration for the free-floating look
    const leftOffset = useMemo(() => {
        if (!isOpen) return '0';
        if (window.innerWidth <= 768) return '0'; // Mobile always full
        if (sidebarState === 'expanded') return '280px';
        if (sidebarState === 'compact') return '80px';
        return '0';
    }, [sidebarState, isOpen]);

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
        const tid = toast.loading('Syncing Artifact...');
        
        try {
            if (isDummyMode) {
                for (let i = 20; i <= 100; i += 20) {
                    await new Promise(r => setTimeout(r, 300));
                    setSavingProgress(i);
                }
                toast.success('✓ Item saved! (Demo Mode)', { id: tid, icon: '🧪' });
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
                vendor_id: state.vendorId,
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
            toast.success('Artifact Synced', { id: tid });
            return true;
        } catch (err: any) {
            console.error('Wizard save error:', err);
            toast.error(err.message || 'Upload Failed', { id: tid });
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
        <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(s => (
                <div key={s} className={`h-1 rounded-full transition-all duration-700 ${step >= s ? 'w-8 bg-(--main-color)' : 'w-3 bg-white/5'}`} />
            ))}
        </div>
    );

    const renderBackButton = (prevStep: number) => (
        <button onClick={() => setStep(prevStep)} className="text-[14px] md:text-[18px] font-black text-white/5 hover:text-(--main-color) uppercase tracking-[0.5em] mb-8 flex items-center gap-4 group transition-all duration-500">
            <span className="group-hover:-translate-x-2 transition-transform duration-500">←</span> BACK
        </button>
    );

    const renderTagSelector = (field: keyof WizardState, fieldSuggestions: string[]) => {
        const query = (state[field] as string || '').toLowerCase();
        const filtered = fieldSuggestions.filter(tag => tag.toLowerCase().includes(query)).slice(0, 15);
        if (filtered.length === 0) return null;
        return (
            <div className="flex flex-wrap gap-3 mt-6 animate-in fade-in duration-300">
                {filtered.map(tag => (
                    <button key={tag} onClick={() => set(field, tag)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-[0.2em] transition-all border ${state[field] === tag ? 'bg-(--main-color) text-black border-(--main-color) shadow-[0_5px_20px_rgba(var(--main-color-rgb),0.3)]' : 'bg-white/3 text-(--text-color-secondary) hover:text-(--text-color) border-white/5 hover:border-white/20'}`}>
                        {tag.toUpperCase()}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col pointer-events-none overflow-hidden" style={{ left: leftOffset }}>
            <div className="absolute inset-0 bg-[#050505]/40 backdrop-blur-[60px] pointer-events-auto" onClick={() => setIsOpen(false)} />
            
            <div className="relative flex-1 flex flex-col pointer-events-auto overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-700 ease-out app-content" onClick={e => e.stopPropagation()}>

                {/* Immensive Header */}
                <div className="px-8 md:px-16 pt-10 pb-6 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-12">
                        {renderProgress()}
                        {!isAdmin && (
                            <div className="flex items-center gap-3 bg-white/3 px-5 py-2 rounded-full border border-white/5">
                                <span className="w-2.5 h-2.5 rounded-full bg-(--main-color) animate-pulse shadow-[0_0_15px_rgba(var(--main-color-rgb),0.5)]" />
                                <span className="text-[10px] font-black text-(--text-color-secondary) uppercase tracking-[0.3em]">IMMERSIVE UPLOAD MODE</span>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setIsOpen(false)} className="w-16 h-16 rounded-full bg-white/3 border border-white/5 flex items-center justify-center text-(--text-color-secondary) hover:text-(--text-color) hover:bg-white/10 transition-all group shrink-0">
                        <X size={24} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-500" />
                    </button>
                </div>

                <div className="px-8 pb-8 flex flex-col flex-1 overflow-y-auto custom-scrollbar">

                    {/* Step 1: Entry Status */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-700 flex flex-col justify-center min-h-[40vh]">
                            <div className="flex flex-1 flex-col justify-center bg-(--glass-bg) border border-(--border-color) backdrop-blur-xl rounded-[32px] p-10 md:p-14 shadow-2xl overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-4 mb-4 opacity-50">
                                    <Database size={24} className="text-(--main-color)" />
                                    <h2 className="text-[20px] md:text-[28px] font-black text-(--text-color) leading-none tracking-tighter uppercase">CLASSIFY ARTIFACT</h2>
                                </div>

                                <div className="flex flex-col gap-6">
                                    {(['Available', 'Production', 'Acquisition'] as EntryStatus[]).map(status => (
                                        <button key={status} onClick={() => { set('status', status); setStep(2); }}
                                            className="flex items-center gap-6 group text-left">
                                            <span className="text-[24px] md:text-[40px] font-black text-(--text-color) group-hover:text-(--main-color) transition-all duration-500 uppercase leading-none tracking-tighter">
                                                {status}
                                            </span>
                                            <div className="h-px flex-1 bg-white/5 group-hover:bg-(--main-color)/20 transition-all" />
                                            <span className="text-[9px] font-black text-white/20 group-hover:text-white/40 uppercase tracking-[0.4em] transition-all">
                                                {status === 'Available' ? 'Inventory' : status === 'Production' ? 'Mfg' : 'Bulk'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Vendor */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-700">
                            <div className="flex flex-1 flex-col bg-(--glass-bg) border border-(--border-color) backdrop-blur-xl rounded-[32px] p-10 md:p-14 shadow-2xl overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-4 mb-4 opacity-50">
                                    <Store size={24} className="text-(--main-color)" />
                                    <h2 className="text-[20px] md:text-[28px] font-black text-(--text-color) leading-none tracking-tighter uppercase">VENDORS</h2>
                                </div>
                                {renderBackButton(1)}

                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6 py-4">
                                    {Object.entries(vendors)
                                        .filter(([id]) => !['R', 'M', 'W', 'C'].includes(id))
                                        .map(([id, cfg]) => (
                                            <button key={id} onClick={() => { set('vendorId', id); setStep(3); }}
                                                className="group flex flex-col items-start gap-2 transition-all">
                                                <div className="w-full aspect-square rounded-[20px] flex items-center justify-center font-black text-2xl shadow-xl transition-all duration-500 group-hover:scale-105 group-hover:-translate-y-1 group-active:scale-95"
                                                    style={{ backgroundColor: cfg.color, color: getTextColorForBg(cfg.color) }}>
                                                    {id}
                                                </div>
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] group-hover:text-white group-hover:tracking-[0.5em] transition-all duration-500">{cfg.name || id}</span>
                                            </button>
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Quantity & Media */}
                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-700">
                            <div className="flex flex-1 flex-col bg-(--glass-bg) border border-(--border-color) backdrop-blur-xl rounded-[32px] p-10 md:p-14 shadow-2xl overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-4 mb-4 opacity-50">
                                    <Hash size={24} className="text-(--main-color)" />
                                    <h2 className="text-[20px] md:text-[28px] font-black text-(--text-color) leading-none tracking-tighter uppercase">UNITS</h2>
                                </div>
                                {isAdmin && renderBackButton(2)}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 py-4">
                                    <div className="flex flex-col gap-8">
                                        <div className="flex flex-col gap-3">
                                            <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em] block">Artifact ID</label>
                                            <span className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none">{state.vendorId}-{state.itemNumber}</span>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em] block">Units to Add</label>
                                            <input 
                                                autoFocus
                                                type="text" 
                                                value={state.quantity} 
                                                placeholder="00"
                                                onChange={e => set('quantity', e.target.value.replace(/[^0-9]/g, ''))}
                                                className="bg-transparent border-none text-[60px] md:text-[80px] font-black text-(--main-color) outline-none placeholder:opacity-5 leading-none tracking-tighter w-full" 
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-6">
                                        <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-4">
                                            <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em]">Evidence Type</label>
                                            <div className="flex gap-6">
                                                {(['Product', 'Lot'] as MediaType[]).map(t => (
                                                    <button key={t} onClick={() => set('mediaType', t)}
                                                        className={`text-[11px] font-black tracking-[0.3em] transition-all uppercase ${state.mediaType === t ? 'text-(--main-color)' : 'text-white/20 hover:text-white/50'}`}>
                                                        {t}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="relative cursor-pointer group/attach" onClick={() => fileInputRef.current?.click()}>
                                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} accept="image/*,video/*" multiple />
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="aspect-square rounded-[24px] border-2 border-dashed border-(--main-color)/20 flex flex-col items-center justify-center gap-4 hover:border-(--main-color)/60 hover:bg-(--main-color)/5 transition-all bg-(--main-color)/2 relative overflow-hidden group-active/attach:scale-95 duration-500">
                                                    <div className="absolute inset-0 bg-radial from-(--main-color)/5 to-transparent opacity-0 group-hover/attach:opacity-100 transition-opacity" />
                                                    <div className="w-12 h-12 rounded-full bg-(--main-color)/10 flex items-center justify-center animate-pulse">
                                                        <Upload size={24} className="text-(--main-color)" />
                                                    </div>
                                                    <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.3em]">Attach Capture</span>
                                                </div>

                                                {state.mediaList.map((m, i) => (
                                                    <div key={i} className="aspect-square rounded-[24px] overflow-hidden relative group/thumb shadow-xl bg-black border border-white/10">
                                                        {m.type === 'video' ? (
                                                            <div className="w-full h-full flex items-center justify-center overflow-hidden"><Video size={24} className="text-white/20" /></div>
                                                        ) : (
                                                            <img src={m.preview || ''} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                                        )}
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); removeMedia(i); }} 
                                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100 transition-all flex items-center justify-center text-lg shadow-lg backdrop-blur-md">
                                                            &times;
                                                        </button>
                                                        {i === 0 && (
                                                            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[8px] font-black text-white/60 uppercase tracking-widest border border-white/10">Primary</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        <div className="mt-8">
                                            <button onClick={() => setStep(4)} className="w-full md:w-auto h-16 md:h-auto px-10 rounded-[20px] md:rounded-none bg-(--main-color)/5 md:bg-transparent text-[32px] md:text-[50px] font-black text-white/20 hover:text-(--main-color) transition-all uppercase tracking-tighter leading-none flex items-center justify-center md:justify-start gap-4 group">
                                                PROCEED <ArrowRight size={32} className="group-hover:translate-x-3 transition-transform duration-500" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Attributes */}
                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-700">
                            <div className="flex flex-1 flex-col bg-(--glass-bg) border border-(--border-color) backdrop-blur-xl rounded-[32px] p-10 md:p-14 shadow-2xl overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-4 mb-4 opacity-50">
                                    <Dna size={24} className="text-(--main-color)" />
                                    <h2 className="text-[20px] md:text-[28px] font-black text-(--text-color) leading-none tracking-tighter uppercase">CORE DNA</h2>
                                </div>
                                {renderBackButton(3)}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10 py-4">
                                    {[
                                        { label: 'Artifact Shape', key: 'shape', sugg: suggestions.shape },
                                        { label: 'Artifact Material', key: 'material', sugg: suggestions.material },
                                        { label: 'Artifact Color', key: 'color', sugg: suggestions.color },
                                        { label: 'Artifact Type', key: 'type', sugg: suggestions.type },
                                    ].map(field => (
                                        <div key={field.key} className="flex flex-col gap-3">
                                            <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em] block">{field.label}</label>
                                            <input 
                                                value={(state as any)[field.key]} 
                                                onChange={e => set(field.key as any, e.target.value)}
                                                placeholder="UNSPECIFIED"
                                                className="bg-transparent border-none text-2xl md:text-5xl font-black text-white outline-none placeholder:opacity-5 uppercase tracking-tighter w-full leading-none" 
                                            />
                                            {renderTagSelector(field.key as any, field.sugg || [])}
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 pt-8 border-t border-white/5">
                                    <button onClick={() => setStep(5)} className="text-[32px] md:text-[50px] font-black text-white/10 hover:text-(--main-color) transition-all uppercase tracking-tighter leading-none flex items-center gap-4 group">
                                        METRICS <ArrowRight size={32} className="group-hover:translate-x-3 transition-transform duration-500" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Dimensions & Save */}
                    {step === 5 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-700">
                            <div className="flex flex-1 flex-col bg-(--glass-bg) border border-(--border-color) backdrop-blur-xl rounded-[32px] p-10 md:p-14 shadow-2xl overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-4 mb-4 opacity-50">
                                    <Ruler size={24} className="text-(--main-color)" />
                                    <h2 className="text-[20px] md:text-[28px] font-black text-(--text-color) leading-none tracking-tighter uppercase">METRICS</h2>
                                </div>
                                {renderBackButton(4)}

                                <div className="flex flex-col gap-12 py-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                                        {[
                                            { l: 'MASS (KG)', k: 'weightKg', s: suggestions.weightKg },
                                            { l: 'WIDTH (CM)', k: 'widthCm', s: suggestions.widthCm },
                                            { l: 'HEIGHT (CM)', k: 'heightCm', s: suggestions.heightCm },
                                            { l: 'DEPTH (CM)', k: 'lengthCm', s: suggestions.lengthCm },
                                        ].map(f => (
                                            <div key={f.k} className="flex flex-col gap-3">
                                                <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em] block">{f.l}</label>
                                                <input 
                                                    type="number" 
                                                    value={(state as any)[f.k]} 
                                                    onChange={e => set(f.k as any, e.target.value)}
                                                    placeholder="0.0"
                                                    className="bg-transparent border-none text-2xl md:text-5xl font-black text-white outline-none placeholder:opacity-5 w-full leading-none" 
                                                />
                                                {renderTagSelector(f.k as any, f.s || [])}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-16 py-8 border-y border-white/5">
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-baseline">
                                                <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em]">VALUATION (MXN)</label>
                                                {state.price && exchangeRate && (
                                                    <span className="text-[11px] font-black text-(--main-color) uppercase tracking-[0.2em] animate-pulse">
                                                        ≈ {formatCurrency(parseFloat(state.price) / exchangeRate, 'USD')} USD
                                                    </span>
                                                )}
                                            </div>
                                            <input 
                                                type="number" 
                                                value={state.price} 
                                                onChange={e => set('price', e.target.value)}
                                                placeholder="0,000.00"
                                                className="bg-transparent border-none text-[40px] md:text-[70px] font-black text-white outline-none placeholder:opacity-5 w-full tracking-tighter leading-none" 
                                            />
                                            {renderTagSelector('price', suggestions.price || [])}
                                        </div>

                                        <div className="flex flex-col gap-4">
                                            <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.4em]">ARTIFACT REGISTRY NOTES</label>
                                            <textarea 
                                                value={state.notes} 
                                                onChange={e => set('notes', e.target.value)}
                                                placeholder="ADDITIONAL TECHNICAL SPECIFICATIONS OR LOGISTICS DATA..."
                                                className="bg-transparent border-none text-lg md:text-xl font-bold text-white/40 outline-none placeholder:opacity-5 uppercase w-full resize-none h-24 scrollbar-hide" 
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col md:flex-row gap-12 pt-4 items-baseline">
                                        <button onClick={handleSaveNext} disabled={saving}
                                            className="text-[32px] md:text-[55px] font-black text-(--main-color) hover:text-white transition-all uppercase tracking-tighter leading-none disabled:opacity-30">
                                            {saving ? 'SYNCING...' : 'SYNC ARTIFACT'}
                                        </button>
                                        <button onClick={handleSaveExit} disabled={saving}
                                            className="text-[14px] md:text-[18px] font-black text-white/10 hover:text-red-500 transition-all uppercase tracking-[0.5em] disabled:opacity-30">
                                            {saving ? '...' : 'SAVE & EXIT'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
                {/* Save Progress Overlay - Aligned with Edit Form */}
                {saving && (
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
            </div>
        </div>
    );
};
