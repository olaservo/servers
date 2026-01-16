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
 *   - outputSchema MUST have type: "object" at root
 *   - structuredContent MUST be an object: { count: 42 }
 *
 * After SEP-834:
 *   - outputSchema can be any JSON Schema (including type: "integer")
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

// SEP-834: Primitive schema at root level (not wrapped in object)
const GetCountOutputSchema = z
  .number()
  .int()
  .min(0)
  .describe("The count of items in the collection");

// Tool configuration
const name = "get-count";
const config = {
  title: "Get Count Tool (SEP-834)",
  description:
    "Returns a RAW NUMBER count directly in structuredContent. Demonstrates SEP-834 primitive output support.",
  inputSchema: GetCountInputSchema,
  outputSchema: GetCountOutputSchema,
};

/**
 * Registers the 'get-count' tool.
 *
 * SEP-834 enables:
 *   - outputSchema with type: "integer" at root
 *   - structuredContent containing raw primitives
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
      structuredContent: count,
    };
  });
};
