/**
 * Which model each AI job uses. No other file hard-codes a model id.
 *
 * There were thirty-odd literals spread over the app, including retired 1.5
 * models still used as fallbacks and gemini-2.0-flash (scheduled for
 * retirement) for translation. Changing a model now means changing one line
 * here, and the run log names the job rather than a guess at the id.
 */

export type AiJob =
    | 'content'
    | 'segmentation'
    | 'translate'
    | 'bgReplace'
    | 'video'
    | 'triage';

/** Concurrency class a job counts against; see limiter.ts. */
export type AiJobClass = 'text' | 'image' | 'video';

/** Current Google Gemini API model IDs (Gemini 4 / 3.8 / 3.5 / Nano Banana / Omni / Live). */
export const GEMINI_4_HYDROGEN = 'gemini-4-hydrogen';
export const GEMINI_4_ARGON = 'gemini-4-argon';
export const GEMINI_4_NEON = 'gemini-4-neon';
export const GEMINI_4_CARBON = 'gemini-4-carbon';
export const GEMINI_3_8_FLASH = 'gemini-3.8-flash';
export const GEMINI_3_5_FLASH_LITE = 'gemini-3.5-flash-lite';
export const GEMINI_NANO_BANANA_2_1 = 'gemini-nano-banana-2.1';
export const GEMINI_3_1_FLASH_LITE_IMAGE = 'gemini-3.1-flash-lite-image';
export const GEMINI_3_PRO_IMAGE = 'gemini-3-pro-image';
export const GEMINI_OMNI_1_2_FLASH = 'gemini-omni-1.2-flash';
export const GEMINI_3_8_LIVE = 'gemini-3.8-live';

/** Deprecated compatibility aliases mapped to modern Gemini 4 / 3.8 models. */
export const GEMINI_2_5_FLASH = GEMINI_4_HYDROGEN;
export const TODO_GEMINI_4_ARGON = GEMINI_4_ARGON;

/** Selectable Gemini models for routing and manual selection. */
export const GEMINI_SELECTABLE_MODELS = [
    GEMINI_4_HYDROGEN,
    GEMINI_3_8_FLASH,
    GEMINI_4_ARGON,
    GEMINI_4_NEON,
    GEMINI_4_CARBON,
    GEMINI_3_5_FLASH_LITE,
] as const;

export type GeminiThinkingLevel = 'low' | 'medium' | 'high' | 'xhigh';

export interface AiModelSpec {
    /** Tried first. */
    model: string;
    /** Tried in order when the model above rejects the request outright. */
    fallbacks?: readonly string[];
    /**
     * Gemini 3/4 thinking level ('low' | 'medium' | 'high' | 'xhigh').
     * Replaces legacy numeric thinkingBudget on modern Gemini models.
     */
    thinkingLevel?: GeminiThinkingLevel;
    /**
     * Legacy Gemini thinking budget in tokens (used only by non-Gemini-3/4 fallbacks).
     */
    thinkingBudget?: number;
    /** Default request timeout. */
    timeoutMs: number;
    jobClass: AiJobClass;
}

export const AI_MODELS: Record<AiJob, AiModelSpec> = {
    // Title, marketing HTML, colours and type. Uses Gemini 4 Hydrogen with 3.8 Flash / 4 Argon fallbacks.
    content: {
        model: GEMINI_4_HYDROGEN,
        fallbacks: [GEMINI_3_8_FLASH, GEMINI_4_ARGON],
        thinkingLevel: 'medium',
        timeoutMs: 90000,
        jobClass: 'text',
    },
    // Spatial (box/polygon) work: low thinking for speed and coordinate precision.
    segmentation: {
        model: GEMINI_4_HYDROGEN,
        fallbacks: [GEMINI_3_8_FLASH],
        thinkingLevel: 'low',
        timeoutMs: 45000,
        jobClass: 'text',
    },
    // Fast translation notes via Gemini 3.5 Flash-Lite.
    translate: {
        model: GEMINI_3_5_FLASH_LITE,
        fallbacks: [GEMINI_4_HYDROGEN, GEMINI_3_8_FLASH],
        thinkingLevel: 'low',
        timeoutMs: 30000,
        jobClass: 'text',
    },
    // Background replacement and scene composition via Nano Banana 2.1 + current image fallbacks.
    bgReplace: {
        model: GEMINI_NANO_BANANA_2_1,
        fallbacks: [GEMINI_3_1_FLASH_LITE_IMAGE, GEMINI_3_PRO_IMAGE],
        timeoutMs: 180000,
        jobClass: 'image',
    },
    video: { model: GEMINI_OMNI_1_2_FLASH, timeoutMs: 300000, jobClass: 'video' },
    // Fast decision / intent triage via Gemini 3.5 Flash-Lite.
    triage: {
        model: GEMINI_3_5_FLASH_LITE,
        fallbacks: [GEMINI_4_HYDROGEN, GEMINI_3_8_FLASH],
        thinkingLevel: 'low',
        timeoutMs: 15000,
        jobClass: 'text',
    },
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
