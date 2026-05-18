import fs from "node:fs/promises";
import path from "node:path";
import { copyDir, copyFileAs } from "./fs-helpers.js";

export const DEFAULT_REGISTRY =
  "https://raw.githubusercontent.com/PrincyExaltIT/agent-skill/main";

const MANIFEST_FILE = "registry.json";

function isHttpUrl(s) {
  return /^https?:\/\//i.test(s);
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
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`network error fetching ${url}: ${err.message}`);
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
  const root = skillSourceRoot(skill.name);
  if (!dryRun) await fs.mkdir(destDir, { recursive: true });

  if (registry.kind === "fs") {
    const sourceDir = path.join(registry.base, root);
    await copyDir(sourceDir, destDir, dryRun);
    return destDir;
  }

  for (const file of skillFiles(skill)) {
    const url = joinUrl(registry.base, `${root}/${file.path}`);
    const target = path.join(destDir, file.path);
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
  if (registry.kind === "url") {
    return skillFiles(skill).map((f) => f.path);
  }
  const sourceDir = path.join(registry.base, skillSourceRoot(skill.name));
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
  const rel = skillSourceRoot(skill.name);
  return registry.kind === "url"
    ? joinUrl(registry.base, rel)
    : path.join(registry.base, rel);
}

export { copyFileAs };
