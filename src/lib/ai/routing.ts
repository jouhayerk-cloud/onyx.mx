import type { ProviderId } from './providers/types';
import { AI_CONFIG_EVENT } from './providerKeys';

/**
 * Which provider and model serve each text or vision JSON job. Default is Gemini, exactly as before.
 * 'chat' is the Onyx agent (tool calling, see useOnyxAgent). Image and video jobs (bgReplace, video) are not routable: they stay on Gemini.
 */
export type RouteJob = 'content' | 'segmentation' | 'translate' | 'chat';
export const ROUTABLE_JOBS: readonly RouteJob[] = ['content', 'segmentation', 'translate', 'chat'];

export interface Route { provider: ProviderId; model?: string }

const STORAGE_KEY = 'ONYX_AI_ROUTES';
const DEFAULT_ROUTE: Route = { provider: 'gemini' };
const PROVIDERS: readonly ProviderId[] = ['gemini', 'anthropic', 'openai', 'compat', 'companion', 'colibri'];

/**
 * Providers that read text only (Colibrì: input_modalities ["text"]) and the jobs that are about pictures.
 * A text-only provider is never offered or used for those jobs; a saved route that points there is ignored.
 * Content jobs may carry photos too: client.ts refuses to send images to a provider without vision.
 */
export const TEXT_ONLY_PROVIDERS: readonly ProviderId[] = ['colibri'];
export const IMAGE_JOBS: readonly RouteJob[] = ['segmentation'];

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
