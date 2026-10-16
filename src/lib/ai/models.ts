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

/** Colibrì Local MoE models streamed over NVMe */
export const COLIBRI_MODELS = [
    'auto',
    'colibri-glm-5.2-moe',
    'colibri-kimi-k3-moe',
    'colibri-qwen-2.5-3b',
] as const;

export type ColibriModel = (typeof COLIBRI_MODELS)[number];

export interface ColibriModelSpec {
    id: ColibriModel;
    name: string;
    description: string;
    contextLength: number;
}

export const COLIBRI_MODEL_SPECS: Record<ColibriModel, ColibriModelSpec> = {
    auto: {
        id: 'auto',
        name: 'Auto (Smart MoE Routing)',
        description: 'Dynamically routes tasks: Chat ➔ GLM-5.2, Translate ➔ Qwen-2.5, Content/JSON ➔ Kimi-K3',
        contextLength: 131072,
    },
    'colibri-glm-5.2-moe': {
        id: 'colibri-glm-5.2-moe',
        name: 'Colibrì GLM-5.2 MoE',
        description: 'High-throughput local Mixture-of-Experts with NVMe weight streaming',
        contextLength: 32768,
    },
    'colibri-kimi-k3-moe': {
        id: 'colibri-kimi-k3-moe',
        name: 'Colibrì Kimi-K3 MoE',
        description: 'Long-context reasoning MoE optimized for low memory footprint',
        contextLength: 131072,
    },
    'colibri-qwen-2.5-3b': {
        id: 'colibri-qwen-2.5-3b',
        name: 'Colibrì Qwen 2.5 3B',
        description: 'Dense low-latency edge model for fast tool-calling and chat',
        contextLength: 32768,
    },
};

