import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { CallToolResult } from "@modelcontextprotocol/server";

/**
 * Raw JSON Schema (2020-12) describing every SEP-1330 enum variety as a tool
 * input. SEP-2106 lifts the old MCP restriction that a tool `inputSchema` may
 * only use `type`/`properties`/`required`, so we can now express `oneOf`,
 * `anyOf`, `const`/`title` pairs and the legacy `enumNames` form directly in a
 * tool's input schema -- exactly the shapes the elicitation example
 * (`trigger-elicitation-request`) demonstrates for `requestedSchema`.
 *
 * `fromJsonSchema` (new in the 2.0 SDK) adapts this raw schema into a
 * Standard Schema the server uses both to advertise the schema and to validate
 * incoming arguments.
 */
const EnumSelectionsInputSchema = fromJsonSchema<{
  untitledSingleSelectEnum?: string;
  untitledMultipleSelectEnum?: string[];
  titledSingleSelectEnum?: string;
  titledMultipleSelectEnum?: string[];
  legacyTitledEnum?: string;
}>({
  type: "object",
  properties: {
    untitledSingleSelectEnum: {
      type: "string",
      title: "Untitled Single Select Enum",
      description: "Choose your favorite friend",
      enum: ["Monica", "Rachel", "Joey", "Chandler", "Ross", "Phoebe"],
      default: "Monica",
    },
    untitledMultipleSelectEnum: {
      type: "array",
      title: "Untitled Multiple Select Enum",
      description: "Choose your favorite instruments",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "string",
        enum: ["Guitar", "Piano", "Violin", "Drums", "Bass"],
      },
      default: ["Guitar"],
    },
    titledSingleSelectEnum: {
      type: "string",
      title: "Titled Single Select Enum",
      description: "Choose your favorite hero",
      oneOf: [
        { const: "hero-1", title: "Superman" },
        { const: "hero-2", title: "Green Lantern" },
        { const: "hero-3", title: "Wonder Woman" },
      ],
      default: "hero-1",
    },
    titledMultipleSelectEnum: {
      type: "array",
      title: "Titled Multiple Select Enum",
      description: "Choose your favorite types of fish",
      minItems: 1,
      maxItems: 3,
      items: {
        anyOf: [
          { const: "fish-1", title: "Tuna" },
          { const: "fish-2", title: "Salmon" },
          { const: "fish-3", title: "Trout" },
        ],
      },
      default: ["fish-1"],
    },
    legacyTitledEnum: {
      type: "string",
      title: "Legacy Titled Single Select Enum",
      description: "Choose your favorite type of pet",
      enum: ["pet-1", "pet-2", "pet-3", "pet-4", "pet-5"],
      enumNames: ["Cats", "Dogs", "Birds", "Fish", "Reptiles"],
      default: "pet-1",
    },
  },
  required: [],
});

// Tool configuration
const name = "get-enum-selections";
const config = {
  title: "Get Enum Selections Tool",
  description:
    "Demonstrates SEP-1330 enum schemas (untitled/titled, single/multi-select, " +
    "and the legacy enumNames form) as a tool inputSchema, enabled by SEP-2106 " +
    "JSON Schema 2020-12 support. Echoes back the selected values.",
  inputSchema: EnumSelectionsInputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'get-enum-selections' tool.
 *
 * The tool advertises an input schema exercising every SEP-1330 enum variety so
 * MCP client authors can verify how their UI renders titled dropdowns,
 * multi-select pickers, and legacy `enumNames` -- for tool arguments, not just
 * elicitation forms. The handler simply echoes back whatever the caller
 * selected.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetEnumSelectionsTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const lines = Object.entries(args ?? {}).map(
      ([key, value]) => `- ${key}: ${JSON.stringify(value)}`
    );

    return {
      content: [
        {
          type: "text",
          text:
            lines.length > 0
              ? `You selected:\n${lines.join("\n")}`
              : "No selections were provided.",
        },
      ],
    };
  });
};
