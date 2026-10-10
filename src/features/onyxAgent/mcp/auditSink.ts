/**
 * auditSink.ts
 *
 * Batched persistence sink for MCP bridge audit entries.
 * Maps AuditEntry instances to onyxchan_audit database rows,
 * masks sensitive credentials and financial keys deeply,
 * and flushes batches to an injected insert handler with single retry.
 */
import type { AuditEntry } from './mcpBridge';

export type AuditRow = {
  id: string;
  user_id?: string;
  at: string;
  direction: 'in' | 'out';
  tool: string;
  risk: 'read' | 'navigate' | 'robot' | 'write' | 'unknown';
  request_id: string;
  caller_role: 'voice' | 'staff-device' | 'staff' | 'agent' | 'gateway';
  app_role: 'Developer' | 'Admin' | 'ClientBoss' | 'ClientAccounting' | 'ClientViewer' | 'Vendor' | 'Client' | null;
  device_id: string | null;
  outcome: 'ok' | 'denied' | 'invalid' | 'rate_limited' | 'declined' | 'error' | 'timeout' | 'killed';
  code: string | null;
  duration_ms: number;
  args_summary: string;
  source: string | null;
  command_id: string | null;
  confirmed: boolean;
  created_at?: string;
};

const SENSITIVE_KEY_PATTERN = /token|secret|payment|cost/i;

function maskValueDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(maskValueDeep);
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      result[k] = '[masked]';
    } else {
      result[k] = maskValueDeep(v);
    }
  }
  return result;
}

export function maskArgs(args: unknown): string {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      return JSON.stringify(maskValueDeep(parsed));
    } catch {
      return args.replace(
        /"([^"\\]*(?:token|secret|payment|cost)[^"\\]*)"\s*:\s*("(?:[^"\\]|\\.)*"|[^\s,}{\]]+)/gi,
        '"$1":"[masked]"'
      );
    }
  }
  if (args && typeof args === 'object') {
    return JSON.stringify(maskValueDeep(args));
  }
  return String(args ?? '');
}

export function mapEntryToRow(entry: AuditEntry): AuditRow {
  const raw = entry as AuditEntry & {
    source?: string;
    commandId?: string;
    command_id?: string;
    confirmed?: boolean;
    user_id?: string;
    userId?: string;
    created_at?: string;
    args?: unknown;
  };

  const argsSummary = raw.args !== undefined ? maskArgs(raw.args) : maskArgs(entry.argsSummary);

  const row: AuditRow = {
    id: entry.id,
    at: entry.at,
    direction: entry.direction,
    tool: entry.tool,
    risk: entry.risk,
    request_id: entry.requestId,
    caller_role: entry.callerRole,
    app_role: entry.appRole ?? null,
    device_id: entry.deviceId ?? null,
    outcome: entry.outcome,
    code: entry.code ?? null,
    duration_ms: Math.max(0, Math.round(entry.durationMs)),
    args_summary: argsSummary,
    source: raw.source ?? 'app',
    command_id: raw.commandId ?? raw.command_id ?? null,
    confirmed: raw.confirmed ?? false,
  };

  if (raw.user_id || raw.userId) {
    row.user_id = raw.user_id ?? raw.userId;
  }
  if (raw.created_at) {
    row.created_at = raw.created_at;
  }

  return row;
}

export interface CreateAuditSinkOptions {
  insert: (rows: AuditRow[]) => Promise<void>;
  enabled: () => boolean;
  maxBatch?: number;
  flushMs?: number;
}

export interface AuditSink {
  push(entry: AuditEntry): void;
  flush(): Promise<void>;
  dispose(): void;
}

export function createAuditSink(options: {
  insert: (rows: AuditRow[]) => Promise<void>;
  enabled: () => boolean;
  maxBatch?: number;
  flushMs?: number;
}): {
  push(entry: AuditEntry): void;
  flush(): Promise<void>;
  dispose(): void;
} {
  const maxBatch = options.maxBatch ?? 20;
  const flushMs = options.flushMs ?? 5_000;
  let queue: AuditRow[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let disposed = false;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleTimer = (): void => {
    if (timer === null && !disposed && queue.length > 0) {
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, flushMs);
    }
  };

  const sendBatchWithRetry = async (batch: AuditRow[]): Promise<void> => {
    if (batch.length === 0) return;
    try {
      await options.insert(batch);
    } catch {
      try {
        await options.insert(batch);
      } catch {
        // Drops that batch after single retry failure, never throws
      }
    }
  };

  const flush = async (): Promise<void> => {
    clearTimer();
    while (inFlight) {
      try {
        await inFlight;
      } catch {
        // inFlight handles its own errors
      }
    }

    if (queue.length === 0) return;
    const batch = queue;
    queue = [];

    inFlight = sendBatchWithRetry(batch);
    try {
      await inFlight;
    } finally {
      inFlight = null;
      if (queue.length > 0 && !disposed) {
        if (queue.length >= maxBatch) {
          void flush();
        } else {
          scheduleTimer();
        }
      }
    }
  };

  const push = (entry: AuditEntry): void => {
    if (disposed) return;
    try {
      if (!options.enabled()) return;
      const row = mapEntryToRow(entry);
      queue.push(row);
      if (queue.length >= maxBatch) {
        void flush();
      } else {
        scheduleTimer();
      }
    } catch {
      // Never throws, never blocks the caller
    }
  };

  const dispose = (): void => {
    disposed = true;
    clearTimer();
  };

  return {
    push,
    flush,
    dispose,
  };
}
