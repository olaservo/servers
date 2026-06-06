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
  it("returns a directory's children embedded as contents (no pagination)", async () => {
    const result = await client.readResource({ uri: ROOT });
    // Root has 5 children: readme.txt, data.json, docs/, images/, bulk/
    // resources/read returns them all in one array — there is no cursor to page.
    expect(result.contents).toHaveLength(5);
    const uris = result.contents.map((c) => c.uri).sort();
    expect(uris).toEqual(
      [
        "demo://fs/bulk/",
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

  // Walk every page, returning the accumulated resources and the page count.
  const readDirAll = async (uri: string) => {
    const resources = [] as Awaited<ReturnType<typeof readDir>>["resources"];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await readDir(uri, cursor);
      resources.push(...res.resources);
      cursor = res.nextCursor;
      pages++;
    } while (cursor);
    return { resources, pages };
  };

  it("returns children as metadata with a digest and no contents", async () => {
    const { resources } = await readDirAll(ROOT);
    expect(resources).toHaveLength(5);
    for (const r of resources) {
      expect(r.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(typeof r.size).toBe("number");
      // Metadata only — no embedded content fields.
      expect((r as Record<string, unknown>).text).toBeUndefined();
      expect((r as Record<string, unknown>).blob).toBeUndefined();
    }
  });

  it("paginates with a cursor (page size 3)", async () => {
    const first = await readDir("demo://fs/bulk/");
    // 8 bulk files / page size 3 -> first page is full and has a nextCursor.
    expect(first.resources).toHaveLength(3);
    expect(first.nextCursor).toBeTruthy();

    const all = await readDirAll("demo://fs/bulk/");
    expect(all.resources).toHaveLength(8);
    expect(all.pages).toBe(3); // 3 + 3 + 2
  });

  it("marks nested directories with inode/directory", async () => {
    const { resources } = await readDirAll(ROOT);
    const docs = resources.find((r) => r.uri === "demo://fs/docs/");
    expect(docs?.mimeType).toBe(DIRECTORY_MIME);
  });

  it("can expand a nested directory", async () => {
    const { resources } = await readDir("demo://fs/docs/");
    expect(resources.map((r) => r.uri)).toEqual(["demo://fs/docs/guide.md"]);
  });

  it("produces stable digests across calls", async () => {
    const a = await readDirAll(ROOT);
    const b = await readDirAll(ROOT);
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
