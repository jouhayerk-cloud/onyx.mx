import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isRoleAllowed } from "./onyxDataTools.ts";
import {
  DOC_JOB_ROLES,
  AUDIT_DOC_TOOLS,
  AUDIT_ROLES,
  AUDIT_OUTCOMES,
  DOC_JOB_SEASONS,
  DOC_JOB_KINDS,
  AUDIT_SELECT_COLUMNS,
  DOC_JOB_SELECT_COLUMNS,
  validateAuditArgs,
  validateDocJobArgs,
  shapeAuditRow,
  shapeDocJobRow,
  shapeAuditResult,
  shapeDocJobResult,
  authorizeAuditRole,
  authorizeDocJobRole,
  runAuditTrailRecentCalls,
  runDocumentJobsStatus,
} from "./auditDocTools.ts";

// ── Mock Database Client Helper ───────────────────────────────────────────────

function createMockClient(mockData: unknown, mockError: unknown = null) {
  const recordedCalls: { method: string; args: unknown[] }[] = [];

  const chain: Record<string, unknown> = {
    select(columns: string) {
      recordedCalls.push({ method: "select", args: [columns] });
      return chain;
    },
    order(column: string, options?: unknown) {
      recordedCalls.push({ method: "order", args: [column, options] });
      return chain;
    },
    eq(column: string, value: unknown) {
      recordedCalls.push({ method: "eq", args: [column, value] });
      return chain;
    },
    limit(count: number) {
      recordedCalls.push({ method: "limit", args: [count] });
      return chain;
    },
    then(
      onfulfilled?: ((val: { data: unknown; error: unknown }) => unknown) | null,
      onrejected?: ((err: unknown) => unknown) | null
    ) {
      return Promise.resolve({ data: mockData, error: mockError }).then(
        onfulfilled,
        onrejected
      );
    },
  };

  return {
    recordedCalls,
    from(tableName: string) {
      recordedCalls.push({ method: "from", args: [tableName] });
      return chain;
    },
  };
}

// ── 1. Tool Registration & Schema Tests ───────────────────────────────────────

Deno.test("audit_trail_recent_calls is registered in AUDIT_DOC_TOOLS with correct schema", () => {
  const tool = AUDIT_DOC_TOOLS.find((t) => t.name === "audit_trail_recent_calls");
  assert(tool !== undefined, "audit_trail_recent_calls must be registered");
  assertEquals(tool.name, "audit_trail_recent_calls");
  assertEquals(tool.requiredRoles, AUDIT_ROLES);

  const schema = tool.inputSchema as {
    type: string;
    properties: Record<
      string,
      { type: string; maxLength?: number; minimum?: number; maximum?: number; default?: number; enum?: string[] }
    >;
  };
  assertEquals(schema.type, "object");
  assertEquals(schema.properties.limit.type, "integer");
  assertEquals(schema.properties.limit.minimum, 1);
  assertEquals(schema.properties.limit.maximum, 100);
  assertEquals(schema.properties.limit.default, 20);

  assertEquals(schema.properties.caller_role.type, "string");
  assertEquals(schema.properties.caller_role.maxLength, 20);

  assertEquals(schema.properties.outcome.type, "string");
  assertEquals(schema.properties.outcome.maxLength, 20);
  assertEquals(schema.properties.outcome.enum, [
    "ok",
    "denied",
    "invalid",
    "rate_limited",
    "declined",
    "error",
    "timeout",
    "killed",
  ]);
});

Deno.test("document_jobs_check_status is registered in AUDIT_DOC_TOOLS with correct schema", () => {
  const tool = AUDIT_DOC_TOOLS.find((t) => t.name === "document_jobs_check_status");
  assert(tool !== undefined, "document_jobs_check_status must be registered");
  assertEquals(tool.name, "document_jobs_check_status");
  assertEquals(tool.requiredRoles, DOC_JOB_ROLES);

  const schema = tool.inputSchema as {
    type: string;
    properties: Record<
      string,
      { type: string; enum?: string[]; minimum?: number; maximum?: number; default?: number }
    >;
  };
  assertEquals(schema.type, "object");
  assertEquals(schema.properties.season.type, "string");
  assertEquals(schema.properties.season.enum, ["826", "legacy"]);

  assertEquals(schema.properties.kind.type, "string");
  assertEquals(schema.properties.kind.enum, ["pdf", "label", "xlsx", "csv"]);

  assertEquals(schema.properties.limit.type, "integer");
  assertEquals(schema.properties.limit.minimum, 1);
  assertEquals(schema.properties.limit.maximum, 100);
  assertEquals(schema.properties.limit.default, 20);
});

