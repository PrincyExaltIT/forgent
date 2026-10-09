import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertDirsFitProviders, resolveInstallDir, resolveProviderName } from "../config.js";
import { findSkillVersioned, loadRegistry, materializeSkill, skillFiles } from "../registry.js";
import { getProviders } from "../providers/index.js";
import { assertSemver } from "../registry-schema.js";
import { encodeInstallPath, readLockfile, recordInstall, writeLockfile } from "../lockfile.js";
import { hashInstalledFiles, listDirRecursive } from "../hash-tree.js";
import { confirmScripts, scriptPaths } from "../skill-scripts.js";

export function parseSkillRef(input) {
  const at = input.lastIndexOf("@");
  if (at <= 0) return { name: input, version: null };
  const name = input.slice(0, at);
  const version = input.slice(at + 1);
  assertSemver(version, `skill version pin in "${input}"`);
  return { name, version };
}

/** Scripts of a fetched skill: from the staged files when they exist, from the manifest on --dry-run. */
export async function stagedScripts(skill, stagingDir, dryRun) {
  if (!dryRun) {
    try {
      return scriptPaths(await listDirRecursive(stagingDir));
    } catch {
      // fall back to the manifest
    }
  }
  return scriptPaths(skillFiles(skill));
}

// Files a single-file provider can install: SKILL.md or its own pre-rendered variant.
function singleFileSources(skillName) {
  return new Set(["SKILL.md", `${skillName}.codex.md`, `${skillName}.prompt.md`]);
}

/**
 * A single-file provider copies one file. When the skill ships more (scripts,
 * references, assets), say so instead of installing a skill that silently
 * lacks half of itself.
 */
export function droppedBySingleFile(provider, skill) {
  if (provider.layout !== "file") return [];
  const keep = singleFileSources(skill.name);
  return (skill.files || [])
    .map((f) => (typeof f === "string" ? f : f.path))
    .filter((p) => p && !keep.has(p));
}

export async function runAdd(ctx, names) {
  const providers = getProviders(await resolveProviderName(ctx));
  await assertDirsFitProviders(ctx, providers);
  const registry = await loadRegistry(ctx);
  const targets = [];
  for (const provider of providers) {
    const installDir = await resolveInstallDir(ctx, provider);
    if (!ctx.flags.dryRun) await fs.mkdir(installDir, { recursive: true });
    targets.push({ provider, installDir });
  }

  const lock = ctx.flags.dryRun ? null : await readLockfile(ctx.cwd);
  let lockDirty = false;

  for (const raw of names) {
    const ref = parseSkillRef(raw);
    const skill = findSkillVersioned(registry, ref.name, ref.version);
    const stagingDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `forgent-${skill.name}-`),
    );
    try {
      // Fetched and checked once, then copied into every target.
      await materializeSkill(registry, skill, stagingDir, {
        dryRun: ctx.flags.dryRun,
        strictSha256: ctx.flags.strictSha256,
      });
      // Scripts only reach the machine through a folder provider; ask before that happens.
      if (targets.some((t) => t.provider.layout === "folder")) {
        const scripts = await stagedScripts(skill, stagingDir, ctx.flags.dryRun);
        if (!(await confirmScripts(ctx, skill.name, scripts))) {
          console.log(`skipped ${skill.name}: not installed`);
          continue;
        }
      }
      for (const { provider, installDir } of targets) {
        const dropped = droppedBySingleFile(provider, skill);
        if (dropped.length > 0) {
          console.error(
            `warning: ${provider.name} installs a single file; ${skill.name} also ships ${dropped.length} other file(s) ` +
              `(${dropped.slice(0, 3).join(", ")}${dropped.length > 3 ? ", …" : ""}) that will NOT be installed. ` +
              `Use --provider agents to install the whole skill folder.`,
          );
        }
        const result = await provider.install({
          installDir,
          skillName: skill.name,
          sourceDir: stagingDir,
          force: ctx.flags.force,
          dryRun: ctx.flags.dryRun,
        });
        const verb = ctx.flags.dryRun ? "[dry-run] would add" : "added";
        console.log(`${verb} ${skill.name} (${provider.name}) -> ${result.writtenPath}`);
        if (!ctx.flags.dryRun) {
          const files = await hashInstalledFiles(result.writtenPath);
          recordInstall(lock, {
            skillName: skill.name,
            registry,
            skillVersion: skill.version ?? null,
            provider: provider.name,
            files,
            installPath: encodeInstallPath(ctx.cwd, result.writtenPath),
          });
          lockDirty = true;
        }
      }
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
  }

  if (lockDirty) {
    await writeLockfile(ctx.cwd, lock);
  }
}
