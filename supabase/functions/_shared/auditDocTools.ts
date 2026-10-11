// =============================================================================
// Onyx.mx Audit Trail & Document Jobs MCP tools (Backlog Items 2 & 3).
// =============================================================================
// Implements:
//   - audit_trail_recent_calls: Developer & Admin audit inspection
//   - document_jobs_check_status: All-staff document generation/print tracking
//
// Deno-importable and dependency-free — loadable from edge runtime and Node.
// =============================================================================

import {
  isRoleAllowed,
  type OnyxDataTool,
} from "./onyxDataTools.ts";

// ── Role Sets ─────────────────────────────────────────────────────────────────
/** Roles that may read document job metadata. The tool runs on the service role (RLS does not apply), so Vendor and ClientViewer are excluded. */
export const DOC_JOB_ROLES: string[] = ["Developer", "Admin", "ClientBoss", "ClientAccounting"];

export const AUDIT_ROLES: string[] = [
  "Developer",
  "Admin",
];

// ── Allowed Values ────────────────────────────────────────────────────────────
export const AUDIT_OUTCOMES = [
  "ok",
  "denied",
  "invalid",
  "rate_limited",
  "declined",
  "error",
  "timeout",
  "killed",
] as const;
export type AuditOutcome = typeof AUDIT_OUTCOMES[number];

export const DOC_JOB_SEASONS = ["826", "legacy"] as const;
export type DocJobSeason = typeof DOC_JOB_SEASONS[number];

export const DOC_JOB_KINDS = ["pdf", "label", "xlsx", "csv"] as const;
export type DocJobKind = typeof DOC_JOB_KINDS[number];

// ── Column Select Lists (Shaped columns only) ──────────────────────────────────
export const AUDIT_SELECT_COLUMNS =
  "tool,caller_role,outcome,duration_ms,args_summary,at,device_id,code" as const;

export const DOC_JOB_SELECT_COLUMNS =
  "job_ref,kind,season,template_id,current_status,status_at,file_name,channel,created_at" as const;

