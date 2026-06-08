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

It also exposes `demo://skills/` — a nested, skills-scale tree (12 skills, ~25
directories, ~334 files) used by `npm run compare` to measure whole-tree discovery
and warm-restart caching, where the approaches actually diverge.

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

> **Method name (open):** the spec discussion spelled it both
> `resources/directory/read` and `resource/directory/read`. This demo uses the
> **plural** `resources/…`, matching every existing resource method in the spec
> and SDK (`resources/list`, `resources/read`, `resources/templates/list`, …). The
> exact spelling is still being confirmed; if it lands on the singular it's a
> one-line change to the method literal.

### Forked SDK

The proposed pieces live in a fork of the MCP TypeScript SDK (based on `v1.29.0`),
published to npm as [`@olaservo/mcp-sdk`](https://www.npmjs.com/package/@olaservo/mcp-sdk).
This package depends on it via an alias, so the imports stay
`@modelcontextprotocol/sdk/...`:

```json
"@modelcontextprotocol/sdk": "npm:@olaservo/mcp-sdk@1.29.0-directory-read.0"
```

Source and review links:

- branch:
  [`olaservo/typescript-sdk` @ `feat/resources-directory-read`](https://github.com/olaservo/typescript-sdk/tree/feat/resources-directory-read)
- the schema changes:
  [`src/types.ts`](https://github.com/olaservo/typescript-sdk/blob/feat/resources-directory-read/src/types.ts)
  — `resources/directory/read` request/result schemas, an optional `resources`
  field on the read result (approach C), `digest` on `Resource` (and `size`, now
  upstream-native), and the `DIRECTORY_MIME_TYPE` constant.
- diff vs. the v1.29.0 base:
  [`v1.29.0...feat/resources-directory-read`](https://github.com/olaservo/typescript-sdk/compare/v1.29.0...feat/resources-directory-read)

## Try it (live)

Live server: `https://olaservo-mcp-list-resources-demo.hf.space`. All three
approaches are reachable at once:

- `POST /mcp` — A (read a directory returns `ResourceContents[]`) + B
- `POST /mcp/listing` — C (read a directory returns `Resource[]`) + B
- `GET /` — health check and endpoint directory

(`resources/directory/read`, B, is on both.)

The server also serves its own docs as plain static resources, so a connected
agent can read them in one call: `demo://docs/readme.md` and
`demo://docs/comparison.md`.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect with transport "Streamable HTTP" to
`https://olaservo-mcp-list-resources-demo.hf.space/mcp` (or `/mcp/listing`). Then:

- **B (proposed):** call `resources/directory/read` with `uri = demo://fs/bulk/`
  → paginated `Resource[]` with `digest`; follow `nextCursor` for more.
- **A vs C:** `resources/read` with `uri = demo://fs/bulk/` returns embedded
  `ResourceContents[]` on `/mcp` and a `Resource[]` listing on `/mcp/listing`.

### curl

Streamable HTTP is session-based and replies as SSE (`data:` lines).

```bash
BASE=https://olaservo-mcp-list-resources-demo.hf.space
ACCEPT='Accept: application/json, text/event-stream'

# 1. initialize — capture the mcp-session-id response header
SID=$(curl -sD - -o /dev/null -X POST $BASE/mcp \
  -H 'Content-Type: application/json' -H "$ACCEPT" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' \
  | grep -i '^mcp-session-id:' | tr -d '\r' | awk '{print $2}')

# 2. complete the handshake
curl -s -X POST $BASE/mcp -H 'Content-Type: application/json' -H "$ACCEPT" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3. B — proposed method (paginated metadata + digest)
curl -s -X POST $BASE/mcp -H 'Content-Type: application/json' -H "$ACCEPT" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"resources/directory/read","params":{"uri":"demo://fs/bulk/"}}'

# 4. A — current spec (children embedded as ResourceContents[])
curl -s -X POST $BASE/mcp -H 'Content-Type: application/json' -H "$ACCEPT" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"demo://fs/bulk/"}}'
```

For **C**, repeat against `$BASE/mcp/listing` (a new session): the step-4
`resources/read` returns a `Resource[]` listing instead of `ResourceContents[]`.

### Automated smoke test

A repeatable end-to-end check that drives a running server with the real MCP
client (Streamable HTTP) and asserts all three approaches plus the docs
resources — no Inspector, no manual curl. Exits non-zero on failure.

```bash
npm run smoke                                  # targets the live Space by default
SMOKE_URL=http://localhost:7860 npm run smoke  # or a local server
```

## Develop locally

```bash
npm install
npm run build
npm test            # all listing paths over an in-memory client/server
npm run compare     # prints the measured comparison
npm run start:stdio
npm run start:streamableHttp   # serves /mcp and /mcp/listing on :7860
```

## Deploy (Hugging Face Docker Space)

The front-matter configures a Docker Space on port 7860. Push this directory to a
Space; the [`Dockerfile`](Dockerfile) builds the image (installing the forked SDK
from npm) and serves the endpoints above. For a public Space, set `ALLOWED_HOSTS`
(e.g. `olaservo-mcp-list-resources-demo.hf.space`) to enable DNS-rebinding
protection.
