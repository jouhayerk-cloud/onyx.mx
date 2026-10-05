/**
 * Transport-agnostic MCP bridge between the Onyx app agent and the OnyxChan robot (see docs/ai/MCP_APP_BRIDGE_PLAN.md).
 *
 *  - outgoing: the app agent calls robot tools (speak, set_expression, ...) with bridge.call();
 *  - incoming: the robot (through the gateway / onyx-mcp) calls tools the app exposes (counts, current view, navigation).
 *
 * No network code lives here: a McpTransport is injected (LoopbackTransport for tests). Nothing in this file holds a
 * credential; the transport owns authentication. Server-side enforcement (onyx-mcp, roles.json field allowlists) stays
 * authoritative: the checks below are a second, client-side gate and never replace it.
 */
import { tr, trf } from '../../../lib/i18n';
import type { OnyxAgentOptions } from '../useOnyxAgent';
import {
  buildError,
  buildResponse,
  buildToolCall,
  isJsonObject,
  isJsonRpcFailure,
  isJsonRpcRequest,
  isJsonRpcResponse,
  newEnvelopeId,
  validateEnvelope,
  type ContractErrorCode,
  type JsonObject,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpEnvelope
} from './envelope';

// ---------------------------------------------------------------------------
// Roles, scopes, risk
// ---------------------------------------------------------------------------

export type ContractRole = 'voice' | 'staff-device' | 'staff' | 'agent' | 'gateway';

/** App roles as listed in roles.json (staff.who). The agent's own AppRole type in appTools.ts only knows four of them. */
export type McpAppRole =
  | 'Developer'
  | 'Admin'
  | 'ClientBoss'
  | 'ClientAccounting'
  | 'ClientViewer'
  | 'Vendor'
  | 'Client';

/** Placeholder scope names (roles.json agent.scopes.names_final === false). */
export type McpScope = 'read' | 'device-command' | 'payment' | 'cost';

export type ToolRisk = 'read' | 'navigate' | 'robot' | 'write';

export const FINANCE_APP_ROLES: readonly McpAppRole[] = ['Developer', 'Admin', 'ClientBoss', 'ClientAccounting'];
const ROBOT_APP_ROLES: readonly McpAppRole[] = ['Developer', 'Admin'];
const ALL_DEVICES_APP_ROLES: readonly McpAppRole[] = ['Admin'];

export interface McpCaller {
  role: ContractRole;
  appRole?: McpAppRole;
  /** Device the call comes from (voice / staff-device) or targets. */
  deviceId?: string;
  scopes?: readonly McpScope[];
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export type McpMessageHandler = (envelope: McpEnvelope) => void;

export interface McpTransport {
  send(envelope: McpEnvelope): void | Promise<void>;
  /** Returns an unsubscribe function when the transport supports it. */
  onMessage(handler: McpMessageHandler): void | (() => void);
}

/** In-memory transport for tests. Use createLoopbackPair() to get two connected ends. Delivery is asynchronous. */
export class LoopbackTransport implements McpTransport {
  private peer: LoopbackTransport | null = null;
  private handlers = new Set<McpMessageHandler>();
  /** Everything this end sent, in order (handy in assertions). */
  readonly sent: McpEnvelope[] = [];
  /** When true, send() rejects (simulates a dropped link). */
  failSends = false;

  connect(peer: LoopbackTransport): void {
    this.peer = peer;
  }

  send(envelope: McpEnvelope): Promise<void> {
    if (this.failSends) return Promise.reject(new Error('loopback link down'));
    this.sent.push(envelope);
    const target = this.peer;
    if (target) queueMicrotask(() => target.deliver(envelope));
    return Promise.resolve();
  }

  onMessage(handler: McpMessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Injects a frame as if the peer had sent it. */
  deliver(envelope: McpEnvelope): void {
    for (const handler of Array.from(this.handlers)) handler(envelope);
  }
}

export function createLoopbackPair(): [LoopbackTransport, LoopbackTransport] {
  const a = new LoopbackTransport();
  const b = new LoopbackTransport();
  a.connect(b);
  b.connect(a);
  return [a, b];
}

// ---------------------------------------------------------------------------
// Tool definitions and catalog
// ---------------------------------------------------------------------------

export interface JsonSchemaProp {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: readonly string[];
  items?: JsonSchemaProp;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
}

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProp>;
  required?: readonly string[];
}

export interface RateLimit {
  max: number;
  windowMs: number;
}

export interface ToolInvocation {
  caller: McpCaller;
  requestId: string;
}

export interface McpToolDefinition {
  /** Contract name (onyxchanTools.ts / onyxDataTools.ts) unless the plan marks it as new. */
  name: string;
  description: string;
  /** 'expose': the app serves it to the robot. 'call': the app agent calls it on the robot side. */
  direction: 'expose' | 'call';
  risk: ToolRisk;
  inputSchema: JsonSchemaObject;
  /** Contract roles allowed to invoke it. For 'call' tools the app acts as `staff` (or `agent`). */
  roles: readonly ContractRole[];
  /** App roles allowed (staff and agent callers). Unset: any app role. */
  appRoles?: readonly McpAppRole[];
  /** Scopes an agent (PAT) caller needs. Default: read for risk read, device-command otherwise. */
  scopes?: readonly McpScope[];
  /** State-changing calls need a confirmation. Always true for risk 'write'. */
  requiresConfirmation?: boolean;
  rateLimit?: RateLimit;
  /** Calls sharing a group share one limiter (all robot tools together, like robotTools.ts). */
  rateGroup?: string;
  /** 'call' tools: the target is a device; device_id is injected and checked against assignments. */
  targetsDevice?: boolean;
  /** 'call' tools: name the app agent sees (appTools.ts / robotTools.ts naming). */
  agentName?: string;
  /** 'call' tools: converts the agent's arguments to the contract arguments. */
  mapAgentArgs?: (args: JsonObject) => JsonObject;
  /** 'expose' tools: the implementation. */
  handler?: (args: JsonObject, ctx: ToolInvocation) => Promise<unknown>;
}

type AgentToolPack = NonNullable<OnyxAgentOptions['extraTools']>[number];

const GEMINI_TYPE: Record<JsonSchemaProp['type'], string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT'
};

