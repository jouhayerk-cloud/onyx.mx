/**
 * Batch Create's import: upload the photos, insert the rows through
 * lib/inventoryCreate, and keep a per-row account of what happened.
 *
 * The state lives in a module atom, not in the wizard: the old save kept its
 * progress in component state, so leaving the view mid-save lost the
 * progress and the results while the inserts went on, and the rows (still
 * in batchCreateItemsAtom) could be saved a second time on return. Now each
 * row leaves batchCreateItemsAtom the moment it is inserted, and the wizard,
 * remounted, finds the import where it is.
 *
 * AI no longer runs here. It ran before the first insert, with no timeout,
 * no cancel and its failures in the console, so a stuck background removal
 * saved nothing, and the progress bar sat at 30% under 'Saving 0 / N'. The
 * created rows now go to the Catalog Hub with the processes picked in the
 * review (lib/atoms batchWizardHandoffAtom), where the run engine runs them
 * and they are reviewed and saved like any other item.
 */
import { atom } from 'jotai';
import type { BatchCreateItem } from '../../lib/atoms';
import { handleFileUpload } from '../../lib/utils';
import { processQueueWithConcurrency } from '../../lib/queueProcessor';
import {
    buildInventoryRow,
    createInventoryItems,
    formatItemId,
    getTakenItemNumbers,
    type InventoryForm,
    type InventoryRow,
} from '../../lib/inventoryCreate';
import { tr, trf } from '../../lib/i18n';
import { cleanNumberCell, itemNumberOf } from './batchSheet';

/** Batch Create writes to the current book only. */
export const BATCH_WORKBOOK = 'v826';

// Photos upload to Drive through the Apps Script endpoint; four at a time is
// well inside its concurrent-execution limit and several times faster than one.
export const UPLOAD_CONCURRENCY = 4;

export type ImportRowState = 'queued' | 'uploading' | 'creating' | 'created' | 'partial' | 'failed' | 'skipped';

export interface ImportRow {
    /** The batch row's id. */
    key: string;
    sheetRow?: number;
    /** VENDOR-NNN as it will be (or was) stored. */
    itemId: string;
    /** What ItemTag reads: vendor, book, number, price. */
    tag: Record<string, unknown>;
    /** Shape and Type (the manual one), then vendor colour and material. */
    name: string;
    price: string;
    photoCount: number;
    preview?: string;
    state: ImportRowState;
    /** Why it failed or was skipped. */
    reason?: string;
    /** Photos that did not upload; the row was created without them. */
    photoFailures: string[];
    /** The row as stored, once created. */
    row?: InventoryRow;
}

export interface ImportState {
    running: boolean;
    phase: 'upload' | 'create' | 'done' | 'stopped';
    vendor: string;
    rows: ImportRow[];
    upload: { done: number; total: number };
    /** The processes picked for after the import, for the hand-off. */
    processes: string[];
    donor: boolean;
    /** A run-level failure (the numbers could not be read...). */
    error?: string;
}

export const batchImportAtom = atom(null as ImportState | null);

/** One import at a time, app-wide; Stop is read between rows and uploads. */
const control = { running: false, stop: false };
export const isImportRunning = () => control.running;
export const requestImportStop = () => { if (control.running) control.stop = true; };

/** Shape and Type, then the vendor's colour and the material: "Large Bowl · Blue Argentina · Onyx". */
export function rowName(item: BatchCreateItem): string {
    const head = [item.shape, item.itemType].filter(Boolean).join(' ') || item.description;
    return [head, item.color, item.material].filter(Boolean).join(' · ');
}

/** The fields ItemTag and the codes read, for a batch row. */
export function tagRowOf(item: BatchCreateItem, vendor: string): Record<string, unknown> {
    const n = itemNumberOf(item);
    const price = cleanNumberCell(item.price);
    return {
        vendor_id: vendor,
        item_id: n !== null && vendor ? formatItemId(vendor, n) : '',
        item_number: n ?? '',
        workbook: BATCH_WORKBOOK,
        price_mxn: price.ok && price.value ? Number(price.value) : 0,
    };
}

/** A batch row as the item-creation service's form. Number cells go in cleaned ('$1,200' -> 1200). */
export function toInventoryForm(item: BatchCreateItem, vendor: string, mediaUrls: readonly string[]): InventoryForm {
    const num = (v: string) => cleanNumberCell(v).value;
    return {
        vendorId: vendor,
        workbook: BATCH_WORKBOOK,
        itemNumber: item.itemNumber,
        quantity: num(item.quantity) || '1',
        shape: item.shape,
        // Canonical map: short_description is the manual Type, color the
        // vendor's colour, description the vendor's note. No AI process
        // writes them, and the AI columns are left to the Catalog Hub.
        type: item.itemType,
        color: item.color,
        material: item.material,
        widthCm: num(item.widthCm),
        heightCm: num(item.heightCm),
        lengthCm: num(item.lengthCm),
        weightKg: num(item.weightKg),
        price: num(item.price),
        description: item.description,
        mediaUrls,
    };
}

export interface ImportOptions {
    items: readonly BatchCreateItem[];
    vendor: string;
    user: { name?: string | null; email?: string | null } | null | undefined;
    processes: readonly string[];
    donor: boolean;
    /** The atom's setter (works after the wizard unmounts: it writes the store). */
    setState: (update: ImportState | null | ((prev: ImportState | null) => ImportState | null)) => void;
    /** Drop these rows from batchCreateItemsAtom: they are in the inventory now. */
    removeCreated: (ids: readonly string[]) => void;
    /** Tell the inventory list to re-read. */
    onCreated: () => void;
}

