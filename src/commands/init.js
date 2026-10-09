import { getProviders } from "../providers/index.js";
import { loadConfig, writeConfig } from "../config.js";

export async function runInit(ctx) {
  const { file, data } = await loadConfig(ctx.cwd);
  if (data) {
    console.log(`forgent.config.json already exists at ${file}`);
    return;
  }
  const providers = ctx.flags.provider ? getProviders(ctx.flags.provider) : [];
  const next = {};
  if (providers.length) next.provider = providers.map((p) => p.name).join(",");
  if (ctx.flags.dest) next.installDir = ctx.flags.dest;
  if (ctx.flags.scope) next.scope = ctx.flags.scope;
  if (Object.keys(next).length === 0) {
    console.log(
      "init: nothing to write. Pass --provider <names>, --project / --user and/or --dest <path> " +
        "to persist defaults in forgent.config.json.",
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
