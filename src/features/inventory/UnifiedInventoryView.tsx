import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { createPortal } from 'react-dom';
import Barcode from 'react-barcode';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    inventoryStatusFilterAtom,
    showFinancialsAtom,
    inventorySearchTermAtom,
    inventoryActiveFilterAtom,
    exchangeRateAtom,
    isDetailsPanelOpenAtom,
    detailsPanelModeAtom,
    SelectedItemDataAtom,
    SelectedItemRowAtom,
    ImageSrcAtom,
    InventoryVersionAtom,
    userAtom,
    inventoryViewSliderAtom,
    filteredInventoryCountAtom,
    filteredInventoryTotalQtyAtom,
    filteredInventoryTotalValueAtom,
    filteredInventoryIdsAtom,
    activeVendorsAtom,
    inventoryVendorFilterAtom,
    isInventoryVendorFilterOpenAtom,
    inventorySortKeyAtom,
    inventorySortOrderAtom,
    inventoryCategoryFilterAtom,
    isInventoryCategoryFilterOpenAtom,
    inventoryMaterialFilterAtom,
    isInventoryMaterialFilterOpenAtom,
    isInventorySortMenuOpenAtom,
    isInventoryFiltersPanelOpenAtom,
    inventoryAtom,
    financeDataAtom,
    paymentsArtifactConfigAtom,
    isInventorySelectionModeAtom,
    selectedInventoryIdsAtom,
    inventoryArtifactConfigAtom,
    themeAtom,
    storeShoppingBagAtom,
    isPackingPrintWizardOpenAtom,
    isPackingNFCWizardOpenAtom,
    isPackingCrateWizardOpenAtom,
    isPaymentWizardOpenAtom,
    inventoryStatusSetsAtom,
    isUploadWizardOpenAtom,
    uploadItemDataAtom,
    logisticsDataAtom,
    visibleWorkbooksAtom,
    inventoryShapeFilterAtom,
    inventoryContentFilterAtom,
    inventoryMaterialColorFilterAtom
} from '../../lib/atoms';
import { WireframeCrate } from '../../components/CrateVisuals';
import { rowWorkbook } from '../../lib/seasons';
import { rowMatchesShape, rowMatchesMaterialColor } from '../../lib/smartFilters';
import { rowMatchesContent } from '../../lib/aiContent';
import { useDatabase, useTranslation } from '../../lib/hooks';
import { calculateCodesAndPrices, normalizeInventoryData, handleFileUpload, readFileAsDataURL, getCleanImageUrl, isVideoFile, formatWeightImperial, formatDimensionsImperial, formatWeightMetricOnly, formatDimensionsMetricOnly, formatWeightImperialOnly, formatDimensionsImperialOnly, getStatusClass, getDynamicCrateIdComponents, extractFileId, collectAllImages } from '../../lib/utils';
import { InventoryItemData, UploadedFile } from '../../lib/Types';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { InventorySkeletonGrid, InventorySkeletonList } from './InventorySkeleton';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { WireframeIcon } from './InventoryArtifact';
import { validateCopy } from '../../lib/copyValidation';
import { COLOR_PALETTE, ALLOWED_SHOPIFY_COLORS } from '../../lib/colorExtractor';
import { X, Edit2, ChevronDown, Menu, Filter, Upload, Video, Pencil, Maximize2, Trash2, ChevronLeft, ChevronRight, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown, Layers, Box, Tag, FileText, CloudUpload, Check, Share2, Copy, LayoutList, LayoutGrid, Layout, QrCode, ScanBarcode, Printer, Nfc, Package, Truck, CreditCard, Link } from 'lucide-react';
import { tr } from '../../lib/i18n';


const lbl = "text-[11px] font-black text-(--text-color) opacity-30 uppercase tracking-[0.2em] block ml-1 opacity-60 mb-2";
const inp = "h-12 w-full px-4 bg-(--text-color)/[0.04] border border-(--text-color)/12 rounded-2xl text-sm text-(--text-color) placeholder-(--text-color)/30 outline-none focus:border-(--main-color)/50 focus:bg-(--text-color)/[0.08] transition-all";
const inpNum = inp + " font-mono text-center";

// Typography for each column's VALUE — one definition, used by the row cell
// AND by the panel field that stands in for it when the row drops that column.
// A value must look the same whichever level it is shown on: an LD code is
// yellow mono whether it sits in the row or has moved down into the panel.
// (The panel used to restate these by hand and drifted — AQ lost its tint,
// LD its yellow.) Panel-only siblings reuse the nearest column's style, so
// SIZE IN reads like SIZE and LANDED/RETAIL like PRICE.
const COL_TEXT = {
    color:    'text-[12px] font-black text-(--text-color)/65 uppercase tracking-[0.05em]',
    size:     'text-[13px] font-mono font-black text-(--text-color)',
    weight:   'text-[13px] font-mono font-bold text-(--text-color)/70',
    price:    'text-[14px] font-black text-(--text-color)',
    total:    'text-[14px] font-black text-(--main-color)',
    landed:   'text-[14px] font-black text-yellow-500',
    retail:   'text-[14px] font-black text-green-500',
    aq:       'text-[13px] font-mono font-black text-(--text-color)/75',
    ld:       'text-[13px] font-mono font-black text-yellow-500/90',
    unpacked: 'text-[10px] font-black text-(--text-color)/30 uppercase tracking-[0.15em] leading-none',
};

// AI bodies are stored as HTML for Shopify (231 of 445 carry tags). The panel
// shows them as text: paragraph and line breaks kept, every tag dropped.
// DOMParser builds an inert document — scripts in it never run — so nothing
// in a stored body can execute here, which dangerouslySetInnerHTML could not
// promise.
const htmlToText = (html: string): string => {
    if (!html) return '';
    const marked = String(html)
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n\n');
    const text = typeof DOMParser !== 'undefined'
        ? (new DOMParser().parseFromString(marked, 'text/html').body.textContent || '')
        : marked.replace(/<[^>]*>/g, '');
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

// Swatch colours for the AI colour list, from the colour matcher's own
// reference palette. Clear has no colour and Multicolor/Rainbow are drawn as
// a wheel; anything unrecognised gets an empty ring rather than a guess.
const SWATCHES: Record<string, string> = COLOR_PALETTE.reduce((acc, c) => {
    acc[c.name.toLowerCase()] = `rgb(${c.rgb.join(', ')})`;
    return acc;
}, {} as Record<string, string>);
// The store's colour names. A generated colour outside this list is not
// imported as-is: the Shopify export resolves it through the stone-variety
// table or leaves it out (MainHeader normalizeShopifyColors), so the panel
// marks it rather than presenting it as a colour the store will show.
const SHOPIFY_COLOR_SET = new Set(ALLOWED_SHOPIFY_COLORS.map(c => c.toLowerCase()));
// Titles past this are cut by the Shopify export (MainHeader, `title.slice(0, 70)`).
const EXPORT_TITLE_MAX = 70;

const swatchFor = (name: string): string => {
    const k = name.trim().toLowerCase().replace('grey', 'gray');
    if (k === 'multicolor' || k === 'rainbow') return 'conic-gradient(#dc2626, #eab308, #16a34a, #2563eb, #9333ea, #dc2626)';
    return SWATCHES[k] || 'transparent';
};

// Building blocks of an open row's panel. `k` names the entry (`inv-f-<k>`).
// `overflow` marks an entry that mirrors one of the ROW's own columns: it
// stays hidden while the row shows that column and appears when the row drops
// it at the current width — density.css toggles both sides from the same
// container-width step, so a value is never lost, only moved.
//
// SpecRow is a spec-sheet line: a fixed label column, the value beside it.
const SpecRow = ({ k, label, overflow = false, title, children }: {
    k: string; label: string; overflow?: boolean; title?: string; children: React.ReactNode;
}) => (
    <div className={`inv-spec-row inv-f-${k}${overflow ? ' inv-f-overflow' : ''}`} title={title}>
        <dt className="inv-spec-l">{label}</dt>
        <dd className="inv-spec-v">{children}</dd>
    </div>
);

// Stat is a figure with its label above it, for values read side by side.
const Stat = ({ k, label, overflow = false, valueClassName = '', children }: {
    k: string; label: string; overflow?: boolean; valueClassName?: string; children: React.ReactNode;
}) => (
    <div className={`inv-stat inv-f-${k}${overflow ? ' inv-f-overflow' : ''}`}>
        <span className="inv-stat-l">{label}</span>
        <span className={`inv-stat-v ${valueClassName}`}>{children}</span>
    </div>
);

const DriveImage = ({ src, className, ...props }: any) => {
    const isIOS = typeof navigator !== 'undefined' && 
        (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    const resolvedSrc = useMemo(() => {
        if (!src) return null;

        // Handle data URIs directly
        if (src.startsWith('data:') || src.startsWith('blob:')) return src;

        // For Drive URLs, extract the ID
        const fid = extractFileId(src);
        if (fid) {
            // Revert back to lh3.googleusercontent.com/d/
            // Appending ?.png helps trick iOS Safari's strict MIME sniffer into rendering
            // the opaque application/octet-stream as an image.
            return `https://lh3.googleusercontent.com/d/${fid}?.png`;
        }

        // For non-Drive URLs, just clean them
        return getCleanImageUrl(src) || src;
    }, [src]);

    const [hasError, setHasError] = useState(false);

    // Reset error state when src changes
    useEffect(() => { setHasError(false); }, [resolvedSrc]);

    if (!resolvedSrc || hasError) {
        return <div className={`bg-white/5 ${className}`}></div>;
    }

    const imgProps = { ...props };
    if (isIOS) {
        delete imgProps.loading;
        delete imgProps.decoding;
    } else {
        if (!imgProps.loading) imgProps.loading = "lazy";
        if (!imgProps.decoding) imgProps.decoding = "async";
    }

    return <img src={resolvedSrc} className={className} onError={() => setHasError(true)} {...imgProps} />;
};

const FullscreenImageViewer = ({ src, mediaUrls = [], initialIdx = 0, onClose }: { src: string; mediaUrls?: string[]; initialIdx?: number; onClose: () => void }) => {
    const [currentIdx, setCurrentIdx] = useState(initialIdx);
    const activeSrc = mediaUrls.length > 0 ? mediaUrls[currentIdx] : src;
    const isVideo = isVideoFile(activeSrc);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Touch Swipe State
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const minSwipeDistance = 50;

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (isVideo) return; e.preventDefault();
        setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.002)));
    }, [isVideo]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isVideo) return; setIsDragging(true); setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || isVideo) return; setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleMouseUp = () => setIsDragging(false);

    const nav = (dir: number) => {
        if (mediaUrls.length === 0) return; setCurrentIdx(p => (p + dir + mediaUrls.length) % mediaUrls.length);
        setScale(1); setPosition({ x: 0, y: 0 });
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd || scale > 1) return; // Disable swipe when zoomed
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        
        if (isLeftSwipe) nav(1);
        if (isRightSwipe) nav(-1);
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-10000 bg-black/98 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300" 
            onClick={onClose} 
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <button onClick={onClose} className="absolute top-8 right-8 z-10 w-12 h-12 rounded-full bg-(--text-color)/5 border border-(--text-color)/10 flex items-center justify-center text-(--text-color) opacity-30 hover:opacity-100 hover:bg-(--text-color)/10 transition-all">
                <X className="w-6 h-6" />
            </button>
            {mediaUrls.length > 1 && (
                <div className="absolute inset-0 flex items-center justify-between px-8 pointer-events-none">
                    <button onClick={(e) => { e.stopPropagation(); nav(-1); }} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 hidden sm:flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all pointer-events-auto"><ChevronLeft size={32} /></button>
                    <button onClick={(e) => { e.stopPropagation(); nav(1); }} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 hidden sm:flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all pointer-events-auto"><ChevronRight size={32} /></button>
                </div>
            )}
            {isVideo ? (
                <video preload="none" src={getCleanImageUrl(activeSrc)} controls autoPlay className="max-w-[90vw] max-h-[90vh] shadow-2xl rounded-2xl" onClick={(e) => e.stopPropagation()} />
            ) : (
                <DriveImage loading="lazy" src={activeSrc} alt="" draggable={false}
                    key={currentIdx}
                    className="max-w-[90vw] max-h-[90vh] object-contain select-none transition-transform animate-in fade-in zoom-in-95 duration-300"
                    style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                />
            )}
        </div>
, document.body
    );
};

function getTextContrast(hex: string): string {
    if (!hex) return '#ffffff';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#000000' : '#ffffff';
}