// ── 2. Role Lists & Authorization Tests ───────────────────────────────────────

Deno.test("AUDIT_ROLES contains Developer and Admin only", () => {
  assertEquals(AUDIT_ROLES.sort(), ["Admin", "Developer"]);
});

Deno.test("audit tool refuses ClientBoss with 403 Forbidden", () => {
  const auth = authorizeAuditRole("ClientBoss");
  assertEquals(auth.allowed, false);
  assertEquals(auth.status, 403);
  assert(auth.error !== undefined);
  assert(auth.error.includes("requires Developer or Admin"));
  assertEquals(isRoleAllowed("ClientBoss", AUDIT_ROLES), false);
});

Deno.test("audit tool refuses non-admin roles (ClientAccounting, ClientViewer, Vendor)", () => {
  for (const role of ["ClientAccounting", "ClientViewer", "Vendor", "Client"]) {
    const auth = authorizeAuditRole(role);
    assertEquals(auth.allowed, false);
    assertEquals(auth.status, 403);
    assertEquals(isRoleAllowed(role, AUDIT_ROLES), false);
  }
});

Deno.test("audit tool permits Developer and Admin", () => {
  for (const role of ["Developer", "Admin"]) {
    const auth = authorizeAuditRole(role);
    assertEquals(auth.allowed, true);
    assertEquals(auth.status, undefined);
    assertEquals(isRoleAllowed(role, AUDIT_ROLES), true);
  }
});

Deno.test("document jobs tool requiredRoles asserts against real DOC_JOB_ROLES constant", () => {
  const tool = AUDIT_DOC_TOOLS.find((t) => t.name === "document_jobs_check_status");
  assert(tool !== undefined);
  assertEquals(tool.requiredRoles, DOC_JOB_ROLES);

  // Every role in DOC_JOB_ROLES is permitted
  for (const role of DOC_JOB_ROLES) {
    const auth = authorizeDocJobRole(role);
    assertEquals(auth.allowed, true);
    assertEquals(isRoleAllowed(role, DOC_JOB_ROLES), true);
  }

  // Any non-staff role is rejected
  const authOutsider = authorizeDocJobRole("ExternalUser");
  assertEquals(authOutsider.allowed, false);
  assertEquals(authOutsider.status, 403);
});

// ── 3. Argument Validation Tests: validateAuditArgs ───────────────────────────

Deno.test("validateAuditArgs accepts empty object and sets default limit 20", () => {
  const result = validateAuditArgs({});
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.params.limit, 20);
    assertEquals(result.params.caller_role, undefined);
    assertEquals(result.params.outcome, undefined);
  }
});

Deno.test("validateAuditArgs accepts valid caller_role and outcome", () => {
  const result = validateAuditArgs({
    limit: 50,
    caller_role: "voice",
    outcome: "ok",
  });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.params.limit, 50);
    assertEquals(result.params.caller_role, "voice");
    assertEquals(result.params.outcome, "ok");
  }
});

Deno.test("validateAuditArgs accepts all valid outcomes from migration check constraint", () => {
  for (const outcome of AUDIT_OUTCOMES) {
    const result = validateAuditArgs({ outcome });
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.params.outcome, outcome);
    }
  }
});

Deno.test("validateAuditArgs rejects limit 0 (below minimum 1)", () => {
  const result = validateAuditArgs({ limit: 0 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "limit must be between 1 and 100");
  }
});

Deno.test("validateAuditArgs rejects limit 101 (above maximum 100)", () => {
  const result = validateAuditArgs({ limit: 101 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "limit must be between 1 and 100");
  }
});

