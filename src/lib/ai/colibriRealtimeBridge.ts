/**
 * src/lib/ai/colibriRealtimeBridge.ts
 *
 * Onyx-mx Dual-Mode Colibrì MoE Realtime Bridge (Supabase Realtime wss://)
 *
 * Solves Mixed Content (HTTP vs HTTPS) & Private Network Access restrictions
 * on iOS Safari, Home Screen PWA, Ramses iPhone, and Second Laptop.
 *
 * Bridges Colibrì inference requests transparently across Supabase Realtime:
 * - Remote / Mobile Clients (iPhone, Second Laptop) -> emit COLIBRI_REQ over wss://
 * - G7 Host (Browser tab or Node daemon on G7)     -> receives COLIBRI_REQ, proxies to http://127.0.0.1:8082,
 *                                                     streams SSE tokens back via COLIBRI_STREAM,
 *                                                     and resolves via COLIBRI_RES.
 *
 * Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
 * Co-Authored-By: Antigravity <noreply@google.com>
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';

export interface ColibriHostPresence {
    role: 'colibri-host';
    hostName: string;
    node?: string;
    url?: string;
    models?: string[];
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

class ColibriRealtimeBridge {
    private channel: RealtimeChannel | null = null;
    private clientId: string;
    private isHost: boolean = false;
    private hostProbeInterval: any = null;
    private initialized: boolean = false;

    // Response resolvers for client requests
    private pendingRequests = new Map<
        string,
        {
            resolve: (res: any) => void;
            reject: (err: any) => void;
            onToken?: (token: string) => void;
            onDelta?: (delta: any) => void;
            timer: any;
            stream?: boolean;
        }
    >();

    // Presence tracking of online hosts
    private activeHosts = new Map<string, ColibriHostPresence>();
    private hostStatusListeners = new Set<(online: boolean, host: ColibriHostPresence | null) => void>();
    private isSubscribed = false;
    private subscribeWaiters: Array<() => void> = [];

    constructor() {
        this.clientId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `client_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
    }

    /**
     * Initializes the Supabase Realtime channel and presence subscriptions.
     * Optionally probes loopback to automatically engage Host Mode if on G7.
     */
    public async init(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        try {
            this.channel = supabase.channel(COLIBRI_RELAY_CHANNEL, {
                config: {
                    broadcast: { self: false, ack: false },
                    presence: { key: this.clientId },
                },
            });

            // 1. Presence Sync: track online Colibri Hosts
            this.channel
                .on('presence', { event: 'sync' }, () => {
                    this.updateHostPresence();
                })
                .on('presence', { event: 'join' }, () => {
                    this.updateHostPresence();
                })
                .on('presence', { event: 'leave' }, () => {
                    this.updateHostPresence();
                });

            // 2. Broadcast Listeners: Stream chunks and responses
            this.channel
                .on('broadcast', { event: 'COLIBRI_RES' }, ({ payload }) => {
                    this.handleResponse(payload as ColibriBridgeResponse);
                })
                .on('broadcast', { event: 'COLIBRI_STREAM' }, ({ payload }) => {
                    this.handleStreamChunk(payload as ColibriBridgeStreamChunk);
                })
                .on('broadcast', { event: 'COLIBRI_REQ' }, ({ payload }) => {
                    if (this.isHost) {
                        void this.handleHostRequest(payload as ColibriBridgeRequest);
                    }
                });

            this.channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    this.isSubscribed = true;
                    this.subscribeWaiters.forEach(fn => fn());
                    this.subscribeWaiters = [];
                    // Check if local loopback 127.0.0.1:8082 is reachable to determine if we should be a Host
                    await this.probeLocalHostCandidate();
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    this.isSubscribed = false;
                }
            });

            // Periodic probe to claim or release Host role if Colibrì starts or stops locally
            if (typeof window !== 'undefined') {
                const isLocalHost = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname.includes('192.0.2.71');
                if (isLocalHost) {
                    this.hostProbeInterval = setInterval(() => {
                        void this.probeLocalHostCandidate();
                    }, 15_000);
                }
            }
        } catch (err) {
            console.warn('[ColibriBridge] Failed to initialize Realtime channel:', err);
        }
    }

    /**
     * Inspects active presence to find if any Colibri Host is online
     */
    private updateHostPresence(): void {
        if (!this.channel) return;
        const state = this.channel.presenceState<ColibriHostPresence>();
        this.activeHosts.clear();

        for (const [key, presences] of Object.entries(state)) {
            if (key === this.clientId) continue; // Don't count self as remote host
            for (const p of presences) {
                if (p.role === 'colibri-host') {
                    this.activeHosts.set(key, p);
                }
            }
        }

        const isOnline = this.isHostOnline();
        const host = this.getHostInfo();
        this.hostStatusListeners.forEach(fn => fn(isOnline, host));
    }

    /**
     * Checks if a Colibri Host is online on the Supabase Realtime channel
     */
    public isHostOnline(): boolean {
        if (this.isHost) return true;
        return this.activeHosts.size > 0;
    }

    /**
     * Gets the latest active Colibri Host metadata
     */
    public getHostInfo(): ColibriHostPresence | null {
        if (this.isHost) {
            return {
                role: 'colibri-host',
                hostName: 'G7-Host-Browser',
                node: 'G7',
                url: 'http://127.0.0.1:8082',
                models: ['colibri-glm-5.2-moe', 'colibri-kimi-k3-moe', 'colibri-qwen-2.5-3b'],
                tps: 26.5,
                timestamp: Date.now(),
            };
        }
        for (const h of this.activeHosts.values()) {
            return h;
        }
        return null;
    }

    /**
     * Subscribes to host availability changes
     */
    public onHostStatusChange(cb: (online: boolean, host: ColibriHostPresence | null) => void): () => void {
        this.hostStatusListeners.add(cb);
        cb(this.isHostOnline(), this.getHostInfo());
        return () => this.hostStatusListeners.delete(cb);
    }

    /**
     * Waits for the Realtime channel to reach SUBSCRIBED status
     */
    public async ensureSubscribed(maxWaitMs = 2500): Promise<boolean> {
        await this.init();
        if (this.isSubscribed) return true;
        return new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
                const idx = this.subscribeWaiters.indexOf(done);
                if (idx !== -1) this.subscribeWaiters.splice(idx, 1);
                resolve(this.isSubscribed);
            }, maxWaitMs);

            const done = () => {
                clearTimeout(timer);
                resolve(true);
            };

            this.subscribeWaiters.push(done);
        });
    }

    /**
     * Waits for an active Colibri Host to appear via Realtime Presence
     */
    public async waitForHost(maxWaitMs = 1500): Promise<boolean> {
        if (this.isHostOnline()) return true;
        return new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
                unsub();
                resolve(this.isHostOnline());
            }, maxWaitMs);

            const unsub = this.onHostStatusChange((online) => {
                if (online) {
                    clearTimeout(timer);
                    unsub();
                    resolve(true);
                }
            });
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Host Mode (Proxies requests on G7 machine)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Probes http://127.0.0.1:8082/health to see if this browser tab can act as a Colibri Host
     */
    public async probeLocalHostCandidate(): Promise<boolean> {
        if (typeof window === 'undefined') return false;
        // Only run loopback probe on localhost or local machine to prevent mixed content warnings
        const hostname = window.location.hostname;
        const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
        if (!isLocalHost) {
            return false;
        }

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 600);
            const res = await fetch('http://127.0.0.1:8082/health', {
                signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timer);

            const isAvailable = Boolean(res && res.status === 200);

            if (isAvailable && !this.isHost) {
                // If a daemon is already active, we don't need to override, but can register as browser host
                this.isHost = true;
                if (this.channel) {
                    await this.channel.track({
                        role: 'colibri-host',
                        hostName: 'G7-Host-Browser',
                        node: 'G7-Laptop',
                        url: 'http://127.0.0.1:8082',
                        models: ['colibri-glm-5.2-moe', 'colibri-kimi-k3-moe', 'colibri-qwen-2.5-3b'],
                        tps: 26.5,
                        timestamp: Date.now(),
                    });
                }
                console.log('⚡ [ColibriBridge] Registered this tab as Colibri Host on colibri_relay_global');
            } else if (!isAvailable && this.isHost) {
                this.isHost = false;
                if (this.channel) {
                    await this.channel.untrack();
                }
            }
            return isAvailable;
        } catch {
            if (this.isHost) {
                this.isHost = false;
                if (this.channel) {
                    void this.channel.untrack();
                }
            }
            return false;
        }
    }

    /**
     * Handles an incoming COLIBRI_REQ broadcast by forwarding it to http://127.0.0.1:8082
     */
    private async handleHostRequest(req: ColibriBridgeRequest): Promise<void> {
        if (!this.channel) return;

        // If another dedicated host like G7-Daemon exists, let the daemon handle it first to avoid duplicate responses
        for (const h of this.activeHosts.values()) {
            if (h.hostName && h.hostName.includes('Daemon')) {
                return; // Let daemon handle it
            }
        }

        const targetUrl = `http://127.0.0.1:8082${req.endpoint}`;

        try {
            if (req.stream) {
                // Stream request handling
                const res = await fetch(targetUrl, {
                    method: req.method || 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: req.body ? JSON.stringify(req.body) : undefined,
                });

                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    await this.channel.send({
                        type: 'broadcast',
                        event: 'COLIBRI_RES',
                        payload: {
                            reqId: req.reqId,
                            ok: false,
                            status: res.status,
                            error: `Colibrì error: ${res.status} ${errText}`,
                            timestamp: Date.now(),
                        } as ColibriBridgeResponse,
                    });
                    return;
                }

                if (!res.body) {
                    throw new Error('No body returned from Colibrì stream');
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let chunkIndex = 0;
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data:')) {
                            const dataStr = trimmed.slice(5).trim();
                            if (dataStr === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(dataStr);
                                await this.channel.send({
                                    type: 'broadcast',
                                    event: 'COLIBRI_STREAM',
                                    payload: {
                                        reqId: req.reqId,
                                        delta: parsed,
                                        chunkIndex: chunkIndex++,
                                        timestamp: Date.now(),
                                    } as ColibriBridgeStreamChunk,
                                });
                            } catch {
                                // Ignore unparsable SSE chunks
                            }
                        }
                    }
                }

                // Final OK response after stream completion
                await this.channel.send({
                    type: 'broadcast',
                    event: 'COLIBRI_RES',
                    payload: {
                        reqId: req.reqId,
                        ok: true,
                        status: 200,
                        timestamp: Date.now(),
                    } as ColibriBridgeResponse,
                });
            } else {
                // Non-streaming request handling
                const res = await fetch(targetUrl, {
                    method: req.method || 'GET',
                    headers: req.body ? { 'Content-Type': 'application/json' } : undefined,
                    body: req.body ? JSON.stringify(req.body) : undefined,
                });

                const data = await res.json().catch(() => ({}));
                await this.channel.send({
                    type: 'broadcast',
                    event: 'COLIBRI_RES',
                    payload: {
                        reqId: req.reqId,
                        ok: res.ok,
                        status: res.status,
                        data,
                        timestamp: Date.now(),
                    } as ColibriBridgeResponse,
                });
            }
        } catch (err: any) {
            await this.channel.send({
                type: 'broadcast',
                event: 'COLIBRI_RES',
                payload: {
                    reqId: req.reqId,
                    ok: false,
                    status: 500,
                    error: err?.message || 'Host relay proxy error',
                    timestamp: Date.now(),
                } as ColibriBridgeResponse,
            });
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Client Mode (Runs on iPhone, iPad, Second Laptop, or any HTTPS client)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Executes a non-streaming Colibrì request over the Supabase Realtime Bridge
     */
    public async request<T = any>(
        endpoint: string,
        options?: { method?: string; body?: any; timeoutMs?: number; signal?: AbortSignal }
    ): Promise<T> {
        await this.init();
        await this.ensureSubscribed(2000);

        const reqId = `req_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
        const timeoutMs = options?.timeoutMs ?? 25_000;

        return new Promise<T>((resolve, reject) => {
            const onAbort = () => {
                this.pendingRequests.delete(reqId);
                reject(new Error('Colibrì Realtime request aborted'));
            };

            options?.signal?.addEventListener('abort', onAbort, { once: true });

            const timer = setTimeout(() => {
                this.pendingRequests.delete(reqId);
                options?.signal?.removeEventListener('abort', onAbort);
                reject(new Error(`Colibrì Realtime request timed out after ${timeoutMs}ms (Host offline or busy)`));
            }, timeoutMs);

            this.pendingRequests.set(reqId, {
                resolve: (data: any) => {
                    clearTimeout(timer);
                    options?.signal?.removeEventListener('abort', onAbort);
                    resolve(data);
                },
                reject: (err: any) => {
                    clearTimeout(timer);
                    options?.signal?.removeEventListener('abort', onAbort);
                    reject(err);
                },
                timer,
                stream: false,
            });

            const reqPayload: ColibriBridgeRequest = {
                reqId,
                endpoint,
                method: options?.method || (options?.body ? 'POST' : 'GET'),
                body: options?.body,
                stream: false,
                senderId: this.clientId,
                timestamp: Date.now(),
            };

            this.channel?.send({
                type: 'broadcast',
                event: 'COLIBRI_REQ',
                payload: reqPayload,
            }).catch(err => {
                clearTimeout(timer);
                this.pendingRequests.delete(reqId);
                reject(err);
            });
        });
    }

    /**
     * Executes a streaming chat completion over the Supabase Realtime Bridge
     */
    public async streamChat(
        body: any,
        options?: {
            onToken?: (token: string) => void;
            onDelta?: (delta: any) => void;
            timeoutMs?: number;
            signal?: AbortSignal;
        }
    ): Promise<any> {
        await this.init();
        await this.ensureSubscribed(2000);

        const reqId = `stream_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
        const timeoutMs = options?.timeoutMs ?? 60_000;

        return new Promise((resolve, reject) => {
            const onAbort = () => {
                this.pendingRequests.delete(reqId);
                reject(new Error('Colibrì stream aborted'));
            };

            options?.signal?.addEventListener('abort', onAbort, { once: true });

            let accumulatedText = '';
            let resolvedModel = body.model || 'colibri-glm-5.2-moe';

            const timer = setTimeout(() => {
                this.pendingRequests.delete(reqId);
                options?.signal?.removeEventListener('abort', onAbort);
                reject(new Error(`Colibrì stream timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pendingRequests.set(reqId, {
                resolve: () => {
                    clearTimeout(timer);
                    options?.signal?.removeEventListener('abort', onAbort);
                    resolve({
                        text: accumulatedText,
                        model: resolvedModel,
                    });
                },
                reject: (err) => {
                    clearTimeout(timer);
                    options?.signal?.removeEventListener('abort', onAbort);
                    reject(err);
                },
                onToken: (token: string) => {
                    accumulatedText += token;
                    options?.onToken?.(token);
                },
                onDelta: (delta: any) => {
                    options?.onDelta?.(delta);
                    if (delta.model) resolvedModel = delta.model;
                },
                timer,
                stream: true,
            });

            const reqPayload: ColibriBridgeRequest = {
                reqId,
                endpoint: '/v1/chat/completions',
                method: 'POST',
                body: { ...body, stream: true },
                stream: true,
                senderId: this.clientId,
                timestamp: Date.now(),
            };

            this.channel?.send({
                type: 'broadcast',
                event: 'COLIBRI_REQ',
                payload: reqPayload,
            }).catch(err => {
                clearTimeout(timer);
                this.pendingRequests.delete(reqId);
                reject(err);
            });
        });
    }

    private handleResponse(res: ColibriBridgeResponse): void {
        const pending = this.pendingRequests.get(res.reqId);
        if (!pending) return;

        this.pendingRequests.delete(res.reqId);
        clearTimeout(pending.timer);

        if (!res.ok) {
            pending.reject(new Error(res.error || `Colibrì error (Status ${res.status})`));
        } else {
            pending.resolve(res.data);
        }
    }

    private handleStreamChunk(chunk: ColibriBridgeStreamChunk): void {
        const pending = this.pendingRequests.get(chunk.reqId);
        if (!pending || !pending.stream) return;

        const delta = chunk.delta;
        const choice = delta?.choices?.[0];
        const content = choice?.delta?.content;

        if (content && typeof content === 'string') {
            pending.onToken?.(content);
        }
        pending.onDelta?.(delta);
    }

    /**
     * Diagnostic health probe over Supabase Realtime Relay
     */
    public async test(): Promise<{ ok: boolean; message: string; latencyMs: number }> {
        const start = performance.now();
        await this.init();
        await this.ensureSubscribed(2500);

        // If host isn't marked online yet, wait briefly for presence sync event
        if (!this.isHostOnline()) {
            await this.waitForHost(1500);
        }

        try {
            const health = await this.request<any>('/health', { timeoutMs: 5000 });
            const latencyMs = Math.round(performance.now() - start);
            const host = this.getHostInfo();
            const hostName = host?.hostName || 'G7-Daemon';
            const nvme = health?.telemetry?.nvmeReadMBps ? ` • ${health.telemetry.nvmeReadMBps} MB/s NVMe` : '';
            return {
                ok: true,
                message: `Connected via Supabase Realtime Relay (${hostName}) [online] • Latency: ${latencyMs}ms${nvme} • wss:// Active`,
                latencyMs,
            };
        } catch (err: any) {
            const latencyMs = Math.round(performance.now() - start);
            const host = this.getHostInfo();
            if (!this.isHostOnline() && !host) {
                return {
                    ok: false,
                    message: 'No Colibrì Host online on Supabase Realtime Relay. Start G7 daemon (node scripts/colibri-supabase-relay.cjs) or ensure G7 laptop is awake.',
                    latencyMs,
                };
            }
            return {
                ok: false,
                message: `Relay probe failed: ${err?.message || 'Host did not respond'}`,
                latencyMs,
            };
        }
    }

    /**
     * Closes the bridge and unsubscribes
     */
    public destroy(): void {
        if (this.hostProbeInterval) {
            clearInterval(this.hostProbeInterval);
            this.hostProbeInterval = null;
        }
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
        this.pendingRequests.clear();
        this.initialized = false;
        this.isHost = false;
    }
}

export const colibriRealtimeBridge = new ColibriRealtimeBridge();
