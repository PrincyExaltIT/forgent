import fs from "node:fs/promises";
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

export function recordInstall(lock, { skillName, registry, skillVersion, provider, files }) {
  const entry = {
    registry: {
      name: registry.name,
      version: registry.version,
      source: registry.source,
    },
    skillVersion: skillVersion ?? null,
    provider,
    installedAt: new Date().toISOString(),
    files: files
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(({ path: p, sha256 }) => ({ path: p, sha256 })),
  };
  lock.skills[skillName] = entry;
  return lock;
}

export function removeFromLock(lock, skillName) {
  if (lock.skills && skillName in lock.skills) {
    delete lock.skills[skillName];
  }
  return lock;
}
