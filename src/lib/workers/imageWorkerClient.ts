import { pixelOps, type PixelOpName } from './imagePixels';

type Ops = typeof pixelOps;
type Result<K extends PixelOpName> = ReturnType<Ops[K]>['result'];

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: unknown) => void; op: PixelOpName }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof Worker === 'undefined') return null;
    const w = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<any>) => {
      const m = e.data;
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error === undefined) p.resolve(m.result);
      else {
        // The worker could not do it: same code, main thread.
        try { p.resolve((pixelOps[p.op] as (x: any) => { result: unknown })(m.payload).result); } catch (err) { p.reject(err); }
      }
    };
    w.onerror = () => {
      // Fatal worker failure: stop using it and fail what is in flight.
      worker = null;
      w.terminate();
      pending.forEach(p => p.reject(new Error('Image worker failed')));
      pending.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Run a pure pixel op off the main thread. `payload.data` (an RGBA buffer) is
 * transferred, so the caller must not use it afterwards. Falls back to the same
 * code on the main thread when Worker is unavailable.
 */
export function runPixelOp<K extends PixelOpName>(op: K, payload: Parameters<Ops[K]>[0]): Promise<Result<K>> {
  const w = getWorker();
  if (!w) {
    return new Promise(resolve => resolve((pixelOps[op] as (x: any) => { result: any })(payload).result));
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, op });
    const buf = (payload as any).data?.buffer as ArrayBuffer | undefined;
    w.postMessage({ id, op, payload }, buf ? [buf] : []);
  });
}

/** canvas.toBlob encodes off the main thread; same encoder as toDataURL. */
export function canvasToDataUrl(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') return resolve(canvas.toDataURL(type, quality));
    canvas.toBlob(blob => {
      if (!blob) return resolve(canvas.toDataURL(type, quality));
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    }, type, quality);
  });
}

/** Let input and paint have a turn. */
export function yieldToBrowser(): Promise<void> {
  const s = (globalThis as any).scheduler as { yield?: () => Promise<void> } | undefined;
  if (s?.yield) return s.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}
