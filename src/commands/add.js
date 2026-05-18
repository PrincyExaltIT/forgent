import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveInstallDir, resolveProviderName } from "../config.js";
import { findSkill, loadRegistry, materializeSkill } from "../registry.js";
import { getProvider } from "../providers/index.js";

export async function runAdd(ctx, names) {
  const providerName = await resolveProviderName(ctx);
  const provider = getProvider(providerName);
  const registry = await loadRegistry(ctx);
  const installDir = await resolveInstallDir(ctx, provider);
  if (!ctx.flags.dryRun) {
    await fs.mkdir(installDir, { recursive: true });
  }
  for (const name of names) {
    const skill = findSkill(registry, name);
    const stagingDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `forgent-${skill.name}-`),
    );
    try {
      await materializeSkill(registry, skill, stagingDir, {
        dryRun: ctx.flags.dryRun,
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
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
  }
}
