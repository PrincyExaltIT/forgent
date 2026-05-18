import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyFileAs, exists } from "../fs-helpers.js";

export const name = "cursor";
export const description =
  "Cursor rules: <installDir>/<name>.mdc (single file). Defaults to ~/.cursor/rules; for project rules, pass --dest .cursor/rules.";

const EXT = ".mdc";
const MAIN_SOURCE_FILE = "SKILL.md";

export function defaultInstallDir() {
  return path.join(os.homedir(), ".cursor", "rules");
}

function targetFile(installDir, skillName) {
  return path.join(installDir, `${skillName}${EXT}`);
}

export async function install({ installDir, skillName, sourceDir, force, dryRun }) {
  const sourceFile = path.join(sourceDir, MAIN_SOURCE_FILE);
  if (!(await exists(sourceFile))) {
    throw new Error(
      `cursor: source skill missing required ${MAIN_SOURCE_FILE} at ${sourceFile}`,
    );
  }
  const target = targetFile(installDir, skillName);
  if (await exists(target)) {
    if (!force) {
      throw new Error(
        `cursor: rule "${skillName}${EXT}" already exists at ${target}. ` +
          `Pass --force to overwrite, or run: forgent remove --provider cursor ${skillName}`,
      );
    }
    if (dryRun) console.log(`[dry-run] would remove existing ${target}`);
    else await fs.rm(target);
  }
  await copyFileAs(sourceFile, target, dryRun);
  return { writtenPath: target };
}

export async function remove({ installDir, skillName, dryRun }) {
  const target = targetFile(installDir, skillName);
  if (!(await exists(target))) {
    throw new Error(`cursor: no installed rule at ${target}`);
  }
  if (dryRun) {
    console.log(`[dry-run] would remove ${target}`);
    return { removedPath: target };
  }
  await fs.rm(target);
  return { removedPath: target };
}
