/**
 * Typed AI failures.
 *
 * Every AI call used to fail as a bare Error whose message was whatever the
 * transport said -- often a 2 KB JSON body -- and most call sites only sent it
 * to console.error. Each class here carries a short `message` written for a
 * toast or a run-log line, so the person running a batch can tell "no key"
 * from "out of quota" from "the model answered nonsense" without devtools.
 */

export type AiErrorCode = 'key_missing' | 'quota' | 'timeout' | 'cancelled' | 'response';

export class AiError extends Error {
    readonly code: AiErrorCode;
    /** HTTP status when the failure came from the API. */
    readonly status?: number;
    /** The raw detail (response body, finishReason...), for the console only. */
    readonly detail?: string;

    constructor(code: AiErrorCode, message: string, opts: { status?: number; detail?: string; cause?: unknown } = {}) {
        super(message);
        this.name = new.target.name;
        this.code = code;
        this.status = opts.status;
        this.detail = opts.detail;
        if (opts.cause !== undefined) (this as any).cause = opts.cause;
    }
}

export class AiKeyMissingError extends AiError {
    constructor() {
        super('key_missing', 'No Gemini API key is set');
    }
}

/** HTTP 429 / RESOURCE_EXHAUSTED, after the client's own retry. */
export class AiQuotaError extends AiError {
    constructor(detail?: string) {
        super('quota', 'Gemini quota or rate limit reached; try again in a minute', { status: 429, detail });
    }
}

export class AiTimeoutError extends AiError {
    constructor(timeoutMs: number) {
        super('timeout', `Gemini did not answer within ${Math.round(timeoutMs / 1000)}s`);
    }
}

export class AiCancelledError extends AiError {
    constructor() {
        super('cancelled', 'Cancelled by user');
    }
}

/**
 * The model answered, but not with something usable: a non-OK status other
 * than 429, a blocked prompt, a truncated or empty answer, or JSON that does
 * not parse.
 */
export class AiResponseError extends AiError {
    constructor(message: string, opts: { status?: number; detail?: string; cause?: unknown } = {}) {
        super('response', message, opts);
    }
}

export const isAiError = (err: unknown): err is AiError => err instanceof AiError;

/** A one-line message for any failure, typed or not, fit for a toast or log. */
export const aiErrorMessage = (err: unknown): string => {
    if (err instanceof AiError) return err.message;
    if (err instanceof Error) return err.message || err.name;
    return String(err ?? 'Unknown error');
};
