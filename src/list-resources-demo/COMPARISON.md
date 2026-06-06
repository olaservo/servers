# Comparison: listing a directory's resources

This server exposes one resource tree two ways so the trade-offs can be measured
rather than argued. It is a sandbox for the `resources/list` redesign discussed
in the Discord thread and in [discussion #2859][2859].

- **Current** — `resources/read(dir)` returns the children embedded in a
  `ResourceContents[]` array.
- **Proposed** — `resources/directory/read(dir)` returns the children as a
  paginated `Resource[]` (metadata only), per Peter's 6/4 design. Backed by a
  forked SDK that adds the request/result schemas, `digest`/`size` on `Resource`,
  and the `inode/directory` marker.

## Measured

From `npm run compare` (page size 3):

| directory | approach | round trips | list payload | content shipped to list | paginates | per-entry fields |
|---|---|--:|--:|--:|:--:|---|
| `demo://fs/` (5) | current | 1 | 0.85 KB | 0.50 KB | no | uri, mimeType, text |
| `demo://fs/` (5) | proposed | 2 | 1.28 KB | 0 KB | yes | uri, name, title, description, mimeType, size, digest |
| `demo://fs/bulk/` (8) | current | 1 | 31.9 KB | 31.4 KB | no | uri, mimeType, text |
| `demo://fs/bulk/` (8) | proposed | 3 | 2.1 KB | 0 KB | yes | uri, name, title, description, mimeType, size, digest |

The crossover is the point: the proposed listing has a small fixed cost per
entry, while the current listing's cost scales with the total content under the
directory. For a few tiny files the current approach is smaller; for real files
it is not (15× here, unbounded as content grows). The skills use case in #2859 is
hundreds of files, so the current approach means transferring everything to
enumerate anything.

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

## Open design questions this can inform

- **Separate method vs. single RPC.** We implemented the separate
  `resources/directory/read`. Sam raised an alternative: reading an
  `inode/directory` returns the listing directly (one RPC). The demo can host
  both to compare ergonomics.
- **`resources/list(uri)` vs `resources/directory/read`.** The thread moved from
  a `uri` parameter on `resources/list` to a dedicated method; both return the
  same `Resource[]` shape.
- **`digest`** — included.
- **Templates** — leaning toward removal; omitted from this minimal demo.
- **Skills index / frontmatter** — out of scope; decoupled as a file in the SEP.

[2859]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2859
