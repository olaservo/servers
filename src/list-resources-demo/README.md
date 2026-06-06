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

A minimal MCP server that exposes **one resource tree two ways**, to contrast
how you list a directory's contents today versus the proposed
`resources/directory/read` method.

The resource tree (the single source of truth in [`resources/tree.ts`](resources/tree.ts)):

```
demo://fs/                     (dir, inode/directory)
  demo://fs/readme.txt          text/plain
  demo://fs/data.json           application/json
  demo://fs/docs/              (dir, inode/directory)
    demo://fs/docs/guide.md     text/markdown
  demo://fs/images/            (dir, inode/directory)
    demo://fs/images/logo.png   image/png (blob)
```

## The two approaches

**Version A — currently supported** ([`resources/current.ts`](resources/current.ts))
Every node is a normal resource, so `resources/list` returns them flat. To list
a directory's children you overload `resources/read`: reading a directory
returns its children packed into the `ResourceContents[]` array. Because
`ResourceContents` is a *content* type you must embed each child's bytes (and
fabricate a placeholder for sub-directories).

```jsonc
// resources/read { "uri": "demo://fs/" }  -> contents are CONTENT, not metadata
{ "contents": [
  { "uri": "demo://fs/readme.txt", "mimeType": "text/plain", "text": "..." },
  { "uri": "demo://fs/data.json",  "mimeType": "application/json", "text": "..." },
  { "uri": "demo://fs/docs/",      "mimeType": "inode/directory", "text": "directory: docs (1 entries) ..." },
  { "uri": "demo://fs/images/",    "mimeType": "inode/directory", "text": "directory: images (1 entries) ..." }
] }
```

**Version B — proposed** ([`resources/proposed.ts`](resources/proposed.ts))
A new `resources/directory/read` request takes a directory `uri` and returns its
children as `Resource[]` *metadata* — like `ls`. No content is embedded, and each
entry carries a `digest` for caching. Directories are marked with
`mimeType: "inode/directory"` so clients know what can be expanded. Backed by a
forked SDK that adds the request/result schemas, the `digest`/`size` fields, and
the `DIRECTORY_MIME_TYPE` constant.

```jsonc
// resources/directory/read { "uri": "demo://fs/" }  -> metadata + digest, no content
{ "resources": [
  { "uri": "demo://fs/readme.txt", "name": "readme.txt", "mimeType": "text/plain",
    "size": 232, "digest": "sha256:..." },
  { "uri": "demo://fs/docs/", "name": "docs", "mimeType": "inode/directory",
    "size": 41, "digest": "sha256:..." }
  // ...
] }
```

The response is paginated (`cursor` / `nextCursor`), matching the shape of
`resources/list`.

## The forked SDK

This demo depends on a fork of the MCP TypeScript SDK
([`olaservo/typescript-sdk`](https://github.com/olaservo/typescript-sdk),
`feat/resources-directory-read` off `v1.x`) which adds, in `src/types.ts`:

- `ReadResourceDirectoryRequestSchema` / `ReadResourceDirectoryResultSchema`
  (method `resources/directory/read`)
- `digest` and `size` fields on `ResourceSchema`
- the `DIRECTORY_MIME_TYPE` constant

The fork is vendored here as a packed tarball under [`vendor/`](vendor) and
referenced via a `file:` dependency, so the package builds and deploys without a
published SDK release. Re-vendor after changing the fork with `npm run vendor:sdk`.

## Run locally

```bash
npm install
npm run build

# stdio (e.g. for the MCP Inspector)
npm run start:stdio

# Streamable HTTP on http://localhost:7860/mcp
npm run start:streamableHttp
```

## Test

```bash
npm test
```

## Deploy to a Hugging Face Docker Space

The front-matter above configures a Docker Space on port 7860. Push this
directory (including `vendor/`) to a Space repo under `olaservo`. The
[`Dockerfile`](Dockerfile) builds the fork tarball and the server into a
self-contained image and serves `POST /mcp` (plus a `GET /` health check).

For a public Space, restrict hosts with DNS-rebinding protection by setting the
`ALLOWED_HOSTS` env var, e.g. `olaservo-list-resources-demo.hf.space`.
