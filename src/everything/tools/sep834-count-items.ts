/**
 * SEP-834 Demo: Primitive Output Schema
 *
 * This tool demonstrates SEP-834's loosened outputSchema restriction,
 * allowing tools to define primitive schemas and return primitives directly
 * in structuredContent.
 *
 * Before SEP-834: outputSchema required type: "object" at root
 * After SEP-834: outputSchema can be any valid JSON Schema (including primitives)
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

// Mock data
const ITEMS = {
  users: 3,
  resources: 3,
  tasks: 42,
  messages: 128,
};

// Tool input schema
const Sep834CountItemsInputSchema = {
  category: z
    .enum(["users", "resources", "tasks", "messages"])
    .describe("Category to count"),
};

// Tool output schema - NUMBER type (SEP-834 feature)
const Sep834CountItemsOutputSchema = z
  .number()
  .describe("Count of items in the specified category");

// Tool configuration
const name = "sep834-count-items";
const config = {
  title: "SEP-834 Demo: Count Items (Primitive Output)",
  description:
    "Demonstrates SEP-834 primitive output schema. Returns a number directly in structuredContent instead of wrapping in an object like { count: 42 }.",
  inputSchema: Sep834CountItemsInputSchema,
  outputSchema: Sep834CountItemsOutputSchema,
};

/**
 * Registers the 'sep834-count-items' tool.
 *
 * This tool demonstrates SEP-834's ability to:
 * - Define outputSchema with type: "number" (or other primitives)
 * - Return primitives directly in structuredContent
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerSep834CountItemsTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const category = args.category as keyof typeof ITEMS;
    const count = ITEMS[category];

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: `Count: ${count}`,
    };

    return {
      content: [backwardCompatibleContentBlock],
      // SEP-834: structuredContent can now be a primitive!
      structuredContent: count,
    };
  });
};
