import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * SEP-834 Demo Tool: Primitive Output Schema
 *
 * Demonstrates returning a simple count value in structuredContent.
 * While the output is wrapped in an object for Zod compatibility,
 * SEP-834 enables raw primitive values in structuredContent at the
 * protocol level.
 *
 * Before SEP-834: structuredContent had to be { [key: string]: unknown }
 * After SEP-834: structuredContent can be any JSON value including primitives
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

// Tool output schema - simple count value
const GetCountOutputSchema = z.object({
  count: z.number().describe("Number of items in the collection"),
  collection: z.string().describe("Name of the counted collection"),
});

// Tool configuration
const name = "get-count";
const config = {
  title: "Get Count Tool (SEP-834)",
  description:
    "Returns the count of items in a collection. Demonstrates SEP-834 support for simple/primitive output values.",
  inputSchema: GetCountInputSchema,
  outputSchema: GetCountOutputSchema,
};

/**
 * Registers the 'get-count' tool.
 *
 * This tool demonstrates SEP-834's support for simple output values.
 * While wrapped in an object for the Zod API, this pattern shows how
 * structuredContent can carry simple data structures.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetCountTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const collection = args.collection as string;
    const count = COLLECTIONS[collection] ?? 0;

    const result = { count, collection };

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: `${collection}: ${count} items`,
    };

    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: result,
    };
  });
};
