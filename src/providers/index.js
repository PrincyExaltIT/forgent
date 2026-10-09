import * as agents from "./agents.js";
import * as claude from "./claude.js";
import * as copilot from "./copilot.js";
import * as codex from "./codex.js";
import * as cursor from "./cursor.js";

// Folder providers first: they follow the Agent Skills standard. The single-file ones are kept for 1.x compatibility.
const ADAPTERS = { agents, claude, copilot, codex, cursor };

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

/**
 * Resolve a provider list: "agents,claude" (or an array) -> adapters, in order, without duplicates.
 */
export function getProviders(names) {
  const list = (Array.isArray(names) ? names : String(names ?? "").split(","))
    .map((n) => n.trim())
    .filter(Boolean);
  if (list.length === 0) return [getProvider(null)];
  return [...new Set(list)].map((n) => getProvider(n));
}

export function allAdapters() {
  return Object.values(ADAPTERS);
}
