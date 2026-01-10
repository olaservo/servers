/**
 * SEP-834 Demo: Array Output Schema
 *
 * This tool demonstrates SEP-834's loosened outputSchema restriction,
 * allowing tools to define array schemas and return arrays directly
 * in structuredContent.
 *
 * Before SEP-834: outputSchema required type: "object" at root
 * After SEP-834: outputSchema can be any valid JSON Schema (including arrays)
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

// Mock user data
const USERS = [
  { id: "u1", name: "Alice", email: "alice@example.com" },
  { id: "u2", name: "Bob", email: "bob@example.com" },
  { id: "u3", name: "Charlie", email: "charlie@example.com" },
];

// Tool input schema - using shorthand format like get-structured-content.ts
const Sep834ListUsersInputSchema = {
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of users to return (1-100)"),
};

// Tool output schema - ARRAY type (SEP-834 feature)
const Sep834ListUsersOutputSchema = z.array(
  z.object({
    id: z.string().describe("User ID"),
    name: z.string().describe("User name"),
    email: z.string().describe("User email"),
  })
);

// Tool configuration
const name = "sep834-list-users";
const config = {
  title: "SEP-834 Demo: List Users (Array Output)",
  description:
    "Demonstrates SEP-834 array output schema. Returns an array of users directly in structuredContent instead of wrapping in an object.",
  inputSchema: Sep834ListUsersInputSchema,
  outputSchema: Sep834ListUsersOutputSchema,
};

/**
 * Registers the 'sep834-list-users' tool.
 *
 * This tool demonstrates SEP-834's ability to:
 * - Define outputSchema with type: "array" at root
 * - Return arrays directly in structuredContent
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerSep834ListUsersTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const limit = args.limit ?? USERS.length;
    const users = USERS.slice(0, limit);

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: JSON.stringify(users, null, 2),
    };

    return {
      content: [backwardCompatibleContentBlock],
      // SEP-834: structuredContent can now be an array!
      structuredContent: users,
    };
  });
};
