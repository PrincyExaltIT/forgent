import os from "node:os";
import path from "node:path";
import { folderTargetPath, installFolder, removeFolder } from "./_folder.js";

export const name = "claude";
export const description =
  "Claude Code skills: <installDir>/<name>/ (whole skill folder). User (default): ~/.claude/skills; " +
  "--project: .claude/skills, also read by Continue.";
export const layout = "folder";
export const scopes = Object.freeze(["user", "project"]);
export const defaultScope = "user";

export function defaultInstallDir({ scope = defaultScope, cwd = process.cwd() } = {}) {
  return scope === "project"
    ? path.join(cwd, ".claude", "skills")
    : path.join(os.homedir(), ".claude", "skills");
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
