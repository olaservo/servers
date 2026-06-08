import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSkills } from "../resources/register.js";
import { registerDocs } from "../resources/docs.js";
import { SKILLS_EXTENSION } from "../resources/skills.js";

/**
 * A reference MCP server for SEP-2640 (Skills Extension): it serves Agent Skills
 * over the base Resources primitive under the `skill://` scheme, exposes a
 * well-known `skill://index.json`, and declares the skills extension capability.
 * It adds no new methods or schema — a current-spec client sees ordinary
 * resources.
 */
export const createServer = () => {
  const server = new McpServer(
    {
      name: "list-resources-demo",
      title: "Skills over MCP (SEP-2640) demo",
      version: "0.2.0",
    },
    {
      capabilities: {
        resources: {},
        // SEP-2133 extension negotiation; empty object = supported.
        extensions: { [SKILLS_EXTENSION]: {} },
      },
      instructions:
        "This server serves Agent Skills (SEP-2640) under the skill:// scheme. " +
        "Read skill://index.json to enumerate them, or read a skill directly — " +
        "e.g. skill://git-workflow/SKILL.md. Supporting files are siblings under " +
        "the skill path (e.g. skill://pdf-processing/scripts/extract.py); relative " +
        "links in a SKILL.md resolve against the skill's root.",
    }
  );

  registerSkills(server);
  registerDocs(server);

  return {
    server,
    cleanup: (_sessionId?: string) => {
      // No per-session state to tear down.
    },
  };
};
