import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONFIG_FILENAME = "skills.config.json";

export function defaultInstallDir() {
  return path.join(os.homedir(), ".claude", "skills");
}

export async function loadConfig(cwd) {
  const file = path.join(cwd, CONFIG_FILENAME);
  try {
    const raw = await fs.readFile(file, "utf8");
    return { file, data: JSON.parse(raw) };
  } catch (err) {
    if (err.code === "ENOENT") return { file, data: null };
    throw new Error(`failed to read ${CONFIG_FILENAME}: ${err.message}`);
  }
}

export async function writeConfig(cwd, data) {
  const file = path.join(cwd, CONFIG_FILENAME);
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  return file;
}

export async function resolveInstallDir(ctx) {
  if (ctx.flags.dest) return path.resolve(ctx.cwd, ctx.flags.dest);
  const { data } = await loadConfig(ctx.cwd);
  if (data && typeof data.installDir === "string") {
    return path.resolve(ctx.cwd, data.installDir);
  }
  return defaultInstallDir();
}
