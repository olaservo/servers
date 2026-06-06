import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ReadResourceDirectoryResultSchema,
  DIRECTORY_MIME_TYPE,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../server/index.js";
import { DIRECTORY_MIME } from "../resources/tree.js";

// Wire a client to the demo server over a linked in-memory transport pair.
async function connect() {
  const { server } = createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

const ROOT = "demo://fs/";

let client: Awaited<ReturnType<typeof connect>>;
beforeEach(async () => {
  client = await connect();
});

describe("resources/list", () => {
  it("lists every node, marking directories with inode/directory", async () => {
    const { resources } = await client.listResources();
    const byUri = new Map(resources.map((r) => [r.uri, r]));

    expect(byUri.has(ROOT)).toBe(true);
    expect(byUri.get(ROOT)?.mimeType).toBe(DIRECTORY_MIME);
    expect(byUri.has("demo://fs/readme.txt")).toBe(true);
    expect(byUri.has("demo://fs/docs/")).toBe(true);
    expect(byUri.get("demo://fs/docs/")?.mimeType).toBe(DIRECTORY_MIME);
    expect(byUri.get("demo://fs/readme.txt")?.mimeType).toBe("text/plain");
  });
});

describe("Version A — current spec: resources/read -> ResourceContents[]", () => {
  it("returns a directory's children embedded as contents", async () => {
    const result = await client.readResource({ uri: ROOT });
    // Root has 4 children: readme.txt, data.json, docs/, images/
    expect(result.contents).toHaveLength(4);
    const uris = result.contents.map((c) => c.uri).sort();
    expect(uris).toEqual(
      [
        "demo://fs/data.json",
        "demo://fs/docs/",
        "demo://fs/images/",
        "demo://fs/readme.txt",
      ].sort()
    );
    // A text child carries real text content.
    const readme = result.contents.find(
      (c) => c.uri === "demo://fs/readme.txt"
    );
    expect(typeof (readme as { text?: string }).text).toBe("string");
  });

  it("returns a single content entry for a leaf resource", async () => {
    const result = await client.readResource({ uri: "demo://fs/data.json" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("demo://fs/data.json");
  });
});

describe("Version B — proposed: resources/directory/read -> Resource[]", () => {
  const readDir = (uri: string, cursor?: string) =>
    client.request(
      { method: "resources/directory/read", params: { uri, cursor } },
      ReadResourceDirectoryResultSchema
    );

  it("returns children as metadata with a digest and no contents", async () => {
    const { resources } = await readDir(ROOT);
    expect(resources).toHaveLength(4);
    for (const r of resources) {
      expect(r.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(typeof r.size).toBe("number");
      // Metadata only — no embedded content fields.
      expect((r as Record<string, unknown>).text).toBeUndefined();
      expect((r as Record<string, unknown>).blob).toBeUndefined();
    }
  });

  it("marks nested directories with inode/directory", async () => {
    const { resources } = await readDir(ROOT);
    const docs = resources.find((r) => r.uri === "demo://fs/docs/");
    expect(docs?.mimeType).toBe(DIRECTORY_MIME);
  });

  it("can expand a nested directory", async () => {
    const { resources } = await readDir("demo://fs/docs/");
    expect(resources.map((r) => r.uri)).toEqual(["demo://fs/docs/guide.md"]);
  });

  it("produces stable digests across calls", async () => {
    const a = await readDir(ROOT);
    const b = await readDir(ROOT);
    expect(a.resources.map((r) => r.digest)).toEqual(
      b.resources.map((r) => r.digest)
    );
  });

  it("rejects reading a non-directory as a directory", async () => {
    await expect(readDir("demo://fs/readme.txt")).rejects.toThrow();
  });
});

describe("fork SDK surface", () => {
  it("exports the shared DIRECTORY_MIME_TYPE constant", () => {
    // The demo and the forked SDK agree on the directory marker.
    expect(DIRECTORY_MIME_TYPE).toBe("inode/directory");
    expect(DIRECTORY_MIME).toBe(DIRECTORY_MIME_TYPE);
  });
});
