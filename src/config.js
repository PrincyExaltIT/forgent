import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_FILENAME = "forgent.config.json";

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

export async function resolveProviderName(ctx) {
  if (ctx.flags.provider) return ctx.flags.provider;
  if (process.env.FORGENT_PROVIDER) return process.env.FORGENT_PROVIDER;
  const { data } = await loadConfig(ctx.cwd);
  if (data && typeof data.provider === "string") return data.provider;
  return null;
}

export async function resolveInstallDir(ctx, provider) {
  if (ctx.flags.dest) return path.resolve(ctx.cwd, ctx.flags.dest);
  if (process.env.FORGENT_INSTALL_DIR) {
    return path.resolve(ctx.cwd, process.env.FORGENT_INSTALL_DIR);
  }
  const { data } = await loadConfig(ctx.cwd);
  if (data && typeof data.installDir === "string") {
    return path.resolve(ctx.cwd, data.installDir);
  }
  return provider.defaultInstallDir();
}
