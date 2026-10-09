/**
 * The Catalog Hub: one row per ITEM, a review drawer beside the list, and a
 * run bar under it, on the UI kit (components/ui) and the run engine
 * (lib/ai/run).
 *
 * It used to be one full-width card per PHOTO, about two on screen, each with
 * its own status, so a three-photo item was three cards that disagreed, a
 * failed mask still read DONE, and the masks and clean PNGs a run produced
 * were mostly invisible. Now:
 *
 *   · Each row carries the item's tag, its photos plus the generated PNG and
 *     mask, the generated title, one square per process and one state.
 *   · The drawer shows every output of every photo (Photo / Clean PNG /
 *     Cutout / Mask / SVG / Axo, with a lightbox), the generated copy as an
 *     editable form, and the item's log.
 *   · The engine runs the ticked processes, one op per photo, and saves only
 *     what was ticked and worked plus what a person typed, through
 *     lib/ai/persist. Accept marks an item reviewed; Save reviewed writes them.
 *
 * Kept from the old hub, moved into this layout: the API key dialog, Write
 * From Similar for items with no photograph, the 1:1 crop and the cutout
 * upload, a background clean for one item, hero-only runs, re-clean all,
 * clearing the AI columns (now confirmed here, not in a native confirm(), and
 * written through saveAiPatch), and the Matrixify XLSX and catalogue PDF
 * exports. Book codes are the 17 book rate; a stored barcode always wins.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { createPortal } from 'react-dom';
import {
    Bot, Check, Copy, Crop, Eraser, FileSpreadsheet, FileText, ImageUp, KeyRound, Play, RefreshCw,
    RotateCcw, Save, Search, Sparkles, Square, Upload, Wand2, X, XCircle,
} from 'lucide-react';
import toast from '../onyxIsland/notify/toast';
import ExcelJS from 'exceljs';
import {
    isBatchWizardOpenAtom,
    batchWizardItemsAtom,
    batchWizardHandoffAtom,
    inventoryAtom,
    InventoryVersionAtom,
    userAtom,
} from '../../lib/atoms';
import { DEFAULT_EXCHANGE_RATE, vendors } from '../../lib/consts';
import {
    getCleanImageUrl,
    collectAllImages,
    calculateCodesAndPrices,
    normalizeInventoryData,
    getProductCategoryAndType,
    formatProductTitle,
} from '../../lib/utils';
import { exportCatalogPdf, CatalogArtifact } from '../../lib/pdfExport';
import { getStoneStyleColors, generateFallbackMarketingHtml } from '../../lib/colorExtractor';
import { SquareCropModal } from '../../components/SquareCropModal';
import { sanitizeExcelRow } from '../../lib/xlsxUtils';
import { validateCopy } from '../../lib/copyValidation';
import { CATALOG_PROCESSES } from '../../lib/catalogHubProcesses';
import { tr, trf } from '../../lib/i18n';
import { hasGeminiKey, setGeminiKey } from '../../lib/ai/keys';
import { aiErrorMessage } from '../../lib/ai/errors';
import { saveAiPatch, type AiPatch, type InventoryUpdate } from '../../lib/ai/persist';
import type { ProcessingMode } from '../../lib/catalogHubPipeline';
import type { BgRoom } from '../../lib/bgReplace';
import {
    useAiRun, rowOf, TEXT_PROCESSES,
    type RunItem, type RunPhoto, type RunItemStatus, type RunProcessStatus, type ProcessId, type SaveOutcome,
} from '../../lib/ai/run';
import {
    Key, Chip, ProcessChips, Segmented, Field, Input, Select, ItemTag, resolveItemTag, StatusPill, StepsStrip,
    Thumb, MediaViewer, ItemList, ItemRow, FilterTabs, RunBar, Drawer, GeneratedContent, PROCESS_META, cx, itemStateLabel,
    type MediaAngle, type MediaView, type GeneratedValue,
    Dialog,
} from '../../components/ui';
import { trackDocumentJob } from '../print/jobTracking';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Ticked when the hub opens: every process that defaults on, except the donor pass, which has its own key. */
const DEFAULT_PROCESSES: readonly ProcessId[] = CATALOG_PROCESSES
    .filter(p => p.defaultChecked && p.id !== 'variation_donor')
    .map(p => p.id);

/** Text first, then image, in catalogue order within each: the order the process chips show. */
const PROCESS_ORDER: readonly ProcessId[] = [
    ...CATALOG_PROCESSES.filter(p => PROCESS_META[p.id].group === 'text'),
    ...CATALOG_PROCESSES.filter(p => PROCESS_META[p.id].group === 'image'),
].map(p => p.id);

/**
 * The cleaning engine. Cloud is bgreplace, the default: it repaints the
 * background instead of cutting the piece out, the only one that cannot punch
 * holes in a translucent or dark-veined stone. The other three cut the piece
 * out; they stay for the items that genuinely need transparency.
 */
const MODE_OPTIONS: readonly { value: ProcessingMode; label: string; title: string }[] = [
    { value: 'bgreplace', label: 'Cloud', title: 'Gemini repaints the background as a dark studio (the default)' },
    { value: 'local', label: 'Local', title: 'Cut the piece out on this device; no Gemini call for the image' },
    { value: 'cloud', label: 'AI mask', title: 'Gemini traces the piece and its layers, then the cut-out is made from that' },
    { value: 'hybrid', label: 'Hybrid', title: 'Local cut-out, refined by Gemini' },
];

/**
 * The studio the Cloud engine paints behind the piece. Dark is what the
 * catalogue was cleaned with; Light is a second look. Colours are never read
 * from a light backdrop (see bgReplace.ts), so picking it does not change them.
 */
const ROOM_OPTIONS: readonly { value: BgRoom; label: string; title: string }[] = [
    { value: 'dark', label: 'Dark room', title: 'Near-black studio behind the piece (the default)' },
    { value: 'light', label: 'Light room', title: 'Soft light grey studio behind the piece. Colours are read from the cut-out or the original photo, never from this background.' },
];

/** The columns "Clear AI data" empties: the AI half of the canonical map, never the vendor's fields. */
const CLEAR_COLUMNS: InventoryUpdate = {
    detailed_description: null,
    generated_description: null,
    generated_color: null,
    generated_type: null,
    spatial_points: null,
    spatial_masks: null,
    generated_png_url: null,
    generated_svg_url: null,
    processed_media_urls: null,
    axo_icon_url: null,
};

// The title and the steps give way first, so the State column never ends up
// past the list's right edge (the inline drawer takes 400px from 1021px up).
const ROW_COLUMNS = '22px 112px 112px minmax(0, 1fr) minmax(96px, 160px) 86px';

type FilterId = 'all' | 'review' | 'running' | 'failed' | 'saved';

/** What the row and the run bar show: the engine's state, with "nothing left to do" shown as saved. */
type DisplayState = RunItemStatus;

type Confirm =
    | { kind: 'close' }
    | { kind: 'clear'; ids: string[] }
    | { kind: 'reclean'; ids: string[] };

// ─────────────────────────────────────────────────────────────────────────────
// Reading an item
// ─────────────────────────────────────────────────────────────────────────────

/** A URL an <img> can show: Drive links go through getCleanImageUrl, data: URLs and markup pass. */
const disp = (u?: string | null): string | undefined => {
    if (!u) return undefined;
    if (u.startsWith('data:') || u.trim().startsWith('<')) return u;
    return getCleanImageUrl(u) || u;
};

const stillsOf = (it: RunItem): RunPhoto[] => it.photos.filter(p => !p.isVideo);

/** What one photo has to show, this run's output first, then what is stored. */
function outputsOf(p: RunPhoto) {
    const png = disp(p.cleanedUrl ?? p.stored.cleanedUrl);
    const cutout = disp(p.cutoutUrl ?? p.stored.cutoutUrl);
    const mask = disp(p.matteUrl ?? p.stored.matteUrl) ?? cutout;
    const svg = p.svgUrl ?? p.stored.svgUrl;
    // In bgreplace mode the clean PNG is the repainted photo and the cut-out
    // is a second image; in the cut-out modes they are the same file.
    return { photo: disp(p.sourceUrl) || '', png, cutout: cutout && cutout !== png ? cutout : undefined, mask, svg, opaque: !!png && png !== cutout };
}

const parseMap = (raw: unknown): Record<string, string> => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>;
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try { return JSON.parse(raw); } catch { return {}; }
    }
    return {};
};

/** Generated video clips: this run's, else the stored videoGen entries of processed_media_urls. */
function clipsOf(it: RunItem): string[] {
    const fromMap = (m: Record<string, string> | undefined): string[] => {
        if (!m) return [];
        const n = parseInt(m.videoGenCount || '0', 10);
        if (n > 0) return Array.from({ length: n }, (_, i) => m[`videoGen_${i}`]).filter(Boolean);
        return m.videoGen ? [m.videoGen] : [];
    };
    for (const o of it.ops) {
        const r = o.op.result;
        const clips = fromMap(r?.processedMap);
        if (clips.length) return clips;
        if (r?.videoGen) return [r.videoGen];
    }
    const raw = rowOf(it.row);
    return fromMap(parseMap(raw.processed_media_urls ?? raw.processedMediaUrls));
}

