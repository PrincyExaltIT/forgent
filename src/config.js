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

/**
 * Read the configured registries from forgent.config.json.
 *
 * Returns { registries, defaultRegistry } where registries is always an array
 * (possibly empty) of { name, url } objects and defaultRegistry is the name
 * string or null. Tolerates a config that lacks both fields (treats as zero
 * configured) so single-registry users keep working unchanged.
 */
export async function loadRegistries(cwd) {
  const { data } = await loadConfig(cwd);
  if (!data || typeof data !== "object") {
    return { registries: [], defaultRegistry: null };
  }
  const registries = Array.isArray(data.registries)
    ? data.registries.filter(
        (r) => r && typeof r === "object" && typeof r.name === "string" && typeof r.url === "string",
      )
    : [];
  const defaultRegistry =
    typeof data.defaultRegistry === "string" ? data.defaultRegistry : null;
  return { registries, defaultRegistry };
}

export function findRegistryByName(registries, name) {
  if (!name || typeof name !== "string") return null;
  return registries.find((r) => r.name === name) || null;
}

export async function resolveProviderName(ctx) {
  if (ctx.flags.provider) return ctx.flags.provider;
  if (process.env.FORGENT_PROVIDER) return process.env.FORGENT_PROVIDER;
  const { data } = await loadConfig(ctx.cwd);
  if (data && typeof data.provider === "string") return data.provider;
  return null;
}

/**
 * Scope of an install: "project" (inside the repo, committed for the team) or
 * "user" (in the home directory). --project / --user win over the config's
 * `scope`; otherwise each provider has its own default (agents: project,
 * claude and the legacy single-file providers: user).
 */
export async function resolveScope(ctx, provider) {
  let scope = ctx.flags.scope ?? null;
  if (!scope) {
    const { data } = await loadConfig(ctx.cwd);
    if (data && (data.scope === "project" || data.scope === "user")) scope = data.scope;
  }
  scope = scope ?? provider.defaultScope ?? "user";
  if (Array.isArray(provider.scopes) && !provider.scopes.includes(scope)) {
    throw new Error(
      `${provider.name}: --${scope} is not supported by this legacy single-file provider. ` +
        `Use --provider agents to install the skill folder in the project (.agents/skills), or --dest <dir>.`,
    );
  }
  return scope;
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
  const scope = await resolveScope(ctx, provider);
  return provider.defaultInstallDir({ scope, cwd: ctx.cwd });
}

/**
 * Several providers at once ("agents,claude") need one directory each: an
 * explicit directory (--dest, FORGENT_INSTALL_DIR, config installDir) would put
 * them all in the same place, so it only works with a single provider.
 */
export async function assertDirsFitProviders(ctx, providers) {
  if (providers.length < 2) return;
  const { data } = await loadConfig(ctx.cwd);
  const explicit = ctx.flags.dest
    ? "--dest"
    : process.env.FORGENT_INSTALL_DIR
      ? "FORGENT_INSTALL_DIR"
      : data && typeof data.installDir === "string"
        ? "forgent.config.json installDir"
        : null;
  if (explicit) {
    throw new Error(
      `${explicit} sets one directory, but ${providers.length} providers were given (${providers.map((p) => p.name).join(", ")}). ` +
        `Use --project or --user to let each provider pick its own folder, or pass a single --provider.`,
    );
  }
}
