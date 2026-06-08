import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server/index.js";

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
  it("declares the io.modelcontextprotocol/skills extension", () => {
    const caps = client.getServerCapabilities();
    expect(caps?.extensions?.["io.modelcontextprotocol/skills"]).toBeDefined();
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
    expect(names).toEqual(["git-workflow", "pdf-processing", "refunds"]);

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
});
