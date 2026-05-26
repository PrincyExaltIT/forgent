import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveInstallDir, resolveProviderName } from "../config.js";
import { findSkillVersioned, loadRegistry, materializeSkill } from "../registry.js";
import { getProvider } from "../providers/index.js";
import { assertSemver } from "../registry-schema.js";
import { readLockfile, recordInstall, writeLockfile } from "../lockfile.js";

export function parseSkillRef(input) {
  const at = input.lastIndexOf("@");
  if (at <= 0) return { name: input, version: null };
  const name = input.slice(0, at);
  const version = input.slice(at + 1);
  assertSemver(version, `skill version pin in "${input}"`);
  return { name, version };
}

async function sha256OfFile(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function listDirRecursive(dir) {
  const out = [];
  async function visit(d, rel) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(d, entry.name);
      const relNext = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(next, relNext);
      else if (entry.isFile()) out.push(relNext);
    }
  }
  await visit(dir, "");
  return out.sort();
}

async function hashInstalledFiles(writtenPath) {
  const stat = await fs.stat(writtenPath);
  if (stat.isDirectory()) {
    const rels = await listDirRecursive(writtenPath);
    const out = [];
    for (const rel of rels) {
      out.push({ path: rel, sha256: await sha256OfFile(path.join(writtenPath, rel)) });
    }
    return out;
  }
  return [{ path: path.basename(writtenPath), sha256: await sha256OfFile(writtenPath) }];
}

export async function runAdd(ctx, names) {
  const providerName = await resolveProviderName(ctx);
  const provider = getProvider(providerName);
  const registry = await loadRegistry(ctx);
  const installDir = await resolveInstallDir(ctx, provider);
  if (!ctx.flags.dryRun) {
    await fs.mkdir(installDir, { recursive: true });
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
      await materializeSkill(registry, skill, stagingDir, {
        dryRun: ctx.flags.dryRun,
        strictSha256: ctx.flags.strictSha256,
      });
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
        });
        lockDirty = true;
      }
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
  }

  if (lockDirty) {
    await writeLockfile(ctx.cwd, lock);
  }
}
