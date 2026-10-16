/**
 * src/lib/ai/colibriRealtimeBridge.ts
 *
 * DISABLED (owner decision, 16 Oct 2026): the Supabase Realtime relay for Colibrì stays off until it is secured.
 *
 * The old bridge broadcast prompts and answers on one public, unauthenticated Realtime channel
 * ('colibri_relay_global', no `private: true`, no RLS on realtime.messages), accepted any client that claimed
 * `role: 'colibri-host'` in presence, and let the host forward any endpoint to the local engine. Anyone holding the
 * public anon key could read every prompt, forge answers and drive the owner's GPU.
 *
 * This module therefore never touches Supabase: it opens no channel, tracks no presence, sends nothing, and reports
 * "no host online". It keeps its exported names and types because other files import them. Re-enabling it needs a
 * private channel with RLS, an allowlisted host identity, an endpoint allowlist and rate limits; see
 * docs/ai/COLIBRI_WINDOWS_SETUP.md ("Relay").
 */

export interface ColibriHostPresence {
    role: 'colibri-host';
    hostName: string;
    node?: string;
    url?: string;
    models?: string[];
    /** Measured tokens per second, only when a real measurement exists. */
    tps?: number;
    timestamp: number;
}

export interface ColibriBridgeRequest {
    reqId: string;
    endpoint: string;
    method?: string;
    body?: any;
    stream?: boolean;
    senderId: string;
    timestamp: number;
}

export interface ColibriBridgeStreamChunk {
    reqId: string;
    delta: any;
    chunkIndex: number;
    timestamp: number;
}

export interface ColibriBridgeResponse {
    reqId: string;
    ok: boolean;
    status: number;
    data?: any;
    error?: string;
    timestamp: number;
}

export const COLIBRI_RELAY_CHANNEL = 'colibri_relay_global';

/** Why the relay is off; shown wherever the old relay status used to be. */
export const COLIBRI_RELAY_DISABLED_REASON = 'The Colibrì Realtime relay is disabled until it is secured';

class ColibriRealtimeBridge {
    /** The relay is disabled, so the bridge is always "available: false". */
    public readonly available = false;

    /** No-op: never subscribes to Supabase. */
    public async init(): Promise<void> {
        /* disabled */
    }

    public isHostOnline(): boolean {
        return false;
    }

    public getHostInfo(): ColibriHostPresence | null {
        return null;
    }

    /** Calls back once with "offline" (so UI state settles) and never again. */
    public onHostStatusChange(cb: (online: boolean, host: ColibriHostPresence | null) => void): () => void {
        cb(false, null);
        return () => { /* nothing registered */ };
    }

    public async ensureSubscribed(_maxWaitMs = 2500): Promise<boolean> {
        return false;
    }

    public async waitForHost(_maxWaitMs = 1500): Promise<boolean> {
        return false;
    }

    public async probeLocalHostCandidate(): Promise<boolean> {
        return false;
    }

    public async request<T = any>(
        _endpoint: string,
        _options?: { method?: string; body?: any; timeoutMs?: number; signal?: AbortSignal },
    ): Promise<T> {
        throw new Error(COLIBRI_RELAY_DISABLED_REASON);
    }

    public async streamChat(
        _body: any,
        _options?: {
            onToken?: (token: string) => void;
            onDelta?: (delta: any) => void;
            timeoutMs?: number;
            signal?: AbortSignal;
        },
    ): Promise<any> {
        throw new Error(COLIBRI_RELAY_DISABLED_REASON);
    }

    public async test(): Promise<{ ok: boolean; message: string; latencyMs: number }> {
        return { ok: false, message: COLIBRI_RELAY_DISABLED_REASON, latencyMs: 0 };
    }

    public destroy(): void {
        /* nothing to close */
    }
}

export const colibriRealtimeBridge = new ColibriRealtimeBridge();
