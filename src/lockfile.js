import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const LOCKFILE_NAME = "forgent.lock.json";
export const LOCKFILE_VERSION = 1;

export function lockfilePath(cwd) {
  return path.join(cwd, LOCKFILE_NAME);
}

function emptyLock() {
  return { lockfileVersion: LOCKFILE_VERSION, skills: {} };
}

export async function readLockfile(cwd) {
  const file = lockfilePath(cwd);
  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return emptyLock();
    throw new Error(`failed to read ${LOCKFILE_NAME}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} must be a JSON object`);
  }
  if (parsed.lockfileVersion !== LOCKFILE_VERSION) {
    throw new Error(
      `${file}: unsupported lockfileVersion ${JSON.stringify(parsed.lockfileVersion)} ` +
        `(this forgent supports ${LOCKFILE_VERSION})`,
    );
  }
  if (!parsed.skills || typeof parsed.skills !== "object" || Array.isArray(parsed.skills)) {
    throw new Error(`${file}: "skills" must be an object`);
  }
  return parsed;
}

function sortObject(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = obj[key];
  }
  return out;
}

export async function writeLockfile(cwd, lock) {
  const file = lockfilePath(cwd);
  const out = {
    lockfileVersion: LOCKFILE_VERSION,
    skills: sortObject(lock.skills || {}),
  };
  await fs.writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  return file;
}

/**
 * Where an install lives, as written in the lockfile: relative to the project
 * (POSIX separators) when it is inside it, so a committed lockfile works on
 * every machine; "~/…" under the home directory; absolute otherwise.
 */
export function encodeInstallPath(cwd, absPath) {
  const rel = path.relative(cwd, absPath);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).join("/");
  const home = os.homedir();
  const fromHome = path.relative(home, absPath);
  if (fromHome && !fromHome.startsWith("..") && !path.isAbsolute(fromHome)) {
    return `~/${fromHome.split(path.sep).join("/")}`;
  }
  return absPath.split(path.sep).join("/");
}

export function decodeInstallPath(cwd, stored) {
  if (stored === "~" || stored.startsWith("~/")) return path.join(os.homedir(), stored.slice(2));
  return path.resolve(cwd, stored);
}

function sortFiles(files) {
  return files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path: p, sha256 }) => ({ path: p, sha256 }));
}

/**
 * Record one install of a skill. The top-level fields describe the latest
 * install (same shape as forgent 1.0, so older readers keep working);
 * `installs` lists every place the skill is installed, one entry per path.
 */
export function recordInstall(lock, { skillName, registry, skillVersion, provider, files, installPath = null }) {
  const now = new Date().toISOString();
  const sortedFiles = sortFiles(files);
  const entry = {
    registry: {
      name: registry.name,
      version: registry.version,
      source: registry.source,
    },
    skillVersion: skillVersion ?? null,
    provider,
    installedAt: now,
    files: sortedFiles,
  };
  if (installPath) {
    const previous = lock.skills[skillName];
    const others = Array.isArray(previous?.installs)
      ? previous.installs.filter((i) => i.path !== installPath)
      : [];
    entry.installs = [
      ...others,
      { provider, path: installPath, skillVersion: skillVersion ?? null, installedAt: now, files: sortedFiles },
    ].sort((a, b) => a.path.localeCompare(b.path));
  }
  lock.skills[skillName] = entry;
  return lock;
}

/**
 * Forget a skill. With `installPath`, only that install is dropped; the entry
 * stays while other installs remain, and its top-level fields then describe
 * one of them.
 */
export function removeFromLock(lock, skillName, installPath = null) {
  const entry = lock.skills?.[skillName];
  if (!entry) return lock;
  if (installPath && Array.isArray(entry.installs)) {
    const remaining = entry.installs.filter((i) => i.path !== installPath);
    if (remaining.length > 0) {
      const last = remaining[remaining.length - 1];
      lock.skills[skillName] = {
        ...entry,
        provider: last.provider,
        skillVersion: last.skillVersion ?? entry.skillVersion ?? null,
        installedAt: last.installedAt ?? entry.installedAt,
        files: last.files,
        installs: remaining,
      };
      return lock;
    }
  }
  delete lock.skills[skillName];
  return lock;
}