Deno.test("validateAuditArgs rejects non-integer limit", () => {
  const result = validateAuditArgs({ limit: 20.5 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "limit must be an integer");
  }
});

Deno.test("validateAuditArgs rejects caller_role exceeding 20 characters", () => {
  const result = validateAuditArgs({ caller_role: "a".repeat(21) });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "caller_role must not exceed 20 characters");
  }
});

Deno.test("validateAuditArgs rejects non-string caller_role", () => {
  const result = validateAuditArgs({ caller_role: 12345 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "caller_role must be a string");
  }
});

Deno.test("validateAuditArgs rejects outcome exceeding 20 characters", () => {
  const result = validateAuditArgs({ outcome: "a".repeat(21) });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "outcome must not exceed 20 characters");
  }
});

Deno.test("validateAuditArgs rejects unknown outcome not in check list", () => {
  const result = validateAuditArgs({ outcome: "unauthorized" });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assert(result.error.includes("outcome must be one of"));
  }
});

Deno.test("validateAuditArgs rejects non-string outcome", () => {
  const result = validateAuditArgs({ outcome: true });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "outcome must be a string");
  }
});

Deno.test("validateAuditArgs rejects non-object inputs", () => {
  assertEquals(validateAuditArgs(null).ok, false);
  assertEquals(validateAuditArgs("string").ok, false);
  assertEquals(validateAuditArgs([1, 2]).ok, false);
  assertEquals(validateAuditArgs(42).ok, false);
});

// ── 4. Argument Validation Tests: validateDocJobArgs ──────────────────────────

Deno.test("validateDocJobArgs accepts empty object and sets default limit 20", () => {
  const result = validateDocJobArgs({});
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.params.limit, 20);
    assertEquals(result.params.season, undefined);
    assertEquals(result.params.kind, undefined);
  }
});

Deno.test("validateDocJobArgs accepts valid season and kind combinations", () => {
  for (const season of DOC_JOB_SEASONS) {
    for (const kind of DOC_JOB_KINDS) {
      const result = validateDocJobArgs({ season, kind, limit: 10 });
      assertEquals(result.ok, true);
      if (result.ok) {
        assertEquals(result.params.season, season);
        assertEquals(result.params.kind, kind);
        assertEquals(result.params.limit, 10);
      }
    }
  }
});

Deno.test("validateDocJobArgs rejects limit 0", () => {
  const result = validateDocJobArgs({ limit: 0 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "limit must be between 1 and 100");
  }
});

Deno.test("validateDocJobArgs rejects limit 101", () => {
  const result = validateDocJobArgs({ limit: 101 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "limit must be between 1 and 100");
  }
});

Deno.test("validateDocJobArgs rejects invalid season", () => {
  const result = validateDocJobArgs({ season: "825" });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assert(result.error.includes("season must be one of"));
  }
});

Deno.test("validateDocJobArgs rejects season exceeding 20 characters", () => {
  const result = validateDocJobArgs({ season: "a".repeat(21) });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "season must not exceed 20 characters");
  }
});

Deno.test("validateDocJobArgs rejects non-string season", () => {
  const result = validateDocJobArgs({ season: 826 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "season must be a string");
  }
});

Deno.test("validateDocJobArgs rejects invalid kind", () => {
  const result = validateDocJobArgs({ kind: "doc" });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assert(result.error.includes("kind must be one of"));
  }
});

Deno.test("validateDocJobArgs rejects kind exceeding 20 characters", () => {
  const result = validateDocJobArgs({ kind: "a".repeat(21) });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "kind must not exceed 20 characters");
  }
});

Deno.test("validateDocJobArgs rejects non-string kind", () => {
  const result = validateDocJobArgs({ kind: false });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "kind must be a string");
  }
});

Deno.test("validateDocJobArgs rejects non-object inputs", () => {
  assertEquals(validateDocJobArgs(null).ok, false);
  assertEquals(validateDocJobArgs("text").ok, false);
  assertEquals(validateDocJobArgs([1]).ok, false);
  assertEquals(validateDocJobArgs(100).ok, false);
});

// ── 5. Row Shapers & Redaction Guarantee Tests ────────────────────────────────

