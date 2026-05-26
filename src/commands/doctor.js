import os from "node:os";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolveProviderName, resolveInstallDir } from "../config.js";
import { getProvider } from "../providers/index.js";
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
  let provider = null;
  if (!providerName) {
    console.log(
      `WARN: no provider resolved (set --provider, FORGENT_PROVIDER, or run \`forgent init\`)`,
    );
  } else {
    try {
      provider = getProvider(providerName);
      console.log(`OK: provider ${providerName}`);
      if (providerName === "codex") {
        console.log(
          `WARN: Codex CLI has no native skill format — installs use a generic .md fallback`,
        );
      }
    } catch (err) {
      console.log(`FAIL: provider "${providerName}" — ${err.message}`);
      fails++;
    }
  }

  if (provider) {
    try {
      const dir = await resolveInstallDir(ctx, provider);
      await fs.mkdir(dir, { recursive: true });
      await fs.access(dir, fsConstants.W_OK);
      console.log(`OK: install dir ${dir}`);
    } catch (err) {
      console.log(`FAIL: install dir — ${err.message}`);
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
