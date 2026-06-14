---
title: Skills over MCP (SEP-2640) demo
emoji: 🛠️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# skills-over-mcp demo

A reference MCP server for **[SEP-2640: Skills Extension](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640)**.
It serves [Agent Skills](https://agentskills.io/) over the base **Resources**
primitive — no new methods, no schema changes. Each file in a skill directory is
a resource under the `skill://` scheme, a well-known `skill://index.json`
enumerates the skills, and the server declares the
`io.modelcontextprotocol/skills` extension capability.

## Skills served

Mirrors the examples in SEP-2640:

| Skill path | `SKILL.md` URI | Supporting files |
|---|---|---|
| `git-workflow` | `skill://git-workflow/SKILL.md` | `references/COMMITS.md` |
| `pdf-processing` | `skill://pdf-processing/SKILL.md` | `references/FORMS.md`, `scripts/extract.py` |
| `acme/billing/refunds` | `skill://acme/billing/refunds/SKILL.md` | `examples/email.md` |

The final path segment is the skill `name` (so `acme/billing/refunds` is the
skill `refunds`; the prefix is organizational). Definitions live in
[`resources/skills.ts`](resources/skills.ts).

## How it maps to the spec

- **Resource mapping** — every skill file is a `resources/read`-able resource at
  `skill://<skill-path>/<file-path>`, `SKILL.md` always explicit.
- **`SKILL.md` metadata** — `mimeType: text/markdown`, `name`/`description` from
  the YAML frontmatter; the full frontmatter is also under `_meta`
  (`io.modelcontextprotocol.skills/frontmatter`).
- **Enumeration** — `skill://index.json` lists each skill with `url`, `digest`
  (sha256 of `SKILL.md`), and verbatim `frontmatter`. Enumeration is optional in
  the spec; this server provides it.
- **Capability** — `extensions: { "io.modelcontextprotocol/skills": { "directoryRead": true } }`.
- **Directory listing** — `resources/directory/read` lists the direct children of
  a directory resource (files with their metadata, subdirectories as
  `inode/directory`), scoped and paginated like `resources/list`. Directory URIs
  have no trailing slash (e.g. `skill://pdf-processing`); a non-directory returns
  error `-32602`. This is the one optional method the SEP defines, gated behind
  the `directoryRead` capability.
- **Integrity/caching** — the index `digest` is the sha256 of the `SKILL.md`
  bytes; a host verifies content against it and can skip re-reads when unchanged.
- **Archives** — each skill is also offered as a packed `.tar.gz` and `.zip`
  resource (`skill://<skill-path>.tar.gz` / `.zip`), listed under the index
  entry's `archives` with `mimeType` and a sha256 `digest`. `SKILL.md` sits at the
  archive root; reading one retrieves the whole skill in a single round trip.

The only new protocol surface is the optional, capability-gated
`resources/directory/read` (defined here on the stock SDK with a local schema — no
fork); it returns the same `Resource[]` shape as `resources/list`, so a
current-spec client otherwise sees ordinary resources.

## Why `resources/directory/read`

[COMPARISON.md](COMPARISON.md) measures it against the shape available today — the
`ResourceContents[]` array a `resources/read` returns — for the same directory.
For a 60-file directory, the `ResourceContents[]` form ships ~17× the bytes (it
embeds every child's content to enumerate), carries no `name`, and can't paginate
or represent subdirectories; `resources/directory/read` returns paginated metadata
only. Run it with `npm run compare`. (The repo includes a large `data-pipeline`
skill so the numbers are meaningful.)

## Try it (live)

Live server: `https://olaservo-mcp-list-resources-demo.hf.space` (MCP at `/mcp`,
health at `/`).

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect with transport "Streamable HTTP" to
`https://olaservo-mcp-list-resources-demo.hf.space/mcp`, then read
`skill://index.json`, or a skill directly (`skill://git-workflow/SKILL.md`).

### curl

Streamable HTTP is session-based and replies as SSE (`data:` lines).

```bash
BASE=https://olaservo-mcp-list-resources-demo.hf.space
ACCEPT='Accept: application/json, text/event-stream'

# initialize — capture the mcp-session-id response header
SID=$(curl -sD - -o /dev/null -X POST $BASE/mcp \
  -H 'Content-Type: application/json' -H "$ACCEPT" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' \
  | grep -i '^mcp-session-id:' | tr -d '\r' | awk '{print $2}')

curl -s -X POST $BASE/mcp -H 'Content-Type: application/json' -H "$ACCEPT" \
  -H "mcp-session-id: $SID" -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# enumerate skills
curl -s -X POST $BASE/mcp -H 'Content-Type: application/json' -H "$ACCEPT" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"skill://index.json"}}'

# read a skill directly
curl -s -X POST $BASE/mcp -H 'Content-Type: application/json' -H "$ACCEPT" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"skill://git-workflow/SKILL.md"}}'

# list a directory's children (resources/directory/read)
curl -s -X POST $BASE/mcp -H 'Content-Type: application/json' -H "$ACCEPT" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":4,"method":"resources/directory/read","params":{"uri":"skill://pdf-processing"}}'
```

### Automated conformance smoke test

Drives a running server with the real MCP client and asserts the SEP-2640
behaviors (capability, `skill://` resources, index with digests, integrity,
prefixed-skill naming). Exits non-zero on failure.

```bash
npm run smoke                                  # targets the live server by default
SMOKE_URL=http://localhost:7860 npm run smoke  # or a local server
```

## Develop locally

```bash
npm install
npm run build
npm test                       # SEP-2640 behaviors over an in-memory client/server
npm run start:stdio
npm run start:streamableHttp    # serves /mcp on :7860
```

The server also serves its own README as a static resource
(`demo://docs/readme.md`).

## Deploy (Hugging Face Docker Space)

The front-matter configures a Docker Space on port 7860. Push this directory to a
Space; the [`Dockerfile`](Dockerfile) builds the image (stock
`@modelcontextprotocol/sdk` from npm — no fork needed) and serves `/mcp` plus a
`GET /` health check. For a public Space, set `ALLOWED_HOSTS`
(e.g. `olaservo-mcp-list-resources-demo.hf.space`) to enable DNS-rebinding
protection.