Deno.test("shapeAuditRow never exposes user_id, request_id, command_id or extra fields", () => {
  const rawRow = {
    id: "uuid-1234",
    user_id: "00000000-0000-0000-0000-000000000001",
    request_id: "req-abc-xyz",
    command_id: "cmd-rpc-999",
    tool: "inventory_search",
    caller_role: "voice",
    app_role: "Developer",
    direction: "in",
    risk: "read",
    device_id: "onyxchan-01",
    outcome: "ok",
    code: "SUCCESS_200",
    duration_ms: 120,
    args_summary: '{"query": "bowl"}',
    source: "app",
    confirmed: false,
    at: "2026-10-10T12:00:00Z",
    created_at: "2026-10-10T12:00:00Z",
  };

  const shaped = shapeAuditRow(rawRow);

  // Assert forbidden columns are never exposed
  assert(!("user_id" in shaped), "user_id must never be exposed");
  assert(!("request_id" in shaped), "request_id must never be exposed");
  assert(!("command_id" in shaped), "command_id must never be exposed");
  assert(!("id" in shaped), "id must not be exposed");
  assert(!("direction" in shaped), "direction must not be exposed");
  assert(!("risk" in shaped), "risk must not be exposed");
  assert(!("app_role" in shaped), "app_role must not be exposed");
  assert(!("source" in shaped), "source must not be exposed");
  assert(!("confirmed" in shaped), "confirmed must not be exposed");

  // Verify shaped shape matches exact allowed columns
  assertEquals(shaped, {
    tool: "inventory_search",
    caller_role: "voice",
    outcome: "ok",
    duration_ms: 120,
    args_summary: '{"query": "bowl"}',
    at: "2026-10-10T12:00:00Z",
    device_id: "onyxchan-01",
    code: "SUCCESS_200",
  });

  assertEquals(Object.keys(shaped).sort(), [
    "args_summary",
    "at",
    "code",
    "caller_role",
    "device_id",
    "duration_ms",
    "outcome",
    "tool",
  ].sort());
});

Deno.test("shapeAuditRow handles nullable device_id and code gracefully", () => {
  const rawRow = {
    tool: "devices_onyxchan_telemetry",
    caller_role: "staff",
    outcome: "denied",
    duration_ms: 5,
    args_summary: "{}",
    at: "2026-10-10T14:30:00Z",
    device_id: null,
    code: null,
  };

  const shaped = shapeAuditRow(rawRow);
  assertEquals(shaped.device_id, null);
  assertEquals(shaped.code, null);
  assertEquals(shaped.outcome, "denied");
  assertEquals(shaped.duration_ms, 5);
});

Deno.test("shapeDocJobRow never exposes data_snapshot, parameters, created_by, or hashes", () => {
  const rawRow = {
    id: "job-uuid-1",
    job_ref: "JOB-2026-001",
    kind: "pdf",
    template_id: "tpl_invoice_v2",
    template_version: "2.1.0",
    season: "826",
    workbook: "v826",
    manifest_id: "MAN-01",
    crate_logistics_id: "CRATE-99",
    batch_id: "BATCH-A",
    parameters: { customer: "Top Secret", include_pricing: true },
    data_snapshot: { private_notes: "Do not disclose" },
    hash_version: 1,
    data_hash: "sha256-content-hash-abc",
    output_sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    output_bytes: 4096,
    file_name: "invoice_2026.pdf",
    channel: "s3_export",
    parent_job_id: null,
    legacy_print_job_id: null,
    app_version: "1.66.0",
    created_by: "00000000-0000-0000-0000-000000000002",
    created_by_label: "Admin User",
    client_created_at: "2026-10-10T10:00:00Z",
    created_at: "2026-10-10T10:00:05Z",
    current_status: "printed",
    status_at: "2026-10-10T10:01:00Z",
  };

  const shaped = shapeDocJobRow(rawRow);

  // Assert forbidden columns are never exposed
  assert(!("data_snapshot" in shaped), "data_snapshot must never be exposed");
  assert(!("parameters" in shaped), "parameters must never be exposed");
  assert(!("created_by" in shaped), "created_by must never be exposed");
  assert(!("data_hash" in shaped), "data_hash must never be exposed");
  assert(!("output_sha256" in shaped), "output_sha256 must never be exposed");
  assert(!("hash_version" in shaped), "hash_version must never be exposed");
  assert(!("output_bytes" in shaped), "output_bytes must not be exposed");
  assert(!("id" in shaped), "id must not be exposed");

  // Verify shaped shape matches exact allowed columns
  assertEquals(shaped, {
    job_ref: "JOB-2026-001",
    kind: "pdf",
    season: "826",
    template_id: "tpl_invoice_v2",
    current_status: "printed",
    status_at: "2026-10-10T10:01:00Z",
    file_name: "invoice_2026.pdf",
    channel: "s3_export",
    created_at: "2026-10-10T10:00:05Z",
  });

  assertEquals(Object.keys(shaped).sort(), [
    "channel",
    "created_at",
    "current_status",
    "file_name",
    "job_ref",
    "kind",
    "season",
    "status_at",
    "template_id",
  ].sort());
});

