/**
 * Sample envelopes for tests, shaped from docs/ai/mcp.envelope.schema.json and command.schema.json.
 * The contract's own fixtures folder (fixtures/<owner>/) was not available: these are written in the same shape,
 * not copied byte for byte. Ids are fixed placeholders. No token, key or signed URL appears anywhere.
 */
import type { McpEnvelope } from './envelope';

export const FIXTURE_COMMAND_ID = '3f2b8c1e-5a4d-4e6f-9b7a-0c1d2e3f4a5b';
export const FIXTURE_DEVICE_ID = 'stackchan-demo-01';

/** Gateway -> device: tools/list. */
export const toolsListRequest: McpEnvelope = {
  type: 'mcp',
  payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
};

/** Gateway -> device: a queued `speak` command (id = command id, params.name / params.arguments = command name / args). */
export const toolsCallSpeak: McpEnvelope = {
  type: 'mcp',
  payload: {
    jsonrpc: '2.0',
    id: FIXTURE_COMMAND_ID,
    method: 'tools/call',
    params: { name: 'speak', arguments: { text: 'Hola', language: 'es' } }
  }
};

/** Gateway -> device: face command. */
export const toolsCallFace: McpEnvelope = {
  type: 'mcp',
  payload: {
    jsonrpc: '2.0',
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    method: 'tools/call',
    params: { name: 'face', arguments: { expression: 'happy', duration_ms: 3000 } }
  }
};

/** Robot -> app: reads the current view. */
export const toolsCallGetCurrentView: McpEnvelope = {
  type: 'mcp',
  payload: {
    jsonrpc: '2.0',
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    method: 'tools/call',
    params: { name: 'app_get_current_view', arguments: {} }
  }
};

/** Device -> gateway: the JSON-RPC response of a command is its ack. */
export const toolsCallResultOk: McpEnvelope = {
  type: 'mcp',
  payload: { jsonrpc: '2.0', id: FIXTURE_COMMAND_ID, result: { ok: true } }
};

/** Device -> gateway: failure with a stable error code in data. */
export const toolsCallError: McpEnvelope = {
  type: 'mcp',
  payload: {
    jsonrpc: '2.0',
    id: FIXTURE_COMMAND_ID,
    error: { code: -32000, message: 'unsupported', data: { code: 'unsupported' } }
  }
};

/** A notification (no id). */
export const notification: McpEnvelope = {
  type: 'mcp',
  payload: { jsonrpc: '2.0', method: 'notifications/initialized' }
};

/** Every envelope that must validate. */
export const validEnvelopes: readonly McpEnvelope[] = [
  toolsListRequest,
  toolsCallSpeak,
  toolsCallFace,
  toolsCallGetCurrentView,
  toolsCallResultOk,
  toolsCallError,
  notification
];

/** Frames the schema rejects, each with the reason. Typed unknown on purpose. */
export const invalidEnvelopes: ReadonlyArray<{ reason: string; value: unknown }> = [
  { reason: 'wrong type', value: { type: 'hello', payload: { jsonrpc: '2.0', id: 1, method: 'x' } } },
  { reason: 'missing payload', value: { type: 'mcp' } },
  { reason: 'extra envelope key', value: { type: 'mcp', payload: { jsonrpc: '2.0', id: 1, method: 'x' }, extra: true } },
  { reason: 'jsonrpc version', value: { type: 'mcp', payload: { jsonrpc: '1.0', id: 1, method: 'x' } } },
  { reason: 'empty method', value: { type: 'mcp', payload: { jsonrpc: '2.0', id: 1, method: '' } } },
  { reason: 'fractional id', value: { type: 'mcp', payload: { jsonrpc: '2.0', id: 1.5, method: 'x' } } },
  { reason: 'params is an array', value: { type: 'mcp', payload: { jsonrpc: '2.0', id: 1, method: 'x', params: [] } } },
  { reason: 'response with result and error', value: { type: 'mcp', payload: { jsonrpc: '2.0', id: 1, result: {}, error: { code: 1, message: 'm' } } } },
  { reason: 'response with neither', value: { type: 'mcp', payload: { jsonrpc: '2.0', id: 1 } } },
  { reason: 'error without message', value: { type: 'mcp', payload: { jsonrpc: '2.0', id: 1, error: { code: 1 } } } },
  { reason: 'extra payload key', value: { type: 'mcp', payload: { jsonrpc: '2.0', method: 'x', id: undefined, extra: 1 } } }
];
