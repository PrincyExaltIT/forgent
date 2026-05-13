import fs from "node:fs/promises";
import path from "node:path";

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function copyDir(src, dest, dryRun = false) {
  if (!dryRun) await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to, dryRun);
    } else if (entry.isFile()) {
      if (dryRun) console.log(`[dry-run] copy ${from} -> ${to}`);
      else await fs.copyFile(from, to);
    }
  }
}

export async function copyFileAs(srcFile, destFile, dryRun = false) {
  if (dryRun) {
    console.log(`[dry-run] copy ${srcFile} -> ${destFile}`);
    return;
  }
  await fs.mkdir(path.dirname(destFile), { recursive: true });
  await fs.copyFile(srcFile, destFile);
}
