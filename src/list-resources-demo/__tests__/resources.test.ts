import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server/index.js";

const DirResult = z
  .object({
    resources: z.array(
      z.object({ uri: z.string(), name: z.string().optional(), mimeType: z.string().optional() }).loose()
    ),
    nextCursor: z.string().optional(),
  })
  .loose();

const sha256 = (s: string) =>
  "sha256:" + createHash("sha256").update(s, "utf-8").digest("hex");

async function connect() {
  const { server } = createServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

let client: Awaited<ReturnType<typeof connect>>;
beforeEach(async () => {
  client = await connect();
});

const readText = async (uri: string) => {
  const res = await client.readResource({ uri });
  return (res.contents[0] as { text?: string }).text ?? "";
};

describe("capability", () => {
  it("declares the io.modelcontextprotocol/skills extension with directoryRead", () => {
    const caps = client.getServerCapabilities();
    const skills = caps?.extensions?.["io.modelcontextprotocol/skills"] as
      | { directoryRead?: boolean }
      | undefined;
    expect(skills).toBeDefined();
    expect(skills?.directoryRead).toBe(true);
  });
});

describe("resources/directory/read (SEP-2640)", () => {
  const readDir = (uri: string, cursor?: string) =>
    client.request(
      { method: "resources/directory/read", params: { uri, cursor } },
      DirResult
    );

  it("lists a skill root's direct children, marking subdirs inode/directory", async () => {
    const { resources } = await readDir("skill://pdf-processing");
    const byName = new Map(resources.map((r) => [r.name, r]));
    expect(byName.get("SKILL.md")?.mimeType).toBe("text/markdown");
    expect(byName.get("references")?.mimeType).toBe("inode/directory");
    expect(byName.get("scripts")?.mimeType).toBe("inode/directory");
  });

  it("descends into a subdirectory (not recursive)", async () => {
    const { resources } = await readDir("skill://pdf-processing/references");
    expect(resources.map((r) => r.uri)).toEqual([
      "skill://pdf-processing/references/FORMS.md",
    ]);
  });

  it("navigates organizational prefixes down to the skill", async () => {
    expect((await readDir("skill://acme")).resources.map((r) => r.name)).toEqual([
      "billing",
    ]);
    expect(
      (await readDir("skill://acme/billing")).resources.map((r) => r.name)
    ).toEqual(["refunds"]);
    const refunds = await readDir("skill://acme/billing/refunds");
    expect(refunds.resources.map((r) => r.name).sort()).toEqual([
      "SKILL.md",
      "examples",
    ]);
  });

  it("tolerates a trailing slash on the directory URI", async () => {
    const { resources } = await readDir("skill://pdf-processing/scripts/");
    expect(resources.map((r) => r.uri)).toEqual([
      "skill://pdf-processing/scripts/extract.py",
    ]);
  });

  it("errors (-32602) on a non-directory resource", async () => {
    await expect(readDir("skill://pdf-processing/SKILL.md")).rejects.toMatchObject({
      code: -32602,
    });
  });
});

describe("resource mapping (skill://)", () => {
  it("exposes each skill file as a resource under skill://", async () => {
    const { resources } = await client.listResources();
    const uris = new Set(resources.map((r) => r.uri));
    expect(uris.has("skill://git-workflow/SKILL.md")).toBe(true);
    expect(uris.has("skill://git-workflow/references/COMMITS.md")).toBe(true);
    expect(uris.has("skill://pdf-processing/scripts/extract.py")).toBe(true);
    expect(uris.has("skill://acme/billing/refunds/SKILL.md")).toBe(true);
    expect(uris.has("skill://index.json")).toBe(true);
  });

  it("sets SKILL.md metadata from frontmatter", async () => {
    const { resources } = await client.listResources();
    const gw = resources.find((r) => r.uri === "skill://git-workflow/SKILL.md");
    expect(gw?.mimeType).toBe("text/markdown");
    expect(gw?.name).toBe("git-workflow");
    expect(gw?.description).toContain("Git");
  });

  it("reads a SKILL.md with YAML frontmatter", async () => {
    const text = await readText("skill://git-workflow/SKILL.md");
    expect(text).toMatch(/^---\n/);
    expect(text).toContain("name: git-workflow");
    expect(text).toContain("description:");
  });

  it("reads supporting files as siblings under the skill path", async () => {
    const py = await readText("skill://pdf-processing/scripts/extract.py");
    expect(py).toContain("def main");
  });
});

describe("skill://index.json", () => {
  it("enumerates skills with url, digest, and verbatim frontmatter", async () => {
    const index = JSON.parse(await readText("skill://index.json"));
    expect(Array.isArray(index.skills)).toBe(true);
    const names = index.skills.map((s: any) => s.frontmatter.name).sort();
    expect(names).toEqual([
      "data-pipeline",
      "git-workflow",
      "pdf-processing",
      "refunds",
    ]);

    for (const entry of index.skills) {
      expect(entry.url).toMatch(/^skill:\/\/.*\/SKILL\.md$/);
      expect(entry.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(typeof entry.frontmatter.description).toBe("string");
    }
  });

  it("names the prefixed skill by its final path segment", async () => {
    const index = JSON.parse(await readText("skill://index.json"));
    const refunds = index.skills.find((s: any) => s.frontmatter.name === "refunds");
    expect(refunds.url).toBe("skill://acme/billing/refunds/SKILL.md");
  });

  it("passes through extra frontmatter verbatim (license, metadata)", async () => {
    const index = JSON.parse(await readText("skill://index.json"));
    const refunds = index.skills.find((s: any) => s.frontmatter.name === "refunds");
    expect(refunds.frontmatter.license).toBe("Apache-2.0");
    const pdf = index.skills.find((s: any) => s.frontmatter.name === "pdf-processing");
    expect(pdf.frontmatter.metadata.version).toBe("2.1.0");
  });

  it("digest matches the actual SKILL.md bytes (integrity)", async () => {
    const index = JSON.parse(await readText("skill://index.json"));
    for (const entry of index.skills) {
      const md = await readText(entry.url);
      expect(sha256(md)).toBe(entry.digest);
    }
  });

  it("lists .tar.gz and .zip archives for each skill", async () => {
    const index = JSON.parse(await readText("skill://index.json"));
    for (const entry of index.skills) {
      const mimes = entry.archives.map((a: any) => a.mimeType).sort();
      expect(mimes).toEqual(["application/gzip", "application/zip"]);
      for (const a of entry.archives) {
        expect(a.url).toMatch(/\.(tar\.gz|zip)$/);
        expect(a.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
    }
  });
});

describe("archives", () => {
  const readBlob = async (uri: string) => {
    const res = await client.readResource({ uri });
    return Buffer.from((res.contents[0] as { blob: string }).blob, "base64");
  };

  it("archive bytes match the index digest (integrity)", async () => {
    const index = JSON.parse(await readText("skill://index.json"));
    for (const entry of index.skills) {
      for (const a of entry.archives) {
        const bytes = await readBlob(a.url);
        expect("sha256:" + createHash("sha256").update(bytes).digest("hex")).toBe(
          a.digest
        );
      }
    }
  });

  it(".tar.gz gunzips with SKILL.md at the archive root", async () => {
    const tgz = await readBlob("skill://pdf-processing.tar.gz");
    expect(tgz[0]).toBe(0x1f);
    expect(tgz[1]).toBe(0x8b); // gzip magic
    const tar = gunzipSync(tgz);
    expect(tar.toString("utf-8", 0, 8)).toBe("SKILL.md"); // first tar entry, at root
  });

  it(".zip has the PK local-file-header magic", async () => {
    const z = await readBlob("skill://pdf-processing.zip");
    expect(z[0]).toBe(0x50);
    expect(z[1]).toBe(0x4b);
    expect(z[2]).toBe(0x03);
    expect(z[3]).toBe(0x04);
  });
});
