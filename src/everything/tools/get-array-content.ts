import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * SEP-834 Demo Tool: Raw Array Output
 *
 * Demonstrates returning a RAW ARRAY directly in structuredContent.
 * This is the key capability enabled by SEP-834.
 *
 * Before SEP-834:
 *   - structuredContent MUST be an object: { users: [...] }
 *   - Forced unnecessary wrapper objects
 *
 * After SEP-834:
 *   - structuredContent can be the array directly: [...]
 *   - Matches natural API response patterns (GitHub Events, AccuWeather, etc.)
 */

// Mock user data
const USERS = [
  { id: "u1", name: "Alice", email: "alice@example.com" },
  { id: "u2", name: "Bob", email: "bob@example.com" },
  { id: "u3", name: "Charlie", email: "charlie@example.com" },
];

// Tool input schema
const GetArrayContentInputSchema = {
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of users to return"),
};

// SEP-834: Raw JSON Schema with array at root level (not wrapped in object)
// This is what SEP-834 enables - outputSchema can be any valid JSON Schema
const GetArrayContentOutputSchema = {
  type: "array",
  description: "Array of user objects returned directly (not wrapped)",
  items: {
    type: "object",
    properties: {
      id: { type: "string", description: "User ID" },
      name: { type: "string", description: "User's full name" },
      email: { type: "string", description: "User's email address" },
    },
    required: ["id", "name", "email"],
  },
};

// Tool configuration
// NOTE: The `as any` casts are required because the current SDK enforces object-only types.
// SEP-834 proposes loosening these restrictions. With the modified SDK (branch sep-834-v1x),
// these casts would not be needed.
const name = "get-array-content";
const config = {
  title: "Get Array Content Tool (SEP-834)",
  description:
    "Returns a RAW ARRAY of users directly in structuredContent (not wrapped in an object). This demonstrates the key SEP-834 capability.",
  inputSchema: GetArrayContentInputSchema,
  outputSchema: GetArrayContentOutputSchema as any, // SEP-834: array schema at root
};

/**
 * Registers the 'get-array-content' tool.
 *
 * This tool demonstrates SEP-834's core value proposition: returning arrays
 * directly without unnecessary object wrappers.
 *
 * Compare:
 *   Before SEP-834: { "users": [{...}, {...}] }  // Forced wrapper
 *   After SEP-834:  [{...}, {...}]               // Direct array
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetArrayContentTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const limit = args.limit ?? USERS.length;
    const users = USERS.slice(0, limit);

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: JSON.stringify(users, null, 2),
    };

    // SEP-834: Return the array DIRECTLY, not wrapped in { users: [...] }
    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: users as any, // SEP-834: raw array in structuredContent
    };
  });
};
