/**
 * MCP envelope for wss /v1/session: { type: 'mcp', payload: <one JSON-RPC 2.0 message> }.
 * Mirrors docs/ai/mcp.envelope.schema.json (urn:onyxchan:contract:v1:mcp.envelope) exactly:
 *  - every object is closed (additionalProperties: false);
 *  - request = jsonrpc, id, method, params?; notification = jsonrpc, method, params? (no id);
 *  - response = jsonrpc, id (string | integer | null) and exactly one of result / error.
 * No dependencies: the validators are hand-written guards.
 */

export type JsonObject = Record<string, unknown>;
export type JsonRpcId = string | number;

/** Stable error codes of the contract (FW_PROTOCOL.md section 9). Clients branch on the code, never on the message. */
export const CONTRACT_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'token_revoked',
  'token_expired',
  'auth_timeout',
  'identity_mismatch',
  'forbidden',
  'field_denied',
  'unknown_tool',
  'unsupported',
  'not_found',
  'command_expired',
  'command_failed',
  'lease_expired',
  'frame_too_large',
  'rate_limited',
  'session_closed',
  'upstream_unavailable',
  'internal'
] as const;

export type ContractErrorCode = typeof CONTRACT_ERROR_CODES[number];

/**
 * error.schema.json was not among the files available: `data` is modelled as an object with a stable string `code`.
 * Any other key is kept as unknown.
 */
export interface ContractErrorData {
  code: ContractErrorCode;
  [key: string]: unknown;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: JsonObject;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: JsonObject;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: ContractErrorData;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export interface McpEnvelope {
  type: 'mcp';
  payload: JsonRpcMessage;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * JSON-RPC numeric code per stable code. The contract leaves this mapping open (FW_PROTOCOL.md open question 30):
 * standard JSON-RPC codes where one exists, -32000 (implementation defined) otherwise. INFERRED.
 */
export const ERROR_RPC_CODE: Record<ContractErrorCode, number> = {
  invalid_request: -32600,
  unauthorized: -32000,
  token_revoked: -32000,
  token_expired: -32000,
  auth_timeout: -32000,
  identity_mismatch: -32000,
  forbidden: -32000,
  field_denied: -32000,
  unknown_tool: -32601,
  unsupported: -32000,
  not_found: -32000,
  command_expired: -32000,
  command_failed: -32000,
  lease_expired: -32000,
  frame_too_large: -32000,
  rate_limited: -32000,
  session_closed: -32000,
  upstream_unavailable: -32000,
  internal: -32603
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Type guard: true for a non-null object that is not an array. */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value));
}

export function isContractErrorCode(value: unknown): value is ContractErrorCode {
  return typeof value === 'string' && (CONTRACT_ERROR_CODES as readonly string[]).includes(value);
}

