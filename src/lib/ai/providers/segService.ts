/**
 * The local segmentation service (BiRefNet + SAM 2) on the owner's PC. Cutouts, masks, SVG outlines and the clean
 * white-background image come from here when it is up; every caller falls back to its own pipeline on any error.
 * Images go only to this address, never anywhere else.
 */
export const SEG_SERVICE_URL = 'http://127.0.0.1:8002';
/** The same service through Tailscale Serve (tailnet only), for phones and other devices signed into the tailnet. */
export const SEG_SERVICE_TAILSCALE_URL = 'https://g7.tail2a809e.ts.net/seg';
const SEG_BASES = [SEG_SERVICE_URL, SEG_SERVICE_TAILSCALE_URL];
/** The address the last health check reached; segmentImage uses it. */
let activeBase = SEG_SERVICE_URL;
export const SEG_SOURCE = 'sam2-local';
export const SEG_LOCAL_EVENT = 'onyx-seg-local';

const SWITCH_KEY = 'ONYX_SEG_LOCAL';
export type SegLocalSwitch = 'auto' | 'off';

export function getSegLocal(): SegLocalSwitch {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(SWITCH_KEY) === 'off' ? 'off' : 'auto'; } catch { return 'auto'; }
}

export function setSegLocal(value: SegLocalSwitch): void {
    try { window.localStorage.setItem(SWITCH_KEY, value); } catch { /* storage blocked */ }
    try { window.dispatchEvent(new Event(SEG_LOCAL_EVENT)); } catch { /* no window */ }
    healthCache = null;
}

export interface SegHealth { ok: boolean; models: { birefnet: boolean; sam2: boolean }; busy: boolean }

let healthCache: { at: number; value: SegHealth | null } | null = null;
const HEALTH_TTL = 30_000;

/** The service's /health answer, or null when it is off, unreachable or slow. Cached 30 s; never throws. */
export async function segServiceHealth(force = false): Promise<SegHealth | null> {
    if (!force && healthCache && Date.now() - healthCache.at < HEALTH_TTL) return healthCache.value;
    let value: SegHealth | null = null;
    // This PC first, then Tailscale (a phone's 127.0.0.1 is the phone itself)
    for (const base of SEG_BASES) {
        try {
            const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(base === SEG_SERVICE_URL ? 2000 : 4000) });
            if (res.ok) {
                const j = await res.json();
                if (j && j.ok) { value = { ok: true, models: { birefnet: !!j.models?.birefnet, sam2: !!j.models?.sam2 }, busy: !!j.busy }; activeBase = base; break; }
            }
        } catch { /* not reachable at this address */ }
    }
    healthCache = { at: Date.now(), value };
    return value;
}

export async function segServiceHealthy(): Promise<boolean> {
    return !!(await segServiceHealth());
}

/** True when the switch is 'auto' and the service answers. */
export async function segServiceUsable(): Promise<boolean> {
    return getSegLocal() === 'auto' && segServiceHealthy();
}

export type SegMode = 'object' | 'mirror';
export type SegOutput = 'mask' | 'cutout' | 'white' | 'svg';

export interface SegResult {
    maskPng: string;
    cutoutPng: string;
    whitePng: string;
    svg: string;
    stats: Record<string, unknown>;
}

export type SegErrorCode = 'busy' | 'timeout' | 'aborted' | 'offline' | 'http' | 'bad-response';

export class SegServiceError extends Error {
    code: SegErrorCode;
    constructor(code: SegErrorCode, message: string) {
        super(message);
        this.name = 'SegServiceError';
        this.code = code;
    }
}

export interface SegOptions {
    maxSide?: number;
    outputs?: SegOutput[];
    signal?: AbortSignal;
    timeoutMs?: number;
}

/** One image through the service. Throws SegServiceError; callers catch it and use their own pipeline. */
export async function segmentImage(dataUrl: string, mode: SegMode, opts: SegOptions = {}): Promise<SegResult> {
    if (!dataUrl.startsWith('data:')) throw new SegServiceError('http', 'The service accepts data: URLs only');
    if (opts.signal?.aborted) throw new SegServiceError('aborted', 'Cancelled');
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 180_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let res: Response;
    try {
        res = await fetch(`${activeBase}/v1/segment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: dataUrl, mode, max_side: opts.maxSide ?? 1024, outputs: opts.outputs ?? ['mask', 'cutout', 'white', 'svg'],
            }),
            signal,
        });
    } catch (e) {
        if (opts.signal?.aborted) throw new SegServiceError('aborted', 'Cancelled');
        if (timeout.aborted) throw new SegServiceError('timeout', 'The segmentation service timed out');
        throw new SegServiceError('offline', (e as Error)?.message || 'The segmentation service is unreachable');
    }
    if (res.status === 503) throw new SegServiceError('busy', 'The segmentation service is busy');
    if (!res.ok) throw new SegServiceError('http', `The segmentation service answered ${res.status}`);
    let j: any;
    try { j = await res.json(); } catch { throw new SegServiceError('bad-response', 'Unreadable answer from the segmentation service'); }
    const out: SegResult = {
        maskPng: String(j?.mask_png || ''),
        cutoutPng: String(j?.cutout_png || ''),
        whitePng: String(j?.white_png || ''),
        svg: String(j?.svg || ''),
        stats: j?.stats && typeof j.stats === 'object' ? j.stats : {},
    };
    if (!out.cutoutPng && !out.whitePng && !out.maskPng) throw new SegServiceError('bad-response', 'The segmentation service returned no image');
    return out;
}
