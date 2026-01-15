import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * SEP-834 Demo Tool: Flexible Input Schema (Composition)
 *
 * Demonstrates using optional properties to allow flexible input patterns.
 * The tool accepts either an 'id' OR a 'name' parameter for resource lookup.
 *
 * This pattern approximates the oneOf composition that SEP-834 enables at
 * the raw JSON Schema level. While McpServer's Zod-based API uses optional
 * properties, the underlying JSON Schema can use oneOf/anyOf compositions.
 *
 * Before SEP-834: inputSchema required type: "object" at root
 * After SEP-834: inputSchema can be any valid JSON Schema including compositions
 */

// Mock resource data
const RESOURCES = [
  { id: "res-001", name: "database", type: "storage", status: "active" },
  { id: "res-002", name: "cache", type: "memory", status: "active" },
  { id: "res-003", name: "queue", type: "messaging", status: "degraded" },
];

// Resource schema
const ResourceSchema = z.object({
  id: z.string().describe("Resource ID"),
  name: z.string().describe("Resource name"),
  type: z.string().describe("Resource type"),
  status: z.string().describe("Resource status"),
});

// Tool input schema - flexible: id OR name
const FindByIdOrNameInputSchema = {
  id: z.string().optional().describe("Resource ID to look up"),
  name: z.string().optional().describe("Resource name to look up"),
};

// Tool output schema
const FindByIdOrNameOutputSchema = z.object({
  resource: ResourceSchema.nullable().describe("Found resource or null"),
  searchedBy: z.enum(["id", "name", "none"]).describe("Which field was used for search"),
});

// Tool configuration
const name = "find-by-id-or-name";
const config = {
  title: "Find By ID or Name Tool (SEP-834)",
  description:
    "Find a resource by ID or name. Demonstrates SEP-834 flexible input schema patterns.",
  inputSchema: FindByIdOrNameInputSchema,
  outputSchema: FindByIdOrNameOutputSchema,
};

/**
 * Registers the 'find-by-id-or-name' tool.
 *
 * This tool demonstrates SEP-834's support for flexible input schemas.
 * Users can provide either an 'id' or 'name' parameter to look up a resource.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerFindByIdOrNameTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    let resource = null;
    let searchedBy: "id" | "name" | "none" = "none";

    if (args.id) {
      resource = RESOURCES.find((r) => r.id === args.id) ?? null;
      searchedBy = "id";
    } else if (args.name) {
      resource = RESOURCES.find((r) => r.name === args.name) ?? null;
      searchedBy = "name";
    }

    const result = { resource, searchedBy };

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: resource
        ? JSON.stringify(resource, null, 2)
        : `Resource not found (searched by: ${searchedBy})`,
    };

    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: result,
      isError: !resource && searchedBy !== "none",
    };
  });
};
