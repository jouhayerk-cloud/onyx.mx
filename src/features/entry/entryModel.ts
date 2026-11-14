/**
 * The entry form's state, the one field schema Add Entry and Edit Entry share.
 *
 * Create Item, the Add/Edit wizard and Batch Create each kept their own
 * field names (itemType / type / short_description, W-L-H / W-H-D, ACQ MXN /
 * price / Cost) and their own idea of which fields exist: Create Item had no
 * status, weight or note, the wizard had no way to show the AI columns. Here
 * there is one state, read from a stored row by entryFromRow and turned into
 * columns by lib/inventoryCreate's buildInventoryRow.
 */
import { vendors } from '../../lib/consts';
import { getCleanImageUrl, isVideoFile } from '../../lib/utils';
import {
    DEFAULT_ENTRY_STATUS,
    normalizeWorkbook,
    type InventoryForm,
} from '../../lib/inventoryCreate';

export interface EntryPhoto {
    /** Stable React key. */
    key: string;
    /** A picked file not uploaded yet. */
    file?: File;
    /** What an <img> shows: a data: URL for a picked file, the cleaned URL for a stored one. */
    preview: string;
    /**
     * The value that goes into media_urls: the upload result, or the stored
     * entry exactly as stored (its &tag= suffix included).
     */
    url?: string;
    isVideo: boolean;
}

export interface EntryState {
    vendorId: string;
    workbook: string;
    itemNumber: string;
    quantity: string;
    status: string;
    shape: string;
    type: string;
    color: string;
    material: string;
    widthCm: string;
    heightCm: string;
    lengthCm: string;
    weightKg: string;
    price: string;
    description: string;
    top?: 'open' | 'closed' | '';
    topSuggested?: boolean;
}

/** The typed fields; photos are kept beside them (they hold File objects). */
export const EMPTY_ENTRY: EntryState = {
    vendorId: '',
    workbook: 'v826',
    itemNumber: '',
    quantity: '1',
    status: DEFAULT_ENTRY_STATUS,
    shape: '',
    type: '',
    color: '',
    material: '',
    widthCm: '',
    heightCm: '',
    lengthCm: '',
    weightKg: '',
    price: '',
    description: '',
    top: '',
    topSuggested: false,
};

/**
 * Codes in `vendors` that are not vendors: the admins (Ramses, Martha, Wayne,
 * Chad) and the logistics suppliers (Simona, Juan). They stay in `vendors` so
 * existing items keep their tag colour; they are not offered for new entries.
 * An item already stored under one of them still shows it when edited
 * (EntryForm adds the current code to the keys).
 */
export const NON_VENDOR_CODES: ReadonlySet<string> = new Set(['R', 'M', 'W', 'C', 'SIMONA', 'JUAN']);

/** Vendors offered for a new entry (owner's list: every vendor except the codes above). */
export const VENDOR_CODES: readonly string[] = Object.keys(vendors).filter(c => !NON_VENDOR_CODES.has(c)).sort();

/** Display name for a vendor code, or the code itself when the vendor is not in the vendors list. */
export const vendorName = (code: string): string =>
    (vendors as Record<string, { name: string }>)[code]?.name ?? code;

export const isKnownVendor = (code: string | null | undefined): boolean =>
    !!code && Object.prototype.hasOwnProperty.call(vendors, code);

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

let photoSeq = 0;
export const photoKey = () => `ph-${Date.now().toString(36)}-${(photoSeq++).toString(36)}`;

/**
 * The stored media as photos, exactly as stored: media_urls split, nothing
 * cleaned, nothing added. collectAllImages (what the wizard used) cleans every
 * URL and pulls in the legacy image fields and the AI-generated clips, and the
 * wizard then wrote all of that back as media_urls on every save. Legacy
 * image_url / item_image are shown only when media_urls is empty.
 */
