import { loadRegistry } from "../registry.js";

export async function runValidateRegistry(ctx) {
  const registry = await loadRegistry(ctx);
  console.log(`ok ${registry.source}`);
  console.log(`name    ${registry.name}`);
  console.log(`version ${registry.version}`);
  console.log(`items   ${registry.items.length}`);
}
