# Listing a directory's children: `ResourceContents[]` vs `resources/directory/read`

SEP-2640 adds `resources/directory/read` to list a directory resource's children.
This compares it against the shape available today — the `ResourceContents[]`
array a `resources/read` returns — for the same directory.

- **Today — `ResourceContents[]`.** To convey a directory's children with existing
  surface, you embed them as content: an array of `ResourceContents`, each a
  child's bytes. (`resources/list` is the only other option and is unscoped — it
  returns the whole server, and large/generative servers decline to implement it.)
- **SEP-2640 — `resources/directory/read` → `Resource[]`.** Returns the children
  as metadata (`uri`, `name`, `mimeType`), scoped to the directory, paginated like
  `resources/list`, with subdirectories marked `inode/directory`.

## Measured

`npm run compare`, listing `skill://data-pipeline/references` (60 files):

| approach | round trips | list payload | content shipped | paginates | per-entry fields |
|---|--:|--:|--:|:--:|---|
| `resources/read` → `ResourceContents[]` (today) | 1 | 100.1 KB | 94.7 KB | no | uri, mimeType, text |
| `resources/directory/read` → `Resource[]` (SEP) | 2 | 5.8 KB | 0 KB | yes | uri, name, mimeType |

To list the directory, the `ResourceContents[]` form ships **~17× the bytes** —
it embeds every child's content just to enumerate. The directory-read form
returns metadata only; its cost is fixed per entry and independent of file size,
so the gap widens as content grows.

## Limitations of the `ResourceContents[]` form for listing

1. **Content, not metadata.** Enumerating requires transferring every child's
   bytes; there is no cheap listing.
2. **No `name`.** `ResourceContents` carries `uri`, `mimeType`, and `text`/`blob`
   only — not `name` (nor `size`, `title`, …). A picker must derive a label from
   the URI.
3. **No pagination.** A read result is a single array with no cursor;
   `resources/directory/read` is a `PaginatedResult`.
4. **Sub-directories don't fit.** A directory has no content of its own, so it can
   only appear as a fabricated placeholder. `resources/directory/read` marks it
   `inode/directory`, and the client descends with another call.
5. **Not scoped.** The only existing enumeration, `resources/list`, returns the
   server's entire resource space — it can't answer "what's in *this* directory",
   and is precisely what large or generative servers don't implement.

These are the SEP's rationale for defining the method ("Why a Directory Read
Method?"). It returns the same `Resource[]` shape as `resources/list`, needs no
schema change, and is gated behind the `directoryRead` capability — so a
current-spec client is unaffected.