const PackedCrateBadge = ({ crateId, itemId, logisticsDocs, allInventory, isCompact = false }: { crateId: string, itemId: string, logisticsDocs: any[], allInventory: any[], isCompact?: boolean }) => {
    const crate = logisticsDocs?.find((c: any) => c.id === crateId);
    
    // Find vendor from itemId
    const rawId = (itemId || '').toUpperCase();
    const vendorKey = Object.keys(vendors).sort((a, b) => b.length - a.length).find(k => rawId.startsWith(k));
    const vendorName = vendorKey ? (vendors as any)[vendorKey]?.name || vendorKey : 'Unknown';
    const vendorColor = vendorKey ? (vendors as any)[vendorKey]?.color || '#555' : '#555';

    if (!crate) {
        if (isCompact) {
            return (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-teal-500/10 border border-teal-500/20 rounded shadow-lg backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-teal-400 leading-none shadow-[0_0_10px_rgba(45,212,191,0.3)]">
                        {crateId || tr("DEPLOYED")}
                    </span>
                </div>
            );
        }
        return (
            <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest leading-none flex items-center gap-1"><Truck size={12} strokeWidth={3} /> {tr("DEPLOYED")}</span>
                <span className="text-[11px] font-mono font-bold text-teal-400/80">{crateId || tr("Unknown")}</span>
            </div>
        );
    }

    const { date, vendors: vList, sequence } = getDynamicCrateIdComponents(crate, logisticsDocs || [], allInventory || []);
    // The same composition CratesInventoryView uses, so the badge in a row and
    // the header in the warehouse always read as the same crate.
    const crateName = date ? `${date}${vList.join('')}${sequence}` : (sequence || crate.id?.slice(0, 8).toUpperCase());
    const dims = [crate.width_cm, crate.length_cm, crate.height_cm].filter(Boolean).join('×');

    if (isCompact) {
        return (
            <div className="crate-badge crate-badge--compact flex items-center gap-1.5 shrink-0">
                <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={18} vibrant />
                <span className="crate-badge__name text-[11px] font-black tracking-[0.08em] leading-none tabular-nums">{crateName}</span>
                <span className="flex items-center gap-[2px]">
                    {vList.map(v => (
                        <span key={v} className="crate-badge__vendor" style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }}>{v}</span>
                    ))}
                </span>
            </div>
        );
    }

    // The row badge used to be an icon plus two-letter vendor blocks and nothing
    // else -- it identified the vendors in a crate but never the crate, so you
    // could not tell two crates apart from the inventory list at all. It now
    // leads with the crate name and carries the dimensions underneath.
    return (
        <div className="crate-badge flex items-center gap-2 shrink-0" title={`${tr("Crate")} ${crateName} · ${dims} ${tr("CM")}`}>
            <span className="crate-badge__icon flex items-center justify-center shrink-0">
                <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={26} vibrant />
            </span>
            <span className="flex flex-col gap-[3px] min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                    <span className="crate-badge__name text-[13px] font-black tracking-[0.06em] leading-none tabular-nums truncate">{crateName}</span>
                    <span className="flex items-center gap-[2px] shrink-0">
                        {vList.map(v => (
                            <span key={v} className="crate-badge__vendor" style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }}>{v}</span>
                        ))}
                    </span>
                </span>
                {dims && (
                    <span className="crate-badge__meta text-[10px] font-black uppercase tracking-[0.14em] leading-none tabular-nums">
                        {dims}<span className="opacity-50 ml-1">{tr("CM")}</span>
                    </span>
                )}
            </span>
        </div>
    );
};

