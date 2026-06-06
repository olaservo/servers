import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCurrent } from "../resources/current.js";
import { registerProposed } from "../resources/proposed.js";

/**
 * Build a minimal MCP server that exposes one resource tree two ways:
 *
 *  - {@link registerCurrent}  — `resources/read` on a directory returns its
 *    children as `ResourceContents[]` (works with today's spec).
 *  - {@link registerProposed} — `resources/directory/read` returns its children
 *    as `Resource[]` metadata with digests (the proposed method, from the fork).
 *
 * Both register over the same tree, so the two methods describe identical content.
 */
export const createServer = () => {
  const server = new McpServer(
    {
      name: "list-resources-demo",
      title: "List Resources Demo",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: { listChanged: true },
      },
      instructions:
        "Demonstrates two ways to list a directory's resources. Call resources/list " +
        "to see every resource (directories are marked with mimeType 'inode/directory'). " +
        "Then either resources/read a directory (current spec: children come back as " +
        "ResourceContents[]) or call resources/directory/read with the directory uri " +
        "(proposed: children come back as Resource[] metadata with digests).",
    }
  );

  registerCurrent(server);
  registerProposed(server);

  return {
    server,
    cleanup: (_sessionId?: string) => {
      // No per-session state to tear down in this minimal demo.
    },
  };
};
