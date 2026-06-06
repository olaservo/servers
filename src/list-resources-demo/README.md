---
title: MCP List Resources Demo
emoji: 🗂️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# list-resources-demo

A minimal MCP server that exposes one resource tree three ways, to compare how a
directory's contents are listed today versus the proposed approaches. It is a
sandbox for the `resources/list` redesign; see [COMPARISON.md](COMPARISON.md) for
the analysis and measurements.

Resource tree (single source of truth in [`resources/tree.ts`](resources/tree.ts)):

```
demo://fs/                     (inode/directory)
  readme.txt                    text/plain
  data.json                     application/json
  docs/                        (inode/directory)
    guide.md                    text/markdown
  images/                      (inode/directory)
    logo.png                    image/png (blob)
  bulk/                        (inode/directory)
    chapter-1.md … chapter-8.md text/markdown
```

## Three approaches

- **A — current** ([`resources/current.ts`](resources/current.ts)) —
  `resources/read` on a directory returns its children embedded as
  `ResourceContents[]`. Listing requires shipping each child's content; there is
  no pagination, no per-entry metadata beyond `uri`/`mimeType`, and
  sub-directories become placeholders.
- **C — single-RPC listing** (Sam) — `resources/read` on a directory returns a
  `Resource[]` listing in one call. Full metadata and one round trip, but no
  pagination and the read result becomes polymorphic (content for a file, listing
  for a directory). Over HTTP this is the `/mcp/listing` endpoint; for stdio set
  `READ_DIRECTORY_MODE=listing`.
- **B — proposed method** (Peter, [`resources/proposed.ts`](resources/proposed.ts)) —
  `resources/directory/read` returns the children as a paginated `Resource[]`
  with `name`, `title`, `size`, and `digest`, and no content. Directories are
  marked `inode/directory`.

Backed by a fork of the MCP TypeScript SDK
([`olaservo/typescript-sdk`](https://github.com/olaservo/typescript-sdk),
`feat/resources-directory-read`) adding the `resources/directory/read` schemas,
an optional `resources` field on the read result (for approach C), the
`digest`/`size` fields, and the `DIRECTORY_MIME_TYPE` constant. The fork is
vendored under [`vendor/`](vendor) as a packed tarball and used via a `file:`
dependency; re-vendor with `npm run vendor:sdk`.

## Use

```bash
npm install
npm run build
npm test            # all listing paths over an in-memory client/server
npm run compare     # prints the measured comparison
npm run start:stdio
npm run start:streamableHttp   # see endpoints below
```

Over HTTP all three approaches are live at once:

- `POST /mcp` — A (read a directory returns `ResourceContents[]`) + B
- `POST /mcp/listing` — C (read a directory returns `Resource[]`) + B
- `GET /` — health check and endpoint directory

(`resources/directory/read`, B, is available on both.)

## Deploy (Hugging Face Docker Space)

The front-matter configures a Docker Space on port 7860. Push this directory
(including `vendor/`) to a Space; the [`Dockerfile`](Dockerfile) builds a
self-contained image serving the endpoints above. For a public
Space, set `ALLOWED_HOSTS` (e.g. `olaservo-mcp-list-resources-demo.hf.space`) to
enable DNS-rebinding protection.