const closedKeys = (obj: JsonObject, allowed: readonly string[], path: string, errors: string[]): void => {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${path}: unexpected key "${key}"`);
  }
};

const checkParams = (obj: JsonObject, path: string, errors: string[]): void => {
  if (obj.params !== undefined && !isJsonObject(obj.params)) errors.push(`${path}.params: must be an object`);
};

function validateRequest(obj: JsonObject, path: string, errors: string[]): void {
  closedKeys(obj, ['jsonrpc', 'id', 'method', 'params'], path, errors);
  if (obj.jsonrpc !== '2.0') errors.push(`${path}.jsonrpc: must be "2.0"`);
  if (!isJsonRpcId(obj.id)) errors.push(`${path}.id: must be a string or an integer`);
  if (typeof obj.method !== 'string' || obj.method.length < 1) errors.push(`${path}.method: must be a non-empty string`);
  checkParams(obj, path, errors);
}

function validateNotification(obj: JsonObject, path: string, errors: string[]): void {
  closedKeys(obj, ['jsonrpc', 'method', 'params'], path, errors);
  if (obj.jsonrpc !== '2.0') errors.push(`${path}.jsonrpc: must be "2.0"`);
  if (typeof obj.method !== 'string' || obj.method.length < 1) errors.push(`${path}.method: must be a non-empty string`);
  checkParams(obj, path, errors);
}

function validateResponse(obj: JsonObject, path: string, errors: string[]): void {
  closedKeys(obj, ['jsonrpc', 'id', 'result', 'error'], path, errors);
  if (obj.jsonrpc !== '2.0') errors.push(`${path}.jsonrpc: must be "2.0"`);
  if (!('id' in obj) || (obj.id !== null && !isJsonRpcId(obj.id))) {
    errors.push(`${path}.id: must be a string, an integer or null`);
  }
  const hasResult = obj.result !== undefined;
  const hasError = obj.error !== undefined;
  if (hasResult === hasError) {
    errors.push(`${path}: exactly one of result / error is required`);
    return;
  }
  if (hasError) {
    const err = obj.error;
    if (!isJsonObject(err)) {
      errors.push(`${path}.error: must be an object`);
      return;
    }
    closedKeys(err, ['code', 'message', 'data'], `${path}.error`, errors);
    if (typeof err.code !== 'number' || !Number.isInteger(err.code)) errors.push(`${path}.error.code: must be an integer`);
    if (typeof err.message !== 'string') errors.push(`${path}.error.message: must be a string`);
    if (err.data !== undefined && (!isJsonObject(err.data) || typeof err.data.code !== 'string')) {
      errors.push(`${path}.error.data: must be an error object with a string code`);
    }
  }
}

/** Validates a whole text frame body; the payload must match exactly one of request, notification, response. */
export function validateEnvelope(value: unknown): ValidationResult<McpEnvelope> {
  const errors: string[] = [];
  if (!isJsonObject(value)) return { ok: false, errors: ['envelope: must be an object'] };
  closedKeys(value, ['type', 'payload'], 'envelope', errors);
  if (value.type !== 'mcp') errors.push('envelope.type: must be "mcp"');
  const payload = value.payload;
  if (!isJsonObject(payload)) {
    errors.push('envelope.payload: must be an object');
    return { ok: false, errors };
  }
  if ('method' in payload) {
    if ('id' in payload) validateRequest(payload, 'payload', errors);
    else validateNotification(payload, 'payload', errors);
  } else {
    validateResponse(payload, 'payload', errors);
  }
  return errors.length === 0 ? { ok: true, value: value as unknown as McpEnvelope } : { ok: false, errors };
}

export function isMcpEnvelope(value: unknown): value is McpEnvelope {
  return validateEnvelope(value).ok;
}

/** Parses a text frame (UTF-8 JSON) and validates it. */
export function parseEnvelope(text: string): ValidationResult<McpEnvelope> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['frame: not valid JSON'] };
  }
  return validateEnvelope(raw);
}

export function isJsonRpcRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return 'method' in message && 'id' in message;
}

export function isJsonRpcNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return 'method' in message && !('id' in message);
}

export function isJsonRpcResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return !('method' in message);
}

export function isJsonRpcFailure(message: JsonRpcResponse): message is JsonRpcFailure {
  return 'error' in message && message.error !== undefined;
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The canonical id: a lowercase UUID v4 (command ids are uuids, FW_PROTOCOL.md section 6). Idempotency key, not a secret. */
export function newEnvelopeId(): string {
  const c: Crypto | undefined = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function buildEnvelope(payload: JsonRpcMessage): McpEnvelope {
  return { type: 'mcp', payload };
}

export function buildRequest(method: string, params?: JsonObject, id: JsonRpcId = newEnvelopeId()): McpEnvelope {
  const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method };
  if (params !== undefined) payload.params = params;
  return buildEnvelope(payload);
}

export function buildNotification(method: string, params?: JsonObject): McpEnvelope {
  const payload: JsonRpcNotification = { jsonrpc: '2.0', method };
  if (params !== undefined) payload.params = params;
  return buildEnvelope(payload);
}

/** tools/call request. When the call is a queued command, `id` must be the command id. */
export function buildToolCall(name: string, args: JsonObject = {}, id: JsonRpcId = newEnvelopeId()): McpEnvelope {
  return buildRequest('tools/call', { name, arguments: args }, id);
}

export function buildResponse(id: JsonRpcId | null, result: unknown): McpEnvelope {
  return buildEnvelope({ jsonrpc: '2.0', id, result: result === undefined ? null : result });
}

/** Error response. The message must never carry a token, a secret or a redacted value. */
export function buildError(
  id: JsonRpcId | null,
  code: ContractErrorCode,
  message: string,
  extra: JsonObject = {}
): McpEnvelope {
  return buildEnvelope({
    jsonrpc: '2.0',
    id,
    error: { code: ERROR_RPC_CODE[code], message, data: { ...extra, code } }
  });
}
