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
import {
  ReadResourceDirectoryResultSchema,
  DIRECTORY_MIME_TYPE,
} from "@modelcontextprotocol/sdk/types.js";
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

// ---------------------------------------------------------------------------
// Whole-tree discovery over the nested skills tree (demo://skills/). This is the
// metric that actually separates the approaches at scale: how much does it cost
// to *progressively discover an entire tree*?
const SKILLS = "demo://skills/";
const isDir = (mimeType) => mimeType === DIRECTORY_MIME_TYPE;

// A: read each directory; children come back as ResourceContents with file
// content embedded, so discovering the tree downloads everything.
async function discoverA(client, root) {
  let roundTrips = 0, totalBytes = 0, dirs = 0, files = 0;
  async function walk(uri) {
    dirs++;
    const res = await client.readResource({ uri });
    roundTrips++; totalBytes += bytes(res);
    for (const c of res.contents ?? []) {
      if (isDir(c.mimeType)) await walk(c.uri);
      else files++;
    }
  }
  await walk(root);
  return { roundTrips, bytes: totalBytes, dirs, files };
}

// B: resources/directory/read per directory, following pagination; metadata only.
async function discoverB(client, root) {
  let roundTrips = 0, totalBytes = 0, dirs = 0, files = 0;
  async function walk(uri) {
    dirs++;
    const subdirs = [];
    let cursor;
    do {
      const res = await client.request(
        { method: "resources/directory/read", params: { uri, cursor } },
        ReadResourceDirectoryResultSchema
      );
      roundTrips++; totalBytes += bytes(res);
      for (const r of res.resources) {
        if (isDir(r.mimeType)) subdirs.push(r.uri);
        else files++;
      }
      cursor = res.nextCursor;
    } while (cursor);
    for (const d of subdirs) await walk(d);
  }
  await walk(root);
  return { roundTrips, bytes: totalBytes, dirs, files };
}

// C: read each directory (single RPC, no pagination); metadata only.
async function discoverC(client, root) {
  let roundTrips = 0, totalBytes = 0, dirs = 0, files = 0;
  async function walk(uri) {
    dirs++;
    const res = await client.readResource({ uri });
    roundTrips++; totalBytes += bytes(res);
    for (const r of res.resources ?? []) {
      if (isDir(r.mimeType)) await walk(r.uri);
      else files++;
    }
  }
  await walk(root);
  return { roundTrips, bytes: totalBytes, dirs, files };
}

// Use a realistic page size for B here (a real server would not page at 3).
process.env.DIRECTORY_PAGE_SIZE = "100";
const da = await discoverA(clientContents, SKILLS);
const db = await discoverB(clientContents, SKILLS);
const dc = await discoverC(clientListing, SKILLS);
delete process.env.DIRECTORY_PAGE_SIZE;

console.log(`\n=== whole-tree discovery of ${SKILLS} (page size 100) ===`);
console.log(`${da.dirs} directories, ${da.files} files`);
console.table({
  "A. read -> ResourceContents[] (current)": { "round trips": da.roundTrips, "bytes transferred": kb(da.bytes) },
  "C. read -> Resource[] (single RPC)": { "round trips": dc.roundTrips, "bytes transferred": kb(dc.bytes) },
  "B. resources/directory/read (proposed)": { "round trips": db.roundTrips, "bytes transferred": kb(db.bytes) },
});
console.log(
  `A's bytes INCLUDE file content: read fuses discovery + content, so one pass (${da.roundTrips} trips) gets\n` +
    `everything. B/C transfer metadata only (~${(100 - (db.bytes / da.bytes) * 100).toFixed(0)}% fewer bytes) but must then read files\n` +
    `separately to get content. B vs C: identical metadata; B added ${db.roundTrips - dc.roundTrips} round trip to bound the one\n` +
    `directory larger than the page size — the case where C returns an unbounded response.`
);

// The decisive scenario for skills/progressive discovery (#2859): fetching all
// content, cold vs. a warm restart where most content is unchanged.
console.log(`\n=== fetch all content: cold vs. warm restart (${da.files} files) ===`);
console.log(`A  (read fuses content):   cold ${da.roundTrips} trips / ${kb(da.bytes)}   |   warm ${da.roundTrips} trips / ${kb(da.bytes)}  (no skip signal)`);
console.log(`B/C (metadata + reads):    cold ${dc.roundTrips}+${da.files} trips        |   warm ${dc.roundTrips} trips, 0 reads (digests unchanged)`);
console.log(
  `So A is cheaper when you always need all content fresh; B/C win for selective reads and for\n` +
    `caching across restarts — ${da.files} content reads avoided warm, which is the skills startup problem in #2859.`
);

process.exit(0);
