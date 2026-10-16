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
    // Background replacement. Nano Banana 2.1 is the newest image edit model (the 3.1 preview id was scheduled off on
    // 2026-06-25, so it is gone from the chain). Whether generateContent with imageConfig behaves the same on 2.1 is NOT
    // proven (its docs show the Interactions API): the fallbacks keep the old proven path, so a rejection costs one failed
    // call per item, not the batch. 2.5 already proved it works against our key. Check a run log after the change.
    bgReplace: {
        model: 'gemini-nano-banana-2.1',
        fallbacks: ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'],
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

/**
 * Colibrì (local engine, C:\colibri, OpenAI API at http://127.0.0.1:8000/v1).
 *
 * The real server loads ONE model at a time and rejects any other model id with 404 model_not_found, so the list of
 * models is never fixed here: providers/colibri.ts reads GET /v1/models at runtime. These constants only name the
 * ids measured on the owner's PC (hints for the picker while the server is down) and the 'auto' alias, which means
 * "use whatever model the server has loaded". Colibrì is text only (input_modalities ["text"]).
 */
export const COLIBRI_AUTO_MODEL = 'auto';
/** Default local model (owner decision, 16 Oct 2026): Qwen3.6-35B-A3B. */
export const COLIBRI_DEFAULT_MODEL_ID = 'qwen3.6-colibri';

export const COLIBRI_MODELS = [
    'auto',
    'qwen3.6-colibri',
    'qwen3-coder-30b-a3b-colibri',
] as const;

export type ColibriModel = (typeof COLIBRI_MODELS)[number];

export interface ColibriModelSpec {
    id: ColibriModel;
    name: string;
    description: string;
    /** Unknown until the server reports one; never invented. */
    contextLength?: number;
}

export const COLIBRI_MODEL_SPECS: Record<ColibriModel, ColibriModelSpec> = {
    auto: {
        id: 'auto',
        name: 'Loaded model',
        description: 'Uses the one model the Colibrì server has loaded right now',
    },
    'qwen3.6-colibri': {
        id: 'qwen3.6-colibri',
        name: 'Qwen3.6-35B-A3B',
        description: 'Default local model. Text only, slow on this PC (about 0.5 tokens per second)',
    },
    'qwen3-coder-30b-a3b-colibri': {
        id: 'qwen3-coder-30b-a3b-colibri',
        name: 'Qwen3-Coder-30B-A3B',
        description: 'Code-tuned local model. Text only, slow on this PC',
    },
};
