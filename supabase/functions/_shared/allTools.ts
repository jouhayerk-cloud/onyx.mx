import { ONYX_DATA_TOOLS, type OnyxDataTool } from "./onyxDataTools.ts";
import { AUDIT_DOC_TOOLS } from "./auditDocTools.ts";

/** Every tool the data MCP server offers. A separate module because auditDocTools.ts imports onyxDataTools.ts (a cycle otherwise). */
export const ALL_ONYX_TOOLS: OnyxDataTool[] = [...ONYX_DATA_TOOLS, ...AUDIT_DOC_TOOLS];
