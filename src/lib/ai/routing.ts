import type { ProviderId } from './providers/types';
import { AI_CONFIG_EVENT, getProviderConfig } from './providerKeys';
import { colibriProvider, fetchColibriModels } from './providers/colibri';
import { layaHealthy, LAYA_BASE_URL } from './providers/laya';

/**
 * Which provider and model serve each text or vision JSON job. Default is Gemini, exactly as before.
 * 'chat' is the Onyx agent (tool calling, see useOnyxAgent). Image and video jobs (bgReplace, video) are not routable: they stay on Gemini.
 */
export type RouteJob =
    | 'content'
    | 'segmentation'
    | 'translate'
    | 'chat'
    | 'bgRemove'
    | 'bgReplace'
    | 'embeddings'
    | 'tts'
    | 'stt'
    | 'triage';
export const ROUTABLE_JOBS: readonly RouteJob[] = [
    'content',
    'segmentation',
    'translate',
    'chat',
    'bgRemove',
    'bgReplace',
    'embeddings',
    'tts',
    'stt',
    'triage',
];

export interface Route { provider: ProviderId; model?: string }

const STORAGE_KEY = 'ONYX_AI_ROUTES';
const DEFAULT_ROUTE: Route = { provider: 'gemini' };
const PROVIDERS: readonly ProviderId[] = ['gemini', 'anthropic', 'openai', 'compat', 'companion', 'colibri'];

/**
 * Providers that read text only (Colibrì: input_modalities ["text"], Companion: vision not yet enabled)
 * and the jobs that are about pictures. A text-only provider is never offered or used for those jobs;
 * a saved route that points there is ignored.
 * Content jobs may carry photos too: client.ts refuses to send images to a provider without vision.
 */
export const TEXT_ONLY_PROVIDERS: readonly ProviderId[] = ['colibri', 'companion'];
export const IMAGE_JOBS: readonly RouteJob[] = ['segmentation', 'bgRemove', 'bgReplace'];

/** False when the provider cannot do the job (a text-only provider for an image job). */
export function providerAllowedForJob(provider: ProviderId, job: RouteJob): boolean {
    return !(TEXT_ONLY_PROVIDERS.includes(provider) && IMAGE_JOBS.includes(job));
}

const readAll = (): Partial<Record<RouteJob, Route>> => {
    try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
};

export function getRoute(job: RouteJob): Route {
    const r = readAll()[job];
    return r && PROVIDERS.includes(r.provider) && providerAllowedForJob(r.provider, job)
        ? { provider: r.provider, model: r.model || undefined }
        : DEFAULT_ROUTE;
}

/** null puts the job back on Gemini. */
export function setRoute(job: RouteJob, route: Route | null): void {
    const all = readAll();
    if (route && !providerAllowedForJob(route.provider, job)) delete all[job];   // refused: stays on Gemini
    else if (route && route.provider !== 'gemini') all[job] = { provider: route.provider, model: route.model || undefined };
    else if (route && route.model) all[job] = { provider: 'gemini', model: route.model };
    else delete all[job];
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        window.dispatchEvent(new Event(AI_CONFIG_EVENT));
    } catch { /* storage blocked */ }
}

// ── Local models for Book 826 (AI_PROCESS_826_PLAN section D) ────────────────
// Both are optional. A failed probe only means the pipeline runs without them.

export interface LocalHealth826 { laya: boolean; colibri: boolean; checkedAt: number }
export type LocalStep826 = 'classify_check' | 'short_qa' | 'copy_826' | 'character_ai';
export type LocalTarget826 = 'laya' | 'colibri' | 'gemini' | null;

const LOCAL_HEALTH_TTL_MS = 30_000;
let localHealthCache: LocalHealth826 | null = null;

/**
 * Laya (GET /health) and Colibri (GET /v1/models) probed with a 2000 ms timeout, cached for 30 s.
 * Never throws: an unreachable server reads as false.
 */
export async function checkLocalModelsHealth(force = false): Promise<LocalHealth826> {
    if (!force && localHealthCache && Date.now() - localHealthCache.checkedAt < LOCAL_HEALTH_TTL_MS) return localHealthCache;
    const [laya, colibri] = await Promise.all([
        layaHealthy(LAYA_BASE_URL, 2000),
        fetchColibriModels(getProviderConfig('colibri'), true).then(ids => ids !== null, () => false),
    ]);
    localHealthCache = { laya, colibri, checkedAt: Date.now() };
    return localHealthCache;
}

/**
 * Which engine a Book 826 step may use. Laya only checks and never sets the canonical type. Colibri only
 * does short fixes. copy_826 and character_ai stay on Gemini: a 600 to 750 character body takes about
 * 176 s on Colibri, so a batch of them would take hours.
 */
export function localTargetFor826(step: LocalStep826, health: LocalHealth826): LocalTarget826 {
    if (step === 'classify_check') return health.laya ? 'laya' : null;
    if (step === 'short_qa') return health.colibri ? 'colibri' : null;
    return 'gemini';
}

/** One Colibri call in flight at a time, whichever caller asks. */
let colibriTail: Promise<unknown> = Promise.resolve();

/**
 * Colibri rewrites one sentence with a 35 token cap. Null when Colibri is down or the call fails,
 * and the caller keeps the original sentence.
 */
export async function colibriRewriteSentence826(sentence: string, problem: string): Promise<string | null> {
    if (!(await checkLocalModelsHealth()).colibri) return null;
    const cfg = getProviderConfig('colibri');
    const run = colibriTail.then(async (): Promise<string | null> => {
        try {
            const res = await colibriProvider.generateText(cfg, {
                system: 'You edit one sentence of Book 826 catalogue copy. Reply with the rewritten sentence only.',
                prompt: `Rewrite this sentence so it has no ${problem}. Keep every fact. Plain text, no HTML.\n\n${sentence}`,
                temperature: 0.2,
                maxTokens: 35,
                timeoutMs: 90_000,
            });
            return res.text.trim() || null;
        } catch {
            return null;
        }
    });
    colibriTail = run.catch(() => null);
    return run;
}
