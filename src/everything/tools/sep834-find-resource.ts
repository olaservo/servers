/**
 * SEP-834 Demo: Flexible Input Schema with oneOf
 *
 * This tool demonstrates SEP-834's loosened inputSchema restriction,
 * allowing schema composition keywords (oneOf, anyOf, allOf) at the root level.
 *
 * Before SEP-834: inputSchema required type: "object" at root
 * After SEP-834: inputSchema can use composition keywords at root
 *
 * Use case: Accept either an ID-based or name-based lookup
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

// Mock resource data
const RESOURCES = [
  { id: "res-001", name: "database", type: "storage", status: "healthy" },
  { id: "res-002", name: "cache", type: "memory", status: "healthy" },
  { id: "res-003", name: "queue", type: "messaging", status: "degraded" },
];

// Tool input schema - oneOf at root (SEP-834 feature)
// This allows the tool to accept EITHER { id: "..." } OR { name: "..." }
const Sep834FindResourceInputSchema = z.union([
  z.object({
    id: z.string().describe("Resource ID (e.g., 'res-001')"),
  }),
  z.object({
    name: z.string().describe("Resource name (e.g., 'database')"),
  }),
]);

// Tool output schema
const Sep834FindResourceOutputSchema = z.object({
  id: z.string().describe("Resource ID"),
  name: z.string().describe("Resource name"),
  type: z.string().describe("Resource type"),
  status: z.string().describe("Resource status"),
});

// Tool configuration
const name = "sep834-find-resource";
const config = {
  title: "SEP-834 Demo: Find Resource (Flexible Input)",
  description:
    "Demonstrates SEP-834 flexible input schema. Accepts EITHER { id: '...' } OR { name: '...' } using oneOf/union at schema root.",
  inputSchema: Sep834FindResourceInputSchema,
  outputSchema: Sep834FindResourceOutputSchema,
};

/**
 * Registers the 'sep834-find-resource' tool.
 *
 * This tool demonstrates SEP-834's ability to:
 * - Use oneOf/anyOf at the root of inputSchema
 * - Accept flexible input patterns (ID or name lookup)
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerSep834FindResourceTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    let resource;

    // Find by ID or name based on what was provided
    if ("id" in args && args.id) {
      resource = RESOURCES.find((r) => r.id === args.id);
    } else if ("name" in args && args.name) {
      resource = RESOURCES.find((r) => r.name === args.name);
    }

    if (!resource) {
      return {
        content: [{ type: "text", text: "Resource not found" }],
        isError: true,
      };
    }

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: JSON.stringify(resource, null, 2),
    };

    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: resource,
    };
  });
};
