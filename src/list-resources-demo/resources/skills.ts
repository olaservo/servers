// The skills this server serves, per SEP-2640 (Skills Extension). Each skill is
// a directory conforming to the Agent Skills spec (a SKILL.md with at least
// `name` and `description` in YAML frontmatter, plus optional supporting files),
// exposed under the `skill://` scheme as individual resources.
//
// The set mirrors the examples in SEP-2640 so this doubles as a reference server.

export interface SkillFile {
  /** Path relative to the skill root, e.g. "SKILL.md" or "references/FORMS.md". */
  path: string;
  mimeType: string;
  text: string;
}

export interface Skill {
  /**
   * The `skill://` path locating the skill. Its final segment is the skill name
   * and MUST equal `frontmatter.name`; any preceding segments are an
   * organizational prefix (e.g. "acme/billing/refunds").
   */
  skillPath: string;
  /** Verbatim SKILL.md frontmatter, rendered as an object. */
  frontmatter: { name: string; description: string } & Record<string, unknown>;
  /** SKILL.md body (markdown after the frontmatter block). */
  body: string;
  /** Supporting files (references, scripts, examples). */
  files: SkillFile[];
}

// Minimal YAML emitter for the frontmatter fields used here (strings + one level
// of nested objects). Keeps SKILL.md frontmatter and the index in lockstep.
const toYaml = (obj: Record<string, unknown>, indent = 0): string => {
  const pad = "  ".repeat(indent);
  return Object.entries(obj)
    .map(([k, v]) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? `${pad}${k}:\n${toYaml(v as Record<string, unknown>, indent + 1)}`
        : `${pad}${k}: ${v}`
    )
    .join("\n");
};

/** The full SKILL.md text for a skill: frontmatter block + body. */
export const skillMd = (skill: Skill): string =>
  `---\n${toYaml(skill.frontmatter)}\n---\n\n${skill.body}`;

export const SKILLS: Skill[] = [
  {
    skillPath: "git-workflow",
    frontmatter: {
      name: "git-workflow",
      description:
        "Follow this team's Git conventions for branching and commits",
    },
    body:
      "# Git workflow\n\n" +
      "Branch from `main`; one logical change per commit. See " +
      "[references/COMMITS.md](references/COMMITS.md) for the commit format.\n",
    files: [
      {
        path: "references/COMMITS.md",
        mimeType: "text/markdown",
        text: "# Commit format\n\n`type(scope): summary`, imperative mood, <=72 chars.\n",
      },
    ],
  },
  {
    skillPath: "pdf-processing",
    frontmatter: {
      name: "pdf-processing",
      description: "Extract, fill, and assemble PDF documents",
      metadata: { version: "2.1.0" },
    },
    body:
      "# PDF processing\n\n" +
      "Use `scripts/extract.py` to pull text. Form fields are documented in " +
      "[references/FORMS.md](references/FORMS.md).\n",
    files: [
      {
        path: "references/FORMS.md",
        mimeType: "text/markdown",
        text: "# Form fields\n\nAcroForm field names map to JSON keys 1:1.\n",
      },
      {
        path: "scripts/extract.py",
        mimeType: "text/x-python",
        text: 'import sys\n\n\ndef main() -> None:\n    print(f"extract {sys.argv[1:]}")\n\n\nif __name__ == "__main__":\n    main()\n',
      },
    ],
  },
  {
    skillPath: "acme/billing/refunds",
    frontmatter: {
      name: "refunds",
      description: "Process customer refund requests per company policy",
      license: "Apache-2.0",
    },
    body:
      "# Refunds\n\n" +
      "Verify eligibility, then reply using " +
      "[examples/email.md](examples/email.md).\n",
    files: [
      {
        path: "examples/email.md",
        mimeType: "text/markdown",
        text: "Subject: Your refund\n\nHi {{name}}, your refund of {{amount}} is approved.\n",
      },
    ],
  },
];

// A deliberately large skill: many sized reference files in one directory, so the
// listing comparison (ResourceContents[] vs resources/directory/read) has
// meaningful numbers. See COMPARISON.md.
const REF_COUNT = 60;
const para =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor. ".repeat(
    20
  );
const bigSkill = (): Skill => ({
  skillPath: "data-pipeline",
  frontmatter: {
    name: "data-pipeline",
    description: "Build and run ETL pipelines",
    metadata: { version: "0.3.0" },
  },
  body: "# data-pipeline\n\nPick the matching source adapter from references/.\n",
  files: [
    ...Array.from({ length: REF_COUNT }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return {
        path: `references/ref-${n}.md`,
        mimeType: "text/markdown",
        text: `# reference ${n}\n\n${para}`,
      };
    }),
    { path: "scripts/run.py", mimeType: "text/x-python", text: "print('run')\n" },
  ],
});

SKILLS.push(bigSkill());

/** The URI of a skill's SKILL.md, e.g. `skill://acme/billing/refunds/SKILL.md`. */
export const skillUri = (skill: Skill): string =>
  `skill://${skill.skillPath}/SKILL.md`;

/** The URI of a supporting file within a skill. */
export const fileUri = (skill: Skill, file: SkillFile): string =>
  `skill://${skill.skillPath}/${file.path}`;

/** The URI of a packed archive form of a skill, e.g. `skill://git-workflow.tar.gz`. */
export const archiveUri = (skill: Skill, ext: "tar.gz" | "zip"): string =>
  `skill://${skill.skillPath}.${ext}`;

/** The reserved well-known index URI. */
export const INDEX_URI = "skill://index.json";

/** The skills extension identifier (SEP-2640 / SEP-2133 capability). */
export const SKILLS_EXTENSION = "io.modelcontextprotocol/skills";
