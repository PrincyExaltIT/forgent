import { getProvider } from "../providers/index.js";
import { loadConfig, writeConfig } from "../config.js";

export async function runInit(ctx) {
  const { file, data } = await loadConfig(ctx.cwd);
  if (data) {
    console.log(`skills.config.json already exists at ${file}`);
    return;
  }
  const provider = ctx.flags.provider ? getProvider(ctx.flags.provider) : null;
  const next = {};
  if (provider) next.provider = provider.name;
  if (ctx.flags.dest) next.installDir = ctx.flags.dest;
  if (Object.keys(next).length === 0) {
    console.log(
      "init: nothing to write. Pass --provider <name> and/or --dest <path> " +
        "to persist defaults in skills.config.json.",
    );
    return;
  }
  if (ctx.flags.dryRun) {
    console.log(`[dry-run] would write ${file} with:`);
    console.log(JSON.stringify(next, null, 2));
    return;
  }
  const written = await writeConfig(ctx.cwd, next);
  console.log(`wrote ${written}`);
  for (const [k, v] of Object.entries(next)) console.log(`  ${k} = ${v}`);
}
