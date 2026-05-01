
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
    workbookVersionAtom
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
    BookOpen, AlertTriangle
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

// ── SOLID HIGH CONTRAST SMART INPUT WITH DYNAMIC TAG SLIDESHOW ──
const SmartInput = ({ label, field, value, type = 'text', icon: Icon, fieldSuggestions, warning, className = "", onSet }: any) => {
    const [isFocused, setIsFocused] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const query = (value || '').toLowerCase();
    
    const filtered = useMemo(() => {
        if (!fieldSuggestions) return [];
        return fieldSuggestions
            .filter((tag: string) => tag.toLowerCase().includes(query))
            .slice(0, 24); 
    }, [fieldSuggestions, query]);
    
    useEffect(() => {
        if (!fieldSuggestions || fieldSuggestions.length === 0 || value || isFocused) return;
        const interval = setInterval(() => {
            setSuggestionIndex(prev => (prev + 1) % fieldSuggestions.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [fieldSuggestions, value, isFocused]);

    const activeGhostTag = fieldSuggestions && fieldSuggestions.length > 0 ? fieldSuggestions[suggestionIndex] : "NONE";

    return (
        <div className={`group relative flex flex-col transition-all duration-700 py-2 border-b ${warning ? 'border-red-500' : 'border-white/20 hover:border-white'} ${className}`}>
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-3">
                    {Icon && <Icon size={12} className={warning ? 'text-red-500' : (value || isFocused ? 'text-(--main-color)' : 'text-white')} strokeWidth={3} />}
                    <span className={`text-[9px] font-black uppercase tracking-[0.4em] ${warning ? 'text-red-500' : (value || isFocused ? 'text-(--main-color)' : 'text-white')}`}>{label}</span>
                </div>
                {warning ? (
                    <AlertTriangle size={14} className="text-red-500 animate-pulse" strokeWidth={3} />
                ) : value && (
                    <CheckCircle2 size={14} className="text-(--main-color) animate-in zoom-in duration-700" strokeWidth={3} />
                )}
            </div>
            
            <div className="relative">
                {!value && !isFocused && (
                    <span className="absolute inset-0 text-4xl md:text-5xl font-black uppercase tracking-tighter text-white/25 select-none pointer-events-none animate-in fade-in duration-1000 slide-in-from-left-2 whitespace-nowrap overflow-hidden text-ellipsis italic">
                        {activeGhostTag}
                    </span>
                )}
                
                <input 
                    type={type}
                    value={value}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                    onChange={e => onSet(field, e.target.value)}
                    placeholder={!activeGhostTag && !isFocused ? "NONE" : ""}
                    className={`
                        bg-transparent border-none outline-none w-full text-4xl md:text-5xl font-black uppercase tracking-tighter transition-all duration-700
                        ${warning ? 'text-red-500' : (value || isFocused ? 'text-white' : 'text-white placeholder:text-white')}
                    `}
                />
            </div>

            {isFocused && (
                <div className="flex flex-wrap gap-2 mt-4 animate-in fade-in slide-in-from-top-4 duration-700 bg-white/10 p-6 rounded-3xl backdrop-blur-3xl border border-white/30 shadow-[0_0_50px_rgba(255,255,255,0.05)] z-30">
                    {filtered.length > 0 ? (
                        filtered.map((tag: string) => (
                            <button key={tag} onClick={() => onSet(field, tag)}
                                className={`
                                    text-[10px] font-black tracking-[0.2em] uppercase transition-all px-4 py-2 rounded-xl border-2
                                    ${value === tag 
                                        ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' 
                                        : 'bg-white/20 text-white border-white/40 hover:border-white hover:bg-white hover:text-black hover:scale-105 active:scale-95'
                                    }
                                `}>
                                {tag}
                            </button>
                        ))
                    ) : (
                        <span className="text-[10px] font-black text-white/60 uppercase tracking-widest italic">No matches available</span>
                    )}
                </div>
            )}
            
            {warning && (
                <span className="text-[8px] font-black text-red-500 uppercase tracking-[0.2em] mt-2 animate-in slide-in-from-left-4 duration-700">
                    Warning: ID Conflict Detected
                </span>
            )}
        </div>
    );
};

export const UploadWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isUploadWizardOpenAtom);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    
    const [saving, setSaving] = useState(false);
    const [savingProgress, setSavingProgress] = useState(0);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});

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

    // Reverting to individual field suggestions
    useEffect(() => {
        if (!db || !isOpen) return;
        const fetchTags = async () => {
            try {
                const items = await db.inventory.find().exec();
                const u = (cols: string[]) => Array.from(new Set(items.map((i: any) => {
                    for (const c of cols) if (i[c]) return String(i[c]);
                    return null;
                }).filter(Boolean))).sort().slice(0, 24);

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
            let existingCount = 0;
            let existingNumbers: string[] = [];
            
            items.forEach((i: any) => {
                const numStr = String(i.item_number || i.itemNumber || '');
                if (numStr) {
                    existingNumbers.push(numStr);
                    const num = parseInt(numStr);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                }
                existingCount += parseInt(i.quantity) || 1;
            });
            
            setState(prev => ({ ...prev, itemNumber: String(maxNum + 1), existingCount, existingNumbers }));
        };
        fetchNextNum();
    }, [db, state.vendorId, itemData.workbook, isOpen]);

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
        setState(prev => ({ ...prev, mediaList: [...prev.mediaList, ...newMedia] }));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeMedia = (idx: number) => {
        setState(prev => ({ ...prev, mediaList: prev.mediaList.filter((_, i) => i !== idx) }));
    };

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
                    await new Promise(r => setTimeout(r, 200));
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
            const finalItemId = `${state.vendorId}-${state.itemNumber.padStart(3, '0')}`;
            const payload: any = {
                id: crypto.randomUUID(),
                item_id: finalItemId,
                vendor_id: state.vendorId,
                item_number: parseInt(state.itemNumber),
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
                pay_req: state.payReq || null,
                media_urls: uploadedUrls.join(','),
                created_by: user?.name || user?.email,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                workbook: itemData.workbook || 'v326',
            };
            setSavingProgress(95);
            await supabase.from('inventory').insert(payload);
            if (db) await db.inventory.insert(payload);
            setSavingProgress(100);
            toast.success('Registry Updated', { id: tid });
            return true;
        } catch (err: any) {
            toast.error(err.message || 'Upload Failed', { id: tid });
            return false;
        } finally {
            setTimeout(() => { setSaving(false); setSavingProgress(0); }, 500);
        }
    };

    const isDuplicate = state.existingNumbers.includes(state.itemNumber);

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[6000] flex items-center justify-center p-0 md:p-8 animate-in fade-in duration-1000 overflow-hidden">
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[200px]" onClick={() => setIsOpen(false)} />
            
            <div className="relative w-full h-full md:w-[98vw] md:h-[98vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-1000 bg-black/10 border-none rounded-none md:rounded-[60px] shadow-2xl backdrop-blur-3xl">
                
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
                                        <button key={v} onClick={() => setItemData(prev => ({ ...prev, workbook: v as any }))}
                                            className={`text-3xl md:text-4xl font-black uppercase tracking-[0.2em] transition-all hover:scale-110 ${itemData.workbook === v ? 'text-(--main-color)' : 'text-white opacity-20 hover:opacity-60'}`}>
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.8em] text-white">Onyx Intelligence Engine</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-16">
                        <div className="hidden md:flex flex-col text-right">
                            <span className="text-[9px] font-black text-white uppercase tracking-[0.5em] mb-1">Preview Artifact:</span>
                            <span className={`text-3xl font-black tracking-tighter uppercase tabular-nums ${isDuplicate ? 'text-red-500' : 'text-white'}`}>
                                {state.vendorId || '???'}-{state.itemNumber.padStart(3, '0')}
                            </span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="p-4 rounded-full text-white hover:scale-110 transition-all hover:rotate-90 duration-500">
                            <X size={40} strokeWidth={2} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-10 md:px-24 pb-48 animate-in slide-in-from-bottom-12 duration-1000">
                    <div className="max-w-[1600px] mx-auto space-y-8 md:space-y-12">
                        
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-white uppercase tracking-[0.5em]">Status Selector</label>
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { id: 'Available', icon: LayoutGrid },
                                    { id: 'Production', icon: Zap },
                                    { id: 'Acquisition', icon: Database }
                                ].map(s => (
                                    <button key={s.id} onClick={() => set('status', s.id as any)}
                                        className={`py-4 px-8 rounded-xl transition-all duration-700 flex items-center justify-center gap-4 ${state.status === s.id ? 'bg-white text-black shadow-2xl scale-105' : 'bg-black/20 border border-white/20 text-white hover:bg-white hover:text-black backdrop-blur-xl'}`}>
                                        <s.icon size={18} strokeWidth={3} className={state.status === s.id ? 'text-black' : 'text-(--main-color)'} />
                                        <span className="text-[11px] font-black uppercase tracking-[0.4em]">{s.id}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-10 gap-2 md:gap-4 items-start">
                            <div className="md:col-span-9 space-y-4">
                                <label className="text-[10px] font-black text-white uppercase tracking-[0.5em]">Vendors</label>
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
                                <SmartInput label="Index" field="itemNumber" value={state.itemNumber} icon={Hash} type="number" warning={isDuplicate} className="border-b-0" onSet={set} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-white uppercase tracking-[0.5em]">Evidence Hub</label>
                            <div className="flex flex-col gap-4">
                                <div onClick={() => fileInputRef.current?.click()} className="w-full h-32 rounded-3xl border-2 border-dashed border-white hover:border-(--main-color) hover:bg-(--main-color) flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group shadow-2xl">
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} accept="image/*,video/*" multiple />
                                    <Upload size={32} strokeWidth={4} className="text-white group-hover:text-black transition-all duration-700" />
                                    <span className="text-[10px] font-black text-white group-hover:text-black uppercase tracking-[0.8em]">Attach Evidence</span>
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    {state.mediaList.map((m, i) => (
                                        <div key={i} className="w-24 h-24 rounded-2xl overflow-hidden relative group/media border border-white/20 bg-black shadow-2xl">
                                            {m.type === 'video' ? (
                                                <div className="w-full h-full flex items-center justify-center"><Video size={20} className="text-white" /></div>
                                            ) : (
                                                <img src={m.preview || ''} className="w-full h-full object-cover opacity-100 transition-all duration-700" />
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); removeMedia(i); }} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-all scale-75 group-hover/media:scale-100 shadow-2xl">
                                                <X size={12} strokeWidth={4} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 4. SHAPE & TYPE (REVERTED TO INDIVIDUAL) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                            <SmartInput label="Shape" field="shape" value={state.shape} icon={Box} fieldSuggestions={suggestions.shape} onSet={set} />
                            <SmartInput label="Type" field="type" value={state.type} icon={Database} fieldSuggestions={suggestions.type} onSet={set} />
                        </div>

                        {/* 5. COLOR & MATERIAL (REVERTED TO INDIVIDUAL) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                            <SmartInput label="Color" field="color" value={state.color} icon={Info} fieldSuggestions={suggestions.color} onSet={set} />
                            <SmartInput label="Material" field="material" value={state.material} icon={Sparkles} fieldSuggestions={suggestions.material} onSet={set} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                            <SmartInput label="Quantity" field="quantity" value={state.quantity} icon={Hash} type="number" onSet={set} fieldSuggestions={suggestions.quantity} />
                            <div className="space-y-4">
                                <SmartInput label="ACQ MXN" field="price" value={state.price} icon={Hash} type="number" fieldSuggestions={suggestions.price} onSet={set} />
                                {state.price && exchangeRate && (
                                    <div className="flex justify-between items-baseline animate-in slide-in-from-right-8 duration-700">
                                        <span className="text-[9px] font-black text-white uppercase tracking-[0.4em]">USD Protocol</span>
                                        <span className="text-3xl font-black text-(--main-color) tracking-tighter tabular-nums">{formatCurrency(parseFloat(state.price) / exchangeRate, 'USD')}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                            <SmartInput label="Width (CM)" field="widthCm" value={state.widthCm} icon={Ruler} type="number" fieldSuggestions={suggestions.widthCm} onSet={set} />
                            <SmartInput label="Height (CM)" field="heightCm" value={state.heightCm} icon={Ruler} type="number" fieldSuggestions={suggestions.heightCm} onSet={set} />
                            <SmartInput label="Depth (CM)" field="lengthCm" value={state.lengthCm} icon={Ruler} type="number" fieldSuggestions={suggestions.lengthCm} onSet={set} />
                            <SmartInput label="Mass (KG)" field="weightKg" value={state.weightKg} icon={Dna} type="number" fieldSuggestions={suggestions.weightKg} onSet={set} />
                        </div>

                        <div className="py-2 border-b border-white/20 hover:border-white transition-all duration-700">
                            <label className="text-[9px] font-black text-white uppercase tracking-[0.4em] block mb-1">Notes</label>
                            <input 
                                type="text"
                                value={state.notes} 
                                onChange={e => set('notes', e.target.value)}
                                placeholder="TECHNICAL SPECIFICATIONS..."
                                className="bg-transparent border-none text-xl font-black text-white outline-none placeholder:text-white uppercase w-full transition-all tracking-widest" 
                            />
                        </div>
                    </div>
                </div>

                <div className="px-10 py-10 md:px-24 md:py-12 mt-auto bg-black/10 flex flex-col md:flex-row items-center justify-end gap-12 shrink-0 border-t border-white/10 backdrop-blur-3xl">
                    <div className="flex gap-10 w-full md:w-auto">
                        <button onClick={() => setIsOpen(false)} className="px-10 py-4 text-white hover:underline text-[11px] font-black uppercase tracking-[0.5em] transition-all">
                            Discard
                        </button>
                        <button onClick={doSave} disabled={saving} className="flex-1 md:flex-none px-16 py-5 bg-(--main-color) text-black rounded-xl text-[13px] font-black uppercase tracking-[0.4em] hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-4">
                            {saving ? 'Syncing...' : 'Sync Registry'}
                            {!saving && <ArrowRight size={22} strokeWidth={5} />}
                        </button>
                    </div>
                </div>
            </div>

            {saving && (
                <div className="absolute inset-0 z-[7000] flex items-center justify-center bg-black/95 backdrop-blur-3xl animate-in fade-in duration-700">
                    <div className="w-[600px] p-24 flex flex-col items-center gap-16 relative">
                        <div className="w-24 h-24 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_100px_rgba(var(--main-color-rgb),0.5)]">
                            <CloudUpload size={48} strokeWidth={4} className="animate-bounce" />
                        </div>
                        <div className="w-full space-y-10">
                            <div className="flex justify-between items-end">
                                <span className="text-[14px] font-black text-white uppercase tracking-[0.6em]">Master Sync</span>
                                <span className="text-7xl font-black text-(--main-color) tracking-tighter tabular-nums">{savingProgress}%</span>
                            </div>
                            <div className="h-2 w-full bg-white rounded-full overflow-hidden">
                                <div className="h-full bg-(--main-color) transition-all duration-1000 ease-out shadow-[0_0_40px_rgba(var(--main-color-rgb),0.6)]" style={{ width: `${savingProgress}%` }} />
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
