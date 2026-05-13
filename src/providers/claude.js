import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyDir, exists } from "../fs-helpers.js";

export const name = "claude";
export const description =
  "Claude Code skills: <installDir>/<name>/SKILL.md (one folder per skill, full source dir copied)";

export function defaultInstallDir() {
  return path.join(os.homedir(), ".claude", "skills");
}

export async function install({ installDir, skillName, sourceDir, force, dryRun }) {
  const target = path.join(installDir, skillName);
  if (await exists(target)) {
    if (!force) {
      throw new Error(
        `claude: skill "${skillName}" already exists at ${target}. ` +
          `Pass --force to overwrite, or run: skills remove --provider claude ${skillName}`,
      );
    }
    if (dryRun) console.log(`[dry-run] would remove existing ${target}`);
    else await fs.rm(target, { recursive: true, force: true });
  }
  await copyDir(sourceDir, target, dryRun);
  return { writtenPath: target };
}

export async function remove({ installDir, skillName, dryRun }) {
  const target = path.join(installDir, skillName);
  if (!(await exists(target))) {
    throw new Error(`claude: no installed skill at ${target}`);
  }
  if (dryRun) {
    console.log(`[dry-run] would remove ${target}`);
    return { removedPath: target };
  }
  await fs.rm(target, { recursive: true, force: true });
  return { removedPath: target };
}
