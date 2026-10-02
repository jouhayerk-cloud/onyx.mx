/**
 * One semaphore per job class, shared by every screen.
 *
 * Concurrency used to be a per-surface constant -- three in the Catalog Hub,
 * two in Batch Create, serial in the variation pass, fixed 10-20 s sleeps in
 * BatchActionsModal -- so two surfaces running at once doubled the request
 * rate and nothing knew. Every Gemini request now takes a slot here first,
 * whichever screen it came from, and the sleeps can go.
 *
 * Classes are separate because their quotas are: a queue of image generations
 * must not starve the text calls that run beside them.
 */
import type { AiJobClass } from './models';
import { AiCancelledError } from './errors';

class Semaphore {
    private active = 0;
    private waiters: Array<() => void> = [];

    constructor(private readonly limit: number) {}

    /** Resolves once a slot is held. Rejects if `signal` aborts while waiting. */
    acquire(signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) return Promise.reject(new AiCancelledError());
        if (this.active < this.limit) {
            this.active++;
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            const grant = () => {
                signal?.removeEventListener('abort', onAbort);
                this.active++;
                resolve();
            };
            const onAbort = () => {
                this.waiters = this.waiters.filter(w => w !== grant);
                reject(new AiCancelledError());
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            this.waiters.push(grant);
        });
    }

    release(): void {
        this.active = Math.max(0, this.active - 1);
        const next = this.waiters.shift();
        if (next) next();
    }

    async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
        await this.acquire(signal);
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

/**
 * Text calls are cheap and fast; four in flight keeps a batch moving without
 * tripping the per-minute limit. Image generation is slow and expensive, and a
 * 429 there used to walk the whole model chain, so two. Video is one at a time.
 */
const LIMITS: Record<AiJobClass, number> = { text: 4, image: 2, video: 1 };

const semaphores: Record<AiJobClass, Semaphore> = {
    text: new Semaphore(LIMITS.text),
    image: new Semaphore(LIMITS.image),
    video: new Semaphore(LIMITS.video),
};

/** Run `fn` while holding a slot of `jobClass`. */
export function withAiSlot<T>(jobClass: AiJobClass, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return semaphores[jobClass].run(fn, signal);
}
