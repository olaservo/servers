import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  allNodes,
  childrenOf,
  digestOf,
  ResourceNode,
  sizeOf,
} from "./tree.js";

/**
 * Version A — listing with what the spec supports today.
 *
 * Every node (files *and* directories) is registered as an ordinary resource, so
 * they all appear in a flat `resources/list`. To list the *children* of a
 * directory there is no dedicated method today, so we overload `resources/read`:
 * reading a directory returns its children packed into the `ResourceContents[]`
 * array. The catch is visible here — `ResourceContents` is a *content* type, so
 * you must embed each child's bytes (or fabricate a placeholder for a
 * sub-directory) rather than return clean metadata.
 */
export const registerCurrent = (server: McpServer): void => {
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
      async () => ({ contents: readAsContents(node) })
    );
  }
};

/** The `ResourceContents[]` a `resources/read` returns for a node. */
const readAsContents = (node: ResourceNode) => {
  if (node.kind !== "dir") {
    return [toContents(node)];
  }
  // Current-spec directory "listing": children embedded as contents.
  return childrenOf(node.uri).map(toContents);
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
