import os from "node:os";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolveProviderName, resolveInstallDir } from "../config.js";
import { getProviders } from "../providers/index.js";
import { loadRegistry } from "../registry.js";

export async function runDoctor(ctx) {
  let fails = 0;

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor >= 18) {
    console.log(`OK: node ${process.versions.node}`);
  } else {
    console.log(`FAIL: node ${process.versions.node} (forgent requires >=18)`);
    fails++;
  }

  const plat = process.platform;
  const arch = os.arch();
  if (plat === "linux" || plat === "darwin" || plat === "win32") {
    console.log(`OK: platform ${plat}/${arch}`);
  } else {
    console.log(`WARN: platform ${plat}/${arch} not officially tested`);
  }

  const providerName = await resolveProviderName(ctx);
  let providers = [];
  if (!providerName) {
    console.log(
      `WARN: no provider resolved (set --provider, FORGENT_PROVIDER, or run \`forgent init\`)`,
    );
  } else {
    try {
      providers = getProviders(providerName);
      console.log(`OK: provider ${providers.map((p) => p.name).join(", ")}`);
      for (const p of providers.filter((a) => a.layout === "file")) {
        console.log(
          `WARN: ${p.name} is a legacy single-file provider — skills that ship scripts or references lose them. ` +
            `Prefer --provider agents (the Agent Skills folder, .agents/skills).`,
        );
      }
    } catch (err) {
      console.log(`FAIL: provider "${providerName}" — ${err.message}`);
      fails++;
    }
  }

  for (const provider of providers) {
    try {
      const dir = await resolveInstallDir(ctx, provider);
      await fs.mkdir(dir, { recursive: true });
      await fs.access(dir, fsConstants.W_OK);
      console.log(`OK: install dir ${dir} (${provider.name})`);
    } catch (err) {
      console.log(`FAIL: install dir (${provider.name}) — ${err.message}`);
      fails++;
    }
  }

  try {
    const registry = await loadRegistry(ctx);
    console.log(
      `OK: registry ${registry.kind} ${registry.name}@${registry.version} (${registry.items.length} items)`,
    );
  } catch (err) {
    console.log(`FAIL: registry — ${err.message}`);
    fails++;
  }

  if (fails > 0) {
    process.exit(1);
  }
}
