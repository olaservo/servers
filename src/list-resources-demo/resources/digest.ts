import { createHash } from "node:crypto";

/**
 * Compute a content digest of the form `sha256:<hex>`.
 *
 * In the proposed `resources/directory/read` design, every listed resource
 * carries a `digest` so clients can cache content and detect changes without
 * re-reading: an unchanged digest means the cached copy is still valid.
 *
 * @param data Raw bytes (or utf-8 text) to hash.
 */
export const sha256 = (data: string | Buffer): string =>
  "sha256:" + createHash("sha256").update(data).digest("hex");
