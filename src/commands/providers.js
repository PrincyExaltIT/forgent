import { allAdapters } from "../providers/index.js";

export async function runProviders() {
  const adapters = allAdapters();
  const nameWidth = Math.max(...adapters.map((a) => a.name.length));
  console.log("available providers:");
  for (const a of adapters) {
    const name = a.name.padEnd(nameWidth, " ");
    console.log(`  ${name}  default install: ${a.defaultInstallDir()}`);
    console.log(`  ${" ".repeat(nameWidth)}  ${a.description}`);
  }
}