// ── Tool Definitions ──────────────────────────────────────────────────────────
export const AUDIT_DOC_TOOLS: OnyxDataTool[] = [
  {
    name: "audit_trail_recent_calls",
    description:
      "Review recent MCP bridge and Onyx agent invocations for security. Restricted to Developer and Admin.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum audit records to return (1-100, default 20).",
          default: 20,
          minimum: 1,
          maximum: 100,
        },
        caller_role: {
          type: "string",
          description:
            "Filter by caller role (e.g. 'voice', 'staff-device', 'staff', 'agent', 'gateway'). Max 20 characters.",
          maxLength: 20,
        },
        outcome: {
          type: "string",
          description:
            "Filter by invocation outcome (ok, denied, invalid, rate_limited, declined, error, timeout, killed).",
          enum: [
            "ok",
            "denied",
            "invalid",
            "rate_limited",
            "declined",
            "error",
            "timeout",
            "killed",
          ],
          maxLength: 20,
        },
      },
    },
    requiredRoles: AUDIT_ROLES,
  },
  {
    name: "document_jobs_check_status",
    description:
      "Check the rendering and printing status of document jobs from the document_jobs_current view. Accessible to all staff.",
    inputSchema: {
      type: "object",
      properties: {
        season: {
          type: "string",
          description: "Filter by season ('826' or 'legacy').",
          enum: ["826", "legacy"],
        },
        kind: {
          type: "string",
          description: "Filter by document kind ('pdf', 'label', 'xlsx', 'csv').",
          enum: ["pdf", "label", "xlsx", "csv"],
        },
        limit: {
          type: "integer",
          description: "Maximum jobs to return (1-100, default 20).",
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
    },
    requiredRoles: DOC_JOB_ROLES,
  },
];

// ── Interfaces & Types ────────────────────────────────────────────────────────

export interface ValidatedAuditParams {
  limit: number;
  caller_role?: string;
  outcome?: AuditOutcome;
}

export type AuditValidationResult =
  | { ok: true; params: ValidatedAuditParams }
  | { ok: false; error: string };

export interface ValidatedDocJobParams {
  limit: number;
  season?: DocJobSeason;
  kind?: DocJobKind;
}

export type DocJobValidationResult =
  | { ok: true; params: ValidatedDocJobParams }
  | { ok: false; error: string };

export interface ShapedAuditRow {
  tool: string;
  caller_role: string;
  outcome: string;
  duration_ms: number;
  args_summary: string;
  at: string;
  device_id: string | null;
  code: string | null;
}

export interface ShapedDocJobRow {
  job_ref: string;
  kind: string;
  season: string;
  template_id: string;
  current_status: string | null;
  status_at: string | null;
  file_name: string | null;
  channel: string | null;
  created_at: string;
}

export interface AuditTrailResult {
  audit_logs: ShapedAuditRow[];
}

export interface DocumentJobsResult {
  jobs: ShapedDocJobRow[];
}

export interface SupabaseClientLike {
  from(table: string): {
    select(columns: string): any;
    [key: string]: any;
  };
}

// ── Role Authorization Helpers ────────────────────────────────────────────────

export function authorizeAuditRole(role: string): {
  allowed: boolean;
  status?: number;
  error?: string;
} {
  if (!isRoleAllowed(role, AUDIT_ROLES)) {
    return {
      allowed: false,
      status: 403,
      error: `Forbidden: role '${role}' is not authorized to access audit_trail_recent_calls (requires Developer or Admin)`,
    };
  }
  return { allowed: true };
}

export function authorizeDocJobRole(role: string): {
  allowed: boolean;
  status?: number;
  error?: string;
} {
  if (!isRoleAllowed(role, DOC_JOB_ROLES)) {
    return {
      allowed: false,
      status: 403,
      error: `Forbidden: role '${role}' is not authorized to access document_jobs_check_status`,
    };
  }
  return { allowed: true };
}

// ── Argument Validation Functions ─────────────────────────────────────────────

/**
 * Validates input arguments for audit_trail_recent_calls.
 * Enforces:
 * - limit: optional integer, 1 to 100 inclusive, defaults to 20
 * - caller_role: optional string, max 20 characters
 * - outcome: optional string, max 20 characters, restricted to AUDIT_OUTCOMES
 */
export function validateAuditArgs(rawArgs: unknown): AuditValidationResult {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, error: "Arguments must be an object" };
  }

  const args = rawArgs as Record<string, unknown>;

  let limit = 20;
  if (args.limit !== undefined && args.limit !== null) {
    if (typeof args.limit !== "number" || !Number.isInteger(args.limit)) {
      return { ok: false, error: "limit must be an integer" };
    }
    if (args.limit < 1 || args.limit > 100) {
      return { ok: false, error: "limit must be between 1 and 100" };
    }
    limit = args.limit;
  }

  let caller_role: string | undefined = undefined;
  if (args.caller_role !== undefined && args.caller_role !== null) {
    if (typeof args.caller_role !== "string") {
      return { ok: false, error: "caller_role must be a string" };
    }
    if (args.caller_role.length > 20) {
      return { ok: false, error: "caller_role must not exceed 20 characters" };
    }
    caller_role = args.caller_role;
  }

  let outcome: AuditOutcome | undefined = undefined;
  if (args.outcome !== undefined && args.outcome !== null) {
    if (typeof args.outcome !== "string") {
      return { ok: false, error: "outcome must be a string" };
    }
    if (args.outcome.length > 20) {
      return { ok: false, error: "outcome must not exceed 20 characters" };
    }
    if (!AUDIT_OUTCOMES.includes(args.outcome as AuditOutcome)) {
      return {
        ok: false,
        error: `outcome must be one of: ${AUDIT_OUTCOMES.join(", ")}`,
      };
    }
    outcome = args.outcome as AuditOutcome;
  }

  return {
    ok: true,
    params: {
      limit,
      ...(caller_role !== undefined ? { caller_role } : {}),
      ...(outcome !== undefined ? { outcome } : {}),
    },
  };
}

