import { saveAiPatch, type InventoryRow } from '../../lib/ai/persist';
import { uploadCleanedImage } from '../../lib/bgReplace';
import { getCleanImageUrl } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

/**
 * Cleaned-photo writes for the ImageCanvas cleanup brush. Only processed_media_urls is touched: every other key
 * of the map is carried over as it was read, and the previous clean goes to `_prev_clean:<key>` for rollback.
 */

const PREV_PREFIX = '_prev_clean:';

/** Same reading as persist.ts parseMap: a JSON object string, an object, or a legacy plain string kept under _legacy. */
const parseMap = (raw: unknown): Record<string, string> => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, string>) };
    if (typeof raw === 'string') {
        const s = raw.trim();
        if (!s) return {};
        if (s.startsWith('{')) {
            try { return JSON.parse(s); } catch { return { _legacy: s }; }
        }
        return { _legacy: s };
    }
    return {};
};

const keyFor = (sourceUrl: string) => getCleanImageUrl(sourceUrl) || sourceUrl;

/** The clean and rollback URLs this photo has in the row's map right now. */
export function cleanedPhotoState(row: Record<string, any>, sourceUrl: string): { cleanedUrl?: string; prevUrl?: string } {
    const map = parseMap(row.processed_media_urls);
    const key = keyFor(sourceUrl);
    return { cleanedUrl: map[key] || undefined, prevUrl: map[PREV_PREFIX + key] || undefined };
}

/**
 * The map as it is in the database NOW, not as the row was when the canvas opened: the
 * Catalog Hub or another device may have written other photos' keys since, and a merge
 * into the stale copy would silently drop them.
 */
async function freshMap(row: Record<string, any>): Promise<Record<string, string>> {
    const { data, error } = await supabase.from('inventory').select('processed_media_urls').eq('id', row.id).single();
    if (error) throw new Error(`Could not re-read the item before saving: ${error.message}`);
    return parseMap(data?.processed_media_urls);
}

async function writeMap(row: Record<string, any>, map: Record<string, string>, user?: unknown): Promise<InventoryRow> {
    const rowId = String(row.id || '');
    const saved = await saveAiPatch(rowId, {
        columns: { processed_media_urls: JSON.stringify(map) },
        segmentations: [],
        warnings: [],
        failedUploads: [],
    }, { user });
    if (!saved) throw new Error('Save failed: no row came back');
    return saved;
}

export interface SaveCleanedPhotoArgs {
    row: Record<string, any>;
    angleIndex: number;
    sourceUrl: string;
    dataUrl: string;
    user?: unknown;
}

/** Upload the cleaned PNG to Drive and point this photo's key at it, keeping the old clean as the rollback. */
export async function saveCleanedPhotoToDb({ row, angleIndex, sourceUrl, dataUrl, user }: SaveCleanedPhotoArgs): Promise<{ savedRow: InventoryRow; uploadedUrl: string; prevUrl?: string }> {
    const uploadedUrl = await uploadCleanedImage(dataUrl, `clean_${row.id}_a${angleIndex}.png`, user);
    if (!uploadedUrl) throw new Error('Upload to Drive returned no URL; nothing was saved');
    const key = keyFor(sourceUrl);
    const map = await freshMap(row);
    const prevUrl = map[key];
    if (prevUrl && prevUrl !== uploadedUrl) map[PREV_PREFIX + key] = prevUrl;
    map[key] = uploadedUrl;
    const savedRow = await writeMap(row, map, user);
    return { savedRow, uploadedUrl, prevUrl };
}

/** Swap this photo's clean with its `_prev_clean:` backup. Throws when there is no backup to restore. */
export async function rollbackCleanedPhotoInDb(row: Record<string, any>, sourceUrl: string, user?: unknown): Promise<InventoryRow> {
    const key = keyFor(sourceUrl);
    const map = await freshMap(row);
    const prev = map[PREV_PREFIX + key];
    if (!prev) throw new Error('No previous clean image to restore');
    const current = map[key];
    map[key] = prev;
    if (current) map[PREV_PREFIX + key] = current;
    else delete map[PREV_PREFIX + key];
    return writeMap(row, map, user);
}
