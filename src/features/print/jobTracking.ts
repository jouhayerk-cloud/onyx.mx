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
}

export interface TrackedJob {
    templateId: string;
    fileName?: string;
    at: string;
    outputBytes?: number;
    ok: boolean;
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
    return `DJ-${season}-${Date.now().toString(36).toUpperCase()}`;
}

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
                    tx.objectStore('outbox').put(item);
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
            localStorage.setItem(OUTBOX_KEY, JSON.stringify(existing));
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
            snapshotData = meta.getSnapshot();
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
        params: meta.params,
        snapshot: snapshotData,
        outputSha256,
        outputBytes,
        fileName: meta.fileName,
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
        ok
    });
}

export async function trackDocumentJob<T>(meta: TrackMeta, run: () => Promise<T> | T): Promise<T> {
    const result = await run();
    processRecord(meta, result).catch(() => {});
    return result;
}

export function recordExport(meta: TrackMeta, result?: unknown): void {
    processRecord(meta, result).catch(() => {});
}
