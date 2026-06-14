import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sha256 } from "./digest.js";
import { ArchiveFile, tarGz, zip } from "./archive.js";
import {
  INDEX_URI,
  SKILLS,
  Skill,
  skillMd,
  skillUri,
  fileUri,
  archiveUri,
} from "./skills.js";

// Normalize a URI the way the SDK does when routing resources/read.
const norm = (uri: string): string => new URL(uri).toString();

// The skill directory's files, with SKILL.md at the archive root.
const archiveFiles = (skill: Skill): ArchiveFile[] => [
  { path: "SKILL.md", content: Buffer.from(skillMd(skill), "utf-8") },
  ...skill.files.map((f) => ({ path: f.path, content: Buffer.from(f.text, "utf-8") })),
];

// Register one archive form of a skill as a blob resource and return its index entry.
const registerArchive = (
  server: McpServer,
  skill: Skill,
  ext: "tar.gz" | "zip",
  mimeType: string,
  bytes: Buffer
): object => {
  const uri = norm(archiveUri(skill, ext));
  const blob = bytes.toString("base64");
  server.registerResource(
    `${skill.frontmatter.name}.${ext}`,
    uri,
    {
      title: `${skill.frontmatter.name} (${ext})`,
      description: `Packed archive of the ${skill.frontmatter.name} skill directory.`,
      mimeType,
    },
    async (u) => ({ contents: [{ uri: u.toString(), mimeType, blob }] })
  );
  return { url: archiveUri(skill, ext), mimeType, digest: sha256(bytes) };
};

/**
 * Register skills per SEP-2640: every file in a skill directory is an MCP
 * resource under `skill://`, and a well-known `skill://index.json` enumerates
 * them. No new methods or schema — just the base Resources primitive.
 */
export const registerSkills = (server: McpServer): void => {
  const indexEntries: object[] = [];

  for (const skill of SKILLS) {
    const md = skillMd(skill);
    const uri = norm(skillUri(skill));

    // The skill's SKILL.md. name/description come from the frontmatter; the full
    // frontmatter is also exposed via _meta under the reserved prefix.
    server.registerResource(
      skill.frontmatter.name,
      uri,
      {
        title: skill.frontmatter.name,
        description: skill.frontmatter.description,
        mimeType: "text/markdown",
        _meta: { "io.modelcontextprotocol.skills/frontmatter": skill.frontmatter },
      },
      async (u) => ({
        contents: [{ uri: u.toString(), mimeType: "text/markdown", text: md }],
      })
    );

    // Supporting files (siblings under the same skill path).
    for (const file of skill.files) {
      const fUri = norm(fileUri(skill, file));
      server.registerResource(
        file.path,
        fUri,
        {
          title: `${skill.frontmatter.name}/${file.path}`,
          description: `Supporting file for the ${skill.frontmatter.name} skill.`,
          mimeType: file.mimeType,
        },
        async (u) => ({
          contents: [{ uri: u.toString(), mimeType: file.mimeType, text: file.text }],
        })
      );
    }

    // Packed archive forms (.tar.gz + .zip) of the whole skill directory.
    const files = archiveFiles(skill);
    const archives = [
      registerArchive(server, skill, "tar.gz", "application/gzip", tarGz(files)),
      registerArchive(server, skill, "zip", "application/zip", zip(files)),
    ];

    // Index entry: url + digest (sha256 of SKILL.md) + verbatim frontmatter + archives.
    indexEntries.push({
      url: skillUri(skill),
      digest: sha256(md),
      frontmatter: skill.frontmatter,
      archives,
    });
  }

  // The well-known enumeration resource.
  const indexJson = JSON.stringify({ skills: indexEntries }, null, 2);
  server.registerResource(
    "index.json",
    norm(INDEX_URI),
    {
      title: "Skills index",
      description: "Enumerates the skills this server serves (SEP-2640).",
      mimeType: "application/json",
    },
    async (u) => ({
      contents: [{ uri: u.toString(), mimeType: "application/json", text: indexJson }],
    })
  );
};

/** Exposed for tests: the skills served, keyed by SKILL.md URI. */
export const skillByUri = (): Map<string, Skill> =>
  new Map(SKILLS.map((s) => [norm(skillUri(s)), s]));
