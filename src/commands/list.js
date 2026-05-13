import { loadRegistry } from "../registry.js";

export async function runList(ctx) {
  const registry = await loadRegistry(ctx);
  if (registry.skills.length === 0) {
    console.log("registry is empty");
    return;
  }
  const nameWidth = Math.max(...registry.skills.map((s) => s.name.length));
  for (const skill of registry.skills) {
    const name = skill.name.padEnd(nameWidth, " ");
    console.log(`${name}  ${skill.description || ""}`);
  }
}
