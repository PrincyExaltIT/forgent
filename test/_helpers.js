import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const BIN = path.join(REPO_ROOT, "bin", "forgent.js");

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

/** Build a fake registry under `root` with a single skill folder. */
export async function seedRegistry(
  root,
  { skillName = "demo", body = "# Demo\nhello\n" } = {},
) {
  const manifest = {
    name: "test",
    items: [
      {
        name: skillName,
        description: `Test skill ${skillName}`,
        files: [{ path: "SKILL.md", type: "skill:main" }],
      },
    ],
  };
  await writeText(path.join(root, "registry.json"), JSON.stringify(manifest, null, 2));
  await writeText(
    path.join(root, "skills", skillName, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: Test skill ${skillName}\n---\n\n${body}`,
  );
  return { skillName };
}