function toGeminiProp(prop: JsonSchemaProp): Record<string, unknown> {
  const out: Record<string, unknown> = { type: GEMINI_TYPE[prop.type] };
  if (prop.description) out.description = prop.description;
  if (prop.enum) out.enum = [...prop.enum];
  if (prop.items) out.items = toGeminiProp(prop.items);
  return out;
}

export class ToolCatalog {
  private readonly tools = new Map<string, McpToolDefinition>();

  register(def: McpToolDefinition): this {
    if (this.tools.has(def.name)) throw new Error(`duplicate tool: ${def.name}`);
    this.tools.set(def.name, def);
    return this;
  }

  registerAll(defs: readonly McpToolDefinition[]): this {
    for (const def of defs) this.register(def);
    return this;
  }

  get(name: string): McpToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(direction?: McpToolDefinition['direction']): McpToolDefinition[] {
    const all = Array.from(this.tools.values());
    return direction ? all.filter((d) => d.direction === direction) : all;
  }

  /** Exposed tools this caller may see in tools/list (same gate as tools/call). */
  listFor(caller: McpCaller): McpToolDefinition[] {
    return this.list('expose').filter((d) => authorizeCaller(d, caller) === null);
  }

  /** Converts the 'call' tools to the app agent's pack (definitions in function_declarations shape, handlers, risk). */
  toAgentTools(invoke: (def: McpToolDefinition, args: JsonObject) => Promise<unknown>): AgentToolPack {
    const definitions: unknown[] = [];
    const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
    const risk: Record<string, ToolRisk> = {};
    for (const def of this.list('call')) {
      if (!def.agentName) continue;
      const properties: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(def.inputSchema.properties)) {
        if (key === 'device_id') continue;   // never chosen by the model: the bridge injects it
        properties[key] = toGeminiProp(prop);
      }
      definitions.push({
        name: def.agentName,
        description: def.description,
        parameters: {
          type: 'OBJECT',
          properties,
          required: (def.inputSchema.required ?? []).filter((k) => k !== 'device_id')
        }
      });
      handlers[def.agentName] = (args) => invoke(def, args);
      risk[def.agentName] = def.risk;
    }
    return { definitions, handlers, risk };
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export interface Denial {
  code: ContractErrorCode;
  message: string;
}

function requiredScopes(def: McpToolDefinition): readonly McpScope[] {
  return def.scopes ?? (def.risk === 'read' ? ['read'] : ['device-command']);
}

/** Role gate for an incoming call: contract role, app role (staff / agent issuer) and agent scopes. Deny by default. */
export function authorizeCaller(def: McpToolDefinition, caller: McpCaller): Denial | null {
  if (!def.roles.includes(caller.role)) return { code: 'forbidden', message: 'role not allowed for this tool' };
  if (caller.role === 'staff' || caller.role === 'agent') {
    if (!caller.appRole) return { code: 'unauthorized', message: 'no app role' };
    if (def.appRoles && !def.appRoles.includes(caller.appRole)) {
      return { code: 'forbidden', message: 'app role not allowed for this tool' };
    }
  }
  if (caller.role === 'agent') {
    const have = caller.scopes ?? [];
    if (!requiredScopes(def).every((s) => have.includes(s))) {
      return { code: 'forbidden', message: 'token scope missing' };
    }
  }
  return null;
}

/** Lightweight argument validation: closed property set, required keys, types, enum, ranges, lengths. */
export function validateArgs(schema: JsonSchemaObject, args: JsonObject): string | null {
  for (const key of Object.keys(args)) {
    if (!(key in schema.properties)) return `unexpected argument "${key}"`;
  }
  for (const key of schema.required ?? []) {
    if (args[key] === undefined) return `missing argument "${key}"`;
  }
  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = args[key];
    if (value === undefined) continue;
    const problem = checkProp(prop, value, key);
    if (problem) return problem;
  }
  return null;
}