/** The text shown and edited: generated or edited this session, else what is stored. */
function shownText(it: RunItem): GeneratedValue {
    const ex = it.item.existing;
    return {
        title: it.text.title ?? ex.title ?? '',
        html: it.text.html ?? ex.html ?? '',
        colors: it.text.colors ?? ex.colors ?? [],
        genType: it.text.genType ?? ex.genType ?? '',
    };
}

/** Does the process apply to this item at all? */
function applies(it: RunItem, p: ProcessId): boolean {
    const stills = it.media.some(m => !m.isVideo);
    if (p === 'video_proc') return it.media.some(m => m.isVideo);
    if (p === 'variation_donor') return !stills;
    if (p === 'img_clean' || p === 'image_segmentation' || p === 'hex_map') return stills;
    return true;
}

/** What the database already holds for a process, for an item this session has not run it on. */
function storedState(it: RunItem, p: ProcessId, heroOnly: boolean): RunProcessStatus {
    if (!applies(it, p)) return 'skipped';
    const ex = it.item.existing;
    const stills = stillsOf(it);
    const scope = heroOnly ? stills.slice(0, 1) : stills;
    const share = (have: (x: RunPhoto) => boolean): RunProcessStatus => {
        const n = scope.filter(have).length;
        return n === 0 ? 'queued' : n === scope.length ? 'done' : 'partial';
    };
    switch (p) {
        case 'title_desc': return ex.title ? 'done' : 'queued';
        case 'marketing_desc': return ex.html ? 'done' : 'queued';
        case 'dominant_colors': return ex.colors.length ? 'done' : 'queued';
        case 'product_type': return ex.genType ? 'done' : 'queued';
        case 'variation_donor': return ex.title ? 'done' : 'queued';
        case 'hex_map': return it.stored.hexMap ? 'done' : 'queued';
        case 'img_clean': return share(x => !!x.stored.cleanedUrl);
        case 'image_segmentation': return share(x => !!x.stored.cutoutUrl);
        case 'video_proc': return clipsOf(it).length ? 'done' : 'queued';
        default: return 'queued';
    }
}

/**
 * The ticked processes this item still lacks. An item with no photograph is
 * left to Write From Similar: copy invented without a photo is a deliberate
 * step, as it was in the old hub, not a side effect of Run.
 */
function missingOf(it: RunItem, selection: ReadonlySet<ProcessId>, heroOnly: boolean): ProcessId[] {
    const photoless = !it.media.some(m => !m.isVideo);
    return PROCESS_ORDER.filter(p => {
        if (!selection.has(p) || !applies(it, p)) return false;
        if (photoless && p !== 'video_proc') return false;
        return storedState(it, p, heroOnly) !== 'done';
    });
}

const isBusy = (it: RunItem) => it.status === 'running' || it.saving;

const canAccept = (it: RunItem) =>
    !isBusy(it) && (it.status === 'review' || it.status === 'partial' || (it.dirty && it.status !== 'done'));

/** Shape and Type, then the vendor colour and quantity: "Large Bowl · Blue Argentina". */
function nameOf(it: RunItem): string {
    const i = it.item;
    const head = [i.shape, i.type].filter(Boolean).join(' ') || i.vendorText || it.label;
    return [head, i.vendorColor, i.quantity > 1 ? `${tr('qty')} ${i.quantity}` : ''].filter(Boolean).join(' · ');
}

function sizeOf(it: RunItem): string {
    const i = it.item;
    const dims = [i.widthCm, i.heightCm, i.lengthCm].filter(v => v > 0).map(v => Math.round(v * 10) / 10);
    return [
        dims.length ? `${dims.join('×')} cm` : '',
        i.priceMxn > 0 ? `$${Math.round(i.priceMxn).toLocaleString('en-US')}` : '',
    ].filter(Boolean).join(' · ');
}

const LOG_TONE = (line: string) =>
    /\[ FAIL \]/.test(line) ? 'ui-log__bad'
        : /\[ WARN \]|\[ STOP \]/.test(line) ? 'ui-log__warn'
            : /\[  OK  \]/.test(line) ? 'ui-log__ok'
                : undefined;

function etaLabel(ms: number | null): string | undefined {
    if (ms === null) return undefined;
    const min = Math.round(ms / 60000);
    return min < 1 ? tr('under a minute left') : trf('about {n} min left', { n: min });
}

