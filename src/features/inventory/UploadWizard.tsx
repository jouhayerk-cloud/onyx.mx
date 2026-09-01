import React, { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import toast from 'react-hot-toast';
import { useFormDraft } from '../../lib/useFormDraft';
import { buildAttributeSuggestions } from '../../lib/attributeSuggestions';
import { 
    userAtom, 
    isUploadWizardOpenAtom, 
    inventoryAtom, 
    exchangeRateAtom, 
    isDummyModeAtom, 
    sidebarStateAtom, 
    uploadItemDataAtom,
    activeViewAtom,
    uploadTabAtom,
    workbookVersionAtom,
    InventoryVersionAtom,
    isInventoryViewSliderOpenAtom,
    isInventoryFiltersPanelOpenAtom,
    isInventorySearchOpenAtom,
    isPaymentsSearchOpenAtom,
    isPaymentFiltersOpenAtom,
    isPaymentActionPanelOpenAtom,
    isPaymentQueueOpenAtom,
    isPaymentUpcomingOpenAtom,
    isPaymentPendingBarOpenAtom,
    truckShowSaveDraftAtom,
    truckShowOpenDraftAtom,
    truckShowExportModalAtom,
    truckShowReadyWizardAtom,
    truckShowPanelsAtom
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
    normalizeInventoryData,
    getCleanImageUrl,
    isVideoFile,
    collectAllImages
} from '../../lib/utils';
import { 
    X, ArrowRight, Video, Plus, Database, Store, Hash, 
    Dna, Ruler, Upload, CheckCircle2, Trash2, ChevronLeft, 
    ChevronRight, CloudUpload, Check, Box, Info, Sparkles,
    FileSpreadsheet, Zap, Scan, LayoutGrid, FileText, Camera,
    BookOpen, AlertTriangle, RefreshCw, ChevronDown, Save
} from 'lucide-react';
import { compressAndTrimVideo } from '../../lib/videoCompressor';
import { tr } from '../../lib/i18n';

type EntryStatus = 'Available' | 'Production' | 'Acquisition';
type MediaType = 'Product' | 'Lot';

interface WizardMedia {
    file: File | null;
    preview: string | null;
    type: 'image' | 'video';
    originalUrl?: string;
}

/**
 * True once the entry has something worth keeping. Auto-populated fields (vendor,
 * index, status, quantity) are ignored — they are set for the user, so counting them
 * would make every freshly opened wizard look like a draft in progress.
 */
const hasEntryContent = (s: Partial<WizardState> | null): boolean =>
    Boolean(s && (s.shape || s.material || s.color || s.type || s.price || s.notes));

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
    status: 'Acquisition',
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

    const isCollapsed = !isFocused && value && value !== '0' && value !== '';
    const sizeClasses = className.includes('compact') ? 'text-2xl md:text-3xl' : 'text-4xl md:text-5xl';
    const containerHeight = className.includes('compact') ? 'h-10 md:h-12' : 'h-14 md:h-16';

    if (isCollapsed) {
        const isIndex = label.includes('Index');
        return (
            <div 
                onClick={() => setIsFocused(true)}
                className={`group flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] transition-all cursor-pointer animate-in fade-in zoom-in-95 duration-300 ${isIndex ? 'scale-90 origin-left' : ''} ${className}`}
            >
                {Icon && <Icon size={isIndex ? 8 : 10} className="text-(--main-color) opacity-50" strokeWidth={3} />}
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20">{label}</span>
                <span className={`${isIndex ? 'text-xs' : 'text-sm'} font-black uppercase tracking-tight text-white/80 group-hover:text-white transition-colors`}>{value}</span>
            </div>
        );
    }

    return (
        <div className={`group relative flex flex-col py-2 border-b transition-all duration-300 ease-out ${warning ? 'border-red-500' : 'border-white/10 hover:border-white/40'} ${className}`}>
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
            
            <div className={`relative overflow-hidden ${containerHeight} flex items-center`}>
                {!value && !isFocused && (
                    <span className={`absolute inset-0 flex items-center ${sizeClasses} font-black uppercase tracking-tighter text-white/15 select-none pointer-events-none italic animate-in fade-in duration-300`}>
                        {activeGhostTag}
                    </span>
                )}
                
                <input 
                    ref={inputRef}
                    autoFocus={isFocused}
                    type={type}
                    value={value}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()} 
                    placeholder={!activeGhostTag && !isFocused ? "NONE" : ""}
                    className={`
                        bg-transparent border-none outline-none w-full ${sizeClasses} font-black uppercase tracking-tighter transition-all duration-200 relative z-10
                        ${warning ? 'text-red-500' : (value || isFocused ? 'text-white' : 'text-transparent')}
                    `}
                />
            </div>

            {isFocused && (
                <div className="absolute top-full left-0 right-0 z-[100] mt-2 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 duration-200 bg-black/90 p-4 rounded-2xl backdrop-blur-3xl border border-white/10 shadow-2xl">
                    {filtered.length > 0 ? (
                        filtered.map((tag: string) => (
                            <button key={tag} onClick={() => { onSet(field, tag); setIsFocused(false); }}
                                className={`
                                    text-[10px] font-black tracking-[0.2em] uppercase transition-all px-3 py-1.5 rounded-lg border
                                    ${value === tag 
                                        ? 'bg-white text-black border-white scale-105' 
                                        : 'bg-white/5 text-white/60 border-white/10 hover:border-white hover:bg-white hover:text-black active:scale-95'
                                    }
                                `}>
                                {tag}
                            </button>
                        ))
                    ) : (
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em] p-2">{tr("No Suggestions Found")}</span>
                    )}
                </div>
            )}
        </div>
    );
});

