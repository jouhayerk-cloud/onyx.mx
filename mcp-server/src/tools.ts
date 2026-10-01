import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ONYX_DATA_TOOLS, OnyxDataTool } from "../../supabase/functions/_shared/onyxDataTools.ts";
import { executeOnyxDataTool, CallerContext } from "../../supabase/functions/_shared/onyxDataHandlers.ts";

/**
 * Converts a JSON Schema object from ONYX_DATA_TOOLS into a ZodRawShape
 * compatible with MCP SDK's registerTool.
 */
function jsonSchemaToZodShape(schema: Record<string, unknown>): Record<string, z.ZodTypeAny> {
  const properties = (schema?.properties as Record<string, any>) || {};
  const requiredList = new Set<string>(Array.isArray(schema?.required) ? schema.required : []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let zodType: z.ZodTypeAny;

    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      zodType = z.enum(prop.enum as [string, ...string[]]);
    } else if (prop.type === "string") {
      zodType = z.string();
    } else if (prop.type === "integer") {
      let num = z.number().int();
      if (typeof prop.minimum === "number") num = num.min(prop.minimum);
      if (typeof prop.maximum === "number") num = num.max(prop.maximum);
      zodType = num;
    } else if (prop.type === "number") {
      let num = z.number();
      if (typeof prop.minimum === "number") num = num.min(prop.minimum);
      if (typeof prop.maximum === "number") num = num.max(prop.maximum);
      zodType = num;
    } else if (prop.type === "boolean") {
      zodType = z.boolean();
    } else if (prop.type === "array") {
      zodType = z.array(z.string());
    } else {
      zodType = z.any();
    }

    if (typeof prop.description === "string") {
      zodType = zodType.describe(prop.description);
    }

    const isRequired = requiredList.has(key);
    if (prop.default !== undefined) {
      zodType = zodType.default(prop.default);
    } else if (!isRequired) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return shape;
}

/**
 * Humanizes a snake_case tool name into a Title Case display name.
 */
function humanizeToolName(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Registers all 33 Onyx.mx data tools onto the McpServer instance.
 */
export function registerTools(server: McpServer, supabase: SupabaseClient): void {
  // Local MCP server executes in a trusted developer environment for the AI agent
  const trustedCaller: CallerContext = {
    role: "Developer",
    isServiceRole: true,
  };

  for (const tool of ONYX_DATA_TOOLS) {
    const inputSchema = jsonSchemaToZodShape(tool.inputSchema);
    const title = humanizeToolName(tool.name);

    server.registerTool(
      tool.name,
      {
        title,
        description: tool.description,
        inputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
        },
      },
      async (args: any) => {
        try {
          const result = await executeOnyxDataTool(
            supabase,
            tool.name,
            args ?? {},
            trustedCaller
          );

          return {
            content: result.content,
            isError: result.isError,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error executing tool '${tool.name}': ${message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}
