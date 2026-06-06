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

A minimal MCP server that exposes one resource tree two ways, to compare how a
directory's contents are listed today versus the proposed
`resources/directory/read` method. It is a sandbox for the `resources/list`
redesign; see [COMPARISON.md](COMPARISON.md) for the analysis and measurements.

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

## Two approaches

- **Current** ([`resources/current.ts`](resources/current.ts)) — `resources/read`
  on a directory returns its children embedded as `ResourceContents[]`. Listing
  requires shipping each child's content; there is no pagination, no per-entry
  metadata beyond `uri`/`mimeType`, and sub-directories become placeholders.
- **Proposed** ([`resources/proposed.ts`](resources/proposed.ts)) —
  `resources/directory/read` returns the children as a paginated `Resource[]`
  with `name`, `title`, `size`, and `digest`, and no content. Directories are
  marked `inode/directory`.

Backed by a fork of the MCP TypeScript SDK
([`olaservo/typescript-sdk`](https://github.com/olaservo/typescript-sdk),
`feat/resources-directory-read`) adding the request/result schemas, the
`digest`/`size` fields, and the `DIRECTORY_MIME_TYPE` constant. The fork is
vendored under [`vendor/`](vendor) as a packed tarball and used via a `file:`
dependency; re-vendor with `npm run vendor:sdk`.

## Use

```bash
npm install
npm run build
npm test            # both listing paths over an in-memory client/server
npm run compare     # prints the measured comparison
npm run start:stdio
npm run start:streamableHttp   # http://localhost:7860/mcp
```

## Deploy (Hugging Face Docker Space)

The front-matter configures a Docker Space on port 7860. Push this directory
(including `vendor/`) to a Space; the [`Dockerfile`](Dockerfile) builds a
self-contained image serving `POST /mcp` and a `GET /` health check. For a public
Space, set `ALLOWED_HOSTS` (e.g. `olaservo-mcp-list-resources-demo.hf.space`) to
enable DNS-rebinding protection.
