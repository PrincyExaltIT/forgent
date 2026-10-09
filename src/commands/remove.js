import { assertDirsFitProviders, resolveInstallDir, resolveProviderName } from "../config.js";
import { getProviders } from "../providers/index.js";
import { encodeInstallPath, readLockfile, removeFromLock, writeLockfile } from "../lockfile.js";

export async function runRemove(ctx, name) {
  const providers = getProviders(await resolveProviderName(ctx));
  await assertDirsFitProviders(ctx, providers);
  const lock = ctx.flags.dryRun ? null : await readLockfile(ctx.cwd);
  let lockDirty = false;
  for (const provider of providers) {
    const installDir = await resolveInstallDir(ctx, provider);
    const result = await provider.remove({
      installDir,
      skillName: name,
      dryRun: ctx.flags.dryRun,
    });
    if (!ctx.flags.dryRun) {
      console.log(`removed ${name} (${provider.name}) -> ${result.removedPath}`);
      if (lock.skills[name]) {
        // Drops only this install when the lockfile knows several; forgets the skill otherwise.
        removeFromLock(lock, name, encodeInstallPath(ctx.cwd, result.removedPath));
        lockDirty = true;
      }
    }
  }
  if (lockDirty) await writeLockfile(ctx.cwd, lock);
}
