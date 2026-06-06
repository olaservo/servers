// Quantifies the difference between the two ways of listing a directory's
// resources, to feed the resources/list spec discussion.
//
// For a target directory it runs both:
//   A) resources/read(dir)            -> ResourceContents[]  (current spec)
//   B) resources/directory/read(dir)  -> Resource[]          (proposed)
// and reports bytes transferred to list, round trips, per-entry metadata, and
// whether content had to be transferred just to enumerate.
//
// Run after building:  node scripts/compare.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ReadResourceDirectoryResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../dist/server/index.js";

const TARGETS = ["demo://fs/", "demo://fs/bulk/"];

const bytes = (obj) => Buffer.byteLength(JSON.stringify(obj), "utf-8");
const kb = (n) => (n / 1024).toFixed(2) + " KB";

async function connect() {
  const { server } = createServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "compare", version: "0.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

// Approach A: list a directory the current-spec way.
async function listCurrent(client, uri) {
  const res = await client.readResource({ uri });
  return {
    rpcs: 1,
    payloadBytes: bytes(res),
    entries: res.contents.length,
    // Bytes of actual child *content* shipped just to enumerate the directory.
    contentBytes: res.contents.reduce(
      (sum, c) => sum + (c.text ? Buffer.byteLength(c.text) : 0) + (c.blob ? c.blob.length : 0),
      0
    ),
    metadataFields: fieldsPresent(res.contents),
    paginates: false,
  };
}

// Approach B: list a directory the proposed way (walk all pages).
async function listProposed(client, uri) {
  const resources = [];
  let cursor;
  let rpcs = 0;
  let payloadBytes = 0;
  do {
    const res = await client.request(
      { method: "resources/directory/read", params: { uri, cursor } },
      ReadResourceDirectoryResultSchema
    );
    payloadBytes += bytes(res);
    resources.push(...res.resources);
    cursor = res.nextCursor;
    rpcs++;
  } while (cursor);
  return {
    rpcs,
    payloadBytes,
    entries: resources.length,
    contentBytes: 0, // no content transferred to list
    metadataFields: fieldsPresent(resources),
    paginates: rpcs > 1,
  };
}

function fieldsPresent(items) {
  const keys = new Set();
  for (const it of items) for (const k of Object.keys(it)) keys.add(k);
  return [...keys].sort();
}

const client = await connect();

for (const uri of TARGETS) {
  const a = await listCurrent(client, uri);
  const b = await listProposed(client, uri);
  console.log(`\n=== ${uri} (${a.entries} entries) ===`);
  console.table({
    "resources/read -> ResourceContents[] (current)": {
      "round trips": a.rpcs,
      "list payload": kb(a.payloadBytes),
      "content shipped to list": kb(a.contentBytes),
      paginates: a.paginates,
      "per-entry fields": a.metadataFields.join(","),
    },
    "resources/directory/read -> Resource[] (proposed)": {
      "round trips": b.rpcs,
      "list payload": kb(b.payloadBytes),
      "content shipped to list": kb(b.contentBytes),
      paginates: b.paginates,
      "per-entry fields": b.metadataFields.join(","),
    },
  });
  const ratio = (a.payloadBytes / Math.max(b.payloadBytes, 1)).toFixed(1);
  console.log(
    `payload to list: current is ${ratio}x larger (${kb(a.payloadBytes)} vs ${kb(b.payloadBytes)})`
  );
}

// Digest-based caching: re-listing yields identical digests, so a client can
// skip re-reading unchanged children entirely.
const p1 = await client.request(
  { method: "resources/directory/read", params: { uri: "demo://fs/bulk/" } },
  ReadResourceDirectoryResultSchema
);
const p2 = await client.request(
  { method: "resources/directory/read", params: { uri: "demo://fs/bulk/" } },
  ReadResourceDirectoryResultSchema
);
const stable =
  JSON.stringify(p1.resources.map((r) => r.digest)) ===
  JSON.stringify(p2.resources.map((r) => r.digest));
console.log(`\ndigest caching: digests stable across calls = ${stable}`);
console.log(
  "(with digests a client caches by content hash and re-reads only changed entries;\n" +
    " the ResourceContents[] approach has no digest, so it re-ships all content each time.)"
);

process.exit(0);
