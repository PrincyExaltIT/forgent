import fs from "node:fs/promises";
import path from "node:path";

export async function resolveRegistryRoot(ctx) {
  if (ctx.flags.registry) {
    return path.resolve(ctx.cwd, ctx.flags.registry);
  }
  return path.join(ctx.projectRoot, "registry");
}

export async function loadRegistry(ctx) {
  const root = await resolveRegistryRoot(ctx);
  const indexPath = path.join(root, "index.json");
  let raw;
  try {
    raw = await fs.readFile(indexPath, "utf8");
  } catch (err) {
    throw new Error(`cannot read registry index at ${indexPath}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`registry index is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed.skills)) {
    throw new Error(`registry index must have a "skills" array`);
  }
  return { root, skills: parsed.skills };
}

export function findSkill(registry, name) {
  const skill = registry.skills.find((s) => s.name === name);
  if (!skill) {
    const names = registry.skills.map((s) => s.name).join(", ");
    throw new Error(`skill "${name}" not found. Available: ${names || "(none)"}`);
  }
  return skill;
}

export function skillSourceDir(registry, skill) {
  return path.join(registry.root, "skills", skill.name);
}
