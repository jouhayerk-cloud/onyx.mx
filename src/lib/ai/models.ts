/**
 * Which model each AI job uses. No other file hard-codes a model id.
 *
 * There were thirty-odd literals spread over the app, including retired 1.5
 * models still used as fallbacks and gemini-2.0-flash (scheduled for
 * retirement) for translation. Changing a model now means changing one line
 * here, and the run log names the job rather than a guess at the id.
 */

export type AiJob = 'content' | 'segmentation' | 'translate' | 'bgReplace' | 'video';

/** Concurrency class a job counts against; see limiter.ts. */
export type AiJobClass = 'text' | 'image' | 'video';

export interface AiModelSpec {
    /** Tried first. */
    model: string;
    /** Tried in order when the model above rejects the request outright. */
    fallbacks?: readonly string[];
    /**
     * Gemini 2.5 thinking budget in tokens. Omitted = the model's default.
     * 0 turns thinking off, which Google recommends for spatial (box/polygon)
     * work and which keeps short structured calls fast.
     */
    thinkingBudget?: number;
    /** Default request timeout. */
    timeoutMs: number;
    jobClass: AiJobClass;
}

export const AI_MODELS: Record<AiJob, AiModelSpec> = {
    // Title, marketing HTML, colours and type. Thinking stays on: this is the
    // copy that ships, and it was tuned with thinking on. The timeout is longer
    // than the old 40s because thinking plus 1200 characters of HTML did not
    // always fit inside it.
    content: { model: 'gemini-2.5-flash', timeoutMs: 60000, jobClass: 'text' },
    segmentation: { model: 'gemini-2.5-flash', thinkingBudget: 0, timeoutMs: 40000, jobClass: 'text' },
    translate: { model: 'gemini-2.5-flash', thinkingBudget: 0, timeoutMs: 30000, jobClass: 'text' },
    // Background replacement. 3.1 is the only one that can return 2K, which
    // matters because source photos are ~4000px and 1K is a visible downgrade
    // in the catalogue. 2.5 is the fallback because it already proved it works
    // against our key -- if the preview model is not enabled on the account we
    // still produce an image rather than failing the batch.
    bgReplace: {
        model: 'gemini-3.1-flash-image-preview',
        fallbacks: ['gemini-2.5-flash-image'],
        timeoutMs: 180000,
        jobClass: 'image',
    },
    video: { model: 'models/gemini-omni-flash-preview', timeoutMs: 300000, jobClass: 'video' },
};

/** The model, then its fallbacks: the order to try them in. */
export const modelChain = (job: AiJob): string[] => {
    const spec = AI_MODELS[job];
    return [spec.model, ...(spec.fallbacks || [])];
};
