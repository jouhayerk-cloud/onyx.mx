
import React, { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import toast from 'react-hot-toast';
import { 
    userAtom, 
    isUploadWizardOpenAtom, 
    inventoryAtom, 
    exchangeRateAtom, 
    isDummyModeAtom, 
    sidebarStateAtom, 
    uploadItemDataAtom,
    workbookVersionAtom,
    InventoryVersionAtom
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { 
    getTextColorForBg, 
    handleFileUpload, 
    formatCurrency, 
    readFileAsDataURL, 
    calculateCodesAndPrices,
    normalizeInventoryData
} from '../../lib/utils';
import { 
    X, ArrowRight, Video, Plus, Database, Store, Hash, 
    Dna, Ruler, Upload, CheckCircle2, Trash2, ChevronLeft, 
    ChevronRight, CloudUpload, Check, Box, Info, Sparkles,
    FileSpreadsheet, Zap, Scan, LayoutGrid, FileText, Camera,
    BookOpen, AlertTriangle, RefreshCw, ChevronDown, Save
} from 'lucide-react';

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
    existingNumbers: string[];
    payReq?: string;
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
    existingNumbers: [],
    payReq: '',
};

// ── REFINED INTERACTIVE SMART INPUT ──
const SmartInput = memo(({ label, field, value, type = 'text', icon: Icon, fieldSuggestions, warning, className = "", suggestionIndex = 0, onSet }: any) => {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const query = (value || '').toLowerCase();
    
    const filtered = useMemo(() => {
        if (!fieldSuggestions || !isFocused) return [];
        return fieldSuggestions
            .filter((tag: string) => tag.toLowerCase().includes(query))
            .slice(0, 12); 
    }, [fieldSuggestions, query, isFocused]);
    
    const activeGhostTag = fieldSuggestions && fieldSuggestions.length > 0 
        ? fieldSuggestions[suggestionIndex % fieldSuggestions.length] 
        : "NONE";

    const handleFocus = useCallback(() => setIsFocused(true), []);
    const handleBlur = useCallback(() => {
        setTimeout(() => setIsFocused(false), 200);
    }, []);
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => onSet(field, e.target.value), [field, onSet]);

    return (
        <div className={`group relative flex flex-col py-2 border-b transition-colors duration-200 ease-out ${warning ? 'border-red-500' : 'border-white/10 hover:border-white/40'} ${className}`}>
            <div className="flex justify-between items-start mb-1 select-none">
                <div className="flex items-center gap-3">
                    {Icon && <Icon size={12} className={warning ? 'text-red-500' : (value || isFocused ? 'text-(--main-color)' : 'text-white/40')} strokeWidth={3} />}
                    <span className={`text-[9px] font-black uppercase tracking-[0.4em] transition-colors duration-200 ${warning ? 'text-red-500' : (value || isFocused ? 'text-(--main-color)' : 'text-white/40')}`}>{label}</span>
                </div>
                {(value || warning) && (
                    <div className="animate-in zoom-in duration-200">
                        {warning ? <AlertTriangle size={14} className="text-red-500" strokeWidth={3} /> : <CheckCircle2 size={14} className="text-(--main-color)" strokeWidth={3} />}
                    </div>
                )}
            </div>
            
            <div className="relative overflow-hidden h-14 md:h-16 flex items-center">
                {!value && !isFocused && (
                    <span className="absolute inset-0 flex items-center text-4xl md:text-5xl font-black uppercase tracking-tighter text-white/15 select-none pointer-events-none italic animate-in fade-in duration-300">
                        {activeGhostTag}
                    </span>
                )}
                
                <input 
                    ref={inputRef}
                    type={type}
                    value={value}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()} 
                    placeholder={!activeGhostTag && !isFocused ? "NONE" : ""}
                    className={`
                        bg-transparent border-none outline-none w-full text-4xl md:text-5xl font-black uppercase tracking-tighter transition-all duration-200 relative z-10
                        ${warning ? 'text-red-500' : (value || isFocused ? 'text-white' : 'text-transparent')}
                    `}
                />
            </div>

            {isFocused && filtered.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 animate-in fade-in slide-in-from-top-2 duration-200 bg-black/90 p-4 rounded-2xl backdrop-blur-3xl border border-white/10 z-50 shadow-2xl">
                    {filtered.map((tag: string) => (
                        <button key={tag} onClick={() => onSet(field, tag)}
                            className={`
                                text-[10px] font-black tracking-[0.2em] uppercase transition-all px-3 py-1.5 rounded-lg border
                                ${value === tag 
                                    ? 'bg-white text-black border-white scale-105' 
                                    : 'bg-white/5 text-white/60 border-white/10 hover:border-white hover:bg-white hover:text-black active:scale-95'
                                }
                            `}>
                            {tag}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});

export const UploadWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isUploadWizardOpenAtom);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    
    const [saving, setSaving] = useState(false);
    const [savingProgress, setSavingProgress] = useState(0);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
    const [globalSuggestionIndex, setGlobalSuggestionIndex] = useState(0);

    // PULL TO REFRESH STATE
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const touchStartY = useRef(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            const isV825 = itemData.workbook === 'v825';
            setState(prev => ({
                ...prev,
                status: isV825 ? 'Acquisition' : 'Available',
                payReq: isV825 ? 'paid' : '',
                vendorId: user?.role === 'Vendor' ? (user.name || '') : prev.vendorId,
            }));
        }
    }, [isOpen, itemData.workbook, user]);

    useEffect(() => {
        if (!db || !isOpen) return;
        const fetchTags = async () => {
            try {
                const items = await db.inventory.find().exec();
                const u = (cols: string[]) => Array.from(new Set(items.map((i: any) => {
                    for (const c of cols) if (i[c]) return String(i[c]);
                    return null;
                }).filter(Boolean))).sort().slice(0, 32);

                setSuggestions({
                    shape: u(['shape']),
                    material: u(['material']),
                    color: u(['color']),
                    type: u(['short_description', 'shortDescription', 'item_type', 'type']),
                    weightKg: u(['weight_kg', 'weightKg']),
                    widthCm: u(['width_cm', 'widthCm']),
                    heightCm: u(['height_cm', 'heightCm']),
                    lengthCm: u(['length_cm', 'lengthCm']),
                    price: u(['price_mxn', 'priceMxn', 'price']),
                    quantity: u(['quantity'])
                } as any);
            } catch (e) { console.error(e); }
        };
        fetchTags();
    }, [db, isOpen]);

    useEffect(() => {
        if (!db || !state.vendorId || !isOpen) return;
        const fetchNextNum = async () => {
            const selector: any = { 
                item_id: { $regex: `^${state.vendorId}-` },
                workbook: itemData.workbook || 'v326'
            };
            const items = await db.inventory.find({ selector }).exec();
            let maxNum = 0;
            let existingNumbers: string[] = [];
            items.forEach((i: any) => {
                const numStr = String(i.item_number || i.itemNumber || '');
                if (numStr) {
                    existingNumbers.push(numStr);
                    const num = parseInt(numStr);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                }
            });
            setState(prev => ({ ...prev, itemNumber: String(maxNum + 1), existingNumbers }));
        };
        fetchNextNum();
    }, [db, state.vendorId, itemData.workbook, isOpen]);

    const set = useCallback((k: keyof WizardState, v: any) => setState(prev => ({ ...prev, [k]: v })), []);
    
    const handleGlobalClick = useCallback(() => {
        setGlobalSuggestionIndex(prev => prev + 1);
    }, []);

    // PULL TO REFRESH LOGIC
    const handleTouchStart = (e: React.TouchEvent) => {
        if (scrollContainerRef.current?.scrollTop === 0) {
            touchStartY.current = e.touches[0].clientY;
        } else {
            touchStartY.current = 0;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartY.current === 0) return;
        const deltaY = e.touches[0].clientY - touchStartY.current;
        if (deltaY > 0) {
            setPullDistance(Math.min(deltaY * 0.4, 150));
            if (deltaY > 100) e.preventDefault();
        }
    };

    const handleTouchEnd = () => {
        if (pullDistance > 80) {
            triggerRefresh();
        }
        setPullDistance(0);
        touchStartY.current = 0;
    };

    const triggerRefresh = () => {
        setIsRefreshing(true);
        setGlobalSuggestionIndex(prev => prev + 1);
        toast.success('Suggestions Refreshed', { icon: '🔄', duration: 1000 });
        setTimeout(() => setIsRefreshing(false), 800);
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const newMedia: WizardMedia[] = [];
        for (const file of files) {
            const type = file.type.startsWith('video/') ? 'video' : 'image';
            const preview = await readFileAsDataURL(file, type);
            newMedia.push({ file, preview, type });
        }
        setState(prev => ({ ...prev, mediaList: [...prev.mediaList, ...newMedia] }));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeMedia = useCallback((idx: number) => {
        setState(prev => ({ ...prev, mediaList: prev.mediaList.filter((_, i) => i !== idx) }));
    }, []);

    const doSave = async (): Promise<boolean> => {
        if (!state.vendorId || !state.itemNumber) { toast.error('Missing Vendor or Index'); return false; }
        if (state.existingNumbers.includes(state.itemNumber)) {
            const proceed = window.confirm(`WARNING: Index ${state.itemNumber} already exists for Vendor ${state.vendorId}. Continue?`);
            if (!proceed) return false;
        }
        
        setSaving(true);
        setSavingProgress(10);
        const tid = toast.loading('Syncing Registry...');
        try {
            if (isDummyMode) {
                for (let i = 20; i <= 100; i += 20) {
                    await new Promise(r => setTimeout(r, 150));
                    setSavingProgress(i);
                }
                toast.success('Artifact Synced (Demo)', { id: tid });
                return true;
            }
            let uploadedUrls: string[] = [];
            if (state.mediaList.length > 0) {
                for (let i = 0; i < state.mediaList.length; i++) {
                    const m = state.mediaList[i];
                    if (m.file) {
                        const res = await handleFileUpload(m.file, user);
                        if (res) uploadedUrls.push(`${res.thumbnailUrl}${state.mediaType ? `&tag=${state.mediaType}` : ''}`);
                    }
                    setSavingProgress(Math.round(10 + ((i + 1) / state.mediaList.length) * 70));
                }
            }
            const calculated = calculateCodesAndPrices(
                { 
                    price: parseFloat(state.price) || 0, 
                    itemId: `${state.vendorId}-${state.itemNumber.padStart(3, '0')}`, 
                    workbook: itemData.workbook || 'v326', 
                    itemNumber: state.itemNumber || '1',
                    vendorId: state.vendorId
                },
                exchangeRate,
                'v326'
            );

            const payload = {
                id: itemData.id || crypto.randomUUID(),
                item_id: `${state.vendorId}-${state.itemNumber.padStart(3, '0')}`,
                book_barcode: calculated.bookBarcode,
                book_aq_code: calculated.bookAqCode,
                status: state.status || 'Production',
                shape: state.shape || '',
                material: state.material || '',
                color: state.color || '',
                short_description: state.type || '',
                quantity: parseInt(state.quantity) || 1,
                price_mxn: parseFloat(state.price) || 0,
                weight_kg: parseFloat(state.weightKg) || null,
                width_cm: parseFloat(state.widthCm) || null,
                height_cm: parseFloat(state.heightCm) || null,
                length_cm: parseFloat(state.lengthCm) || null,
                item_number: parseInt(state.itemNumber) || 1,
                media_urls: uploadedUrls.join(','),
                workbook: itemData.workbook || 'v326',
                description: state.notes,
                pay_req: state.payReq || null,
                created_by: user?.name || user?.email,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            setSavingProgress(95);

            // 1. Persist to Supabase with strict error handling
            const { data: sbData, error: sbError } = await supabase.from('inventory').insert(payload).select().single();
            if (sbError) {
                console.error('[UploadWizard] Supabase Insert Error:', sbError);
                throw new Error(`Database Error: ${sbError.message}`);
            }

            // 2. Local RxDB Upsert (Optional)
            if (db) {
                try {
                    await db.inventory.upsert(payload);
                } catch (rxError) {
                    console.warn('[UploadWizard] RxDB sync skipped:', rxError);
                }
            }

            // 3. Force UI refresh
            setInventoryVersion(v => v + 1);

            toast.success('Artifact Created!', { id: tid });
            toast.success('Registry Updated', { id: tid });
            return true;
        } catch (err: any) {
            toast.error(err.message || 'Upload Failed', { id: tid });
            return false;
        } finally {
            setTimeout(() => { setSaving(false); setSavingProgress(0); }, 300);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            
            if (e.key === 'Escape') {
                setIsOpen(false);
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) {
                e.preventDefault();
                doSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, setIsOpen, doSave]);

    const isDuplicate = state.existingNumbers.includes(state.itemNumber);

    if (!isOpen) return null;

    return (
        <div 
            className="absolute inset-0 z-100 flex items-center justify-center p-4 sm:p-10 animate-in fade-in duration-500 overflow-hidden"
            onClick={handleGlobalClick}
        >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl" onClick={() => setIsOpen(false)} />
            
            <div 
                className="relative w-full h-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 bg-black/10 border-none rounded-none md:rounded-[40px] shadow-2xl backdrop-blur-3xl"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{ transform: `translateY(${pullDistance}px)`, transition: pullDistance === 0 ? 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none' }}
            >
                {/* PULL INDICATOR */}
                <div 
                    className="absolute top-0 left-0 right-0 flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none"
                    style={{ opacity: pullDistance / 100, transform: `translateY(-${100 - pullDistance}px)` }}
                >
                    <RefreshCw size={32} className={`text-(--main-color) ${isRefreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white mt-4">Pull to Shuffle Suggestions</span>
                </div>
                
                <div className="flex items-center justify-between px-10 py-10 md:px-24 md:py-16 shrink-0 z-20">
                    <div className="flex items-center gap-10">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-12 mb-2">
                                <div className="flex items-center gap-4">
                                    <Plus size={18} className="text-(--main-color)" strokeWidth={4} />
                                    <h1 className="text-xl md:text-2xl font-black uppercase tracking-[0.4em] text-white leading-none">Add Entry</h1>
                                </div>
                                
                                <div className="flex gap-10">
                                    {['v326', 'v825'].map(v => (
                                        <button key={v} onClick={(e) => { e.stopPropagation(); setItemData(prev => ({ ...prev, workbook: v as any })); }}
                                            className={`text-3xl md:text-4xl font-black uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95 ${itemData.workbook === v ? 'text-(--main-color)' : 'text-white/20 hover:text-white/60'}`}>
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-black uppercase tracking-[0.8em] text-white">Onyx Intelligence Engine</span>
                                <button onClick={(e) => { e.stopPropagation(); triggerRefresh(); }} className={`p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-(--main-color) transition-all duration-500 ${isRefreshing ? 'animate-spin text-(--main-color)' : ''}`}>
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-16">
                        <div className="hidden md:flex flex-col text-right">
                            <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.5em] mb-1">Preview Artifact:</span>
                            <span className={`text-3xl font-black tracking-tighter uppercase tabular-nums transition-colors duration-200 ${isDuplicate ? 'text-red-500' : 'text-white'}`}>
                                {state.vendorId || '???'}-{state.itemNumber.padStart(3, '0')}
                            </span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} className="p-4 rounded-full text-white/40 hover:text-white hover:scale-110 transition-all hover:rotate-90 duration-200">
                            <X size={40} strokeWidth={2} />
                        </button>
                    </div>
                </div>

                <div 
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto no-scrollbar px-10 md:px-24 pb-48 animate-in slide-in-from-bottom-4 duration-300"
                    onClick={() => setGlobalSuggestionIndex(prev => prev + 1)}
                >
                    <div className="max-w-[1600px] mx-auto space-y-8 md:space-y-12" onClick={(e) => e.stopPropagation()}>
                        
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em]">Status Selector</label>
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { id: 'Available', icon: LayoutGrid },
                                    { id: 'Production', icon: Zap },
                                    { id: 'Acquisition', icon: Database }
                                ].map(s => (
                                    <button key={s.id} onClick={() => set('status', s.id as any)}
                                        className={`py-4 px-8 rounded-xl transition-all duration-200 flex items-center justify-center gap-4 ${state.status === s.id ? 'bg-white text-black shadow-2xl scale-105' : 'bg-black/20 border border-white/5 text-white/40 hover:bg-white/5 hover:text-white backdrop-blur-xl'}`}>
                                        <s.icon size={18} strokeWidth={3} className={state.status === s.id ? 'text-black' : 'text-(--main-color)'} />
                                        <span className="text-[11px] font-black uppercase tracking-[0.4em]">{s.id}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-10 gap-2 md:gap-4 items-start">
                            <div className="md:col-span-9 space-y-4">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em]">Vendors</label>
                                <div className="grid grid-rows-2 grid-flow-col gap-3 overflow-x-auto no-scrollbar pb-4 h-40">
                                    {Object.entries(vendors)
                                        .filter(([id]) => !['R', 'M', 'W', 'C', 'ON', 'SIMONA', 'JUAN'].includes(id))
                                        .map(([id, cfg]) => (
                                            <button key={id} onClick={() => set('vendorId', id)}
                                                className={`h-16 px-8 rounded-xl flex items-center justify-center text-xl font-black transition-all shrink-0 border-4 ${state.vendorId === id ? 'scale-110 shadow-2xl border-white' : 'border-transparent grayscale opacity-100 hover:grayscale-0'}`}
                                                style={{ backgroundColor: cfg.color, color: getTextColorForBg(cfg.color) }}>
                                                {id}
                                            </button>
                                        ))}
                                </div>
                            </div>
                            <div className="md:col-span-1 self-end">
                                <SmartInput label="Index" field="itemNumber" value={state.itemNumber} icon={Hash} type="number" warning={isDuplicate} className="border-b-0" onSet={set} suggestionIndex={globalSuggestionIndex} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em]">Evidence Hub</label>
                            <div className="flex flex-col gap-4">
                                <div onClick={() => fileInputRef.current?.click()} className="w-full h-32 rounded-3xl border-2 border-dashed border-white/20 hover:border-(--main-color) hover:bg-(--main-color)/10 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group shadow-2xl">
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} accept="image/*,video/*" multiple />
                                    <Upload size={32} strokeWidth={4} className="text-white/40 group-hover:text-(--main-color) transition-all duration-200" />
                                    <span className="text-[10px] font-black text-white/40 group-hover:text-(--main-color) uppercase tracking-[0.8em]">Attach Evidence</span>
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    {state.mediaList.map((m, i) => (
                                        <div key={i} className="w-24 h-24 rounded-2xl overflow-hidden relative group/media border border-white/10 bg-black shadow-2xl">
                                            {m.type === 'video' ? (
                                                <div className="w-full h-full flex items-center justify-center"><Video size={20} className="text-white" /></div>
                                            ) : (
                                                <img src={m.preview || ''} className="w-full h-full object-cover opacity-100 transition-all duration-200" />
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); removeMedia(i); }} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-all scale-75 group-hover/media:scale-100 shadow-2xl">
                                                <X size={12} strokeWidth={4} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                            <SmartInput label="Shape" field="shape" value={state.shape} icon={Box} fieldSuggestions={suggestions.shape} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label="Type" field="type" value={state.type} icon={Database} fieldSuggestions={suggestions.type} onSet={set} suggestionIndex={globalSuggestionIndex} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                            <SmartInput label="Color" field="color" value={state.color} icon={Info} fieldSuggestions={suggestions.color} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label="Material" field="material" value={state.material} icon={Sparkles} fieldSuggestions={suggestions.material} onSet={set} suggestionIndex={globalSuggestionIndex} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                            <SmartInput label="Quantity" field="quantity" value={state.quantity} icon={Hash} type="number" onSet={set} fieldSuggestions={suggestions.quantity} suggestionIndex={globalSuggestionIndex} />
                            <div className="space-y-4">
                                <SmartInput label="ACQ MXN" field="price" value={state.price} icon={Hash} type="number" fieldSuggestions={suggestions.price} onSet={set} suggestionIndex={globalSuggestionIndex} />
                                {state.price && exchangeRate && (
                                    <div className="flex justify-between items-baseline animate-in slide-in-from-right-4 duration-200">
                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">USD Protocol</span>
                                        <span className="text-3xl font-black text-(--main-color) tracking-tighter tabular-nums">{formatCurrency(parseFloat(state.price) / exchangeRate, 'USD')}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                            <SmartInput label="Width (CM)" field="widthCm" value={state.widthCm} icon={Ruler} type="number" fieldSuggestions={suggestions.widthCm} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label="Height (CM)" field="heightCm" value={state.heightCm} icon={Ruler} type="number" fieldSuggestions={suggestions.heightCm} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label="Depth (CM)" field="lengthCm" value={state.lengthCm} icon={Ruler} type="number" fieldSuggestions={suggestions.lengthCm} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label="Mass (KG)" field="weightKg" value={state.weightKg} icon={Dna} type="number" fieldSuggestions={suggestions.weightKg} onSet={set} suggestionIndex={globalSuggestionIndex} />
                        </div>

                        <div className="py-2 border-b border-white/10 hover:border-white/40 transition-all duration-200">
                            <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em] block mb-1">Notes</label>
                            <input 
                                type="text"
                                value={state.notes} 
                                onChange={e => set('notes', e.target.value)}
                                onClick={(e) => e.stopPropagation()} 
                                placeholder="TECHNICAL SPECIFICATIONS..."
                                className="bg-transparent border-none text-xl font-black text-white outline-none placeholder:text-white/20 uppercase w-full transition-all tracking-widest" 
                            />
                        </div>
                    </div>
                </div>

                <div className="px-10 py-10 md:px-24 md:py-12 mt-auto bg-black/10 flex flex-col md:flex-row items-center justify-end gap-12 shrink-0 border-t border-white/10 backdrop-blur-3xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-10 w-full md:w-auto">
                        <button onClick={() => setIsOpen(false)} className="px-10 py-4 text-white/40 hover:text-white hover:underline text-[11px] font-black uppercase tracking-[0.5em] transition-all">
                            Discard
                        </button>
                        <button 
                            onClick={doSave} 
                            disabled={saving} 
                            className="flex items-center justify-center transition-all active:scale-90"
                            title="Save"
                        >
                            {saving ? (
                                <RefreshCw size={48} strokeWidth={3} className="text-(--main-color) animate-spin" />
                            ) : (
                                <Save size={64} strokeWidth={2} className="text-(--main-color) hover:scale-110 transition-all drop-shadow-[0_0_20px_rgba(var(--main-color-rgb),0.3)]" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {saving && (
                <div className="absolute inset-0 z-[7000] flex items-center justify-center bg-black/95 backdrop-blur-3xl animate-in fade-in duration-200">
                    <div className="w-[600px] p-24 flex flex-col items-center gap-16 relative">
                        <div className="w-24 h-24 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_100px_rgba(var(--main-color-rgb),0.5)]">
                            <CloudUpload size={48} strokeWidth={4} className="animate-bounce" />
                        </div>
                        <div className="w-full space-y-10">
                            <div className="flex justify-between items-end">
                                <span className="text-[14px] font-black text-white uppercase tracking-[0.6em]">Master Sync</span>
                                <span className="text-7xl font-black text-(--main-color) tracking-tighter tabular-nums">{savingProgress}%</span>
                            </div>
                            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-(--main-color) transition-all duration-200 ease-out shadow-[0_0_40px_rgba(var(--main-color-rgb),0.6)]" style={{ width: `${savingProgress}%` }} />
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-white uppercase tracking-[1.5em] animate-pulse">Syncing Protocols...</p>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
};