const UnifiedInventoryCard = React.memo(({ item, isExpanded = 0, onToggleExpand, exchangeRate, showFinancials, viewMode, partialPayIds, fullPayIds, requestedAcqIds, onEdit, financeDocs, deployedItemsMap, logisticsDocs, allInventory }: any) => {
    const isSelectionMode = useAtomValue(isInventorySelectionModeAtom);
    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    const theme = useAtomValue(themeAtom);
    const qrColor = theme === 'aqua' ? '#000000' : '#FFFFFF'; // aqua is the only light theme left
    
    // Store Bag Implementation
    const [bag, setBag] = useAtom(storeShoppingBagAtom);
    const inBag = bag.some((b: any) => b.row === item.row);
    const handleToggleBag = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (inBag) {
            setBag(bag.filter((b: any) => b.row !== item.row));
            toast.error(tr("Removed from Store Bag"), { icon: '🗑️' });
        } else {
            setBag([...bag, item]);
            toast.success(tr("Added to Store Bag"), { style: { background: 'var(--main-color)', color: '#000' }, icon: '🛍️' });
        }
    };

    const handleToggleSelection = (id: string | number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };
    const norm = useMemo(() => normalizeInventoryData(item.data), [item.data]);
    const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
    const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#ccc';
    const [showViewer, setShowViewer] = useState(false);
    const [viewerIdx, setViewerIdx] = useState(0);
    const [modalIdx, setModalIdx] = useState(0);
    const [cardIdx, setCardIdx] = useState(0);
    // The GENERATED body opens clamped to three lines; this expands it.
    const [showFullBody, setShowFullBody] = useState(false);
    const [isHoveringCard, setIsHoveringCard] = useState(false);


    const mediaUrls = useMemo(() => {
        const rawImages = norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [];
        if (norm.processed_media_urls) {
            const processedMediaStr = String(norm.processed_media_urls).trim();
            if (processedMediaStr.startsWith('{')) {
                try {
                    const processedMap = JSON.parse(processedMediaStr);
                    const images = collectAllImages(norm);
                    const mapped = images.map(img => processedMap[img]).filter(Boolean);
                    if (mapped.length > 0) return mapped;
                } catch(e) {}
            } else {
                return processedMediaStr.split(',').map(u => u.trim()).filter(Boolean);
            }
        }
        if (norm.video_gen) {
            return [norm.video_gen, ...rawImages.filter(r => r !== norm.video_gen)];
        }
        if (norm.generatedPngUrl) {
            return [norm.generatedPngUrl];
        }
        return rawImages;
    }, [norm.mediaUrls, norm.generatedPngUrl, norm.processed_media_urls, norm.video_gen, norm]);


    const activeIdx = 0;
    const rawImageUrl = mediaUrls[activeIdx] || null;
    const imageUrl = getCleanImageUrl(rawImageUrl);
    const isVideo = rawImageUrl ? isVideoFile(rawImageUrl) : false;

    const dimensionsStr = formatDimensionsImperial(norm.widthCm, norm.heightCm, norm.lengthCm);
    const weightStr = formatWeightImperial(norm.weightKg);
    const metricDimensionsStr = formatDimensionsMetricOnly(norm.widthCm, norm.heightCm, norm.lengthCm);
    const metricWeightStr = formatWeightMetricOnly(norm.weightKg);

    const calculated = useMemo(() => calculateCodesAndPrices(norm, exchangeRate, '326'), [norm, exchangeRate]);
    const payStatus = getStatusClass(norm, partialPayIds, fullPayIds, requestedAcqIds);
    const col = payStatus === 'GREEN' ? '#22c55e' : payStatus === 'YELLOW' ? '#eab308' : payStatus === 'RED' ? '#ef4444' : payStatus === 'BLUE' ? '#38bdf8' : payStatus === 'PURPLE' ? '#a855f7' : 'transparent';
    const accentColor = col;

    // Derive deployed status from crates data (independent of payment)
    const itemKey = String(item.row ?? item.data?.id ?? '');
    let deployedInfo = deployedItemsMap?.get(itemKey) || null;
    if (!deployedInfo) {
        const crateId = item.data.crate_id;
        const isPacked = item.data.packing_status === 'Packed';
        const crate = logisticsDocs?.find((c: any) => c.id === crateId);
        if (isPacked && crateId && (!crate || crate.status === 'Deployed')) {
            deployedInfo = { manifestId: crate?.name || 'Deployed', crateId };
        }
    }

    const itemPriceMXN = Math.round(Number(norm.price || 0));
    const itemTotalMXN = itemPriceMXN * Number(norm.quantity || 1);

    // ── Shared by the row, the open panel and the payment table ──
    // Declared here, above every function that reads them, on purpose: a
    // `const` read from a function body that runs before its declaration line
    // is a TDZ crash that neither typecheck nor build catches (MainHeader's
    // classifyMedia failed exactly that way).
    // Non-breaking spaces INSIDE each measurement, ordinary ones only around
    // the ×, so a narrow panel wraps between measurements ("3' 7 5/16" ×" /
    // "9 1/16"") and never through one ("9" / "1/16"") — a split fraction reads
    // as two different numbers.
    const imperialDims = formatDimensionsImperialOnly(norm.widthCm, norm.heightCm, norm.lengthCm)
        .split(' x ').map(part => part.replace(/ /g, ' ')).join(' × ');
    const imperialWeight = formatWeightImperialOnly(norm.weightKg);
    const stone = [norm.color, norm.material].filter(Boolean).join(' ');
    const fmtMoney = (v: any) => {
        if (!showFinancials) return '***';
        const n = Number(v);
        return Number.isFinite(n) ? `$${n.toLocaleString(tr("en-US"))}` : `$${v}`;
    };
    const fmtDate = (d: any) => {
        if (!d) return '';
        const t = new Date(d);
        return isNaN(t.getTime()) ? String(d) : t.toLocaleDateString(tr("en-US"), { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // The AI copy. Only worked out for an open row: the body needs an HTML
    // parse and the check a full scan, and 480 closed rows need neither.
    const aiTitle = String(norm.detailedDescription || '').trim();
    const aiBodyText = useMemo(() => (isExpanded ? htmlToText(norm.generatedDescription || '') : ''), [isExpanded, norm.generatedDescription]);
    const aiColors = String(norm.generatedColor || '').split(',').map(c => c.trim()).filter(Boolean);
    const aiTypePath = String(norm.generatedType || '').split('>').map(p => p.trim()).filter(Boolean);
    const hasAiCopy = !!(aiTitle || aiBodyText);
    const hasAnyAi = hasAiCopy || aiColors.length > 0 || aiTypePath.length > 0;
    const aiIssues = useMemo(() => (isExpanded && (aiTitle || aiBodyText))
        ? validateCopy(aiTitle, aiBodyText, {
            color: norm.color, material: norm.material,
            widthCm: norm.widthCm != null ? Number(norm.widthCm) : null,
            heightCm: norm.heightCm != null ? Number(norm.heightCm) : null,
            lengthCm: norm.lengthCm != null ? Number(norm.lengthCm) : null,
            quantity: Number(norm.quantity) || 1,
        })
        : [], [isExpanded, aiTitle, aiBodyText, norm.color, norm.material, norm.widthCm, norm.heightCm, norm.lengthCm, norm.quantity]);
    // What the panel reports: validateCopy's findings, plus the one fact it
    // does not check — a title the export will cut. Kept here rather than
    // added to validateCopy so the batch processor's retry rule is unchanged.
    const aiNotes: string[] = [
        ...aiIssues.map(iss => iss.message),
        ...(aiTitle.length > EXPORT_TITLE_MAX
            ? [`Title is ${aiTitle.length} characters — the Shopify export cuts it at ${EXPORT_TITLE_MAX}.`]
            : []),
    ];

    // The vendor key. One element with two homes: the row's TAG column, and
    // the open panel when the row has dropped that column (phone widths).
    const tagKey = (
        <button
            onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(calculated.bookBarcode);
                toast.success(`Tag ID Copied: ${calculated.bookBarcode}`, { icon: '🏷️' });
            }}
            title={calculated.bookBarcode}
            className="vendor-tag inline-flex items-center rounded text-black text-[13px] leading-none font-black uppercase tracking-tight shadow-sm w-fit max-w-full hover:scale-105 active:scale-95 transition-all overflow-hidden"
        >
            <span className="px-1.5 py-1 shrink-0" style={{ backgroundColor: vendorColor }}>{(calculated.bookBarcodeDisplay || 'N/A').slice(0, 5)}</span>
            <span className="px-1.5 py-1 text-(--text-color) bg-transparent border border-white/10 truncate">{(calculated.bookBarcodeDisplay || 'N/A').slice(5)}</span>
        </button>
    );

    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    const getPayLabel = () => {
        if (!payStatus) return 'New';
        if (payStatus === 'GREEN') return 'Paid';
        if (payStatus === 'YELLOW') return 'Requested';
        if (payStatus === 'RED') {
            const isProd = String(norm.status || item.status || item.source || '').toLowerCase().includes('production');
            return isProd ? 'Advance' : 'Partial';
        }
        if (payStatus === 'BLUE') return 'NEW';
        return 'New';
    };

    const itemPayments = useMemo(() => {
        if (!isExpanded || !financeDocs) return [];
        return financeDocs.filter((d: any) => {
            const rel = d.related_ids || d.related_inventory_ids || '';
            let relArray: string[] = [];
            if (Array.isArray(rel)) relArray = rel.map(id => String(id));
            else if (typeof rel === 'string') relArray = rel.split(',').map(s => s.trim()).filter(Boolean);
            return relArray.includes(String(item.data.id));
        }).sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    }, [isExpanded, financeDocs, item.data.id]);

    // Book 825 is prepaid by rule (getStatusClass, "Book 825 / Prepaid
    // Override"), so its items read GREEN with no payment record behind them.
    // The payment section says so, instead of a bare "No payments linked" under
    // a green status dot, which reads as missing data.
    const prepaidByBook = payStatus === 'GREEN' && !norm.payDate &&
        (['v825', '825'].includes(String(norm.workbook || '').toLowerCase()) || String(norm.payReq || '').toLowerCase() === 'prepaid');
    const isPrepaidByRule = prepaidByBook && itemPayments.length === 0;

    // The row's logistics mark — a truck when deployed, a crate when packed —
    // shown beside the AQ / LD codes whenever the PACKING column is not in the
    // row. Payment needs no mark: the row's coloured edge carries it.
    const logBadge = deployedInfo ? { tone: 'dep', label: tr("Deployed"), Icon: Truck }
        : norm.packingStatus === 'Packed' ? { tone: 'packed', label: tr("Packed"), Icon: Package }
        : null;
    const deployedTitle = deployedInfo
        ? [tr("Deployed"), deployedInfo.manifestId && deployedInfo.manifestId !== 'Deployed' ? deployedInfo.manifestId : '', fmtDate(deployedInfo.date)].filter(Boolean).join(' · ')
        : '';

    // Payment history is a table, not a stack of cards: the column labels are
    // stated once in a header row instead of being repeated inside every
    // payment, and the amounts share right edges so they can be compared down
    // the column. It always renders — an item with nothing linked says so,
    // rather than the section silently not appearing.
    //
    // A payment is a BATCH: one finance record pays for many items, and its
    // amounts are the batch's, not this item's share. Without the ITEMS count
    // a $280 lamp sat above an $8,338 payment and read as an error.
    const renderPaymentHistory = () => {
        const rows = itemPayments.map((p: any) => {
            const net = Number(p.amount) || 0;
            const fees = Number(p.commission) || 0;
            return { p, net, fees, total: net + fees };
        });
        const sum = (k: 'net' | 'fees' | 'total') => rows.reduce((a, r) => a + r[k], 0);
        return (
            <div className="payment-history inv-num">
                <h4 className="inv-cluster-t">{tr("Payments")}<span className="inv-cluster-note">{tr("MXN · whole batch")}</span></h4>
                {rows.length === 0 ? (
                    <div className="inv-pay-empty">
                        {isPrepaidByRule
                            ? tr("Prepaid — Book 825 items carry no payment record.")
                            : tr("No payments linked to this item yet.")}
                    </div>
                ) : (
                    <div className="inv-pay-table">
                        <div className="inv-pay inv-pay-head">
                            <span>{tr("Date")}</span>
                            <span>{tr("Status")}</span>
                            <span className="inv-r" title={tr("Items covered by this payment")}>{tr("Items")}</span>
                            <span className="inv-pay-net inv-r">{tr("Net Paid")}</span>
                            <span className="inv-pay-fees inv-r">{tr("Taxes/Fees")}</span>
                            <span className="inv-r">{tr("Total")}</span>
                        </div>
                        {rows.map(({ p, net, fees, total }) => (
                            <div key={p.id} className="payment-row inv-pay">
                                <span className="font-bold truncate">{p.date ? fmtDate(p.date) : tr("Unknown Date")}</span>
                                <span className={`text-[11px] font-black uppercase tracking-widest truncate ${p.status === 'Paid' ? 'text-green-500' : p.status === 'Requested' ? 'text-yellow-600' : 'text-sky-500'}`}>{p.status || 'New'}</span>
                                <span className="inv-r font-mono font-bold text-(--text-color)/70">{Array.isArray(p.related_ids) && p.related_ids.length ? p.related_ids.length : '—'}</span>
                                <span className="inv-pay-net inv-r font-mono font-bold">{fmtMoney(net)}</span>
                                <span className="inv-pay-fees inv-r font-mono font-bold text-red-400">{fmtMoney(fees)}</span>
                                <span className="inv-r font-mono font-black text-(--main-color)">{fmtMoney(total)}</span>
                            </div>
                        ))}
                        {rows.length > 1 && (
                            <div className="inv-pay inv-pay-sum">
                                <span>{rows.length} {tr("payments")}</span>
                                <span />
                                <span />
                                <span className="inv-pay-net inv-r font-mono">{fmtMoney(sum('net'))}</span>
                                <span className="inv-pay-fees inv-r font-mono text-red-400">{fmtMoney(sum('fees'))}</span>
                                <span className="inv-r font-mono text-(--main-color)">{fmtMoney(sum('total'))}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);
    const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
    const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
    const setImageSrc = useSetAtom(ImageSrcAtom);
    const user = useAtomValue(userAtom);
    const isEditable = user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'Vendor';
    const isInternalUser = user?.role === 'Developer' || user?.role === 'Admin';
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation(); if (onEdit) onEdit(item.row, item.data);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation(); if (!window.confirm(tr("PERMANENTLY REMOVE this item from registry?"))) return;
        const tid = toast.loading(tr("Removing Artifact..."));
        try {
            const tbl = item.source === 'production' ? 'production' : 'inventory';
            const { error } = await supabase.from(tbl).update({ is_hidden: true }).eq('id', item.row);
            if (error) throw error; toast.success(tr("Removed"), { id: tid }); setInventoryVersion(v => v + 1);
        } catch (err: any) { toast.error(err.message, { id: tid }); }
    };

    if (viewMode === 'list') {
        return (
            <div className="flex flex-col gap-0.5">
                {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} mediaUrls={mediaUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
                <div className={`inv-grid inv-row overflow-hidden bg-(--sidebar-bg) border rounded-md hover:border-white/10 transition-all group shadow-sm cursor-pointer ${isExpanded > 0 ? 'ring-1 ring-(--main-color)/30' : ''}`}
                    onClick={() => onToggleExpand()} style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)' }}>

                    {/* RAIL — payment + deployment status, or the selection box.
                        The checkbox REPLACES the dots rather than adding a track:
                        a conditional extra column would shift every other column
                        sideways the moment selection mode turned on, and the whole
                        point of the fixed template is that it doesn't. */}
                    <div className="inv-c-rail flex flex-col items-center justify-center gap-1"
                        onClick={isSelectionMode ? (e) => { e.stopPropagation(); handleToggleSelection(item.row ?? item.data?.id); } : undefined}>
                        {isSelectionMode ? (
                            <div className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${selectedIds.includes(item.row ?? item.data?.id) ? 'bg-(--main-color) border-(--main-color)' : 'border-white/25'}`}>
                                {selectedIds.includes(item.row ?? item.data?.id) && <Check size={12} className="text-black" strokeWidth={4} />}
                            </div>
                        ) : (
                            <>
                                <span
                                    title={getPayLabel()}
                                    className="status-dot w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: accentColor || '#38bdf8', boxShadow: `0 0 8px ${accentColor || '#38bdf8'}60` }}
                                />
                                {deployedInfo && (
                                    <span
                                        title={deployedInfo.manifestId ? deployedInfo.manifestId.replace('TRK-', 'TRK ') : 'Deployed'}
                                        className="status-dot w-2 h-2 rounded-full bg-teal-400 shrink-0"
                                        style={{ boxShadow: '0 0 8px rgba(45, 212, 191, 0.4)' }}
                                    />
                                )}
                            </>
                        )}
                    </div>

                    {/* EDGE — the payment colour as a hairline down the row. */}
                    <div className="inv-c-edge" style={{ backgroundColor: payStatus ? accentColor : 'transparent', opacity: payStatus ? 0.7 : 0 }} />

                    {/* MEDIA */}
                    <div className="inv-c-media relative bg-black/40 group/listimg isolate"
                        onMouseEnter={() => setIsHoveringCard(true)} onMouseLeave={() => { setIsHoveringCard(false); setCardIdx(0); }}
                        onClick={(e) => { e.stopPropagation(); if (mediaUrls.length > 1) { setCardIdx(p => (p + 1) % mediaUrls.length); } }}
                        onTouchStart={(e) => { e.stopPropagation(); setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }}
                        onTouchMove={(e) => { e.stopPropagation(); setTouchEnd(e.targetTouches[0].clientX); }}
                        onTouchEnd={(e) => {
                            e.stopPropagation();
                            if (!touchStart || !touchEnd) return;
                            const dist = touchStart - touchEnd;
                            if (dist > 30) setCardIdx(p => (p + 1) % mediaUrls.length);
                            if (dist < -30) setCardIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length);
                        }}>
                        {mediaUrls[cardIdx] ? <DriveImage loading="lazy" key={cardIdx} src={mediaUrls[cardIdx]} className="w-full h-full object-cover animate-in fade-in duration-700" /> : <div className="w-full h-full opacity-60 flex items-center justify-center mix-blend-screen scale-[1.3]"><WireframeIcon item={norm} color={accentColor} /></div>}
                        {isVideoFile(mediaUrls[cardIdx]) && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Video size={12} /></div>}

                        {mediaUrls.length > 1 && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setCardIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length); }}
                                    className="absolute left-0 top-1/2 -translate-y-1/2 text-white/40 opacity-0 group-hover/listimg:opacity-100 hover:text-white transition-all drop-shadow-md">
                                    <ChevronLeft size={12} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setCardIdx(p => (p + 1) % mediaUrls.length); }}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 text-white/40 opacity-0 group-hover/listimg:opacity-100 hover:text-white transition-all drop-shadow-md">
                                    <ChevronRight size={12} />
                                </button>
                            </>
                        )}
                    </div>

                    {/* TAG */}
                    <div className="inv-c-tag flex items-center">
                        {tagKey}
                    </div>

                    {/* QTY — beside the tag rather than beside the money: it is part of
                        what the line IS ("SU32653OO × 21"), and read before the price
                        it tells you whether that price is for one piece or a lot. */}
                    <div className="inv-c-qty inv-cell inv-num inv-r text-[13px] font-mono font-black text-cyan-500">{norm.quantity || 1}</div>

                    {/* Two phrase columns, one line per row — see density.css. Shape and
                        type read as one name ("HORSES PAINTED WALL PANEL"), colour and
                        material as one stone ("TEHUACAN WHITE ONYX"), so each pair shares
                        a column, joined by a space. Within the name the shape stays
                        heavier than the type, so the word you scan for comes first
                        at a glance. Each cell clips with an ellipsis and carries a
                        `title`, so a long value never wraps the row and is never
                        unreachable. */}
                    <div className="inv-c-item inv-cell text-[14px] uppercase tracking-tight text-(--text-color)"
                        title={[norm.shape, norm.shortDescription].filter(Boolean).join(' ')}>
                        <span className="font-black">{norm.shape || tr("OBJ")}</span>
                        {norm.shortDescription && <> <span className="font-bold text-(--text-color)/75">{norm.shortDescription}</span></>}
                    </div>
                    <div className={`inv-c-color inv-cell ${COL_TEXT.color}`}
                        title={[norm.color, norm.material].filter(Boolean).join(' ')}>
                        {[norm.color, norm.material].filter(Boolean).join(' ') || '—'}
                    </div>

                    {/* The gutter between the identity block and the figures — see
                        density.css. Empty by design. */}
                    <div className="inv-c-spacer" aria-hidden="true" />

                    <div className={`inv-c-size inv-cell inv-num ${COL_TEXT.size}`} title={metricDimensionsStr || ''}>{metricDimensionsStr || '—'}</div>
                    <div className={`inv-c-weight inv-cell inv-num inv-r ${COL_TEXT.weight}`}>{metricWeightStr || '—'}</div>

                    <div className={`inv-c-price inv-cell inv-num inv-r ${COL_TEXT.price}`}>{showFinancials ? `$${itemPriceMXN.toLocaleString()}` : '***'}</div>
                    <div className={`inv-c-total inv-cell inv-num inv-r ${COL_TEXT.total}`}>{showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}</div>

                    <div className={`inv-c-aq inv-cell inv-num ${COL_TEXT.aq}`}>{calculated.bookAqCode || '—'}</div>
                    <div className={`inv-c-ld inv-cell inv-num ${COL_TEXT.ld}`}>
                        {calculated.bookLandCode || '—'}
                        {/* LOGISTICS MARK — a crate when packed, a truck when deployed,
                            beside the codes. Shown whenever the row is not showing its
                            PACKING column (density.css), so a compact row or a phone card
                            never loses the fact that a piece is packed or on a truck. */}
                        {logBadge && (
                            <span className="inv-mark inv-badge inv-badge--icon" data-tone={logBadge.tone} role="img" title={logBadge.label} aria-label={logBadge.label}>
                                <logBadge.Icon size={11} strokeWidth={2.5} aria-hidden="true" />
                            </span>
                        )}
                    </div>

                    {/* STATE */}
                    <div className="inv-c-state flex items-center min-w-0">
                        {norm.packingStatus === 'Packed' ? (
                            <PackedCrateBadge crateId={norm.crateId || ''} itemId={norm.itemId || norm.tag_id || ''} logisticsDocs={logisticsDocs} allInventory={allInventory} isCompact />
                        ) : (
                            <span className={COL_TEXT.unpacked}>{tr("UNPACKED")}</span>
                        )}
                    </div>

                </div>
                {isExpanded > 0 && (
                    <div className="inv-drawer w-full pt-2 pb-2.5 bg-transparent animate-in slide-in-from-top-2 duration-300 min-w-0">
                        {/* THE OPEN-ROW PANEL — a spec sheet for the piece.

                            Grouped, not gridded. The values sit in three clusters that
                            say what they are — SPECS (stone, size, weight), PRICING
                            (price, landed, retail), LOGISTICS (codes, crate, deployment)
                            — then the AI-GENERATED copy, PAYMENTS, and a toolbar. A flat
                            grid of equal cells
                            gave AQ CODE the same weight as SIZE and wrapped wherever the
                            width fell, so related values ended up lines apart.

                            Every value still has two homes. `inv-f-overflow` rows mirror
                            one of the ROW's columns and appear only when the row has
                            dropped that column at the current width (density.css), so a
                            value moves down one level instead of disappearing; the rest
                            are the panel's own.

                            Layout is by the list's own width: photo column | clusters |
                            vertical toolbar on wide rows; toolbar along the bottom on
                            medium ones; one column on a phone, toolbar last, in reach
                            of the thumb. */}
                        <div className="inv-drawer-body min-w-0">
                        <div className={`inv-panel${mediaUrls.length ? '' : ' inv-panel--nomedia'}`}>

                            {mediaUrls.length > 0 && (
                                <div className="inv-panel-media">
                                    <div role="button" tabIndex={0} className="inv-hero bg-black/40"
                                        title={tr("Open photos")}
                                        onClick={(e) => { e.stopPropagation(); setViewerIdx(0); setShowViewer(true); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setViewerIdx(0); setShowViewer(true); } }}>
                                        <DriveImage loading="lazy" src={mediaUrls[0]} className="w-full h-full object-cover" />
                                        {isVideoFile(mediaUrls[0]) && <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Video size={16} /></span>}
                                        {mediaUrls.length > 1 && <span className="inv-hero-count">{mediaUrls.length}</span>}
                                    </div>
                                    {mediaUrls.length > 1 && (
                                        <div className="inv-thumbs no-scrollbar">
                                            {mediaUrls.slice(1).map((u, i) => (
                                                <div key={i} role="button" tabIndex={0} className="inv-thumb bg-black/40"
                                                    onClick={(e) => { e.stopPropagation(); setViewerIdx(i + 1); setShowViewer(true); }}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setViewerIdx(i + 1); setShowViewer(true); } }}>
                                                    <DriveImage loading="lazy" src={u} className="w-full h-full object-cover" />
                                                    {isVideoFile(u) && <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/80"><Video size={10} /></span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="inv-clusters">
                                {/* SPECS — the piece's axonometric silhouette beside its
                                    measurements. No SIZE / WEIGHT titles: 5' 3" × 2' 3 9/16"
                                    is a size and 60kg · 132.3 lbs is a weight on sight, and
                                    the titles cost a label column the numbers can use. The
                                    metric figures appear only once the row has dropped its
                                    SIZE / WEIGHT column; the imperial ones are always here. */}
                                <section className="inv-cluster" aria-label={tr("Specs")}>
                                    <h5 className="inv-cluster-t">{tr("Specs")}</h5>
                                    <div className="inv-specs-body">
                                        <div className="inv-axo bg-black/40" title={tr("Proportions")} aria-hidden="true">
                                            <WireframeIcon item={norm} color={accentColor} />
                                        </div>
                                        <div className="inv-measures" aria-label={tr("Size and weight")}>
                                            <span className={`inv-fi inv-fi-size ${COL_TEXT.size}`}>{metricDimensionsStr || '—'}</span>
                                            <span className={`inv-spec-wrap ${COL_TEXT.size}`} title={imperialDims}>{imperialDims || '—'}</span>
                                            <span className="inv-measure-w">
                                                <span className={`inv-fi inv-fi-weight ${COL_TEXT.weight}`}>{metricWeightStr || '—'}<span className="inv-sep" aria-hidden="true">·</span></span>
                                                <span className={COL_TEXT.weight}>{imperialWeight || '—'}</span>
                                            </span>
                                        </div>
                                    </div>
                                </section>

                                <section className="inv-cluster" aria-label={tr("Pricing")}>
                                    <h5 className="inv-cluster-t">{tr("Pricing")}</h5>
                                    <div className="inv-stats">
                                        <Stat k="price" label={tr("Price MXN")} overflow valueClassName={COL_TEXT.price}>{fmtMoney(itemPriceMXN)}</Stat>
                                        {/* TOTAL only leaves the row on a phone, where the row
                                            gives its line to COLOR MATERIAL instead. */}
                                        <Stat k="total" label={tr("Total MXN")} overflow valueClassName={COL_TEXT.total}>{fmtMoney(itemTotalMXN)}</Stat>
                                        <Stat k="landed" label={tr("Landed USD")} valueClassName={COL_TEXT.landed}>{fmtMoney(calculated.bookLanded)}</Stat>
                                        <Stat k="retail" label={tr("Retail USD")} valueClassName={COL_TEXT.retail}>{fmtMoney(calculated.bookRetail)}</Stat>
                                    </div>
                                </section>

                                {/* Shown on a wide row only when the piece is deployed — the
                                    row says that with a teal dot alone, and a dot is not a word.
                                    Once the row drops AQ / LD / PACKING, it always shows. */}
                                <section className={`inv-cluster inv-cluster--log${deployedInfo ? ' has-status' : ''}`} aria-label={tr("Logistics")}>
                                    <h5 className="inv-cluster-t">
                                        {tr("Logistics")}
                                        {deployedInfo && (
                                            <span className="inv-badge" data-tone="dep" title={deployedTitle}>
                                                <Truck size={11} strokeWidth={2.5} aria-hidden="true" />{tr("Deployed")}
                                            </span>
                                        )}
                                    </h5>
                                    <dl className="inv-spec">
                                        <SpecRow k="aq" label={tr("Codes")} overflow>
                                            <span className="inv-code-k">AQ</span><span className={COL_TEXT.aq}>{calculated.bookAqCode || '—'}</span>
                                            <span className="inv-code-k inv-code-k--next">LD</span><span className={COL_TEXT.ld}>{calculated.bookLandCode || '—'}</span>
                                        </SpecRow>
                                        <SpecRow k="state" label={tr("Crate")} overflow>
                                            {norm.packingStatus === 'Packed'
                                                ? <PackedCrateBadge crateId={norm.crateId || ''} itemId={norm.itemId || norm.tag_id || ''} logisticsDocs={logisticsDocs} allInventory={allInventory} isCompact />
                                                : <span className={COL_TEXT.unpacked}>{tr("UNPACKED")}</span>}
                                        </SpecRow>
                                    </dl>
                                </section>
                            </div>

                            {/* GENERATED — the AI copy this item carries for the store: the
                                title (detailed_description), the classification
                                (generated_type), the colour list behind Shopify's
                                colour-pattern filter (generated_color), and the body
                                (generated_description). The badge runs the same
                                validateCopy check that guards the batch processor, so a
                                title that says "brown" on a yellow stone, or a size the
                                record does not have, is visible the moment the row opens —
                                before it reaches an export. */}
                            <section className="inv-panel-ai inv-cluster" aria-label={tr("Generated content")}>
                                <h5 className="inv-cluster-t">
                                    {tr("Generated")}
                                    {hasAiCopy && (aiNotes.length === 0
                                        ? <span className="inv-badge" data-tone="paid" title={tr("Title and body agree with the stone, size and quantity on record, and the title fits the export")}><Check size={11} strokeWidth={3} aria-hidden="true" />{tr("Consistent")}</span>
                                        : <span className="inv-badge" data-tone="req" title={aiNotes.join('\n')}>{aiNotes.length} {aiNotes.length === 1 ? tr("issue") : tr("issues")}</span>)}
                                </h5>
                                {!hasAnyAi ? (
                                    <p className="inv-ai-empty">{tr("No AI content yet — run the batch processor on this item.")}</p>
                                ) : (
                                    <div className="inv-ai">
                                        <dl className="inv-spec inv-ai-meta">
                                            <SpecRow k="ai-title" label={tr("Title")} title={aiTitle}>
                                                <span className="inv-ai-title">{aiTitle || '—'}</span>
                                            </SpecRow>
                                            <SpecRow k="ai-type" label={tr("Type")} title={aiTypePath.join(' › ')}>
                                                <span className="inv-ai-type">
                                                    {aiTypePath.length ? aiTypePath.map((part, i) => (
                                                        <React.Fragment key={i}>
                                                            {i > 0 && <span className="inv-ai-crumb" aria-hidden="true">›</span>}
                                                            <span>{part}</span>
                                                        </React.Fragment>
                                                    )) : '—'}
                                                </span>
                                            </SpecRow>
                                            <SpecRow k="ai-colors" label={tr("Colors")}>
                                                {aiColors.length ? (
                                                    <span className="inv-ai-chips">
                                                        {aiColors.map(c => {
                                                            const lc = c.toLowerCase();
                                                            const inStore = SHOPIFY_COLOR_SET.has(lc);
                                                            const hint = !inStore
                                                                ? tr("Not one of the store's colour names — the export resolves it through the stone table or leaves it out")
                                                                : lc === 'turquoise/aqua' ? tr("Exports as Blue — the store has no Turquoise/Aqua value") : undefined;
                                                            return (
                                                                <span key={c} className={`inv-ai-chip${inStore ? '' : ' inv-ai-chip--off'}`} title={hint}>
                                                                    <span className="inv-ai-sw" style={{ background: swatchFor(c) }} aria-hidden="true" />{c}
                                                                </span>
                                                            );
                                                        })}
                                                    </span>
                                                ) : '—'}
                                            </SpecRow>
                                        </dl>
                                        <div className="inv-ai-bodywrap">
                                            <span className="inv-ai-label">{tr("Body")}</span>
                                            {aiBodyText
                                                ? <p className={`inv-ai-body${showFullBody ? '' : ' is-clamped'}`}>{aiBodyText}</p>
                                                : <p className="inv-ai-empty">—</p>}
                                            {aiBodyText.length > 240 && (
                                                <button type="button" className="inv-ai-more" aria-expanded={showFullBody}
                                                    onClick={(e) => { e.stopPropagation(); setShowFullBody(v => !v); }}>
                                                    {showFullBody ? tr("Show less") : tr("Show all")}
                                                </button>
                                            )}
                                            {aiNotes.length > 0 && (
                                                <ul className="inv-ai-issues">
                                                    {aiNotes.map((note, i) => <li key={i}>{note}</li>)}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* Payments always have a section, even when nothing is linked
                                yet — an absent section reads as "not loaded". */}
                            <div className="inv-panel-pay">{renderPaymentHistory()}</div>

                            {/* The toolbar. Labelled — the old icons were unlabelled 48px
                                keys that took the whole top line on a phone. Remove is last
                                and set apart, so the destructive action is never the one
                                under a thumb reaching for Edit. */}
                            <div className="inv-actions" role="toolbar" aria-label={tr("Item actions")}>
                                <button type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(`https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${calculated.bookBarcode}`);
                                        toast.success(tr("Trace Link Copied"));
                                    }}
                                    title={tr("Copy Trace Link")}>
                                    <Copy size={15} strokeWidth={2.25} aria-hidden="true" /><span>{tr("Copy link")}</span>
                                </button>
                                {isEditable && (
                                    <button type="button" onClick={handleEdit} title={tr("Edit Item")}>
                                        <Pencil size={15} strokeWidth={2.25} aria-hidden="true" /><span>{tr("Edit")}</span>
                                    </button>
                                )}
                                {isInternalUser && (
                                    <button type="button" className="inv-action-danger" onClick={handleDelete} title={tr("Remove Artifact")}>
                                        <Trash2 size={15} strokeWidth={2.25} aria-hidden="true" /><span>{tr("Remove")}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        </div>
                    </div>
                )}
            </div>
        );
    }


    const FullscreenModal = !!isExpanded && viewMode !== 'list' && createPortal(
        <div className="fixed inset-0 z-90 bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => onToggleExpand()}>
            <div className="relative w-full max-w-6xl bg-[#0e0e0e] rounded-[40px] overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[90vh]" onClick={e=>e.stopPropagation()}>
                <div className="absolute top-6 right-6 z-10 flex gap-2">
                    {isEditable && <button onClick={handleEdit} className="h-10 px-4 rounded-xl bg-(--main-color)/20 text-(--main-color) text-[10px] font-black uppercase tracking-widest hover:bg-(--main-color) hover:text-black transition-all">{tr("Edit Item")}</button>}
                    <button onClick={() => onToggleExpand()} className="h-10 px-4 rounded-xl bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all">{tr("Close")}</button>
                </div>
                <div className="h-72 sm:h-96 bg-black relative shrink-0 group/hero isolate">
                    {mediaUrls[modalIdx] ? (
                        <div className="w-full h-full relative cursor-zoom-in" onClick={() => { setViewerIdx(modalIdx); setShowViewer(true); }}>
                            {isVideoFile(mediaUrls[modalIdx]) ? (
                                <video preload="none" src={getCleanImageUrl(mediaUrls[modalIdx])} className="w-full h-full object-contain" autoPlay muted loop />
                            ) : (
                                <DriveImage loading="lazy" src={mediaUrls[modalIdx]} className="w-full h-full object-contain" />
                            )}
                            
                            {/* Modal Hero Navigation Chevrons */}
                            {mediaUrls.length > 1 && (
                                <>
                                    <button onClick={(e) => { e.stopPropagation(); setModalIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length); }}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/50 opacity-0 group-hover/hero:opacity-100 hover:text-white transition-all">
                                        <ChevronLeft size={24} />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); setModalIdx(p => (p + 1) % mediaUrls.length); }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/50 opacity-0 group-hover/hero:opacity-100 hover:text-white transition-all">
                                        <ChevronRight size={24} />
                                    </button>
                                </>
                            )}
                        </div>
                    ) : <div className="w-full h-full flex items-center justify-center opacity-80 mix-blend-screen scale-[1.5]"><WireframeIcon item={norm} color={accentColor} /></div>}
                </div>

                {/* Modal Thumbnail Gallery Bar */}
                {mediaUrls.length > 1 && (
                    <div className="px-8 py-3 bg-black/40 border-b border-white/5 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                        {mediaUrls.map((u, i) => (
                            <div key={i} onClick={() => setModalIdx(i)}
                                className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 cursor-pointer transition-all border-2 ${modalIdx === i ? 'border-(--main-color) scale-110' : 'border-transparent opacity-40 hover:opacity-100'}`}>
                                <DriveImage loading="lazy" src={u} className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                )}

                <div className="p-8 overflow-y-auto grow custom-scrollbar flex flex-col gap-8">
                    <div><h3 className="text-3xl font-black text-white tracking-tighter uppercase mb-1">{norm.shape || tr("OBJ")} {norm.shortDescription}</h3><p className="text-[13px] font-bold text-white/50 uppercase tracking-[0.3em] font-mono">{norm.color} {norm.material}</p></div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 p-8 rounded-[32px] bg-white/2 border border-white/5">
                        <div><p className={lbl}>{tr("AQ Code")}</p><p className="text-2xl font-mono font-black text-(--main-color)">{calculated.bookAqCode || '—'}</p></div>
                        <div><p className={lbl}>{tr("LD Code")}</p><p className="text-2xl font-mono font-black text-yellow-500">{calculated.bookLandCode || '—'}</p></div>
                        <div><p className={lbl}>{tr("Acq. MXN")}</p><p className="text-2xl font-black text-green-400">{showFinancials ? `$${itemPriceMXN}` : '***'}</p></div>
                        <div><p className={lbl}>{tr("Acq. USD")}</p><p className="text-2xl font-black text-cyan-400">{showFinancials ? `$${calculated.bookAcquisition}` : '***'}</p></div>
                        <div><p className={lbl}>{tr("Landed USD")}</p><p className="text-2xl font-black text-yellow-300">{showFinancials ? `$${calculated.bookLanded}` : '***'}</p></div>
                        <div><p className={lbl}>{tr("Retail USD")}</p><p className="text-2xl font-black text-[#6BCEBB]">{showFinancials ? `$${calculated.bookRetail}` : '***'}</p></div>
                        <div><p className={lbl}>{tr("Dimensions")}</p><p className="text-[15px] font-mono font-bold text-white/50">{dimensionsStr || '—'}</p></div>
                        <div><p className={lbl}>{tr("Weight")}</p><p className="text-[15px] font-mono font-bold text-white/50">{weightStr || '—'}</p></div>
                        
                        {norm.detailedDescription && (
                            <div className="col-span-full border-t border-white/5 pt-6 mt-2">
                                <p className={lbl}>{tr("AI Visual Analysis")}</p>
                                <p className="text-sm font-mono text-white/70 leading-relaxed mt-2 whitespace-pre-wrap">{norm.detailedDescription}</p>
                            </div>
                        )}

                        <div className="col-span-full border-t border-white/5 pt-6 flex items-center justify-between">
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(`https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${calculated.bookBarcode}`);
                                    toast.success(tr("Trace Link Copied"));
                                }}
                                className="flex items-center gap-2 h-10 px-4 rounded-xl bg-(--main-color)/10 text-(--main-color) hover:bg-(--main-color) hover:text-black transition-all text-[10px] font-black uppercase tracking-widest"
                                title={tr("Copy Trace Link")}
                            >
                                <Copy size={16} /> {tr("COPY TRACE LINK")}
                            </button>
                            {isInternalUser && (
                                <button onClick={handleDelete} className="flex items-center gap-2 h-10 px-4 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"><Trash2 size={16} /> {tr("REMOVE ARTIFACT")}</button>
                            )}
                        </div>
                    </div>
                    {/* Consolidated Artifact Identity Hub - Modal View */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row items-center gap-8 justify-center">
                            {/* Barcode Panel - Modal Scale */}
                            <div className="flex-none bg-white rounded-none p-1.5 shadow-2xl border border-black/10 flex flex-col gap-1.5 overflow-hidden relative group/hub hover:shadow-xl transition-all duration-500 w-full sm:w-64">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-none bg-black/20" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                navigator.clipboard.writeText(calculated.bookBarcode); 
                                                toast.success(`Tag ID Copied: ${calculated.bookBarcode}`, { icon: '📋' }); 
                                            }}
                                            className="inline-flex items-center rounded-none text-black text-[10px] font-black uppercase tracking-[0.2em] border border-black/5 hover:scale-105 active:scale-95 transition-all overflow-hidden" 
                                        >
                                            <span className="px-2 py-1" style={{ backgroundColor: vendorColor }}>{(calculated.bookBarcodeDisplay || '').slice(0, 5)}</span>
                                            <span className="px-2 py-1 text-(--text-color) bg-transparent border border-white/10">{(calculated.bookBarcodeDisplay || '').slice(5)}</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-center p-1.5 bg-white border border-black/5 rounded-none transition-all grayscale group-hover/hub:grayscale-0 overflow-hidden w-full">
                                    {isExpanded > 0 && (
                                        <Barcode 
                                            value={calculated.bookBarcode || 'N/A'} 
                                            format="CODE39" 
                                            width={1.6} 
                                            height={50} 
                                            displayValue={false}
                                            margin={0}
                                        />
                                    )}
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-(--main-color) opacity-25" />
                            </div>

                            {/* Free-Floating Modal QR - SVG Theme Colored */}
                            <div className="flex-none p-4 relative group/modal-qr">
                                {isExpanded > 0 && (
                                    <QRCodeSVG 
                                        value={`https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/artifact?tagid=${calculated.bookBarcode}`}
                                        size={150}
                                        level="H"
                                        includeMargin={false}
                                        fgColor={qrColor}
                                        bgColor="transparent"
                                    />
                                )}
                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-black text-(--main-color) opacity-30 uppercase tracking-[0.4em] whitespace-nowrap">{tr("Secure Identity Artifact")}</div>
                            </div>
                        </div>
                    </div>
                    {renderPaymentHistory()}
                </div>
            </div>
        </div>, document.body
    );

    if (viewMode === 'gallery') {
        return (
            <>
            <div className={`group relative flex flex-col rounded-md overflow-hidden cursor-pointer bg-(--sidebar-bg) border transition-all duration-400 hover:-translate-y-1 hover:shadow-2xl ${isExpanded > 0 ? 'ring-2 ring-(--main-color)/40' : 'hover:border-(--main-color)/30'}`}
                 style={{ borderColor: payStatus ? `color-mix(in srgb, ${col} 35%, var(--border-color))` : 'var(--border-color)' }} onClick={() => onToggleExpand()}>
                
                {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} mediaUrls={mediaUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
                
                {(() => {
                    const total = mediaUrls.length;
                    const displayCount = 24;
                    const visibleUrls = mediaUrls.slice(0, displayCount);
                    const remaining = total - displayCount;
                    
                    // Dynamic Grid Configuration - Fixed Aspect Ratio for few images (Landscape/Portrait)
                    if (total === 1) {
                        return (
                            <div className="relative w-full bg-black/40 overflow-hidden cursor-pointer"
                                 onClick={(e) => { e.stopPropagation(); setViewerIdx(0); setShowViewer(true); }}>
                                <DriveImage loading="lazy" src={visibleUrls[0]} className="w-full h-auto max-h-[800px] object-contain transition-transform duration-1000 hover:scale-105" />
                                {isVideoFile(visibleUrls[0]) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={32} className="text-white/60" /></div>}
                            </div>
                        );
                    }
                    
                    if (total <= 3) {
                        return (
                            <div className={`grid gap-px bg-black/40 ${total === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                {visibleUrls.map((url, i) => (
                                    <div key={i} className="relative overflow-hidden cursor-pointer bg-black/20"
                                         onClick={(e) => { e.stopPropagation(); setViewerIdx(i); setShowViewer(true); }}>
                                        <DriveImage loading="lazy" src={url} className="w-full h-auto max-h-[700px] object-contain transition-transform duration-1000 hover:scale-110" />
                                        {isVideoFile(url) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={24} className="text-white/60" /></div>}
                                    </div>
                                ))}
                            </div>
                        );
                    }

                    const gridCols = total <= 6 ? 'grid-cols-3' : total <= 12 ? 'grid-cols-4 md:grid-cols-4' : 'grid-cols-4 md:grid-cols-6';

                    return (
                        <div className={`grid gap-px bg-black/40 ${gridCols}`} style={{ aspectRatio: total > 6 ? (total > 18 ? 'auto' : '16/9') : '4/3' }}>
                            {visibleUrls.map((url, i) => (
                                <div key={i} className={`relative overflow-hidden group/galimg aspect-square cursor-pointer`}
                                     onClick={(e) => { e.stopPropagation(); setViewerIdx(i); setShowViewer(true); }}>
                                    <DriveImage loading="lazy" src={url} className="w-full h-full object-cover transition-transform duration-700 group-hover/galimg:scale-110" />
                                    {isVideoFile(url) && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Video size={16} className="text-white/60" /></div>}
                                    {i === visibleUrls.length - 1 && remaining > 0 && (
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                            <div className="flex flex-col items-center">
                                                <span className="text-xl font-black text-white">+{remaining}</span>
                                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1">{tr("More")}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    );
                })()}

                <div className="p-5 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                             <div className="flex items-center gap-2">
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        navigator.clipboard.writeText(calculated.bookBarcode); 
                                        toast.success(`Tag ID Copied: ${calculated.bookBarcode}`, { icon: '📋' }); 
                                    }}
                                    className="inline-flex items-center rounded text-black text-[13px] font-black uppercase shadow-lg w-fit hover:scale-105 active:scale-95 transition-all overflow-hidden" 
                                >
                                    <span className="px-2 py-1.5" style={{ backgroundColor: vendorColor }}>{(calculated.bookBarcodeDisplay || vendorPrefix || 'N/A').slice(0, 5)}</span>
                                    <span className="px-2 py-1.5 text-(--text-color) bg-transparent border border-white/10">{(calculated.bookBarcodeDisplay || vendorPrefix || 'N/A').slice(5)}</span>
                                </button>
                                <div className="flex gap-1">
                                     <div className="px-1.5 py-1 rounded bg-white/5 border border-white/10 text-[8px] font-black text-white/40 uppercase tracking-widest">{calculated.bookAqCode}</div>
                                     <div className="px-1.5 py-1 rounded bg-white/5 border border-white/10 text-[8px] font-black text-white/40 uppercase tracking-widest">{calculated.bookLandCode}</div>
                                </div>
                             </div>
                             <h3 className="text-2xl font-black text-(--text-color) uppercase tracking-tighter leading-tight mt-1.5 truncate">
                                 {norm.shape || tr("OBJECT")} 
                                 <span className="text-[14px] font-black text-(--text-color)/80 uppercase tracking-[0.2em] ml-2">{norm.shortDescription}</span>
                             </h3>
                             <div className="text-[12px] text-(--text-color)/70 uppercase tracking-widest font-black mt-1.5">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                        </div>
                        <div className="flex flex-col items-end ml-4 shrink-0">
                            <span className="text-[11px] font-black text-(--text-color)/40 uppercase tracking-[0.3em] mb-1">{tr("TOTAL MXN")}</span>
                            <span className="text-3xl font-mono font-black text-(--main-color) whitespace-nowrap leading-none">
                                {showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}
                            </span>
                            <div className="flex items-center gap-2 mt-2.5">
                                <span className="text-[12px] font-black text-(--text-color)/40 uppercase tracking-[0.3em]">{tr("QTY")} {norm.quantity || 1}</span>
                                <span className="w-px h-3 bg-white/10" />
                                <span className="text-[12px] font-mono font-bold text-(--text-color)/60">{showFinancials ? `$${itemPriceMXN.toLocaleString()}` : '***'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 py-3 border-y border-white/5">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-black text-(--text-color)/20 uppercase tracking-[0.15em]">{tr("Dimensions")}</span>
                            <span className="text-[14px] font-mono font-black text-(--text-color)">{metricDimensionsStr || '—'}</span>
                        </div>
                        <div className="w-px h-6 bg-white/5" />
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-black text-(--text-color)/20 uppercase tracking-[0.15em]">{tr("Weight")}</span>
                            <span className="text-[14px] font-mono font-black text-(--text-color)">{metricWeightStr || '—'}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />
                            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: col }}>{getPayLabel()}</span>
                        </div>
                        {deployedInfo && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-teal-500/10 border border-teal-500/20 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-teal-400 leading-none">
                                    {deployedInfo.manifestId
                                        ? deployedInfo.manifestId.replace(tr("TRK-"), tr("TRK·"))
                                        : `TRK·${new Date(deployedInfo.date).toLocaleDateString(tr("en-US"), { month: 'short', year: '2-digit' })}`
                                    }
                                </span>
                            </div>
                        )}
                        {norm.packingStatus === 'Packed' && (
                            <PackedCrateBadge crateId={norm.crateId || ''} itemId={norm.itemId || norm.tag_id || ''} logisticsDocs={logisticsDocs} allInventory={allInventory} isCompact />
                        )}
                    </div>
                </div>
                
                {isSelectionMode && (
                    <div className="absolute top-4 right-4 z-20" onClick={(e) => { e.stopPropagation(); handleToggleSelection(item.row ?? item.data?.id); }}>
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(item.row ?? item.data?.id) ? 'bg-(--main-color) border-(--main-color) shadow-lg' : 'bg-black/40 border-white/20 backdrop-blur-md'}`}>
                            {selectedIds.includes(item.row ?? item.data?.id) && <Check size={16} className="text-black" strokeWidth={4} />}
                        </div>
                    </div>
                )}
            </div>
            {FullscreenModal}
            </>
        );
    }


    return (
        <>
            <div className={`group relative flex flex-col rounded-md overflow-hidden cursor-pointer bg-(--sidebar-bg) border transition-all duration-400 hover:-translate-y-1 hover:shadow-xl ${isExpanded > 0 ? 'ring-1 ring-(--main-color)/30' : 'hover:border-(--main-color)/30'}`}
                 style={{ borderColor: payStatus ? `color-mix(in srgb, ${accentColor} 35%, var(--border-color))` : 'var(--border-color)' }} onClick={() => onToggleExpand()}
             onMouseEnter={() => setIsHoveringCard(true)} onMouseLeave={() => { setIsHoveringCard(false); setCardIdx(0); }}>
            {showViewer && <FullscreenImageViewer src={mediaUrls[viewerIdx]} mediaUrls={mediaUrls} initialIdx={viewerIdx} onClose={() => setShowViewer(false)} />}
            <div className="aspect-4/3 relative overflow-hidden bg-black/20 group/gridimg isolate" 
                onClick={(e) => { e.stopPropagation(); if (mediaUrls.length > 1) { setCardIdx(p => (p + 1) % mediaUrls.length); } }}
                onTouchStart={(e) => { e.stopPropagation(); setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }}
                onTouchMove={(e) => { e.stopPropagation(); setTouchEnd(e.targetTouches[0].clientX); }}
                onTouchEnd={(e) => {
                    e.stopPropagation();
                    if (!touchStart || !touchEnd) return;
                    const dist = touchStart - touchEnd;
                    if (dist > 30) setCardIdx(p => (p + 1) % mediaUrls.length);
                    if (dist < -30) setCardIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length);
                }}>
                {mediaUrls[cardIdx] ? <DriveImage loading="lazy" key={cardIdx} src={mediaUrls[cardIdx]} className="w-full h-full object-cover group-hover:scale-105 transition-transform animate-in fade-in duration-700" /> : <div className="absolute inset-0 flex items-center justify-center opacity-80 mix-blend-screen scale-[1.3] group-hover:scale-[1.35] transition-transform duration-700"><WireframeIcon item={norm} color={accentColor} /></div>}
                {isVideoFile(mediaUrls[cardIdx]) && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Video size={32} className="text-white/70 shadow-lg drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" /></div>}
                
                {/* Grid View Card Navigation Chevrons */}
                {mediaUrls.length > 1 && (
                    <>
                        <button onClick={(e) => { e.stopPropagation(); setCardIdx(p => (p - 1 + mediaUrls.length) % mediaUrls.length); }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 opacity-0 group-hover/gridimg:opacity-100 hover:text-white transition-all drop-shadow-lg">
                            <ChevronLeft size={28} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setCardIdx(p => (p + 1) % mediaUrls.length); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 opacity-0 group-hover/gridimg:opacity-100 hover:text-white transition-all drop-shadow-lg">
                            <ChevronRight size={28} />
                        </button>

                        {/* Progress Dots */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/gridimg:opacity-100 transition-opacity">
                            {mediaUrls.map((_, i) => (
                                <div key={i} className={`w-1 h-1 rounded-full ${cardIdx === i ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-white/20'}`} />
                            ))}
                        </div>
                    </>
                )}
                
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        navigator.clipboard.writeText(calculated.bookBarcode); 
                        toast.success(`Tag ID Copied: ${calculated.bookBarcode}`, { icon: '📋' }); 
                    }}
                    className="absolute top-2 left-2 z-10 flex items-center rounded text-[11px] font-black uppercase text-black shadow-md hover:scale-105 active:scale-95 transition-all overflow-hidden" 
                >
                    <span className="px-2 py-0.5" style={{ backgroundColor: vendorColor }}>{(calculated.bookBarcodeDisplay || vendorPrefix || '').slice(0, 5)}</span>
                    <span className="px-2 py-0.5 text-white bg-transparent backdrop-blur-md bg-black/40 border border-white/10">{(calculated.bookBarcodeDisplay || vendorPrefix || '').slice(5)}</span>
                </button>
            </div>
            <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between">
                    <div className="flex flex-col flex-1 min-w-0">
                        <div className="font-black text-[15px] text-(--text-color) uppercase tracking-tight truncate">{norm.shape || tr("OBJ")}</div>
                        <div className="text-[11px] font-black text-(--text-color)/30 uppercase tracking-widest">{norm.shortDescription}</div>
                    </div>
                    <span className="text-[13px] font-black text-(--main-color) font-mono ml-2 shrink-0">x{norm.quantity || 1}</span>
                </div>
                <div className="text-[11px] text-(--text-color)/60 uppercase tracking-widest font-black truncate">{[norm.color, norm.material].filter(Boolean).join(' ')}</div>
                <div className="flex flex-col gap-0.5 my-1">
                    <span className="text-[11px] font-mono text-(--text-color)/40 truncate">{dimensionsStr || '—'}</span>
                    <span className="text-[11px] font-mono text-(--text-color)/20 truncate">{weightStr || '—'}</span>
                </div>
                {/* Financial Summary Overlay */}
                <div className="flex flex-col gap-0.5 pt-2 mb-1 border-t border-white/5">
                    <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-tight">
                        <span className="text-(--text-color)/30">{tr("Cost MXN")}</span>
                        <span className="text-(--text-color)/80 font-mono">{showFinancials ? `$${itemPriceMXN.toLocaleString()}` : '***'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[13px] font-black uppercase tracking-tight">
                        <span className="text-(--main-color)/40">{tr("Total MXN")}</span>
                        <span className="text-(--main-color) font-mono">{showFinancials ? `$${itemTotalMXN.toLocaleString()}` : '***'}</span>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">{payStatus && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />}<span className="text-[11px] font-black uppercase tracking-widest text-(--text-color)/40" style={{ color: payStatus ? col : '#38bdf8' }}>{getPayLabel()}</span></div>
                {deployedInfo && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-teal-500/10 border border-teal-500/20 rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                            <span className="text-[8px] font-black uppercase tracking-widest text-teal-400 leading-none">
                                {deployedInfo.manifestId
                                    ? deployedInfo.manifestId.replace(tr("TRK-"), tr("TRK·"))
                                    : `TRK·${new Date(deployedInfo.date).toLocaleDateString(tr("en-US"), { month: 'short', year: '2-digit' })}`
                                }
                            </span>
                        </div>
                    )}
                    {norm.packingStatus === 'Packed' && (
                        <PackedCrateBadge crateId={norm.crateId || ''} itemId={norm.itemId || norm.tag_id || ''} logisticsDocs={logisticsDocs} allInventory={allInventory} isCompact />
                    )}
                </div>
            </div>
            {isSelectionMode && (
                <div className="absolute top-4 right-4 z-20" onClick={(e) => { e.stopPropagation(); handleToggleSelection(item.row ?? item.data?.id); }}>
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(item.row ?? item.data?.id) ? 'bg-(--main-color) border-(--main-color) shadow-lg' : 'bg-black/40 border-white/20 backdrop-blur-md'}`}>
                        {selectedIds.includes(item.row ?? item.data?.id) && <Check size={16} className="text-black" strokeWidth={4} />}
                    </div>
                </div>
            )}
        </div>
        
        {FullscreenModal}
    </>
);
});

export const UnifiedInventoryView = () => {
    const t = useTranslation(); const db = useDatabase(); const items = useAtomValue(inventoryAtom); const financeDocs = useAtomValue(financeDataAtom);
    const logisticsDocs = useAtomValue(logisticsDataAtom);
    const [isLoading, setIsLoading] = useState(true); const [expandedCards, setExpandedCards] = useState<Record<string, number>>({});
    const [isFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom); 
    const viewSlider = useAtomValue(inventoryViewSliderAtom);
    const viewMode = viewSlider <= 33 ? 'list' : viewSlider <= 66 ? 'grid' : 'gallery';
    // The slider's resting position (0, the stored default) used to mean 0.85,
    // so every list row was drawn at 85% — 13px type reached the screen at 11px
    // and a 10px caption at 8.5px, and scaled text is also resampled, which
    // softens it. The range now starts at 1: the resting list is drawn at its
    // designed size, and the slider only ever enlarges it.
    const listScale = viewMode === 'list' ? 1 + (viewSlider / 33) * 0.3 : 1;
    const gridScale = viewMode === 'grid' ? 0.85 + ((viewSlider - 34) / 32) * 0.6 : 1;
    const galleryScale = viewMode === 'gallery' ? 0.9 + ((viewSlider - 67) / 33) * 0.9 : 1;
    const [isVendorFilterOpen, setIsVendorFilterOpen] = useAtom(isInventoryVendorFilterOpenAtom);
    const setGlobalActiveVendors = useSetAtom(activeVendorsAtom); const exchangeRate = useAtomValue(exchangeRateAtom); const showFinancials = useAtomValue(showFinancialsAtom);
    const [itemData, setSelectedItemData] = useAtom(SelectedItemDataAtom); const [itemRow, setSelectedItemRow] = useAtom(SelectedItemRowAtom);
    const [mode, setMode] = useAtom(detailsPanelModeAtom); const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom); const searchTerm = useAtomValue(inventorySearchTermAtom);
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const [sortOrder, setSortOrder] = useAtom(inventorySortOrderAtom); const [sortKey, setSortKey] = useAtom(inventorySortKeyAtom);
    const [vendorFilter, setVendorFilter] = useAtom(inventoryVendorFilterAtom); const [categoryFilter, setCategoryFilter] = useAtom(inventoryCategoryFilterAtom);
    const [isCategoryOpen, setIsCategoryOpen] = useAtom(isInventoryCategoryFilterOpenAtom); const [materialFilter, setMaterialFilter] = useAtom(inventoryMaterialFilterAtom);
    const [isMaterialOpen, setIsMaterialOpen] = useAtom(isInventoryMaterialFilterOpenAtom); const [isSortMenuOpen, setIsSortMenuOpen] = useAtom(isInventorySortMenuOpenAtom);
    const user = useAtomValue(userAtom); 
    const setFilteredCount = useSetAtom(filteredInventoryCountAtom); 
    const setFilteredTotalQty = useSetAtom(filteredInventoryTotalQtyAtom);
    const setFilteredTotalValue = useSetAtom(filteredInventoryTotalValueAtom);
    const setFilteredIds = useSetAtom(filteredInventoryIdsAtom);
    const setIsUploadWizardOpen = useSetAtom(isUploadWizardOpenAtom);
    const setUploadItemData = useSetAtom(uploadItemDataAtom);
    const [savingProgress, setSavingProgress] = useState(0);
    const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    const setArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setIsPrintWizardOpen = useSetAtom(isPackingPrintWizardOpenAtom);
    const setIsNFCWizardOpen = useSetAtom(isPackingNFCWizardOpenAtom);
    const setIsPackingCrateWizardOpen = useSetAtom(isPackingCrateWizardOpenAtom);
    const setIsPaymentWizardOpen = useSetAtom(isPaymentWizardOpenAtom);


    // Load deployed crates to derive TRK-DATE tags on inventory items
    const [deployedCrates, setDeployedCrates] = useState<any[]>([]);
    useEffect(() => {
        supabase
            .from('logistics')
            .select('id, inventory_ids, updated_at, description')
            .eq('status', 'In Transit')
            .then(({ data }) => { if (data) setDeployedCrates(data); });
    }, []);

    // Map each inventory item row ID → deployed crate info for TRK tag
    const deployedItemsMap = useMemo(() => {
        const map = new Map<string, { crateId: string; date: string; manifestId: string }>();
        deployedCrates.forEach(crate => {
            if (!crate.inventory_ids) return;
            // Extract manifest ID from description field (POS:... pattern) or use crate id
            const manifestMatch = (crate.description || '').match(/(TRK-[\w-]+)/);
            const manifestId = manifestMatch ? manifestMatch[1] : '';
            const date = crate.updated_at || '';
            crate.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
                const itemId = entry.split(':')[0].trim();
                if (itemId && !map.has(itemId)) {
                    map.set(itemId, { crateId: crate.id, date, manifestId });
                }
            });
        });
        return map;
    }, [deployedCrates]);



    const handleCopyShareLink = () => {
        const idsToShare = selectedIds.length > 0 ? selectedIds : filteredItems.map(i => i.row ?? i.data?.id).filter(Boolean);
        if (idsToShare.length === 0) return toast.error(tr("No items to share."));
        const idsParam = encodeURIComponent(idsToShare.join(','));
        const viewParam = viewMode;
        const selectionParam = selectedIds.length > 0 ? '&selection=true' : '';
        const url = `${window.location.origin}${window.location.pathname}?artifact=inventory&ids=${idsParam}&view=${viewParam}${selectionParam}`;
        
        navigator.clipboard.writeText(url).then(() => {
            toast.success(selectedIds.length > 0 ? `Shared ${selectedIds.length} selected items!` : 'Share link copied!');
        });
    };
    
    const handleCopyTags = () => {
        if (selectedIds.length === 0) return toast.error(tr("No items selected."));
        
        const tags = selectedIds.map(id => {
            const item = items.find(i => (i.row ?? i.data?.id) === id);
            if (!item) return null;
            const norm = normalizeInventoryData(item.data);
            const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');
            return calculated.bookBarcode;
        }).filter(Boolean);

        if (tags.length === 0) return toast.error(tr("No tags found for selection."));
        
        const tagString = tags.join(' ');
        navigator.clipboard.writeText(tagString).then(() => {
            toast.success(`Copied ${tags.length} Barcode Tags`, {
                icon: '📋',
                style: { background: 'var(--main-color)', color: '#000' }
            });
        });
    };

    const handleBulkRemove = async () => {
        if (selectedIds.length === 0) return toast.error(tr("No items selected."));
        if (!window.confirm(`Are you sure you want to REMOVE ${selectedIds.length} items to Store?`)) return;

        const tid = toast.loading(`Moving ${selectedIds.length} items to Store...`);
        try {
            const inventoryIds: (string | number)[] = [];
            const productionIds: (string | number)[] = [];

            selectedIds.forEach(id => {
                const item = items.find(i => (i.row ?? i.data?.id) === id);
                if (item?.source === 'production') productionIds.push(id);
                else inventoryIds.push(id);
            });

            const timestamp = new Date().toISOString();
            
            const promises = [];
            if (inventoryIds.length > 0) {
                promises.push(supabase.from('inventory').update({ status: 'Available', updated_at: timestamp }).in('id', inventoryIds.map(String)));
            }
            if (productionIds.length > 0) {
                promises.push(supabase.from('production').update({ status: 'Available', updated_at: timestamp }).in('id', productionIds.map(String)));
            }

            const results = await Promise.all(promises);
            const error = results.find(r => r.error);
            if (error) throw error.error;

            toast.success(`Successfully moved ${selectedIds.length} items to Store`, { id: tid });
            setSelectedIds([]);
            setIsSelectionMode(false);
            setInventoryVersion(v => v + 1);
        } catch (err: any) {
            toast.error(`Remove failed: ${err.message}`, { id: tid });
        }
    };

    const handleSelectAll = () => {
        const allFilteredIds = filteredItems.map(i => i.row ?? i.data?.id).filter(Boolean);
        const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.includes(id));
        
        if (isAllSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(allFilteredIds);
        }
    };

    const handleToggleSelection = (id: string | number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const { partialPayIds, fullPayIds, requestedAcqIds } = useAtomValue(inventoryStatusSetsAtom);

    const handleEditItem = useCallback(async (rowId: string, currentData: any) => {
        const item = items.find(i => (i.row ?? i.data?.id) === rowId);
        const dataToLoad = item ? { ...item.data, id: rowId } : { ...currentData, id: rowId };
        setUploadItemData(dataToLoad);
        setIsUploadWizardOpen(true);
    }, [items, setUploadItemData, setIsUploadWizardOpen]);

    const visibleWorkbooks = useAtomValue(visibleWorkbooksAtom);
    const shapeFilter = useAtomValue(inventoryShapeFilterAtom);
    const contentFilter = useAtomValue(inventoryContentFilterAtom);
    const materialColorFilter = useAtomValue(inventoryMaterialColorFilterAtom);

    const filteredItems = useMemo(() => {
        const filtered = items.filter(item => {
            if (item.data.is_hidden) return false;
            
            const itemIdStr = String(item.data.itemId || item.data.item_id || '');
            
            // Each season is toggled independently now, so 825 can be reviewed
            // without 326 coming along. The season lives on the row itself —
            // item_id never encodes it.
            if (visibleWorkbooks[rowWorkbook(item.data)] === false) return false;

            const status = getStatusClass(item.data, partialPayIds, fullPayIds);
            if (statusFilter !== 'All') {
                const crateId = item.data.crate_id;
                const isPacked = item.data.packing_status === 'Packed';
                const crate = logisticsDocs?.find((c: any) => c.id === crateId);
                const isDeployed = isPacked && crateId && (!crate || crate.status === 'Deployed');

                const itemKey = String(item.row ?? item.data?.id ?? '');
                const isShipped = deployedItemsMap.has(itemKey) || isDeployed;

                if (statusFilter === 'Shipped' && !isShipped) return false;
                if (statusFilter === 'Not Shipped' && isShipped) return false;
                if (statusFilter === 'Packed' && !isPacked) return false;
                if (statusFilter === 'Not Packed' && isPacked) return false;
                
                // 'Partial' and 'Production' were retired from the filter bar;
                // their branches went with them. A session holding either
                // persisted value is folded back to 'All' on read in atoms.tsx,
                // so nothing can reach here asking for them.
                if (statusFilter === 'Requested' && status !== 'YELLOW') return false;
                if (statusFilter === 'Paid' && status !== 'GREEN') return false;
                if (statusFilter === 'New' && status !== 'BLUE') return false;
            }
            let vPre = item.data.vendor_id || item.data.vendorId || '';
            if (!vPre) {
                if (itemIdStr.includes('-')) vPre = itemIdStr.split('-')[0];
                else {
                    const vKeys = Object.keys(vendors).sort((a,b) => b.length - a.length);
                    const prefix = vKeys.find(v => itemIdStr.startsWith(v));
                    if (prefix) vPre = prefix;
                }
            }
            if (user?.role === 'Vendor' && vPre !== user?.name) return false;
            
            // Stackable Vendor Filter
            if (!vendorFilter.includes('All') && !vendorFilter.includes(vPre)) return false;
            
            const catNormalized = Array.from(new Set(`${item.data.shape || ''} ${item.data.shortDescription || item.data.short_description || ''}`.toUpperCase().split(/\s+/).filter(Boolean))).join(' ');
            const matNormalized = Array.from(new Set(`${item.data.color || ''} ${item.data.material || ''}`.toUpperCase().split(/\s+/).filter(Boolean))).join(' ');

            // Independent Attribute Filters
            if (categoryFilter !== 'All' && catNormalized !== categoryFilter.toUpperCase()) return false;
            if (materialFilter !== 'All' && matNormalized !== materialFilter.toUpperCase()) return false;

            // Nested smart filters, sitting alongside the flat combined filters
            // above rather than replacing them — the flat pair is what the
            // header chips still drive.
            //
            // Shape is headed by the eight bounded classes from lib/geometry,
            // which replaced the old type-headed tree: that one took its
            // parents from short_description free text, so "parent" was
            // dozens of near-duplicate strings and the bar was unusable.
            if (!rowMatchesShape(item.data, shapeFilter)) return false;
            if (!rowMatchesContent(item.data, contentFilter)) return false;
            if (!rowMatchesMaterialColor(item.data, materialColorFilter)) return false;
            if (deferredSearchTerm) {
                const itemId = String(item.data.itemId || item.data.item_id || '').toLowerCase();
                const normalizedItemId = itemId.replace(/[^a-z0-9]/g, '');
                const calculatedCodes = calculateCodesAndPrices(item.data, exchangeRate, '326');
                // Build a wide search string including all relevant fields
                const searchStr = [
                    itemId,
                    normalizedItemId,
                    calculatedCodes.bookBarcodeDisplay || '',
                    (calculatedCodes.bookBarcodeDisplay || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
                    item.data.shape || '',
                    item.data.shortDescription || item.data.short_description || '',
                    item.data.color || '',
                    item.data.material || '',
                    String(item.data.price || item.data.price_mxn || ''),
                    String(item.data.quantity || ''),
                    String(item.data.widthCm || ''),
                    String(item.data.heightCm || ''),
                    String(item.data.lengthCm || ''),
                    String(item.data.weightKg || ''),
                ].join(' ').toLowerCase();

                // Space = OR between groups; + = AND within a group
                const groups = deferredSearchTerm.trim().split(/\s+/).filter(Boolean);
                const matchesAnyGroup = groups.some(group => {
                    const tokens = group.toLowerCase().split('+').filter(Boolean);
                    return tokens.every(t => searchStr.includes(t));
                });
                if (!matchesAnyGroup) return false;
            }
            return true;
        });
        return filtered.sort((a, b) => {
            const sA = getStatusClass(a.data, partialPayIds); const sB = getStatusClass(b.data, partialPayIds);
            if (sA === null && sB !== null) return -1; if (sA !== null && sB === null) return 1;
            let comp = 0;
            if (sortKey === 'Date') {
                const dA = new Date(a.data.timestamp || a.data.updated_at || 0).getTime();
                const dB = new Date(b.data.timestamp || b.data.updated_at || 0).getTime();
                comp = dB - dA;
            }
            else if (sortKey === 'Vendor') {
                const vA = String(a.data.itemId || a.data.item_id || '');
                const vB = String(b.data.itemId || b.data.item_id || '');
                comp = vA.localeCompare(vB);
            }
            else if (sortKey === 'Status') {
                const getVal = (s: string | null) => s === 'RED' ? 6 : s === 'YELLOW' ? 5 : s === 'GREEN' ? 4 : s === 'BLUE' ? 3 : s === 'PURPLE' ? 2 : 1;
                comp = getVal(sB) - getVal(sA);
            }
            else if (sortKey === 'Number') {
                const nA = parseInt(String(a.data.itemNumber || a.data.item_number || '0'), 10);
                const nB = parseInt(String(b.data.itemNumber || b.data.item_number || '0'), 10);
                comp = nA - nB;
            }
            else if (sortKey === 'Value') {
                const vA = parseFloat(String(a.data.price_mxn || a.data.price || 0)) * parseInt(String(a.data.quantity || 1), 10);
                const vB = parseFloat(String(b.data.price_mxn || b.data.price || 0)) * parseInt(String(b.data.quantity || 1), 10);
                comp = vB - vA;
            }
            else if (sortKey === 'Qty') {
                const qA = parseInt(String(a.data.quantity || 1), 10);
                const qB = parseInt(String(b.data.quantity || 1), 10);
                comp = qB - qA;
            }
            return sortOrder === 'desc' ? comp : -comp;
        });
    }, [items, statusFilter, vendorFilter, deferredSearchTerm, sortKey, sortOrder, partialPayIds, fullPayIds, visibleWorkbooks, user, categoryFilter, materialFilter, shapeFilter, contentFilter, materialColorFilter, deployedItemsMap, logisticsDocs]);

    const activeVendors = useMemo(() => Array.from(new Set(items.map(i => i.data.itemId?.split('-')[0]).filter(Boolean))).sort(), [items]);
    const activeCategories = useMemo(() => Array.from(new Set(items.map(i => `${i.data.shape || ''} ${i.data.shortDescription || ''}`.trim()).filter(Boolean))).sort(), [items]);
    // Deduplicate materials cross-vendor: normalize color+material to lowercase for dedup, then Title Case
    const activeMaterials = useMemo(() => {
        const normalized = new Map<string, string>(); // key=lowercase, value=display
        items.forEach(i => {
            const raw = `${(i.data.color || '').trim()} ${(i.data.material || '').trim()}`.trim();
            if (!raw) return;
            const key = raw.toLowerCase();
            if (!normalized.has(key)) {
                const display = raw.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                normalized.set(key, display);
            }
        });
        return Array.from(normalized.values()).sort();
    }, [items]);
    
    const totalCount = useMemo(() => filteredItems.reduce((acc, i) => acc + (parseInt(i.data.quantity) || 1), 0), [filteredItems]);
    const totalValueMXN = useMemo(() => filteredItems.reduce((acc, i) => acc + ((parseInt(i.data.price) || 0) * (parseInt(i.data.quantity) || 1)), 0), [filteredItems]);

    useEffect(() => {
        setGlobalActiveVendors(activeVendors);
        setFilteredCount(filteredItems.length);
        setFilteredTotalQty(totalCount);
        setFilteredTotalValue(totalValueMXN);
        setFilteredIds(filteredItems.map(i => i.row ?? i.data?.id ?? i.data?.itemId ?? '').filter(Boolean));
        setIsLoading(items.length === 0);
    }, [activeVendors, filteredItems, items.length, totalCount, totalValueMXN]);

    const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

    // ── Scroll-container geometry shared by every virtualized mode ──────────────
    // The cards do not own their scrollbar: `.app-content` in MainAppView does, and
    // the sticky header sits above this container inside it. Without scrollMargin
    // the virtualizer computes its window from scrollTop alone and is off by the
    // header's height — previously masked by a large overscan.
    const scrollHostRef = useRef<HTMLDivElement | null>(null);
    const [hostWidth, setHostWidth] = useState(0);
    const [scrollMargin, setScrollMargin] = useState(0);
    const getScrollElement = useCallback(() => document.querySelector('.app-content') as HTMLDivElement | null, []);

    // Layout effect, not a plain effect: the virtualizers need the width and the
    // offset before the first paint, or the opening frame renders the wrong window.
    useLayoutEffect(() => {
        const el = scrollHostRef.current;
        if (!el) return;
        const measure = () => {
            const scroller = getScrollElement();
            setHostWidth(el.clientWidth);
            if (scroller) {
                setScrollMargin(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
            }
        };
        measure();
        // Observing the host is safe against feedback loops: we only read its width
        // and its offset, and React bails out when the primitives are unchanged.
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener('resize', measure);
        return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
    }, [viewMode, getScrollElement]);

    const listVirtualizer = useVirtualizer({
        count: viewMode === 'list' ? filteredItems.length : 0,
        getScrollElement,
        estimateSize: () => 48, // A collapsed row is 44px + the 4px rhythm gap.
        overscan: 10,
        scrollMargin,
        // The zoom slider renders each row inside `transform: scale(listScale)`.
        // virtual-core measures from ResizeObserver's `borderBoxSize`, which is
        // the LAYOUT box — transforms do not touch it. So at any zoom below 1
        // the list reserved each row's full unscaled height while the row drew
        // itself smaller, leaving a dead band under every one of the 483 rows
        // (7.5px each at the default 0.85 — about 16% of the list's height,
        // spent on nothing). Multiplying the measurement back by the same scale
        // is what closes it, and it keeps the slider's meaning unchanged.
        measureElement: (el: Element) => el.getBoundingClientRect().height * listScale,
    });

    // A cached measurement is not re-taken when `measureElement` changes, so a
    // move of the zoom slider has to drop the cache explicitly — the same reason
    // the grid virtualizer re-measures below.
    useEffect(() => {
        if (viewMode === 'list') listVirtualizer.measure();
    }, [listScale, viewMode]);

    // ── Grid virtualization ────────────────────────────────────────────────────
    // Grid is the one uniform layout of the three, so it virtualizes by row. The
    // column count has to be derived by hand because the CSS uses
    // `repeat(auto-fill, minmax(Npx, 1fr))` — the browser decides how many columns
    // fit and never tells JS, so we reproduce auto-fill's arithmetic from the
    // measured host width.
    const GRID_GAP = 32; // Tailwind `gap-8`
    const gridMinColumn = 200 * gridScale;
    const gridColumns = Math.max(1, Math.floor((hostWidth + GRID_GAP) / (gridMinColumn + GRID_GAP)));
    const gridRowEstimate = useMemo(() => {
        const colWidth = hostWidth > 0 ? (hostWidth - (gridColumns - 1) * GRID_GAP) / gridColumns : gridMinColumn;
        // 4:3 media block + the fixed-height info block under it + the row gap.
        return colWidth * 0.75 + 170 + GRID_GAP;
    }, [hostWidth, gridColumns, gridMinColumn]);

    const gridVirtualizer = useVirtualizer({
        count: viewMode === 'grid' ? Math.ceil(filteredItems.length / gridColumns) : 0,
        getScrollElement,
        estimateSize: () => gridRowEstimate,
        overscan: 3,
        scrollMargin,
    });

    // estimateSize changing does not invalidate rows the virtualizer has already
    // measured, so a zoom-slider or resize change has to drop the cache explicitly.
    useEffect(() => {
        if (viewMode === 'grid') gridVirtualizer.measure();
    }, [gridColumns, gridRowEstimate, viewMode]);

    // ── Gallery windowing ──────────────────────────────────────────────────────
    // Gallery is NOT virtualizable the same way: items opt into `col-span-full` or
    // `md:col-span-2` based on how many photos they carry, and rows are
    // `auto-rows-max`, so positions come out of the browser's grid packer and
    // cannot be predicted from an index. Instead we render a growing window. That
    // still bounds the thing that actually hurts here — a gallery card mounts up to
    // 24 remote <img> elements, so 500 cards is ~12k images.
    const GALLERY_PAGE = 40;
    const [galleryLimit, setGalleryLimit] = useState(GALLERY_PAGE);
    const gallerySentinelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => { setGalleryLimit(GALLERY_PAGE); }, [viewMode, filteredItems]);
    useEffect(() => {
        if (viewMode !== 'gallery') return;
        const el = gallerySentinelRef.current;
        if (!el || galleryLimit >= filteredItems.length) return;
        const io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) {
                setGalleryLimit(prev => Math.min(prev + GALLERY_PAGE, filteredItems.length));
            }
        }, { root: getScrollElement(), rootMargin: '800px' });
        io.observe(el);
        return () => io.disconnect();
    }, [viewMode, galleryLimit, filteredItems.length, getScrollElement]);

    // Fix for overlapping cards in list view due to virtualization caching heights during CSS transitions
    // We must force the virtualizer to actually read the DOM element's getBoundingClientRect()
    useEffect(() => {
        if (viewMode !== 'list') return;
        
        const triggerMeasure = () => {
            Object.values(itemRefs.current).forEach(el => {
                if (el) listVirtualizer.measureElement(el);
            });
        };

        triggerMeasure();
        const t1 = setTimeout(triggerMeasure, 150);
        const t2 = setTimeout(triggerMeasure, 350);
        const t3 = setTimeout(triggerMeasure, 550);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [expandedCards, items, viewMode, listVirtualizer]);

    // Ken Burns Logic — deferred 2s after mount so it doesn't compete with initial render
    const [bgMediaUrls, setBgMediaUrls] = useState<string[]>([]);
    useEffect(() => {
        const timer = setTimeout(() => {
            const urls = items
                .flatMap(i => (i.data as any)._allMedia || [])
                .filter((u: string) => !isVideoFile(u))
                .map((u: string) => getCleanImageUrl(u))
                .slice(0, 20);
            setBgMediaUrls(urls);
        }, 2000);
        return () => clearTimeout(timer);
    }, [items]);
    const [bgIdx, setBgIdx] = useState(0);
    useEffect(() => { if (bgMediaUrls.length < 2) return; const i = setInterval(() => setBgIdx(p => (p + 1) % bgMediaUrls.length), 6000); return () => clearInterval(i); }, [bgMediaUrls]);

    const toggleExpandCard = useCallback((id: string, stage?: number) => setExpandedCards(prev => {
        const current = prev[id] || 0;
        let next: number;
        if (stage !== undefined) {
            next = current === stage ? 0 : stage; // Toggle to stage or collapse
        } else {
            // Card click toggle: 0 <-> 1 (collapse even if at 2)
            next = current === 0 ? 1 : 0;
        }
        const copy = { ...prev };
        if (next === 0) delete copy[id];
        else copy[id] = next;
        return copy;
    }), []);

    // UnifiedInventoryCard is React.memo'd, but `onToggleExpand={(stage) => ...}`
    // written inline at the call site handed it a brand-new function on every
    // parent render, so memo never bailed out and all mounted cards re-rendered on
    // every keystroke, filter change and selection toggle. Hand out one stable
    // closure per row id instead. `toggleExpandCard` has an empty dep list, so
    // these stay valid for the life of the view.
    const toggleHandlers = useRef(new Map<string, (stage?: number) => void>());
    const getToggleHandler = useCallback((id: string) => {
        let handler = toggleHandlers.current.get(id);
        if (!handler) {
            handler = (stage?: number) => toggleExpandCard(id, stage);
            toggleHandlers.current.set(id, handler);
        }
        return handler;
    }, [toggleExpandCard]);

    return (
        <div className="flex-1 flex flex-col relative m-0 gap-0">
            {/* ── INFO PANEL ── */}
            <div className="flex-1 relative">
                {/* ── MAIN INVENTORY CONTENT ── */}
                <div 
                    ref={scrollHostRef}
                    className={`transition-all duration-700 ease-in-out ${
                        viewMode === 'grid'
                            // Grid is virtualized: this host is now just the positioning
                            // context, and each virtual ROW carries the grid template.
                            ? "relative w-full pb-32"
                            : viewMode === 'gallery'
                                ? "grid gap-10 pb-32 auto-rows-max"
                                : "inv-scope flex flex-col gap-1 pb-32 w-full"
                    }`}
                    style={
                        viewMode === 'grid'
                            ? {}
                            : viewMode === 'list'
                                ? {} // Removed zoom here to prevent virtualization double-scale distortion
                                : { gridTemplateColumns: `repeat(auto-fill, minmax(${300 * galleryScale}px, 1fr))` }
                    }
                >

                    {isLoading && items.length === 0 ? (
                        viewMode === 'list'
                            ? <InventorySkeletonList />
                            : <InventorySkeletonGrid />
                    ) : (
                        viewMode === 'list' ? (
                            <>
                            {/* Column header — stated ONCE, instead of repeated inside
                                all 483 rows. Those per-row labels ("PRICE / QTY",
                                "TOTAL MXN", "AQ CODE", "LD CODE") cost four extra lines
                                of 10px type per row and were most of the reason a row
                                needed 70px of height.

                                It carries the same scale transform as the rows, so the
                                zoom slider cannot slide the header out of register with
                                the columns it labels. The transform sits INSIDE the
                                sticky wrapper deliberately — see .inv-head-wrap. */}
                            <div className="inv-head-wrap">
                                <div className="inv-cq" style={{
                                    transform: `scale(${listScale})`,
                                    transformOrigin: 'top left',
                                    width: `${100 / listScale}%`,
                                }}>
                                    <div className="inv-grid inv-head">
                                        <div className="inv-c-rail" />
                                        <div className="inv-c-edge" />
                                        <div className="inv-c-media" />
                                        <div className="inv-c-tag">{tr("TAG")}</div>
                                        <div className="inv-c-qty inv-r">{tr("QTY")}</div>
                                        <div className="inv-c-item">{tr("SHAPE TYPE")}</div>
                                        <div className="inv-c-color">{tr("COLOR MATERIAL")}</div>
                                        <div className="inv-c-spacer" />
                                        <div className="inv-c-size">{tr("SIZE")}</div>
                                        <div className="inv-c-weight inv-r">{tr("WEIGHT")}</div>
                                        <div className="inv-c-price inv-r">{tr("PRICE")}</div>
                                        <div className="inv-c-total inv-r">{tr("TOTAL MXN")}</div>
                                        <div className="inv-c-aq">{tr("AQ")}</div>
                                        <div className="inv-c-ld">{tr("LD")}</div>
                                        <div className="inv-c-state">{tr("PACKING")}</div>
                                    </div>
                                </div>
                            </div>
                            <div
                                style={{
                                    height: `${listVirtualizer.getTotalSize()}px`,
                                    width: '100%',
                                    position: 'relative',
                                }}
                            >
                                {listVirtualizer.getVirtualItems().map(virtualRow => {
                                    const item = filteredItems[virtualRow.index];
                                    if (!item) return null;
                                    return (
                                        <div
                                            key={item.row}
                                            ref={(el) => {
                                                listVirtualizer.measureElement(el);
                                                itemRefs.current[virtualRow.index] = el;
                                            }}
                                            data-index={virtualRow.index}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                transform: `translate3d(0, ${virtualRow.start - listVirtualizer.options.scrollMargin}px, 0)`,
                                                willChange: 'transform',
                                                backfaceVisibility: 'hidden',
                                                zIndex: expandedCards[String(item.row)] ? 10 : 1,
                                            }}
                                        >
                                            <div className="inv-cq" style={{
                                                transform: `scale(${listScale}) translateZ(0)`,
                                                transformOrigin: 'top left',
                                                width: `${100 / listScale}%`,
                                                willChange: 'transform',
                                                backfaceVisibility: 'hidden',
                                            }}>
                                                <UnifiedInventoryCard
                                                    item={item}
                                                    isExpanded={expandedCards[String(item.row)] || 0}
                                                    onToggleExpand={getToggleHandler(String(item.row))}
                                                    exchangeRate={exchangeRate}
                                                    showFinancials={showFinancials}
                                                    viewMode={viewMode}
                                                    partialPayIds={partialPayIds}
                                                    fullPayIds={fullPayIds}
                                                    requestedAcqIds={requestedAcqIds}
                                                    onEdit={handleEditItem}
                                                    financeDocs={financeDocs}
                                                    deployedItemsMap={deployedItemsMap}
                                                    logisticsDocs={logisticsDocs}
                                                    allInventory={items}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            </>
                        ) : viewMode === 'grid' ? (
                            <div style={{ height: `${gridVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                                {gridVirtualizer.getVirtualItems().map(virtualRow => {
                                    const start = virtualRow.index * gridColumns;
                                    const rowItems = filteredItems.slice(start, start + gridColumns);
                                    if (rowItems.length === 0) return null;
                                    return (
                                        <div
                                            key={virtualRow.key}
                                            data-index={virtualRow.index}
                                            ref={gridVirtualizer.measureElement}
                                            className="grid gap-8"
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                // scrollMargin is in the virtualizer's coordinate space (offsets
                                                // from the top of .app-content); this container starts below the
                                                // sticky header, so subtract it back out.
                                                transform: `translate3d(0, ${virtualRow.start - gridVirtualizer.options.scrollMargin}px, 0)`,
                                                // Explicit column count instead of auto-fill: the row must agree
                                                // with the count the virtualizer sliced by, or the last column
                                                // silently wraps onto a second line and rows overlap.
                                                gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                                                // The row gap lives inside the measured element so measureElement
                                                // reports a height that already accounts for it.
                                                paddingBottom: `${GRID_GAP}px`,
                                            }}
                                        >
                                            {rowItems.map(item => (
                                                <UnifiedInventoryCard
                                                    key={item.row}
                                                    item={item}
                                                    isExpanded={expandedCards[String(item.row)] || 0}
                                                    onToggleExpand={getToggleHandler(String(item.row))}
                                                    exchangeRate={exchangeRate}
                                                    showFinancials={showFinancials}
                                                    viewMode={viewMode}
                                                    partialPayIds={partialPayIds}
                                                    fullPayIds={fullPayIds}
                                                    requestedAcqIds={requestedAcqIds}
                                                    onEdit={handleEditItem}
                                                    financeDocs={financeDocs}
                                                    deployedItemsMap={deployedItemsMap}
                                                    logisticsDocs={logisticsDocs}
                                                    allInventory={items}
                                                />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <>
                            {filteredItems.slice(0, galleryLimit).map(item => {
                                const mediaCount = ((item.data.generatedPngUrl ? item.data.generatedPngUrl + ',' : '') + (item.data.mediaUrls || '')).split(',').map((u: string) => u.trim()).filter(Boolean).length;
                                const isLarge = mediaCount >= 1 && mediaCount < 10;
                                const isFull = mediaCount >= 10;

                                return (
                                    // Deliberately NOT `content-visibility: auto` here, tempting as it is:
                                    // it implies paint containment, which would clip the card's
                                    // `hover:-translate-y-1` lift and its hover shadow at the wrapper's
                                    // border box. The growing window below is what bounds the cost.
                                    <div key={item.row}
                                        className={`break-inside-avoid ${isFull ? 'col-span-full' : isLarge ? 'md:col-span-2' : ''}`}
                                    >
                                        <UnifiedInventoryCard
                                            item={item}
                                            isExpanded={expandedCards[String(item.row)] || 0}
                                            onToggleExpand={getToggleHandler(String(item.row))}
                                            exchangeRate={exchangeRate}
                                            showFinancials={showFinancials}
                                            viewMode={viewMode}
                                            partialPayIds={partialPayIds}
                                            fullPayIds={fullPayIds}
                                            requestedAcqIds={requestedAcqIds}
                                            onEdit={handleEditItem}
                                            financeDocs={financeDocs}
                                            deployedItemsMap={deployedItemsMap}
                                            logisticsDocs={logisticsDocs}
                                            allInventory={items}
                                        />
                                    </div>
                                );
                            })}
                            {galleryLimit < filteredItems.length && (
                                <div ref={gallerySentinelRef} className="col-span-full h-1" aria-hidden="true" />
                            )}
                            </>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};
