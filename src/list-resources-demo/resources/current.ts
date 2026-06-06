import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  allNodes,
  childrenOf,
  digestOf,
  ResourceNode,
  sizeOf,
  toResourceMetadata,
} from "./tree.js";

export interface CurrentOptions {
  /**
   * Sam's single-RPC alternative: when true, reading a directory returns its
   * children as a `Resource[]` *listing* in the read result (one round trip, no
   * separate `resources/directory/read` call). When false (default), reading a
   * directory returns the children embedded as `ResourceContents[]`.
   */
  readDirectoryReturnsListing?: boolean;
}

/**
 * Listing without the proposed dedicated method, two variants over `resources/read`:
 *
 *  A. default (`readDirectoryReturnsListing: false`) — the current spec: reading
 *     a directory returns its children packed into `ResourceContents[]`. To
 *     enumerate you must ship every child's bytes; sub-directories become
 *     placeholders; there is no pagination and no per-entry metadata.
 *
 *  C. Sam's alternative (`readDirectoryReturnsListing: true`) — reading a
 *     directory returns the children as a `Resource[]` listing (with digests) in
 *     a single call. One round trip and real metadata, but it overloads the
 *     meaning of a read result (content vs. listing, by resource type) and still
 *     has no pagination, since a read result has no cursor.
 */
export const registerCurrent = (
  server: McpServer,
  { readDirectoryReturnsListing = false }: CurrentOptions = {}
): void => {
  for (const node of allNodes()) {
    server.registerResource(
      node.name,
      node.uri,
      {
        title: node.title,
        description: node.description,
        mimeType: node.mimeType,
        size: sizeOf(node),
        digest: digestOf(node),
      },
      async () => {
        if (node.kind !== "dir") {
          return { contents: [toContents(node)] };
        }
        return readDirectoryReturnsListing
          ? { resources: childrenOf(node.uri).map(toResourceMetadata) }
          : { contents: childrenOf(node.uri).map(toContents) };
      }
    );
  }
};

/** Map a single node to one `ResourceContents` entry. */
const toContents = (node: ResourceNode) => {
  if (node.kind === "blob") {
    return { uri: node.uri, mimeType: node.mimeType, blob: node.blob ?? "" };
  }
  if (node.kind === "text") {
    return { uri: node.uri, mimeType: node.mimeType, text: node.text ?? "" };
  }
  // A sub-directory has no contents of its own, so we can only embed a
  // placeholder describing it — illustrating the limitation of this approach.
  return {
    uri: node.uri,
    mimeType: node.mimeType,
    text: `directory: ${node.name} (${node.children?.length ?? 0} entries) — read it to list its contents`,
  };
};
