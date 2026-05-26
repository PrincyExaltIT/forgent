import fs from "node:fs/promises";
import path from "node:path";
import { copyDir, copyFileAs } from "./fs-helpers.js";
import {
  assertSafeName,
  assertSafeRelativePath,
  safeJoin,
} from "./path-safety.js";

export const DEFAULT_REGISTRY =
  "https://raw.githubusercontent.com/PrincyExaltIT/agent-skill/main";

const MANIFEST_FILE = "registry.json";
const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "forgent/0.1.0 (+https://github.com/PrincyExaltIT/forgent)";

function isHttpUrl(s) {
  return /^https?:\/\//i.test(s);
}

function getTimeoutMs() {
  const raw = process.env.FORGENT_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || String(n) !== raw.trim()) {
    throw new Error(
      `FORGENT_TIMEOUT_MS must be a positive integer, got: ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

function trimTrailingSlash(s) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function joinUrl(base, rel) {
  return `${trimTrailingSlash(base)}/${rel.replace(/^\//, "")}`;
}

function skillSourceRoot(skillName) {
  return `skills/${skillName}`;
}

export function resolveRegistryBase(ctx) {
  const raw =
    ctx.flags.registry ||
    process.env.FORGENT_REGISTRY ||
    DEFAULT_REGISTRY;
  if (isHttpUrl(raw)) {
    return { base: trimTrailingSlash(raw), kind: "url" };
  }
  return { base: path.resolve(ctx.cwd, raw), kind: "fs" };
}

async function fetchText(url) {
  if (!isHttpUrl(url)) {
    throw new Error(`refuse to fetch non-http(s) URL: ${url}`);
  }
  const ms = getTimeoutMs();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  let res;
  try {
    res = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`timeout fetching ${url} after ${ms}ms`);
    }
    throw new Error(`network error fetching ${url}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: HTTP ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${filePath}: ${err.message}`);
  }
}

export async function loadRegistry(ctx) {
  const { base, kind } = resolveRegistryBase(ctx);
  const manifestLocator =
    kind === "url" ? joinUrl(base, MANIFEST_FILE) : path.join(base, MANIFEST_FILE);
  const raw =
    kind === "url" ? await fetchText(manifestLocator) : await readText(manifestLocator);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${manifestLocator} is not valid JSON: ${err.message}`);
  }
  const items = parsed.items || parsed.skills;
  if (!Array.isArray(items)) {
    throw new Error(`${manifestLocator} must have an "items" array`);
  }
  for (const item of items) {
    if (!item || typeof item !== "object") {
      throw new Error(`${manifestLocator}: every item must be an object`);
    }
    try {
      assertSafeName(item.name, "skill.name");
    } catch (err) {
      throw new Error(`${manifestLocator}: ${err.message}`);
    }
    if (item.files !== undefined && !Array.isArray(item.files)) {
      throw new Error(
        `${manifestLocator}: skill "${item.name}": "files" must be an array if present`,
      );
    }
    for (const file of item.files || []) {
      const fileObj = typeof file === "string" ? { path: file } : file;
      if (!fileObj || typeof fileObj !== "object") {
        throw new Error(
          `${manifestLocator}: skill "${item.name}": file entries must be strings or objects`,
        );
      }
      try {
        assertSafeRelativePath(fileObj.path, `skill "${item.name}" file.path`);
      } catch (err) {
        throw new Error(`${manifestLocator}: ${err.message}`);
      }
    }
  }
  return { base, kind, name: parsed.name || "default", items, source: manifestLocator };
}

export function findSkill(registry, name) {
  const skill = registry.items.find((s) => s.name === name);
  if (!skill) {
    const names = registry.items.map((s) => s.name).join(", ");
    throw new Error(`skill "${name}" not found. Available: ${names || "(none)"}`);
  }
  return skill;
}

export function skillFiles(skill) {
  if (Array.isArray(skill.files) && skill.files.length > 0) {
    return skill.files.map((f) => (typeof f === "string" ? { path: f } : f));
  }
  return [{ path: "SKILL.md" }];
}

export async function materializeSkill(registry, skill, destDir, { dryRun = false } = {}) {
  assertSafeName(skill.name, "skill.name");
  const root = skillSourceRoot(skill.name);
  if (!dryRun) await fs.mkdir(destDir, { recursive: true });

  if (registry.kind === "fs") {
    const sourceDir = safeJoin(registry.base, root);
    await copyDir(sourceDir, destDir, dryRun);
    return destDir;
  }

  for (const file of skillFiles(skill)) {
    assertSafeRelativePath(file.path, `skill "${skill.name}" file.path`);
    const url = joinUrl(registry.base, `${root}/${file.path}`);
    const target = safeJoin(destDir, file.path);
    if (dryRun) {
      console.log(`[dry-run] fetch ${url} -> ${target}`);
      continue;
    }
    const body = await fetchText(url);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body, "utf8");
  }
  return destDir;
}

export async function listSkillFilePaths(registry, skill) {
  assertSafeName(skill.name, "skill.name");
  if (registry.kind === "url") {
    return skillFiles(skill).map((f) => f.path);
  }
  const sourceDir = safeJoin(registry.base, skillSourceRoot(skill.name));
  const out = [];
  async function visit(dir, rel) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(dir, entry.name);
      const relNext = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(next, relNext);
      else out.push(relNext);
    }
  }
  await visit(sourceDir, "");
  return out.sort();
}

export function skillSourceLocator(registry, skill) {
  assertSafeName(skill.name, "skill.name");
  const rel = skillSourceRoot(skill.name);
  return registry.kind === "url"
    ? joinUrl(registry.base, rel)
    : safeJoin(registry.base, rel);
}

export { copyFileAs };
