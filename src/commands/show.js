import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findSkillVersioned, loadRegistry, materializeSkill, skillFiles, skillSourceLocator } from "../registry.js";
import { listDirRecursive } from "../hash-tree.js";
import { scriptPaths } from "../skill-scripts.js";
import { parseSkillRef } from "./add.js";

const RULE = "─".repeat(72);

/**
 * Read a skill before installing it: fetch it into a temporary folder (with the
 * usual sha256 checks), print SKILL.md and the file list — scripts flagged — and
 * every file with --all. Nothing is installed, no lockfile is written.
 */
export async function runShow(ctx, raw) {
  const ref = parseSkillRef(raw);
  const registry = await loadRegistry(ctx);
  const skill = findSkillVersioned(registry, ref.name, ref.version);
  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), `forgent-show-${skill.name}-`));
  try {
    await materializeSkill(registry, skill, stagingDir, { strictSha256: ctx.flags.strictSha256 });
    const files = await listDirRecursive(stagingDir);
    const scripts = new Set(scriptPaths(files));
    const types = new Map(skillFiles(skill).map((f) => [f.path, f.type]));

    console.log(`name        ${skill.name}${skill.version ? `@${skill.version}` : ""}`);
    console.log(`registry    ${registry.name}@${registry.version}`);
    console.log(`source      ${skillSourceLocator(registry, skill)}`);
    console.log(`files       ${files.length}, of which ${scripts.size} script(s) your agent can run`);
    for (const rel of files) {
      const size = (await fs.stat(path.join(stagingDir, rel))).size;
      const tag = scripts.has(rel) ? "script" : (types.get(rel) || "").replace(/^skill:/, "");
      console.log(`  ${scripts.has(rel) ? "!" : " "} ${rel.padEnd(48)} ${String(size).padStart(7)} B  ${tag}`);
    }

    const toPrint = ctx.flags.all ? files : files.filter((f) => f === "SKILL.md");
    for (const rel of toPrint) {
      const body = await fs.readFile(path.join(stagingDir, rel), "utf8");
      console.log(`\n${RULE}\n${rel}${scripts.has(rel) ? "  (script)" : ""}\n${RULE}`);
      console.log(body.trimEnd());
    }
    if (!ctx.flags.all && files.length > 1) {
      console.log(`\n(${files.length - 1} more file(s): forgent show ${raw} --all prints them all.)`);
    }
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}
