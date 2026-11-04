import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAtomValue } from 'jotai/react';
import { userAtom, inventoryAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import { VENDOR_CODES, isKnownVendor } from '../entry/entryModel';
import { Field, Input, Key, Segmented, VendorPicker } from '../../components/ui';
import { 
    FileText, Upload, Sparkles, Check, 
    X, ArrowRight, Image as ImageIcon, Loader2, Layers,
    FolderOpen, Download, Globe, MessageSquare, 
    Edit3, Trash2, Database, Cloud, Save, Box
} from 'lucide-react';
import { 
    batchCreateShowroomItems, 
    computeShowroomFinancials, 
    runSam2Segmentation,
    type ShowroomItem 
} from '../../lib/showroomService';
import { handleShowroomFileUpload, getTextColorForBg } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { 
    universalIntakeParser, 
    matchPhotosToParsedItems, 
    parseCatalogZipFile,
    parseCatalogImagesBatch,
    extractGoogleDocId,
    getGoogleDocExportZipUrl,
    fetchIcloudSharedAlbum,
    parseGeText,
    type ParsedVendorItem, 
    type IntakeParseResult 
} from '../../lib/vendorIntakeParser';
import { 
    type StagedShowroomItem,
    getStagedShowroomItems,
    saveStagedShowroomItems,
    upsertStagedShowroomItem,
    deleteStagedShowroomItem,
    clearStagedShowroomItems,
    generateStagedId
} from '../../lib/showroomLocalDb';
import { useTypeLibrary } from '../../lib/typeLibraryStore';
import { ShapeLibraryField } from '../entry/ShapeLibraryField';
import { LivePreviewCard } from '../../components/inventory/LivePreviewCard';
import toast from '../onyxIsland/notify/toast';
import '../entry/entry.css';

interface AddShowProps {
    onSaved?: () => void;
    onCancel?: () => void;
}

type AddMode = 'single' | 'batch';

const VENDORS = vendors as Record<string, { name: string; color: string }>;
const PRIMARY_VENDOR_CODES = ['JM', 'EM', 'GE', 'AM', 'CA', 'AN', 'SU', 'TE', 'DH', 'ML', 'FR', 'ET', 'RF'];

const BOOK_OPTIONS = [
    { value: 'v826', label: '826 (Slab)' },
    { value: 'v827', label: '827 (Rock)' },
    { value: 'v828', label: '828 (Rare Earth)' },
];

const SHAPE_CHIPS = ['Torre', 'Lámpara', 'Mesa Centro', 'Pedestal', 'Cilindro', 'Cubo', 'Plato', 'Escultura'];
const TYPE_CHIPS = ['Lámpara', 'Torre', 'Mesa', 'Lavabo', 'Accesorio', 'Escultura', 'Plafón'];
const MATERIAL_CHIPS = ['Onyx', 'Mármol', 'Travertino', 'Granito', 'Madera Petrificada'];

const STANDARD_SIZE_SUGGESTIONS = [
    { l: 30, w: 30, h: 240, label: '30×30×2.40m' },
    { l: 30, w: 30, h: 220, label: '30×30×2.20m' },
    { l: 30, w: 30, h: 200, label: '30×30×2.00m' },
    { l: 30, w: 30, h: 170, label: '30×30×1.70m' },
    { l: 30, w: 30, h: 150, label: '30×30×1.50m' },
    { l: 30, w: 30, h: 120, label: '30×30×1.20m' },
    { l: 30, w: 30, h: 110, label: '30×30×1.10m' },
    { l: 30, w: 30, h: 100, label: '30×30×1.00m' },
    { l: 40, w: 40, h: 45, label: '40×40×45cm' },
    { l: 50, w: 50, h: 50, label: '50×50×50cm' },
    { l: 120, w: 60, h: 45, label: '120×60×45cm' },
];

function getVendorColorChips(vendorCode: string) {
    switch (vendorCode) {
        case 'GE':
            return ['Galaxia', 'Arcoiris', 'Cherry Blue', 'Cherry Pink', 'Blanco', 'Nácar'];
        case 'JM':
            return ['Blanco', 'Nácar', 'Ámbar', 'Verde', 'Rojo', 'Miel'];
        case 'EM':
            return ['Blanco Tepeaca', 'Rosa', 'Gris', 'Chocolate', 'Blanco', 'Crema'];
        case 'AM':
            return ['Blanco', 'Nácar', 'Verde', 'Café', 'Caramelo'];
        default:
            return ['Blanco', 'Nácar', 'Galaxia', 'Arcoiris', 'Ámbar', 'Verde', 'Rosa'];
    }
}

function convertToStagedItems(
    items: ParsedVendorItem[],
    targetVendor: string
): StagedShowroomItem[] {
    const now = new Date().toISOString();
    return items.map(it => {
        let matchedBlob: Blob | null = null;
        if (it.matchedPhoto instanceof Blob) {
            matchedBlob = it.matchedPhoto;
        }
        return {
            ...it,
            id: generateStagedId(),
            vendor: targetVendor,
            created_at: now,
            updated_at: now,
            matchedPhotoBlob: matchedBlob,
            matchedPhoto: it.matchedPhoto || matchedBlob,
            matchedPhotoUrl: it.matchedPhotoUrl || (matchedBlob ? URL.createObjectURL(matchedBlob) : null),
        };
    });
}

/**
 * Modal to edit a locally staged showroom item.
 * Grounded in Apple HIG modal sheet architecture & Liquid Onyx surface layering.
 */
function EditStagedItemModal({
    item,
    vendorColor,
    vendorInk,
    typeLib,
    onSave,
    onDelete,
    onClose
}: {
    item: StagedShowroomItem;
    vendorColor: string;
    vendorInk: string;
    typeLib: ReturnType<typeof useTypeLibrary>;
    onSave: (updated: StagedShowroomItem) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}) {
    const [code, setCode] = useState(item.code || '');
    const [shape, setShape] = useState(item.shape || '');
    const [type, setType] = useState(item.type || '');
    const [material, setMaterial] = useState(item.material || 'Onyx');
    const [color, setColor] = useState(item.color || '');
    const [lengthCm, setLengthCm] = useState(item.length_cm ? String(item.length_cm) : '');
    const [widthCm, setWidthCm] = useState(item.width_cm ? String(item.width_cm) : '');
    const [heightCm, setHeightCm] = useState(item.height_cm ? String(item.height_cm) : '');
    const [weightKg, setWeightKg] = useState(item.weight_kg ? String(item.weight_kg) : '');
    const [quantity, setQuantity] = useState(item.quantity ? String(item.quantity) : '1');
    const [markedPrice, setMarkedPrice] = useState(item.marked_price ? String(item.marked_price) : '');
    const [costMxn, setCostMxn] = useState(item.cost_mxn ? String(item.cost_mxn) : '');
    const [notes, setNotes] = useState(item.notes || '');
    const [activeField, setActiveField] = useState<'shape' | 'type' | 'material' | 'color' | 'dims' | null>(null);

    const leaveField = (e: React.FocusEvent) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (next?.closest('.tag-chip-row') || next?.closest('.tag-chip-btn')) return;
        setActiveField(null);
    };

    // Photo state
    const [photoBlob, setPhotoBlob] = useState<Blob | File | null>(item.matchedPhoto || item.matchedPhotoBlob || null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(item.matchedPhotoUrl || null);
    const [cleanCutout, setCleanCutout] = useState<string | null>(item.img_clean || null);
    const [svgData, setSvgData] = useState<string | null>(item.svg_data || null);
    const [runningSam2, setRunningSam2] = useState<boolean>(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Live calculations
    const costNum = parseFloat(costMxn) || (parseFloat(markedPrice) ? Math.round(parseFloat(markedPrice) * 0.70) : null);
    const lIn = lengthCm ? (parseFloat(lengthCm) / 2.54).toFixed(1) : '';
    const wIn = widthCm ? (parseFloat(widthCm) / 2.54).toFixed(1) : '';
    const hIn = heightCm ? (parseFloat(heightCm) / 2.54).toFixed(1) : '';

    const dimsForPicker = useMemo(() => {
        const w = parseFloat(widthCm);
        const h = parseFloat(heightCm);
        const d = parseFloat(lengthCm);
        if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 && Number.isFinite(d) && d > 0) {
            return { w, h, d };
        }
        return null;
    }, [widthCm, heightCm, lengthCm]);

    const livePreviewRow = useMemo(() => ({
        vendor_id: item.vendor,
        vendorId: item.vendor,
        workbook: 'v826',
        item_id: `${item.vendor}-${code || '001'}`,
        item_number: code || '001',
        itemNumber: code || '001',
        price_mxn: costNum,
        price: costNum,
        cost_mxn: costNum,
        shape,
        type,
        material,
        color,
        width_cm: widthCm,
        height_cm: heightCm,
        length_cm: lengthCm,
        weight_kg: weightKg,
    }), [item.vendor, code, costNum, shape, type, material, color, widthCm, heightCm, lengthCm, weightKg]);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoBlob(file);
        setPhotoUrl(URL.createObjectURL(file));
        setCleanCutout(null);
        setSvgData(null);
    };

    const handleRunSam2 = async () => {
        if (!photoUrl) {
            toast.error(tr('No photo to segment'));
            return;
        }
        setRunningSam2(true);
        try {
            const res = await runSam2Segmentation(photoUrl, type, shape);
            if (res?.cutoutDataUrl) {
                setCleanCutout(res.cutoutDataUrl);
                if (res.svgPath) setSvgData(res.svgPath);
                toast.success(tr('SAM2 cutout complete!'));
            } else {
                toast.error(tr('SAM2 service offline on :8002'));
            }
        } catch (err: any) {
            toast.error(err.message || tr('Cutout failed'));
        } finally {
            setRunningSam2(false);
        }
    };

    const handleSave = () => {
        const updated: StagedShowroomItem = {
            ...item,
            code: code.trim(),
            shape: shape.trim() || undefined,
            type: type.trim() || undefined,
            material: material.trim() || undefined,
            color: color.trim() || undefined,
            length_cm: parseFloat(lengthCm) || null,
            width_cm: parseFloat(widthCm) || null,
            height_cm: parseFloat(heightCm) || null,
            weight_kg: parseFloat(weightKg) || null,
            quantity: parseInt(quantity, 10) || 1,
            marked_price: parseFloat(markedPrice) || null,
            cost_mxn: costNum,
            notes: notes.trim() || undefined,
            matchedPhoto: photoBlob,
            matchedPhotoBlob: photoBlob,
            matchedPhotoUrl: photoUrl,
            img_clean: cleanCutout,
            svg_data: svgData,
            updated_at: new Date().toISOString()
        };
        onSave(updated);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-2xl flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
            {/* Modal Window: Functional Liquid Glass Layer */}
            <div 
                className="liquid-surface w-full max-w-4xl p-6 sm:p-8 flex flex-col gap-6 my-8 text-white max-h-[92vh] overflow-y-auto custom-scrollbar relative"
                style={{ borderColor: `${vendorColor}60`, boxShadow: `0 0 35px ${vendorColor}15, 0 20px 50px rgba(0,0,0,0.8)` }}
            >
                {/* Header with Title and Minimalist Close Key */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div 
                            className="w-3.5 h-3.5 rounded-full shadow-lg"
                            style={{ backgroundColor: vendorColor, boxShadow: `0 0 10px ${vendorColor}` }}
                        />
                        <span className="text-base font-black uppercase tracking-wider text-white">
                            {tr('Edit Staged Item')}: <span style={{ color: vendorColor }}>{code}</span>
                        </span>
                        <span 
                            className="px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px]"
                            style={{ backgroundColor: vendorColor, color: vendorInk }}
                        >
                            {item.vendor}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                        title={tr('Close')}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Hairline Type & Form Selector (Wireframe Models) */}
                <div className="liquid-panel p-4 flex flex-col gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-white/60 flex items-center gap-2">
                        <Box size={14} style={{ color: vendorColor }} />
                        {tr('Hairline Type & Form Selector')}
                    </span>
                    <div className="ui-root overflow-hidden">
                        <ShapeLibraryField
                            value={{ type, shape }}
                            onChange={patch => {
                                if (patch.type !== undefined) setType(patch.type);
                                if (patch.shape !== undefined) setShape(patch.shape);
                            }}
                            library={typeLib.library}
                            loading={typeLib.loading}
                            onSave={typeLib.save}
                            dims={dimsForPicker}
                        />
                    </div>
                </div>

                {/* Content Layer: Structured Input Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column: Physical Attributes */}
                    <div className="flex flex-col gap-4">
                        <span className="text-xs font-black uppercase tracking-wider text-white/70">
                            {tr('1. Physical Characteristics')}
                        </span>

                        <div className="grid grid-cols-2 gap-3">
                            <Field label={tr('Code / #')} group>
                                <Input
                                    value={code}
                                    onChange={e => setCode(e.target.value)}
                                    className="font-mono text-xs ui-tnum"
                                />
                            </Field>
                            <Field label={tr('Quantity')} group>
                                <Input
                                    type="number"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    className="ui-tnum text-xs font-mono"
                                />
                            </Field>
                        </div>

                        {/* Concept / Shape */}
                        <div>
                            <Field label={tr('Concept / Shape')} group>
                                <Input
                                    value={shape}
                                    onChange={e => setShape(e.target.value)}
                                    onFocus={() => setActiveField('shape')}
                                    onBlur={leaveField}
                                    placeholder="Torre, Mesa, etc."
                                    className="text-xs"
                                />
                            </Field>
                            {activeField === 'shape' && (
                                <div className="tag-chip-row flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1">
                                    <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr('Suggested Shapes')}</span>
                                    {SHAPE_CHIPS.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={() => { setShape(c); setActiveField(null); }}
                                            className="tag-chip-btn liquid-control px-2 py-0.5 text-[10px] font-mono hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Type */}
                        <div>
                            <Field label={tr('Type')} group>
                                <Input
                                    value={type}
                                    onChange={e => setType(e.target.value)}
                                    onFocus={() => setActiveField('type')}
                                    onBlur={leaveField}
                                    placeholder="Lámpara, Mesa, etc."
                                    className="text-xs"
                                />
                            </Field>
                            {activeField === 'type' && (
                                <div className="tag-chip-row flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1">
                                    <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr('Suggested Types')}</span>
                                    {TYPE_CHIPS.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={() => { setType(c); setActiveField(null); }}
                                            className="tag-chip-btn liquid-control px-2 py-0.5 text-[10px] font-mono hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Material & Color */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Field label={tr('Material')} group>
                                    <Input
                                        value={material}
                                        onChange={e => setMaterial(e.target.value)}
                                        onFocus={() => setActiveField('material')}
                                        onBlur={leaveField}
                                        className="text-xs"
                                    />
                                </Field>
                                {activeField === 'material' && (
                                    <div className="tag-chip-row flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1">
                                        <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr('Materials')}</span>
                                        {MATERIAL_CHIPS.map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setMaterial(m); setActiveField(null); }}
                                                className="tag-chip-btn liquid-control px-1.5 py-0.5 text-[9px] font-mono text-white/60 hover:text-white"
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <Field label={tr('Color')} group>
                                    <Input
                                        value={color}
                                        onChange={e => setColor(e.target.value)}
                                        onFocus={() => setActiveField('color')}
                                        onBlur={leaveField}
                                        placeholder="Galaxia, Blanco..."
                                        className="text-xs"
                                    />
                                </Field>
                                {activeField === 'color' && (
                                    <div className="tag-chip-row flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1">
                                        <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr(`${item.vendor} Colors`)}</span>
                                        {getVendorColorChips(item.vendor).map(col => (
                                            <button
                                                key={col}
                                                type="button"
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setColor(col); setActiveField(null); }}
                                                className="tag-chip-btn liquid-control px-1.5 py-0.5 text-[9px] font-mono text-white/60 hover:text-white"
                                            >
                                                {col}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Dimensions in cm + Live Imperial conversion */}
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                                {tr('Dimensions (Length × Width × Height cm)')}
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                                <Field label={tr('L (cm)')} group>
                                    <Input
                                        type="number"
                                        value={lengthCm}
                                        onChange={e => setLengthCm(e.target.value)}
                                        onFocus={() => setActiveField('dims')}
                                        onBlur={leaveField}
                                        className="ui-tnum font-mono text-xs"
                                    />
                                </Field>
                                <Field label={tr('W (cm)')} group>
                                    <Input
                                        type="number"
                                        value={widthCm}
                                        onChange={e => setWidthCm(e.target.value)}
                                        onFocus={() => setActiveField('dims')}
                                        onBlur={leaveField}
                                        className="ui-tnum font-mono text-xs"
                                    />
                                </Field>
                                <Field label={tr('H (cm)')} group>
                                    <Input
                                        type="number"
                                        value={heightCm}
                                        onChange={e => setHeightCm(e.target.value)}
                                        onFocus={() => setActiveField('dims')}
                                        onBlur={leaveField}
                                        className="ui-tnum font-mono text-xs"
                                    />
                                </Field>
                            </div>
                            {activeField === 'dims' && (
                                <div className="tag-chip-row flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1">
                                    <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr('Standard Dimensions')}</span>
                                    {STANDARD_SIZE_SUGGESTIONS.map(sz => (
                                        <button
                                            key={`${sz.l}x${sz.w}x${sz.h}`}
                                            type="button"
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={() => {
                                                setLengthCm(String(sz.l));
                                                setWidthCm(String(sz.w));
                                                setHeightCm(String(sz.h));
                                                setActiveField(null);
                                            }}
                                            className="tag-chip-btn liquid-control px-2 py-0.5 text-[9px] font-mono text-white/70 hover:text-white"
                                        >
                                            {sz.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {(lIn || wIn || hIn) && (
                                <span className="text-[11px] text-amber-300 font-mono">
                                    Imperial: {lIn || '0'}" × {wIn || '0'}" × {hIn || '0'}" in
                                </span>
                            )}
                        </div>

                        <Field label={tr('Weight (kg)')} group>
                            <Input
                                type="number"
                                value={weightKg}
                                onChange={e => setWeightKg(e.target.value)}
                                placeholder="Weight in kg"
                                className="ui-tnum font-mono text-xs"
                            />
                        </Field>

                        <Field label={tr('Notes')} group>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={2}
                                className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white resize-none focus:outline-none focus:border-(--main-color)"
                            />
                        </Field>
                    </div>

                    {/* Right Column: Pricing, LivePreviewCard & Photo */}
                    <div className="flex flex-col gap-4">
                        <span className="text-xs font-black uppercase tracking-wider text-white/70">
                            {tr('2. Pricing & Live Preview')}
                        </span>

                        <div className="grid grid-cols-2 gap-3">
                            <Field label={tr('Catalog Marked Price')} group>
                                <Input
                                    type="number"
                                    value={markedPrice}
                                    onChange={e => {
                                        setMarkedPrice(e.target.value);
                                        const p = parseFloat(e.target.value);
                                        if (!isNaN(p)) setCostMxn(String(Math.round(p * 0.70)));
                                    }}
                                    placeholder="Catalog price MXN"
                                    className="ui-tnum font-mono text-xs"
                                />
                            </Field>
                            <Field label={tr('Cost MXN')} group>
                                <Input
                                    type="number"
                                    value={costMxn}
                                    onChange={e => setCostMxn(e.target.value)}
                                    placeholder="Vendor cost MXN"
                                    className="ui-tnum font-mono font-bold text-xs text-emerald-400"
                                />
                            </Field>
                        </div>

                        {/* LivePreviewCard from Add Entry */}
                        <div className="liquid-panel p-3.5">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-white/50 block mb-2">
                                {tr('Live Codes & Pricing Breakdown (Rate 17)')}
                            </span>
                            <LivePreviewCard row={livePreviewRow} />
                        </div>

                        {/* Photo management & SAM2 Cutout */}
                        <span className="text-xs font-black uppercase tracking-wider text-white/70 pt-2">
                            {tr('3. Photo & SAM2 Background Cutout')}
                        </span>

                        <div className="liquid-panel flex items-center gap-4 p-4">
                            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-white/20 bg-black/60 flex items-center justify-center shrink-0 shadow-lg">
                                {cleanCutout || photoUrl ? (
                                    <img 
                                        src={cleanCutout || photoUrl!} 
                                        alt="" 
                                        className="w-full h-full object-cover" 
                                    />
                                ) : (
                                    <ImageIcon size={24} className="text-white/20" />
                                )}
                            </div>

                            <div className="flex flex-col gap-2 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="liquid-control px-3.5 py-2 text-white text-xs font-bold hover:bg-white/10"
                                    >
                                        {photoUrl ? tr('Replace Photo') : tr('Upload Photo')}
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handlePhotoChange}
                                        className="hidden"
                                    />

                                    {photoUrl && (
                                        <button
                                            type="button"
                                            onClick={handleRunSam2}
                                            disabled={runningSam2}
                                            className="px-3.5 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-bold flex items-center gap-1.5 transition-all border border-purple-500/30"
                                        >
                                            {runningSam2 ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                            {runningSam2 ? tr('Cutting out...') : tr('SAM2 Cutout (:8002)')}
                                        </button>
                                    )}
                                </div>
                                {cleanCutout && (
                                    <span className="text-[11px] text-purple-300 font-mono">
                                        ✓ SAM2 background cleanly removed
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Buttons: Reserved Color for Primary Action */}
                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <button
                        type="button"
                        onClick={() => onDelete(item.id)}
                        className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold flex items-center gap-2 transition-colors border border-red-500/20"
                    >
                        <Trash2 size={14} />
                        {tr('Delete Item')}
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-bold transition-colors"
                        >
                            {tr('Cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-xl"
                            style={{ backgroundColor: vendorColor, color: vendorInk }}
                        >
                            <Check size={14} />
                            {tr('Save Changes')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AddShow({ onSaved, onCancel }: AddShowProps) {
    const user = useAtomValue(userAtom);
    const vendorLock = user?.role === 'Vendor' && isKnownVendor(user?.name) ? String(user.name) : '';

    const [mode, setMode] = useState<AddMode>('single');
    const [vendor, setVendor] = useState<string>(vendorLock || 'JM');
    const [workbook, setWorkbook] = useState<string>('v826');

    // Vendor metadata
    const currentVendorInfo = VENDORS[vendor] || { name: vendor, color: '#6BCEBB' };
    const activeColor = currentVendorInfo.color || '#6BCEBB';
    const activeInk = getTextColorForBg(activeColor);

    // Type Library for Hairline Figures
    const inventory = useAtomValue(inventoryAtom);
    const manual = useMemo(() => (inventory || []).map((r: any) => ({
        shape: r?.shape,
        material: r?.material,
        color: r?.color,
        short_description: r?.short_description ?? r?.shortDescription,
        width_cm: r?.width_cm ?? r?.widthCm,
        length_cm: r?.length_cm ?? r?.lengthCm,
        height_cm: r?.height_cm ?? r?.heightCm,
    })), [inventory]);
    const typeLib = useTypeLibrary(manual, true);

    // Unified URL State
    const [urlInput, setUrlInput] = useState<string>('https://docs.google.com/document/d/13QmpvpxZrkqfD36OH7QV08SHzsBt3LCHEVNoNzEdE-M/edit?tab=t.0');
    const [urlStatus, setUrlStatus] = useState<string | null>(null);
    const [showTextPaste, setShowTextPaste] = useState<boolean>(false);

    // Native file input refs for click-to-upload (No drag and drop)
    const docInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const singlePhotoInputRef = useRef<HTMLInputElement>(null);

    // Staged items persistently stored on device (DO NOT auto-save to cloud)
    const [stagedItems, setStagedItems] = useState<StagedShowroomItem[]>([]);
    const [editingItem, setEditingItem] = useState<StagedShowroomItem | null>(null);
    const [loadingLocal, setLoadingLocal] = useState<boolean>(true);

    // Load staged items from device storage on mount and when vendor changes
    const loadStaged = async () => {
        try {
            setLoadingLocal(true);
            const loaded = await getStagedShowroomItems(vendor);
            setStagedItems(loaded);
        } catch (err) {
            console.error('[AddShow] Failed loading staged items from device storage', err);
        } finally {
            setLoadingLocal(false);
        }
    };

    useEffect(() => {
        void loadStaged();
    }, [vendor]);

    // Single item state (Form matching Add Entry)
    const [itemNumber, setItemNumber] = useState<string>('001');
    const [quantity, setQuantity] = useState<string>('1');
    const [shape, setShape] = useState<string>('Torre');
    const [type, setType] = useState<string>('Lámpara');
    const [material, setMaterial] = useState<string>('Onyx');
    const [color, setColor] = useState<string>('Galaxia');
    const [widthCm, setWidthCm] = useState<string>('30');
    const [heightCm, setHeightCm] = useState<string>('220');
    const [lengthCm, setLengthCm] = useState<string>('30');
    const [weightKg, setWeightKg] = useState<string>('');
    const [markedPrice, setMarkedPrice] = useState<string>('');
    const [costMxn, setCostMxn] = useState<string>('6006');
    const [notes, setNotes] = useState<string>('');
    const [activeFieldSingle, setActiveFieldSingle] = useState<'shape' | 'type' | 'material' | 'color' | 'dims' | null>(null);

    const leaveFieldSingle = (e: React.FocusEvent) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (next?.closest('.tag-chip-row') || next?.closest('.tag-chip-btn')) return;
        setActiveFieldSingle(null);
    };

    // Single item photos & SAM2
    const [singlePhotoBlob, setSinglePhotoBlob] = useState<Blob | File | null>(null);
    const [singlePhotoUrl, setSinglePhotoUrl] = useState<string | null>(null);
    const [cleanCutout, setCleanCutout] = useState<string | null>(null);
    const [svgData, setSvgData] = useState<string | null>(null);
    const [runningSam2, setRunningSam2] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // WhatsApp text state
    const [whatsappText, setWhatsappText] = useState<string>(
`1 Arcoiris 30x30x2M. $5478 + $500 = $5978
1 Arcoiris 30x30x2M. $5478 + $500 = $5978
1 Arcoiris 30x30x1.70 $4686 $400 = $5086
1 Arcoiris 30x30x1.70 $4686 $400 = $5086
1 Arcoiris 30x30x1.50 $4152 $400 = $4552
1 Arcoiris 30x30x1.50 $4152 $400 = $4552

1 Cherry Blue 30x30x1.20 $3366 $400 = $3766
1 Cherry Blue 30x30x1.20 $3366 $400 = $3766
1 Cherry Blue 30x30x1.10 $3102 $300 = $3402
1 Cherry Blue 30x30x1.00 $2838 $300 = $3138

1 Cherry Pink 30x30x1.50 $4152 $400 = $4552
1 Cherry Pink 30x30x1.50 $4152 $400 = $4552
1 Cherry Pink 30x30x1.60 $4422 $400 = $4822

1 Galaxia 30x30x240 $6534 $600 = $7134
1 Galaxia 30x30x2.20 $6006 $600 = $6606
1 Galaxia 30x30x2.20 $5460 $600 = $6060`
    );

    // Batch Intake State
    const [intakeFile, setIntakeFile] = useState<File | null>(null);
    const [parseResult, setParseResult] = useState<IntakeParseResult | null>(null);
    const [parsingFile, setParsingFile] = useState(false);
    const [droppedPhotos, setDroppedPhotos] = useState<File[]>([]);
    const [batchImporting, setBatchImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
    const [ocrProgress, setOcrProgress] = useState<{ done: number; total: number; current?: ParsedVendorItem } | null>(null);

    // Business Rules
    const [applyJmDiscount, setApplyJmDiscount] = useState(true);
    const [enableSam2Batch, setEnableSam2Batch] = useState(false);
    const [fetchingIcloud, setFetchingIcloud] = useState<boolean>(false);

    // Live calculations for Single Item
    const costNumSingle = parseFloat(costMxn) || (parseFloat(markedPrice) ? Math.round(parseFloat(markedPrice) * 0.70) : null);
    const lInSingle = lengthCm ? (parseFloat(lengthCm) / 2.54).toFixed(1) : '';
    const wInSingle = widthCm ? (parseFloat(widthCm) / 2.54).toFixed(1) : '';
    const hInSingle = heightCm ? (parseFloat(heightCm) / 2.54).toFixed(1) : '';

    const dimsForSinglePicker = useMemo(() => {
        const w = parseFloat(widthCm);
        const h = parseFloat(heightCm);
        const d = parseFloat(lengthCm);
        if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 && Number.isFinite(d) && d > 0) {
            return { w, h, d };
        }
        return null;
    }, [widthCm, heightCm, lengthCm]);

    const livePreviewRowSingle = useMemo(() => ({
        vendor_id: vendor,
        vendorId: vendor,
        workbook,
        item_id: `${vendor}-${itemNumber || '001'}`,
        item_number: itemNumber || '001',
        itemNumber: itemNumber || '001',
        price_mxn: costNumSingle,
        price: costNumSingle,
        cost_mxn: costNumSingle,
        shape,
        type,
        material,
        color,
        width_cm: widthCm,
        height_cm: heightCm,
        length_cm: lengthCm,
        weight_kg: weightKg,
    }), [vendor, workbook, itemNumber, costNumSingle, shape, type, material, color, widthCm, heightCm, lengthCm, weightKg]);

    // Handle single photo upload
    const handleSinglePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSinglePhotoBlob(file);
        setSinglePhotoUrl(URL.createObjectURL(file));
        setCleanCutout(null);
        setSvgData(null);
    };

    // Single item SAM2
    const handleRunSam2Single = async () => {
        if (!singlePhotoUrl) {
            toast.error(tr('Please select a photo first'));
            return;
        }

        setRunningSam2(true);
        try {
            const res = await runSam2Segmentation(singlePhotoUrl, type, shape);
            if (res && res.cutoutDataUrl) {
                setCleanCutout(res.cutoutDataUrl);
                if (res.svgPath) setSvgData(res.svgPath);
                toast.success(tr('SAM2 segmentation complete!'));
            } else {
                toast.error(tr('SAM2 service offline or unavailable on :8002'));
            }
        } catch (err: any) {
            toast.error(err.message || tr('Segmentation failed'));
        } finally {
            setRunningSam2(false);
        }
    };

    // Stage Single Item Locally on Device (DO NOT auto-save to cloud)
    const handleSaveSingle = async () => {
        if (!vendor) {
            toast.error(tr('Please select a vendor'));
            return;
        }

        setIsSaving(true);
        try {
            const price = costNumSingle;
            const codeGen = `${vendor}-${itemNumber.padStart(3, '0')}`;
            const newItem: StagedShowroomItem = {
                id: generateStagedId(),
                vendor,
                code: codeGen,
                shape: shape.trim() || undefined,
                type: type.trim() || undefined,
                material: material.trim() || 'Onyx',
                color: color.trim() || undefined,
                length_cm: parseFloat(lengthCm) || null,
                width_cm: parseFloat(widthCm) || null,
                height_cm: parseFloat(heightCm) || null,
                weight_kg: parseFloat(weightKg) || null,
                cost_mxn: price,
                marked_price: parseFloat(markedPrice) || null,
                notes: notes.trim() || undefined,
                matchedPhoto: singlePhotoBlob,
                matchedPhotoBlob: singlePhotoBlob,
                matchedPhotoUrl: singlePhotoUrl,
                img_clean: cleanCutout || null,
                svg_data: svgData || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await upsertStagedShowroomItem(newItem);
            setStagedItems(prev => [newItem, ...prev]);
            toast.success(tr('Item saved to local device staging (not uploaded to cloud)'));

            const nextNum = (parseInt(itemNumber, 10) || 1) + 1;
            setItemNumber(String(nextNum).padStart(3, '0'));
            setSinglePhotoBlob(null);
            setSinglePhotoUrl(null);
            setCleanCutout(null);
            setSvgData(null);
        } catch (err: any) {
            toast.error(err.message || tr('Failed to stage item'));
        } finally {
            setIsSaving(false);
        }
    };

    // Load URL (Google Doc / iCloud Shared Album)
    const handleLoadUrl = async () => {
        const url = urlInput.trim();
        if (!url) return;

        if (url.includes('icloud.com/sharedalbum')) {
            setFetchingIcloud(true);
            try {
                const data = await fetchIcloudSharedAlbum(url);
                setUrlStatus(`iCloud Album "${data.albumName}" (${data.photos.length} photos ready)`);
                toast.success(tr(`Connected to iCloud Album "${data.albumName}" with ${data.photos.length} photos!`));

                if (stagedItems.length > 0) {
                    const updated = stagedItems.map((item, idx) => {
                        const photo = data.photos[idx % data.photos.length];
                        if (photo && !item.matchedPhotoUrl) {
                            return { ...item, matchedPhotoUrl: photo.url };
                        }
                        return item;
                    });
                    await saveStagedShowroomItems(updated);
                    setStagedItems(updated);
                }
            } catch (err: any) {
                toast.error(err.message || tr('Failed connecting to iCloud Shared Album'));
            } finally {
                setFetchingIcloud(false);
            }
            return;
        }

        const docId = extractGoogleDocId(url);
        if (docId) {
            setUrlStatus(`Google Doc ID: ${docId.slice(0, 8)}... (Download Zip or Upload Document)`);
            toast.info(tr('Google Doc detected. Click "Download Zip from Google", then click "Upload Document".'));
            return;
        }

        toast.info(tr('URL ready. Click "Upload Document" to process catalog files.'));
    };

    // Parse WhatsApp text & Stage Locally
    const handleParseWhatsApp = async () => {
        if (!whatsappText.trim()) return;
        try {
            const result = parseGeText(whatsappText, 'GE');
            setParseResult(result);
            if (!vendorLock) setVendor('GE');
            const itemsWithPhotos = droppedPhotos.length > 0
                ? matchPhotosToParsedItems(result.items, droppedPhotos)
                : result.items;

            const newStaged = convertToStagedItems(itemsWithPhotos, 'GE');
            await saveStagedShowroomItems(newStaged);
            setStagedItems(prev => [...newStaged, ...prev]);

            const total = result.items.reduce((s, i) => s + (i.cost_mxn || 0), 0);
            toast.success(tr(`Parsed ${result.items.length} items from GE list (Total: $${total.toLocaleString()} MXN) & saved to device!`));
        } catch (err: any) {
            toast.error(err.message || tr('Failed parsing WhatsApp text'));
        }
    };

    // Universal Document Parser (PDF, XLSX, CSV, ZIP) & Stage Locally
    const handleUniversalDocument = async (file: File) => {
        setIntakeFile(file);
        setParsingFile(true);
        try {
            const result = await universalIntakeParser(file, vendor);
            setParseResult(result);
            const resolvedVendor = (result.vendor && result.vendor !== vendor && !vendorLock) ? result.vendor : vendor;
            if (resolvedVendor !== vendor) {
                setVendor(resolvedVendor);
            }

            const itemsWithPhotos = droppedPhotos.length > 0 
                ? matchPhotosToParsedItems(result.items, droppedPhotos)
                : result.items;

            const newStaged = convertToStagedItems(itemsWithPhotos, resolvedVendor);
            await saveStagedShowroomItems(newStaged);
            setStagedItems(prev => [...newStaged, ...prev]);
            toast.success(tr(`Parsed ${result.items.length} items from ${file.name} and saved locally on device!`));
        } catch (err: any) {
            toast.error(err.message || tr('Could not parse vendor file'));
        } finally {
            setParsingFile(false);
        }
    };

    // Catalog Zip Upload & Stage Locally
    const handleCatalogZipUpload = async (file: File) => {
        setIntakeFile(file);
        setParsingFile(true);
        setOcrProgress({ done: 0, total: 0 });
        try {
            const result = await parseCatalogZipFile(file, vendor, (done, total, item) => {
                setOcrProgress({ done, total, current: item });
            });
            setParseResult(result);
            const newStaged = convertToStagedItems(result.items, vendor);
            await saveStagedShowroomItems(newStaged);
            setStagedItems(prev => [...newStaged, ...prev]);
            toast.success(tr(`Extracted ${result.items.length} items from catalog and saved locally on device!`));
        } catch (err: any) {
            toast.error(err.message || tr('Failed to process catalog zip'));
        } finally {
            setParsingFile(false);
            setOcrProgress(null);
        }
    };

    // Multiple Photos Upload & Matching
    const handlePhotosDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;

        const allPhotos = [...droppedPhotos, ...files];
        setDroppedPhotos(allPhotos);

        if (stagedItems.length > 0) {
            const updated = matchPhotosToParsedItems(stagedItems, allPhotos) as StagedShowroomItem[];
            for (const it of updated) {
                if (it.matchedPhoto instanceof Blob) {
                    it.matchedPhotoBlob = it.matchedPhoto;
                }
            }
            await saveStagedShowroomItems(updated);
            setStagedItems(updated);
            const matchedCount = updated.filter(i => i.matchedPhoto || i.matchedPhotoBlob).length;
            toast.success(tr(`Matched ${matchedCount} / ${updated.length} items with photos and saved to device!`));
        } else {
            toast.success(tr(`Loaded ${files.length} vendor photos. Now click "Upload Document" to parse items.`));
        }
    };

    // Update Staged Item in Local Database
    const handleUpdateStagedItem = async (updated: StagedShowroomItem) => {
        try {
            await upsertStagedShowroomItem(updated);
            setStagedItems(prev => prev.map(i => i.id === updated.id ? updated : i));
            setEditingItem(null);
            toast.success(tr('Staged item updated in device storage!'));
        } catch (err: any) {
            toast.error(err.message || tr('Failed saving item update'));
        }
    };

    // Delete Staged Item from Local Database
    const handleDeleteStagedItem = async (id: string) => {
        try {
            await deleteStagedShowroomItem(id);
            setStagedItems(prev => prev.filter(i => i.id !== id));
            if (editingItem?.id === id) setEditingItem(null);
            toast.success(tr('Item removed from local staging'));
        } catch (err: any) {
            toast.error(err.message || tr('Failed deleting item'));
        }
    };

    // Clear Staging for Vendor
    const handleClearStaging = async () => {
        if (!stagedItems.length) return;
        await clearStagedShowroomItems(vendor);
        setStagedItems([]);
        setIntakeFile(null);
        setDroppedPhotos([]);
        setUrlStatus(null);
        toast.info(tr('Cleared local staging for vendor ' + vendor));
    };

    // Upload Loaded Staged Items to Cloud (Supabase + Google Drive)
    const handleUploadLoadedToCloud = async () => {
        if (!stagedItems.length) return;

        setBatchImporting(true);
        setImportProgress({ done: 0, total: stagedItems.length });

        try {
            const showroomPayloads: Partial<ShowroomItem>[] = [];

            for (let i = 0; i < stagedItems.length; i++) {
                const it = stagedItems[i];
                let mediaUrl = (it.matchedPhotoUrl?.startsWith('http') && !it.matchedPhotoUrl.includes('blob:')) ? it.matchedPhotoUrl : '';
                let imgClean = it.img_clean || '';
                let svgPath = it.svg_data || '';

                const photoToUpload = it.matchedPhoto || it.matchedPhotoBlob;
                if (photoToUpload && !mediaUrl) {
                    try {
                        const driveRes = await handleShowroomFileUpload(photoToUpload, user, `${vendor}-${it.code}.jpg`);
                        mediaUrl = driveRes.thumbnailUrl;

                        if (enableSam2Batch && mediaUrl && !imgClean) {
                            try {
                                const samRes = await runSam2Segmentation(mediaUrl, it.type, it.shape);
                                if (samRes?.cutoutDataUrl) {
                                    imgClean = samRes.cutoutDataUrl;
                                    if (samRes.svgPath) svgPath = samRes.svgPath;
                                }
                            } catch (e) {
                                console.warn(`SAM2 segmentation skipped for ${it.code}:`, e);
                            }
                        }
                    } catch (e) {
                        console.warn(`Drive upload failed for item ${it.code}`, e);
                    }
                } else if (it.matchedPhotoUrl?.startsWith('http') && !mediaUrl) {
                    try {
                        const resp = await fetch(it.matchedPhotoUrl);
                        const blob = await resp.blob();
                        const driveRes = await handleShowroomFileUpload(blob, user, `${vendor}-${it.code}.jpg`);
                        mediaUrl = driveRes.thumbnailUrl;
                    } catch (e) {
                        console.warn(`External image fetch failed for ${it.code}:`, e);
                    }
                }

                let price = it.cost_mxn;
                if (it.marked_price != null && (price == null || price === 0)) {
                    price = applyJmDiscount ? Math.round(it.marked_price * 0.70) : it.marked_price;
                }

                const fin = computeShowroomFinancials(price ?? null, vendor, it.code);

                showroomPayloads.push({
                    vendor_id: vendor,
                    item_id: `${vendor}-${it.code}`,
                    shape: it.shape || undefined,
                    type: it.type || undefined,
                    material: it.material || undefined,
                    color: it.color || undefined,
                    length_cm: it.length_cm ?? null,
                    width_cm: it.width_cm ?? null,
                    height_cm: it.height_cm ?? null,
                    weight_kg: it.weight_kg ?? null,
                    cost_mxn: price ?? null,
                    cost_usd: fin.cost_usd,
                    landed_cost: fin.landed_cost,
                    retail_price: fin.retail_price,
                    book_aq_code: fin.book_aq_code,
                    book_land_code: fin.book_land_code,
                    book_barcode: fin.book_barcode,
                    description: it.description || undefined,
                    media_urls: mediaUrl || undefined,
                    img_clean: imgClean || null,
                    svg_data: svgPath || null,
                    notes: it.notes || (it.marked_price ? `Catalog marked: $${it.marked_price} MXN (${applyJmDiscount ? '-30% applied -> $' + price + ' MXN' : 'original'})` : null),
                });

                setImportProgress({ done: i + 1, total: stagedItems.length });
            }

            const result = await batchCreateShowroomItems(showroomPayloads, user);
            if (result.successful.length > 0) {
                await clearStagedShowroomItems(vendor);
                setStagedItems([]);
                toast.success(tr(`Successfully uploaded ${result.successful.length} items to Showroom cloud!`));
                onSaved?.();
            } else {
                toast.error(tr('Failed to upload items to Showroom'));
            }
        } catch (err: any) {
            toast.error(err.message || tr('Cloud upload failed'));
        } finally {
            setBatchImporting(false);
        }
    };

    return (
        <div className="ui-root flex flex-col w-full max-w-6xl mx-auto py-1 px-1 sm:px-4 text-white animate-in fade-in gap-4">
            {/* Free Floating Top Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
                <div>
                    <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white flex items-center gap-2.5">
                        <Layers className="text-(--main-color)" size={20} />
                        {tr('Add to Showroom')}
                    </h2>
                    <p className="text-[11px] text-white/50 tracking-wider">
                        {tr('On-device staging: Fast intake with persistent local storage. Cloud save is manual.')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Segmented<AddMode>
                        label={tr('Intake Mode')}
                        value={mode}
                        onChange={setMode}
                        options={[
                            { value: 'single', label: tr('Single Item') },
                            { value: 'batch', label: tr('Batch Intake') },
                        ]}
                    />
                    {onCancel && (
                        <button
                            onClick={onCancel}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
                            title={tr('Close')}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Vendor Selector Bar: Free Floating Hairline Panel */}
            <div 
                className="liquid-panel p-3.5 sm:p-4 mb-2 flex flex-col gap-2.5 transition-all"
                style={{ borderColor: `${activeColor}35`, boxShadow: `0 0 20px ${activeColor}10` }}
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                        <div 
                            className="w-3 h-3 rounded-full shadow-lg"
                            style={{ backgroundColor: activeColor, boxShadow: `0 0 8px ${activeColor}` }} 
                        />
                        <span className="text-xs font-black uppercase tracking-wider text-white">
                            {tr('Vendor')}: <span style={{ color: activeColor }}>{vendor}</span> · {currentVendorInfo.name}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        {vendor === 'JM' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                                -30% Marked Price Discount Active
                            </span>
                        )}
                        {vendor === 'GE' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-bold border border-orange-500/30">
                                Base + Installation Math Active
                            </span>
                        )}
                        {vendor === 'EM' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold border border-sky-500/30">
                                Kilos & iCloud Stream Active
                            </span>
                        )}
                        {vendor === 'AM' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-stone-500/20 text-stone-300 text-[10px] font-bold border border-stone-500/30">
                                Numbered Photo Invoice Active
                            </span>
                        )}
                    </div>
                </div>

                {/* Color-Coded Vendor Selector Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                    {PRIMARY_VENDOR_CODES.map(code => {
                        const vInfo = VENDORS[code] || { name: code, color: '#888' };
                        const isSelected = vendor === code;
                        const vColor = vInfo.color;
                        const vInk = getTextColorForBg(vColor);

                        return (
                            <button
                                key={code}
                                type="button"
                                onClick={() => {
                                    if (!vendorLock) setVendor(code);
                                }}
                                disabled={!!vendorLock && vendorLock !== code}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                                    isSelected 
                                        ? 'scale-105 shadow-lg' 
                                        : 'liquid-control opacity-75 hover:opacity-100 hover:scale-102'
                                }`}
                                style={
                                    isSelected 
                                        ? { backgroundColor: vColor, color: vInk, borderColor: vColor, boxShadow: `0 0 14px ${vColor}70` }
                                        : { borderColor: `${vColor}40`, color: vColor }
                                }
                            >
                                <span className="font-mono font-black text-xs">{code}</span>
                                <span className="text-[10px] font-medium opacity-90 hidden sm:inline">{vInfo.name.split(' ')[0]}</span>
                            </button>
                        );
                    })}

                    {/* Integrated VendorPicker Component */}
                    {!vendorLock && (
                        <div className="w-36">
                            <VendorPicker
                                codes={VENDOR_CODES}
                                value={vendor}
                                onChange={setVendor}
                                book={workbook.replace('v', '')}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Mode 1: Single Item Entry (Apple HIG Clean Hierarchy & Liquid Onyx Panels) */}
            {mode === 'single' && (
                <div className="flex flex-col gap-6">
                    {/* Hairline Type & Form Selector Panel */}
                    <div 
                        className="liquid-panel p-5 flex flex-col gap-3 transition-all"
                        style={{ borderColor: `${activeColor}30` }}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-white/70 flex items-center gap-2">
                                <Box size={16} style={{ color: activeColor }} />
                                {tr('Hairline Type & Form Selector')}
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">
                                {tr('Pick a Type, or type below. Wireframe models stay in sync.')}
                            </span>
                        </div>

                        <div className="ui-root overflow-hidden">
                            <ShapeLibraryField
                                value={{ type, shape }}
                                onChange={patch => {
                                    if (patch.type !== undefined) setType(patch.type);
                                    if (patch.shape !== undefined) setShape(patch.shape);
                                }}
                                library={typeLib.library}
                                loading={typeLib.loading}
                                onSave={typeLib.save}
                                dims={dimsForSinglePicker}
                            />
                        </div>
                    </div>

                    {/* 2-Column Content Layout: Quiet Panels with High Contrast Content */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left 2 Columns: Identity, Physical Characteristics & Dimensions */}
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            {/* Identity Section */}
                            <div className="liquid-panel p-5 flex flex-col gap-4">
                                <span className="text-xs font-black uppercase tracking-wider text-white/80">
                                    {tr('1. Identity & Numbering')}
                                </span>

                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                    <Field label={tr('Vendor')} group>
                                        <div className="liquid-control px-3 py-2 text-xs font-bold flex items-center justify-between" style={{ color: activeColor }}>
                                            <span>{vendor}</span>
                                            <span className="text-[10px] text-white/50">{currentVendorInfo.name.split(' ')[0]}</span>
                                        </div>
                                    </Field>

                                    <Field label={tr('Book')} group>
                                        <Segmented
                                            label={tr('Book')}
                                            value={workbook}
                                            onChange={setWorkbook}
                                            options={BOOK_OPTIONS}
                                        />
                                    </Field>

                                    <Field label={tr('Item #')} group>
                                        <Input
                                            value={itemNumber}
                                            onChange={e => setItemNumber(e.target.value)}
                                            placeholder="001"
                                            className="ui-tnum font-mono text-xs"
                                        />
                                    </Field>

                                    <Field label={tr('Quantity')} group>
                                        <Input
                                            type="number"
                                            value={quantity}
                                            onChange={e => setQuantity(e.target.value)}
                                            className="ui-tnum font-mono text-xs"
                                        />
                                    </Field>
                                </div>
                            </div>

                            {/* Physical Details Section */}
                            <div className="liquid-panel p-5 flex flex-col gap-4">
                                <span className="text-xs font-black uppercase tracking-wider text-white/80">
                                    {tr('2. Physical Characteristics')}
                                </span>

                                {/* Shape with compact expandable chips */}
                                <div>
                                    <Field label={tr('Concept / Shape')} group>
                                        <Input
                                            value={shape}
                                            onChange={e => setShape(e.target.value)}
                                            onFocus={() => setActiveFieldSingle('shape')}
                                            onBlur={leaveFieldSingle}
                                            placeholder="Torre, Mesa, etc."
                                            className="text-xs"
                                        />
                                    </Field>
                                    {activeFieldSingle === 'shape' && (
                                        <div className="tag-chip-row flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1.5">
                                            <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr('Suggested Shapes')}</span>
                                            {SHAPE_CHIPS.map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => { setShape(c); setActiveFieldSingle(null); }}
                                                    className="tag-chip-btn liquid-control px-2.5 py-1 text-[10px] font-mono hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Type with compact expandable chips */}
                                <div>
                                    <Field label={tr('Type')} group>
                                        <Input
                                            value={type}
                                            onChange={e => setType(e.target.value)}
                                            onFocus={() => setActiveFieldSingle('type')}
                                            onBlur={leaveFieldSingle}
                                            placeholder="Lámpara, Mesa, etc."
                                            className="text-xs"
                                        />
                                    </Field>
                                    {activeFieldSingle === 'type' && (
                                        <div className="tag-chip-row flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1.5">
                                            <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr('Suggested Types')}</span>
                                            {TYPE_CHIPS.map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => { setType(c); setActiveFieldSingle(null); }}
                                                    className="tag-chip-btn liquid-control px-2.5 py-1 text-[10px] font-mono hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Material & Color with compact expandable chips */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Field label={tr('Material')} group>
                                            <Input
                                                value={material}
                                                onChange={e => setMaterial(e.target.value)}
                                                onFocus={() => setActiveFieldSingle('material')}
                                                onBlur={leaveFieldSingle}
                                                placeholder="Onyx, Mármol..."
                                                className="text-xs"
                                            />
                                        </Field>
                                        {activeFieldSingle === 'material' && (
                                            <div className="tag-chip-row flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1.5">
                                                <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr('Materials')}</span>
                                                {MATERIAL_CHIPS.map(m => (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => { setMaterial(m); setActiveFieldSingle(null); }}
                                                        className="tag-chip-btn liquid-control px-2 py-0.5 text-[10px] font-mono text-white/70 hover:text-white"
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <Field label={tr('Vendor Colour')} group>
                                            <Input
                                                value={color}
                                                onChange={e => setColor(e.target.value)}
                                                onFocus={() => setActiveFieldSingle('color')}
                                                onBlur={leaveFieldSingle}
                                                placeholder="Galaxia, Arcoiris..."
                                                className="text-xs"
                                            />
                                        </Field>
                                        {activeFieldSingle === 'color' && (
                                            <div className="tag-chip-row flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1.5">
                                                <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr(`${vendor} Colors`)}</span>
                                                {getVendorColorChips(vendor).map(col => (
                                                    <button
                                                        key={col}
                                                        type="button"
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => { setColor(col); setActiveFieldSingle(null); }}
                                                        className="tag-chip-btn liquid-control px-2 py-0.5 text-[10px] font-mono text-white/70 hover:text-white"
                                                    >
                                                        {col}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Dimensions in cm + Live Imperial conversion + Expandable standard dimensions */}
                                <div className="flex flex-col gap-1.5 pt-1">
                                    <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                                        {tr('Dimensions (Length × Width × Height cm)')}
                                    </span>
                                    <div className="grid grid-cols-3 gap-2">
                                        <Field label={tr('L (cm)')} group>
                                            <Input
                                                type="number"
                                                value={lengthCm}
                                                onChange={e => setLengthCm(e.target.value)}
                                                onFocus={() => setActiveFieldSingle('dims')}
                                                onBlur={leaveFieldSingle}
                                                className="ui-tnum font-mono text-xs"
                                            />
                                        </Field>
                                        <Field label={tr('W (cm)')} group>
                                            <Input
                                                type="number"
                                                value={widthCm}
                                                onChange={e => setWidthCm(e.target.value)}
                                                onFocus={() => setActiveFieldSingle('dims')}
                                                onBlur={leaveFieldSingle}
                                                className="ui-tnum font-mono text-xs"
                                            />
                                        </Field>
                                        <Field label={tr('H (cm)')} group>
                                            <Input
                                                type="number"
                                                value={heightCm}
                                                onChange={e => setHeightCm(e.target.value)}
                                                onFocus={() => setActiveFieldSingle('dims')}
                                                onBlur={leaveFieldSingle}
                                                className="ui-tnum font-mono text-xs"
                                            />
                                        </Field>
                                    </div>
                                    {activeFieldSingle === 'dims' && (
                                        <div className="tag-chip-row flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-black/50 border border-white/10 animate-in fade-in slide-in-from-top-1 duration-150 mt-1">
                                            <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 w-full px-1">{tr('Standard Dimensions')}</span>
                                            {STANDARD_SIZE_SUGGESTIONS.map(sz => (
                                                <button
                                                    key={`${sz.l}x${sz.w}x${sz.h}`}
                                                    type="button"
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => {
                                                        setLengthCm(String(sz.l));
                                                        setWidthCm(String(sz.w));
                                                        setHeightCm(String(sz.h));
                                                        setActiveFieldSingle(null);
                                                    }}
                                                    className="tag-chip-btn liquid-control px-2.5 py-0.5 text-[10px] font-mono text-white/70 hover:text-white"
                                                >
                                                    {sz.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {(lInSingle || wInSingle || hInSingle) && (
                                        <span className="text-[11px] text-amber-300 font-mono">
                                            Imperial: {lInSingle || '0'}" × {wInSingle || '0'}" × {hInSingle || '0'}" in
                                        </span>
                                    )}
                                </div>

                                <Field label={tr('Weight (kg)')} group>
                                    <Input
                                        type="number"
                                        value={weightKg}
                                        onChange={e => setWeightKg(e.target.value)}
                                        placeholder="Weight in kg (optional)"
                                        className="ui-tnum font-mono text-xs"
                                    />
                                </Field>

                                <Field label={tr('Notes')} group>
                                    <textarea
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Catalog details or observations..."
                                        rows={2}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white resize-none focus:outline-none focus:border-(--main-color)"
                                    />
                                </Field>
                            </div>
                        </div>

                        {/* Right Column: Pricing, Photo, SAM2 Cutout & LivePreviewCard */}
                        <div className="flex flex-col gap-6">
                            {/* Photo & SAM2 Segmentation */}
                            <div className="liquid-panel p-5 flex flex-col gap-4">
                                <span className="text-xs font-black uppercase tracking-wider text-white/80">
                                    {tr('3. Photo & SAM2 Cutout')}
                                </span>

                                <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/15 hover:border-white/35 transition-all rounded-2xl p-4 bg-black/30 group">
                                    {cleanCutout || singlePhotoUrl ? (
                                        <div className="relative w-full h-44 rounded-xl overflow-hidden bg-black/50 flex items-center justify-center">
                                            <img
                                                src={cleanCutout || singlePhotoUrl!}
                                                alt=""
                                                className="w-full h-full object-contain"
                                            />
                                            {cleanCutout && (
                                                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-purple-500/80 text-white text-[9px] font-bold">
                                                    SAM2 CUTOUT
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div 
                                            onClick={() => singlePhotoInputRef.current?.click()}
                                            className="flex flex-col items-center gap-2 py-6 cursor-pointer"
                                        >
                                            <Upload className="text-white/40 group-hover:text-white transition-colors" size={32} />
                                            <span className="text-xs font-bold text-white/80">{tr('Upload Item Photo')}</span>
                                            <span className="text-[10px] text-white/40">{tr('Select .jpg, .png')}</span>
                                        </div>
                                    )}

                                    <input
                                        ref={singlePhotoInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleSinglePhotoSelect}
                                        className="hidden"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => singlePhotoInputRef.current?.click()}
                                        className="liquid-control flex-1 py-2 text-white text-xs font-bold hover:bg-white/10 text-center"
                                    >
                                        {singlePhotoUrl ? tr('Replace Photo') : tr('Upload Photo')}
                                    </button>

                                    {singlePhotoUrl && (
                                        <button
                                            type="button"
                                            onClick={handleRunSam2Single}
                                            disabled={runningSam2}
                                            className="flex-1 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-purple-500/30"
                                        >
                                            {runningSam2 ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                            {runningSam2 ? tr('Cutting out...') : tr('SAM2 Cutout')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Pricing & Financials */}
                            <div className="liquid-panel p-5 flex flex-col gap-4">
                                <span className="text-xs font-black uppercase tracking-wider text-white/80">
                                    {tr('4. Financials & Margins')}
                                </span>

                                <div className="grid grid-cols-2 gap-3">
                                    <Field label={tr('Catalog Marked Price')} group>
                                        <Input
                                            type="number"
                                            value={markedPrice}
                                            onChange={e => {
                                                setMarkedPrice(e.target.value);
                                                const p = parseFloat(e.target.value);
                                                if (!isNaN(p)) setCostMxn(String(Math.round(p * 0.70)));
                                            }}
                                            placeholder="Catalog MXN"
                                            className="ui-tnum font-mono text-xs"
                                        />
                                    </Field>
                                    <Field label={tr('Cost MXN')} group>
                                        <Input
                                            type="number"
                                            value={costMxn}
                                            onChange={e => setCostMxn(e.target.value)}
                                            placeholder="Cost MXN"
                                            className="ui-tnum font-mono font-bold text-xs text-emerald-400"
                                        />
                                    </Field>
                                </div>

                                {/* LivePreviewCard from Add Entry */}
                                <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
                                    <LivePreviewCard row={livePreviewRowSingle} />
                                </div>

                                {/* Onyx Island Primary Action Key: One colored button per Apple HIG */}
                                <Key
                                    variant="go"
                                    busy={isSaving}
                                    onClick={handleSaveSingle}
                                    className="w-full h-12 text-xs font-black uppercase tracking-wider shadow-2xl mt-2"
                                    style={{ backgroundColor: activeColor, color: activeInk, borderColor: activeColor }}
                                >
                                    <Save size={16} />
                                    {tr('Save Item to Local Staging')}
                                </Key>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mode 2: Batch Intake */}
            {mode === 'batch' && (
                <div className="flex flex-col gap-5">
                    {/* Simplified Intake Controls: Paste URL & Click Upload Buttons (NO DRAG AND DROP) */}
                    <div 
                        className="liquid-panel p-5 flex flex-col gap-4"
                        style={{ borderColor: `${activeColor}30` }}
                    >
                        {/* 1. Paste URL Bar */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <div className="relative flex-1">
                                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                                <input
                                    type="text"
                                    value={urlInput}
                                    onChange={e => setUrlInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') void handleLoadUrl(); }}
                                    placeholder="Paste Google Doc URL, Apple iCloud Shared Album URL, or Web link..."
                                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-(--main-color)"
                                    style={{ borderColor: urlInput ? `${activeColor}80` : undefined }}
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handleLoadUrl}
                                disabled={fetchingIcloud || !urlInput.trim()}
                                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shrink-0"
                                style={{ backgroundColor: activeColor, color: activeInk }}
                            >
                                {fetchingIcloud ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                                {fetchingIcloud ? tr('Connecting...') : tr('Load URL')}
                            </button>

                            {/* Direct Google Zip download if Doc ID detected */}
                            {extractGoogleDocId(urlInput) && (
                                <a
                                    href={getGoogleDocExportZipUrl(extractGoogleDocId(urlInput)!)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="liquid-control px-4 py-2.5 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-white/10 shrink-0"
                                >
                                    <Download size={14} style={{ color: activeColor }} />
                                    {tr('Download Zip from Google')}
                                </a>
                            )}
                        </div>

                        {/* URL status if available */}
                        {urlStatus && (
                            <div className="text-[11px] font-mono flex items-center gap-2" style={{ color: activeColor }}>
                                <Check size={13} />
                                <span>{urlStatus}</span>
                            </div>
                        )}

                        {/* 2. Direct Click-to-Upload Buttons (NO DRAG AND DROP) */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/5">
                            {/* Button 1: Upload Document */}
                            <button
                                type="button"
                                onClick={() => docInputRef.current?.click()}
                                disabled={parsingFile}
                                className="liquid-panel flex items-center gap-3 px-4 py-3.5 text-left group hover:bg-white/[0.04] transition-all"
                            >
                                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform" style={{ color: activeColor }}>
                                    {parsingFile ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold uppercase tracking-wider text-white truncate">
                                        {intakeFile ? intakeFile.name : tr('Upload Document')}
                                    </div>
                                    <div className="text-[10px] text-white/50 truncate">
                                        {intakeFile ? tr(`Parsed ${stagedItems.length} items (${parseResult?.format || 'OK'})`) : 'PDF, XLSX, CSV, or ZIP'}
                                    </div>
                                </div>
                            </button>
                            <input
                                ref={docInputRef}
                                type="file"
                                accept=".pdf,.xlsx,.xls,.csv,.zip"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (file.name.endsWith('.zip')) {
                                        void handleCatalogZipUpload(file);
                                    } else {
                                        void handleUniversalDocument(file);
                                    }
                                }}
                                className="hidden"
                            />

                            {/* Button 2: Upload Photos (Multi-Select) */}
                            <button
                                type="button"
                                onClick={() => photoInputRef.current?.click()}
                                className="liquid-panel flex items-center gap-3 px-4 py-3.5 text-left group hover:bg-white/[0.04] transition-all"
                            >
                                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform" style={{ color: activeColor }}>
                                    <ImageIcon size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold uppercase tracking-wider text-white truncate">
                                        {droppedPhotos.length > 0 ? `${droppedPhotos.length} ${tr('Photos Loaded')}` : tr('Upload Photos')}
                                    </div>
                                    <div className="text-[10px] text-white/50 truncate">
                                        {droppedPhotos.length > 0 ? `${stagedItems.filter(i => i.matchedPhoto || i.matchedPhotoBlob).length} matched to items` : tr('Select multiple images (.jpg, .png)')}
                                    </div>
                                </div>
                            </button>
                            <input
                                ref={photoInputRef}
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={handlePhotosDrop}
                                className="hidden"
                            />

                            {/* Button 3: Upload Folder */}
                            <button
                                type="button"
                                onClick={() => folderInputRef.current?.click()}
                                className="liquid-panel flex items-center gap-3 px-4 py-3.5 text-left group hover:bg-white/[0.04] transition-all"
                            >
                                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-white/60 group-hover:text-white">
                                    <FolderOpen size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold uppercase tracking-wider text-white truncate">
                                        {tr('Upload Folder')}
                                    </div>
                                    <div className="text-[10px] text-white/50 truncate">
                                        {tr('Select whole photo directory')}
                                    </div>
                                </div>
                            </button>
                            <input
                                ref={folderInputRef}
                                type="file"
                                multiple
                                // @ts-ignore
                                webkitdirectory=""
                                // @ts-ignore
                                directory=""
                                onChange={handlePhotosDrop}
                                className="hidden"
                            />
                        </div>

                        {/* 3. Sub-controls: Toggle Paste Text + Rules */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowTextPaste(!showTextPaste)}
                                className="flex items-center gap-2 text-xs font-bold text-white/60 hover:text-white transition-colors"
                            >
                                <MessageSquare size={13} style={{ color: activeColor }} />
                                <span>{showTextPaste ? tr('Hide Text Paste') : tr('Or paste WhatsApp text / Quotation message')}</span>
                            </button>

                            <div className="flex items-center gap-4 text-xs text-white/60">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={applyJmDiscount}
                                        onChange={e => setApplyJmDiscount(e.target.checked)}
                                        className="rounded bg-black/40 border-white/20 text-(--main-color) focus:ring-0"
                                    />
                                    <span className="text-[11px] text-amber-300 font-bold">-30% JM Discount</span>
                                </label>

                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={enableSam2Batch}
                                        onChange={e => setEnableSam2Batch(e.target.checked)}
                                        className="rounded bg-black/40 border-white/20 text-purple-400 focus:ring-0"
                                    />
                                    <span className="text-[11px] text-purple-300 font-bold">SAM2 Cutout (:8002)</span>
                                </label>
                            </div>
                        </div>

                        {/* Collapsible WhatsApp Text Paste */}
                        {showTextPaste && (
                            <div className="flex flex-col gap-3 p-4 rounded-xl bg-black/40 border border-white/10 animate-in fade-in">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white/80">
                                        {tr('Paste WhatsApp text or Notebook notes')}:
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleParseWhatsApp}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                                        style={{ backgroundColor: activeColor, color: activeInk }}
                                    >
                                        <ArrowRight size={13} />
                                        {tr('Parse Text into Items')}
                                    </button>
                                </div>
                                <textarea
                                    value={whatsappText}
                                    onChange={e => setWhatsappText(e.target.value)}
                                    placeholder="1 Galaxia 30x30x2.20 $6006 $600 = $6606..."
                                    rows={6}
                                    className="w-full bg-black/60 border border-white/15 rounded-xl p-3 text-xs font-mono text-white resize-y placeholder-white/30 focus:outline-none focus:border-(--main-color)"
                                />
                            </div>
                        )}
                    </div>

                    {/* Progress Indicator for OCR Batch */}
                    {ocrProgress && (
                        <div className="liquid-panel p-5 flex flex-col gap-3 animate-in fade-in">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold flex items-center gap-2 text-(--main-color)">
                                    <Loader2 className="animate-spin" size={16} />
                                    {tr('Extracting catalog items with free OCR...')} ({ocrProgress.done}/{ocrProgress.total})
                                </span>
                                <span className="font-mono text-white/60">
                                    {ocrProgress.total > 0 ? Math.round((ocrProgress.done / ocrProgress.total) * 100) : 0}%
                                </span>
                            </div>

                            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-(--main-color) transition-all duration-300"
                                    style={{ width: `${ocrProgress.total > 0 ? (ocrProgress.done / ocrProgress.total) * 100 : 0}%` }}
                                />
                            </div>

                            {ocrProgress.current && (
                                <div className="text-[11px] text-white/70 font-mono flex items-center gap-3">
                                    <span className="text-(--main-color) font-bold">{ocrProgress.current.code}</span>
                                    <span>{ocrProgress.current.description}</span>
                                    {ocrProgress.current.marked_price && (
                                        <span className="text-emerald-400">
                                            Marked: ${ocrProgress.current.marked_price} → Cost: ${ocrProgress.current.cost_mxn} MXN (-30%)
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Persistent Staged Items Review Table (Available in both modes if items exist) */}
            {stagedItems.length > 0 && (
                <div 
                    className="liquid-panel my-6 p-6 flex flex-col gap-4 animate-in fade-in"
                    style={{ borderColor: `${activeColor}40`, boxShadow: `0 0 30px ${activeColor}10` }}
                >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <span 
                                className="px-3 py-1 rounded-full text-xs font-black tracking-wide flex items-center gap-1.5"
                                style={{ backgroundColor: `${activeColor}20`, color: activeColor }}
                            >
                                <Database size={13} />
                                {stagedItems.length} {tr('ITEMS STAGED LOCALLY')}
                            </span>
                            <span className="text-xs text-white/50 font-mono">
                                {stagedItems.filter(i => i.matchedPhoto || i.matchedPhotoBlob || i.matchedPhotoUrl).length} {tr('with photos')}
                            </span>
                            <span className="text-[11px] text-emerald-400 font-mono">
                                ✓ {tr('Saved on device')}
                            </span>
                            {applyJmDiscount && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                    -30% JM DISCOUNT ACTIVE
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleClearStaging}
                                className="liquid-control px-3.5 py-2 text-white/60 hover:text-white text-xs font-bold"
                            >
                                {tr('Clear Staging')}
                            </button>

                            <Key
                                variant="default"
                                busy={batchImporting}
                                onClick={handleUploadLoadedToCloud}
                                className="px-6 h-11 text-xs uppercase tracking-wider font-black shadow-xl"
                                style={{ backgroundColor: activeColor, color: activeInk, borderColor: activeColor }}
                            >
                                <Cloud size={15} />
                                {batchImporting 
                                    ? tr(`Uploading ${importProgress.done}/${importProgress.total}...`) 
                                    : tr(`Upload Loaded to Showroom (${stagedItems.length})`)}
                            </Key>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar rounded-2xl border border-white/10">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-black/60 text-white/50 text-[10px] uppercase tracking-wider font-mono sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    <th className="p-3"># Code</th>
                                    <th className="p-3">{tr('Photo')}</th>
                                    <th className="p-3">{tr('Concept / Shape')}</th>
                                    <th className="p-3">{tr('Dimensions (in / cm)')}</th>
                                    <th className="p-3 text-right">{tr('Marked Price')}</th>
                                    <th className="p-3 text-right text-emerald-400">{tr('Cost MXN (-30%)')}</th>
                                    <th className="p-3 text-right">{tr('Landed USD')}</th>
                                    <th className="p-3 text-right text-(--main-color)">{tr('Retail USD')}</th>
                                    <th className="p-3 text-center">{tr('Cypher')}</th>
                                    <th className="p-3 text-center">{tr('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-mono">
                                {stagedItems.map((it) => {
                                    const effectiveCost = it.marked_price != null 
                                        ? (applyJmDiscount ? Math.round(it.marked_price * 0.70) : it.marked_price)
                                        : (it.cost_mxn || 0);
                                    const fin = computeShowroomFinancials(effectiveCost, vendor, it.code);

                                    return (
                                        <tr key={it.id} className="hover:bg-white/[0.03] transition-colors">
                                            <td className="p-3 font-bold font-mono" style={{ color: activeColor }}>{it.code}</td>
                                            <td className="p-3">
                                                {it.img_clean || it.matchedPhotoUrl ? (
                                                    <div 
                                                        className="w-10 h-10 rounded-lg overflow-hidden border bg-black/40 relative group cursor-pointer" 
                                                        style={{ borderColor: `${activeColor}60` }}
                                                        onClick={() => setEditingItem(it)}
                                                    >
                                                        <img src={it.img_clean || it.matchedPhotoUrl!} alt="" className="w-full h-full object-cover" />
                                                        {it.img_clean && (
                                                            <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-purple-400" title="SAM2 cutout ready" />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div 
                                                        onClick={() => setEditingItem(it)}
                                                        className="w-10 h-10 rounded-lg bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-white/20 hover:text-white/50 cursor-pointer"
                                                    >
                                                        <ImageIcon size={14} />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                <div className="font-bold text-white/90">{it.shape || 'Torre'}</div>
                                                <div className="text-[10px] text-white/40">{it.material || 'Onyx'} {it.color}</div>
                                            </td>
                                            <td className="p-3 text-white/70">
                                                <div>{it.dimensions_in || (it.length_cm ? `${it.length_cm}x${it.width_cm}x${it.height_cm} cm` : '-')}</div>
                                                {it.dimensions_cm && it.dimensions_in && (
                                                    <div className="text-[10px] text-white/40">{it.dimensions_cm}</div>
                                                )}
                                            </td>
                                            <td className="p-3 text-right text-white/50">
                                                {it.marked_price ? `$${it.marked_price.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="p-3 text-right font-bold text-emerald-400">
                                                ${effectiveCost.toLocaleString()}
                                                {it.marked_price && applyJmDiscount && (
                                                    <span className="block text-[9px] text-amber-300 font-normal">-30%</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right text-white/70">
                                                ${fin.landed_cost}
                                            </td>
                                            <td className="p-3 text-right font-black" style={{ color: activeColor }}>
                                                ${fin.retail_price}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-white/60">
                                                    {fin.book_aq_code}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingItem(it)}
                                                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                                                        title={tr('Edit item')}
                                                    >
                                                        <Edit3 size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteStagedItem(it.id)}
                                                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                                                        title={tr('Delete item')}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal for Editing Staged Items */}
            {editingItem && (
                <EditStagedItemModal
                    item={editingItem}
                    vendorColor={activeColor}
                    vendorInk={activeInk}
                    typeLib={typeLib}
                    onSave={handleUpdateStagedItem}
                    onDelete={handleDeleteStagedItem}
                    onClose={() => setEditingItem(null)}
                />
            )}
        </div>
    );
}