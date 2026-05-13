import fs from "node:fs/promises";
import path from "node:path";
import { resolveInstallDir } from "../config.js";

export async function runRemove(ctx, name) {
  const installDir = await resolveInstallDir(ctx);
  const target = path.join(installDir, name);
  try {
    await fs.access(target);
  } catch {
    throw new Error(`no installed skill at ${target}`);
  }
  if (ctx.flags.dryRun) {
    console.log(`[dry-run] would remove ${target}`);
    return;
  }
  await fs.rm(target, { recursive: true, force: true });
  console.log(`removed ${target}`);
}
