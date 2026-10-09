import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveInstallDir } from "../config.js";
import { findSkill, loadRegistry, materializeSkill } from "../registry.js";
import { getProvider } from "../providers/index.js";
import {
  decodeInstallPath,
  encodeInstallPath,
  readLockfile,
  recordInstall,
  writeLockfile,
} from "../lockfile.js";
import { diffFiles, hashInstalledFiles } from "../hash-tree.js";
import { confirmScripts } from "../skill-scripts.js";
import { collectOutdated } from "./outdated.js";
import { stagedScripts } from "./add.js";

/** Every place a lock entry is installed; a 1.0 entry is located from flags, env or config, as verify does. */
async function installsOf(ctx, skillName, entry) {
  if (Array.isArray(entry.installs) && entry.installs.length > 0) return entry.installs;
  const provider = getProvider(entry.provider);
  const target = provider.targetPath(await resolveInstallDir(ctx, provider), skillName);
  return [{ provider: entry.provider, path: encodeInstallPath(ctx.cwd, target), files: entry.files || [] }];
}

function summarize(d) {
  const parts = [];
  if (d.added.length) parts.push(`${d.added.length} added`);
  if (d.changed.length) parts.push(`${d.changed.length} changed`);
  if (d.removed.length) parts.push(`${d.removed.length} removed`);
  return parts.length ? parts.join(", ") : "no file change";
}

/**
 * Bring installed skills up to the registry's version, in every place the
 * lockfile records. You own your copy: an install whose files differ from the
 * lockfile is left alone unless --force. --dry-run prints the plan only.
 */
export async function runUpdate(ctx, names) {
  const lock = await readLockfile(ctx.cwd);
  for (const n of names) {
    if (!lock.skills[n]) throw new Error(`${n} is not in forgent.lock.json: install it with forgent add`);
  }
  if (Object.keys(lock.skills).length === 0) {
    console.log("nothing installed: forgent.lock.json is empty or absent");
    return;
  }
  const registry = await loadRegistry(ctx);
  const rows = await collectOutdated(ctx, lock, registry, names.length ? names : null);

  let updated = 0;
  let refused = 0;
  for (const row of rows) {
    if (row.status !== "outdated" && row.status !== "changed") {
      console.log(`${row.skillName}: ${row.status}`);
      continue;
    }
    const entry = lock.skills[row.skillName];
    const installs = await installsOf(ctx, row.skillName, entry);

    // 1. Local edits are the user's: refuse to overwrite them without --force.
    const dirty = [];
    for (const inst of installs) {
      const target = decodeInstallPath(ctx.cwd, inst.path);
      let now;
      try {
        now = await hashInstalledFiles(target);
      } catch {
        dirty.push(`${inst.path}: missing`);
        continue;
      }
      const d = diffFiles(inst.files || [], now);
      if (!d.same) {
        const what = [
          ...d.changed.map((p) => `${p} modified`),
          ...d.removed.map((p) => `${p} deleted`),
          ...d.added.map((p) => `${p} added`),
        ];
        dirty.push(`${inst.path}: ${what.slice(0, 4).join(", ")}${what.length > 4 ? ", …" : ""}`);
      }
    }
    if (dirty.length > 0 && !ctx.flags.force) {
      console.log(`${row.skillName}: local changes, not updated (--force overwrites them)`);
      for (const line of dirty) console.log(`  ${line}`);
      refused++;
      continue;
    }

    // 2. Fetch the new version once, show what changes, then copy it into every install.
    const skill = findSkill(registry, row.skillName);
    const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), `forgent-update-${skill.name}-`));
    try {
      await materializeSkill(registry, skill, stagingDir, { strictSha256: ctx.flags.strictSha256 });
      const incoming = await hashInstalledFiles(stagingDir);
      const folderInstalls = installs.filter((i) => getProvider(i.provider).layout === "folder");
      const changes = diffFiles(folderInstalls[0]?.files || entry.files || [], incoming);
      console.log(`${row.skillName} ${row.installed} -> ${row.latest}: ${summarize(changes)}`);
      for (const p of changes.added) console.log(`  + ${p}`);
      for (const p of changes.changed) console.log(`  ~ ${p}`);
      for (const p of changes.removed) console.log(`  - ${p}`);
      if (ctx.flags.dryRun) {
        for (const inst of installs) console.log(`  [dry-run] would update ${inst.path} (${inst.provider})`);
        continue;
      }
      if (folderInstalls.length > 0 && !(await confirmScripts(ctx, skill.name, await stagedScripts(skill, stagingDir, false)))) {
        console.log(`skipped ${skill.name}: not updated`);
        continue;
      }
      for (const inst of installs) {
        const provider = getProvider(inst.provider);
        const target = decodeInstallPath(ctx.cwd, inst.path);
        const result = await provider.install({
          installDir: path.dirname(target),
          skillName: skill.name,
          sourceDir: stagingDir,
          force: true,
          dryRun: false,
        });
        recordInstall(lock, {
          skillName: skill.name,
          registry,
          skillVersion: skill.version ?? null,
          provider: provider.name,
          files: await hashInstalledFiles(result.writtenPath),
          installPath: encodeInstallPath(ctx.cwd, result.writtenPath),
        });
        console.log(`  updated ${inst.path} (${provider.name})`);
      }
      updated++;
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
  }

  if (updated > 0) await writeLockfile(ctx.cwd, lock);
  if (!ctx.flags.dryRun) console.log(`\n${updated} skill(s) updated${refused ? `, ${refused} left alone (local changes)` : ""}`);
  if (refused > 0) process.exitCode = 1;
}
