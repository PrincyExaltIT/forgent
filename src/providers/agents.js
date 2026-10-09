import os from "node:os";
import path from "node:path";
import { folderTargetPath, installFolder, removeFolder } from "./_folder.js";

export const name = "agents";
export const description =
  "Agent Skills standard folder: <installDir>/<name>/ (whole skill folder). Project (default): .agents/skills, " +
  "read by Codex, GitHub Copilot, Cursor, Gemini CLI, OpenCode, Kilo Code and most Agent Skills harnesses. " +
  "--user: ~/.agents/skills (read by Codex; check your harness for user-level skills).";
export const layout = "folder";
export const scopes = Object.freeze(["project", "user"]);
export const defaultScope = "project";

export function defaultInstallDir({ scope = defaultScope, cwd = process.cwd() } = {}) {
  return scope === "user"
    ? path.join(os.homedir(), ".agents", "skills")
    : path.join(cwd, ".agents", "skills");
}

export function targetPath(installDir, skillName) {
  return folderTargetPath(installDir, skillName);
}

export async function install(args) {
  return installFolder(name, args);
}

export async function remove(args) {
  return removeFolder(name, args);
}
