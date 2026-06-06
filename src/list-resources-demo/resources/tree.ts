import { sha256 } from "./digest.js";

/**
 * The in-memory resource hierarchy that both listing demos operate over.
 *
 * It models a tiny filesystem so the two approaches describe *identical*
 * content:
 *
 *   demo://fs/                     (dir)
 *     demo://fs/readme.txt          text/plain
 *     demo://fs/data.json           application/json
 *     demo://fs/docs/              (dir)
 *       demo://fs/docs/guide.md     text/markdown
 *     demo://fs/images/            (dir)
 *       demo://fs/images/logo.png   image/png (blob)
 *
 * Directories use the proposed `inode/directory` MIME type so a client can tell
 * which `resources/list` entries can be expanded with `resources/directory/read`.
 */

/** MIME type that marks a resource as a directory (proposed convention). */
export const DIRECTORY_MIME = "inode/directory";

export type NodeKind = "dir" | "text" | "blob";

export interface ResourceNode {
  uri: string;
  name: string;
  title: string;
  mimeType: string;
  description: string;
  kind: NodeKind;
  /** Present for `text` nodes. */
  text?: string;
  /** base64 payload, present for `blob` nodes. */
  blob?: string;
  /** Present for `dir` nodes. */
  children?: ResourceNode[];
}

// A 1x1 transparent PNG, used as a small binary leaf.
const LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const guideMd = `# Guide

This markdown file is a leaf resource inside the \`demo://fs/docs/\` directory.
Read it the normal way with \`resources/read\`.
`;

const readmeTxt = `This demo exposes the same resource tree two ways:

1. resources/read on a directory  -> children embedded as ResourceContents[]  (current spec)
2. resources/directory/read       -> children as Resource[] metadata + digest (proposed)
`;

const dataJson = JSON.stringify(
  { example: true, items: [1, 2, 3], note: "a leaf JSON resource" },
  null,
  2
);

/** The root tree, defined inline as the single source of truth. */
export const ROOT: ResourceNode = {
  uri: "demo://fs/",
  name: "fs",
  title: "Demo filesystem root",
  mimeType: DIRECTORY_MIME,
  description: "Root directory of the demo resource tree.",
  kind: "dir",
  children: [
    {
      uri: "demo://fs/readme.txt",
      name: "readme.txt",
      title: "Readme",
      mimeType: "text/plain",
      description: "Overview of what this server demonstrates.",
      kind: "text",
      text: readmeTxt,
    },
    {
      uri: "demo://fs/data.json",
      name: "data.json",
      title: "Sample data",
      mimeType: "application/json",
      description: "A small JSON document leaf resource.",
      kind: "text",
      text: dataJson,
    },
    {
      uri: "demo://fs/docs/",
      name: "docs",
      title: "Docs directory",
      mimeType: DIRECTORY_MIME,
      description: "A nested directory of documents.",
      kind: "dir",
      children: [
        {
          uri: "demo://fs/docs/guide.md",
          name: "guide.md",
          title: "Guide",
          mimeType: "text/markdown",
          description: "A markdown guide leaf resource.",
          kind: "text",
          text: guideMd,
        },
      ],
    },
    {
      uri: "demo://fs/images/",
      name: "images",
      title: "Images directory",
      mimeType: DIRECTORY_MIME,
      description: "A nested directory of binary resources.",
      kind: "dir",
      children: [
        {
          uri: "demo://fs/images/logo.png",
          name: "logo.png",
          title: "Logo",
          mimeType: "image/png",
          description: "A 1x1 PNG blob leaf resource.",
          kind: "blob",
          blob: LOGO_PNG_BASE64,
        },
      ],
    },
  ],
};

/** Normalize a URI the same way the SDK does (`new URL(uri).toString()`). */
export const normalizeUri = (uri: string): string => new URL(uri).toString();

// Flat index of every node, keyed by normalized URI.
const INDEX = new Map<string, ResourceNode>();
const indexNode = (node: ResourceNode): void => {
  INDEX.set(normalizeUri(node.uri), node);
  node.children?.forEach(indexNode);
};
indexNode(ROOT);

/** Every node in the tree (directories and leaves), depth-first. */
export const allNodes = (): ResourceNode[] => Array.from(INDEX.values());

/** Look up a node by URI, tolerating a missing/extra trailing slash. */
export const getNode = (uri: string): ResourceNode | undefined => {
  const key = normalizeUri(uri);
  return (
    INDEX.get(key) ??
    INDEX.get(key.endsWith("/") ? key.slice(0, -1) : key + "/")
  );
};

/** Direct children of a directory node. Throws if `uri` is not a directory. */
export const childrenOf = (uri: string): ResourceNode[] => {
  const node = getNode(uri);
  if (!node) throw new Error(`Resource not found: ${uri}`);
  if (node.kind !== "dir") throw new Error(`Resource is not a directory: ${uri}`);
  return node.children ?? [];
};

/** The raw bytes a node represents, used for digests and embedding. */
export const rawContent = (node: ResourceNode): Buffer => {
  if (node.kind === "text") return Buffer.from(node.text ?? "", "utf-8");
  if (node.kind === "blob") return Buffer.from(node.blob ?? "", "base64");
  // For a directory, hash a stable listing of its children.
  const listing = (node.children ?? []).map((c) => `${c.uri}\t${c.mimeType}`).join("\n");
  return Buffer.from(listing, "utf-8");
};

/** The content digest for a node (`sha256:…`). */
export const digestOf = (node: ResourceNode): string => sha256(rawContent(node));

/** Byte size of a node's raw content. */
export const sizeOf = (node: ResourceNode): number => rawContent(node).byteLength;
