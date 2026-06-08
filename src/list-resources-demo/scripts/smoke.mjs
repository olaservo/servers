// Automated end-to-end conformance smoke test for the SEP-2640 skills server,
// using the real MCP client over the Streamable HTTP transport (no Inspector,
// no manual curl).
//
// Usage:
//   node scripts/smoke.mjs [baseUrl]
//   SMOKE_URL=http://localhost:7860 node scripts/smoke.mjs
// Default target is the live Hugging Face Space. Exits non-zero on any failure.
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE =
  process.argv[2] ||
  process.env.SMOKE_URL ||
  "https://olaservo-mcp-list-resources-demo.hf.space";

let failures = 0;
const ok = (cond, msg) => {
  console.log((cond ? "PASS " : "FAIL ") + msg);
  if (!cond) failures++;
};
const sha256 = (s) => "sha256:" + createHash("sha256").update(s, "utf-8").digest("hex");

console.log(`smoke target: ${BASE}\n`);

const client = new Client({ name: "smoke", version: "0.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(BASE + "/mcp"));
await client.connect(transport);

// Capability: the skills extension is declared.
const caps = client.getServerCapabilities();
ok(
  !!caps?.extensions?.["io.modelcontextprotocol/skills"],
  "declares the io.modelcontextprotocol/skills extension capability"
);

// resources/list exposes skill:// resources and the index.
const { resources } = await client.listResources();
const uris = new Set(resources.map((r) => r.uri));
ok(uris.has("skill://index.json"), "resources/list includes skill://index.json");
ok(uris.has("skill://git-workflow/SKILL.md"), "resources/list includes a skill SKILL.md");

// The well-known index enumerates skills with url + digest + verbatim frontmatter.
const indexRes = await client.readResource({ uri: "skill://index.json" });
const index = JSON.parse(indexRes.contents[0].text);
ok(Array.isArray(index.skills) && index.skills.length >= 3, "index lists >= 3 skills");
const names = index.skills.map((s) => s.frontmatter?.name);
ok(
  ["git-workflow", "pdf-processing", "refunds"].every((n) => names.includes(n)),
  "index frontmatter includes git-workflow, pdf-processing, refunds"
);
ok(
  index.skills.every((s) => /^sha256:[0-9a-f]{64}$/.test(s.digest)),
  "every index entry has a sha256 digest"
);

// The prefixed skill's name is the final path segment (acme/billing/refunds -> refunds).
const refunds = index.skills.find((s) => s.frontmatter?.name === "refunds");
ok(
  refunds?.url === "skill://acme/billing/refunds/SKILL.md",
  "prefixed skill url ends in its name (acme/billing/refunds/SKILL.md)"
);

// Integrity: the index digest matches the actual SKILL.md bytes.
const gw = index.skills.find((s) => s.frontmatter?.name === "git-workflow");
const gwMd = await client.readResource({ uri: gw.url });
const gwText = gwMd.contents[0].text;
ok(sha256(gwText) === gw.digest, "git-workflow SKILL.md content matches its index digest");
ok(gwText.includes("name: git-workflow"), "SKILL.md carries YAML frontmatter (name)");

// Supporting files are readable as siblings under the skill path.
const script = await client.readResource({
  uri: "skill://pdf-processing/scripts/extract.py",
});
ok(
  (script.contents[0]?.text ?? "").includes("def main"),
  "supporting file skill://pdf-processing/scripts/extract.py is readable"
);

console.log(`\n${failures === 0 ? "OK" : failures + " FAILED"}`);
// Close the client and let the event loop drain naturally. Calling process.exit()
// while the SSE handle is still open trips a libuv assertion on Windows, so set
// the exit code and return instead. A short unref'd timer forces exit if a
// keep-alive socket lingers (it won't keep the loop alive on its own).
process.exitCode = failures === 0 ? 0 : 1;
try {
  await client.close();
} catch {
  // ignore
}
setTimeout(() => process.exit(process.exitCode), 1000).unref();