/**
 * Validates input arguments for document_jobs_check_status.
 * Enforces:
 * - season: optional string, "826" or "legacy"
 * - kind: optional string, "pdf" | "label" | "xlsx" | "csv"
 * - limit: optional integer, 1 to 100 inclusive, defaults to 20
 */
export function validateDocJobArgs(rawArgs: unknown): DocJobValidationResult {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, error: "Arguments must be an object" };
  }

  const args = rawArgs as Record<string, unknown>;

  let limit = 20;
  if (args.limit !== undefined && args.limit !== null) {
    if (typeof args.limit !== "number" || !Number.isInteger(args.limit)) {
      return { ok: false, error: "limit must be an integer" };
    }
    if (args.limit < 1 || args.limit > 100) {
      return { ok: false, error: "limit must be between 1 and 100" };
    }
    limit = args.limit;
  }

  let season: DocJobSeason | undefined = undefined;
  if (args.season !== undefined && args.season !== null) {
    if (typeof args.season !== "string") {
      return { ok: false, error: "season must be a string" };
    }
    if (args.season.length > 20) {
      return { ok: false, error: "season must not exceed 20 characters" };
    }
    if (!DOC_JOB_SEASONS.includes(args.season as DocJobSeason)) {
      return {
        ok: false,
        error: `season must be one of: ${DOC_JOB_SEASONS.join(", ")}`,
      };
    }
    season = args.season as DocJobSeason;
  }

  let kind: DocJobKind | undefined = undefined;
  if (args.kind !== undefined && args.kind !== null) {
    if (typeof args.kind !== "string") {
      return { ok: false, error: "kind must be a string" };
    }
    if (args.kind.length > 20) {
      return { ok: false, error: "kind must not exceed 20 characters" };
    }
    if (!DOC_JOB_KINDS.includes(args.kind as DocJobKind)) {
      return {
        ok: false,
        error: `kind must be one of: ${DOC_JOB_KINDS.join(", ")}`,
      };
    }
    kind = args.kind as DocJobKind;
  }

  return {
    ok: true,
    params: {
      limit,
      ...(season !== undefined ? { season } : {}),
      ...(kind !== undefined ? { kind } : {}),
    },
  };
}

// ── Row Shapers ───────────────────────────────────────────────────────────────

/**
 * Shapes a raw onyxchan_audit database row into the safe external schema.
 * Extracts: tool, caller_role, outcome, duration_ms, args_summary, at, device_id, code.
 * NEVER exposes user_id, request_id, or command_id.
 */
export function shapeAuditRow(raw: Record<string, unknown>): ShapedAuditRow {
  return {
    tool: typeof raw.tool === "string" ? raw.tool : String(raw.tool ?? ""),
    caller_role:
      typeof raw.caller_role === "string"
        ? raw.caller_role
        : String(raw.caller_role ?? ""),
    outcome:
      typeof raw.outcome === "string" ? raw.outcome : String(raw.outcome ?? ""),
    duration_ms:
      typeof raw.duration_ms === "number"
        ? raw.duration_ms
        : Number(raw.duration_ms ?? 0),
    args_summary:
      typeof raw.args_summary === "string"
        ? raw.args_summary
        : String(raw.args_summary ?? ""),
    at:
      typeof raw.at === "string"
        ? raw.at
        : raw.at instanceof Date
        ? raw.at.toISOString()
        : String(raw.at ?? ""),
    device_id:
      typeof raw.device_id === "string"
        ? raw.device_id
        : raw.device_id === null || raw.device_id === undefined
        ? null
        : String(raw.device_id),
    code:
      typeof raw.code === "string"
        ? raw.code
        : raw.code === null || raw.code === undefined
        ? null
        : String(raw.code),
  };
}

