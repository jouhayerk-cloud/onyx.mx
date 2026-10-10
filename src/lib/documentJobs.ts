import { supabase as typedSupabase } from './supabase';

// document_jobs, document_job_items and document_jobs_current come from a draft migration and are not in the generated types yet
const supabase = typedSupabase as unknown as { from: (table: string) => any };

export type DocumentKind = 'xlsx' | 'pdf' | 'label' | 'csv';
export type DocumentStatus = 'requested' | 'rendered' | 'printed' | 'downloaded' | 'reprinted' | 'void';

let loggedMissingTable = false;
// Once the ledger tables are known to be missing (migration not applied yet) stop asking the server for a while:
// every call would be a 404 in the console and a wasted request.
let ledgerMissingUntil = 0;
const LEDGER_RETRY_MS = 5 * 60 * 1000;
function ledgerDown(): boolean { return Date.now() < ledgerMissingUntil; }

function checkMissingTable(err: any): boolean {
    const code = err?.code || err?.details?.code || '';
    const message = err?.message || '';
    if (code === '42P01' || code === 'PGRST205' || message.includes('404') || message.includes('does not exist') || message.includes('schema cache')) {
        ledgerMissingUntil = Date.now() + LEDGER_RETRY_MS;
        if (!loggedMissingTable) {
            console.warn('document_jobs table does not exist yet. Failing softly.');
            loggedMissingTable = true;
        }
        return true;
    }
    return false;
}

// PM4 4.4 rule 6: fields that describe the run, not the document, are never part of the canonical form, so the same
// snapshot printed on two days hashes the same. Both spellings, at any depth. Snapshots reach the ledger already reduced
// to id-like keys (jobTracking.minimizeSnapshot), so no stored hash changes with this rule.
const VOLATILE_KEYS = new Set(['printed_at', 'printedAt', 'updated_at', 'updatedAt', 'job_id', 'jobId']);

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
            if (value[k] === undefined || VOLATILE_KEYS.has(k)) continue;
            const v = canonicalJson(value[k]);
            out.push(`${JSON.stringify(k)}:${v}`);
        }
        return '{' + out.join(',') + '}';
    }
    return 'null';
}


// Pure-JS SHA-256 for contexts without crypto.subtle (plain http on a LAN address): PM4 4.4 rule 8.
function sha256HexFallback(bytes: Uint8Array): string {
    const K = new Uint32Array([
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]);
    const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000));
    view.setUint32(padded.length - 4, (len * 8) >>> 0);
    const w = new Uint32Array(64);
    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    return Array.from(h).map(x => x.toString(16).padStart(8, '0')).join('');
}

let lastRecordErrorCode: string | null = null;
/** Postgres error code of the last failed recordDocumentJob (null for network or missing-table problems). The outbox uses it to tell permanent errors from transient ones. */
export function getLastRecordErrorCode(): string | null { return lastRecordErrorCode; }

export async function checksumV1(snapshot: any): Promise<string> {
    const text = canonicalJson(snapshot);
    const bytes = new TextEncoder().encode(text);
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        return 'dj1:' + sha256HexFallback(bytes);
    }
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
    parentJobId?: string;
}

export async function recordDocumentJob(job: DocumentJob): Promise<any> {
    if (ledgerDown()) return null;
    try {
        // With no snapshot the hash covers the identifying envelope only (still a valid dj1 value; verify reports it unverifiable).
        const dataHash = await checksumV1(job.snapshot ? job.snapshot : { kind: job.kind, templateId: job.templateId, season: job.season, params: job.params ?? null });
        lastRecordErrorCode = null;
        
        const mappedSeason = job.season === '826' ? '826' : 'legacy';
        const fallbackWorkbook = job.season === '826' ? 'v826' : 'v825';

        const row = {
            job_ref: job.jobRef || `DJ-${job.season}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
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
            parent_job_id: job.parentJobId,
            client_created_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from('document_jobs').insert(row).select().single();
        if (error) {
            if (checkMissingTable(error)) return null;
            if ((error as any).code === '23505') {
                // The same job_ref is already stored: a retry after a lost response. Treat it as recorded (idempotent).
                const existing = await supabase.from('document_jobs').select('*').eq('job_ref', row.job_ref).single();
                if (existing.data) return existing.data;
            }
            lastRecordErrorCode = (error as any).code ?? null;
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
    if (ledgerDown()) return 'unverifiable';
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
    if (ledgerDown()) return [];
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

export async function getDocumentJobById(id: string): Promise<any | null> {
    if (ledgerDown()) return null;
    try {
        if (!id || typeof id !== 'string') return null;
        const { data, error } = await supabase
            .from('document_jobs_current')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            if (checkMissingTable(error)) return null;
            if ((error as any).code === 'PGRST116') return null;
            console.error('getDocumentJobById: error querying view:', error);
            return null;
        }
        return data ?? null;
    } catch (err: any) {
        if (checkMissingTable(err)) return null;
        console.error('getDocumentJobById failed', err);
        return null;
    }
}

export async function findDocumentJobsByHash(hash: string, limit = 10): Promise<any[]> {
    if (ledgerDown()) return [];
    try {
        if (!hash || typeof hash !== 'string') return [];
        const clean = hash.trim();
        if (!clean || /[,()]/.test(clean)) return [];

        const lower = clean.toLowerCase();
        const withDj1 = lower.startsWith('dj1:') ? lower : `dj1:${lower}`;
        const withoutDj1 = lower.startsWith('dj1:') ? lower.slice(4) : lower;

        const conditions = [
            `data_hash.eq.${withDj1}`,
            `data_hash.eq.${withoutDj1}`,
            `output_sha256.eq.${withoutDj1}`,
            `output_sha256.eq.${withDj1}`
        ];

        if (clean !== lower) {
            const withDj1Raw = clean.toLowerCase().startsWith('dj1:') ? clean : `dj1:${clean}`;
            const withoutDj1Raw = clean.toLowerCase().startsWith('dj1:') ? clean.slice(4) : clean;
            conditions.push(
                `data_hash.eq.${withDj1Raw}`,
                `data_hash.eq.${withoutDj1Raw}`,
                `output_sha256.eq.${withoutDj1Raw}`,
                `output_sha256.eq.${withDj1Raw}`
            );
        }

        const uniqueConditions = Array.from(new Set(conditions));
        const queryLimit = typeof limit === 'number' && limit > 0 ? limit : 10;

        let query = supabase.from('document_jobs_current').select('*');
        query = query.or(uniqueConditions.join(','));
        query = query.order('created_at', { ascending: false }).limit(queryLimit);

        const { data, error } = await query;
        if (error) {
            if (checkMissingTable(error)) return [];
            console.error('findDocumentJobsByHash: error querying view:', error);
            return [];
        }
        return data || [];
    } catch (err: any) {
        if (checkMissingTable(err)) return [];
        console.error('findDocumentJobsByHash failed', err);
        return [];
    }
}
