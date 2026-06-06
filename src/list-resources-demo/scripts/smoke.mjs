// Automated end-to-end smoke test against a running server, using the real MCP
// client over the Streamable HTTP transport (no Inspector, no manual curl).
//
// Usage:
//   node scripts/smoke.mjs [baseUrl]
//   SMOKE_URL=http://localhost:7860 node scripts/smoke.mjs
// Default target is the live Hugging Face Space. Exits non-zero if any check fails.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ReadResourceDirectoryResultSchema } from "@modelcontextprotocol/sdk/types.js";

const BASE =
  process.argv[2] ||
  process.env.SMOKE_URL ||
  "https://olaservo-mcp-list-resources-demo.hf.space";

let failures = 0;
const ok = (cond, msg) => {
  console.log((cond ? "PASS " : "FAIL ") + msg);
  if (!cond) failures++;
};

async function connect(path) {
  const client = new Client({ name: "smoke", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(BASE + path));
  await client.connect(transport);
  return { client, transport };
}

async function readDirAll(client, uri) {
  const resources = [];
  let cursor;
  let pages = 0;
  do {
    const res = await client.request(
      { method: "resources/directory/read", params: { uri, cursor } },
      ReadResourceDirectoryResultSchema
    );
    if (pages === 0) ok(!!res.nextCursor, "B: first page has a nextCursor");
    resources.push(...res.resources);
    cursor = res.nextCursor;
    pages++;
  } while (cursor);
  return resources;
}

console.log(`smoke target: ${BASE}\n`);

// --- /mcp : A (read -> contents) + B (directory/read) + docs ---
{
  const { client, transport } = await connect("/mcp");

  const { resources } = await client.listResources();
  const uris = new Set(resources.map((r) => r.uri));
  ok(uris.has("demo://fs/"), "resources/list includes demo://fs/");
  ok(uris.has("demo://docs/readme.md"), "resources/list includes the README resource");

  const dir = await readDirAll(client, "demo://fs/bulk/");
  ok(dir.length === 8, `B: directory/read returns all 8 bulk entries (got ${dir.length})`);
  ok(
    dir.every((r) => /^sha256:[0-9a-f]{64}$/.test(r.digest ?? "")),
    "B: every entry has a sha256 digest"
  );
  ok(
    dir.every((r) => r.text === undefined && r.blob === undefined),
    "B: entries carry no content (metadata only)"
  );

  const aRead = await client.readResource({ uri: "demo://fs/bulk/" });
  ok(!!aRead.contents && !aRead.resources, "A: read(dir) returns contents, not a listing");

  const readme = await client.readResource({ uri: "demo://docs/readme.md" });
  ok(
    (readme.contents?.[0]?.text ?? "").includes("list-resources-demo"),
    "docs: README is readable as a single resource"
  );

  await transport.close();
}

// --- /mcp/listing : C (read -> Resource[] listing) ---
{
  const { client, transport } = await connect("/mcp/listing");
  const cRead = await client.readResource({ uri: "demo://fs/bulk/" });
  ok(
    !!cRead.resources && !cRead.contents && cRead.resources.length === 8,
    "C: read(dir) returns a Resource[] listing (8), not contents"
  );
  await transport.close();
}

console.log(`\n${failures === 0 ? "OK" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
