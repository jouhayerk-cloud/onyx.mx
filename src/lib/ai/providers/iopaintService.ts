/**
 * The local IOPaint server (LaMa inpainting) on the owner's PC, used by the ImageCanvas cleanup brush.
 * Images go only to this address, never anywhere else. Callers catch IopaintServiceError and show the message.
 */
export const IOPAINT_URL = 'http://127.0.0.1:8080';
export const IOPAINT_START_CMD = 'C:\\Jouhayerk\\swarm\\tools\\iopaint-venv\\Scripts\\iopaint.exe start --model lama --device cuda --port 8080';

export interface IopaintHealth { ok: boolean; model: string }

let healthCache: { at: number; value: IopaintHealth | null } | null = null;
const HEALTH_TTL = 30_000;

/** The server's active model, or null when it is off, unreachable or slow. Cached 30 s; never throws. */
export async function iopaintHealth(force = false): Promise<IopaintHealth | null> {
    if (!force && healthCache && Date.now() - healthCache.at < HEALTH_TTL) return healthCache.value;
    let value: IopaintHealth | null = null;
    try {
        const res = await fetch(`${IOPAINT_URL}/api/v1/model`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
            const j = await res.json();
            if (j && typeof j.name === 'string') value = { ok: true, model: j.name };
        }
    } catch { /* not reachable */ }
    healthCache = { at: Date.now(), value };
    return value;
}

export type IopaintErrorCode = 'busy' | 'timeout' | 'aborted' | 'offline' | 'http' | 'bad-response';

export class IopaintServiceError extends Error {
    code: IopaintErrorCode;
    constructor(code: IopaintErrorCode, message: string) {
        super(message);
        this.name = 'IopaintServiceError';
        this.code = code;
    }
}

export interface IopaintOptions {
    hdStrategy?: 'Original' | 'Resize' | 'Crop';
    cropMargin?: number;
    cropTriggerSize?: number;
    resizeLimit?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Erase the white part of `maskDataUrl` from `imageDataUrl` (both data: URLs at the same pixel size).
 * Resolves to the PNG as a data: URL. Throws IopaintServiceError; the caller decides what to show.
 */
export async function iopaintInpaint(imageDataUrl: string, maskDataUrl: string, opts: IopaintOptions = {}): Promise<string> {
    if (!imageDataUrl.startsWith('data:') || !maskDataUrl.startsWith('data:')) throw new IopaintServiceError('http', 'IOPaint accepts data: URLs only');
    if (opts.signal?.aborted) throw new IopaintServiceError('aborted', 'Cancelled');
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 120_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let res: Response;
    try {
        res = await fetch(`${IOPAINT_URL}/api/v1/inpaint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imageDataUrl,
                mask: maskDataUrl,
                hd_strategy: opts.hdStrategy ?? 'Crop',
                hd_strategy_crop_margin: opts.cropMargin ?? 128,
                hd_strategy_crop_trigger_size: opts.cropTriggerSize ?? 800,
                hd_strategy_resize_limit: opts.resizeLimit ?? 2048,
                ldm_steps: 20,
                ldm_sampler: 'plms',
                cv2_flag: 'INPAINT_NS',
                cv2_radius: 4,
            }),
            signal,
        });
    } catch (e) {
        healthCache = null; // the next health check must ask the server again, not trust the cached "online"
        if (opts.signal?.aborted) throw new IopaintServiceError('aborted', 'Cancelled');
        if (timeout.aborted) throw new IopaintServiceError('timeout', 'IOPaint timed out');
        throw new IopaintServiceError('offline', (e as Error)?.message || 'IOPaint is unreachable');
    }
    if (res.status === 503) throw new IopaintServiceError('busy', 'IOPaint is busy');
    if (!res.ok) throw new IopaintServiceError('http', `IOPaint answered ${res.status}`);
    // The answer is the PNG bytes themselves, not JSON.
    let blob: Blob;
    try {
        blob = await res.blob();
    } catch (e) {
        if (opts.signal?.aborted) throw new IopaintServiceError('aborted', 'Cancelled');
        if (timeout.aborted) throw new IopaintServiceError('timeout', 'IOPaint timed out');
        throw new IopaintServiceError('bad-response', (e as Error)?.message || 'IOPaint returned no image');
    }
    if (!blob.size) throw new IopaintServiceError('bad-response', 'IOPaint returned no image');
    const dataUrl = await blobToDataUrl(blob);
    if (!dataUrl.startsWith('data:image/')) throw new IopaintServiceError('bad-response', 'IOPaint returned no image');
    return dataUrl;
}
