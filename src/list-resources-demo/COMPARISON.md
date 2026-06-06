# Comparison: listing a directory's resources

This server exposes one resource tree three ways so the trade-offs can be
measured rather than argued. It is a sandbox for the `resources/list` redesign
discussed in the Discord thread and in [discussion #2859][2859].

- **A — current** — `resources/read(dir)` returns the children embedded in a
  `ResourceContents[]` array.
- **C — single-RPC listing (Sam)** — `resources/read(dir)` returns the children
  as a `Resource[]` listing in one call. Reading a resource returns content for a
  file and a listing for a directory.
- **B — proposed method (Peter)** — `resources/directory/read(dir)` returns the
  children as a paginated `Resource[]` (metadata only), per his 6/4 design.

B and C are backed by a forked SDK that adds the `resources/directory/read`
schemas, an optional `resources` field on the read result, `digest`/`size` on
`Resource`, and the `inode/directory` marker.

## Measured

From `npm run compare` (page size 3):

| directory | approach | round trips | list payload | content shipped to list | paginates | per-entry fields |
|---|---|--:|--:|--:|:--:|---|
| `demo://fs/` (5) | A current | 1 | 0.85 KB | 0.50 KB | no | uri, mimeType, text |
| `demo://fs/` (5) | C single-RPC | 1 | 1.25 KB | 0 KB | no | uri, name, title, description, mimeType, size, digest |
| `demo://fs/` (5) | B proposed | 2 | 1.28 KB | 0 KB | yes | uri, name, title, description, mimeType, size, digest |
| `demo://fs/bulk/` (8) | A current | 1 | 31.9 KB | 31.3 KB | no | uri, mimeType, text |
| `demo://fs/bulk/` (8) | C single-RPC | 1 | 2.0 KB | 0 KB | no | uri, name, title, description, mimeType, size, digest |
| `demo://fs/bulk/` (8) | B proposed | 3 | 2.1 KB | 0 KB | yes | uri, name, title, description, mimeType, size, digest |

Two findings:

- **A vs (B/C): metadata beats embedded content for listing.** A's cost scales
  with the total content under the directory; B and C have a small fixed cost per
  entry. For a few tiny files A is smaller; for real files it is not (15× here,
  unbounded as content grows). The skills use case in #2859 is hundreds of files,
  so A means transferring everything to enumerate anything.
- **B vs C: pagination vs round trips.** B and C return essentially the same
  bytes and metadata. C does it in one round trip but cannot paginate (a read
  result has no cursor) and makes a read result polymorphic (content or listing,
  by resource type). B paginates but needs a second call per directory and a
  dedicated method.

## Limitations of `ResourceContents[]` for listing

1. **Content, not metadata.** To enumerate, the server must ship every child's
   bytes. There is no cheap listing.
2. **No pagination.** A `resources/read` result is a single array with no cursor.
   `resources/directory/read` is a `PaginatedResult`.
3. **Thin per-entry shape.** `ResourceContents` carries only `uri`, `mimeType`,
   and `text`/`blob`. It cannot convey `name`, `title`, `description`, `size`, or
   `digest` without overloading `_meta`.
4. **No digest.** Without it there is no caching or consistency signal, so
   listings and content must be re-fetched. #2859 reinstated `digest` for this.
5. **Sub-directories have no content.** They can only be represented as a
   fabricated placeholder (see `demo://fs/docs/` when read as a directory).

## Spec compliance

Checked against the MCP schema `2025-11-25` (Resource has `uri`, `name`, `title`,
`description?`, `mimeType?`, `annotations?`, `size?`, `_meta?`; `ReadResourceResult`
has only `contents`; no `directory`/`inode`/`digest` anywhere).

- **A (current)** is spec-compliant: `resources/read` returns
  `(TextResourceContents | BlobResourceContents)[]`; `resources/list` returns
  `Resource[]`, and `size` is a standard field.
- **`digest`** is *not* in the current schema — it is the proposed addition to the
  `Resource` type, so it appears wherever we return a `Resource` (`resources/list`
  and B). Current-spec clients ignore the unknown field (SDK parsers strip it), so
  it is forward-compatible.
- **B (`resources/directory/read`)** is not in the current schema by design — it is
  the proposal, and matches Peter's 6/4 description: a `uri` param, a paginated
  `Resource[]` result (same shape as `resources/list`, with `nextCursor`),
  directories marked `inode/directory`, and `digest` for caching. The method name
  uses the convention-consistent plural `resources/…`; the thread used both
  `resources/directory/read` and `resource/directory/read`, so the exact spelling is
  worth confirming.
- **C (read → listing)** is intentionally non-compliant: the current
  `ReadResourceResult` requires `contents` and has no `resources`. The fork makes
  `contents` optional and adds `resources`, so C needs the forked schema on both
  ends. It is an exploration (Sam's idea), not the adopted proposal.
- **Errors:** not-found / not-a-directory raise `InvalidParams` (-32602), matching
  the TypeScript SDK's existing `resources/read` behavior. (The spec's
  resource-not-found code is -32002; this discrepancy is inherited from the SDK.)

## Open design questions this can inform

- **Separate method (B) vs. single RPC (C).** Both are implemented here. C saves
  a round trip and a method but cannot paginate and overloads the read result;
  B paginates but adds a method and a call per directory. If directories can be
  large (the skills case), pagination likely outweighs the saved round trip,
  which favors B — unless the read result is also given a cursor, at which point
  it has effectively absorbed B.
- **`resources/list(uri)` vs `resources/directory/read`.** The thread moved from
  a `uri` parameter on `resources/list` to a dedicated method; both return the
  same `Resource[]` shape.
- **`digest`** — included; enables cache/skip-unchanged on re-list.
- **Templates** — leaning toward removal; omitted from this minimal demo.
- **Skills index / frontmatter** — out of scope; decoupled as a file in the SEP.

All three are reachable on the running HTTP server at once: A+B at `POST /mcp`,
C+B at `POST /mcp/listing` (A and C cannot share one endpoint because both define
`resources/read` on a directory). For stdio, select C with
`READ_DIRECTORY_MODE=listing`. `npm run compare` reports all three.

[2859]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2859