export function photosFromRow(row: Record<string, any> | null | undefined): EntryPhoto[] {
    if (!row) return [];
    const split = (v: unknown) => String(v ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
    let raw = split(row.media_urls ?? row.mediaUrls);
    if (!raw.length) raw = [...split(row.image_url ?? row.imageUrl), ...split(row.item_image ?? row.itemImage)];
    const seen = new Set<string>();
    return raw.filter(u => (seen.has(u) ? false : (seen.add(u), true))).map(u => ({
        key: photoKey(),
        url: u,
        preview: getCleanImageUrl(u) || u,
        isVideo: isVideoFile(u),
    }));
}

/** A stored row (raw or normalized) as form state. */
export function entryFromRow(row: Record<string, any>): EntryState {
    const n = (a: unknown, b?: unknown) => {
        const v = a ?? b;
        return v === null || v === undefined || v === '' ? '' : String(v);
    };
    const itemId = str(row.item_id ?? row.itemId);
    const vendorId = str(row.vendor_id ?? row.vendorId) || (itemId.includes('-') ? itemId.split('-')[0] : '');
    // Rows saved before item_number was written carry the number in item_id
    // only (VENDOR-NNN); read it from there, as lib/inventoryCreate's
    // numbering does, so the '#' field is not empty (and, when locked by a
    // printed label, unfillable).
    let itemNumber = n(row.item_number, row.itemNumber);
    if (!itemNumber && itemId) {
        const prefix = (vendorId || itemId.split('-')[0]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = new RegExp(`^${prefix}-0*(\\d+)`, 'i').exec(itemId);
        if (m) itemNumber = String(parseInt(m[1], 10));
    }
    return {
        vendorId,
        workbook: normalizeWorkbook(row.workbook) || 'v326',
        itemNumber,
        quantity: n(row.quantity) || '1',
        status: str(row.status) || DEFAULT_ENTRY_STATUS,
        shape: str(row.shape),
        type: str(row.short_description ?? row.shortDescription),
        color: str(row.color),
        material: str(row.material),
        widthCm: n(row.width_cm, row.widthCm),
        heightCm: n(row.height_cm, row.heightCm),
        lengthCm: n(row.length_cm, row.lengthCm),
        weightKg: n(row.weight_kg, row.weightKg),
        price: n(row.price_mxn, row.priceMxn),
        description: str(row.description),
        top: (() => {
            const rawTop = str(row.top_type ?? row.top ?? row.data?.top).toLowerCase();
            if (rawTop === 'open' || rawTop === 'closed') return rawTop as 'open' | 'closed';
            const rawMedia = row.processed_media_urls ?? row.data?.processed_media_urls;
            if (rawMedia) {
                try {
                    const m = typeof rawMedia === 'string' ? JSON.parse(rawMedia) : rawMedia;
                    const t = str(m?.top ?? m?._top).toLowerCase();
                    if (t === 'open' || t === 'closed') return t as 'open' | 'closed';
                } catch {}
            }
            return '';
        })(),
        topSuggested: false,
    };
}

/** Form state (plus the media to write, or undefined to leave media_urls alone) as the service's input. */
export function toInventoryForm(state: EntryState, mediaUrls?: readonly string[]): InventoryForm {
    return {
        vendorId: state.vendorId,
        workbook: state.workbook,
        itemNumber: state.itemNumber,
        quantity: state.quantity,
        status: state.status,
        shape: state.shape,
        type: state.type,
        color: state.color,
        material: state.material,
        widthCm: state.widthCm,
        heightCm: state.heightCm,
        lengthCm: state.lengthCm,
        weightKg: state.weightKg,
        price: state.price,
        description: state.description,
        top: state.top || undefined,
        mediaUrls,
    };
}

/** The fields a person typed (vendor, book, number and status are set for them). */
export const hasTypedContent = (s: Partial<EntryState> | null | undefined): boolean =>
    !!s && !!(s.shape || s.type || s.color || s.material || s.price || s.description
        || s.widthCm || s.heightCm || s.lengthCm || s.weightKg || s.top);

const TYPED_KEYS: readonly (keyof EntryState)[] = [
    'shape', 'type', 'color', 'material', 'price', 'description', 'widthCm', 'heightCm', 'lengthCm', 'weightKg', 'quantity', 'status', 'top',
];

/** Did a person change any of the typed fields (not the vendor, book or number the screen sets)? */
export const typedChanged = (a: EntryState, b: EntryState): boolean => TYPED_KEYS.some(k => a[k] !== b[k]);

/** True when every field of two entry states holds the same value. */
export const sameEntry = (a: EntryState, b: EntryState): boolean =>
    (Object.keys(a) as (keyof EntryState)[]).every(k => a[k] === b[k]);

/** The media value that would be written, in order. */
export const mediaValues = (photos: readonly EntryPhoto[]): string[] =>
    photos.map(p => p.url).filter((u): u is string => !!u);

/** Move the item at `from` to index `to`, shifting the rest (not a swap). */
export function movePhoto<T>(list: readonly T[], from: number, to: number): T[] {
    const next = list.slice();
    if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
}

/**
 * Reorder a comma list that is index-aligned with media_urls (generated_image_urls)
 * to follow the new photo order. Entries of removed photos, or past the photo count,
 * are kept at the end so nothing generated is lost.
 * shortcut: alignment is by position only; a new photo inserted mid-list has no generated slot.
 */
export function reorderAligned(oldMedia: string | null | undefined, newMedia: readonly string[], aligned: string | null | undefined): string | null {
    const split = (v: unknown) => String(v ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
    const old = split(oldMedia);
    const gen = split(aligned);
    if (!gen.length) return aligned ?? null;
    const used = new Set<number>();
    const out: string[] = [];
    for (const u of newMedia) {
        const i = old.findIndex((o, j) => o === u && !used.has(j));
        if (i < 0) continue;
        used.add(i);
        if (i < gen.length) out.push(gen[i]);
    }
    gen.forEach((g, i) => { if (!used.has(i)) out.push(g); });
    return out.join(',');
}
// self-check: swapping photos swaps their generated images; extras stay at the end.
console.assert(reorderAligned('a,b,c', ['c', 'a', 'b'], 'A,B,C,X') === 'C,A,B,X', 'reorderAligned');

/**
 * newIndex -> oldIndex when `newMedia` is a pure reorder of the stored media_urls
 * (same URLs, same count, duplicates kept); null when a photo was added or removed.
 */
export function photoPermutation(oldMedia: string | null | undefined, newMedia: readonly string[]): number[] | null {
    const old = String(oldMedia ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (old.length !== newMedia.length) return null;
    const used = new Set<number>();
    const perm: number[] = [];
    for (const u of newMedia) {
        const i = old.findIndex((o, j) => o === u && !used.has(j));
        if (i < 0) return null;
        used.add(i);
        perm.push(i);
    }
    return perm;
}

/**
 * Remap the position-keyed entries (`angle_N`, `_pixel_map_hex_N`) of an object so each
 * follows its photo; every other key is kept as is. Also reaches `vein_svg_urls` / `vein_svg_meta`.
 */
export function remapIndexKeys<T extends Record<string, any>>(obj: T, perm: readonly number[]): T {
    const re = /^(angle_|_pixel_map_hex_)(\d+)$/;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        const m = re.exec(k);
        if (!m || +m[2] >= perm.length) out[k] = (k === 'vein_svg_urls' || k === 'vein_svg_meta') && v && typeof v === 'object' ? remapIndexKeys(v, perm) : v;
    }
    perm.forEach((from, to) => {
        for (const pre of ['angle_', '_pixel_map_hex_']) if (`${pre}${from}` in obj) out[`${pre}${to}`] = obj[`${pre}${from}`];
    });
    return out as T;
}
// self-check: a swap moves angle_/pixel-map entries with their photo; unindexed keys stay.
{
    const r = remapIndexKeys({ angle_0: 'a', angle_1: 'b', _pixel_map_hex: 'x', vein_svg_urls: { angle_1: 'v' } }, photoPermutation('p,q', ['q', 'p'])!);
    console.assert(r.angle_0 === 'b' && r.angle_1 === 'a' && r._pixel_map_hex === 'x' && (r.vein_svg_urls as any).angle_0 === 'v', 'remapIndexKeys');
}

/** Did the photos change from what is stored (order included)? A pending file is a change. */
export function photosChanged(initial: readonly EntryPhoto[], now: readonly EntryPhoto[]): boolean {
    if (now.some(p => !p.url)) return true;
    const a = mediaValues(initial);
    const b = mediaValues(now);
    return a.length !== b.length || a.some((u, i) => u !== b[i]);
}