/**
 * Shapes a raw document_jobs_current database row into the safe external schema.
 * Extracts: job_ref, kind, season, template_id, current_status, status_at, file_name, channel, created_at.
 * NEVER exposes data_snapshot, parameters, created_by, data_hash, output_sha256, or hash_version.
 */
export function shapeDocJobRow(raw: Record<string, unknown>): ShapedDocJobRow {
  return {
    job_ref:
      typeof raw.job_ref === "string" ? raw.job_ref : String(raw.job_ref ?? ""),
    kind: typeof raw.kind === "string" ? raw.kind : String(raw.kind ?? ""),
    season:
      typeof raw.season === "string" ? raw.season : String(raw.season ?? ""),
    template_id:
      typeof raw.template_id === "string"
        ? raw.template_id
        : String(raw.template_id ?? ""),
    current_status:
      typeof raw.current_status === "string"
        ? raw.current_status
        : raw.current_status === null || raw.current_status === undefined
        ? null
        : String(raw.current_status),
    status_at:
      typeof raw.status_at === "string"
        ? raw.status_at
        : raw.status_at instanceof Date
        ? raw.status_at.toISOString()
        : raw.status_at === null || raw.status_at === undefined
        ? null
        : String(raw.status_at),
    file_name:
      typeof raw.file_name === "string"
        ? raw.file_name
        : raw.file_name === null || raw.file_name === undefined
        ? null
        : String(raw.file_name),
    channel:
      typeof raw.channel === "string"
        ? raw.channel
        : raw.channel === null || raw.channel === undefined
        ? null
        : String(raw.channel),
    created_at:
      typeof raw.created_at === "string"
        ? raw.created_at
        : raw.created_at instanceof Date
        ? raw.created_at.toISOString()
        : String(raw.created_at ?? ""),
  };
}

/**
 * Shapes an array of audit rows into the payload object.
 */
export function shapeAuditResult(
  rows: Record<string, unknown>[]
): AuditTrailResult {
  return {
    audit_logs: rows.map(shapeAuditRow),
  };
}

/**
 * Shapes an array of document job rows into the payload object.
 */
export function shapeDocJobResult(
  rows: Record<string, unknown>[]
): DocumentJobsResult {
  return {
    jobs: rows.map(shapeDocJobRow),
  };
}

// ── Database Query Runners ────────────────────────────────────────────────────

/**
 * Executes audit_trail_recent_calls against onyxchan_audit table.
 * Queries onyxchan_audit, ordered by created_at desc, selecting only shaped columns.
 * Filters by caller_role and outcome when provided. Throws database error on failure.
 */
export async function runAuditTrailRecentCalls(
  supabase: SupabaseClientLike,
  params: ValidatedAuditParams
): Promise<AuditTrailResult> {
  let query = supabase
    .from("onyxchan_audit")
    .select(AUDIT_SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (params.caller_role !== undefined) {
    query = query.eq("caller_role", params.caller_role);
  }
  if (params.outcome !== undefined) {
    query = query.eq("outcome", params.outcome);
  }

  query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return shapeAuditResult(rows);
}

/**
 * Executes document_jobs_check_status against document_jobs_current view.
 * Queries document_jobs_current, ordered by created_at desc, selecting only shaped columns.
 * Filters by season and kind when provided. Throws database error on failure.
 */
export async function runDocumentJobsStatus(
  supabase: SupabaseClientLike,
  params: ValidatedDocJobParams
): Promise<DocumentJobsResult> {
  let query = supabase
    .from("document_jobs_current")
    .select(DOC_JOB_SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (params.season !== undefined) {
    query = query.eq("season", params.season);
  }
  if (params.kind !== undefined) {
    query = query.eq("kind", params.kind);
  }

  query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return shapeDocJobResult(rows);
}
