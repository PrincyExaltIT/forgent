import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const BIN = path.join(REPO_ROOT, "bin", "forgent.js");
export const FIXTURE_REGISTRY = path.join(REPO_ROOT, "test", "fixtures", "registry");

export async function mkTmp(prefix = "forgent-test-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function rmTmp(dir) {
  if (!dir) return;
  await fs.rm(dir, { recursive: true, force: true });
}

export async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readText(p) {
  return fs.readFile(p, "utf8");
}

export async function writeText(p, content) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
}

/**
 * Build a fake registry under `root` with a single skill folder.
 *
 * `filesOverride` lets security tests inject any `files[]` shape (including
 * malicious `path` values). When supplied, source files are NOT materialized —
 * the test asserts the CLI rejects before fetching.
 *
 * `manifestOverride` replaces the manifest object entirely (escape hatch for
 * validation tests that need shapes the default builder can't express).
 */
export async function seedRegistry(
  root,
  {
    skillName = "demo",
    body = "# Demo\nhello\n",
    filesOverride = null,
    manifestOverride = null,
  } = {},
) {
  const manifest = manifestOverride ?? {
    name: "test",
    version: "0.0.0",
    items: [
      {
        name: skillName,
        description: `Test skill ${skillName}`,
        files: filesOverride ?? [{ path: "SKILL.md", type: "skill:main" }],
      },
    ],
  };
  await writeText(path.join(root, "registry.json"), JSON.stringify(manifest, null, 2));
  if (!manifestOverride && !filesOverride) {
    await writeText(
      path.join(root, "skills", skillName, "SKILL.md"),
      `---\nname: ${skillName}\ndescription: Test skill ${skillName}\n---\n\n${body}`,
    );
  }
  return { skillName };
}