Deno.test("shapeDocJobRow handles nullable status, file_name, channel gracefully", () => {
  const rawRow = {
    job_ref: "JOB-2026-NEW",
    kind: "label",
    season: "legacy",
    template_id: "tpl_thermal_tag",
    current_status: null,
    status_at: null,
    file_name: null,
    channel: null,
    created_at: "2026-10-10T11:00:00Z",
  };

  const shaped = shapeDocJobRow(rawRow);
  assertEquals(shaped.current_status, null);
  assertEquals(shaped.status_at, null);
  assertEquals(shaped.file_name, null);
  assertEquals(shaped.channel, null);
  assertEquals(shaped.job_ref, "JOB-2026-NEW");
});

Deno.test("AUDIT_SELECT_COLUMNS does not contain forbidden columns", () => {
  assert(!AUDIT_SELECT_COLUMNS.includes("user_id"));
  assert(!AUDIT_SELECT_COLUMNS.includes("request_id"));
  assert(!AUDIT_SELECT_COLUMNS.includes("command_id"));
  assertEquals(
    AUDIT_SELECT_COLUMNS,
    "tool,caller_role,outcome,duration_ms,args_summary,at,device_id,code"
  );
});

Deno.test("DOC_JOB_SELECT_COLUMNS does not contain forbidden columns", () => {
  assert(!DOC_JOB_SELECT_COLUMNS.includes("data_snapshot"));
  assert(!DOC_JOB_SELECT_COLUMNS.includes("parameters"));
  assert(!DOC_JOB_SELECT_COLUMNS.includes("created_by"));
  assert(!DOC_JOB_SELECT_COLUMNS.includes("hash"));
  assertEquals(
    DOC_JOB_SELECT_COLUMNS,
    "job_ref,kind,season,template_id,current_status,status_at,file_name,channel,created_at"
  );
});

// ── 6. Query Runner Tests with Mock Client ────────────────────────────────────

Deno.test("runAuditTrailRecentCalls queries onyxchan_audit and returns shaped payload", async () => {
  const mockDbData = [
    {
      tool: "inventory_search",
      caller_role: "voice",
      outcome: "ok",
      duration_ms: 120,
      args_summary: '{"query": "sink"}',
      at: "2026-10-10T12:00:00Z",
      device_id: "onyxchan-01",
      code: "200",
      user_id: "forbidden-user-id",
      request_id: "forbidden-req-id",
    },
  ];

  const client = createMockClient(mockDbData);
  const result = await runAuditTrailRecentCalls(client as any, {
    limit: 5,
    caller_role: "voice",
    outcome: "ok",
  });

  // Verify result payload
  assertEquals(result, {
    audit_logs: [
      {
        tool: "inventory_search",
        caller_role: "voice",
        outcome: "ok",
        duration_ms: 120,
        args_summary: '{"query": "sink"}',
        at: "2026-10-10T12:00:00Z",
        device_id: "onyxchan-01",
        code: "200",
      },
    ],
  });

  // Verify chained PostgREST calls
  const fromCall = client.recordedCalls.find((c) => c.method === "from");
  assertEquals(fromCall?.args[0], "onyxchan_audit");

  const selectCall = client.recordedCalls.find((c) => c.method === "select");
  assertEquals(selectCall?.args[0], AUDIT_SELECT_COLUMNS);

  const orderCall = client.recordedCalls.find((c) => c.method === "order");
  assertEquals(orderCall?.args[0], "created_at");
  assertEquals(orderCall?.args[1], { ascending: false });

  const eqRole = client.recordedCalls.find(
    (c) => c.method === "eq" && c.args[0] === "caller_role"
  );
  assertEquals(eqRole?.args[1], "voice");

  const eqOutcome = client.recordedCalls.find(
    (c) => c.method === "eq" && c.args[0] === "outcome"
  );
  assertEquals(eqOutcome?.args[1], "ok");

  const limitCall = client.recordedCalls.find((c) => c.method === "limit");
  assertEquals(limitCall?.args[0], 5);
});

