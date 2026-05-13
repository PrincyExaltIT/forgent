import fs from "node:fs/promises";
import path from "node:path";
import { findSkill, loadRegistry, skillSourceDir } from "../registry.js";

async function walk(root) {
  const out = [];
  async function visit(dir, rel) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(dir, entry.name);
      const relNext = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(next, relNext);
      else out.push(relNext);
    }
  }
  await visit(root, "");
  return out.sort();
}

export async function runInfo(ctx, name) {
  const registry = await loadRegistry(ctx);
  const skill = findSkill(registry, name);
  const sourceDir = skillSourceDir(registry, skill);

  console.log(`name        ${skill.name}`);
  console.log(`description ${skill.description || ""}`);
  if (skill.tags?.length) console.log(`tags        ${skill.tags.join(", ")}`);
  console.log(`source      ${sourceDir}`);

  let files;
  try {
    files = await walk(sourceDir);
  } catch (err) {
    throw new Error(`skill source missing on disk: ${err.message}`);
  }
  console.log("files:");
  for (const f of files) console.log(`  ${f}`);
}
