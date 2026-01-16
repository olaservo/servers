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
 *   - outputSchema MUST have type: "object" at root
 *   - structuredContent MUST be an object: { users: [...] }
 *
 * After SEP-834:
 *   - outputSchema can be any JSON Schema (including type: "array")
 *   - structuredContent can be the array directly: [...]
 *   - Matches natural API response patterns (GitHub Events, AccuWeather, etc.)
 */

// Mock user data
const USERS = [
  { id: "u1", name: "Alice", email: "alice@example.com" },
  { id: "u2", name: "Bob", email: "bob@example.com" },
  { id: "u3", name: "Charlie", email: "charlie@example.com" },
];

// User schema for array items
const UserSchema = z.object({
  id: z.string().describe("User ID"),
  name: z.string().describe("User's full name"),
  email: z.string().describe("User's email address"),
});

// Tool input schema
const GetArrayContentInputSchema = {
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of users to return"),
};

// SEP-834: Array schema at root level (not wrapped in object)
const GetArrayContentOutputSchema = z
  .array(UserSchema)
  .describe("Array of user objects returned directly");

// Tool configuration
const name = "get-array-content";
const config = {
  title: "Get Array Content Tool (SEP-834)",
  description:
    "Returns a RAW ARRAY of users directly in structuredContent. Demonstrates SEP-834 array output support.",
  inputSchema: GetArrayContentInputSchema,
  outputSchema: GetArrayContentOutputSchema,
};

/**
 * Registers the 'get-array-content' tool.
 *
 * SEP-834 enables:
 *   - outputSchema with type: "array" at root
 *   - structuredContent containing raw arrays
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
      structuredContent: users,
    };
  });
};
