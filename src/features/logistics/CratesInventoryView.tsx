import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai/react';
import { Box, Plus, Search, Package, ArrowRight, X, CheckCircle2, Loader2, FileText, ChevronDown, ChevronUp, LayoutGrid, ImageOff, Download, Trash2, RotateCcw, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useDatabase } from '../../lib/hooks';
import { cratesVersionAtom, logisticsSubTabAtom, isDummyModeAtom, inventoryAtom, liveExchangeRateAtom } from '../../lib/atoms';
import { getCrateInternalVolume, getItemPaddedVolume, getCleanImageUrl, normalizeInventoryData, calculateCodesAndPrices } from '../../lib/utils';
import { exportCrateManifesto, type ManifestoItem, type ManifestoMeta } from '../../lib/crateManifesto';
import { ExportWizard } from '../../components/ExportWizard';
import { vendors } from '../../lib/consts';

// ─── Wireframe Crate SVG ─────────────────────────────────────────────────────
const WireframeCrate: React.FC<{ w?: number; l?: number; h?: number; status?: string; type?: string; count?: number; fillPct?: number }> = ({
    w = 60, l = 60, h = 60, status = 'Empty', type = 'crate', count = 1, fillPct = 0
}) => {
    const visH = type === 'pallet' ? 15 : h;
    const maxDim = Math.max(w, l, visH, 1);
    const scale = 56 / maxDim;
    const dw = Math.round(w * scale);
    const dl = Math.round(l * scale);
    const dh = Math.round(visH * scale);
    const depth = Math.round(dl * 0.38);

    const accentColor =
        status === 'Packed' ? '#f87171'
        : status === 'Partial' ? '#fbbf24'
        : type === 'cardboard' ? '#d97706' // Cardboard brown
        : 'var(--main-color)';

    const maxCount = Math.min(count, 5);
    const svgW = dw + depth + 6;
    const svgH = dh + depth + 6 + (maxCount - 1) * 8;

    const dx = depth, dy = -depth;

    return (
        <svg
            width={svgW} height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="overflow-visible drop-shadow-lg"
            style={{ filter: `drop-shadow(0 0 6px ${accentColor}33)` }}
        >
            {Array.from({ length: maxCount }).map((_, i) => {
                // Stack downwards to simulate empty crates stacked on each other
                const stackYSpacing = 8;
                const offsetY = i * stackYSpacing;
                const x0 = 3, y0 = depth + 3 + offsetY;
                const x1 = x0 + dw, y1 = y0;
                const x2 = x1, y2 = y0 + dh;
                const x3 = x0, y3 = y0 + dh;

                return (
                    <g key={i}>
                        {/* Back dashed edges */}
                        <line x1={x0 + dx} y1={y0 + dy} x2={x0 + dx} y2={y3 + dy} stroke={accentColor} strokeWidth="0.7" strokeDasharray="2.5,2.5" opacity="0.4" />
                        <line x1={x0 + dx} y1={y0 + dy} x2={x1 + dx} y2={y1 + dy} stroke={accentColor} strokeWidth="0.7" strokeDasharray="2.5,2.5" opacity="0.4" />
                        <line x1={x0 + dx} y1={y3 + dy} x2={x1 + dx} y2={y2 + dy} stroke={accentColor} strokeWidth="0.7" strokeDasharray="2.5,2.5" opacity="0.4" />

                        {/* Top face */}
                        <polygon
                            points={`${x0},${y0} ${x0+dx},${y0+dy} ${x1+dx},${y1+dy} ${x1},${y1}`}
                            fill={`${accentColor}08`}
                            stroke={accentColor} strokeWidth="1"
                        />
                        {/* Right face */}
                        <polygon
                            points={`${x1},${y1} ${x1+dx},${y1+dy} ${x1+dx},${y2+dy} ${x1},${y2}`}
                            fill={`${accentColor}05`}
                            stroke={accentColor} strokeWidth="1"
                        />
                        {/* Front face */}
                        <rect x={x0} y={y0} width={dw} height={dh}
                            fill={`${accentColor}07`}
                            stroke={accentColor} strokeWidth="1.2"
                        />
                        
                        {/* Fill Visualization (Front face overlay) */}
                        {fillPct > 0 && (
                            <rect 
                                x={x0 + 1.5} 
                                y={y0 + dh - (dh * (fillPct / 100)) + 1.5} 
                                width={dw - 3} 
                                height={(dh * (fillPct / 100)) - 3}
                                fill={accentColor}
                                fillOpacity="0.25"
                                rx="1"
                                className="animate-pulse"
                            />
                        )}

                        {/* Cross braces */}
                        {type !== 'pallet' && (
                            <>
                                <line x1={x0} y1={y0} x2={x1} y2={y2} stroke={accentColor} strokeWidth="0.5" opacity="0.25" />
                                <line x1={x1} y1={y0} x2={x0} y2={y2} stroke={accentColor} strokeWidth="0.5" opacity="0.25" />
                            </>
                        )}
                        
                        {/* Fill % Text overlay */}
                        {fillPct > 0 && (
                            <text 
                                x={x0 + dw/2} 
                                y={y0 + dh/2 + 2} 
                                textAnchor="middle" 
                                className="text-[10px] font-black fill-white pointer-events-none drop-shadow-md"
                                style={{ fontSize: '7px' }}
                            >
                                {Math.round(fillPct)}%
                            </text>
                        )}
                    </g>
                );
            }).reverse() /* Draw bottom-up for correct z-indexing perspective */}
        </svg>
    );
};

