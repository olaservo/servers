import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { SKILLS, skillUri, fileUri } from "./skills.js";

/** MIME type marking a directory resource (SEP-2640). */
export const DIRECTORY_MIME = "inode/directory";

// resources/directory/read — defined locally (no SDK schema change needed). The
// result is the same Resource[] shape that resources/list returns, with the same
// nextCursor pagination contract.
const ReadResourceDirectoryRequestSchema = z.object({
  method: z.literal("resources/directory/read"),
  params: z.object({
    uri: z.string(),
    cursor: z.string().optional(),
  }),
});

interface Child {
  uri: string;
  name: string;
  mimeType: string;
}

// Build a directory -> direct-children index from every skill file URI. Every
// path level (skill roots, organizational prefixes, and subdirectories) becomes
// a directory resource whose children are its immediate files and subdirectories.
const buildDirectoryIndex = (): Map<string, Map<string, Child>> => {
  const fileMime = new Map<string, string>();
  const fileUris: string[] = [];
  for (const skill of SKILLS) {
    fileMime.set(skillUri(skill), "text/markdown");
    fileUris.push(skillUri(skill));
    for (const file of skill.files) {
      fileMime.set(fileUri(skill, file), file.mimeType);
      fileUris.push(fileUri(skill, file));
    }
  }

  const dirs = new Map<string, Map<string, Child>>();
  const add = (dirUri: string, child: Child) => {
    if (!dirs.has(dirUri)) dirs.set(dirUri, new Map());
    dirs.get(dirUri)!.set(child.name, child);
  };

  for (const uri of fileUris) {
    const segs = uri.slice("skill://".length).split("/");
    for (let j = 1; j < segs.length; j++) {
      const parent = "skill://" + segs.slice(0, j).join("/");
      const childUri = "skill://" + segs.slice(0, j + 1).join("/");
      const isFile = j === segs.length - 1;
      add(parent, {
        uri: childUri,
        name: segs[j],
        mimeType: isFile
          ? fileMime.get(childUri) ?? "application/octet-stream"
          : DIRECTORY_MIME,
      });
    }
  }
  return dirs;
};

const DIR_INDEX = buildDirectoryIndex();

// Directory URIs are written without a trailing slash (SEP-2640); be lenient on input.
const normDir = (uri: string): string => {
  const s = new URL(uri).toString();
  return s.endsWith("/") ? s.slice(0, -1) : s;
};

const pageSize = (): number => Number(process.env.DIRECTORY_PAGE_SIZE) || 50;
const encodeCursor = (n: number): string => Buffer.from(String(n), "utf-8").toString("base64");
const decodeCursor = (c: string | undefined): number => {
  if (!c) return 0;
  const n = Number(Buffer.from(c, "base64").toString("utf-8"));
  if (!Number.isInteger(n) || n < 0) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid cursor: ${c}`);
  }
  return n;
};

/** Whether the server advertises directoryRead in its capability. */
export const DIRECTORY_READ_SUPPORTED = true;

/**
 * Register the SEP-2640 `resources/directory/read` method: it lists the direct
 * children of a directory resource (files with their metadata, subdirectories as
 * `inode/directory`), scoped and paginated like `resources/list`. Gated behind
 * the `directoryRead` capability setting.
 */
export const registerDirectoryRead = (server: McpServer): void => {
  server.server.setRequestHandler(
    ReadResourceDirectoryRequestSchema,
    async (request) => {
      const { uri, cursor } = request.params;
      const children = DIR_INDEX.get(normDir(uri));
      if (!children) {
        // Unknown URI or not a directory resource — same code resources/read uses.
        throw new McpError(
          ErrorCode.InvalidParams,
          `Not a directory resource: ${uri}`
        );
      }
      const all = [...children.values()].sort((a, b) => a.uri.localeCompare(b.uri));
      const start = decodeCursor(cursor);
      const size = pageSize();
      const page = all.slice(start, start + size);
      const next = start + size;
      return {
        resources: page,
        ...(next < all.length ? { nextCursor: encodeCursor(next) } : {}),
      };
    }
  );
};
