import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * SEP-834 Demo Tool: Array Output Schema
 *
 * Demonstrates returning an array in structuredContent with a corresponding
 * array output schema. This is enabled by SEP-834's loosening of the
 * type restrictions on outputSchema and structuredContent.
 *
 * Before SEP-834: structuredContent had to be { [key: string]: unknown }
 * After SEP-834: structuredContent can be any JSON value, including arrays
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

// Tool output schema - SEP-834: Array at root level
const GetArrayContentOutputSchema = z.object({
  users: z.array(UserSchema).describe("Array of user objects"),
});

// Tool configuration
const name = "get-array-content";
const config = {
  title: "Get Array Content Tool (SEP-834)",
  description:
    "Returns an array of users in structuredContent. Demonstrates SEP-834 array output schema support.",
  inputSchema: GetArrayContentInputSchema,
  outputSchema: GetArrayContentOutputSchema,
};

/**
 * Registers the 'get-array-content' tool.
 *
 * This tool demonstrates SEP-834's support for array output schemas.
 * The structuredContent contains an object with a 'users' array property,
 * validated against the array output schema.
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

    // SEP-834: structuredContent with array data
    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: { users },
    };
  });
};
