import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorCode,
  McpError,
  ReadResourceDirectoryRequestSchema,
  Resource,
} from "@modelcontextprotocol/sdk/types.js";
import {
  childrenOf,
  digestOf,
  getNode,
  ResourceNode,
  sizeOf,
} from "./tree.js";

/** How many children to return per page (kept generous for the tiny demo tree). */
const PAGE_SIZE = Number(process.env.DIRECTORY_PAGE_SIZE) || 100;

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
      const start = decodeCursor(cursor);
      const page = children.slice(start, start + PAGE_SIZE);
      const nextStart = start + PAGE_SIZE;

      return {
        resources: page.map(toResourceMetadata),
        ...(nextStart < children.length
          ? { nextCursor: encodeCursor(nextStart) }
          : {}),
      };
    }
  );
};

/** Metadata-only `Resource` for a child (no `text`/`blob`). */
const toResourceMetadata = (node: ResourceNode): Resource => ({
  uri: node.uri,
  name: node.name,
  title: node.title,
  description: node.description,
  mimeType: node.mimeType,
  size: sizeOf(node),
  digest: digestOf(node),
});

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
