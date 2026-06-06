// Quantifies the difference between three ways of listing a directory's
// resources, to feed the resources/list spec discussion.
//
// For a target directory it runs:
//   A) resources/read(dir) -> ResourceContents[]   (current spec)
//   C) resources/read(dir) -> Resource[]           (Sam: single-RPC listing)
//   B) resources/directory/read(dir) -> Resource[] (Peter: proposed method)
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

async function connect(options) {
  const { server } = createServer(options);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "compare", version: "0.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

// Approach A: read a directory, current spec (children embedded as contents).
async function listCurrent(client, uri) {
  const res = await client.readResource({ uri });
  const contents = res.contents ?? [];
  return {
    rpcs: 1,
    payloadBytes: bytes(res),
    entries: contents.length,
    // Bytes of actual child *content* shipped just to enumerate the directory.
    contentBytes: contents.reduce(
      (sum, c) => sum + (c.text ? Buffer.byteLength(c.text) : 0) + (c.blob ? c.blob.length : 0),
      0
    ),
    metadataFields: fieldsPresent(contents),
    paginates: false,
  };
}

// Approach C: read a directory, Sam's alternative (single-RPC Resource[] listing).
async function listReadListing(client, uri) {
  const res = await client.readResource({ uri });
  const resources = res.resources ?? [];
  return {
    rpcs: 1,
    payloadBytes: bytes(res),
    entries: resources.length,
    contentBytes: 0,
    metadataFields: fieldsPresent(resources),
    paginates: false, // a read result has no cursor
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

const clientContents = await connect({ readDirectoryReturnsListing: false });
const clientListing = await connect({ readDirectoryReturnsListing: true });

const row = (r) => ({
  "round trips": r.rpcs,
  "list payload": kb(r.payloadBytes),
  "content shipped to list": kb(r.contentBytes),
  paginates: r.paginates,
  "per-entry fields": r.metadataFields.join(","),
});

for (const uri of TARGETS) {
  const a = await listCurrent(clientContents, uri);
  const c = await listReadListing(clientListing, uri);
  const b = await listProposed(clientContents, uri);
  console.log(`\n=== ${uri} (${b.entries} entries) ===`);
  console.table({
    "A. resources/read -> ResourceContents[] (current)": row(a),
    "C. resources/read -> Resource[] (Sam, single RPC)": row(c),
    "B. resources/directory/read -> Resource[] (proposed)": row(b),
  });
  const ratio = (a.payloadBytes / Math.max(b.payloadBytes, 1)).toFixed(1);
  console.log(
    `payload to list: current (A) is ${ratio}x the proposed (B) (${kb(a.payloadBytes)} vs ${kb(b.payloadBytes)})`
  );
}

// Digest-based caching: re-listing yields identical digests, so a client can
// skip re-reading unchanged children entirely.
const p1 = await clientContents.request(
  { method: "resources/directory/read", params: { uri: "demo://fs/bulk/" } },
  ReadResourceDirectoryResultSchema
);
const p2 = await clientContents.request(
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
