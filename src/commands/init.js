import path from "node:path";
import { defaultInstallDir, loadConfig, writeConfig } from "../config.js";

export async function runInit(ctx) {
  const { file, data } = await loadConfig(ctx.cwd);
  if (data) {
    console.log(`skills.config.json already exists at ${file}`);
    return;
  }
  const installDir = ctx.flags.dest
    ? path.resolve(ctx.cwd, ctx.flags.dest)
    : defaultInstallDir();
  const next = {
    $schema: "https://example.local/skills-cli/config-schema.json",
    installDir,
  };
  if (ctx.flags.dryRun) {
    console.log(`[dry-run] would write ${file} with:`);
    console.log(JSON.stringify(next, null, 2));
    return;
  }
  const written = await writeConfig(ctx.cwd, next);
  console.log(`wrote ${written}`);
  console.log(`installDir = ${installDir}`);
}
