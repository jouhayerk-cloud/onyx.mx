import React, { useState, useMemo, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai/react';
import { Box, Plus, Search, Package, ArrowRight, X, CheckCircle2, Loader2, FileText, ChevronDown, ChevronUp, LayoutGrid, ImageOff, Download, Trash2, RotateCcw, Truck, Pencil, Save, Hash, Ruler, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useDatabase, useNotify } from '../../lib/hooks';
import { cratesVersionAtom, logisticsSubTabAtom, isDummyModeAtom, inventoryAtom, liveExchangeRateAtom, TOP_BAR_SEARCH_ATOM, isCrateCreationModalOpenAtom, financeDataAtom } from '../../lib/atoms';
import { getCrateInternalVolume, getItemPaddedVolume, getCleanImageUrl, normalizeInventoryData, calculateCodesAndPrices, getCrateDisplayName } from '../../lib/utils';
import { exportCrateManifesto, type ManifestoItem, type ManifestoMeta } from '../../lib/crateManifesto';
import { ExportWizard } from '../../components/ExportWizard';
import { vendors } from '../../lib/consts';

// ─── Wireframe Crate SVG ─────────────────────────────────────────────────────
export const WireframeCrate: React.FC<{ w?: number; l?: number; h?: number; status?: string; type?: string; count?: number; fillPct?: number }> = ({
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
export interface CrateRecord {
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
    parent_id?: string | null;
    vendors?: string;
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
const CrateCard = ({ crate, allCrates, allInventory, onPack, onDelete, onNest, onEdit, isDeployedView = false, isPackedView = false }: { 
    crate: CrateRecord; 
    allCrates: CrateRecord[]; 
    allInventory: any[]; 
    onPack: (c: CrateRecord) => void; 
    onDelete: (c: CrateRecord) => void; 
    onNest: (c: CrateRecord) => void;
    onEdit: (c: CrateRecord) => void;
    isDeployedView?: boolean; 
    isDeployedView?: boolean; 
    isPackedView?: boolean 
}) => {
    const financeDocs = useAtomValue(financeDataAtom);
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
    
    const payStatus = useMemo(() => {
        const v = (crate.vendors || '').toUpperCase();
        const related = financeDocs.filter(d => {
            const relIds = Array.isArray(d.related_ids) ? d.related_ids : (typeof d.related_inventory_ids === 'string' ? d.related_inventory_ids.split(',') : []);
            const isRel = relIds.some((id: any) => String(id) === crate.id);
            if (isRel) return true;
            
            // Fallback to vendor check if no specific IDs linked
            const dVendor = (d.vendor_id || '').toUpperCase();
            const cVendor = (crate.vendors || '').toUpperCase();
            const isPackingMatch = ['JUAN', 'SIMONA', 'PACK', 'CRATES'].includes(cVendor) && ['PACK', 'CRATES', 'JUAN', 'SIMONA'].includes(dVendor);
            return (dVendor === cVendor || isPackingMatch) && d.description?.includes(crate.id.slice(0, 8));
        });
        if (related.some(d => d.status === 'Paid' || d.status === 'Dispersed' || d.status === 'Sent')) return 'Paid';
        if (related.some(d => d.status === 'Requested')) return 'Requested';
        const normV = (crate.vendors || '').toLowerCase();
        if ((normV.includes('juan') || normV.includes('simona')) && (crate.cost_mxn || 0) > 0) return 'Pending';
        return null;
    }, [crate, financeDocs]);

    const nestedCount = useMemo(() => allCrates.filter(nu => nu.parent_id === crate.id).length, [allCrates, crate.id]);
    const itemCount = crate.inventory_ids ? crate.inventory_ids.split(',').filter(Boolean).length : 0;
    const vol = ((crate.width_cm ?? 0) * (crate.length_cm ?? 0) * (crate.height_cm ?? 0) / 1_000_000).toFixed(3);

    const { getItemsRecursive, getUsedVolRecursive, getNetWeightRecursive } = useMemo(() => {
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
                        const barcode = calculateCodesAndPrices(norm, liveRate, '326').bookBarcode || norm.book_barcode || norm.itemId || 'UNK';
                        const weight = (parseFloat(norm.weightKg || norm.weight_kg) || 0);
                        res.push({
                            id, qty, norm, packetIn: parentLabel,
                            mainImage: getCleanImageUrl(norm.generatedPngUrl || (urls.length > 0 ? urls[0] : null)),
                            barcode,
                            weight
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

        const getWeight = (c: any, visited = new Set<string>()): number => {
            if (!c || visited.has(c.id)) return 0;
            visited.add(c.id);

            let w = 0;
            if (c.inventory_ids) {
                c.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
                    const [id, qtyStr] = entry.split(':');
                    const qty = parseInt(qtyStr || '1', 10) || 1;
                    const inv = allInventory.find(i => String(i.row) === id);
                    if (inv) {
                        const norm = normalizeInventoryData(inv.data);
                        w += (parseFloat(norm.weightKg || norm.weight_kg) || 0) * qty;
                    }
                });
            }
            const nested = allCrates.filter(nu => nu.parent_id === c.id);
            nested.forEach(n => {
                w += getWeight(n, visited);
            });
            return w;
        };

        return { getItemsRecursive: getItems, getUsedVolRecursive: getVol, getNetWeightRecursive: getWeight };
    }, [allCrates, allInventory, liveRate]);

    const netWeight = useMemo(() => getNetWeightRecursive(crate), [crate, getNetWeightRecursive]);

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
                    dbItemCount: Number(d.quantity || 0),
                    packetIn: item.packetIn
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
                branding: cfg.branding,
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
        <div className="group relative transition-all duration-500 w-full flex flex-col py-6 px-6 bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-3xl mb-4 hover:border-(--main-color)/40">

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
                    <div className="absolute top-0 left-0 flex flex-col gap-1 items-start">
                        <StatusBadge status={crate.status} />
                        {payStatus && (
                            <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                payStatus === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                payStatus === 'Requested' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}>
                                PAY: {payStatus}
                            </div>
                        )}
                    </div>
                </div>

                {/* Info & Stats */}
                <div className="flex-1 min-w-0 flex flex-col xl:flex-row items-stretch xl:items-center gap-6 xl:gap-12">
                    {/* Crate ID — barcode for packed crates, text for empty */}
                    <div className="min-w-0 xl:min-w-[160px] flex flex-row xl:flex-col items-center xl:items-start justify-between xl:justify-start gap-2">
                        <div className="flex items-center gap-6">
                            {crate.status !== 'Empty' ? (
                                <div className="mb-0 xl:mb-0 flex items-center shrink-0">
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

                            <button
                                onClick={() => onPack(crate)}
                                className={`p-2 transition-all duration-300 cursor-pointer hover:scale-125 ${
                                    isDeployedView
                                        ? 'text-blue-400 hover:text-blue-300'
                                        : isPackedView
                                        ? 'text-amber-400 hover:text-amber-300'
                                        : 'text-white/40 hover:text-white'
                                }`}
                                title={isDeployedView ? 'Return to Packing' : isPackedView ? 'Re-open & Pack More' : 'Pack Items'}
                            >
                                {isDeployedView || isPackedView ? (
                                    <RotateCcw size={22} />
                                ) : (
                                    <ArrowRight size={22} />
                                )}
                            </button>
                        </div>
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

                            {crate.parent_id && (
                                <div className="flex items-center gap-1.5 mt-2 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg self-end xl:self-start">
                                    <Package size={11} className="text-blue-400" />
                                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em]">
                                        Packed Inside: {(() => {
                                            const p = allCrates.find(pc => pc.id === crate.parent_id);
                                            if (!p) return 'Parent Unit';
                                            const { date, vendors: vList, sequence } = getDynamicCrateIdComponents(p, allCrates, allInventory);
                                            return `${date}${vList.join('')}${sequence}`;
                                        })()}
                                    </span>
                                </div>
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
                                                    const db = (window as any).onyxDb;
                                                    if (db) {
                                                        const lDoc = await db.logistics.findOne({ selector: { id: crate.id } }).exec();
                                                        if (lDoc) await lDoc.patch({ brute_weight_kg: val, updated_at: new Date().toISOString() });
                                                    }
                                                    // Also persist in contents_summary so it survives Supabase syncs
                                                    const summary = crate.contents_summary || '';
                                                    const cleaned = summary.replace(/\[BW:\d+\.?\d*\]/g, '').trim();
                                                    const newSummary = `${cleaned} [BW:${val}]`.trim();
                                                    await supabase.from('logistics').update({ contents_summary: newSummary, updated_at: new Date().toISOString() }).eq('id', crate.id);
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
                        {nestedCount > 0 && (
                            <div className="flex flex-col gap-1.5">
                                <p className="text-[9px] uppercase tracking-[0.3em] text-(--main-color) font-black leading-none">Nested</p>
                                <p className="text-[17px] font-mono font-black text-white leading-none">{nestedCount} <span className="text-[9px] font-black text-white/20">BOXES</span></p>
                            </div>
                        )}
                    </div>

                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row xl:flex-col gap-2 shrink-0 h-full justify-center w-full xl:w-auto mt-2 xl:mt-0">
                    {crate.status !== 'Empty' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsExportProgressOpen(true)}
                                className={`p-3 text-white/20 hover:text-emerald-500 transition-all duration-300 cursor-pointer hover:scale-125 ${isExporting ? 'opacity-50 pointer-events-none' : ''}`}
                                title="Export Manifesto"
                            >
                                <Download size={22} />
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
                    
                    {isPackedView && (crate.type === 'cardboard' || (crate.width_cm == 38 && crate.length_cm == 41 && crate.height_cm == 38)) && !crate.parent_id && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onNest(crate); }}
                            className="p-3 text-white/20 hover:text-blue-400 transition-all duration-300 cursor-pointer hover:scale-125"
                            title="Nest this Box"
                        >
                            <Plus size={22} />
                        </button>
                    )}


                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(crate); }}
                        className="p-3 text-white/20 hover:text-white transition-all duration-300 cursor-pointer hover:scale-125"
                        title="Edit Crate Details"
                    >
                        <Pencil size={22} />
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(crate); }}
                        className="p-3 text-white/20 hover:text-rose-500 transition-all duration-300 cursor-pointer hover:scale-125"
                        title="Delete Crate"
                    >
                        <Trash2 size={22} />
                    </button>
                </div>
            </div>

            {/* Expandable Packed Contents List */}
            {isExpanded && crate.status !== 'Empty' && packedItems.length > 0 && (
                <div className="border-t border-white/5 bg-black/20 p-6 max-h-[500px] overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-300">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40 mb-6 px-1">{dynamicId} — Packing List</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {packedItems.map((item, idx) => (
                            <div key={`${item.id}-${idx}`} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-3 hover:bg-white/8 hover:border-white/20 transition-all duration-300">
                                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black/50 border border-white/10">
                                    {item.mainImage ? <img src={item.mainImage} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-black text-white truncate uppercase tracking-tight">{item.norm.shape || ''} {item.norm.shortDescription || item.norm.description || ''}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <p className="text-[10px] font-mono text-white/40 uppercase tracking-[0.1em]">{item.barcode}</p>
                                        {item.weight > 0 && (
                                            <p className="text-[10px] font-black text-(--main-color) uppercase tracking-tighter bg-(--main-color)/10 px-2 py-0.5 rounded-md">
                                                {item.weight.toFixed(1)} KG
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="w-auto px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[12px] font-black font-mono text-(--main-color)">
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
    const [form, setForm] = useState({ 
        type: 'crate', 
        width: '', 
        length: '', 
        height: '', 
        quantity: '1', 
        price: '', 
        description: '',
        vendors: 'M'
    });
    const [sourceType, setSourceType] = useState('VENDOR');
    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

    if (!isOpen) return null;

    const totalCost = (parseFloat(form.quantity) || 0) * (parseFloat(form.price) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const qty = parseInt(form.quantity) || 1;
        const price = parseFloat(form.price) || 0;
        const w = parseFloat(form.width) || 0;
        const l = parseFloat(form.length) || 0;
        const h = parseFloat(form.height) || 0;
        if (!w || !l || !h) return notify.error('Enter all three dimensions.');

        setLoading(true);
        const tid = notify.loading(`Initializing ${qty} ${form.type}(s)…`);
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                notify.success(`${qty} ${form.type}(s) initialized. (Demo Mode)`, { id: tid, icon: '🧪' });
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
                vendors: sourceType === 'VENDOR' ? form.vendors : sourceType,
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

            notify.success(`${qty} ${form.type}(s) initialized.`, { id: tid });
            onRefresh();
            onClose();
            setForm({ 
                type: 'crate', 
                width: '', 
                length: '', 
                height: '', 
                quantity: '1', 
                price: '', 
                description: '',
                vendors: 'JM'
            });
            setSourceType('VENDOR');
        } catch (err: any) {
            notify.error(err.message || 'Failed to create crates.', { id: tid });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 md:left-[var(--sidebar-width)] z-[400] flex justify-center items-start pt-[80px] md:pt-[128px] animate-in fade-in duration-500 overflow-hidden"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl" onClick={onClose} />
            
            <div 
                className="relative w-full h-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 bg-black/10 border-none rounded-none md:rounded-[40px] shadow-2xl backdrop-blur-3xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex-1 overflow-y-auto no-scrollbar px-6 md:px-12 pb-48 pt-6 md:pt-10">
                    <div className="max-w-[1200px] mx-auto space-y-8 md:space-y-12">
                        
                        {/* Header */}
                        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-10 border-b border-white/5">
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-2 h-2 rounded-full bg-(--main-color) animate-pulse" />
                                    <h1 className="text-[20px] font-black uppercase tracking-[0.6em] text-white/40 leading-none">
                                        Initialize Storage
                                    </h1>
                                </div>
                                <div className="flex items-center gap-3 whitespace-nowrap opacity-50">
                                    <span className="text-[8px] font-black uppercase tracking-[0.8em] text-white/40">Acquisition Protocol</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 self-end lg:self-auto">
                                <button onClick={onClose} className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5">
                                    <X size={32} strokeWidth={2} />
                                </button>
                            </div>
                        </div>

                        {/* Core Configuration */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
                            {/* Unit Type */}
                            <div className="lg:col-span-4 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Unit Type</label>
                                <div className="flex gap-2 bg-white/[0.03] border border-white/10 rounded-3xl p-1">
                                    {[
                                        { id: 'crate', label: 'Crate' },
                                        { id: 'pallet', label: 'Pallet' },
                                        { id: 'cardboard', label: 'Box' }
                                    ].map(t => (
                                        <button 
                                            key={t.id} 
                                            type="button"
                                            onClick={() => set('type', t.id)}
                                            className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${form.type === t.id ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quantity */}
                            <div className="lg:col-span-3 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Batch Quantity</label>
                                <div className="h-20 flex items-center bg-white/[0.03] border border-white/10 rounded-3xl px-6 hover:border-(--main-color) transition-all">
                                    <SmartInput label="Quantity" field="quantity" value={form.quantity} icon={Hash} type="number" className="border-b-0 py-0 w-full" onSet={set} />
                                </div>
                            </div>

                            {/* Price */}
                            <div className="lg:col-span-5 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Acquisition Cost (MXN)</label>
                                <div className="h-20 flex items-center bg-white/[0.03] border border-white/10 rounded-3xl px-6 hover:border-(--main-color) transition-all">
                                    <SmartInput label="Unit Price" field="price" value={form.price} icon={FileText} type="number" className="border-b-0 py-0 w-full" onSet={set} />
                                </div>
                            </div>
                        </div>

                        {/* Provider and Source Configuration */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            {/* Source Provider */}
                            <div className="lg:col-span-6 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Source Provider</label>
                                <div className="flex gap-2 bg-white/[0.03] border border-white/10 rounded-[2rem] p-1.5">
                                    {['SIMONA', 'JUAN', 'VENDOR'].map(s => (
                                        <button 
                                            key={s} 
                                            type="button"
                                            onClick={() => setSourceType(s)}
                                            className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${sourceType === s ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Vendor Selector (Conditional) */}
                            <div className="lg:col-span-6 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">
                                    {sourceType === 'VENDOR' ? 'Primary Vendor' : 'Protocol Source'}
                                </label>
                                <div className="h-20 flex flex-col justify-center bg-white/[0.03] border border-white/10 rounded-[2rem] px-6">
                                    {sourceType === 'VENDOR' ? (
                                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                                            {Object.keys(vendors).filter(k => !['R', 'M', 'W', 'C'].includes(k)).map(id => {
                                                const v = vendors[id as keyof typeof vendors];
                                                const isSelected = form.vendors === id;
                                                return (
                                                    <button
                                                        type="button" key={id}
                                                        onClick={() => set('vendors', id)}
                                                        className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${isSelected ? 'ring-2 ring-white scale-110 shadow-xl z-10' : 'opacity-40 hover:opacity-100 grayscale hover:grayscale-0'}`}
                                                        style={{ backgroundColor: v.color, color: 'white' }}
                                                    >
                                                        {id}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                                                <Shield size={18} className="text-(--main-color)" />
                                            </div>
                                            <span className="text-[11px] font-black text-white uppercase tracking-widest">
                                                Internal {sourceType} Matrix
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Dimensions */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <SmartInput label="Width (CM)" field="width" value={form.width} icon={Ruler} type="number" onSet={set} />
                            <SmartInput label="Length (CM)" field="length" value={form.length} icon={Ruler} type="number" onSet={set} />
                            <SmartInput label="Height (CM)" field="height" value={form.height} icon={Ruler} type="number" onSet={set} />
                        </div>

                        {/* Notes */}
                        <div className="space-y-3">
                            <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Internal References</label>
                            <SmartInput label="Notes / Reference Code" field="description" value={form.description} icon={FileText} onSet={set} />
                        </div>

                        {/* Total Summary */}
                        {totalCost > 0 && (
                            <div className="p-8 rounded-[2rem] bg-(--main-color)/5 border border-(--main-color)/10 flex items-center justify-between">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.4em]">Total Resource Allocation</span>
                                    <span className="text-sm font-black text-white/40 uppercase tracking-widest">
                                        {form.quantity} × {form.type} @ ${Number(form.price).toLocaleString()}
                                    </span>
                                </div>
                                <span className="text-4xl font-black text-white tabular-nums tracking-tighter italic">
                                    ${totalCost.toLocaleString()} <span className="text-xs not-italic text-white/40 ml-1">MXN</span>
                                </span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col items-center gap-6 pt-12 border-t border-white/5">
                            <button 
                                onClick={handleSubmit}
                                disabled={loading}
                                className={`w-full md:w-auto px-20 py-6 rounded-[2rem] font-black text-sm uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-4 group ${loading ? 'bg-white/5 text-white/20' : 'bg-(--main-color) text-black hover:scale-105 active:scale-95 shadow-2xl shadow-(--main-color)/20'}`}
                            >
                                {loading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} className="group-hover:rotate-90 transition-transform" />}
                                {loading ? 'Initializing Matrix...' : 'Deploy Storage Protocol'}
                            </button>
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.5em]">Protocol version 3.2.6 · Jouhayerk Matrix</p>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Crate Edit Panel ──────────────────────────────────────────────────────────


// ─── Local Smart Input ───────────────────────────────────────────────────────
export const SmartInput = memo(({ label, field, value, icon: Icon, type = 'text', className = '', onSet, placeholder = '' }: any) => {
    const [isFocused, setIsFocused] = useState(false);
    
    const isCollapsed = !isFocused && value && value !== '0' && value !== '';
    const sizeClasses = className.includes('compact') ? 'text-2xl md:text-3xl' : 'text-4xl md:text-5xl';
    const containerHeight = className.includes('compact') ? 'h-10 md:h-12' : 'h-14 md:h-16';

    if (isCollapsed) {
        return (
            <div 
                onClick={() => setIsFocused(true)}
                className={`group flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] transition-all cursor-pointer animate-in fade-in zoom-in-95 duration-300 ${className}`}
            >
                {Icon && <Icon size={10} className="text-(--main-color) opacity-50" strokeWidth={3} />}
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20">{label}</span>
                <span className="text-sm font-black uppercase tracking-tight text-white/80 group-hover:text-white transition-colors">{value}</span>
            </div>
        );
    }

    return (
        <div className={`group relative flex flex-col py-2 border-b transition-all duration-300 ease-out border-white/10 hover:border-white/40 ${className}`}>
            <div className="flex justify-between items-start mb-1 select-none">
                <div className="flex items-center gap-3">
                    {Icon && <Icon size={12} className={value || isFocused ? 'text-(--main-color)' : 'text-white/40'} strokeWidth={3} />}
                    <span className={`text-[9px] font-black uppercase tracking-[0.4em] transition-colors duration-200 ${value || isFocused ? 'text-(--main-color)' : 'text-white/40'}`}>{label}</span>
                </div>
            </div>
            
            <div className={`relative overflow-hidden ${containerHeight} flex items-center`}>
                <input 
                    autoFocus={isFocused}
                    type={type}
                    value={value}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                    onChange={(e) => onSet(field, e.target.value)}
                    className={`
                        bg-transparent border-none outline-none w-full ${sizeClasses} font-black uppercase tracking-tighter transition-all duration-200 relative z-10 text-white
                    `}
                />
            </div>
        </div>
    );
});

// ─── Crate Edit Panel ──────────────────────────────────────────────────────────

export const CrateEditPanel: React.FC<{
    crate: CrateRecord;
    allCrates: CrateRecord[];
    allInventory: any[];
    onClose: () => void;
    onSave: (id: string, updates: any) => void;
    onDeleteGroup?: (ids: string[]) => void;
}> = ({ crate, allCrates, allInventory, onClose, onSave, onDeleteGroup }) => {
    const [formData, setFormData] = useState({
        description: crate.description || '',
        width_cm: String(crate.width_cm || ''),
        length_cm: String(crate.length_cm || ''),
        height_cm: String(crate.height_cm || ''),
        weight_kg: String(crate.weight_kg || ''),
        brute_weight_kg: String(crate.brute_weight_kg || ''),
        cost_mxn: String(crate.cost_mxn || ''),
        status: crate.status || 'Packed',
        vendors: (crate as any).vendors || '',
        quantity: String(crate.groupedCount || 1),
        type: crate.type || 'crate'
    });

    const [sourceType, setSourceType] = useState(() => {
        const v = (crate as any).vendors;
        if (v === 'SIMONA') return 'SIMONA';
        if (v === 'JUAN') return 'JUAN';
        return 'VENDOR';
    });

    const [isStatusExpanded, setIsStatusExpanded] = useState(false);

    const handleSave = () => {
        const updates = {
            ...formData,
            width_cm: parseFloat(formData.width_cm) || 0,
            length_cm: parseFloat(formData.length_cm) || 0,
            height_cm: parseFloat(formData.height_cm) || 0,
            weight_kg: parseFloat(formData.weight_kg) || 0,
            brute_weight_kg: parseFloat(formData.brute_weight_kg) || 0,
            cost_mxn: parseFloat(formData.cost_mxn) || 0,
            quantity: parseInt(formData.quantity) || 1
        };
        if (sourceType === 'SIMONA') updates.vendors = 'SIMONA';
        else if (sourceType === 'JUAN') updates.vendors = 'JUAN';
        onSave(crate.id, updates);
    };

    const set = (k: string, v: any) => setFormData(f => ({ ...f, [k]: v }));

    return (
        <div 
            className="fixed inset-0 md:left-[var(--sidebar-width)] z-[400] flex justify-center items-start pt-[80px] md:pt-[128px] animate-in fade-in duration-500 overflow-hidden"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl" onClick={onClose} />
            
            <div 
                className="relative w-full h-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 bg-black/10 border-none rounded-none md:rounded-[40px] shadow-2xl backdrop-blur-3xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex-1 overflow-y-auto no-scrollbar px-6 md:px-12 pb-48 pt-6 md:pt-10">
                    <div className="max-w-[1200px] mx-auto space-y-8 md:space-y-12">
                        
                        {/* Header */}
                        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-10 border-b border-white/5">
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-2 h-2 rounded-full bg-(--main-color) animate-pulse" />
                                    <h1 className="text-[20px] font-black uppercase tracking-[0.6em] text-white/40 leading-none">
                                        Edit Storage Unit
                                    </h1>
                                </div>
                                <div className="flex items-center gap-3 whitespace-nowrap opacity-50">
                                    <span className="text-[8px] font-black uppercase tracking-[0.8em] text-white/40">Configuration Matrix</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 self-end lg:self-auto">
                                <div className="flex items-center gap-6 px-6 py-3 bg-white/[0.03] rounded-3xl border border-white/10 backdrop-blur-xl">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">Unit Protocol</span>
                                        <span className="text-2xl font-black tracking-tighter uppercase text-white tabular-nums">
                                            {crate.id.slice(0, 8).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20">
                                        <Box size={24} />
                                    </div>
                                </div>
                                <button onClick={onClose} className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5">
                                    <X size={32} strokeWidth={2} />
                                </button>
                            </div>
                        </div>

                        {/* Core Fields */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
                            {/* Unit Type */}
                            <div className="lg:col-span-3 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Unit Type</label>
                                <div className="flex gap-2 bg-white/[0.03] border border-white/10 rounded-3xl p-1">
                                    {[
                                        { id: 'crate', label: 'Crate' },
                                        { id: 'pallet', label: 'Pallet' },
                                        { id: 'cardboard', label: 'Box' }
                                    ].map(t => (
                                        <button 
                                            key={t.id} 
                                            onClick={() => set('type', t.id)}
                                            className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.type === t.id ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Status */}
                            <div className="lg:col-span-3 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Protocol Status</label>
                                {!isStatusExpanded ? (
                                    <button 
                                        onClick={() => setIsStatusExpanded(true)}
                                        className="w-full flex items-center justify-between h-14 px-5 rounded-3xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-(--main-color) transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-(--main-color)">
                                                {formData.status === 'Packed' ? <CheckCircle2 size={16} /> : formData.status === 'Partial' ? <RotateCcw size={16} /> : <Box size={16} />}
                                            </div>
                                            <span className="text-sm font-black uppercase tracking-tight text-white">{formData.status}</span>
                                        </div>
                                        <ChevronDown size={16} className="text-white/20 group-hover:text-white transition-colors" />
                                    </button>
                                ) : (
                                    <div className="flex gap-1 animate-in slide-in-from-top-2 duration-300">
                                        {['Empty', 'Partial', 'Packed'].map(s => (
                                            <button key={s} onClick={() => { set('status', s); setIsStatusExpanded(false); }}
                                                className={`flex-1 py-3 rounded-2xl transition-all duration-200 ${formData.status === s ? 'bg-(--main-color) text-black shadow-lg' : 'bg-black/20 border border-white/5 text-white/40 hover:bg-white/5 hover:text-white'}`}>
                                                <span className="text-[9px] font-black uppercase tracking-widest">{s}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Provider */}
                            <div className="lg:col-span-4 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Source Provider</label>
                                <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-3xl p-1">
                                    {['SIMONA', 'JUAN', 'VENDOR'].map(s => (
                                        <button key={s} onClick={() => setSourceType(s)}
                                            className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${sourceType === s ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                {sourceType === 'VENDOR' ? (
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 animate-in fade-in duration-500 mt-2">
                                        {Object.keys(vendors).filter(k => !['R', 'M', 'W', 'C'].includes(k)).map(id => {
                                            const v = vendors[id as keyof typeof vendors];
                                            const isSelected = formData.vendors === id;
                                            return (
                                                <button
                                                    type="button" key={id}
                                                    onClick={() => set('vendors', id)}
                                                    className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${isSelected ? 'ring-2 ring-white scale-110 shadow-xl z-10' : 'opacity-40 hover:opacity-100 grayscale hover:grayscale-0'}`}
                                                    style={{ backgroundColor: v.color, color: 'white' }}
                                                >
                                                    {id}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 mt-2 animate-in fade-in duration-500">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                                            <Shield size={18} className="text-(--main-color)" />
                                        </div>
                                        <span className="text-[11px] font-black text-white uppercase tracking-widest">
                                            Internal {sourceType} Matrix
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Quantity */}
                            <div className="lg:col-span-2 space-y-3">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em]">Units</label>
                                <div className="h-14 flex items-center bg-white/[0.03] border border-white/10 rounded-3xl px-4 hover:border-(--main-color) transition-all">
                                    <SmartInput label="Qty" field="quantity" value={formData.quantity} icon={Hash} type="number" className="border-b-0 py-0 w-full compact" onSet={set} />
                                </div>
                            </div>
                        </div>

                        {/* Dimensions & Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <SmartInput label="Width (CM)" field="width_cm" value={formData.width_cm} icon={Ruler} type="number" onSet={set} />
                            <SmartInput label="Length (CM)" field="length_cm" value={formData.length_cm} icon={Ruler} type="number" onSet={set} />
                            <SmartInput label="Height (CM)" field="height_cm" value={formData.height_cm} icon={Ruler} type="number" onSet={set} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <SmartInput label="Brute Weight (KG)" field="brute_weight_kg" value={formData.brute_weight_kg} icon={Package} type="number" onSet={set} />
                            <SmartInput label="Acquisition Price (MXN)" field="cost_mxn" value={formData.cost_mxn} icon={Hash} type="number" onSet={set} />
                            <SmartInput label="Label / Notes" field="description" value={formData.description} icon={FileText} onSet={set} />
                        </div>

                        {/* Save Action */}
                        <div className="flex flex-col items-center gap-6 pt-12 border-t border-white/5">
                            <div className="flex flex-col md:flex-row items-center gap-4 w-full justify-center">
                                <button 
                                    onClick={handleSave}
                                    className="w-full md:w-auto px-16 py-6 bg-(--main-color) text-black rounded-[2rem] font-black text-sm uppercase tracking-[0.3em] hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-(--main-color)/20 flex items-center justify-center gap-4 group"
                                >
                                    <Save size={20} className="group-hover:rotate-12 transition-transform" />
                                    Sync Unit Changes
                                </button>

                                {onDeleteGroup && crate.groupedIds && crate.groupedIds.length > 0 && (
                                    <button 
                                        onClick={() => {
                                            if (window.confirm(`Are you sure you want to PERMANENTLY REMOVE all ${crate.groupedIds?.length} units in this protocol group?`)) {
                                                onDeleteGroup(crate.groupedIds || []);
                                            }
                                        }}
                                        className="w-full md:w-auto px-16 py-6 bg-red-500/10 text-red-500 border border-red-500/20 rounded-[2rem] font-black text-sm uppercase tracking-[0.3em] hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-4 group"
                                    >
                                        <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                                        Delete All Units
                                    </button>
                                )}
                            </div>
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.5em]">Protocol version 3.2.6 · Jouhayerk Matrix</p>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export const CratesInventoryView: React.FC = () => {
    const db = useDatabase();
    const notify = useNotify();
    const [, setCratesVersion] = useAtom(cratesVersionAtom);
    const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
    const [searchQuery] = useAtom(TOP_BAR_SEARCH_ATOM);
    const [isModalOpen, setIsModalOpen] = useAtom(isCrateCreationModalOpenAtom);
    const [editingCrate, setEditingCrate] = useState<CrateRecord | null>(null);
    const [crates, setCrates] = useState<CrateRecord[]>([]);
    const [nestingUnit, setNestingUnit] = useState<CrateRecord | null>(null);
    const [isSavingNest, setIsSavingNest] = useState(false);
    const allInventory = useAtomValue(inventoryAtom);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const activeTab = useMemo(() => (subTab === 'packed' || subTab === 'deployed' || subTab === 'crates') ? subTab : 'empty', [subTab]);
    const isLibraryOrDeployed = activeTab === 'crates' || activeTab === 'deployed';

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

        const tid = notify.loading(`Deleting ${crate.type}...`);

        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                notify.success("Crate deleted (Demo Mode)", { id: tid, icon: '🧪' });
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

            notify.success("Crate permanently deleted", { id: tid });
            handleRefresh();
        } catch (err: any) {
            notify.error(err.message || 'Delete failed.', { id: tid });
        }
    };

    const handleReturnToPacking = async (crate: CrateRecord) => {
        const tid = notify.loading('Returning crate to packing state...');
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 800));
                notify.success('Crate returned to Packed (Demo Mode)', { id: tid, icon: '🧪' });
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
            notify.success('Crate returned to Packed Crates', { id: tid });
            handleRefresh();
        } catch (err: any) {
            notify.error(err.message || 'Failed to reset crate', { id: tid });
        }
    };

    const handleNestUnit = async (sourceId: string, parentId: string) => {
        setIsSavingNest(true);
        const tid = notify.loading(`Nesting unit...`);
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 1000));
                notify.success("Unit nested (Demo Mode)", { id: tid, icon: '🧪' });
                setNestingUnit(null);
                handleRefresh();
                return;
            }
            const updatePayload = { parent_id: parentId, updated_at: new Date().toISOString() };
            const { error: nestErr } = await supabase.from('logistics').update(updatePayload).eq('id', sourceId);
            if (nestErr) throw nestErr;
            if (db) {
                const localUnit = await db.logistics.findOne({ selector: { id: sourceId } }).exec();
                if (localUnit) await localUnit.patch(updatePayload);
            }
            notify.success("Unit successfully nested", { id: tid });
            setNestingUnit(null);
            handleRefresh();
        } catch (err: any) {
            notify.error(err.message || 'Nesting failed.', { id: tid });
        } finally {
            setIsSavingNest(false);
        }
    };

    const filteredCrates = useMemo(() => {
        return crates.filter(c => {
            const matchesTab =
                activeTab === 'empty'    ? c.status === 'Empty' :
                activeTab === 'packed'   ? (c.status === 'Packed' || c.status === 'Partial') :
                /* deployed/crates */      (c.status === 'In Transit' || c.status === 'Deployed');
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q
                || c.id?.toLowerCase().includes(q)
                || c.contents_summary?.toLowerCase().includes(q)
                || c.description?.toLowerCase().includes(q);
            
            // Nested units (with parent_id) should NOT show up in the top-level list
            return matchesTab && matchesSearch && !c.parent_id;
        });
    }, [crates, activeTab, searchQuery]);

    const displayCrates = useMemo(() => {
        if (activeTab === 'packed' || activeTab === 'crates' || activeTab === 'deployed') {
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
            const vendor = (c as any).vendors || '';
            const key = `${c.width_cm}x${c.length_cm}x${c.height_cm}x${c.type}x${c.cost_mxn}x${vendor}`;
            if (!groups[key]) {
                groups[key] = { ...c, groupedCount: 0, groupedIds: [], weight_kg: 0 };
            }
            groups[key].groupedCount = (groups[key].groupedCount || 0) + 1;
            groups[key].groupedIds!.push(c.id);
            groups[key].weight_kg = (groups[key].weight_kg || 0) + (c.weight_kg || 0);
        }
        return Object.values(groups);
    }, [filteredCrates, activeTab, allInventory]);

    const summary = useMemo(() => ({
        empty: crates.filter(c => c.status === 'Empty').length,
        packed: crates.filter(c => (c.status === 'Packed' || c.status === 'Partial') && c.type !== 'cardboard').length,
        boxes: crates.filter(c => (c.status === 'Packed' || c.status === 'Partial') && c.type === 'cardboard').length,
        deployed: crates.filter(c => c.status === 'In Transit' || c.status === 'Deployed').length,
    }), [crates]);

    // For empty/partial crates — just switch tab
    const handlePack = (crate: CrateRecord) => {
        notify.success(`Selected ${crate.type} ${crate.id.slice(0, 8).toUpperCase()} — switching to packing…`, { icon: '📦' });
        setSubTab('packing');
    };

    const handleSaveCrate = async (id: string, updates: any) => {
        const tid = notify.loading('Syncing with logistics matrix...');
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 600));
                notify.success('Record updated (Demo Mode)', { id: tid });
                setEditingCrate(null);
                handleRefresh();
                return;
            }

            const { brute_weight_kg, quantity, ...supabaseUpdates } = updates;

            // 1. Handle Bulk Updates if it's a group
            const targetIds = (editingCrate?.groupedIds && editingCrate.groupedIds.length > 0) 
                ? editingCrate.groupedIds 
                : [id];

            // 2. Handle Quantity changes for Empty crates
            if (editingCrate?.status === 'Empty' && quantity !== undefined) {
                const currentQty = editingCrate.groupedCount || 1;
                const diff = quantity - currentQty;

                if (diff > 0) {
                    // Create more empty crates of the same type/dims
                    const now = new Date().toISOString();
                    const newCrates = Array.from({ length: diff }, () => ({
                        type: editingCrate.type,
                        status: 'Empty',
                        width_cm: updates.width_cm,
                        length_cm: updates.length_cm,
                        height_cm: updates.height_cm,
                        cost_mxn: updates.cost_mxn,
                        description: updates.description,
                        date: now,
                        updated_at: now
                    }));
                    const { data: inserted, error: insErr } = await supabase.from('logistics').insert(newCrates).select();
                    if (insErr) throw insErr;
                    if (db && inserted) {
                        for (const row of inserted) {
                            try { await db.logistics.insert({ ...row, id: String(row.id) }); } catch (_) {}
                        }
                    }
                } else if (diff < 0) {
                    // Delete some empty crates from this group
                    const idsToDelete = targetIds.slice(0, Math.abs(diff));
                    const { error: delErr } = await supabase.from('logistics').delete().in('id', idsToDelete);
                    if (delErr) throw delErr;
                    if (db) {
                        for (const delId of idsToDelete) {
                            const local = await db.logistics.findOne({ selector: { id: delId } }).exec();
                            if (local) await local.remove();
                        }
                    }
                }
            }

            // 3. Update the existing crate(s) with new metadata
            const { error } = await supabase
                .from('logistics')
                .update({
                    ...supabaseUpdates,
                    updated_at: new Date().toISOString()
                })
                .in('id', targetIds);

            if (error) throw error;

            if (db) {
                for (const tId of targetIds) {
                    const lDoc = await db.logistics.findOne({ selector: { id: tId } }).exec();
                    if (lDoc) await lDoc.patch({ ...updates, updated_at: new Date().toISOString() });
                }
            }

            notify.success('Logistics protocol updated', { id: tid });
            setEditingCrate(null);
            handleRefresh();
        } catch (err: any) {
            notify.error(err.message || 'Update failed', { id: tid });
        }
    };

    const handleDeleteCratesGroup = async (ids: string[]) => {
        const tid = notify.loading(`Purging ${ids.length} units from protocol...`);
        try {
            if (isDummyMode) {
                await new Promise(r => setTimeout(r, 600));
                toast.success('Group purged (Demo Mode)', { id: tid });
                setEditingCrate(null);
                handleRefresh();
                return;
            }

            const { error } = await supabase.from('logistics').delete().in('id', ids);
            if (error) throw error;

            if (db) {
                for (const id of ids) {
                    const local = await db.logistics.findOne({ selector: { id } }).exec();
                    if (local) await local.remove();
                }
            }

            toast.success(`Successfully purged ${ids.length} units`, { id: tid });
            setEditingCrate(null);
            handleRefresh();
        } catch (err: any) {
            toast.error(err.message || 'Purge failed', { id: tid });
        }
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
                        <div className="flex items-center gap-5 mt-1">
                            {[
                                { label: 'Empty', value: summary.empty, dot: 'bg-emerald-400', color: 'text-emerald-400' },
                                { label: 'Packed', value: summary.packed, dot: 'bg-rose-400', color: 'text-rose-400' },
                                { label: 'Boxes', value: summary.boxes, dot: 'bg-amber-400', color: 'text-amber-400' },
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
                </div>
            </div>

            <div className="relative">
                <div className="px-4 lg:px-8 py-4 lg:py-10">
                    {displayCrates.length > 0 ? (
                        activeTab === 'packed' ? (
                            <div className="flex flex-col gap-16">
                                {displayCrates.length > 0 && (
                                    <div className="flex flex-col gap-6">
                                        <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">
                                                Logistics Units (Crates, Pallets & Boxes)
                                            </span>
                                            <div className="h-px flex-1 bg-white/5" />
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            {displayCrates.map(crate => (
                                                <CrateCard 
                                                    key={crate.id} 
                                                    crate={crate} 
                                                    allCrates={crates} 
                                                    allInventory={allInventory} 
                                                    onPack={handleReopenForPacking}
                                                    onDelete={handleDeleteCrate}
                                                    onNest={(c) => setNestingUnit(c)}
                                                    onEdit={(c) => setEditingCrate(c)}
                                                    isPackedView={true}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4 content-start">
                                {displayCrates.map(crate => (
                                    <CrateCard 
                                        key={crate.id} 
                                        crate={crate} 
                                        allCrates={crates} 
                                        allInventory={allInventory} 
                                        onPack={
                                            activeTab === 'deployed' ? handleReturnToPacking
                                            : handlePack
                                        }
                                        onDelete={handleDeleteCrate}
                                        onNest={(c) => setNestingUnit(c)}
                                        onEdit={(c) => setEditingCrate(c)}
                                        isDeployedView={isLibraryOrDeployed}
                                    />
                                ))}
                            </div>
                        )
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
                                    {(subTab === 'empty')
                                        ? 'No empty units available. Create new storage to begin packing.'
                                        : (subTab === 'deployed' || subTab === 'crates')
                                        ? 'No deployed units found in the shipping registry.'
                                        : 'No units found matching this criteria.'}
                                </p>
                            </div>
                            {(subTab === 'empty' || subTab === 'crates') && (
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

            {/* NESTING WIZARD MODAL */}
            {nestingUnit && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-2xl animate-in fade-in duration-500">
                    <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 w-full max-w-2xl overflow-hidden shadow-[0_0_150px_rgba(0,0,0,0.5)] flex flex-col rounded-[2rem] relative">
                        {/* Glassmorphic Shine Effect */}
                        <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-(--main-color)/30 to-transparent pointer-events-none" />
                        
                        <div className="p-10 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex flex-col gap-3">
                                <h3 className="text-2xl font-black uppercase tracking-[0.5em] text-(--main-color) italic">Nesting Protocol</h3>
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] font-mono">Assign {nestingUnit.id.slice(0, 8).toUpperCase()} to logical container</p>
                            </div>
                            <button onClick={() => setNestingUnit(null)} className="p-3 text-white/20 hover:text-white transition-all hover:scale-125 cursor-pointer">
                                <X size={28} strokeWidth={1} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto no-scrollbar p-10 max-h-[60vh]">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {crates.filter(c => (c.status !== 'Packed' || (c.type !== 'cardboard')) && (c.type === 'crate' || c.type === 'pallet') && c.id !== nestingUnit.id && !c.parent_id).map(dest => (
                                    <button
                                        key={dest.id}
                                        onClick={() => handleNestUnit(nestingUnit.id, dest.id)}
                                        disabled={isSavingNest}
                                        className="flex flex-col items-start gap-6 p-8 bg-white/[0.02] border border-white/5 hover:border-(--main-color)/50 hover:bg-white/[0.05] transition-all text-left group cursor-pointer relative overflow-hidden rounded-3xl"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-(--main-color)/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        
                                        <div className="flex items-center justify-between w-full relative z-10">
                                            <div className="flex items-center gap-1">
                                                {(() => {
                                                    const { date, vendors: vList, sequence } = getDynamicCrateIdComponents(dest, crates, allInventory);
                                                    if (!date && !sequence) return (
                                                        <span className="text-[10px] font-mono font-black text-white/40 uppercase tracking-widest">{dest.id.slice(0, 8).toUpperCase()}</span>
                                                    );
                                                    return (
                                                        <>
                                                            {date && (
                                                                <div className="bg-white/10 px-1.5 py-0.5">
                                                                    <span className="text-[11px] font-black text-white tracking-[0.1em] leading-none block">{date}</span>
                                                                </div>
                                                            )}
                                                            {vList.map((v) => (
                                                                <div 
                                                                    key={v} 
                                                                    className="px-1.5 py-0.5"
                                                                    style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }}
                                                                >
                                                                    <span className="text-[11px] font-black tracking-[0.1em] leading-none block text-black">{v}</span>
                                                                </div>
                                                            ))}
                                                            {sequence && (
                                                                <div className="px-2 py-0.5 bg-white/5">
                                                                    <span className="text-[11px] font-black tracking-[0.1em] leading-none block text-white/90">{sequence}</span>
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                            <div className={`w-2 h-2 ${dest.status === 'Partial' ? 'bg-amber-400' : dest.status === 'Packed' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-lg font-black text-white tracking-tighter uppercase">{dest.width_cm}×{dest.length_cm}×{dest.height_cm}</span>
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">{dest.type} · {dest.status}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-8 border-t border-white/5 bg-white/[0.02] flex items-center justify-center">
                            <p className="text-[10px] font-black text-white/10 uppercase tracking-widest">Nesting packed boxes maintains their inventory and status within the parent unit</p>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <CrateCreationModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onRefresh={handleRefresh}
                />
            )}
            
            {editingCrate && (
                <CrateEditPanel 
                    crate={editingCrate}
                    allCrates={crates}
                    allInventory={allInventory}
                    onClose={() => setEditingCrate(null)}
                    onSave={handleSaveCrate}
                    onDeleteGroup={handleDeleteCratesGroup}
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
