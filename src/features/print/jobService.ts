import type { DocumentStatus, JobRequest, JobResult, RenderResult } from './types';
import { getDocumentType } from './registry';
import * as docJobs from '../../lib/documentJobs';
import type { DocumentJob } from '../../lib/documentJobs';

const OUTBOX_KEY = 'onyx_document_jobs_outbox';

interface OutboxItem {
    type: 'job' | 'event';
    payload: any;
    timestamp: number;
    id: string; // unique local key for the outbox item
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            resolve(null);
            return;
        }
        const req = indexedDB.open('OnyxPrintHub', 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains('outbox')) {
                req.result.createObjectStore('outbox', { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });
    return dbPromise;
}

async function saveToOutbox(item: OutboxItem) {
    try {
        const db = await getDB();
        if (db) {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('outbox', 'readwrite');
                tx.objectStore('outbox').put(item);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } else {
            const existing = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
            existing.push(item);
            localStorage.setItem(OUTBOX_KEY, JSON.stringify(existing));
        }
    } catch (e) {
        console.warn('Failed to save to outbox', e);
    }
}

async function loadOutbox(): Promise<OutboxItem[]> {
    try {
        const db = await getDB();
        if (db) {
            return new Promise((resolve) => {
                const tx = db.transaction('outbox', 'readonly');
                const req = tx.objectStore('outbox').getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        }
        return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

async function removeFromOutbox(id: string) {
    try {
        const db = await getDB();
        if (db) {
            await new Promise<void>((resolve) => {
                const tx = db.transaction('outbox', 'readwrite');
                tx.objectStore('outbox').delete(id);
                tx.oncomplete = () => resolve();
            });
        } else {
            const existing = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
            const filtered = existing.filter((x: any) => x.id !== id);
            localStorage.setItem(OUTBOX_KEY, JSON.stringify(filtered));
        }
    } catch (e) {
        // fail soft
    }
}

/** Returns how many items are waiting in the offline outbox. */
export async function getOutboxSize(): Promise<number> {
    const items = await loadOutbox();
    return items.length;
}

let isFlushing = false;
export async function flushOutbox(): Promise<void> {
    if (isFlushing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    isFlushing = true;
    try {
        const items = await loadOutbox();
        items.sort((a, b) => a.timestamp - b.timestamp);
        
        for (const item of items) {
            if (item.type === 'job') {
                const res = await docJobs.recordDocumentJob(item.payload);
                if (res) {
                    await removeFromOutbox(item.id);
                } else {
                    const code = typeof (docJobs as any).getLastRecordErrorCode === 'function' ? (docJobs as any).getLastRecordErrorCode() : null;
                    if (code && /^(22|23)/.test(code)) {
                        await removeFromOutbox(item.id);   // permanent data error (constraint, invalid value): retrying can never succeed, do not block the rest
                        continue;
                    }
                    break;   // network or missing table: keep it and stop, try again later
                }
            } else if (item.type === 'event') {
                const mod = docJobs as any;
                if (mod.appendJobStatus) {
                    const ok = await mod.appendJobStatus(item.payload.jobId, item.payload.status, item.payload.detail);
                    if (ok) {
                        await removeFromOutbox(item.id);
                    } else {
                        continue;
                    }
                } else {
                    continue;   // no status writer yet: leave the event queued but do not block the jobs behind it
                }
            }
        }
    } catch (e) {
        // fail soft
    } finally {
        isFlushing = false;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { flushOutbox().catch(() => {}); });
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

export interface RunDocumentJobOptions {
    channelHandlers?: Record<string, (result: RenderResult, params?: any) => Promise<void>>;
}

export async function runDocumentJob(
    request: JobRequest<any>,
    options?: RunDocumentJobOptions
): Promise<JobResult> {
    const docType = getDocumentType(request.typeId);
    if (!docType) {
        throw new Error(`Unknown document type: ${request.typeId}`);
    }

    const jobId = generateId();
    const jobRef = generateJobRef(request.season);

    await saveToOutbox({
        id: generateId(),
        type: 'event',
        timestamp: Date.now(),
        payload: { jobId, status: 'requested', detail: {} }
    });

    const data = await docType.requiredData(request.params);
    const snapshot = docType.buildSnapshot(data, request.params);
    
    const dataHash = await docJobs.checksumV1(snapshot);

    const renderResult = await docType.render(snapshot, request.params);

    let outputSha256: string | undefined;
    let outputBytes: number | undefined;
    try {
        let buffer: Uint8Array;
        if (renderResult.bytes) {
            buffer = renderResult.bytes;
        } else if (renderResult.blob) {
            buffer = new Uint8Array(await renderResult.blob.arrayBuffer());
        } else {
            throw new Error('No bytes or blob returned from render');
        }
        outputBytes = buffer.length;
        if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
            const digest = await window.crypto.subtle.digest('SHA-256', buffer as unknown as BufferSource);
            outputSha256 = Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        }
    } catch (e) {
        // fail soft
    }

    const jobPayload: DocumentJob = {
        id: jobId,
        jobRef,
        kind: docType.kind,
        templateId: docType.id,
        templateVersion: docType.templateVersion,
        season: request.season as '825' | '826',
        workbook: request.workbook,
        manifestId: request.manifestId,
        crateId: request.crateId,
        batchId: request.batchId,
        params: request.params,
        snapshot,
        items: request.items,
        outputSha256,
        outputBytes,
        fileName: renderResult.fileName,
        channel: request.channel,
        legacyPrintJobId: request.legacyPrintJobId
    };
    
    // Add parentJobId as any since it's not strictly in the current DocumentJob type interface 
    // but we have requested its addition in documentJobs.ts
    (jobPayload as any).parentJobId = request.parentJobId;

    await saveToOutbox({
        id: generateId(),
        type: 'job',
        timestamp: Date.now(),
        payload: jobPayload
    });

    await saveToOutbox({
        id: generateId(),
        type: 'event',
        timestamp: Date.now(),
        payload: { jobId, status: 'rendered', detail: { outputSha256 } }
    });

    let deliveredStatus: DocumentStatus | null = null;
    try {
        const channel = request.channel || 'browser-download';
        if (channel === 'browser-download') {
            const blob = renderResult.blob || new Blob([renderResult.bytes as unknown as BlobPart], { type: renderResult.mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = renderResult.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            deliveredStatus = 'downloaded';
        } else if (options?.channelHandlers && options.channelHandlers[channel]) {
            await options.channelHandlers[channel](renderResult, request.params);
            deliveredStatus = channel.startsWith('phomemo') ? 'printed' : 'downloaded';
        }
    } catch (e) {
        console.error('Delivery failed', e);
    }

    if (deliveredStatus) {
        await saveToOutbox({
            id: generateId(),
            type: 'event',
            timestamp: Date.now(),
            payload: { jobId, status: deliveredStatus, detail: {} }
        });
    }

    flushOutbox().catch(() => {});

    return {
        jobId,
        jobRef,
        dataHash,
        outputSha256
    };
}

export async function reprintDocumentJob(jobId: string, options?: RunDocumentJobOptions): Promise<JobResult> {
    const mod = docJobs as any;
    if (!mod.getDocumentJobById) {
        throw new Error('getDocumentJobById is not exported from documentJobs.ts. Please add it.');
    }
    const original = await mod.getDocumentJobById(jobId);
    if (!original) {
        throw new Error(`Original job not found: ${jobId}`);
    }
    
    const request: JobRequest<any> = {
        typeId: original.template_id,
        params: original.parameters,
        season: original.season === '826' ? '826' : 'legacy',
        workbook: original.workbook,
        manifestId: original.manifest_id,
        crateId: original.crate_logistics_id,
        batchId: original.batch_id,
        items: original.items, 
        channel: original.channel,
        parentJobId: jobId
    };

    const result = await runDocumentJob(request, options);
    
    await saveToOutbox({
        id: generateId(),
        type: 'event',
        timestamp: Date.now(),
        payload: { jobId, status: 'reprinted', detail: { childJobId: result.jobId } }
    });
    
    flushOutbox().catch(() => {});
    
    return result;
}
