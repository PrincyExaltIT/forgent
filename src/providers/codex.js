import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyFileAs, exists } from "../fs-helpers.js";

export const name = "codex";
export const description =
  "OpenAI Codex CLI: <installDir>/<name>.md (single file). NOTE: Codex has no native named-skill loader; files are placed for manual inclusion in AGENTS.md.";

const EXT = ".md";
const MAIN_SOURCE_FILE = "SKILL.md";

export function defaultInstallDir() {
  return path.join(os.homedir(), ".codex", "skills");
}

function targetFile(installDir, skillName) {
  return path.join(installDir, `${skillName}${EXT}`);
}

export async function install({ installDir, skillName, sourceDir, force, dryRun }) {
  const sourceFile = path.join(sourceDir, MAIN_SOURCE_FILE);
  if (!(await exists(sourceFile))) {
    throw new Error(
      `codex: source skill missing required ${MAIN_SOURCE_FILE} at ${sourceFile}`,
    );
  }
  const target = targetFile(installDir, skillName);
  if (await exists(target)) {
    if (!force) {
      throw new Error(
        `codex: file "${skillName}${EXT}" already exists at ${target}. ` +
          `Pass --force to overwrite, or run: skills remove --provider codex ${skillName}`,
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
    throw new Error(`codex: no installed file at ${target}`);
  }
  if (dryRun) {
    console.log(`[dry-run] would remove ${target}`);
    return { removedPath: target };
  }
  await fs.rm(target);
  return { removedPath: target };
}