function useNarrow(query = '(max-width: 1020px)'): boolean {
    const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
    const [narrow, setNarrow] = useState(get);
    useEffect(() => {
        const mq = window.matchMedia?.(query);
        if (!mq) return;
        const on = () => setNarrow(mq.matches);
        on();
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, [query]);
    return narrow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports (what is SAVED: the run must be saved first, as before)
// ─────────────────────────────────────────────────────────────────────────────

const getProductCategory = (shape: string, shortDesc: string) => {
    const combined = `${shape} ${shortDesc}`.toLowerCase();
    if (combined.includes('wine rack')) return 'Furniture > Cabinets & Storage > Wine Racks';
    if (combined.includes('pendant')) return 'Home & Garden > Lighting > Lighting Fixtures > Pendant Light Fixtures';
    if (combined.includes('tower lamp') || combined.includes('floor lamp') || combined.includes('pillar')) return 'Home & Garden > Lighting > Lamps > Floor Lamps';
    if (combined.includes('table lamp') || combined.includes('desk lamp') || combined.includes('lamp')) return 'Home & Garden > Lighting > Lamps > Desk Lamps';
    if (combined.includes('coaster')) return 'Home & Garden > Kitchen & Dining > Barware > Coasters';
    if (combined.includes('bathtub') || combined.includes('tub')) return 'Hardware > Plumbing > Plumbing Fixtures > Bathtubs';
    if (combined.includes('sink') || combined.includes('vessel')) return 'Hardware > Plumbing > Plumbing Fixtures > Sinks';
    if (combined.includes('sculpture') || combined.includes('statue') || combined.includes('carving') || combined.includes('figure')) return 'Home & Garden > Decor > Artwork > Sculptures & Statues';
    if (combined.includes('bowl')) return 'Home & Garden > Decor > Decorative Bowls';
    if (combined.includes('plate')) return 'Home & Garden > Decor > Decorative Plates';
    if (combined.includes('tray')) return 'Home & Garden > Decor > Decorative Trays';
    if (combined.includes('fountain') || combined.includes('waterfall')) return 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains';
    if (combined.includes('garden sculpture') || combined.includes('lawn ornament')) return 'Home & Garden > Decor > Lawn Ornaments & Garden Sculptures > Garden Sculptures';
    if (combined.includes('mirror')) return 'Home & Garden > Decor > Mirrors';
    if (combined.includes('shot glass') || combined.includes('tequila glass')) return 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses';
    if (combined.includes('wall light') || combined.includes('sconce')) return 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures';
    if (combined.includes('board game') || combined.includes('chess') || combined.includes('checkers') || combined.includes('tic tac toe')) return 'Toys & Games > Games > Board Games';
    return 'Home & Garden > Decor';
};

interface ExportEntry {
    it: RunItem;
    itemData: any;
    category: string;
    vendorName: string;
    tagId: string;
    allMasks: string[];
    text: GeneratedValue;
    overrideNormData?: any;
}

/**
 * One XLSX entry (or several, for a set photographed piece by piece) and one
 * PDF artifact per item, from the stored row: the exports are gated on
 * nothing being unsaved, so the row is the reviewed truth. Per photo the
 * image is the clean photo, else the cut-out, else the original.
 */
function buildExportContext(items: readonly RunItem[]) {
    const exportDataList: ExportEntry[] = [];
    const catalogResults: CatalogArtifact[] = [];

    for (const it of items) {
        const itemData = rowOf(it.row);
        const shape = itemData.shape || 'object';
        const shortDesc = itemData.shortDescription || itemData.short_description || itemData.type || '';
        const category = getProductCategory(shape, shortDesc);

        const normData = normalizeInventoryData(itemData);
        const bookPrefix = normData.workbook || itemData.workbook || '326';
        // The 17 book rate, never the live market rate: these are the codes on the label.
        const codes = calculateCodesAndPrices(itemData, DEFAULT_EXCHANGE_RATE, bookPrefix);

        // A stored barcode is printed on a label and is never recomputed.
        const tag = resolveItemTag(itemData);
        const tagId = tag.barcode || normData.itemId || '';
        const vendorName = (vendors as Record<string, { name: string }>)[tag.vendor]?.name || tag.vendor || 'Art of Decor';

        const stills = stillsOf(it);
        const combinedMaskUrls = stills.map(p => p.stored.cleanedUrl || p.stored.cutoutUrl || p.sourceUrl).filter(Boolean) as string[];
        const text: GeneratedValue = {
            title: it.item.existing.title,
            html: it.item.existing.html,
            colors: it.item.existing.colors,
            genType: it.item.existing.genType,
        };

        const pdfProcessedMap: Record<string, string> = {};
        stills.forEach(p => {
            const out = p.stored.cleanedUrl || p.stored.cutoutUrl;
            if (out) pdfProcessedMap[p.sourceUrl] = out;
        });

        const pdfData = {
            ...normData,
            book_barcode: tagId,
            book_aq_code: codes?.bookAqCode || normData.book_aq_code || '',
            book_land_code: codes?.bookLandCode || normData.book_land_code || '',
            book_acquisition: codes?.bookAcquisition || normData.book_acquisition || '',
            book_landed: codes?.bookLanded || normData.book_landed || '',
            book_retail: codes?.bookRetail || normData.book_retail || '',
            description: text.title || normData.description,
            detailed_description: text.title || normData.detailed_description,
            marketing_description: text.html || generateFallbackMarketingHtml(normData),
            dominant_colors: text.colors.length > 0 ? text.colors.join(', ') : (normData.color || ''),
            processed_media_urls: JSON.stringify(pdfProcessedMap),
            category,
        };

        const numImages = combinedMaskUrls.length;
        const quantity = Number(normData.quantity) || 1;
        const isCylinderPendant = (normData.type || '').toUpperCase().includes('CYLINDER PENDANT');
        const isQtyMatchesImages = quantity === numImages && numImages > 1;
        const isCylinderBoxSet = isCylinderPendant && quantity > numImages && numImages > 1;
        const priceCodes = { ...codes, primaryPriceLabel: 'USD RETAIL', primaryPriceValue: `$${codes.bookRetail} USD` };

        if (isQtyMatchesImages || isCylinderBoxSet) {
            let qtyPerRow = 1;
            if (isCylinderBoxSet) {
                const w = Math.round(parseFloat(normData.widthCm) || 0);
                if (w === 12 || w === 10) qtyPerRow = 9;
                else if (w === 8) qtyPerRow = 12;
                else qtyPerRow = Math.round(quantity / numImages);
            }
            combinedMaskUrls.forEach((url, index) => {
                const partSuffix = `(${index + 1} of ${numImages})`;
                exportDataList.push({ it, itemData, category, vendorName, tagId, text, allMasks: [url], overrideNormData: { ...normData, quantity: qtyPerRow, partSuffix } });
                catalogResults.push({
                    data: { ...pdfData, quantity: qtyPerRow, partSuffix },
                    codes: priceCodes,
                    images: [getCleanImageUrl(url)!],
                    exportType: 'catalog',
                });
            });
        } else {
            exportDataList.push({ it, itemData, category, vendorName, tagId, text, allMasks: combinedMaskUrls });
            catalogResults.push({
                data: pdfData,
                codes: priceCodes,
                images: combinedMaskUrls.length > 0 ? combinedMaskUrls.map(u => getCleanImageUrl(u)!) : collectAllImages(normData),
                exportType: quantity === 1 && numImages > 1 ? 'catalog-grid' as any : 'catalog',
            });
        }
    }
    return { exportDataList, catalogResults };
}

const XLSX_HEADERS = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Option1 Name', 'Option1 Value', 'Variant Position', 'Variant SKU', 'Variant Barcode', 'Variant Cost',
    'Variant Price', 'Variant Grams', 'Image Src', 'Image Command', 'Image Position', 'Variant Image',
    'Metafield: custom.product_weight [single_line_text_field]',
    'Variant Metafield: Vendor_SKU', 'Variant Weight Unit',
    'Variant Metafield: reg.variant_depth', 'Variant Metafield: reg.variant_width',
    'Variant Metafield: reg.variant_height', 'Variant Metafield: reg.variant_measurements',
    'Metafield: Measurements', 'Metafield: shopify.material [list.metaobject_reference]',
    'Metafield: custom.variety [list.single_line_text_field]', 'Product Category',
    'Tags', 'Metafield: shopify.color-pattern [list.metaobject_reference]',
    'Metafield: custom.polish_type [list.single_line_text_field]',
    'Metafield: custom.cut_type [list.single_line_text_field]',
    'Metafield: shopify.age-group [list.metaobject_reference]',
    'Metafield: shopify.target-gender [list.metaobject_reference]',
    'Variant Metafield: mm-google-shopping.custom_label_1',
    'Metafield: reg.designer', 'Status', 'Published', 'Published Scope',
    'Variant Taxable', 'Variant Inventory Tracker', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Requires Shipping',
    'Included / Art Of Decor', 'Included / Trade Partners - Fountains', 'Included / Trade Partners - Pendant Lights',
];

/** The Matrixify sheet: one row per image of each entry. Exported documents stay English. */
async function buildXlsx(entries: readonly ExportEntry[]): Promise<Blob> {
    return trackDocumentJob({
        templateId: 'fmt-shopify-batch-wizard-xlsx',
        kind: 'xlsx',
        season: '826',
        getSnapshot: () => entries
    }, async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Onyx Dashboard';
    const sheet = workbook.addWorksheet('Shopify Export');
    sheet.addRow(sanitizeExcelRow(XLSX_HEADERS));
    sheet.getRow(1).font = { bold: true };

    for (const { itemData, category, vendorName, tagId, text, allMasks, overrideNormData } of entries) {
        const norm = overrideNormData || normalizeInventoryData(itemData);
        const bookPrefix = norm.workbook || itemData.workbook || '326';
        const calc = calculateCodesAndPrices(norm, DEFAULT_EXCHANGE_RATE, bookPrefix);

        const shape = norm.shape || '';
        const shortDesc = norm.shortDescription || norm.type || '';
        const color = norm.color || '';
        const material = norm.material || '';
        const fallbackTitle = `${shape} ${shortDesc} ${color} ${material}`.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const title = formatProductTitle(text.title || fallbackTitle) + (norm.partSuffix ? ` ${norm.partSuffix}` : '');
        const bodyHtml = text.html || norm.generatedDescription || generateFallbackMarketingHtml(norm);

        let colorsStr = '';
        if (text.colors.length > 0) colorsStr = text.colors.join(', ');
        else if (norm.color && norm.color.includes(',')) colorsStr = norm.color;
        else colorsStr = getStoneStyleColors(material, `${shape} ${shortDesc}`, color).join(', ');

        const testStr = `${shape} ${shortDesc} ${category} ${title} ${material}`;
        const fountainsVal = /fountain|fuente|cascada/i.test(testStr) ? 'TRUE' : 'FALSE';
        const pendantsVal = /pendant|colgante|lámpara colgante|hanging/i.test(testStr) ? 'TRUE' : 'FALSE';

        const vendorSku = calc.bookAqCode || tagId.replace(/^[A-Za-z]{2}[-]?\d{3}[-]?/, '') || tagId;
        const rawVendorId = String(norm.vendorId || norm.vendor_id || '').toUpperCase().trim();
        const vendorPrefix = rawVendorId.split('-')[0] || rawVendorId.substring(0, 2);

        // Strictly the allowed Shopify choices.
        let polishType = 'Matte';
        if (vendorPrefix === 'JM') polishType = 'Fully Polished';
        else if (['TE', 'EM', 'ML'].includes(vendorPrefix)) polishType = 'Partially Polished';

        const parseNum = (val: any) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };
        const cmToIn = (cm: any) => (parseNum(cm) / 2.54).toFixed(2);
        const costMxn = parseFloat(norm.price || norm.acquisition_price_mxn || '0') || 0;
        const cost = calc.bookLanded || '';
        const price = calc.bookRetail && calc.bookRetail !== '-' ? parseFloat(calc.bookRetail) || 0 : ((costMxn / DEFAULT_EXCHANGE_RATE) * 1.4 * 12) || 0;
        const weightKg = parseNum(norm.weightKg);
        const weightGrams = Math.round(weightKg * 1000);
        const weightLbs = (weightKg * 2.20462).toFixed(2);
        const depthIn = cmToIn(norm.lengthCm);
        const widthIn = cmToIn(norm.widthCm);
        const heightIn = cmToIn(norm.heightCm);
        const measurementsStr = `D${depthIn}xW${widthIn}xH${heightIn}`;
        const formattedMaterial = material ? material.charAt(0).toUpperCase() + material.slice(1) : 'Onyx';

        let itemImages: string[] = allMasks.map(m => getCleanImageUrl(m) || '').filter(Boolean);
        if (itemImages.length === 0) {
            const primary = getCleanImageUrl(norm.generatedPngUrl) || getCleanImageUrl(norm.imageUrl || norm.mediaUrls?.split(',')[0]);
            itemImages = primary ? [primary] : [''];
        }
        // Drive links need an extension for Matrixify to fetch them as images.
        itemImages = itemImages.map(img => {
            let clean = getCleanImageUrl(img) || img;
            if (clean && clean.includes('google') && !clean.toLowerCase().endsWith('.png') && !clean.toLowerCase().endsWith('.jpg')) {
                clean = clean.includes('?') ? `${clean}&ext=.png` : `${clean}?.png`;
            }
            return clean;
        });

        const combinedVendorSku = `${tagId}-${vendorSku}${costMxn}`;
        const tagsArray = [
            tagId, color, formattedMaterial, shape, shortDesc,
            norm.heightCm ? `${norm.heightCm} cm` : '',
            norm.widthCm ? `${norm.widthCm} cm` : '',
        ].filter(Boolean).join(', ');
        const catAndType = getProductCategoryAndType(norm);
        const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || tagId.toLowerCase();

        itemImages.forEach((imgUrl, imgIdx) => {
            sheet.addRow(sanitizeExcelRow([
                handle, title, bodyHtml, vendorName, catAndType.type, 'Title', 'Default Title', 1, tagId, tagId, cost, price, weightGrams,
                imgUrl, 'MERGE', imgIdx + 1, imgIdx === 0 ? imgUrl : '', weightLbs, combinedVendorSku, '', depthIn, widthIn, heightIn,
                measurementsStr, '', formattedMaterial, 'Mexican Onyx', catAndType.category, tagsArray, colorsStr, polishType, '',
                'Adults', 'Unisex', 'Rare Earth Gallery', 'Rare Earth Gallery', 'active', 'FALSE', 'global', 'true', 'shopify', 'deny',
                'manual', 'true', 'TRUE', fountainsVal, pendantsVal,
            ]));
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

/** Mounted only while open, so closing drops the run (and the engine stops whatever is in flight). */
export const BatchProcessingWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isBatchWizardOpenAtom);
    const batchItems = useAtomValue(batchWizardItemsAtom);
    const setHandoff = useSetAtom(batchWizardHandoffAtom);
    if (!isOpen) return null;
    // A hand-off the hub never got to read (closed at once) must not ride
    // along with the next ordinary opening.
    return <CatalogHub items={batchItems} onClose={() => { setIsOpen(false); setHandoff(null); }} />;
};

function CatalogHub({ items, onClose }: { items: readonly any[]; onClose: () => void }) {
    const user = useAtomValue(userAtom);
    // Whole catalogue, not just the selection: an item with no photograph
    // borrows copy from the closest item that already has some.
    const fullInventory = useAtomValue(inventoryAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);

    // Batch Create's hand-off (lib/atoms batchWizardHandoffAtom), read once:
    // its processes are ticked from the start, and the run it asks for starts
    // below once the items are in the engine.
    const [handoff, setHandoff] = useAtom(batchWizardHandoffAtom);
    const handoffRef = useRef(handoff);

    const [processes, setProcesses] = useState<Set<ProcessId>>(() => {
        // A hand-off's own pick, even an empty one (only 'From similar' was
        // ticked): falling back to the defaults here made the auto-run spend
        // image and copy calls on every photo row nobody asked for.
        if (handoffRef.current) return new Set(handoffRef.current.processes.filter(p => p !== 'variation_donor'));
        return new Set(DEFAULT_PROCESSES);
    });
    const [mode, setMode] = useState<ProcessingMode>('bgreplace');
    const [room, setRoom] = useState<BgRoom>('dark');
    /**
     * Restrict fresh runs to each item's first photo. Off by default: it was
     * once hard-wired on with no control, which is why multi-photo items only
     * ever came back with one cleaned photo. Still offered, because at about
     * two photos an item it halves the image bill.
     */
    const [heroOnly, setHeroOnly] = useState(false);

    const run = useAiRun({
        items,
        processes,
        processingMode: mode,
        bgQuality: '2K',
        bgRoom: room,
        user,
        donorInventory: fullInventory,
        heroOnly,
    });

    const [filter, setFilter] = useState<FilterId>('all');
    const [query, setQuery] = useState('');
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [ticked, setTicked] = useState<Set<string>>(() => new Set());
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [angle, setAngle] = useState(0);
    const [view, setView] = useState<MediaView>('photo');
    const [confirm, setConfirm] = useState<Confirm | null>(null);
    const [busyConfirm, setBusyConfirm] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [keyDraft, setKeyDraft] = useState('');
    const pendingRef = useRef<(() => void) | null>(null);
    const [crop, setCrop] = useState<{ itemId: string; index: number; src: string } | null>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const uploadTarget = useRef<{ itemId: string; index: number } | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const focusRowRef = useRef(false);

    const [pdfBrand, setPdfBrand] = useState<'ArtOfDecor' | 'RareEarth'>('ArtOfDecor');
    const [xlsxUrl, setXlsxUrl] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [makingXlsx, setMakingXlsx] = useState(false);
    const [makingPdf, setMakingPdf] = useState(false);

    const narrow = useNarrow();

    // Object URLs are released when the hub closes.
    const urlsRef = useRef<string[]>([]);
    useEffect(() => () => { urlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

    // ── derived ──
    const all = run.items;

    const displayOf = useCallback((it: RunItem): DisplayState => {
        if (it.status !== 'queued' || it.dirty) return it.status;
        // A never-run (or stopped) item that already has everything ticked is
        // done as far as this run is concerned. One with no photograph counts
        // once it has copy (Write From Similar is what fills it).
        const hasStills = it.media.some(m => !m.isVideo);
        const complete = missingOf(it, processes, heroOnly).length === 0 && (hasStills || !!it.item.existing.title);
        return complete ? 'saved' : 'queued';
    }, [processes, heroOnly]);

    const states = useMemo(() => {
        const m = new Map<string, DisplayState>();
        for (const it of all) m.set(it.id, displayOf(it));
        return m;
    }, [all, displayOf]);

    const counts = useMemo(() => {
        const c: Partial<Record<RunItemStatus, number>> = {};
        for (const s of states.values()) c[s] = (c[s] || 0) + 1;
        return c;
    }, [states]);

    const searchText = useMemo(() => {
        const m = new Map<string, string>();
        for (const it of all) {
            const t = resolveItemTag(rowOf(it.row));
            m.set(it.id, [it.label, t.barcode, `${t.head}${t.number}`, nameOf(it), it.item.material, shownText(it).title].join(' ').toLowerCase());
        }
        return m;
    }, [all]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return all.filter(it => {
            const s = states.get(it.id)!;
            if (filter === 'review' && s !== 'review' && s !== 'partial') return false;
            if (filter === 'running' && s !== 'running') return false;
            if (filter === 'failed' && s !== 'failed') return false;
            if (filter === 'saved' && s !== 'saved') return false;
            return !q || (searchText.get(it.id) || '').includes(q);
        });
    }, [all, states, filter, query, searchText]);

    // The drawer follows the current item; on a wide screen there is always one.
    const current = (currentId && all.find(i => i.id === currentId)) || (narrow ? undefined : visible[0] || all[0]);
    useEffect(() => { setAngle(0); setView('photo'); }, [current?.id]);

    // Keyboard selection moves focus with it.
    useEffect(() => {
        if (!focusRowRef.current || !current) return;
        focusRowRef.current = false;
        const el = listRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(current.id)}"]`);
        el?.focus();
        el?.scrollIntoView({ block: 'nearest' });
    }, [current?.id]);

    const tickedIds = useMemo(() => all.filter(it => ticked.has(it.id)).map(it => it.id), [all, ticked]);

    /** Default run: every queued item that still lacks a ticked process (grouped by what it lacks). */
    const gapGroups = useMemo(() => {
        const groups = new Map<string, { ids: string[]; processes: ProcessId[] }>();
        for (const it of all) {
            if (states.get(it.id) !== 'queued' || isBusy(it)) continue;
            const miss = missingOf(it, processes, heroOnly);
            if (!miss.length) continue;
            const key = miss.join(',');
            if (!groups.has(key)) groups.set(key, { ids: [], processes: miss });
            groups.get(key)!.ids.push(it.id);
        }
        return [...groups.values()];
    }, [all, states, processes, heroOnly]);

    const runTargets = tickedIds.length
        ? tickedIds.filter(id => { const it = run.get(id); return it && !isBusy(it); })
        : gapGroups.flatMap(g => g.ids);

    const donorIds = useMemo(() => all
        .filter(it => !it.media.some(m => !m.isVideo) && !it.item.existing.title && !isBusy(it))
        .map(it => it.id), [all]);

    const reviewedIds = all.filter(it => it.status === 'done' && it.dirty).map(it => it.id);
    const failedCount = all.filter(it => it.status === 'failed' || it.status === 'partial').length;
    const unsaved = run.counts.unsaved;

    // The old gate, except that an item with no photograph is not asked for
    // a hex map it can never have (it blocked every export it was part of).
    const incomplete = all.filter(it => {
        const ex = it.item.existing;
        const needsHex = it.media.some(m => !m.isVideo);
        return !(ex.title && ex.colors.length && ex.genType && (!needsHex || it.stored.hexMap));
    }).length;
    const exportBlock = run.isRunning ? tr('Wait for the run to finish.')
        : unsaved > 0 ? tr('Save first: the exports read what is saved.')
            : incomplete > 0 ? trf('{n} items still miss a title, colours, hex map or type.', { n: incomplete })
                : all.length === 0 ? tr('Nothing to export.') : '';

    // ── key ──
    const needKey = useCallback((then: () => void) => {
        pendingRef.current = then;
        setOverlayOpen(false);
        setKeyDraft('');
        setShowKey(true);
    }, []);

    useEffect(() => {
        if (run.runError?.code === 'key_missing' && !showKey) {
            setOverlayOpen(false);
            setShowKey(true);
        }
    }, [run.runError, showKey]);

    const saveKey = () => {
        const key = keyDraft.trim();
        if (!key) return;
        setGeminiKey(key);
        run.clearRunError();
        setShowKey(false);
        const then = pendingRef.current;
        pendingRef.current = null;
        then?.();
    };

    // ── run ──
    const report = (ids: readonly string[]) => {
        let review = 0, failed = 0, partial = 0;
        ids.forEach(id => {
            const s = run.get(id)?.status;
            if (s === 'review') review++;
            else if (s === 'partial') partial++;
            else if (s === 'failed') failed++;
        });
        if (!review && !partial && !failed) return;
        const msg = trf('Run finished: {review} to review, {partial} partial, {failed} failed', { review, partial, failed });
        if (failed || partial) toast(msg, { duration: 6000 }); else toast.success(msg);
    };

    /** Launch, and if the key is missing, ask for it and launch again once it is saved. */
    const launch = async (go: () => Promise<{ started: number; error?: { code: string } }[]>, retryAfterKey: () => void, ids: readonly string[]) => {
        const results = await go();
        if (results.some(r => r.error?.code === 'key_missing')) {
            needKey(retryAfterKey);
            return;
        }
        if (results.some(r => r.started > 0)) report(ids);
    };

    const handleRun = () => {
        if (!processes.size) { toast.error(tr('Tick at least one process.')); return; }
        if (tickedIds.length) {
            // Ticked rows: run every ticked process on them, regenerating what is there.
            const ids = runTargets;
            if (!ids.length) { toast(tr('The ticked items are busy.')); return; }
            void launch(() => Promise.all([run.start(ids)]), handleRun, ids);
            return;
        }
        if (!gapGroups.length) { toast(tr('Nothing is missing for the ticked processes. Tick rows to run them again.')); return; }
        const groups = gapGroups;
        void launch(() => Promise.all(groups.map(g => run.start(g.ids, { processes: g.processes }))), handleRun, groups.flatMap(g => g.ids));
    };

    const handleWriteFromSimilar = () => {
        const ids = donorIds;
        if (!ids.length) return;
        void launch(() => Promise.all([run.start(ids, { processes: ['variation_donor', ...TEXT_PROCESSES] })]), handleWriteFromSimilar, ids);
    };

    // The hand-off's run, once: on the first render that has the items (the
    // engine syncs them in an effect, so the very first render has none).
    // The photo items run the ticked processes as Run would; with `donor`,
    // the ones without a photo get Write From Similar.
    useEffect(() => {
        const h = handoffRef.current;
        if (!h || !all.length) return;
        handoffRef.current = null;
        setHandoff(null);
        if (!h.autoRun) return;
        const go = () => {
            const picked = h.processes.filter(p => p !== 'variation_donor');
            if (picked.length && processes.size && gapGroups.length) handleRun();
            if (h.donor && donorIds.length) handleWriteFromSimilar();
        };
        // One key prompt for both launches, not one each.
        if (!hasGeminiKey()) needKey(go); else go();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [all.length]);

    const handleRetryFailed = () => {
        const ids = all.filter(it => it.status === 'failed' || it.status === 'partial').map(it => it.id);
        void launch(() => Promise.all([run.retry('failed')]), handleRetryFailed, ids);
    };

    const retryOne = (id: string, only?: ProcessId[]) => {
        const go = () => { void launch(() => Promise.all([run.retry([id], only ? { processes: only } : undefined)]), go, [id]); };
        go();
    };

    // ── review ──
    const nextToReview = (fromId: string): string | null => {
        const i = visible.findIndex(it => it.id === fromId);
        const after = [...visible.slice(i + 1), ...visible.slice(0, Math.max(0, i))];
        return after.find(it => it.status === 'review' || it.status === 'partial')?.id ?? null;
    };

    const acceptAndAdvance = (id: string, viaKeyboard = false) => {
        run.accept(id);
        const next = nextToReview(id);
        if (next) {
            focusRowRef.current = viaKeyboard;
            setCurrentId(next);
        }
    };

    const onGeneratedChange = (it: RunItem, next: GeneratedValue) => {
        const was = shownText(it);
        const patch: Parameters<typeof run.edit>[1] = {};
        if (next.title !== was.title) patch.title = next.title;
        if (next.html !== was.html) patch.html = next.html;
        if (next.genType !== was.genType) patch.genType = next.genType;
        if (next.colors.join('|') !== was.colors.join('|')) patch.colors = next.colors;
        if (Object.keys(patch).length) run.edit(it.id, patch);
    };

    const summarizeSave = (outcomes: SaveOutcome[]) => {
        const saved = outcomes.filter(o => o.outcome === 'saved').length;
        const bad = outcomes.filter(o => o.outcome === 'failed' || o.outcome === 'incomplete');
        if (outcomes.some(o => o.outcome === 'saved' || o.outcome === 'incomplete')) setInventoryVersion(Date.now());
        if (bad.length) {
            const detail = bad.slice(0, 3).map(o => `${o.label}: ${o.error || o.warnings.join('; ') || tr('uploads failed')}`).join(' · ');
            toast.error(trf('Saved {saved}, not saved {failed}: {detail}', { saved, failed: bad.length, detail }), { duration: 10000 });
        } else if (saved) {
            toast.success(trf('Saved {n} items', { n: saved }));
        } else {
            toast(tr('Nothing new to save'));
        }
        return bad.length === 0;
    };

    const handleSaveReviewed = async () => {
        summarizeSave(await run.save('reviewed'));
    };

    // ── manual cutouts ──
    const openUpload = (itemId: string, index: number) => {
        uploadTarget.current = { itemId, index };
        uploadRef.current?.click();
    };

    const onUploadPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const target = uploadTarget.current;
        e.target.value = '';
        if (!file || !target) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                run.setCutout(target.itemId, target.index, reader.result);
                toast.success(tr('Cutout replaced. Save to keep it.'));
            }
        };
        reader.readAsDataURL(file);
    };

    // ── confirmed actions ──
    const doClear = async (ids: string[]) => {
        setBusyConfirm(true);
        const patch: AiPatch = { columns: CLEAR_COLUMNS, segmentations: [], warnings: [], failedUploads: [] };
        let cleared = 0;
        const failures: string[] = [];
        for (const id of ids) {
            const it = run.get(id);
            if (!it || isBusy(it)) continue;
            if (!it.rowId) { failures.push(`${it.label}: ${tr('no database id')}`); continue; }
            try {
                // The one writer, so the RxDB mirror is updated with the table.
                const saved = await saveAiPatch(it.rowId, patch, { user });
                run.reset(id, saved || undefined);
                cleared++;
            } catch (err) {
                failures.push(`${it.label}: ${aiErrorMessage(err)}`);
            }
        }
        setBusyConfirm(false);
        setConfirm(null);
        if (cleared) setInventoryVersion(Date.now());
        if (failures.length) toast.error(trf('Cleared {n}, failed {f}: {detail}', { n: cleared, f: failures.length, detail: failures.slice(0, 3).join(' · ') }), { duration: 10000 });
        else toast.success(trf('Cleared the AI data of {n} items', { n: cleared }));
    };

    const doReclean = (ids: string[]) => {
        setConfirm(null);
        // Every photo, so hero-only goes off: asking to re-clean everything and
        // then skipping the second photo of every item is the old bug.
        setHeroOnly(false);
        const dirty = ids.filter(id => run.get(id)?.dirty);
        const fresh = ids.filter(id => !run.get(id)?.dirty);
        const go = () => {
            void launch(() => Promise.all([
                // Unsaved results are kept: a retry re-runs only the clean.
                dirty.length ? run.retry(dirty, { processes: ['img_clean'], heroOnly: false }) : Promise.resolve({ started: 0 }),
                fresh.length ? run.start(fresh, { processes: ['img_clean'], heroOnly: false }) : Promise.resolve({ started: 0 }),
            ]), go, ids);
        };
        go();
    };

    /**
     * Saves the ACCEPTED items only, the same gate as "Save N reviewed":
     * closing must not be a way to store AI copy and images nobody looked at.
     * The dialog says how many unreviewed items closing then discards.
     */
    const doCloseSaving = async () => {
        setBusyConfirm(true);
        const ok = summarizeSave(await run.save('reviewed'));
        setBusyConfirm(false);
        if (ok) onClose(); else setConfirm(null);
    };

    const handleClose = () => {
        if (run.isRunning || unsaved > 0) setConfirm({ kind: 'close' });
        else onClose();
    };

    // ── exports ──
    const handleXlsx = async () => {
        if (exportBlock) { toast.error(exportBlock); return; }
        setMakingXlsx(true);
        const toastId = toast.loading(tr('Generating Shopify XLSX...'));
        try {
            const { exportDataList } = buildExportContext(all);
            const url = URL.createObjectURL(await buildXlsx(exportDataList));
            urlsRef.current.push(url);
            setXlsxUrl(url);
            toast.success(tr('XLSX generated! Click Download XLSX to save.'), { id: toastId });
        } catch (e: any) {
            toast.error(`${tr('XLSX generation failed')}: ${e?.message || e}`, { id: toastId });
            console.error(e);
        } finally { setMakingXlsx(false); }
    };

    const handlePdf = async () => {
        if (exportBlock) { toast.error(exportBlock); return; }
        setMakingPdf(true);
        const toastId = toast.loading(tr('Generating Catalog PDF...'));
        try {
            const { catalogResults } = buildExportContext(all);
            const dateStr = new Date().toISOString().split('T')[0];
            const blob = await exportCatalogPdf(catalogResults, {
                title: `AI Generated Catalog ${dateStr}`,
                method: 'grid',
                logo: pdfBrand,
                exportType: 'catalog',
            }, () => {}, 'blob');
            if (blob instanceof Blob) {
                const url = URL.createObjectURL(blob);
                urlsRef.current.push(url);
                setPdfUrl(url);
                toast.success(tr('PDF generated! Click Download PDF to save.'), { id: toastId });
            }
        } catch (e: any) {
            toast.error(`${tr('PDF generation failed')}: ${e?.message || e}`, { id: toastId });
            console.error(e);
        } finally { setMakingPdf(false); }
    };

    // An export made before more work was saved is stale.
    useEffect(() => { setXlsxUrl(null); setPdfUrl(null); }, [run.state.items]);

    // ── header facts ──
    const facts = useMemo(() => {
        const vendorsSeen = Array.from(new Set(all.map(it => (it.item.vendorId || it.item.itemId).split('-')[0]).filter(Boolean)));
        const books = Array.from(new Set(all.map(it => it.item.workbook).filter(Boolean)));
        return [
            trf('{n} items', { n: all.length }),
            vendorsSeen.slice(0, 3).join(' · ') + (vendorsSeen.length > 3 ? ' …' : ''),
            books.slice(0, 2).map(b => `v${String(b).replace(/^v/i, '')}`).join(' · ') + (books.length > 2 ? ' …' : ''),
        ].filter(Boolean).join(' · ');
    }, [all]);

    // ── row ──
    const stepsFor = (it: RunItem) => {
        // The ticked processes plus whatever the item last ran with; the donor
        // pass only when it was part of that run.
        const ids = PROCESS_ORDER.filter(p => (p === 'variation_donor' ? false : processes.has(p)) || it.selected.includes(p));
        return ids.map(p => ({
            id: p,
            state: it.processStatus[p] ?? storedState(it, p, heroOnly),
            detail: it.processErrors[p] || (it.processStatus[p] ? undefined : storedState(it, p, heroOnly) === 'done' ? tr('stored') : undefined),
        }));
    };

    const pillLabel = (s: DisplayState) => (s === 'done' ? tr('Accepted') : undefined);

    const rowThumbs = (it: RunItem) => {
        const stills = stillsOf(it);
        if (!stills.length) {
            const axo = disp(it.axoIconUrl ?? it.stored.axoIconUrl);
            return axo ? <Thumb src={axo} kind="axo" badge="AXO" alt={tr('Axo icon')} /> : <span className="hub-nophoto">{tr('No photo')}</span>;
        }
        const hero = outputsOf(stills[0]);
        const cells: React.ReactNode[] = [<Thumb key="p0" src={hero.photo} alt={tr('Photo 1')} />];
        const png = hero.cutout || hero.png;
        if (png) cells.push(<Thumb key="png" src={png} kind={hero.cutout ? 'cutout' : 'png'} badge="PNG" title={tr('Clean PNG')} alt={tr('Clean PNG')} />);
        if (hero.mask) cells.push(<Thumb key="mask" src={hero.mask} kind="mask" badge="MASK" title={tr('Mask')} alt={tr('Mask')} />);
        for (let i = 1; i < stills.length && cells.length < 3; i++) {
            const more = stills.length - i - 1;
            cells.push(<Thumb key={`p${i}`} src={outputsOf(stills[i]).photo} alt={`${tr('Photo')} ${i + 1}`} badge={cells.length === 2 && more > 0 ? `+${more}` : undefined} />);
        }
        return cells;
    };

    // ── drawer ──
    const drawerBody = (it: RunItem) => {
        const stills = stillsOf(it);
        const outs = stills.map(outputsOf);
        const axo = disp(it.axoIconUrl ?? it.stored.axoIconUrl) || null;
        const angles: MediaAngle[] = stills.length
            ? stills.map((p, i) => ({
                photo: outs[i].photo,
                png: outs[i].png || null,
                cutout: outs[i].cutout || null,
                mask: outs[i].mask || null,
                svg: outs[i].svg || null,
                meta: {
                    png: { opaque: outs[i].opaque, source: p.cleanedUrl ? tr('this run') : outs[i].png ? tr('stored') : undefined },
                    cutout: { width: p.width, height: p.height },
                    mask: { width: p.width, height: p.height, note: p.layerCount ? trf('{n} layers', { n: p.layerCount }) : undefined },
                },
            }))
            : [{ photo: '' }];
        const views: MediaView[] = ['photo', 'png', ...(outs.some(o => o.cutout) ? ['cutout' as const] : []), 'mask', 'svg', 'axo'];
        const photoIndex = Math.min(angle, Math.max(0, stills.length - 1));
        const shownPhoto = stills[photoIndex];
        const text = shownText(it);
        const issues = text.title || text.html
            ? validateCopy(text.title, text.html, {
                color: it.item.vendorColor, material: it.item.material,
                widthCm: it.item.widthCm, heightCm: it.item.heightCm, lengthCm: it.item.lengthCm,
                quantity: it.item.quantity || 1,
            })
            : [];
        const hex = it.hexMap ?? it.stored.hexMap;
        const clips = clipsOf(it);
        const busy = isBusy(it);
        const logs = it.logs.slice(-40);

        return (
            <>
                <MediaViewer
                    key={it.id}
                    angles={angles}
                    shared={{ axo }}
                    views={views}
                    angle={photoIndex}
                    onAngleChange={setAngle}
                    view={view}
                    onViewChange={setView}
                    alt={`${it.label} ${nameOf(it)}`}
                />
                {shownPhoto && (
                    <div className="hub-acts">
                        <Key size="sm" variant="quiet" icon={<Crop size={13} />} disabled={busy}
                            title={tr('1:1 square crop of this photo; the result becomes its cutout')}
                            onClick={() => {
                                const o = outs[photoIndex];
                                setOverlayOpen(false);
                                setCrop({ itemId: it.id, index: shownPhoto.index, src: o.cutout || o.png || o.photo });
                            }}>
                            {tr('Crop 1:1')}
                        </Key>
                        <Key size="sm" variant="quiet" icon={<Upload size={13} />} disabled={busy}
                            title={tr('Replace this photo’s cutout with a PNG or JPEG from disk')}
                            onClick={() => openUpload(it.id, shownPhoto.index)}>
                            {tr('Upload cutout')}
                        </Key>
                    </div>
                )}

                <GeneratedContent
                    value={text}
                    onChange={busy ? undefined : (next) => onGeneratedChange(it, next)}
                    issues={issues}
                />

                {hex && (
                    <Field group label={tr('Hex map')} aside={`${hex.cols}×${hex.rows}`}>
                        <div className="hub-hex">
                            {hex.bitmapUrl && <img src={disp(hex.bitmapUrl)} alt={tr('Hex colour map')} />}
                            <Key size="sm" variant="quiet" icon={<Copy size={12} />}
                                onClick={() => { void navigator.clipboard.writeText(hex.hexString); toast.success(tr('Hexadecimal pixel map copied to clipboard!')); }}>
                                {tr('Copy map')}
                            </Key>
                        </div>
                    </Field>
                )}

                {clips.length > 0 && (
                    <Field group label={tr('AI generated video')} aside={clips.length > 1 ? trf('{n} clips', { n: clips.length }) : undefined}>
                        <div className="hub-clips">
                            {clips.map((url, i) => (
                                <video key={url} src={url} controls muted loop playsInline preload="metadata" aria-label={`${tr('Clip')} ${i + 1}`} />
                            ))}
                        </div>
                    </Field>
                )}

                {it.stage && <p className="hub-stage ui-tnum">{it.stage} · {Math.round(it.progress)}%</p>}

                <Field group label={tr('Log')}>
                    {logs.length
                        ? <ul className="ui-log hub-log" role="log" aria-live="polite">
                            {logs.map((line, i) => {
                                const tone = LOG_TONE(line);
                                return <li key={i}>{tone ? <span className={tone}>{line}</span> : line}</li>;
                            })}
                        </ul>
                        : <p className="ui-log">{tr('Not run in this session yet.')}</p>}
                </Field>
            </>
        );
    };

    const drawerFooter = (it: RunItem) => {
        const busy = isBusy(it);
        const s = it.status;
        return (
            <>
                {it.status === 'running'
                    ? <Key size="sm" variant="stop" icon={<XCircle size={13} />} onClick={() => run.cancel(it.id)}>{tr('Cancel')}</Key>
                    : <Key size="sm" variant="go" icon={<Check size={13} />} disabled={!canAccept(it)}
                        title={tr('Mark reviewed (Enter in the list)')}
                        onClick={() => acceptAndAdvance(it.id)}>{tr('Accept')}</Key>}
                <Key size="sm" icon={<RefreshCw size={13} />} disabled={busy}
                    title={tr('Write the title again; your edit to it is dropped')}
                    onClick={() => { run.edit(it.id, { title: null }); retryOne(it.id, ['title_desc']); }}>
                    {tr('Title')}
                </Key>
                <Key size="sm" icon={<Wand2 size={13} />} disabled={busy || !it.media.some(m => !m.isVideo)}
                    title={tr('Clean this item’s photos again with the selected engine')}
                    onClick={() => retryOne(it.id, ['img_clean'])}>
                    {tr('Clean image')}
                </Key>
                {(s === 'failed' || s === 'partial') && (
                    <Key size="sm" icon={<RotateCcw size={13} />} disabled={busy} onClick={() => retryOne(it.id)}>{tr('Retry')}</Key>
                )}
                <Key size="sm" variant="quiet" icon={<Save size={13} />} disabled={busy || !it.dirty}
                    title={tr('Save this item now')}
                    onClick={async () => { summarizeSave(await run.save([it.id])); }}>
                    {tr('Save')}
                </Key>
                {(s === 'review' || s === 'partial' || s === 'done' || s === 'failed') && (
                    <Key size="sm" variant="quiet" icon={<X size={13} />} disabled={busy}
                        title={tr('Discard what this session generated and typed for this item')}
                        onClick={() => run.reject(it.id)}>
                        {tr('Discard')}
                    </Key>
                )}
            </>
        );
    };

    const drawer = current && (
        <Drawer
            variant={narrow ? 'overlay' : 'inline'}
            open={narrow ? overlayOpen : true}
            onClose={narrow ? () => setOverlayOpen(false) : undefined}
            label={`${tr('Item review')}: ${current.label}`}
            title={
                <>
                    <ItemTag item={rowOf(current.row)} size="lg" />
                    <StatusPill state={states.get(current.id) || current.status} label={pillLabel(states.get(current.id) || current.status)} />
                </>
            }
            footer={drawerFooter(current)}
            className="hub-drawer"
        >
            <p className="hub-name">{nameOf(current)}{sizeOf(current) ? ` · ${sizeOf(current)}` : ''}</p>
            {drawerBody(current)}
        </Drawer>
    );

    const filterTabs = [
        { id: 'all' as const, label: tr('All'), count: all.length },
        { id: 'review' as const, label: tr('Needs review'), count: (counts.review || 0) + (counts.partial || 0) },
        { id: 'running' as const, label: tr('Running'), count: counts.running || 0 },
        { id: 'failed' as const, label: tr('Failed'), count: counts.failed || 0 },
        { id: 'saved' as const, label: tr('Saved'), count: counts.saved || 0 },
    ];

    const allShownTicked = visible.length > 0 && visible.every(it => ticked.has(it.id));
    const actTargets = tickedIds.length ? tickedIds : all.map(it => it.id);

    const confirmDialog = confirm && (() => {
        if (confirm.kind === 'close') {
            return (
                <Dialog title={run.isRunning ? tr('A run is in progress') : tr('Unsaved results')} onCancel={() => setConfirm(null)}
                    actions={<>
                        <Key data-autofocus onClick={() => setConfirm(null)}>{tr('Keep reviewing')}</Key>
                        {!run.isRunning && reviewedIds.length > 0 && (
                            <Key variant="go" icon={<Save size={14} />} busy={busyConfirm} onClick={doCloseSaving}>
                                {trf('Save {n} reviewed and close', { n: reviewedIds.length })}
                            </Key>
                        )}
                        <Key variant="danger" disabled={busyConfirm} onClick={onClose}>
                            {run.isRunning ? tr('Stop and close') : tr('Discard and close')}
                        </Key>
                    </>}>
                    <p>{run.isRunning
                        ? tr('Closing stops the run; requests in flight are cancelled.')
                        : trf('{n} items have results or edits that are not saved. Closing discards them.', { n: unsaved })}</p>
                    {!run.isRunning && reviewedIds.length > 0 && unsaved > reviewedIds.length && (
                        <p>{trf('Only the {r} accepted items are saved; the other {n} have not been reviewed and are discarded.', { r: reviewedIds.length, n: unsaved - reviewedIds.length })}</p>
                    )}
                </Dialog>
            );
        }
        if (confirm.kind === 'clear') {
            return (
                <Dialog title={trf('Clear the AI data of {n} items?', { n: confirm.ids.length })} onCancel={() => setConfirm(null)}
                    actions={<>
                        <Key data-autofocus disabled={busyConfirm} onClick={() => setConfirm(null)}>{tr('Cancel')}</Key>
                        <Key variant="danger" icon={<Eraser size={14} />} busy={busyConfirm} onClick={() => void doClear(confirm.ids)}>
                            {trf('Clear {n} items', { n: confirm.ids.length })}
                        </Key>
                    </>}>
                    <p>{tr('This empties, in the database: the AI title, the HTML description, the AI colours and type, the hex map, the masks and cutouts, the clean PNG and SVG, the cleaned photos and the axo icon. The vendor’s description, Type and colour are not touched. It cannot be undone.')}</p>
                </Dialog>
            );
        }
        const photos = confirm.ids.reduce((n, id) => n + (run.get(id)?.media.filter(m => !m.isVideo).length || 0), 0);
        return (
            <Dialog title={tr('Re-clean every photo?')} onCancel={() => setConfirm(null)}
                actions={<>
                    <Key data-autofocus onClick={() => setConfirm(null)}>{tr('Cancel')}</Key>
                    <Key variant="go" icon={<Wand2 size={14} />} onClick={() => doReclean(confirm.ids)}>
                        {trf('Re-clean {n} photos', { n: photos })}
                    </Key>
                </>}>
                <p>{trf('A new background clean on all {photos} photos of {items} items with the {engine} engine, including photos that already have one. Hero-only is switched off.', {
                    photos, items: confirm.ids.length,
                    engine: tr(MODE_OPTIONS.find(o => o.value === mode)?.label || mode)
                        + (mode === 'bgreplace' ? ` · ${tr(ROOM_OPTIONS.find(o => o.value === room)?.label || room)}` : ''),
                })}</p>
            </Dialog>
        );
    })();

    return createPortal(
        <div id="batchproc">
            <div className="ui-root hub">
                {/* ── Top bar: what runs and how ── */}
                <header className="ui-bar hub-bar">
                    <div className="hub-brand">
                        <span className="hub-logo" aria-hidden="true"><Bot size={15} /></span>
                        <div>
                            <h2 className="hub-brand__name">{tr('Catalog Hub')}</h2>
                            <small className="hub-brand__facts ui-tnum">{facts}</small>
                        </div>
                    </div>
                    <ProcessChips value={processes} onChange={setProcesses} disabled={run.isRunning} />
                    {/* One group, so when the bar wraps the run controls move
                        down together instead of leaving Run alone on a line. */}
                    <div className="hub-bar__end">
                        <Segmented<ProcessingMode>
                            label={tr('Cleaning engine')}
                            size="sm"
                            value={mode}
                            onChange={setMode}
                            options={MODE_OPTIONS.map(o => ({ value: o.value, label: tr(o.label), title: tr(o.title) }))}
                        />
                        {mode === 'bgreplace' && (
                            <Segmented<BgRoom>
                                label={tr('Studio room')}
                                size="sm"
                                value={room}
                                onChange={setRoom}
                                disabled={run.isRunning}
                                options={ROOM_OPTIONS.map(o => ({ value: o.value, label: tr(o.label), title: tr(o.title) }))}
                            />
                        )}
                        <Chip pressed={heroOnly} onPressedChange={setHeroOnly}
                            title={tr('All photos per item, or only the first. Hero-only is cheaper (roughly half the images) but leaves the rest uncleaned.')}>
                            {tr('Hero photo only')}
                        </Chip>
                        <Key variant="stop" icon={<Square size={12} />} disabled={!run.isRunning} onClick={run.stop}>{tr('Stop')}</Key>
                        <Key variant="go" icon={<Play size={13} />} busy={run.isRunning && runTargets.length === 0} disabled={runTargets.length === 0}
                            title={tickedIds.length
                                ? tr('Run every ticked process on the ticked items, replacing what they have')
                                : tr('Run the ticked processes that are still missing; tick rows to run them again')}
                            onClick={handleRun}>
                            {trf('Run {n}', { n: runTargets.length })}
                        </Key>
                        <Key iconOnly variant="quiet" icon={<KeyRound size={15} />} label={tr('Gemini API key')}
                            onClick={() => { pendingRef.current = null; setKeyDraft(''); setShowKey(true); }} />
                        <Key iconOnly variant="quiet" className="hub-close" icon={<X size={16} />} label={tr('Close')} onClick={handleClose} />
                    </div>
                </header>

                {/* ── Filters, search and the batch tools ── */}
                <FilterTabs<FilterId>
                    label={tr('Filter items')}
                    tabs={filterTabs}
                    value={filter}
                    onChange={setFilter}
                    controls="hub-list"
                    end={
                        <div className="hub-tools">
                            <Key size="sm" variant="quiet" icon={<Check size={12} />}
                                onClick={() => setTicked(allShownTicked ? new Set() : new Set(visible.map(it => it.id)))}>
                                {allShownTicked ? tr('Untick all') : tickedIds.length ? trf('{n} ticked', { n: tickedIds.length }) : tr('Tick shown')}
                            </Key>
                            {donorIds.length > 0 && (
                                <Key size="sm" icon={<Sparkles size={12} />} disabled={run.isRunning}
                                    title={tr('These items have no photograph. Their description, colours and type are written by varying the most similar item that does; no image is generated.')}
                                    onClick={handleWriteFromSimilar}>
                                    {trf('Write from similar ({n})', { n: donorIds.length })}
                                </Key>
                            )}
                            <Key size="sm" variant="quiet" icon={<ImageUp size={12} />} disabled={run.isRunning}
                                onClick={() => {
                                    const ids = actTargets.filter(id => run.get(id)?.media.some(m => !m.isVideo));
                                    if (!ids.length) { toast.error(tr('No photos to re-clean.')); return; }
                                    setConfirm({ kind: 'reclean', ids });
                                }}>
                                {tickedIds.length ? tr('Re-clean ticked') : tr('Re-clean all')}
                            </Key>
                            <Key size="sm" variant="quiet" icon={<Eraser size={12} />} disabled={run.isRunning}
                                onClick={() => setConfirm({ kind: 'clear', ids: actTargets })}>
                                {tickedIds.length ? tr('Clear AI data (ticked)') : tr('Clear AI data')}
                            </Key>
                            <label className="hub-search">
                                <Search size={13} aria-hidden="true" />
                                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                                    placeholder={tr('Search EM-021, mirror…')} aria-label={tr('Search items')} />
                            </label>
                        </div>
                    }
                />

                {/* ── Rows and the review drawer ── */}
                <div className={cx('hub-body', narrow && 'hub-body--narrow')}>
                    <div className="hub-listwrap" ref={listRef}>
                        <ItemList
                            id="hub-list"
                            label={tr('Items')}
                            columns={ROW_COLUMNS}
                            multiselectable
                            fold
                            header={['', tr('Item'), tr('Photos · output'), tr('Generated title'), tr('Steps'), tr('State')]}
                            empty={all.length ? tr('No item matches this filter.') : tr('No items selected.')}
                            className="hub-list"
                        >
                            {visible.map(it => {
                                const s = states.get(it.id)!;
                                const text = shownText(it);
                                return (
                                    <ItemRow
                                        key={it.id}
                                        data-item-id={it.id}
                                        current={current?.id === it.id}
                                        selected={ticked.has(it.id)}
                                        label={`${it.label} ${nameOf(it)}, ${pillLabel(s) ?? itemStateLabel(s)}${text.title ? `, ${text.title}` : ''}`}
                                        onToggle={(next) => setTicked(prev => {
                                            const n = new Set(prev);
                                            if (next) n.add(it.id); else n.delete(it.id);
                                            return n;
                                        })}
                                        onFocus={() => { if (currentId !== it.id) setCurrentId(it.id); }}
                                        onOpen={() => { setCurrentId(it.id); if (narrow) setOverlayOpen(true); }}
                                        onKeyDown={(e) => {
                                            // Wide: the drawer beside the list already shows the
                                            // item, so Enter accepts it. Narrow: the drawer is an
                                            // overlay, and Enter must open it -- accepting
                                            // something the person never saw would skip review.
                                            if (!narrow && e.key === 'Enter' && e.target === e.currentTarget && canAccept(it)) {
                                                e.preventDefault();
                                                acceptAndAdvance(it.id, true);
                                            }
                                        }}
                                    >
                                        <div className="ui-row__main">
                                            <ItemTag item={rowOf(it.row)} />
                                            <span className="ui-row__sub">{nameOf(it)}</span>
                                        </div>
                                        <div className="ui-thumbs">{rowThumbs(it)}</div>
                                        <div className="ui-row__main">
                                            <span className={cx('ui-row__title', !text.title && 'hub-untitled')}>{text.title || tr('No title yet')}</span>
                                            <span className="ui-row__sub ui-tnum">{sizeOf(it)}</span>
                                        </div>
                                        <StepsStrip steps={stepsFor(it)} />
                                        <StatusPill state={s} label={pillLabel(s)} />
                                    </ItemRow>
                                );
                            })}
                        </ItemList>
                    </div>
                    {drawer}
                </div>

                {/* ── Run bar: progress, retry, save, exports ── */}
                <RunBar
                    counts={counts}
                    total={all.length}
                    note={run.isRunning ? [etaLabel(run.etaMs), `${run.progress}%`].filter(Boolean).join(' · ') : undefined}
                    actions={<>
                        <Key size="sm" variant="quiet" icon={<RotateCcw size={12} />} disabled={!failedCount || run.isRunning}
                            onClick={handleRetryFailed}>
                            {trf('Retry {n} failed', { n: failedCount })}
                        </Key>
                        <Key size="sm" variant="go" icon={<Save size={12} />} busy={run.isSaving} disabled={!reviewedIds.length}
                            title={tr('Write every accepted item: only what was ticked and worked, plus your edits')}
                            onClick={handleSaveReviewed}>
                            {trf('Save {n} reviewed', { n: reviewedIds.length })}
                        </Key>
                        <span className="hub-sep" aria-hidden="true" />
                        <Select className="hub-brand-select" aria-label={tr('PDF brand')} value={pdfBrand}
                            onChange={(e) => { setPdfBrand(e.target.value as 'ArtOfDecor' | 'RareEarth'); setPdfUrl(null); }}
                            options={[{ value: 'ArtOfDecor', label: tr('Art of Decor') }, { value: 'RareEarth', label: tr('Rare Earth Gallery') }]} />
                        {xlsxUrl
                            ? <a className="ui-key ui-key--sm" href={xlsxUrl} download={`Shopify_Export_AI_${new Date().toISOString().split('T')[0]}.xlsx`}>
                                <FileSpreadsheet size={12} aria-hidden="true" />{tr('Download XLSX')}
                            </a>
                            : <Key size="sm" icon={<FileSpreadsheet size={12} />} busy={makingXlsx} disabled={!!exportBlock}
                                title={exportBlock || tr('Matrixify sheet of the saved items')} onClick={handleXlsx}>
                                {tr('Generate XLSX')}
                            </Key>}
                        {pdfUrl
                            ? <a className="ui-key ui-key--sm" href={pdfUrl} download={`Catalog_AI_${new Date().toISOString().split('T')[0]}.pdf`}>
                                <FileText size={12} aria-hidden="true" />{tr('Download PDF')}
                            </a>
                            : <Key size="sm" icon={<FileText size={12} />} busy={makingPdf} disabled={!!exportBlock}
                                title={exportBlock || tr('Catalogue PDF of the saved items')} onClick={handlePdf}>
                                {tr('Generate PDF')}
                            </Key>}
                    </>}
                />

                {confirmDialog}

                {showKey && (
                    <Dialog title={tr('Gemini API key')} onCancel={() => { setShowKey(false); pendingRef.current = null; run.clearRunError(); }}
                        actions={<>
                            <Key onClick={() => { setShowKey(false); pendingRef.current = null; run.clearRunError(); }}>{tr('Cancel')}</Key>
                            <Key variant="go" disabled={!keyDraft.trim()} onClick={saveKey}>
                                {pendingRef.current ? tr('Save & Start') : tr('Save')}
                            </Key>
                        </>}>
                        <p>{hasGeminiKey()
                            ? tr('A key is stored on this device. Enter a new one to replace it.')
                            : tr('Please enter your Gemini API Key. It will be stored securely in your local device storage.')}</p>
                        <Field label={tr('API key')}>
                            <Input type="password" mono autoComplete="off" value={keyDraft} placeholder={tr('AIzaSy...')}
                                onChange={(e) => setKeyDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveKey(); } }} />
                        </Field>
                    </Dialog>
                )}

                <input ref={uploadRef} type="file" accept="image/png,image/jpeg" hidden onChange={onUploadPicked} />
            </div>

            {/* Outside .ui-root on purpose: the crop tool is a legacy component
                and keeps the legacy element styling the kit is exempt from. */}
            <SquareCropModal
                isOpen={!!crop}
                imageSrc={crop?.src || ''}
                onClose={() => setCrop(null)}
                onCropComplete={(croppedUrl) => {
                    if (!crop) return;
                    run.setCutout(crop.itemId, crop.index, croppedUrl);
                    toast.success(tr('1:1 Square crop applied!'));
                }}
            />
        </div>,
        document.body,
    );
}
