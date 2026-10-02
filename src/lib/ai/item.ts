/**
 * One adapter from whatever a screen holds to the shape the prompts read.
 *
 * The pipeline used to read `op.item.data || op.item` and then guess field
 * names: `shortDescription || type`, `quantity || qty || '41'`. A Batch Create
 * row (itemType, description) and an inventory row (short_description,
 * detailed_description) answered those guesses differently, which is how the
 * Batch Create prompt came to say "FIND the Onyx Artifact Object" for every
 * row, and how the vendor's one-word `description` ended up being treated as
 * an existing AI title and saved into detailed_description.
 *
 * Prompts and finalize.ts read only PipelineItem. The canonical column map is
 * applied here once: `description` is vendor text, `short_description` is the
 * manual Type, `color` is the vendor colour, and only detailed_description /
 * generated_description / generated_color / generated_type are AI output.
 */
import type { BatchCreateItem } from '../atoms';
import { normalizeInventoryData, collectAllImages } from '../utils';

export interface PipelineItem {
    /** Inventory uuid, when the row exists. */
    id?: string;
    itemId: string;
    vendorId: string;
    workbook: string;
    itemNumber: string;
    shape: string;
    /** The manual Type (short_description / Batch Create itemType). */
    type: string;
    material: string;
    /** The vendor's colour (`color`). Never AI output. */
    vendorColor: string;
    /** The vendor's text (`description`): '' or a short word. Never an AI title. */
    vendorText: string;
    widthCm: number;
    heightCm: number;
    lengthCm: number;
    weightKg: number;
    /** 0 when unknown -- never a guessed default. */
    quantity: number;
    priceMxn: number;
    /** What the AI processes already wrote to this row. */
    existing: {
        title: string;
        html: string;
        colors: string[];
        genType: string;
    };
    mediaUrls: string[];
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
};

const colorList = (v: unknown): string[] =>
    (Array.isArray(v) ? v : String(v ?? '').split(','))
        .map(c => String(c).trim())
        .filter(Boolean);

const isBatchCreateItem = (src: any): src is BatchCreateItem =>
    !!src && typeof src === 'object' && 'itemType' in src && Array.isArray(src.mediaFiles);

/**
 * Accepts an inventory row (raw snake_case or normalized), the InventoryItem
 * wrapper the wizards hold ({ id, data }), a BatchCreateItem, or the entry
 * form state.
 */
export function toPipelineItem(source: any): PipelineItem {
    if (isBatchCreateItem(source)) {
        return {
            itemId: '',
            vendorId: '',
            workbook: '',
            itemNumber: str(source.itemNumber),
            shape: str(source.shape),
            type: str(source.itemType),
            material: str(source.material),
            vendorColor: str(source.color),
            vendorText: str(source.description),
            widthCm: num(source.widthCm),
            heightCm: num(source.heightCm),
            lengthCm: num(source.lengthCm),
            weightKg: num(source.weightKg),
            quantity: num(source.quantity),
            priceMxn: num(source.price),
            existing: { title: '', html: '', colors: [], genType: '' },
            // Local previews until the photos are uploaded; the pipeline is
            // handed the uploaded URL per op, not these.
            mediaUrls: (source.mediaFiles || []).map(f => str(f?.localUrl || f?.dataUrl)).filter(Boolean),
        };
    }

    const raw = source?.data && typeof source.data === 'object' ? source.data : (source || {});
    const n = normalizeInventoryData(raw);
    const id = str(raw.id ?? source?.id);

    let mediaUrls: string[] = [];
    try { mediaUrls = collectAllImages(n); } catch { mediaUrls = []; }

    return {
        id: id || undefined,
        itemId: str(n.itemId),
        vendorId: str(n.vendorId),
        workbook: str(n.workbook),
        itemNumber: str(n.itemNumber),
        shape: str(n.shape),
        // Entry form state calls the manual Type `type`/`itemType`.
        type: str(n.shortDescription || raw.itemType || raw.type),
        material: str(n.material),
        vendorColor: str(n.color),
        vendorText: str(n.description),
        widthCm: num(n.widthCm),
        heightCm: num(n.heightCm),
        lengthCm: num(n.lengthCm),
        weightKg: num(n.weightKg),
        // normalizeInventoryData defaults a missing quantity to 1, which is a
        // fair default for a row but the number the box-set copy quotes, so
        // read the raw value and let 0 mean "not recorded".
        quantity: num(raw.quantity ?? raw.qty),
        priceMxn: num(raw.price_mxn ?? raw.priceMxn ?? n.price),
        existing: {
            // Only the AI column. `description` is vendor text even when it is
            // the only text the row has.
            title: str(n.detailedDescription),
            html: str(n.generatedDescription || n.marketingDescription || n.marketing_description),
            colors: colorList(n.generatedColor),
            genType: str(n.generatedType),
        },
        mediaUrls,
    };
}

/**
 * True when the text is just the vendor's word coming back, which is what
 * the Catalog Hub queue seeded result.description with whenever the row had
 * no AI title. Comparing case- and space-insensitively catches 'BOWL' vs
 * 'Bowl' vs formatProductTitle('bowl').
 */
export function isVendorEcho(text: string | undefined | null, item: PipelineItem): boolean {
    const a = str(text).toLowerCase().replace(/\s+/g, ' ');
    const b = item.vendorText.toLowerCase().replace(/\s+/g, ' ');
    return !!a && !!b && a === b;
}

/**
 * A real multi-piece cylinder set: more than one piece AND cylinder/cilindro
 * in the shape or the Type. The old test matched "pendant" and "colgante" in
 * shape, type, vendor text and title, so every single hanging luminary got
 * the "this box set contains N pieces" copy.
 */
export function isCylinderBoxSet(item: PipelineItem): boolean {
    return item.quantity > 1 && /cylinder|cilindro/i.test(`${item.shape} ${item.type}`);
}

/** "w x h x l" in cm, only the dimensions that are recorded. */
export function sizeLabel(item: Pick<PipelineItem, 'widthCm' | 'heightCm' | 'lengthCm'>): string {
    return [item.widthCm, item.heightCm, item.lengthCm].filter(v => v > 0).join(' x ');
}
