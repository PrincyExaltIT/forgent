import { loadRegistry } from "../registry.js";

export async function runList(ctx) {
  const registry = await loadRegistry(ctx);
  if (registry.items.length === 0) {
    console.log("registry is empty");
    return;
  }
  const nameWidth = Math.max(...registry.items.map((s) => s.name.length));
  for (const skill of registry.items) {
    const name = skill.name.padEnd(nameWidth, " ");
    console.log(`${name}  ${skill.description || ""}`);
  }
}
