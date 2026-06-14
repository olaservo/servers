// Compares the two ways of conveying a directory's children, measured against
// this server's resources:
//
//   today)  resources/read -> ResourceContents[]   (children embedded as content)
//   SEP)    resources/directory/read -> Resource[]  (children as metadata)
//
// The ResourceContents[] form is the array a read-overload would return: each
// child's content embedded. We reconstruct it by reading each child (the only
// conformant way to obtain those contents), which is also exactly what a host
// must do today to enumerate-with-content. The directory/read form is called
// directly. Run after building:  node scripts/compare.mjs
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/server/index.js";

const DirResult = z
  .object({
    resources: z.array(z.object({}).loose()),
    nextCursor: z.string().optional(),
  })
  .loose();

const TARGET = "skill://data-pipeline/references";
const bytes = (o) => Buffer.byteLength(JSON.stringify(o), "utf-8");
const kb = (n) => (n / 1024).toFixed(1) + " KB";

const { server } = createServer();
const [ct, st] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "compare", version: "0.0.0" });
await Promise.all([server.connect(st), client.connect(ct)]);

// --- SEP: resources/directory/read -> Resource[] (walk pagination) ---
let dirResources = [];
let dirBytes = 0;
let dirRpcs = 0;
let cursor;
do {
  const res = await client.request(
    { method: "resources/directory/read", params: { uri: TARGET, cursor } },
    DirResult
  );
  dirBytes += bytes(res);
  dirResources.push(...res.resources);
  cursor = res.nextCursor;
  dirRpcs++;
} while (cursor);

// --- today: ResourceContents[] (read each child; assemble the array a read-overload would return) ---
const contents = [];
for (const r of dirResources) {
  const res = await client.readResource({ uri: r.uri });
  contents.push(...res.contents);
}
const contentsResult = { contents }; // the single ResourceContents[] response a read-overload returns
const contentsBytes = bytes(contentsResult);
const embeddedBytes = contents.reduce(
  (s, c) => s + (c.text ? Buffer.byteLength(c.text) : 0) + (c.blob ? c.blob.length : 0),
  0
);

const fields = (items) => {
  const k = new Set();
  for (const it of items) for (const key of Object.keys(it)) k.add(key);
  return [...k].sort().join(", ");
};

console.log(`\nListing ${TARGET} (${dirResources.length} children)\n`);
console.table({
  "resources/read -> ResourceContents[] (today)": {
    "round trips": 1,
    "list payload": kb(contentsBytes),
    "content shipped": kb(embeddedBytes),
    paginates: false,
    "per-entry fields": fields(contents),
  },
  "resources/directory/read -> Resource[] (SEP-2640)": {
    "round trips": dirRpcs,
    "list payload": kb(dirBytes),
    "content shipped": kb(0),
    paginates: dirRpcs > 1,
    "per-entry fields": fields(dirResources),
  },
});
console.log(
  `\nTo list this directory, ResourceContents[] ships ${(contentsBytes / dirBytes).toFixed(0)}x the bytes ` +
    `(${kb(contentsBytes)} vs ${kb(dirBytes)}) because it embeds every child's content;\n` +
    `resources/directory/read returns metadata only (uri/name/mimeType), paginates, and marks\n` +
    `subdirectories with inode/directory. ResourceContents carries no name and cannot represent a\n` +
    `subdirectory except as a placeholder.`
);
process.exitCode = 0;
await client.close();
setTimeout(() => process.exit(0), 500).unref();
