import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorCode,
  McpError,
  ReadResourceDirectoryRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { childrenOf, getNode, toResourceMetadata } from "./tree.js";

/**
 * How many children to return per page. Read per request so it can be varied at
 * runtime (e.g. by the compare script). Deliberately small by default so
 * pagination is visible in the demo; a real server would choose a larger size.
 * Override with the DIRECTORY_PAGE_SIZE env var.
 */
const pageSize = (): number => Number(process.env.DIRECTORY_PAGE_SIZE) || 3;

/**
 * Version B — listing with the proposed `resources/directory/read` method.
 *
 * This registers a handler for the new request method added in the forked SDK.
 * Given a directory URI it returns the children as `Resource[]` *metadata*
 * (uri, name, mimeType, size, digest) — like `ls`. No content is embedded, and
 * each entry carries a `digest` for caching. Child directories are themselves
 * `inode/directory` resources that can be expanded with another call.
 */
export const registerProposed = (server: McpServer): void => {
  server.server.setRequestHandler(
    ReadResourceDirectoryRequestSchema,
    async (request) => {
      const { uri, cursor } = request.params;

      const node = getNode(uri);
      if (!node) {
        throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
      }
      if (node.kind !== "dir") {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Resource is not a directory: ${uri}`
        );
      }

      const children = childrenOf(uri);
      const size = pageSize();
      const start = decodeCursor(cursor);
      const page = children.slice(start, start + size);
      const nextStart = start + size;

      return {
        resources: page.map(toResourceMetadata),
        ...(nextStart < children.length
          ? { nextCursor: encodeCursor(nextStart) }
          : {}),
      };
    }
  );
};

const encodeCursor = (offset: number): string =>
  Buffer.from(String(offset), "utf-8").toString("base64");

const decodeCursor = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const offset = Number(Buffer.from(cursor, "base64").toString("utf-8"));
  if (!Number.isInteger(offset) || offset < 0) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid cursor: ${cursor}`);
  }
  return offset;
};
