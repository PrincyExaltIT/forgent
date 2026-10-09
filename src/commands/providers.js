import { allAdapters } from "../providers/index.js";

export async function runProviders() {
  const adapters = allAdapters();
  const nameWidth = Math.max(...adapters.map((a) => a.name.length));
  console.log("available providers:");
  for (const a of adapters) {
    const name = a.name.padEnd(nameWidth, " ");
    const where = a.layout === "folder" ? `${a.defaultScope} scope` : "legacy single file";
    console.log(`  ${name}  default install: ${a.defaultInstallDir({ cwd: process.cwd() })} (${where})`);
    console.log(`  ${" ".repeat(nameWidth)}  ${a.description}`);
  }
}