/**
 * Upload, then insert row by row. Resolves when the import is over (done or
 * stopped). A row whose photos partly failed is created with the ones that
 * uploaded and listed; a row that fails to insert stays in the batch with its
 * reason, so it can be fixed and created again.
 */
export async function runBatchImport(opts: ImportOptions): Promise<void> {
    if (control.running) return;
    control.running = true;
    control.stop = false;
    const { items, vendor, user, setState } = opts;

    const patchRow = (key: string, patch: Partial<ImportRow>) =>
        setState(prev => (prev ? { ...prev, rows: prev.rows.map(r => (r.key === key ? { ...r, ...patch } : r)) } : prev));
    const patchState = (patch: Partial<ImportState>) => setState(prev => (prev ? { ...prev, ...patch } : prev));

    const uploads = items.flatMap((item, i) =>
        item.mediaFiles.map((media, m) => ({ i, m, file: media.originalFile, name: media.name || media.originalFile?.name || `photo ${m + 1}` }))
            .filter(u => u.file));

    setState({
        running: true,
        phase: 'upload',
        vendor,
        processes: [...opts.processes],
        donor: opts.donor,
        upload: { done: 0, total: uploads.length },
        rows: items.map(item => {
            const n = itemNumberOf(item);
            return {
                key: item.id,
                sheetRow: item.sheetRow,
                itemId: n !== null ? formatItemId(vendor, n) : String(item.itemNumber),
                tag: tagRowOf(item, vendor),
                name: rowName(item),
                price: cleanNumberCell(item.price).value,
                photoCount: item.mediaFiles.length,
                preview: item.mediaFiles.find(f => f.localUrl)?.localUrl,
                state: 'queued' as const,
                photoFailures: [],
            };
        }),
    });

    try {
        // ── 1. Photos. Every photo of every row through one queue, four at a
        // time. Each keeps its slot, so a row's photos stay in the order they
        // were attached; a failed one is retried once, then named.
        const urlSlots: (string | null)[][] = items.map(item => item.mediaFiles.map(() => null));
        const failedPhotos: string[][] = items.map(() => []);
        const pending = items.map(item => item.mediaFiles.filter(m => m.originalFile).length);
        let done = 0;
        await processQueueWithConcurrency(uploads, UPLOAD_CONCURRENCY, async ({ i, m, file, name }) => {
            if (control.stop) return;
            patchRow(items[i].id, { state: 'uploading' });
            let reason = '';
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const result = await handleFileUpload(file!, user);
                    if (result?.thumbnailUrl) { urlSlots[i][m] = result.thumbnailUrl; reason = ''; break; }
                    reason = tr('the upload returned no file');
                } catch (err: any) {
                    reason = err?.message || tr('upload failed');
                }
            }
            if (reason) failedPhotos[i].push(`${name}: ${reason}`);
            done++;
            pending[i]--;
            patchState({ upload: { done, total: uploads.length } });
            if (pending[i] === 0) patchRow(items[i].id, { state: 'queued', photoFailures: failedPhotos[i] });
        });

        // ── 2. Rows. The book's numbers are read again first: the review
        // checked them, but uploads can take minutes and another device may
        // have taken a number meanwhile.
        patchState({ phase: 'create' });
        let taken: Set<number>;
        try {
            taken = await getTakenItemNumbers(vendor, BATCH_WORKBOOK);
        } catch (err: any) {
            const reason = trf('Could not check the book’s numbers: {error}', { error: String(err?.message || err) });
            setState(prev => (prev ? {
                ...prev,
                error: reason,
                rows: prev.rows.map(r => (r.state === 'created' ? r : { ...r, state: 'skipped', reason })),
            } : prev));
            return;
        }

        let created = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (control.stop) {
                patchRow(item.id, { state: 'skipped', reason: tr('Stopped before it was created') });
                continue;
            }
            const n = itemNumberOf(item);
            if (n === null) {
                patchRow(item.id, { state: 'failed', reason: trf('"{n}" is not an item number', { n: String(item.itemNumber) }) });
                continue;
            }
            if (taken.has(n)) {
                patchRow(item.id, { state: 'failed', reason: trf('{id} was taken in book {book} meanwhile', { id: formatItemId(vendor, n), book: BATCH_WORKBOOK.slice(1) }) });
                continue;
            }
            patchRow(item.id, { state: 'creating' });
            const urls = urlSlots[i].filter((u): u is string => !!u);
            let row;
            try {
                row = buildInventoryRow(toInventoryForm(item, vendor, urls), { mode: 'create', user });
            } catch (err: any) {
                patchRow(item.id, { state: 'failed', reason: err?.message || String(err) });
                continue;
            }
            const [res] = await createInventoryItems([row]);
            if (res?.ok && res.row) {
                taken.add(n);
                created++;
                patchRow(item.id, {
                    state: failedPhotos[i].length ? 'partial' : 'created',
                    row: res.row,
                    photoFailures: failedPhotos[i],
                    reason: failedPhotos[i].length ? trf('{n} photo(s) did not upload', { n: failedPhotos[i].length }) : undefined,
                });
                // Out of the batch at once, so leaving and coming back can
                // never insert it twice.
                opts.removeCreated([item.id]);
            } else {
                patchRow(item.id, { state: 'failed', reason: res?.error || tr('The insert failed') });
            }
        }
        if (created) opts.onCreated();
    } finally {
        const stopped = control.stop;
        control.running = false;
        control.stop = false;
        setState(prev => (prev ? { ...prev, running: false, phase: stopped ? 'stopped' : 'done' } : prev));
    }
}
