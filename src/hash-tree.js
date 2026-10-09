import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Hashing of installed skills, shared by add, verify, outdated and update.

export async function sha256OfFile(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export async function listDirRecursive(dir) {
  const out = [];
  async function visit(d, rel) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(d, entry.name);
      const relNext = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(next, relNext);
      else if (entry.isFile()) out.push(relNext);
    }
  }
  await visit(dir, "");
  return out.sort();
}

/** [{ path, sha256 }] of an install target: every file of a folder, or the single file itself. */
export async function hashInstalledFiles(writtenPath) {
  const stat = await fs.stat(writtenPath);
  if (stat.isDirectory()) {
    const rels = await listDirRecursive(writtenPath);
    const out = [];
    for (const rel of rels) {
      out.push({ path: rel, sha256: await sha256OfFile(path.join(writtenPath, rel)) });
    }
    return out;
  }
  return [{ path: path.basename(writtenPath), sha256: await sha256OfFile(writtenPath) }];
}

/**
 * Compare two file lists ([{ path, sha256 }]) and return what changed from `before` to `after`.
 */
export function diffFiles(before, after) {
  const was = new Map(before.map((f) => [f.path, f.sha256]));
  const now = new Map(after.map((f) => [f.path, f.sha256]));
  const added = [...now.keys()].filter((p) => !was.has(p)).sort();
  const removed = [...was.keys()].filter((p) => !now.has(p)).sort();
  const changed = [...now.keys()].filter((p) => was.has(p) && was.get(p) !== now.get(p)).sort();
  return { added, removed, changed, same: added.length + removed.length + changed.length === 0 };
}
