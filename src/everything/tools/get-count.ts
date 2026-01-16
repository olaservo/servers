import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * SEP-834 Demo Tool: Raw Primitive Output
 *
 * Demonstrates returning a RAW NUMBER directly in structuredContent.
 * This shows SEP-834's support for primitive values.
 *
 * Before SEP-834:
 *   - structuredContent MUST be an object: { count: 42 }
 *   - Even simple values needed object wrappers
 *
 * After SEP-834:
 *   - structuredContent can be the number directly: 42
 *   - Clean, simple responses for simple data
 */

// Mock collection sizes
const COLLECTIONS: Record<string, number> = {
  users: 3,
  resources: 3,
  sessions: 12,
  logs: 1847,
};

// Tool input schema
const GetCountInputSchema = {
  collection: z
    .enum(["users", "resources", "sessions", "logs"])
    .describe("Which collection to count"),
};

// SEP-834: Raw JSON Schema with number at root level
// The output is just a number, not wrapped in an object
const GetCountOutputSchema = {
  type: "integer",
  description: "The count of items in the collection (returned as raw number)",
  minimum: 0,
};

// Tool configuration
// NOTE: The `as any` casts are required because the current SDK enforces object-only types.
// SEP-834 proposes loosening these restrictions. With the modified SDK (branch sep-834-v1x),
// these casts would not be needed.
const name = "get-count";
const config = {
  title: "Get Count Tool (SEP-834)",
  description:
    "Returns a RAW NUMBER count directly in structuredContent (not wrapped in an object). Demonstrates SEP-834 primitive output support.",
  inputSchema: GetCountInputSchema,
  outputSchema: GetCountOutputSchema as any, // SEP-834: primitive schema at root
};

/**
 * Registers the 'get-count' tool.
 *
 * This tool demonstrates SEP-834's support for primitive output values.
 *
 * Compare:
 *   Before SEP-834: { "count": 42 }  // Forced wrapper
 *   After SEP-834:  42               // Direct primitive
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetCountTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const collection = args.collection as string;
    const count = COLLECTIONS[collection] ?? 0;

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: `${count}`,
    };

    // SEP-834: Return the number DIRECTLY, not wrapped in { count: ... }
    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: count as any, // SEP-834: raw primitive in structuredContent
    };
  });
};