// --- Local Crate Type ---
interface CrateRecord {
    id: string;
    type: string;
    status: 'Empty' | 'Packed' | 'Partial';
    length_cm: number;
    width_cm: number;
    height_cm: number;
    weight_kg?: number;
    brute_weight_kg?: number;
    contents_summary?: string;
    description?: string;
    inventory_ids?: string;
    quantity?: number;
    cost_mxn?: number;
    date?: string;
    updated_at?: string;
    groupedCount?: number;
    groupedIds?: string[];
}

// --- Extract item number from workbook barcode ---
// Barcode format: VendorCode + '326' + ItemCount + LdCode  (e.g. EM32612HMF)
// Strip vendor prefix, then strip '326', then grab leading digits.
function extractItemNumFromBarcode(barcode: string, vendorPrefix: string): number {
    if (!barcode) return 0;
    let s = barcode.startsWith(vendorPrefix) ? barcode.slice(vendorPrefix.length) : barcode;
    if (s.startsWith('326')) s = s.slice(3);  // strip book version
    const m = s.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

// Format components for space-separated tags
function getDynamicCrateIdComponents(crate: CrateRecord, allCrates: CrateRecord[], allInventory: any[]) {
    if (!crate.inventory_ids || crate.status === 'Empty') return { date: '', vendors: [], sequence: crate.id.slice(0, 8).toUpperCase() };
    
    const d = crate.updated_at ? new Date(crate.updated_at) : (crate.date ? new Date(crate.date) : new Date());
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const datePrefix = `${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
    
    const vSet = new Set<string>();
    crate.inventory_ids.split(',').filter(Boolean).forEach(entry => {
        const [id] = entry.split(':');
        const inv = allInventory.find((i: any) => String(i.row) === id);
        if (inv?.data) {
            const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0];
            if (p) vSet.add(p.toUpperCase());
        }
    });
    const vendorsList = Array.from(vSet).sort();
    const vendorsStr = vendorsList.join('');
    
    const matchingCrates = allCrates.filter(c => {
        if (c.status === 'Empty' || !c.inventory_ids) return false;
        const cVSet = new Set<string>();
        c.inventory_ids.split(',').filter(Boolean).forEach(entry => {
            const [id] = entry.split(':');
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (inv?.data) {
                const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0];
                if (p) cVSet.add(p.toUpperCase());
            }
        });
        return Array.from(cVSet).sort().join('') === vendorsStr;
    });

    matchingCrates.sort((a, b) => {
        const tA = (a.updated_at || a.date) ? new Date(a.updated_at || a.date!).getTime() : 0;
        const tB = (b.updated_at || b.date) ? new Date(b.updated_at || b.date!).getTime() : 0;
        return tA === tB ? a.id.localeCompare(b.id) : tA - tB;
    });

    const index = matchingCrates.findIndex(c => c.id === crate.id);
    const sequence = index >= 0 ? index + 1 : 1;

    return { date: datePrefix, vendors: vendorsList, sequence: String(sequence) };
}

// Format: [Month(1-12)][Year(2 digits)][Vendors Combined][Sequence #] 
// e.g., April 2026, EM + GE, 1st crate -> 426EMGE1
function generateDynamicCrateId(crate: CrateRecord, allCrates: CrateRecord[], allInventory: any[]): string {
    const { date, vendors, sequence } = getDynamicCrateIdComponents(crate, allCrates, allInventory);
    if (!date) return sequence;
    return `${date}${vendors.join('')}${sequence}`;
}

// --- Status Badge ---
const StatusBadge = ({ status }: { status: CrateRecord['status'] }) => {
    const styles: Record<string, string> = {
        Empty: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        Partial: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        Packed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${styles[status] || styles.Empty}`}>
            {status}
        </span>
    );
};

