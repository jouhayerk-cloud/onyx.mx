import { supabase as typedSupabase } from './supabase';

// document_jobs, document_job_items and document_jobs_current come from a draft migration and are not in the generated types yet
const supabase = typedSupabase as unknown as { from: (table: string) => any };

export type DocumentKind = 'xlsx' | 'pdf' | 'label' | 'csv';
export type DocumentStatus = 'requested' | 'rendered' | 'printed' | 'downloaded' | 'reprinted' | 'void';

let loggedMissingTable = false;

function checkMissingTable(err: any): boolean {
    const code = err?.code || err?.details?.code || '';
    const message = err?.message || '';
    if (code === '42P01' || message.includes('404') || message.includes('does not exist')) {
        if (!loggedMissingTable) {
            console.warn('document_jobs table does not exist yet. Failing softly.');
            loggedMissingTable = true;
        }
        return true;
    }
    return false;
}

export function canonicalJson(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') {
        if (!isFinite(value)) return 'null';
        if (value === 0 && 1 / value === -Infinity) return '0';
        return String(value);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim().normalize('NFC');
        if (trimmed === '' || trimmed === '-' || trimmed === '—') return 'null';
        return JSON.stringify(trimmed);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (Array.isArray(value)) {
        const out = value.map(v => v === undefined ? 'null' : canonicalJson(v));
        return '[' + out.join(',') + ']';
    }
    if (typeof value === 'object') {
        if (typeof value.toISOString === 'function') {
            return JSON.stringify(value.toISOString());
        }
        const keys = Object.keys(value).sort();
        const out: string[] = [];
        for (const k of keys) {
            if (value[k] === undefined) continue;
            const v = canonicalJson(value[k]);
            out.push(`${JSON.stringify(k)}:${v}`);
        }
        return '{' + out.join(',') + '}';
    }
    return 'null';
}

export async function checksumV1(snapshot: any): Promise<string> {
    const text = canonicalJson(snapshot);
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('crypto.subtle is unavailable (requires secure context)');
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return 'dj1:' + hex;
}

export interface DocumentJobItem {
    inventoryId: string;
    tagId?: string;
    copies?: number;
}

export interface DocumentJob {
    id?: string;
    jobRef?: string;
    kind: DocumentKind;
    templateId: string;
    templateVersion: string;
    season: '825' | '826';
    workbook?: string;
    manifestId?: string;
    crateId?: string;
    batchId?: string;
    params?: any;
    snapshot?: any;
    items?: DocumentJobItem[];
    outputSha256?: string;
    outputBytes?: number;
    fileName?: string;
    channel?: string;
    legacyPrintJobId?: string;
}

export async function recordDocumentJob(job: DocumentJob): Promise<any> {
    try {
        let dataHash = 'dj1:fallback';
        if (job.snapshot) {
            dataHash = await checksumV1(job.snapshot);
        }
        
        const mappedSeason = job.season === '826' ? '826' : 'legacy';
        const fallbackWorkbook = job.season === '826' ? 'v826' : 'v825';

        const row = {
            job_ref: job.jobRef || `DJ-${job.season}-${Date.now().toString(36).toUpperCase()}`,
            kind: job.kind,
            template_id: job.templateId,
            template_version: job.templateVersion,
            season: mappedSeason,
            workbook: job.workbook || fallbackWorkbook,
            manifest_id: job.manifestId,
            crate_logistics_id: job.crateId,
            batch_id: job.batchId,
            parameters: job.params || {},
            data_snapshot: job.snapshot,
            hash_version: 1,
            data_hash: dataHash,
            output_sha256: job.outputSha256,
            output_bytes: job.outputBytes,
            file_name: job.fileName,
            channel: job.channel,
            legacy_print_job_id: job.legacyPrintJobId,
            client_created_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from('document_jobs').insert(row).select().single();
        if (error) {
            if (checkMissingTable(error)) return null;
            console.error('recordDocumentJob: error inserting row:', error);
            return null;
        }

        if (job.items && job.items.length > 0 && data) {
            const items = job.items.map(item => ({
                job_id: data.id,
                inventory_id: item.inventoryId,
                season: mappedSeason,
                tag_id: item.tagId,
                copies: item.copies || 1
            }));
            const { error: itemsErr } = await supabase.from('document_job_items').insert(items);
            if (itemsErr) {
                if (checkMissingTable(itemsErr)) return data;
                console.error('recordDocumentJob: error inserting items:', itemsErr);
            }
        }

        return data;
    } catch (err: any) {
        if (checkMissingTable(err)) return null;
        console.error('Failed to record document job', err);
        return null;
    }
}

export async function verifyDocumentJob(id: string): Promise<'match' | 'mismatch' | 'unverifiable'> {
    try {
        const { data: job, error } = await supabase.from('document_jobs').select('*').eq('id', id).single();
        if (error) {
            if (checkMissingTable(error)) return 'unverifiable';
            console.error('verifyDocumentJob: error fetching job:', error);
            return 'unverifiable';
        }
        if (!job || !job.data_snapshot || job.hash_version !== 1) {
            return 'unverifiable';
        }
        const recomputed = await checksumV1(job.data_snapshot);
        return recomputed === job.data_hash ? 'match' : 'mismatch';
    } catch (err: any) {
        if (checkMissingTable(err)) return 'unverifiable';
        console.error('Verify failed', err);
        return 'unverifiable';
    }
}

export async function listDocumentJobs(filter: { season?: '825' | '826', kind?: DocumentKind, limit?: number }): Promise<any[]> {
    try {
        let query = supabase.from('document_jobs_current').select('*');
        if (filter.season) {
            query = query.eq('season', filter.season === '826' ? '826' : 'legacy');
        }
        if (filter.kind) {
            query = query.eq('kind', filter.kind);
        }
        const limit = filter.limit || 50;
        query = query.order('created_at', { ascending: false }).limit(limit);

        const { data, error } = await query;
        if (error) {
            if (checkMissingTable(error)) return [];
            console.error('listDocumentJobs: error querying view:', error);
            return [];
        }
        return data || [];
    } catch (err: any) {
        if (checkMissingTable(err)) return [];
        console.error('List failed', err);
        return [];
    }
}
