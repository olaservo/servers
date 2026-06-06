import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCurrent } from "../resources/current.js";
import { registerProposed } from "../resources/proposed.js";

export interface CreateServerOptions {
  /**
   * Sam's single-RPC alternative: reading a directory returns a `Resource[]`
   * listing instead of `ResourceContents[]`. Defaults to the
   * READ_DIRECTORY_MODE env var (`listing` enables it; anything else, the
   * current-spec `contents` behavior).
   */
  readDirectoryReturnsListing?: boolean;
}

/**
 * Build a minimal MCP server that exposes one resource tree three ways for
 * comparison:
 *
 *  A. {@link registerCurrent} default — `resources/read` on a directory returns
 *     children as `ResourceContents[]` (current spec).
 *  C. {@link registerCurrent} with `readDirectoryReturnsListing` — `resources/read`
 *     on a directory returns a `Resource[]` listing in one call (Sam's idea).
 *  B. {@link registerProposed} — a dedicated, paginated `resources/directory/read`
 *     returning `Resource[]` metadata with digests (Peter's proposed method).
 *
 * B is always available; A vs. C selects the `resources/read` directory behavior.
 * All register over the same tree, so they describe identical content.
 */
export const createServer = (options: CreateServerOptions = {}) => {
  const readDirectoryReturnsListing =
    options.readDirectoryReturnsListing ??
    process.env.READ_DIRECTORY_MODE === "listing";
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
        "Demonstrates ways to list a directory's resources. Call resources/list to " +
        "see every resource (directories are marked with mimeType 'inode/directory'). " +
        "Then call resources/directory/read with a directory uri (proposed: paginated " +
        "Resource[] metadata with digests), or resources/read a directory. Reading a " +
        "directory returns " +
        (readDirectoryReturnsListing
          ? "a Resource[] listing in one call (Sam's single-RPC alternative)."
          : "its children embedded as ResourceContents[] (current spec)."),
    }
  );

  registerCurrent(server, { readDirectoryReturnsListing });
  registerProposed(server);

  return {
    server,
    cleanup: (_sessionId?: string) => {
      // No per-session state to tear down in this minimal demo.
    },
  };
};