// --- Crate Card ---
const CrateCard = ({ crate, allCrates, allInventory, onPack, onDelete, isDeployedView = false, isPackedView = false }: { crate: CrateRecord; allCrates: CrateRecord[]; allInventory: any[]; onPack: (c: CrateRecord) => void; onDelete: (c: CrateRecord) => void; isDeployedView?: boolean; isPackedView?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [exportMethod, setExportMethod] = useState<'images' | 'no-images'>('images');
    const [exportNotes, setExportNotes] = useState('');
    const [exportBruteWeight, setExportBruteWeight] = useState('');
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');
    const [isExportProgressOpen, setIsExportProgressOpen] = useState(false);
    const liveRate = useAtomValue(liveExchangeRateAtom) || 18.0;

    const dynamicId = useMemo(() => generateDynamicCrateId(crate, allCrates, allInventory), [crate, allCrates, allInventory]);
    
    const itemCount = crate.inventory_ids ? crate.inventory_ids.split(',').filter(Boolean).length : 0;
    const netWeight = ((crate.weight_kg ?? 0) * (crate.quantity ?? 1));
    const vol = ((crate.width_cm ?? 0) * (crate.length_cm ?? 0) * (crate.height_cm ?? 0) / 1_000_000).toFixed(3);

    const { getItemsRecursive, getUsedVolRecursive } = useMemo(() => {
        const getItems = (c: any, parentLabel?: string, visited = new Set<string>()): any[] => {
            if (!c || visited.has(c.id)) return [];
            visited.add(c.id);
            
            let res: any[] = [];
            if (c.inventory_ids) {
                c.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
                    const [id, qtyStr] = entry.split(':');
                    const qty = parseInt(qtyStr || '1', 10) || 1;
                    const inv = allInventory.find(i => String(i.row) === id);
                    if (inv) {
                        const norm = normalizeInventoryData(inv.data);
                        const urls = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
                        res.push({
                            id, qty, norm, packetIn: parentLabel,
                            mainImage: getCleanImageUrl(norm.generatedPngUrl || (urls.length > 0 ? urls[0] : null))
                        });
                    }
                });
            }
            const nested = allCrates.filter(nu => nu.parent_id === c.id);
            nested.forEach(n => {
                const { label } = getCrateDisplayName(n, allCrates, allInventory);
                res = [...res, ...getItems(n, label, visited)];
            });
            return res;
        };

        const getVol = (c: any, visited = new Set<string>()): number => {
            if (!c || visited.has(c.id)) return 0;
            visited.add(c.id);

            let v = 0;
            if (c.inventory_ids) {
                c.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
                    const [id, qtyStr] = entry.split(':');
                    const qty = parseInt(qtyStr || '1', 10) || 1;
                    const inv = allInventory.find(i => String(i.row) === id);
                    if (inv) v += getItemPaddedVolume(inv.data, qty);
                });
            }
            const nested = allCrates.filter(nu => nu.parent_id === c.id);
            nested.forEach(n => {
                v += (n.width_cm || 0) * (n.length_cm || 0) * (n.height_cm || 0);
                v += getVol(n, visited); // Also count items inside nested units? 
                // Actually, getItemPaddedVolume for the unit itself handles the unit's space.
                // If we nest BOX B in CRATE A, the volume taken in A is B's external dims.
            });
            return v;
        };

        return { getItemsRecursive: getItems, getUsedVolRecursive: getVol };
    }, [allCrates, allInventory]);

    const fillPct = useMemo(() => {
        const internalVol = (crate.width_cm || 1) * (crate.length_cm || 1) * (crate.height_cm || 1);
        if (internalVol <= 0) return 0;
        return Math.min(100, (getUsedVolRecursive(crate) / internalVol) * 100);
    }, [crate, getUsedVolRecursive]);

    const packedItems = useMemo(() => getItemsRecursive(crate), [crate, getItemsRecursive]);

    const handleStartExport = async (cfg: any) => {
        if (packedItems.length === 0) return toast.error('Crate is empty');
        const tid = toast.loading('Generating Manifesto PDF...');
        setIsExporting(true);
        try {
            const manifestoItems: ManifestoItem[] = packedItems.map((item, idx) => {
                const d = normalizeInventoryData(item.norm);
                const c = calculateCodesAndPrices(d, liveRate, '326');
                const vendorPrefix = String(d.vendor_id || d.itemId || '').split('-')[0] || 'UNK';
                const rawUrls = d.mediaUrls ? String(d.mediaUrls).split(',').map((u: string) => u.trim()).filter(Boolean) : [d.generatedPngUrl];
                const imageUrls = rawUrls.map(u => getCleanImageUrl(u));
                
                return {
                    index: idx + 1,
                    vendorPrefix,
                    qty: item.qty,
                    itemId: c.bookBarcode || d.itemId || 'N/A',
                    rowId: item.id,
                    name: `${d.shape || ''} ${d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE',
                    material: d.material || 'ONYX',
                    color: d.color || '',
                    dims: `${d.widthCm || 0}×${d.heightCm || 0}×${d.lengthCm || 0} cm`,
                    weightKg: Number(d.weightKg || 0),
                    costMxn: Number(d.price || 0),
                    costUsd: Number(c.bookAcquisition || 0),
                    imageUrls,
                    tagColor: (vendors as any)[vendorPrefix]?.color || '#555',
                    dbItemCount: Number(d.quantity || 0)
                };
            });

            await exportCrateManifesto(manifestoItems, {
                dynamicId,
                crateId: crate.id,
                crateDims: `${crate.width_cm}×${crate.length_cm}×${crate.height_cm} cm`,
                crateType: (crate.type === 'cardboard' || (crate.width_cm == 38 && crate.length_cm == 41 && crate.height_cm == 38)) ? 'box' : crate.type,
                fillPct,
                exportedAt: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' }),
                exportNotes: cfg.notes?.trim() || '',
                exportBruteWeight: cfg.bruteWeight?.trim() || undefined,
                excludeImages: !cfg.includeImages,
                crateColor: (vendors as any)[dynamicId.split('-')[0]]?.color,
                customTitle: cfg.title
            }, (pct) => {
                setExportProgress(pct);
                setExportStatus(`Assembling page vectors: ${pct}%`);
            });
            
            toast.success('Manifesto PDF Downloaded', { id: tid });
        } catch (e) {
            console.error('Manifesto Export Error:', e);
            toast.error('Failed to generate PDF', { id: tid });
        } finally {
            setIsExporting(false);
            setIsExportProgressOpen(false);
            setExportProgress(0);
        }
    };

    return (
        <div className="group relative transition-all duration-500 w-full flex flex-col py-6 px-6 bg-white/[0.03] border border-white/10 backdrop-blur-md rounded-3xl mb-4 hover:border-(--main-color)/40">

            {/* Main Row */}
            <div className="p-4 flex flex-col xl:flex-row items-stretch xl:items-center gap-4 xl:gap-6 relative">
                {/* Wireframe preview window */}
                <div className="relative w-full xl:w-56 h-44 xl:h-36 shrink-0 flex items-center justify-center overflow-hidden cursor-pointer group/wire" onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="absolute inset-0 opacity-[0.04]" style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                    }} />
                    <div className="scale-110">
                        <WireframeCrate
                            w={crate.width_cm}
                            l={crate.length_cm}
                            h={crate.height_cm}
                            status={crate.status}
                            type={crate.type}
                            count={crate.groupedCount || 1}
                            fillPct={fillPct}
                        />
                    </div>
                    <div className="absolute top-0 left-0">
                        <StatusBadge status={crate.status} />
                    </div>
                </div>

                {/* Info & Stats */}
                <div className="flex-1 min-w-0 flex flex-col xl:flex-row items-stretch xl:items-center gap-6 xl:gap-12">
                    {/* Crate ID — barcode for packed crates, text for empty */}
                    <div className="min-w-0 xl:min-w-[160px] flex flex-row xl:flex-col items-center xl:items-start justify-between xl:justify-start gap-2">
                        {crate.status !== 'Empty' ? (
                            <div className="mb-0 xl:mb-3 flex items-center shrink-0">
                                <div className="flex items-center">
                                    {(() => {
                                        const { date, vendors: vList, sequence } = getDynamicCrateIdComponents(crate, allCrates, allInventory);
                                        return (
                                            <>
                                                {date && (
                                                    <div className="bg-white/10 px-2 py-1">
                                                        <span className="text-[16px] font-black text-white tracking-[0.1em] leading-none block">{date}</span>
                                                    </div>
                                                )}
                                                {vList.map((v, idx) => (
                                                    <div 
                                                        key={v} 
                                                        className="px-2 py-1"
                                                        style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }}
                                                    >
                                                        <span className="text-[16px] font-black tracking-[0.1em] leading-none block text-black">{v}</span>
                                                    </div>
                                                ))}
                                                {sequence && (
                                                    <div className="px-3 py-1 bg-white/5">
                                                        <span className="text-[16px] font-black tracking-[0.1em] leading-none block text-white/90">{sequence}</span>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        ) : (
                            <p className="text-[11px] font-mono font-black tracking-[0.3em] text-white/40 uppercase">
                                {crate.id?.slice(0, 8).toUpperCase()}
                            </p>
                        )}
                        <div className="flex flex-col items-end xl:items-start text-right xl:text-left">
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-white leading-none">
                                {crate.width_cm}<span className="text-white/40 mx-0.5">×</span>{crate.length_cm}<span className="text-white/40 mx-0.5">×</span>{crate.height_cm}
                                <span className="text-[10px] text-white/40 font-black ml-1.5 tracking-widest">CM</span>
                            </h3>
                            {crate.groupedCount && crate.groupedCount > 1 && (
                                <p className="text-[10px] font-black text-(--main-color) mt-2 uppercase tracking-[0.2em]">
                                    {crate.groupedCount} UNITS AVAILABLE
                                </p>
                            )}

                            {/* Repositioned Description / Summary */}
                            <div className="mt-4 hidden lg:block max-w-[280px]">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mb-1.5">Contents / Notes</p>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            placeholder="BRUTE KG" 
                                            defaultValue={crate.brute_weight_kg || ''}
                                            onBlur={async (e) => {
                                                const val = parseFloat(e.target.value);
                                                if (isNaN(val)) return;
                                                const tid = toast.loading('Saving weight...');
                                                try {
                                                    const payload = { brute_weight_kg: val, updated_at: new Date().toISOString() };
                                                    await supabase.from('logistics').update(payload).eq('id', crate.id);
                                                    const db = (window as any).onyxDb;
                                                    if (db) {
                                                        const lDoc = await db.logistics.findOne({ selector: { id: crate.id } }).exec();
                                                        if (lDoc) await lDoc.patch(payload);
                                                    }
                                                    toast.success('Weight recorded', { id: tid });
                                                } catch (err) {
                                                    toast.error('Failed to save', { id: tid });
                                                }
                                            }}
                                            className="w-20 bg-white/5 border border-white/10 px-2 py-1 text-[10px] font-mono text-(--main-color) focus:outline-none focus:border-(--main-color)/50 transition"
                                        />
                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">BRUTE WEIGHT</span>
                                    </div>
                                    {crate.contents_summary ? (
                                        <p className="text-[11px] text-white/80 font-medium italic line-clamp-2 leading-relaxed">{crate.contents_summary}</p>
                                    ) : crate.description ? (
                                        <p className="text-[11px] text-white/60 line-clamp-2 font-mono italic leading-relaxed">{crate.description}</p>
                                    ) : (
                                        <p className="text-[11px] text-white/20 italic">No notes provided</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:flex sm:flex-row gap-4 xl:gap-10 xl:min-w-[240px] w-full mt-4 xl:mt-0">
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black leading-none">Volume</p>
                            <p className="text-[17px] font-mono font-black text-white leading-none">{vol} <span className="text-[9px] font-black text-white/20">M³</span></p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black leading-none">Net Weight</p>
                            <p className="text-[17px] font-mono font-black text-(--main-color) leading-none">
                                {netWeight > 0 ? netWeight.toFixed(1) : '—'} <span className="text-[9px] font-black text-white/20">KG</span>
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black leading-none">Utilization</p>
                            <p className={`text-[17px] font-mono font-black leading-none ${fillPct > 90 ? 'text-rose-400' : fillPct > 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {fillPct.toFixed(1)}%
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5 text-center xl:text-left">
                            <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black leading-none">Inventory</p>
                            <p className="text-[17px] font-mono font-black text-white leading-none">{itemCount} <span className="text-[9px] font-black text-white/20">ITEMS</span></p>
                        </div>
                    </div>

                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row xl:flex-col gap-2 shrink-0 h-full justify-center w-full xl:w-auto mt-2 xl:mt-0">
                    {crate.status !== 'Empty' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsExportProgressOpen(true)}
                                className={`flex items-center justify-center w-12 h-12 bg-white/5 border border-white/8 hover:bg-emerald-500/10 hover:border-emerald-500/40 text-white/20 hover:text-emerald-500 rounded-2xl transition-all duration-300 cursor-pointer ${isExporting ? 'opacity-50 pointer-events-none' : ''}`}
                                title="Export Manifesto"
                            >
                                <Download size={18} />
                            </button>
                            
                            <ExportWizard 
                                isOpen={isExportProgressOpen}
                                onClose={() => { setIsExportProgressOpen(false); setExportProgress(0); }}
                                onStart={handleStartExport}
                                progress={exportProgress}
                                status={exportStatus}
                                moduleName={crate.type === 'pallet' ? 'Pallet' : (crate.type === 'cardboard' || (crate.width_cm == 38 && crate.length_cm == 41 && crate.height_cm == 38)) ? 'Box' : 'Crate'}
                                showBruteWeight={true}
                                initialBruteWeight={crate.brute_weight_kg ? String(crate.brute_weight_kg) : ''}
                            />
                        </div>
                    )}
                    <button
                        onClick={() => onPack(crate)}
                        className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all duration-300 cursor-pointer border ${
                            isDeployedView
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/60'
                                : isPackedView
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/60'
                                : 'bg-white/5 border-white/8 hover:bg-(--main-color)/10 hover:border-(--main-color)/40 text-white/50 hover:text-(--main-color)'
                        }`}
                    >
                        {isDeployedView ? (
                            <><RotateCcw size={14} />Return to Packing</>
                        ) : isPackedView ? (
                            <><RotateCcw size={14} />Re-open &amp; Pack More</>
                        ) : (
                            <>Pack Items <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" /></>
                        )}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(crate); }}
                        className="flex items-center justify-center w-12 h-12 bg-white/5 border border-white/8 hover:bg-rose-500/10 hover:border-rose-500/40 text-white/20 hover:text-rose-500 rounded-2xl transition-all duration-300 cursor-pointer"
                        title="Delete Crate"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* Expandable Packed Contents List */}
            {isExpanded && crate.status !== 'Empty' && packedItems.length > 0 && (
                <div className="border-t border-white/5 bg-black/20 p-4 max-h-64 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-300">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3 px-1">{dynamicId} — Packing List</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {packedItems.map((item, idx) => (
                            <div key={`${item.id}-${idx}`} className="flex items-center gap-3 bg-white/2 border border-white/5 rounded-xl p-2 hover:bg-white/5 transition-colors">
                                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-black/50">
                                    {item.mainImage ? <img src={item.mainImage} className="w-full h-full object-cover" /> : <div className="w-full h-full border border-white/10" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-white truncate">{item.norm.shape || ''} {item.norm.shortDescription || item.norm.description || ''}</p>
                                    <p className="text-[8px] font-mono text-white/40">{item.norm.itemId || 'UNK'}</p>
                                </div>
                                <div className="w-auto px-2 py-1 bg-white/5 text-[10px] font-black font-mono text-(--main-color)">
                                    x{item.qty}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Crate Creation Modal ---
const CrateCreationModal = ({ isOpen, onClose, onRefresh }: { isOpen: boolean; onClose: () => void; onRefresh: () => void }) => {
    const db = useDatabase();
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ type: 'crate', width: '', length: '', height: '', quantity: '1', price: '', description: '' });
    const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

    if (!isOpen) return null;

    const totalCost = (parseFloat(form.quantity) || 0) * (parseFloat(form.price) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const qty = parseInt(form.quantity) || 1;
        const price = parseFloat(form.price) || 0;
        const w = parseFloat(form.width) || 0;
        const l = parseFloat(form.length) || 0;
        const h = parseFloat(form.height) || 0;
        if (!w || !l || !h) return toast.error('Enter all three dimensions.');

        setLoading(true);
        const tid = toast.loading(`Initializing ${qty} ${form.type}(s)…`);
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                toast.success(`${qty} ${form.type}(s) initialized. (Demo Mode)`, { id: tid, icon: '🧪' });
                onRefresh();
                onClose();
                return;
            }
            const now = new Date().toISOString();
            const crateRows = Array.from({ length: qty }, (_, i) => ({
                type: form.type,
                status: 'Empty',
                width_cm: w, length_cm: l, height_cm: h,
                cost_mxn: price,
                description: form.description || `${form.type.charAt(0).toUpperCase() + form.type.slice(1)} ${i + 1}/${qty}: ${w}×${l}×${h} cm`,
                contents_summary: '',
                quantity: 1,
                date: now,
                updated_at: now,
                inventory_ids: '',
            }));

            const { data: logData, error: logErr } = await supabase.from('logistics').insert(crateRows).select();
            if (logErr) throw logErr;

            if (db && logData) {
                for (const row of logData) {
                    try { await db.logistics.insert({ ...row, id: String(row.id) }); } catch (_) {}
                }
            }

            toast.success(`${qty} ${form.type}(s) initialized.`, { id: tid });
            onRefresh();
            onClose();
            setForm({ type: 'crate', width: '', length: '', height: '', quantity: '1', price: '', description: '' });
        } catch (err: any) {
            toast.error(err.message || 'Failed to create crates.', { id: tid });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-[#0a0a0a] border border-white/10 overflow-hidden shadow-2xl flex flex-col relative">
                <div className="absolute top-0 inset-x-0 h-0.5 bg-linear-to-r from-transparent via-(--main-color)/60 to-transparent" />

                <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <Package size={18} className="text-(--main-color)" />
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">Initialize Storage Protocol</h2>
                            <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] mt-0.5">Dimensional constraints + cost basis</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white hover:bg-white/5 transition-all cursor-pointer">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-8 py-7 flex flex-col gap-6">
                    <div className="flex bg-white/5 border border-white/10 p-1">
                        <button type="button" onClick={() => set('type', 'crate')} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest transition ${form.type === 'crate' ? 'bg-(--main-color) text-black' : 'text-white/40 hover:text-white cursor-pointer'}`}>
                            Crate
                        </button>
                        <button type="button" onClick={() => set('type', 'pallet')} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest transition ${form.type === 'pallet' ? 'bg-(--main-color) text-black' : 'text-white/40 hover:text-white cursor-pointer'}`}>
                            Pallet
                        </button>
                        <button type="button" onClick={() => set('type', 'cardboard')} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest transition ${form.type === 'cardboard' ? 'bg-[#d97706] text-black' : 'text-white/40 hover:text-white cursor-pointer'}`}>
                            Box
                        </button>
                    </div>

                    <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Dimensions (cm)</p>
                        <div className="grid grid-cols-3 gap-3">
                            {[['Width', 'width'], ['Length', 'length'], ['Height', 'height']].map(([label, key]) => (
                                <div key={key}>
                                    <label className="text-[8px] font-black uppercase tracking-widest text-white/20 block mb-1.5">{label}</label>
                                    <input
                                        type="number" step="0.1" min="0" required
                                        value={form[key as keyof typeof form]}
                                        onChange={e => set(key as any, e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-white/5 border border-white/10 px-3 py-3 text-sm font-mono text-white focus:outline-none focus:border-(--main-color)/50 transition placeholder:text-white/15"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-white/20 block mb-1.5">Quantity</label>
                            <input
                                type="number" min="1" required
                                value={form.quantity}
                                onChange={e => set('quantity', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 px-3 py-3 text-sm font-mono text-white focus:outline-none focus:border-(--main-color)/50 transition"
                            />
                        </div>
                        <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-white/20 block mb-1.5">Price per item (MXN)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 font-mono text-sm">$</span>
                                <input
                                    type="number" step="0.01" min="0"
                                    value={form.price}
                                    onChange={e => set('price', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-white/5 border border-white/10 pl-7 pr-3 py-3 text-sm font-mono text-white focus:outline-none focus:border-(--main-color)/50 transition placeholder:text-white/15"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20 block mb-1.5">Notes (optional)</label>
                        <input
                            type="text"
                            value={form.description}
                            onChange={e => set('description', e.target.value)}
                            placeholder="Internal reference..."
                            className="w-full bg-white/5 border border-white/10 px-3 py-3 text-sm text-white/70 focus:outline-none focus:border-(--main-color)/50 transition placeholder:text-white/15"
                        />
                    </div>

                    {totalCost > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 bg-(--main-color)/5 border border-(--main-color)/15">
                            <span className="text-[9px] font-black uppercase tracking-widest text-(--main-color)/70">Total Acquisition Cost</span>
                            <span className="font-mono font-black text-(--main-color) text-sm">${totalCost.toLocaleString()} MXN</span>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/8 hover:border-white/20 transition-all cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="submit" disabled={loading}
                            className={`flex-2 py-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer ${loading ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-(--main-color) text-black hover:scale-[1.01] active:scale-[0.99] shadow-xl shadow-(--main-color)/20'}`}
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {loading ? 'Initializing…' : 'Deploy Units'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export const CratesInventoryView: React.FC = () => {
    const db = useDatabase();
    const [, setCratesVersion] = useAtom(cratesVersionAtom);
    const [, setSubTab] = useAtom(logisticsSubTabAtom);
    const [activeTab, setActiveTab] = useState<'empty' | 'packed' | 'deployed'>('empty');
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [crates, setCrates] = useState<CrateRecord[]>([]);
    const allInventory = useAtomValue(inventoryAtom);
    const isDummyMode = useAtomValue(isDummyModeAtom);

    useEffect(() => {
        if (!db) return;
        let timer: any;
        const sub = db.logistics.find({ selector: { type: { $in: ['crate', 'pallet', 'cardboard'] } } }).$.subscribe((data: any[]) => {
            clearTimeout(timer);
            timer = setTimeout(() => setCrates(data.map(c => c.toJSON())), 150);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db]);

    const handleRefresh = () => setCratesVersion(v => v + 1);

    const handleDeleteCrate = async (crate: CrateRecord) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE this ${crate.type}? This action cannot be undone.`)) return;

        const tid = toast.loading(`Deleting ${crate.type}...`);

        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                toast.success("Crate deleted (Demo Mode)", { id: tid, icon: '🧪' });
                handleRefresh();
                return;
            }

            // 1. If it has items, release them first (update inventory crate_id to null)
            if (crate.inventory_ids) {
                const itemIds = crate.inventory_ids.split(',').filter(Boolean).map(entry => entry.split(':')[0]);
                if (itemIds.length > 0) {
                    await supabase.from('inventory').update({ crate_id: null }).in('id', itemIds);
                    if (db) {
                        for (const id of itemIds) {
                            try {
                                const lDoc = await db.inventory.findOne({ selector: { id } }).exec();
                                if (lDoc) await lDoc.patch({ crate_id: null });
                            } catch (_) {}
                        }
                    }
                }
            }

            // 2. Delete from Supabase
            const { error: delErr } = await supabase.from('logistics').delete().eq('id', crate.id);
            if (delErr) throw delErr;

            // 3. Delete from RxDB
            if (db) {
                const localCrate = await db.logistics.findOne({ selector: { id: crate.id } }).exec();
                if (localCrate) await localCrate.remove();
            }

            toast.success("Crate permanently deleted", { id: tid });
            handleRefresh();
        } catch (err: any) {
            toast.error(err.message || 'Delete failed.', { id: tid });
        }
    };

    const handleReturnToPacking = async (crate: CrateRecord) => {
        const tid = toast.loading('Returning crate to packing state...');
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 800));
                toast.success('Crate returned to Packed (Demo Mode)', { id: tid, icon: '🧪' });
                handleRefresh();
                return;
            }
            // Reset status to Packed so it re-appears in Packed Crates and can be re-loaded
            const { error } = await supabase
                .from('logistics')
                .update({ status: 'Packed', description: null })
                .eq('id', crate.id);
            if (error) throw error;
            if (db) {
                const lDoc = await db.logistics.findOne({ selector: { id: crate.id } }).exec();
                if (lDoc) await lDoc.patch({ status: 'Packed', description: null });
            }
            toast.success('Crate returned to Packed Crates', { id: tid });
            handleRefresh();
        } catch (err: any) {
            toast.error(err.message || 'Failed to reset crate', { id: tid });
        }
    };

    const filteredCrates = useMemo(() => {
        return crates.filter(c => {
            const matchesTab =
                activeTab === 'empty'    ? c.status === 'Empty' :
                activeTab === 'packed'   ? (c.status === 'Packed' || c.status === 'Partial') :
                /* deployed */             (c.status === 'In Transit' || c.status === 'Deployed');
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q
                || c.id?.toLowerCase().includes(q)
                || c.contents_summary?.toLowerCase().includes(q)
                || c.description?.toLowerCase().includes(q);
            return matchesTab && matchesSearch;
        });
    }, [crates, activeTab, searchQuery]);

    const displayCrates = useMemo(() => {
        if (activeTab === 'packed') {
            const getVendors = (c: CrateRecord) => {
                if (!c.inventory_ids) return 'ZZZZ';
                const vSet = new Set<string>();
                c.inventory_ids.split(',').filter(Boolean).forEach(entry => {
                    const [id] = entry.split(':');
                    const inv = allInventory.find((i: any) => String(i.row) === id);
                    if (inv && inv.data) {
                        const prefix = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0] || 'UNK';
                        if (prefix) vSet.add(prefix.toUpperCase());
                    }
                });
                return Array.from(vSet).sort().join(',');
            };

            return [...filteredCrates].sort((a, b) => {
                const vA = getVendors(a);
                const vB = getVendors(b);
                if (vA !== vB) return vA.localeCompare(vB);
                
                const tA = (a.updated_at || a.date) ? new Date(a.updated_at || a.date!).getTime() : 0;
                const tB = (b.updated_at || b.date) ? new Date(b.updated_at || b.date!).getTime() : 0;
                return tB - tA;
            });
        }

        const groups: Record<string, CrateRecord> = {};
        for (const c of filteredCrates) {
            const key = `${c.width_cm}x${c.length_cm}x${c.height_cm}x${c.type}`;
            if (!groups[key]) {
                groups[key] = { ...c, groupedCount: 0, groupedIds: [], cost_mxn: 0, weight_kg: 0 };
            }
            groups[key].groupedCount = (groups[key].groupedCount || 0) + 1;
            groups[key].groupedIds!.push(c.id);
            groups[key].cost_mxn = (groups[key].cost_mxn || 0) + (c.cost_mxn || 0);
            groups[key].weight_kg = (groups[key].weight_kg || 0) + (c.weight_kg || 0);
        }
        return Object.values(groups);
    }, [filteredCrates, activeTab, allInventory]);

    const summary = useMemo(() => ({
        empty: crates.filter(c => c.status === 'Empty').length,
        packed: crates.filter(c => c.status === 'Packed' || c.status === 'Partial').length,
        deployed: crates.filter(c => c.status === 'In Transit' || c.status === 'Deployed').length,
    }), [crates]);

    // For empty/partial crates — just switch tab
    const handlePack = (crate: CrateRecord) => {
        toast.success(`Selected ${crate.type} ${crate.id.slice(0, 8).toUpperCase()} — switching to packing…`, { icon: '📦' });
        setSubTab('packing');
    };

    // For Packed crates — reset to Partial so the packing module can load them, then navigate
    const handleReopenForPacking = async (crate: CrateRecord) => {
        const tid = toast.loading('Re-opening crate for packing...');
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 600));
                toast.success('Crate re-opened (Demo Mode)', { id: tid, icon: '🧪' });
                setSubTab('packing');
                return;
            }
            const { error } = await supabase
                .from('logistics')
                .update({ status: 'Partial' })
                .eq('id', crate.id);
            if (error) throw error;
            if (db) {
                const lDoc = await db.logistics.findOne({ selector: { id: crate.id } }).exec();
                if (lDoc) await lDoc.patch({ status: 'Partial' });
            }
            toast.success('Crate re-opened — add more items in packing view', { id: tid });
            handleRefresh();
            // Short delay so RxDB reactive subscription propagates before tab switch
            setTimeout(() => setSubTab('packing'), 300);
        } catch (err: any) {
            toast.error(err.message || 'Failed to re-open crate', { id: tid });
        }
    };

    return (
        <div className="flex flex-col relative">
            <div className="flex items-center justify-between px-4 lg:px-8 py-3 lg:py-6 border-b border-white/10 bg-black/40 backdrop-blur-3xl sticky top-20 sm:top-24 z-[60] w-full gap-4 lg:gap-8">
                <div className="flex items-center gap-4 sm:gap-8 shrink-0">
                    <div className="shrink-0">
                        <h2 className="text-lg font-black uppercase tracking-tight text-(--text-color)">
                            Shipping <span className="text-(--main-color) italic">Crates</span>
                        </h2>
                        <div className="flex items-center gap-5 mt-1">
                            {[
                                { label: 'Empty', value: summary.empty, dot: 'bg-emerald-400', color: 'text-emerald-400' },
                                { label: 'Packed', value: summary.packed, dot: 'bg-rose-400', color: 'text-rose-400' },
                                { label: 'Deployed', value: summary.deployed, dot: 'bg-blue-400', color: 'text-blue-400' },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-(--text-color)/30">{s.label}</span>
                                    <span className={`text-[11px] font-mono font-black ${s.color}`}>{s.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/8 shrink-0">
                        {[
                            ['empty',    'Empty Inventory'],
                            ['packed',   'Packed Crates'],
                            ['deployed', 'Deployed'],
                        ].map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setActiveTab(val as any)}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap relative ${
                                    activeTab === val
                                        ? val === 'deployed' ? 'bg-blue-500 text-white' : 'bg-white text-black'
                                        : 'text-white/40 hover:text-white'
                                }`}
                            >
                                {label}
                                {val === 'deployed' && summary.deployed > 0 && activeTab !== 'deployed' && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[8px] font-black flex items-center justify-center">
                                        {summary.deployed}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-auto">
                    <div className="relative shrink-0">
                        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                        <input
                            type="text"
                            placeholder="SEARCH UNITS…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="bg-white/5 border border-white/8 pl-9 pr-4 py-2.5 text-[10px] font-mono text-white uppercase tracking-widest outline-none focus:border-(--main-color)/50 focus:bg-white/8 transition w-40 sm:w-52"
                        />
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-(--main-color)/20 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                        <Plus size={14} strokeWidth={3} /> New Unit
                    </button>
                </div>
            </div>

            <div className="relative">
                <div className="px-4 lg:px-8 py-4 lg:py-10">
                    {displayCrates.length > 0 ? (
                        <div className="flex flex-col gap-4 content-start">
                            {displayCrates.map(crate => (
                                <CrateCard 
                                    key={crate.id} 
                                    crate={crate} 
                                    allCrates={crates} 
                                    allInventory={allInventory} 
                                    onPack={
                                        activeTab === 'deployed' ? handleReturnToPacking
                                        : activeTab === 'packed'  ? handleReopenForPacking
                                        : handlePack
                                    }
                                    onDelete={handleDeleteCrate}
                                    isDeployedView={activeTab === 'deployed'}
                                    isPackedView={activeTab === 'packed'}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-6">
                            <div className="relative">
                                <div className="w-28 h-28 border border-dashed border-white/10 flex items-center justify-center bg-white/2">
                                    <Box size={44} className="text-white/15" strokeWidth={1} />
                                </div>
                                <div className="absolute inset-0 bg-(--main-color)/5 blur-3xl" />
                            </div>
                            <div>
                                <h3 className="text-3xl font-black uppercase tracking-tighter italic text-white mb-2">
                                    No {activeTab} units
                                </h3>
                                <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.3em] font-mono max-w-xs">
                                    {activeTab === 'empty'
                                        ? 'No empty units available. Create new storage to begin packing.'
                                        : activeTab === 'deployed'
                                        ? 'No deployed crates found. Crates appear here after Ready Truck is executed.'
                                        : 'No packed units yet. Select items in the packing flow.'}
                                </p>
                            </div>
                            {activeTab === 'empty' && (
                                <button
                                    onClick={() => setIsModalOpen(true)}
                                    className="group flex items-center gap-2.5 px-6 py-3 border border-white/8 bg-white/3 hover:border-(--main-color)/40 hover:bg-(--main-color)/5 transition-all cursor-pointer"
                                >
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50 group-hover:text-white transition-colors">Initialize Storage Protocol</span>
                                    <ArrowRight size={13} className="text-white/20 group-hover:text-(--main-color) group-hover:translate-x-1 transition-all" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <CrateCreationModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onRefresh={handleRefresh}
                />
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color, #F97316); }
            `}</style>
        </div>
    );
};
