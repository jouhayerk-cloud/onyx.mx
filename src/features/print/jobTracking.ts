import { recordDocumentJob } from '../../lib/documentJobs';
import type { DocumentJob } from '../../lib/documentJobs';
import type { DocumentKind, DocumentChannel } from './types';
import { flushOutbox } from './jobService';

export interface TrackMeta {
    templateId: string;
    kind: DocumentKind;
    fileName?: string;
    season?: "826" | "legacy";
    channel?: DocumentChannel;
    params?: Record<string, unknown>;
    getSnapshot?: () => unknown;
    manifestId?: string;
    crateLogisticsId?: string;
    itemCount?: number;
    workbook?: string;            // e.g. 'v326' when the season alone does not name the book
    legacyPrintJobId?: string;    // id of the print_jobs row the label wizard already wrote
}

export interface TrackedJob {
    templateId: string;
    fileName?: string;
    at: string;
    outputBytes?: number;
    ok: boolean;          // no error was thrown by the generator
    verified?: boolean;   // an output (blob, bytes or text) was seen; false for handlers that save the file themselves
}

const recentTracked: TrackedJob[] = [];
const MAX_RECENT = 50;

export function getRecentTracked(): TrackedJob[] {
    return [...recentTracked];
}

function addRecent(job: TrackedJob): void {
    recentTracked.unshift(job);
    if (recentTracked.length > MAX_RECENT) {
        recentTracked.pop();
    }
}

function generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateJobRef(season: string): string {
    return `DJ-${season}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}


// The ledger needs identities, not content: keep only id-like keys of each record so that prices, costs, image urls and
// personal data never reach document_jobs.data_snapshot (and the outbox stays small). Deterministic, capped.
const ID_KEYS = ['id', 'row', 'itemId', 'item_id', 'tagId', 'tag_id', 'bookBarcode', 'book_barcode', 'barcode', 'qty', 'quantity', 'copies', 'crateId', 'crate_id', 'label', 'manifestId'];
const MAX_SNAPSHOT_ROWS = 5000;

function pickIds(o: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of ID_KEYS) {
        const v = o[k];
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    }
    return out;
}

function minimizeSnapshot(v: unknown, depth = 0): unknown {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.slice(0, MAX_SNAPSHOT_ROWS).map(x => minimizeSnapshot(x, depth + 1));
    if (typeof v === 'object' && depth < 4) {
        const o = v as Record<string, unknown>;
        const out: Record<string, unknown> = pickIds(o);
        for (const k of Object.keys(o)) {
            const x = o[k];
            if (k in out) continue;
            if (Array.isArray(x)) out[k] = minimizeSnapshot(x, depth + 1);
            else if (x && typeof x === 'object' && (k === 'inv' || k === 'data' || k === 'item')) out[k] = pickIds(x as Record<string, unknown>);
        }
        return out;
    }
    return undefined;
}

const OUTBOX_CAP = 200;

async function saveJobToOutbox(job: DocumentJob): Promise<void> {
    const item = {
        id: generateId(),
        type: 'job',
        timestamp: Date.now(),
        payload: job
    };
    try {
        if (typeof window !== 'undefined' && window.indexedDB) {
            const req = indexedDB.open('OnyxPrintHub', 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('outbox')) {
                    req.result.createObjectStore('outbox', { keyPath: 'id' });
                }
            };
            req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('outbox')) return;
                try {
                    const tx = db.transaction('outbox', 'readwrite');
                    const store = tx.objectStore('outbox');
                    const cnt = store.count();
                    cnt.onsuccess = () => { if (cnt.result < OUTBOX_CAP) store.put(item); };
                    tx.oncomplete = () => {
                        flushOutbox().catch(() => {});
                    };
                } catch (e) {
                    // fail soft
                }
            };
        } else if (typeof localStorage !== 'undefined') {
            const OUTBOX_KEY = 'onyx_document_jobs_outbox';
            const existing = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
            existing.push(item);
            localStorage.setItem(OUTBOX_KEY, JSON.stringify(existing.slice(-OUTBOX_CAP)));
            flushOutbox().catch(() => {});
        }
    } catch (e) {
        // fail soft
    }
}

async function computeSha256(buffer: ArrayBuffer): Promise<string | undefined> {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        try {
            const digest = await window.crypto.subtle.digest('SHA-256', buffer);
            return Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        } catch (e) {
            return undefined;
        }
    }
    return undefined;
}

async function processRecord(meta: TrackMeta, result?: unknown): Promise<void> {
    let outputSha256: string | undefined;
    let outputBytes: number | undefined;

    try {
        if (result instanceof Blob) {
            const buffer = await result.arrayBuffer();
            outputBytes = buffer.byteLength;
            outputSha256 = await computeSha256(buffer);
        } else if (result instanceof Uint8Array) {
            outputBytes = result.length;
            outputSha256 = await computeSha256(result.slice().buffer as ArrayBuffer);   // slice(): hash exactly this view, not its whole backing buffer
        } else if (typeof result === 'string') {
            const bytes = new TextEncoder().encode(result);
            outputBytes = bytes.length;
            outputSha256 = await computeSha256(bytes.buffer);
        }
    } catch (e) {
        // fail soft
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let snapshotData: any;
    if (meta.getSnapshot) {
        try {
            snapshotData = minimizeSnapshot(meta.getSnapshot());
        } catch (e) {
            // fail soft
        }
    }

    const season = meta.season || '826';
    const jobRef = generateJobRef(season);
    
    const jobPayload: DocumentJob = {
        id: generateId(),
        jobRef,
        kind: meta.kind,
        templateId: meta.templateId,
        templateVersion: '1.0.0',
        season: season === 'legacy' ? '825' : '826',
        manifestId: meta.manifestId,
        crateId: meta.crateLogisticsId,
        params: { ...(meta.params || {}), verified: outputBytes !== undefined },
        snapshot: snapshotData,
        workbook: meta.workbook,
        legacyPrintJobId: meta.legacyPrintJobId,
        outputSha256,
        outputBytes,
        fileName: meta.fileName ?? `${meta.templateId}_${new Date().toISOString().slice(0, 10)}`,
        channel: meta.channel,
    };

    let ok = false;
    try {
        const recorded = await recordDocumentJob(jobPayload);
        if (!recorded) {
            await saveJobToOutbox(jobPayload);
            ok = true; // Queued locally is still "ok" for tracking
        } else {
            ok = true;
        }
    } catch (e) {
        await saveJobToOutbox(jobPayload);
        ok = true;
    }

    addRecent({
        templateId: meta.templateId,
        fileName: meta.fileName,
        at: new Date().toISOString(),
        outputBytes,
        ok,
        verified: outputBytes !== undefined
    });
}

// A combined export (params.combined) calls the single-document exporters many times: only the combined job is recorded.
let combinedDepth = 0;

export async function trackDocumentJob<T>(meta: TrackMeta, run: () => Promise<T> | T): Promise<T> {
    const isCombined = meta.params?.combined === true;
    if (isCombined) combinedDepth++;
    let result: T;
    try {
        result = await run();
    } finally {
        if (isCombined) combinedDepth--;
    }
    if (isCombined || combinedDepth === 0) processRecord(meta, result).catch(() => {});
    return result;
}

export function recordExport(meta: TrackMeta, result?: unknown): void {
    processRecord(meta, result).catch(() => {});
}
