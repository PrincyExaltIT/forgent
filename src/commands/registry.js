import { loadConfig, writeConfig } from "../config.js";
import { assertSafeName } from "../path-safety.js";
import { DEFAULT_REGISTRY } from "../registry.js";

const VERBS = ["list", "add", "remove", "set-default"];

function readState(data) {
  const base = data && typeof data === "object" ? data : {};
  const registries = Array.isArray(base.registries)
    ? base.registries.filter(
        (r) =>
          r && typeof r === "object" &&
          typeof r.name === "string" &&
          typeof r.url === "string",
      )
    : [];
  const defaultRegistry =
    typeof base.defaultRegistry === "string" ? base.defaultRegistry : null;
  return { base, registries, defaultRegistry };
}

function buildNextConfig({ base, registries, defaultRegistry }) {
  const next = { ...base, registries };
  if (defaultRegistry) {
    next.defaultRegistry = defaultRegistry;
  } else {
    delete next.defaultRegistry;
  }
  return next;
}

async function listRegistries(ctx) {
  const { data } = await loadConfig(ctx.cwd);
  const { registries, defaultRegistry } = readState(data);
  if (registries.length === 0) {
    console.log(
      `no registries configured; using built-in default ${DEFAULT_REGISTRY}`,
    );
    return;
  }
  const nameWidth = Math.max(...registries.map((r) => r.name.length));
  for (const r of registries) {
    const marker = r.name === defaultRegistry ? "*" : " ";
    console.log(`${marker} ${r.name.padEnd(nameWidth, " ")}  ${r.url}`);
  }
}

async function addRegistry(ctx, positional) {
  const [name, url] = positional;
  if (!name || !url) {
    throw new Error(
      "registry add: usage `forgent registry add <name> <url-or-path> [--default]`",
    );
  }
  assertSafeName(name, "registry name");
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("registry add: <url-or-path> must be a non-empty string");
  }

  const { data } = await loadConfig(ctx.cwd);
  const state = readState(data);
  const existingIdx = state.registries.findIndex((r) => r.name === name);
  if (existingIdx !== -1 && !ctx.flags.force) {
    throw new Error(
      `registry add: name "${name}" already configured. Re-run with --force to overwrite.`,
    );
  }

  const entry = { name, url };
  let nextRegistries;
  if (existingIdx === -1) {
    nextRegistries = [...state.registries, entry];
  } else {
    nextRegistries = state.registries.slice();
    nextRegistries[existingIdx] = entry;
  }

  // --default flag (parsed by bin/forgent.js into ctx.flags.makeDefault)
  let nextDefault = state.defaultRegistry;
  if (ctx.flags.makeDefault) nextDefault = name;

  if (ctx.flags.dryRun) {
    console.log(`[dry-run] would write forgent.config.json with registry "${name}" -> ${url}`);
    return;
  }

  const next = buildNextConfig({
    base: state.base,
    registries: nextRegistries,
    defaultRegistry: nextDefault,
  });
  const written = await writeConfig(ctx.cwd, next);
  const verb = existingIdx === -1 ? "added" : "updated";
  console.log(`${verb} registry "${name}" -> ${url}`);
  if (ctx.flags.makeDefault) console.log(`set "${name}" as default`);
  console.log(`wrote ${written}`);
}

async function removeRegistry(ctx, positional) {
  const [name] = positional;
  if (!name) {
    throw new Error("registry remove: usage `forgent registry remove <name>`");
  }
  assertSafeName(name, "registry name");

  const { data } = await loadConfig(ctx.cwd);
  const state = readState(data);
  const existingIdx = state.registries.findIndex((r) => r.name === name);
  if (existingIdx === -1) {
    throw new Error(`registry remove: "${name}" is not configured`);
  }

  const nextRegistries = state.registries.filter((r) => r.name !== name);
  const nextDefault = state.defaultRegistry === name ? null : state.defaultRegistry;

  if (ctx.flags.dryRun) {
    console.log(`[dry-run] would remove registry "${name}"`);
    return;
  }

  const next = buildNextConfig({
    base: state.base,
    registries: nextRegistries,
    defaultRegistry: nextDefault,
  });
  const written = await writeConfig(ctx.cwd, next);
  console.log(`removed registry "${name}"`);
  if (state.defaultRegistry === name) {
    console.log(`no default registry set; built-in default will be used unless overridden`);
  }
  console.log(`wrote ${written}`);
}

async function setDefaultRegistry(ctx, positional) {
  const [name] = positional;
  if (!name) {
    throw new Error(
      "registry set-default: usage `forgent registry set-default <name>`",
    );
  }
  assertSafeName(name, "registry name");

  const { data } = await loadConfig(ctx.cwd);
  const state = readState(data);
  if (!state.registries.some((r) => r.name === name)) {
    const available = state.registries.map((r) => r.name).join(", ") || "(none)";
    throw new Error(
      `registry set-default: "${name}" is not configured. Available: ${available}`,
    );
  }

  if (ctx.flags.dryRun) {
    console.log(`[dry-run] would set default registry to "${name}"`);
    return;
  }

  const next = buildNextConfig({
    base: state.base,
    registries: state.registries,
    defaultRegistry: name,
  });
  const written = await writeConfig(ctx.cwd, next);
  console.log(`default registry set to "${name}"`);
  console.log(`wrote ${written}`);
}

export async function runRegistry(ctx, positional) {
  const [verb, ...rest] = positional;
  if (!verb) {
    throw new Error(
      `\`forgent registry\` needs a verb: ${VERBS.join(" | ")}`,
    );
  }
  switch (verb) {
    case "list":
      return listRegistries(ctx);
    case "add":
      return addRegistry(ctx, rest);
    case "remove":
      return removeRegistry(ctx, rest);
    case "set-default":
      return setDefaultRegistry(ctx, rest);
    default:
      throw new Error(
        `unknown \`forgent registry\` verb "${verb}". Expected: ${VERBS.join(" | ")}`,
      );
  }
}
