# onyx-mx-mcp-server

MCP (Model Context Protocol) server for Onyx.mx warehouse management, inventory tracking, finance, and logistics operations. It exposes 33 read-only tools across inventory, finance, logistics, production, and system domains to AI agents.

## Features & Tool Domains

The server provides 33 specialized tools organized across 6 functional domains:

- **Inventory (10 tools)**: Query, filter, and inspect inventory items, dimensions, status, materials, shapes, and media.
- **Finance (5 tools)**: Retrieve payments, expenses, vendor disbursements, and multi-currency records.
- **Logistics (6 tools)**: Track crates, pallets, truck manifests, and dispatch records.
- **Production (2 tools)**: Query workshop manufacturing orders and production stages.
- **System (5 tools)**: App user RBAC checks, audit trails, and device status.
- **Display (5 tools)**: Formatted presentation views, summaries, and reporting layouts.

### Available Resources

The server exposes standard MCP resources for quick context retrieval:
- `onyx://schema`: Supabase database schema documentation and table definitions.
- `onyx://stats`: Warehouse operational statistics and real-time inventory counts.
- `onyx://vendors`: Vendor configuration and profile metadata.
- `onyx://settings`: Global key-value store and system settings (e.g., currency exchange rates).

## Prerequisites

- **Node.js**: 20.0.0 or higher
- **npm**: 10.0.0 or higher

## Setup Instructions

1. **Install dependencies**:
   ```bash
   cd mcp-server
   npm install
   ```

2. **Configure environment variables**:
   Ensure `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are defined in `../.env.local` (the parent application directory):
   ```env
   SUPABASE_URL=https://<project-id>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=ey...
   ```

3. **Build the server**:
   ```bash
   npm run build
   ```

4. **Test with MCP Inspector**:
   ```bash
   npm run inspect
   ```

## Agent Integration

To connect the server to Claude Desktop or Antigravity MCP clients, add the server configuration to your MCP configuration file:

```json
{
  "mcpServers": {
    "onyx-mx": {
      "command": "node",
      "args": ["c:\\Jouhayerk\\git\\app\\mcp-server\\dist\\index.js"]
    }
  }
}
```

> **Security Note on Config**: The server automatically loads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `../.env.local` via dotenv. **Do NOT** place secrets in the client MCP configuration JSON.

## Security Architecture

- **Local Transport Only**: The MCP server communicates strictly over local standard I/O (`stdio`). It does not bind to any network ports or expose external HTTP/WebSocket endpoints.
- **Secret Isolation**: The Supabase service role key is kept in `../.env.local` which is strictly `.gitignore`d and never committed to source control.
- **Deployment Scope**: This service is strictly a local developer/agent tool and is never deployed to public hosting (such as GitHub Pages).
- **Enforced Access Control**: Because the service role key bypasses PostgreSQL Row-Level Security (RLS), application-level RBAC role checks and vendor ID scoping are enforced inside tool handlers.

## Development

- **Hot-Reload Development**:
  ```bash
  npm run dev
  ```
  Runs `tsx src/index.ts` for live execution without pre-compiling.

- **Type Checking**:
  ```bash
  npm run typecheck
  ```
  Runs `tsc --noEmit` to validate TypeScript types against `src/` and shared Supabase functions (`../supabase/functions/_shared/*.ts`).
