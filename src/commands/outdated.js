import { loadRegistry } from "../registry.js";
import { readLockfile, lockfilePath } from "../lockfile.js";

/**
 * Compare what forgent.lock.json says is installed with what the active registry
 * serves now. A skill is « outdated » when the registry has another version, and
 * « changed » when the version is the same but its files' sha256 moved.
 * Returns the rows; exits 1 from the CLI when something is behind.
 */
export async function collectOutdated(ctx, lock, registry, names = null) {
  const rows = [];
  for (const skillName of Object.keys(lock.skills).sort()) {
    if (names && !names.includes(skillName)) continue;
    const entry = lock.skills[skillName];
    const item = registry.items.find((i) => i.name === skillName);
    const installed = entry.skillVersion ?? "-";
    if (!item) {
      rows.push({ skillName, installed, latest: "-", status: "not in registry" });
      continue;
    }
    const latest = item.version ?? "-";
    let status = "up to date";
    if (item.version && entry.skillVersion && item.version !== entry.skillVersion) status = "outdated";
    else if (Array.isArray(item.files) && item.files.every((f) => typeof f === "object" && f.sha256)) {
      // Same version: did the published files change? Compare with what the lock recorded.
      const published = new Map(item.files.map((f) => [f.path, f.sha256]));
      const recorded = entry.files || [];
      const folderInstall = recorded.length > 1 || (recorded[0] && published.has(recorded[0].path));
      if (folderInstall) {
        const moved =
          recorded.length !== published.size || recorded.some((f) => published.get(f.path) !== f.sha256);
        if (moved) status = "changed";
      }
    }
    rows.push({ skillName, installed, latest, status, registryName: entry.registry?.name });
  }
  return rows;
}

export async function runOutdated(ctx) {
  const lock = await readLockfile(ctx.cwd);
  if (Object.keys(lock.skills).length === 0) {
    console.log(`nothing installed (${lockfilePath(ctx.cwd)} is empty or absent)`);
    return;
  }
  const registry = await loadRegistry(ctx);
  const rows = await collectOutdated(ctx, lock, registry);
  const w = Math.max(5, ...rows.map((r) => r.skillName.length));
  console.log(`${"skill".padEnd(w)}  ${"installed".padEnd(10)}  ${"latest".padEnd(10)}  status`);
  for (const r of rows) {
    const other = r.registryName && r.registryName !== registry.name ? ` (installed from ${r.registryName})` : "";
    console.log(`${r.skillName.padEnd(w)}  ${String(r.installed).padEnd(10)}  ${String(r.latest).padEnd(10)}  ${r.status}${other}`);
  }
  const behind = rows.filter((r) => r.status === "outdated" || r.status === "changed").length;
  console.log(`\n${behind === 0 ? "everything is up to date" : `${behind} skill(s) to update: forgent update`} (registry ${registry.name}@${registry.version})`);
  if (behind > 0) process.exitCode = 1;
}
