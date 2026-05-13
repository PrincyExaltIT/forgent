import fs from "node:fs/promises";
import path from "node:path";
import { resolveInstallDir } from "../config.js";
import { findSkill, loadRegistry, skillSourceDir } from "../registry.js";

async function copyDir(src, dest, dryRun) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  if (!dryRun) await fs.mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to, dryRun);
    } else if (entry.isFile()) {
      if (dryRun) {
        console.log(`[dry-run] copy ${from} -> ${to}`);
      } else {
        await fs.copyFile(from, to);
      }
    }
  }
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function addOne(ctx, registry, name, installDir) {
  const skill = findSkill(registry, name);
  const source = skillSourceDir(registry, skill);
  const target = path.join(installDir, skill.name);

  if (await exists(target)) {
    if (!ctx.flags.force) {
      throw new Error(
        `skill "${skill.name}" already exists at ${target}. ` +
          `Pass --force to overwrite, or remove it first with: skills remove ${skill.name}`,
      );
    }
    if (!ctx.flags.dryRun) {
      await fs.rm(target, { recursive: true, force: true });
    } else {
      console.log(`[dry-run] would remove existing ${target}`);
    }
  }

  if (ctx.flags.dryRun) {
    console.log(`[dry-run] would copy ${source} -> ${target}`);
    await copyDir(source, target, true);
    return;
  }
  await copyDir(source, target, false);
  console.log(`added ${skill.name} -> ${target}`);
}

export async function runAdd(ctx, names) {
  const registry = await loadRegistry(ctx);
  const installDir = await resolveInstallDir(ctx);
  if (!ctx.flags.dryRun) {
    await fs.mkdir(installDir, { recursive: true });
  }
  for (const name of names) {
    await addOne(ctx, registry, name, installDir);
  }
}
