import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyFileAs, exists } from "../fs-helpers.js";
import { assertSafeName } from "../path-safety.js";

export const name = "copilot";
export const description =
  "GitHub Copilot prompts: <installDir>/<name>.prompt.md (single file). Defaults to VS Code user prompts dir.";

const EXT = ".prompt.md";
const MAIN_SOURCE_FILE = "SKILL.md";
const VARIANT_FILE = (skillName) => `${skillName}.prompt.md`;

export function defaultInstallDir() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Code", "User", "prompts");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Code",
      "User",
      "prompts",
    );
  }
  return path.join(os.homedir(), ".config", "Code", "User", "prompts");
}

function targetFile(installDir, skillName) {
  return path.join(installDir, `${skillName}${EXT}`);
}

export async function install({ installDir, skillName, sourceDir, force, dryRun }) {
  assertSafeName(skillName, "skillName");
  const variantPath = path.join(sourceDir, VARIANT_FILE(skillName));
  const fallbackPath = path.join(sourceDir, MAIN_SOURCE_FILE);
  let sourceFile;
  if (await exists(variantPath)) sourceFile = variantPath;
  else if (await exists(fallbackPath)) sourceFile = fallbackPath;
  else
    throw new Error(
      `copilot: no ${MAIN_SOURCE_FILE} or ${VARIANT_FILE(skillName)} found in ${sourceDir}`,
    );
  const target = targetFile(installDir, skillName);
  if (await exists(target)) {
    if (!force) {
      throw new Error(
        `copilot: prompt "${skillName}" already exists at ${target}. ` +
          `Pass --force to overwrite, or run: forgent remove --provider copilot ${skillName}`,
      );
    }
    if (dryRun) console.log(`[dry-run] would remove existing ${target}`);
    else await fs.rm(target);
  }
  await copyFileAs(sourceFile, target, dryRun);
  return { writtenPath: target };
}

export async function remove({ installDir, skillName, dryRun }) {
  assertSafeName(skillName, "skillName");
  const target = targetFile(installDir, skillName);
  if (!(await exists(target))) {
    throw new Error(`copilot: no installed prompt at ${target}`);
  }
  if (dryRun) {
    console.log(`[dry-run] would remove ${target}`);
    return { removedPath: target };
  }
  await fs.rm(target);
  return { removedPath: target };
}
