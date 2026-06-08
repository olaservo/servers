import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Candidate package roots, covering both layouts:
//   <root>/resources/docs.ts        (source / tests)  -> one level up
//   <root>/dist/resources/docs.js   (built / runtime) -> two levels up
const moduleDir = dirname(fileURLToPath(import.meta.url));
const candidateRoots = [join(moduleDir, ".."), join(moduleDir, "..", "..")];

/** Resolve a doc file against the candidate roots, or null if not found. */
const resolveDoc = (file: string): string | null => {
  for (const root of candidateRoots) {
    const path = join(root, file);
    if (existsSync(path)) return path;
  }
  return null;
};

interface Doc {
  uri: string;
  name: string;
  title: string;
  file: string;
  description: string;
}

const DOCS: Doc[] = [
  {
    uri: "demo://docs/readme.md",
    name: "README.md",
    title: "Server README",
    file: "README.md",
    description: "This server's README, served as a single static resource.",
  },
];

/**
 * Expose the server's own documentation as plain static resources, so a
 * connected agent can fetch the README (or the comparison) with a single
 * `resources/read`. Content is read once at startup; size and digest are
 * computed so the docs behave like any other resource in `resources/list`.
 */
export const registerDocs = (server: McpServer): void => {
  for (const doc of DOCS) {
    const path = resolveDoc(doc.file);
    if (!path) continue; // file not present at runtime — skip rather than crash
    const text = readFileSync(path, "utf-8");
    const size = Buffer.byteLength(text, "utf-8");
    server.registerResource(
      doc.name,
      doc.uri,
      {
        title: doc.title,
        description: doc.description,
        mimeType: "text/markdown",
        size,
      },
      async (uri: URL) => ({
        contents: [{ uri: uri.toString(), mimeType: "text/markdown", text }],
      })
    );
  }
};
