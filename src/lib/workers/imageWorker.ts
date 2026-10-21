/// <reference lib="webworker" />
import { pixelOps, type PixelOpName } from './imagePixels';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<{ id: number; op: PixelOpName; payload: any }>) => {
  const { id, op, payload } = e.data;
  try {
    const { result, transfer } = (pixelOps[op] as (p: any) => { result: unknown; transfer: ArrayBuffer[] })(payload);
    scope.postMessage({ id, result }, transfer);
  } catch (error) {
    // Hand the buffer back so the caller can redo the work on the main thread.
    const buf = payload?.data?.buffer as ArrayBuffer | undefined;
    scope.postMessage({ id, error: String(error), payload }, buf && buf.byteLength ? [buf] : []);
  }
};