export const UploadWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isUploadWizardOpenAtom);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const setActiveView = useSetAtom(activeViewAtom);
    const setUploadTab = useSetAtom(uploadTabAtom);
    
    // Auto-hide toolbar bars when wizard is open
    const setIsViewSliderOpen = useSetAtom(isInventoryViewSliderOpenAtom);
    const setIsFiltersOpen = useSetAtom(isInventoryFiltersPanelOpenAtom);
    const setIsSearchOpen = useSetAtom(isInventorySearchOpenAtom);
    
    // Finance/Payment bars
    const setIsPaySearchOpen = useSetAtom(isPaymentsSearchOpenAtom);
    const setIsPayFiltersOpen = useSetAtom(isPaymentFiltersOpenAtom);
    const setIsPayActionOpen = useSetAtom(isPaymentActionPanelOpenAtom);
    const setIsPayQueueOpen = useSetAtom(isPaymentQueueOpenAtom);
    const setIsPayUpcomingOpen = useSetAtom(isPaymentUpcomingOpenAtom);
    const setIsPayPendingOpen = useSetAtom(isPaymentPendingBarOpenAtom);

    // Trucking panels
    const setTrkSave = useSetAtom(truckShowSaveDraftAtom);
    const setTrkOpen = useSetAtom(truckShowOpenDraftAtom);
    const setTrkExport = useSetAtom(truckShowExportModalAtom);
    const setTrkReady = useSetAtom(truckShowReadyWizardAtom);
    const setTrkPanels = useSetAtom(truckShowPanelsAtom);

    useEffect(() => {
        if (isOpen) {
            // Inventory
            setIsViewSliderOpen(false);
            setIsFiltersOpen(false);
            setIsSearchOpen(false);
            
            // Finance
            setIsPaySearchOpen(false);
            setIsPayFiltersOpen(false);
            setIsPayActionOpen(false);
            setIsPayQueueOpen(false);
            setIsPayUpcomingOpen(false);
            setIsPayPendingOpen(false);

            // Trucking
            setTrkSave(false);
            setTrkOpen(false);
            setTrkExport(false);
            setTrkReady(false);
            setTrkPanels(false);

            // Force scroll to top of all potential containers
            const scrollElements = [
                document.querySelector('.app-content'),
                document.documentElement,
                document.body
            ];
            
            scrollElements.forEach(el => {
                if (el) {
                    el.scrollTo({ top: 0, behavior: 'auto' });
                    if ('scrollTop' in el) el.scrollTop = 0;
                }
            });
            
            // Fallback for window
            window.scrollTo({ top: 0, behavior: 'auto' });
        }
    }, [
        isOpen, 
        itemData,
        setIsViewSliderOpen, setIsFiltersOpen, setIsSearchOpen,
        setIsPaySearchOpen, setIsPayFiltersOpen, setIsPayActionOpen, setIsPayQueueOpen, setIsPayUpcomingOpen, setIsPayPendingOpen,
        setTrkSave, setTrkOpen, setTrkExport, setTrkReady, setTrkPanels
    ]);

    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    
    const [saving, setSaving] = useState(false);
    const [savingProgress, setSavingProgress] = useState(0);
    const [uploadProgressMsg, setUploadProgressMsg] = useState('');
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [suggestionRows, setSuggestionRows] = useState<any[]>([]);

    // Only the typed fields are drafted. mediaList holds base64 data URLs (far too
    // large for IndexedDB drafts) and existingCount/existingNumbers are re-derived
    // from the database on open, so none of them belong in a draft.
    const draftableState = useMemo(() => {
        const { mediaList, existingCount, existingNumbers, ...rest } = state;
        return rest;
    }, [state]);

    // Drafts apply to new entries only — editing an existing item must not resurrect
    // a half-typed entry over the record being edited.
    const isNewEntry = !itemData?.id;
    const { restored: restoredDraft, ready: draftReady, clear: clearDraft } = useFormDraft(
        'inventory-add-entry',
        draftableState,
        {
            ownerKey: user?.id ?? user?.name ?? null,
            enabled: isOpen && isNewEntry && hasEntryContent(draftableState)
        }
    );

    // Offer the draft back when the wizard opens on a fresh entry.
    useEffect(() => {
        if (!isOpen || !isNewEntry || !draftReady) return;
        if (!restoredDraft || !hasEntryContent(restoredDraft)) return;
        setState(prev => ({ ...prev, ...restoredDraft }));
        toast.success(tr("Restored your unsaved entry"));
    }, [isOpen, draftReady]);
    const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
    const [globalSuggestionIndex, setGlobalSuggestionIndex] = useState(0);
    const [isStatusExpanded, setIsStatusExpanded] = useState(false);

    // PULL TO REFRESH STATE
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const touchStartY = useRef(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && itemData && Object.keys(itemData).length > 0) {
            // Load existing item data for editing
            const mediaList: WizardMedia[] = [];
            const urls = collectAllImages(itemData);
            
            urls.forEach(url => {
                mediaList.push({
                    file: null,
                    preview: url,
                    type: isVideoFile(url) ? 'video' : 'image',
                    originalUrl: url
                });
            });

            setState({
                status: (itemData.status as EntryStatus) || 'Acquisition',
                vendorId: itemData.vendorId || itemData.vendor_id || '',
                itemNumber: String(itemData.itemNumber || itemData.item_number || ''),
                quantity: String(itemData.quantity || '1'),
                mediaList,
                mediaType: 'Product',
                shape: itemData.shape || '',
                material: itemData.material || '',
                color: itemData.color || '',
                type: itemData.shortDescription || itemData.short_description || '',
                weightKg: String(itemData.weightKg || itemData.weight_kg || ''),
                widthCm: String(itemData.widthCm || itemData.width_cm || ''),
                heightCm: String(itemData.heightCm || itemData.height_cm || ''),
                lengthCm: String(itemData.lengthCm || itemData.length_cm || ''),
                price: String(itemData.price || itemData.price_mxn || ''),
                notes: itemData.description || '',
                existingCount: 0,
                existingNumbers: [],
                payReq: itemData.payReq || itemData.pay_req || ''
            });
        } else if (isOpen) {
            // Reset to initial state for new entry
            setState(prev => ({
                ...INITIAL_STATE,
                vendorId: user?.role === 'Vendor' ? (user.name || '') : prev.vendorId,
            }));
        }
    }, [isOpen, itemData, user]);

    useEffect(() => {
        // Disabled to prevent state wipe on window focus / re-renders
        // if (!isOpen) {
        //     setItemData({});
        // }
    }, [isOpen, setItemData]);

    // Load the catalogue once per open; the cascade below re-derives from it locally.
    useEffect(() => {
        if (!db || !isOpen) return;
        let cancelled = false;

        (async () => {
            try {
                const items = await db.inventory.find().exec();
                if (!cancelled) setSuggestionRows(items.map((i: any) => i.toJSON?.() ?? i));
            } catch (e) { console.error(e); }
        })();

        return () => { cancelled = true; };
    }, [db, isOpen]);

    // Shape / Type / Color / Material cross-filter each other: choosing shape
    // "squared" narrows Type to the types recorded against squared items, and
    // choosing type "table lamp" narrows Shape to the shapes table lamps come in.
    // The measurement fields stay flat — they aren't categorical.
    useEffect(() => {
        if (suggestionRows.length === 0) return;

        const u = (cols: string[]) => Array.from(new Set(suggestionRows.map((i: any) => {
            for (const c of cols) if (i[c]) return String(i[c]);
            return null;
        }).filter(Boolean))).sort().slice(0, 32) as string[];

        const cascaded = buildAttributeSuggestions(suggestionRows, {
            shape: state.shape,
            material: state.material,
            color: state.color,
            type: state.type
        });

        setSuggestions({
            ...cascaded,
            shape: cascaded.shape?.slice(0, 32) ?? [],
            material: cascaded.material?.slice(0, 32) ?? [],
            color: cascaded.color?.slice(0, 32) ?? [],
            type: cascaded.type?.slice(0, 32) ?? [],
            weightKg: u(['weight_kg', 'weightKg']),
            widthCm: u(['width_cm', 'widthCm']),
            heightCm: u(['height_cm', 'heightCm']),
            lengthCm: u(['length_cm', 'lengthCm']),
            price: u(['price_mxn', 'priceMxn', 'price']),
            quantity: u(['quantity'])
        } as any);
    }, [suggestionRows, state.shape, state.material, state.color, state.type]);

    useEffect(() => {
        // Only fetch next number if it's a NEW entry (no itemData.id)
        if (!db || !state.vendorId || !isOpen || itemData?.id) return;
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
    }, [db, state.vendorId, itemData.workbook, isOpen, itemData?.id]);

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
        toast.success(tr("Suggestions Refreshed"), { icon: '🔄', duration: 1000 });
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

    const handleUrlAdd = () => {
        const url = window.prompt('Paste Media URL:');
        if (!url) return;
        
        setState(prev => ({
            ...prev,
            mediaList: [...prev.mediaList, {
                file: null,
                preview: url,
                type: isVideoFile(url) ? 'video' : 'image',
                originalUrl: url
            }]
        }));
    };

    const removeMedia = useCallback((idx: number) => {
        setState(prev => ({ ...prev, mediaList: prev.mediaList.filter((_, i) => i !== idx) }));
    }, []);

    const doSave = async (): Promise<boolean> => {
        if (!state.vendorId || !state.itemNumber) { toast.error(tr("Missing Vendor or Index")); return false; }
        
        // Only warn about duplicates for NEW entries
        if (!itemData?.id && state.existingNumbers.includes(state.itemNumber)) {
            const proceed = window.confirm(`WARNING: Index ${state.itemNumber} already exists for Vendor ${state.vendorId}. Continue?`);
            if (!proceed) return false;
        }
        
        setSaving(true);
        setSavingProgress(10);
        const tid = toast.loading(itemData?.id ? 'Updating Registry...' : 'Syncing Registry...');
        
        console.log('[UploadWizard] Starting save operation', { vendorId: state.vendorId, itemNumber: state.itemNumber, isEdit: !!itemData?.id });

        try {
            if (isDummyMode) {
                for (let i = 20; i <= 100; i += 20) {
                    await new Promise(r => setTimeout(r, 150));
                    setSavingProgress(i);
                }
                toast.success(tr("Artifact Synced (Demo)"), { id: tid });
                return true;
            }

            // --- MEDIA UPLOAD ---
            let uploadedUrls: string[] = [];
            try {
                if (state.mediaList.length > 0) {
                    for (let i = 0; i < state.mediaList.length; i++) {
                        const m = state.mediaList[i];
                        if (m.file) {
                            let fileToUpload = m.file;
                            if (fileToUpload.type.startsWith('video/')) {
                                setUploadProgressMsg(`Loading compressor... (first time only)`);
                                fileToUpload = await compressAndTrimVideo(fileToUpload, (p) => {
                                    setUploadProgressMsg(`Compressing video... ${p}%`);
                                });
                                setUploadProgressMsg('Uploading optimized video...');
                            }
                            
                            const res = await handleFileUpload(fileToUpload, user);
                            if (res) uploadedUrls.push(`${res.thumbnailUrl}${state.mediaType ? `&tag=${state.mediaType}` : ''}`);
                        } else if (m.originalUrl) {
                            uploadedUrls.push(m.originalUrl);
                        }
                        setSavingProgress(Math.round(10 + ((i + 1) / state.mediaList.length) * 70));
                    }
                }
            } catch (mediaErr) {
                console.error('[UploadWizard] Media upload failed:', mediaErr);
                toast.error(tr("Media upload failed, but attempting to save metadata..."), { id: tid });
            }

            // --- CODE CALCULATION ---
            let calculated: any = {};
            try {
                calculated = calculateCodesAndPrices(
                    {
                        price: parseFloat(state.price) || 0,
                        itemId: `${state.vendorId}-${String(state.itemNumber).padStart(3, '0')}`,
                        // The row's real barcode must be passed through. Without it
                        // normalizeInventoryData's fallback chain (book_barcode -> tag_id
                        // -> item_id) resolves to itemId, so every edit wrote the workbook
                        // id back as the barcode: AN3261OOOH became AN-001.
                        //
                        // Passing it also preserves it. calculateCodesAndPrices keeps a
                        // valid stored barcode and only recomputes a missing or malformed
                        // one, which matters because this payload overwrites book_barcode
                        // unconditionally — the database trigger deliberately never
                        // recomputes an existing barcode, since it is printed on a physical
                        // label, and the client must not undo that protection.
                        book_barcode: itemData.book_barcode || itemData.bookBarcode,
                        workbook: itemData.workbook || 'v326',
                        itemNumber: state.itemNumber || '1',
                        vendorId: state.vendorId
                    },
                    exchangeRate,
                    'v326'
                );
            } catch (calcErr) {
                console.error('[UploadWizard] Calculation Error:', calcErr);
                throw new Error('Logic failure during item code generation.');
            }

            // --- PAYLOAD CONSTRUCTION ---
            const payload = {
                id: itemData.id || crypto.randomUUID(),
                item_id: `${state.vendorId}-${String(state.itemNumber).padStart(3, '0')}`,
                book_barcode: calculated.bookBarcode || '',
                book_aq_code: calculated.bookAqCode || '',
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
                // Creation stamps belong to the original entry only. This is an upsert
                // that also serves the inventory edit popup, so setting them
                // unconditionally rewrote the creator and creation date on every edit.
                // `timestamp` is the creation date here — the table has no created_at.
                ...(itemData?.id ? {} : {
                    created_by: user?.name || user?.email,
                    timestamp: new Date().toISOString(),
                }),
                updated_at: new Date().toISOString(),
            };
            
            console.log('[UploadWizard] Construction complete, sending to Supabase...', payload.item_id);
            setSavingProgress(95);

            // 1. Supabase UPSERT
            const { data: sbData, error: sbError } = await supabase.from('inventory').upsert(payload).select().single();
            if (sbError) {
                console.error('[UploadWizard] Supabase Error:', sbError);
                throw new Error(`Cloud Sync Failed: ${sbError.message}`);
            }

            // 2. RxDB UPSERT
            if (db) {
                try {
                    await db.inventory.upsert(payload);
                } catch (rxError) {
                    console.warn('[UploadWizard] Local DB skip:', rxError);
                }
            }

            setInventoryVersion(v => v + 1);

            // Committed — drop the in-progress copy so this item isn't offered for
            // restore. Attributes the wizard carries forward for the next entry are
            // re-drafted by the autosave below.
            await clearDraft();

            const bookStr = String(itemData.workbook || '326').replace(/\D/g, '');
            toast.success(`${state.vendorId}${bookStr}${state.itemNumber} saved`, { id: tid });

            if (itemData?.id) {
                setIsOpen(false);
            } else {
                const nextNum = (parseInt(state.itemNumber) || 0) + 1;
                setState(prev => ({ 
                    ...prev, 
                    itemNumber: String(nextNum),
                    mediaList: [] 
                }));
                setItemData({}); 
            }
            return true;
        } catch (err: any) {
            console.error('[UploadWizard] CRITICAL FAILURE:', err);
            toast.error(err.message || 'Artifact Synchronization Failed', { id: tid });
            return false;
        } finally {
            setTimeout(() => { setSaving(false); setSavingProgress(0); setUploadProgressMsg(''); }, 300);
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
            className="entry-wizard absolute inset-0 z-[400] flex justify-center items-start pt-[128px] animate-in fade-in duration-500 overflow-hidden"
            onClick={() => setIsOpen(false)}
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
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white mt-4">{tr("Pull to Shuffle Suggestions")}</span>
                </div>
                
                <div 
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto no-scrollbar px-6 md:px-12 pb-48 pt-6 md:pt-10 animate-in slide-in-from-bottom-4 duration-300"
                    onClick={() => setGlobalSuggestionIndex(prev => prev + 1)}
                >
                    <div className="max-w-[1200px] mx-auto space-y-8 md:space-y-12" onClick={(e) => e.stopPropagation()}>
                        
                        {/* Unified Protocol Header */}
                        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-10 border-b border-white/5">
                            <div className="flex flex-col gap-6">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-12">
                                    <div className="flex items-center gap-4">
                                        <div className="w-2 h-2 rounded-full bg-(--main-color) animate-pulse" />
                                        <h1 className="text-[20px] font-black uppercase tracking-[0.6em] text-white/40 leading-none">
                                            {itemData?.id ? 'Edit Entry' : 'Add Entry'}
                                        </h1>
                                    </div>
                                    
                                    <div className="flex items-center gap-10 shrink-0">
                                        {/* Create Item is the only entry form for 826, so picking
                                            Book 826 here hands off to it instead of continuing in
                                            this wizard. 326/825 stay in place. */}
                                        {['v826', 'v326', 'v825'].map(v => (
                                            <button key={v} onClick={(e) => {
                                                e.stopPropagation();
                                                if (v === 'v826') {
                                                    // Hand off with a clean slate. If this wizard was
                                                    // opened from Create Item, that view restores its
                                                    // own stashed state on close.
                                                    setItemData({});
                                                    setIsOpen(false);
                                                    setUploadTab('entry');
                                                    setActiveView('upload');
                                                    toast(tr("Book 826 entries are created in Create Item"), { icon: '→' });
                                                    return;
                                                }
                                                setItemData(prev => ({ ...prev, workbook: v as any }));
                                            }}
                                                className={`text-3xl font-black uppercase tracking-tighter transition-all relative group whitespace-nowrap ${itemData.workbook === v ? 'text-(--main-color)' : 'text-white/20 hover:text-white/40'}`}>
                                                {tr("BOOK")} {v.slice(1)}
                                                {itemData.workbook === v && (
                                                    <div className="absolute -bottom-2 left-0 right-0 h-1 bg-(--main-color) rounded-full animate-in zoom-in duration-300 shadow-[0_0_20px_rgba(var(--main-color-rgb),0.6)]" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 whitespace-nowrap opacity-50">
                                    <span className="text-[8px] font-black uppercase tracking-[0.8em] text-white/40">{tr("Onyx Intelligence Engine")}</span>
                                    <button onClick={(e) => { e.stopPropagation(); triggerRefresh(); }} className={`p-1 rounded-full hover:bg-white/5 text-white/10 hover:text-(--main-color) transition-all duration-500 ${isRefreshing ? 'animate-spin text-(--main-color)' : ''}`}>
                                        <RefreshCw size={8} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 self-end lg:self-auto">
                                <div className="flex items-center gap-6 px-6 py-3 bg-white/[0.03] rounded-3xl border border-white/10 backdrop-blur-xl">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">{tr("Preview Artifact")}</span>
                                        <span className={`text-2xl font-black tracking-tighter uppercase tabular-nums transition-colors duration-200 ${isDuplicate ? 'text-red-500' : 'text-white'}`}>
                                            {state.vendorId || '???'}-{String(state.itemNumber).padStart(3, '0')}
                                        </span>
                                    </div>
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20">
                                        <FileText size={24} />
                                    </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5">
                                    <X size={32} strokeWidth={2} />
                                </button>
                            </div>
                        </div>

                        {/* Core Metadata Stack - Status, Vendor, Index */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
                            {/* Status Selection - Dynamic Panel */}
                            <div className="lg:col-span-4 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">{tr("Protocol Status")}</label>
                                {!isStatusExpanded && state.status ? (
                                    <button 
                                        onClick={() => setIsStatusExpanded(true)}
                                        className="w-full flex items-center justify-between p-5 rounded-3xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-(--main-color) transition-all group animate-in zoom-in-95 duration-300"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-(--main-color)">
                                                {state.status === 'Available' ? <LayoutGrid size={24} /> : state.status === 'Production' ? <Zap size={24} /> : <Database size={24} />}
                                            </div>
                                            <div className="flex flex-col items-start">
                                                <span className="text-xl font-black uppercase tracking-tight text-white">{state.status}</span>
                                            </div>
                                        </div>
                                        <ChevronDown size={20} className="text-white/20 group-hover:text-white transition-colors" />
                                    </button>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2 animate-in slide-in-from-top-2 duration-300">
                                        {[
                                            { id: 'Available', icon: LayoutGrid },
                                            { id: 'Production', icon: Zap },
                                            { id: 'Acquisition', icon: Database }
                                        ].map(s => (
                                            <button key={s.id} onClick={() => { set('status', s.id as any); setIsStatusExpanded(false); }}
                                                className={`flex flex-col items-center p-4 rounded-2xl transition-all duration-200 gap-3 ${state.status === s.id ? 'bg-white text-black shadow-2xl scale-102' : 'bg-black/20 border border-white/5 text-white/40 hover:bg-white/5 hover:text-white backdrop-blur-xl'}`}>
                                                <s.icon size={20} strokeWidth={3} className={state.status === s.id ? 'text-black' : 'text-(--main-color)'} />
                                                <span className="text-[9px] font-black uppercase tracking-widest">{s.id}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Vendors Panel */}
                            <div className="lg:col-span-5 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">{tr("Active Vendor")}</label>
                                {state.vendorId ? (
                                    <button 
                                        onClick={() => set('vendorId', '')}
                                        className="h-20 w-full px-8 rounded-3xl flex items-center justify-between text-2xl font-black shadow-xl border border-white/20 animate-in zoom-in-95 duration-300 group relative overflow-hidden"
                                        style={{ backgroundColor: (vendors as any)[state.vendorId]?.color, color: getTextColorForBg((vendors as any)[state.vendorId]?.color) }}
                                    >
                                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
                                        <span>{state.vendorId}</span>
                                        <RefreshCw size={24} className="opacity-40 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-500" />
                                    </button>
                                ) : (
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 animate-in slide-in-from-right-4 duration-500">
                                        {Object.entries(vendors).map(([id, v]: [string, any]) => (
                                            <button key={id} onClick={() => set('vendorId', id)}
                                                className="shrink-0 h-20 px-8 rounded-3xl flex items-center justify-center text-lg font-black transition-all hover:scale-105 active:scale-95 shadow-lg border border-white/10 hover:border-white/40"
                                                style={{ backgroundColor: v.color, color: getTextColorForBg(v.color) }}>
                                                {id}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Index Selection - LARGE */}
                            <div className="lg:col-span-3 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">{tr("Index # Protocol")}</label>
                                <div className="h-20 flex items-center bg-white/[0.03] border border-white/10 rounded-3xl px-6 hover:border-(--main-color) transition-all">
                                    <SmartInput label={tr("Index #")} field="itemNumber" value={state.itemNumber} icon={Hash} type="number" warning={isDuplicate} className="border-b-0 py-0 w-full" onSet={set} suggestionIndex={globalSuggestionIndex} />
                                </div>
                            </div>
                        </div>

                        {/* Evidence Hub - Collapsible */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">{tr("Evidence")}</label>
                                <button onClick={(e) => { e.preventDefault(); handleUrlAdd(); }} className="text-[9px] font-black text-(--main-color) uppercase tracking-[0.4em] hover:text-white transition-all">
                                    {tr("+ ADD URL")}
                                </button>
                            </div>
                            <div className="flex flex-col gap-3">
                                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} accept="image/*,video/*" multiple />
                                {state.mediaList.length === 0 ? (
                                    <div onClick={() => fileInputRef.current?.click()} className="w-full h-24 rounded-2xl border-2 border-dashed border-white/10 hover:border-(--main-color) hover:bg-(--main-color)/5 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group">
                                        
                                        <Upload size={20} strokeWidth={4} className="text-white/20 group-hover:text-(--main-color) transition-all" />
                                        <span className="text-[8px] font-black text-white/20 group-hover:text-(--main-color) uppercase tracking-[0.5em]">{tr("Capture Evidence")}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-3 p-3 bg-black/20 rounded-2xl border border-white/5 animate-in fade-in duration-300">
                                        <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center hover:border-(--main-color) hover:text-(--main-color) transition-all">
                                            <Plus size={20} />
                                        </button>
                                        {state.mediaList.map((m, i) => (
                                            <div key={i} className="w-20 h-20 rounded-xl overflow-hidden relative group/media border border-white/10 bg-black">
                                                {m.type === 'video' ? (
                                                    <video src={m.preview || ''} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                                                ) : (
                                                    <img src={m.preview || ''} className="w-full h-full object-cover" />
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); removeMedia(i); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-all scale-75 group-hover/media:scale-100">
                                                    <X size={10} strokeWidth={4} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                            <SmartInput label={tr("Shape")} field="shape" value={state.shape} icon={Box} fieldSuggestions={suggestions.shape} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label={tr("Type")} field="type" value={state.type} icon={Database} fieldSuggestions={suggestions.type} onSet={set} suggestionIndex={globalSuggestionIndex} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                            <SmartInput label={tr("Color")} field="color" value={state.color} icon={Info} fieldSuggestions={suggestions.color} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label={tr("Material")} field="material" value={state.material} icon={Sparkles} fieldSuggestions={suggestions.material} onSet={set} suggestionIndex={globalSuggestionIndex} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                            <SmartInput label={tr("Qty")} field="quantity" value={state.quantity} icon={Hash} type="number" onSet={set} fieldSuggestions={suggestions.quantity} suggestionIndex={globalSuggestionIndex} />
                            <div className="flex flex-col gap-2">
                                <SmartInput label={tr("ACQ MXN")} field="price" value={state.price} icon={Hash} type="number" fieldSuggestions={suggestions.price} onSet={set} suggestionIndex={globalSuggestionIndex} />
                                {state.price && exchangeRate && (
                                    <div className="flex justify-between items-center px-4 py-2 bg-(--main-color)/5 rounded-xl border border-(--main-color)/10 animate-in slide-in-from-right-4 duration-200">
                                        <span className="text-[8px] font-black text-(--main-color) uppercase tracking-[0.3em]">{tr("USD Protocol")}</span>
                                        <span className="text-xl font-black text-white tracking-tighter tabular-nums">{formatCurrency(parseFloat(state.price) / exchangeRate, 'USD')}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <SmartInput label={tr("W (CM)")} field="widthCm" value={state.widthCm} icon={Ruler} type="number" fieldSuggestions={suggestions.widthCm} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label={tr("H (CM)")} field="heightCm" value={state.heightCm} icon={Ruler} type="number" fieldSuggestions={suggestions.heightCm} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label={tr("D (CM)")} field="lengthCm" value={state.lengthCm} icon={Ruler} type="number" fieldSuggestions={suggestions.lengthCm} onSet={set} suggestionIndex={globalSuggestionIndex} />
                            <SmartInput label="KG" field="weightKg" value={state.weightKg} icon={Dna} type="number" fieldSuggestions={suggestions.weightKg} onSet={set} suggestionIndex={globalSuggestionIndex} />
                        </div>

                        <div className="py-2 border-b border-white/5 hover:border-white/20 transition-all duration-200">
                            <label className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em] block mb-1">{tr("Detailed Specifications")}</label>
                            <input 
                                type="text"
                                value={state.notes} 
                                onChange={e => set('notes', e.target.value)}
                                onClick={(e) => e.stopPropagation()} 
                                placeholder={tr("ENTER TECHNICAL DETAILS...")}
                                className="bg-transparent border-none text-base font-black text-white outline-none placeholder:text-white/10 uppercase w-full transition-all tracking-widest" 
                            />
                        </div>
                    </div>
                </div>

                {/* FLOATING ACTION BUTTONS */}
                <div className="absolute bottom-10 left-0 right-0 px-10 md:px-24 flex justify-between items-center pointer-events-none z-[100]">
                    <button 
                        onClick={() => setIsOpen(false)} 
                        className="pointer-events-auto w-16 h-16 rounded-full bg-black/40 backdrop-blur-3xl border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 hover:scale-110 active:scale-90 transition-all group shadow-2xl"
                    >
                        <Trash2 size={24} className="group-hover:rotate-12 transition-transform" />
                    </button>

                    <button 
                        onClick={doSave} 
                        disabled={saving} 
                        className={`
                            pointer-events-auto w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl
                            ${saving 
                                ? 'bg-black/60 backdrop-blur-3xl border border-white/20' 
                                : 'bg-(--main-color)/20 backdrop-blur-3xl border border-(--main-color)/40 hover:bg-(--main-color) hover:scale-110 active:scale-95 group'
                            }
                        `}
                    >
                        {saving ? (
                            <RefreshCw size={32} strokeWidth={3} className="text-(--main-color) animate-spin" />
                        ) : (
                            <Save size={40} strokeWidth={2} className="text-(--main-color) group-hover:text-black transition-colors" />
                        )}
                    </button>
                </div>
            </div>

            {saving && (
                <div className="absolute inset-0 z-[7000] flex items-center justify-center bg-black/40 backdrop-blur-3xl animate-in fade-in duration-200">
                    <div className="w-[600px] p-24 flex flex-col items-center gap-16 relative">
                        <div className="w-24 h-24 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_100px_rgba(var(--main-color-rgb),0.5)]">
                            <CloudUpload size={48} strokeWidth={4} className="animate-bounce" />
                        </div>
                        <div className="w-full space-y-10">
                            <div className="flex justify-between items-end">
                                <span className="text-[14px] font-black text-white uppercase tracking-[0.6em]">{tr("Master Sync")}</span>
                                <span className="text-7xl font-black text-(--main-color) tracking-tighter tabular-nums">{savingProgress}%</span>
                            </div>
                            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-(--main-color) transition-all duration-200 ease-out shadow-[0_0_40px_rgba(var(--main-color-rgb),0.6)]" style={{ width: `${savingProgress}%` }} />
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-white uppercase tracking-[1.5em] animate-pulse">
                            {uploadProgressMsg || 'Syncing Protocols...'}
                        </p>
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