Deno.test("runAuditTrailRecentCalls throws database error on query failure", async () => {
  const dbError = new Error("Database connection timeout");
  const client = createMockClient(null, dbError);

  let caughtError: unknown = null;
  try {
    await runAuditTrailRecentCalls(client as any, { limit: 20 });
  } catch (err) {
    caughtError = err;
  }

  assert(caughtError !== null, "Should have thrown the database error");
  assertEquals((caughtError as Error).message, "Database connection timeout");
});

Deno.test("runDocumentJobsStatus queries document_jobs_current view and returns shaped payload", async () => {
  const mockDbData = [
    {
      job_ref: "JOB-2026-001",
      kind: "pdf",
      season: "826",
      template_id: "tpl_manifest_pdf",
      current_status: "rendered",
      status_at: "2026-10-10T15:00:00Z",
      file_name: "manifest.pdf",
      channel: "cloud_print",
      created_at: "2026-10-10T14:59:00Z",
      created_by: "forbidden-creator",
      parameters: { confidential: true },
    },
  ];

  const client = createMockClient(mockDbData);
  const result = await runDocumentJobsStatus(client as any, {
    limit: 10,
    season: "826",
    kind: "pdf",
  });

  // Verify result payload
  assertEquals(result, {
    jobs: [
      {
        job_ref: "JOB-2026-001",
        kind: "pdf",
        season: "826",
        template_id: "tpl_manifest_pdf",
        current_status: "rendered",
        status_at: "2026-10-10T15:00:00Z",
        file_name: "manifest.pdf",
        channel: "cloud_print",
        created_at: "2026-10-10T14:59:00Z",
      },
    ],
  });

  // Verify chained PostgREST calls
  const fromCall = client.recordedCalls.find((c) => c.method === "from");
  assertEquals(fromCall?.args[0], "document_jobs_current");

  const selectCall = client.recordedCalls.find((c) => c.method === "select");
  assertEquals(selectCall?.args[0], DOC_JOB_SELECT_COLUMNS);

  const orderCall = client.recordedCalls.find((c) => c.method === "order");
  assertEquals(orderCall?.args[0], "created_at");
  assertEquals(orderCall?.args[1], { ascending: false });

  const eqSeason = client.recordedCalls.find(
    (c) => c.method === "eq" && c.args[0] === "season"
  );
  assertEquals(eqSeason?.args[1], "826");

  const eqKind = client.recordedCalls.find(
    (c) => c.method === "eq" && c.args[0] === "kind"
  );
  assertEquals(eqKind?.args[1], "pdf");

  const limitCall = client.recordedCalls.find((c) => c.method === "limit");
  assertEquals(limitCall?.args[0], 10);
});

Deno.test("runDocumentJobsStatus throws database error on query failure", async () => {
  const dbError = new Error("View document_jobs_current query failed");
  const client = createMockClient(null, dbError);

  let caughtError: unknown = null;
  try {
    await runDocumentJobsStatus(client as any, { limit: 20 });
  } catch (err) {
    caughtError = err;
  }

  assert(caughtError !== null, "Should have thrown the database error");
  assertEquals((caughtError as Error).message, "View document_jobs_current query failed");
});
