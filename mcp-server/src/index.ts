import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { registerResources } from "./resources.ts";
import { registerPrompts } from "./prompts.ts";
import { registerTools } from "./tools.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Environment Configuration ────────────────────────────────────────────────
// Attempt loading environment variables from candidate paths (.env.local / .env)
const envPaths = [
  path.resolve(process.cwd(), "../.env.local"),
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../.env.local"),
  path.resolve(__dirname, "../../.env.local"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error("[ERROR] Missing SUPABASE_URL or VITE_SUPABASE_URL environment variable.");
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error("[ERROR] Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[WARN] SUPABASE_SERVICE_ROLE_KEY not detected; using VITE_SUPABASE_ANON_KEY fallback for local inspection.");
}

// ── Supabase Client Initialization ───────────────────────────────────────────
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// ── MCP Server Initialization ────────────────────────────────────────────────
const server = new McpServer({
  name: "onyx-mx-mcp-server",
  version: "1.0.0",
});

// Register all server capabilities
registerResources(server, supabase);
registerPrompts(server);
registerTools(server, supabase);

// ── Connect Stdio Transport ──────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Status and diagnostic logs MUST ALWAYS go to stderr (stdout is strictly reserved for JSON-RPC)
  console.error("[onyx-mx-mcp-server] MCP Server connected via stdio transport.");
  console.error(`[onyx-mx-mcp-server] Supabase endpoint: ${new URL(supabaseUrl!).hostname}`);
  console.error("[onyx-mx-mcp-server] Registered 8 resources, 4 prompts, and 33 data tools.");
}

main().catch((err) => {
  console.error("[onyx-mx-mcp-server] Fatal startup error:", err);
  process.exit(1);
});
