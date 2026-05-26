import { resolveInstallDir, resolveProviderName } from "../config.js";
import { getProvider } from "../providers/index.js";
import { readLockfile, removeFromLock, writeLockfile } from "../lockfile.js";

export async function runRemove(ctx, name) {
  const providerName = await resolveProviderName(ctx);
  const provider = getProvider(providerName);
  const installDir = await resolveInstallDir(ctx, provider);
  const result = await provider.remove({
    installDir,
    skillName: name,
    dryRun: ctx.flags.dryRun,
  });
  if (!ctx.flags.dryRun) {
    console.log(`removed ${name} (${provider.name}) -> ${result.removedPath}`);
    const lock = await readLockfile(ctx.cwd);
    if (lock.skills[name]) {
      removeFromLock(lock, name);
      await writeLockfile(ctx.cwd, lock);
    }
  }
}
