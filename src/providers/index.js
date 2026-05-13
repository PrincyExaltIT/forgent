import * as claude from "./claude.js";
import * as copilot from "./copilot.js";
import * as codex from "./codex.js";
import * as cursor from "./cursor.js";

const ADAPTERS = { claude, copilot, codex, cursor };

export function listProviders() {
  return Object.keys(ADAPTERS);
}

export function getProvider(name) {
  if (!name) {
    throw new Error(
      `--provider is required. Available: ${listProviders().join(", ")}`,
    );
  }
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(
      `unknown provider "${name}". Available: ${listProviders().join(", ")}`,
    );
  }
  return adapter;
}

export function allAdapters() {
  return Object.values(ADAPTERS);
}