function checkProp(prop: JsonSchemaProp, value: unknown, path: string): string | null {
  switch (prop.type) {
    case 'string':
      if (typeof value !== 'string') return `${path}: expected string`;
      if (prop.maxLength !== undefined && value.length > prop.maxLength) return `${path}: too long`;
      if (prop.enum && !prop.enum.includes(value)) return `${path}: not an allowed value`;
      return null;
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${path}: expected number`;
      if (prop.type === 'integer' && !Number.isInteger(value)) return `${path}: expected integer`;
      if (prop.minimum !== undefined && value < prop.minimum) return `${path}: below minimum`;
      if (prop.maximum !== undefined && value > prop.maximum) return `${path}: above maximum`;
      return null;
    case 'boolean':
      return typeof value === 'boolean' ? null : `${path}: expected boolean`;
    case 'array': {
      if (!Array.isArray(value)) return `${path}: expected array`;
      if (prop.maxItems !== undefined && value.length > prop.maxItems) return `${path}: too many items`;
      if (prop.items) {
        for (let i = 0; i < value.length; i++) {
          const problem = checkProp(prop.items, value[i], `${path}[${i}]`);
          if (problem) return problem;
        }
      }
      return null;
    }
    case 'object':
      return isJsonObject(value) ? null : `${path}: expected object`;
  }
}

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

export const DEFAULT_RATE_LIMITS: Record<ToolRisk, RateLimit> = {
  read: { max: 30, windowMs: 10_000 },
  navigate: { max: 10, windowMs: 10_000 },
  robot: { max: 1, windowMs: 1_000 },
  write: { max: 2, windowMs: 10_000 }
};

class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Records a hit on every key, or on none and returns false when any key is over its limit. */
  tryAcquire(keys: ReadonlyArray<{ key: string; limit: RateLimit }>, now: number): boolean {
    const live = keys.map(({ key, limit }) => ({
      key,
      limit,
      stamps: (this.hits.get(key) ?? []).filter((t) => now - t < limit.windowMs)
    }));
    if (live.some((k) => k.stamps.length >= k.limit.max)) {
      for (const k of live) this.hits.set(k.key, k.stamps);
      return false;
    }
    for (const k of live) {
      k.stamps.push(now);
      this.hits.set(k.key, k.stamps);
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditOutcome = 'ok' | 'denied' | 'invalid' | 'rate_limited' | 'declined' | 'error' | 'timeout' | 'killed';

export interface AuditEntry {
  id: string;
  at: string;
  direction: 'in' | 'out';
  tool: string;
  risk: ToolRisk | 'unknown';
  requestId: string;
  callerRole: ContractRole;
  appRole?: McpAppRole;
  deviceId?: string;
  outcome: AuditOutcome;
  code?: ContractErrorCode;
  durationMs: number;
  /** Redacted, truncated JSON of the arguments. Never holds a secret or a cost / payment field. */
  argsSummary: string;
}

const SENSITIVE_KEY = /(token|secret|password|authorization|bearer|api[_-]?key|payment|disburse|commission|bank|acquisition|landed|_aq_code|_land_code|price_mxn|cost)/i;

export function redactArgs(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 8).map((v) => redactArgs(v, depth + 1));
  if (isJsonObject(value)) {
    const out: JsonObject = {};
    for (const [key, v] of Object.entries(value)) out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactArgs(v, depth + 1);
    return out;
  }
  if (typeof value === 'string' && value.length > 80) return `${value.slice(0, 80)}...`;
  return value;
}

function summarizeArgs(args: JsonObject): string {
  let text: string;
  try {
    text = JSON.stringify(redactArgs(args));
  } catch {
    text = '{}';
  }
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export type McpCallOutcome =
  | { ok: true; requestId: string; result: unknown; commandId?: string }
  | { ok: false; requestId: string; code: ContractErrorCode; message: string };

export interface McpCallOptions {
  timeoutMs?: number;
  /** Overrides the device targeted by a 'call' tool (default: options.getDeviceId()). */
  deviceId?: string;
  /** Use a given id, for example a command id, as the JSON-RPC id. */
  requestId?: string;
}

export interface ConfirmRequest {
  tool: string;
  risk: ToolRisk;
  direction: 'in' | 'out';
  args: JsonObject;
  /** Localised, user-visible. */
  summary: string;
}

export interface McpBridgeOptions {
  transport: McpTransport;
  catalog: ToolCatalog;
  /** Who is calling in. Return null when the transport cannot identify the caller: the call is refused. */
  getCaller: () => McpCaller | null;
  /** The signed-in user's app role (for outgoing calls). */
  getAppRole: () => McpAppRole;
  /** Robot targeted by outgoing device tools. */
  getDeviceId?: () => string | null;
  /** Whether the signed-in user is assigned to a device. Only Admin may command unassigned devices. */
  isDeviceAssigned?: (deviceId: string) => boolean;
  /** Asks the user. Without it, any call that needs a confirmation is refused. */
  confirm?: (request: ConfirmRequest) => Promise<boolean>;
  /** Persist hook (Supabase insert). Failures are swallowed and never block a call. */
  onAudit?: (entry: AuditEntry) => void | Promise<void>;
  /** Kill switch read on every call (for example a Supabase flag mirrored into an atom). */
  isKilled?: () => boolean;
  defaultTimeoutMs?: number;
  auditLimit?: number;
  now?: () => number;
}

export interface McpBridge {
  readonly catalog: ToolCatalog;
  /** Calls a contract tool on the robot side and waits for the JSON-RPC response (the ack for a command). */
  call(name: string, args?: JsonObject, options?: McpCallOptions): Promise<McpCallOutcome>;
  /** The 'call' tools in the app agent's pack format (pass to useOnyxAgent({ extraTools: [...] })). */
  toAgentTools(): AgentToolPack;
  getAuditLog(): readonly AuditEntry[];
  /** Stops all traffic and fails pending calls with session_closed until resume(). */
  kill(): void;
  resume(): void;
  isKilled(): boolean;
  dispose(): void;
}

interface Pending {
  resolve: (response: JsonRpcResponse) => void;
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function isFailedResult(result: unknown): boolean {
  if (!isJsonObject(result)) return false;
  return result.isError === true || result.ok === false;
}

function findCommandId(result: unknown): string | undefined {
  if (!isJsonObject(result)) return undefined;
  const structured = isJsonObject(result.structuredContent) ? result.structuredContent : result;
  const id = structured.command_id;
  return typeof id === 'string' ? id : undefined;
}

export function createMcpBridge(options: McpBridgeOptions): McpBridge {
  const { transport, catalog } = options;
  const now = options.now ?? Date.now;
  const timeoutMs = options.defaultTimeoutMs ?? 15_000;
  const auditLimit = options.auditLimit ?? 500;
  const limiter = new SlidingWindowLimiter();
  const pending = new Map<string, Pending>();
  const audit: AuditEntry[] = [];
  let killed = false;
  let disposed = false;

  const killedNow = (): boolean => killed || (options.isKilled?.() ?? false);

  const record = (entry: Omit<AuditEntry, 'id' | 'at'>): void => {
    const full: AuditEntry = { id: newEnvelopeId(), at: new Date(now()).toISOString(), ...entry };
    audit.push(full);
    if (audit.length > auditLimit) audit.splice(0, audit.length - auditLimit);
    if (options.onAudit) {
      try {
        void Promise.resolve(options.onAudit(full)).catch(() => undefined);
      } catch {
        /* persistence must never break a call */
      }
    }
  };

  const limitKeys = (def: McpToolDefinition): Array<{ key: string; limit: RateLimit }> => {
    const keys = [{ key: `tool:${def.name}`, limit: def.rateLimit ?? DEFAULT_RATE_LIMITS[def.risk] }];
    if (def.rateGroup) keys.push({ key: `group:${def.rateGroup}`, limit: DEFAULT_RATE_LIMITS[def.risk] });
    return keys;
  };

  const needsConfirm = (def: McpToolDefinition): boolean => def.risk === 'write' || def.requiresConfirmation === true;

  const askConfirm = async (def: McpToolDefinition, direction: 'in' | 'out', args: JsonObject): Promise<boolean> => {
    if (!options.confirm) return false;
    try {
      return await options.confirm({
        tool: def.name,
        risk: def.risk,
        direction,
        args: redactArgs(args) as JsonObject,
        summary: trf('{name} requires confirmation', { name: def.name })
      });
    } catch {
      return false;
    }
  };

  // ------------------------------- outgoing --------------------------------

  const call = async (name: string, rawArgs: JsonObject = {}, opts: McpCallOptions = {}): Promise<McpCallOutcome> => {
    const t0 = now();
    const requestId = opts.requestId ?? newEnvelopeId();
    const appRole = options.getAppRole();
    const def = catalog.get(name);
    const base = {
      direction: 'out' as const,
      tool: name,
      risk: (def?.risk ?? 'unknown') as ToolRisk | 'unknown',
      requestId,
      callerRole: 'staff' as ContractRole,
      appRole
    };
    const fail = (outcome: AuditOutcome, code: ContractErrorCode, message: string, deviceId?: string): McpCallOutcome => {
      record({ ...base, deviceId, outcome, code, durationMs: now() - t0, argsSummary: summarizeArgs(rawArgs) });
      return { ok: false, requestId, code, message };
    };

    if (killedNow()) return fail('killed', 'session_closed', 'kill switch is on');
    if (!def || def.direction !== 'call') return fail('invalid', 'unknown_tool', 'unknown tool');
    const denial = authorizeCaller(def, { role: 'staff', appRole });
    if (denial) return fail('denied', denial.code, denial.message);
    if (def.risk !== 'read' && def.targetsDevice && !ROBOT_APP_ROLES.includes(appRole)) {
      return fail('denied', 'forbidden', 'app role cannot command robots');
    }

    const args: JsonObject = { ...rawArgs };
    let deviceId: string | undefined;
    if (def.targetsDevice) {
      deviceId = opts.deviceId ?? options.getDeviceId?.() ?? undefined;
      if (!deviceId) return fail('invalid', 'not_found', 'no robot selected');
      if (!ALL_DEVICES_APP_ROLES.includes(appRole) && !(options.isDeviceAssigned?.(deviceId) ?? false)) {
        return fail('denied', 'forbidden', 'device not assigned to this user', deviceId);
      }
      args.device_id = deviceId;
    }

    const problem = validateArgs(def.inputSchema, args);
    if (problem) return fail('invalid', 'invalid_request', problem, deviceId);
    if (!limiter.tryAcquire(limitKeys(def), now())) return fail('rate_limited', 'rate_limited', 'rate limited', deviceId);
    if (needsConfirm(def) && !(await askConfirm(def, 'out', args))) {
      return fail('declined', 'forbidden', 'declined by user', deviceId);
    }
    if (killedNow()) return fail('killed', 'session_closed', 'kill switch is on', deviceId);

    const waiter = new Promise<JsonRpcResponse>((resolve) => {
      pending.set(requestId, { resolve });
    });
    try {
      await transport.send(buildToolCall(name, args, requestId));
    } catch {
      pending.delete(requestId);
      return fail('error', 'upstream_unavailable', 'transport send failed', deviceId);
    }

    let response: JsonRpcResponse;
    try {
      response = await withTimeout(waiter, opts.timeoutMs ?? timeoutMs);
    } catch (e: unknown) {
      pending.delete(requestId);
      if (e instanceof TimeoutError) return fail('timeout', 'upstream_unavailable', 'no response before the timeout', deviceId);
      return fail('error', 'internal', 'call failed', deviceId);
    }

    if (isJsonRpcFailure(response)) {
      const code = response.error.data?.code;
      return fail('error', code ?? 'internal', response.error.message, deviceId);
    }
    if (isFailedResult(response.result)) {
      return fail('error', 'command_failed', 'the robot reported a failure', deviceId);
    }
    record({ ...base, deviceId, outcome: 'ok', durationMs: now() - t0, argsSummary: summarizeArgs(args) });
    return { ok: true, requestId, result: response.result, commandId: findCommandId(response.result) };
  };

  // ------------------------------- incoming --------------------------------

  const reply = async (envelope: McpEnvelope): Promise<void> => {
    try {
      await transport.send(envelope);
    } catch {
      /* link is down: the caller will time out */
    }
  };

  const serveToolCall = async (req: JsonRpcRequest, caller: McpCaller | null): Promise<void> => {
    const t0 = now();
    const params = req.params ?? {};
    const name = typeof params.name === 'string' ? params.name : '';
    const rawArgs = params.arguments === undefined ? {} : params.arguments;
    const def = name ? catalog.get(name) : undefined;
    const argsObj: JsonObject = isJsonObject(rawArgs) ? rawArgs : {};
    const requestId = String(req.id);
    const base = {
      direction: 'in' as const,
      tool: name || '(none)',
      risk: (def?.risk ?? 'unknown') as ToolRisk | 'unknown',
      requestId,
      callerRole: caller?.role ?? ('gateway' as ContractRole),
      appRole: caller?.appRole,
      deviceId: caller?.deviceId
    };
    const refuse = async (outcome: AuditOutcome, code: ContractErrorCode, message: string): Promise<void> => {
      record({ ...base, outcome, code, durationMs: now() - t0, argsSummary: summarizeArgs(argsObj) });
      await reply(buildError(req.id, code, message));
    };

    if (killedNow()) return refuse('killed', 'session_closed', 'kill switch is on');
    if (!caller) return refuse('denied', 'unauthorized', 'unknown caller');
    if (!name || !isJsonObject(rawArgs)) return refuse('invalid', 'invalid_request', 'tools/call needs name and object arguments');
    if (!def || def.direction !== 'expose' || !def.handler) return refuse('invalid', 'unknown_tool', 'unknown tool');
    const denial = authorizeCaller(def, caller);
    if (denial) return refuse('denied', denial.code, denial.message);
    const problem = validateArgs(def.inputSchema, argsObj);
    if (problem) return refuse('invalid', 'invalid_request', problem);
    if (!limiter.tryAcquire(limitKeys(def), now())) return refuse('rate_limited', 'rate_limited', 'rate limited');
    if (needsConfirm(def) && !(await askConfirm(def, 'in', argsObj))) return refuse('declined', 'forbidden', 'declined by user');

    try {
      const result = await withTimeout(def.handler(argsObj, { caller, requestId }), timeoutMs);
      const isError = isFailedResult(result);
      record({ ...base, outcome: isError ? 'error' : 'ok', code: isError ? 'command_failed' : undefined, durationMs: now() - t0, argsSummary: summarizeArgs(argsObj) });
      await reply(buildResponse(req.id, {
        content: [{ type: 'text', text: JSON.stringify(result ?? null) }],
        ...(isJsonObject(result) ? { structuredContent: result } : {}),
        isError
      }));
    } catch (e: unknown) {
      const timedOut = e instanceof TimeoutError;
      record({ ...base, outcome: timedOut ? 'timeout' : 'error', code: timedOut ? 'upstream_unavailable' : 'internal', durationMs: now() - t0, argsSummary: summarizeArgs(argsObj) });
      await reply(buildError(req.id, timedOut ? 'upstream_unavailable' : 'internal', timedOut ? 'tool timed out' : 'tool failed'));
    }
  };

  const serve = async (req: JsonRpcRequest): Promise<void> => {
    const caller = options.getCaller();
    if (req.method === 'ping') return reply(buildResponse(req.id, {}));
    if (req.method === 'tools/list') {
      if (killedNow()) return reply(buildError(req.id, 'session_closed', 'kill switch is on'));
      if (!caller) return reply(buildError(req.id, 'unauthorized', 'unknown caller'));
      const tools = catalog.listFor(caller).map((d) => ({
        name: d.name,
        description: d.description,
        inputSchema: d.inputSchema
      }));
      return reply(buildResponse(req.id, { tools }));
    }
    if (req.method === 'tools/call') return serveToolCall(req, caller);
    return reply(buildError(req.id, 'unknown_tool', 'unknown method'));
  };

  const onEnvelope = (envelope: McpEnvelope): void => {
    if (disposed) return;
    const checked = validateEnvelope(envelope);
    if (!checked.ok) return;   // not a contract frame: dropped, never answered
    const payload = checked.value.payload;
    if (isJsonRpcResponse(payload)) {
      if (payload.id === null) return;
      const waiting = pending.get(String(payload.id));
      if (waiting) {
        pending.delete(String(payload.id));
        waiting.resolve(payload);
      }
      return;
    }
    if (isJsonRpcRequest(payload)) void serve(payload);
    // notifications carry nothing the app acts on
  };

  const unsubscribe = transport.onMessage(onEnvelope);

  const failPending = (): void => {
    for (const [id, waiting] of Array.from(pending.entries())) {
      pending.delete(id);
      waiting.resolve({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: 'session closed', data: { code: 'session_closed' } }
      });
    }
  };

  return {
    catalog,
    call,
    toAgentTools: () => catalog.toAgentTools(async (def, args) => {
      const mapped = def.mapAgentArgs ? def.mapAgentArgs(args) : args;
      const outcome = await call(def.name, mapped);
      if (outcome.ok) return { ok: true, queued: true, command_id: outcome.commandId, result: outcome.result };
      const failed = outcome as Extract<McpCallOutcome, { ok: false }>;
      return { ok: false, error: failed.message, code: failed.code };
    }),
    getAuditLog: () => audit,
    kill: () => {
      killed = true;
      failPending();
    },
    resume: () => {
      killed = false;
    },
    isKilled: killedNow,
    dispose: () => {
      disposed = true;
      failPending();
      if (typeof unsubscribe === 'function') unsubscribe();
    }
  };
}

// ---------------------------------------------------------------------------
// Default catalogues
// ---------------------------------------------------------------------------

const clampNum = (val: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.max(min, Math.min(max, n));
};
const cleanText = (val: unknown, max: number): string =>
  String(val ?? '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().slice(0, max);

const FACE_EXPRESSIONS = ['calm', 'happy', 'thinking', 'sleepy', 'shy', 'smug', 'pouty', 'alert', 'error', 'speaking', 'listening'] as const;
const VENDOR_ICONS = ['box', 'tag', 'dollar', 'truck', 'package'] as const;

const DEVICE_ID_PROP: JsonSchemaProp = { type: 'string', description: 'Target device (injected by the bridge).', maxLength: 256 };

/**
 * Robot tools the app agent can call. Contract names (roles.json device_command_tools); the argument shapes are INFERRED
 * from command.schema.json because onyxchanTools.ts was not available. Agent names keep robotTools.ts naming.
 */
export function createRobotCallTools(): McpToolDefinition[] {
  const common = {
    direction: 'call' as const,
    risk: 'robot' as const,
    roles: ['staff', 'agent'] as const,
    appRoles: ROBOT_APP_ROLES,
    rateGroup: 'robot',
    targetsDevice: true
  };
  return [
    {
      ...common,
      name: 'speak',
      agentName: 'robot_say',
      description: 'Speak text out loud using the robot. Use the robot only when the user asks or the answer is short. Never read secrets or personal data aloud.',
      inputSchema: {
        type: 'object',
        properties: {
          device_id: DEVICE_ID_PROP,
          text: { type: 'string', description: 'Text to speak, max 240 chars', maxLength: 256 },
          language: { type: 'string', description: 'Language code: es or en. Defaults to es', enum: ['es', 'en'] }
        },
        required: ['device_id', 'text']
      },
      mapAgentArgs: (a) => ({
        text: cleanText(a.text, 240),
        language: a.language === 'en' ? 'en' : 'es'   // the contract dropped ja
      })
    },
    {
      ...common,
      name: 'set_expression',
      agentName: 'robot_face',
      description: 'Change the robot face expression. Use the robot only when the user asks or the answer is short.',
      inputSchema: {
        type: 'object',
        properties: {
          device_id: DEVICE_ID_PROP,
          expression: { type: 'string', description: 'Face expression', enum: FACE_EXPRESSIONS },
          duration_ms: { type: 'integer', description: 'Duration in milliseconds (optional)', minimum: 0 }
        },
        required: ['device_id', 'expression']
      },
      mapAgentArgs: (a) => {
        const out: JsonObject = { expression: cleanText(a.expression, 32) };
        if (typeof a.duration === 'number') out.duration_ms = Math.round(clampNum(a.duration, 1, 60, 1) * 1000);   // agent seconds to contract ms
        return out;
      }
    },
    {
      ...common,
      name: 'move_head',
      agentName: 'robot_move',
      description: 'Move the robot head (pan and tilt). Use the robot only when the user asks or the answer is short.',
      inputSchema: {
        type: 'object',
        properties: {
          device_id: DEVICE_ID_PROP,
          pan: { type: 'number', description: 'Pan angle in degrees (-90 to 90)', minimum: -90, maximum: 90 },
          tilt: { type: 'number', description: 'Tilt angle in degrees (0 to 90)', minimum: 0, maximum: 90 }
        },
        required: ['device_id', 'pan', 'tilt']
      },
      mapAgentArgs: (a) => ({ pan: clampNum(a.pan, -90, 90, 0), tilt: clampNum(a.tilt, 0, 90, 0) })
    },
    {
      ...common,
      name: 'display_vendor_card',
      agentName: 'robot_show_vendor_card',
      description: 'Show a vendor card on the robot display. Use the robot only when the user asks or the answer is short.',
      inputSchema: {
        type: 'object',
        properties: {
          device_id: DEVICE_ID_PROP,
          vendor: { type: 'string', description: 'Vendor identifier', maxLength: 60 },
          title: { type: 'string', description: 'Card title', maxLength: 120 },
          details: { type: 'array', description: 'Up to 4 detail lines', items: { type: 'string', maxLength: 256 }, maxItems: 4 },
          icon: { type: 'string', description: 'Card icon', enum: VENDOR_ICONS }
        },
        required: ['device_id', 'vendor', 'title', 'details']
      },
      mapAgentArgs: (a) => ({
        vendor: cleanText(a.vendor, 60),
        title: cleanText(a.title, 120),
        details: Array.isArray(a.details) ? a.details.slice(0, 4).map((d) => cleanText(d, 60)) : []
      })
    },
    {
      ...common,
      name: 'display_inventory_card',
      agentName: 'robot_show_item_card',
      description: 'Show an item inventory card on the robot display. Use the robot only when the user asks or the answer is short.',
      inputSchema: {
        type: 'object',
        properties: {
          device_id: DEVICE_ID_PROP,
          item_id: { type: 'string', description: 'Item ID', maxLength: 256 },
          title: { type: 'string', description: 'Item title', maxLength: 120 },
          vendor: { type: 'string', description: 'Optional vendor identifier', maxLength: 60 },
          stock: { type: 'number', description: 'Optional item stock' },
          status: { type: 'string', description: 'Optional status', maxLength: 40 },
          price: { type: 'number', description: 'Optional retail price in USD; stripped by onyx-mcp for voice devices' }
        },
        required: ['device_id', 'item_id', 'title']
      },
      mapAgentArgs: (a) => {
        const out: JsonObject = { item_id: cleanText(a.item_id, 64), title: cleanText(a.title, 120) };
        if (typeof a.vendor === 'string') out.vendor = cleanText(a.vendor, 60);
        if (typeof a.stock === 'number' && Number.isFinite(a.stock)) out.stock = a.stock;
        if (typeof a.status === 'string') out.status = cleanText(a.status, 40);
        if (typeof a.price === 'number' && Number.isFinite(a.price)) out.price = a.price;
        return out;
      }
    },
    {
      ...common,
      risk: 'read',
      rateGroup: undefined,
      name: 'get_robot_status',
      agentName: 'robot_status',
      description: 'Read the robot status (online, last check-in, battery).',
      inputSchema: { type: 'object', properties: { device_id: DEVICE_ID_PROP }, required: ['device_id'] }
    },
    {
      ...common,
      risk: 'read',
      rateGroup: undefined,
      name: 'ping_robot',
      agentName: 'robot_ping',
      description: 'Ping the robot to check it answers.',
      inputSchema: { type: 'object', properties: { device_id: DEVICE_ID_PROP }, required: ['device_id'] }
    }
  ];
}

export interface AppExposedDeps {
  getCurrentView: () => string;
  /** Applies the app's own view gate (VIEW_ACCESS) for the caller's app role. */
  canNavigate: (view: string, appRole: McpAppRole | undefined) => boolean;
  setActiveView: (view: string) => void;
  /** Opens a surface of the Onyx Island. */
  openIslandSurface?: (surface: 'commands' | 'center') => void;
  /** Inventory counts per vendor (names and numbers only, never cost). Optional vendor filter. */
  countInventoryByVendor?: (vendor?: string) => Promise<Record<string, number>>;
  getShipmentStatus?: (shipmentId?: string) => Promise<unknown>;
  /** Shows a vendor card on the robot, through the outgoing bridge. */
  showVendorOnRobot?: (vendor: string) => Promise<unknown>;
}

/**
 * Tools the app exposes to the robot. Roles follow roles.json: voice and staff-device only reach the query tools it lists
 * (inventory_count_by_vendor); app_* and logistics_get_shipment are denied to device roles there, so they stay staff / agent
 * until the contract is amended (see the plan). app_get_current_view, app_open_island_surface and app_show_vendor_on_robot
 * are NEW names that are not in the contract.
 */
export function createAppExposedTools(deps: AppExposedDeps): McpToolDefinition[] {
  const tools: McpToolDefinition[] = [
    {
      name: 'app_get_current_view',
      description: 'Reads the view the operator is looking at.',
      direction: 'expose',
      risk: 'read',
      roles: ['staff', 'agent'],
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ ok: true, currentView: deps.getCurrentView() })
    },
    {
      name: 'app_change_view',
      description: 'Navigates the app to a view the caller may open.',
      direction: 'expose',
      risk: 'navigate',
      roles: ['staff', 'agent'],
      inputSchema: { type: 'object', properties: { view: { type: 'string', maxLength: 40 } }, required: ['view'] },
      handler: async (args, ctx) => {
        const view = String(args.view);
        if (!deps.canNavigate(view, ctx.caller.appRole)) return { ok: false, error: 'not allowed' };
        deps.setActiveView(view);
        return { ok: true, navigatedTo: view };
      }
    }
  ];
  if (deps.openIslandSurface) {
    const open = deps.openIslandSurface;
    tools.push({
      name: 'app_open_island_surface',
      description: 'Opens a surface of the Onyx Island (command surface or notification center).',
      direction: 'expose',
      risk: 'navigate',
      roles: ['staff', 'agent'],
      inputSchema: { type: 'object', properties: { surface: { type: 'string', enum: ['commands', 'center'] } }, required: ['surface'] },
      handler: async (args) => {
        const surface = args.surface === 'center' ? 'center' : 'commands';
        open(surface);
        return { ok: true, opened: surface };
      }
    });
  }
  if (deps.countInventoryByVendor) {
    const count = deps.countInventoryByVendor;
    tools.push({
      name: 'inventory_count_by_vendor',
      description: 'Counts inventory items per vendor. Returns names and counts only.',
      direction: 'expose',
      risk: 'read',
      roles: ['voice', 'staff-device', 'staff', 'agent'],
      inputSchema: { type: 'object', properties: { vendor: { type: 'string', maxLength: 60 } } },
      handler: async (args) => {
        const vendor = typeof args.vendor === 'string' ? args.vendor : undefined;
        return { ok: true, counts: await count(vendor) };
      }
    });
  }
  if (deps.getShipmentStatus) {
    const status = deps.getShipmentStatus;
    tools.push({
      name: 'logistics_get_shipment',
      description: 'Reads the status of a shipment (the current one when no id is given).',
      direction: 'expose',
      risk: 'read',
      roles: ['staff', 'agent'],
      appRoles: ['Developer', 'Admin', 'ClientBoss', 'ClientAccounting', 'ClientViewer'],
      inputSchema: { type: 'object', properties: { shipment_id: { type: 'string', maxLength: 64 } } },
      handler: async (args) => ({
        ok: true,
        shipment: await status(typeof args.shipment_id === 'string' ? args.shipment_id : undefined)
      })
    });
  }
  if (deps.showVendorOnRobot) {
    const show = deps.showVendorOnRobot;
    tools.push({
      name: 'app_show_vendor_on_robot',
      description: 'Shows a vendor card on the robot display.',
      direction: 'expose',
      risk: 'robot',
      roles: ['staff', 'agent'],
      appRoles: ROBOT_APP_ROLES,
      rateGroup: 'robot',
      inputSchema: { type: 'object', properties: { vendor: { type: 'string', maxLength: 60 } }, required: ['vendor'] },
      handler: async (args) => ({ ok: true, result: await show(String(args.vendor)) })
    });
  }
  return tools;
}

/** User-visible label for a confirmation card of a bridge call. */
export function confirmLabel(tool: string): string {
  return `${tr('Robot')}: ${tool}`;
}
