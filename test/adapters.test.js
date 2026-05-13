import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";

import * as claude from "../src/providers/claude.js";
import * as copilot from "../src/providers/copilot.js";
import * as codex from "../src/providers/codex.js";
import * as cursor from "../src/providers/cursor.js";
import { mkTmp, rmTmp, pathExists, seedRegistry, readText } from "./_helpers.js";

const ADAPTERS = [
  { adapter: claude, ext: null, isFolder: true, label: "claude" },
  { adapter: copilot, ext: ".prompt.md", isFolder: false, label: "copilot" },
  { adapter: codex, ext: ".md", isFolder: false, label: "codex" },
  { adapter: cursor, ext: ".mdc", isFolder: false, label: "cursor" },
];

function targetPath(installDir, skillName, spec) {
  if (spec.isFolder) return path.join(installDir, skillName, "SKILL.md");
  return path.join(installDir, `${skillName}${spec.ext}`);
}

for (const spec of ADAPTERS) {
  test(`${spec.label}: install copies source to expected target`, async () => {
    const registryDir = await mkTmp("skills-reg-");
    const installDir = await mkTmp("skills-inst-");
    try {
      await seedRegistry(registryDir, { skillName: "demo", body: "BODY\n" });
      const result = await spec.adapter.install({
        installDir,
        skillName: "demo",
        sourceDir: path.join(registryDir, "skills", "demo"),
        force: false,
        dryRun: false,
      });
      const expected = targetPath(installDir, "demo", spec);
      assert.equal(result.writtenPath.replace(/\\/g, "/"),
        (spec.isFolder ? path.join(installDir, "demo") : expected).replace(/\\/g, "/"));
      assert.ok(await pathExists(expected), `expected file at ${expected}`);
      const content = await readText(expected);
      assert.ok(content.includes("BODY"), "copied content");
    } finally {
      await rmTmp(registryDir);
      await rmTmp(installDir);
    }
  });

  test(`${spec.label}: install refuses to overwrite without force`, async () => {
    const registryDir = await mkTmp("skills-reg-");
    const installDir = await mkTmp("skills-inst-");
    try {
      await seedRegistry(registryDir, { skillName: "demo" });
      const sourceDir = path.join(registryDir, "skills", "demo");
      await spec.adapter.install({ installDir, skillName: "demo", sourceDir, force: false, dryRun: false });
      await assert.rejects(
        spec.adapter.install({ installDir, skillName: "demo", sourceDir, force: false, dryRun: false }),
        /already exists/,
      );
    } finally {
      await rmTmp(registryDir);
      await rmTmp(installDir);
    }
  });

  test(`${spec.label}: install with --force overwrites`, async () => {
    const registryDir = await mkTmp("skills-reg-");
    const installDir = await mkTmp("skills-inst-");
    try {
      await seedRegistry(registryDir, { skillName: "demo", body: "FIRST\n" });
      const sourceDir = path.join(registryDir, "skills", "demo");
      await spec.adapter.install({ installDir, skillName: "demo", sourceDir, force: false, dryRun: false });

      await seedRegistry(registryDir, { skillName: "demo", body: "SECOND\n" });
      await spec.adapter.install({ installDir, skillName: "demo", sourceDir, force: true, dryRun: false });

      const expected = targetPath(installDir, "demo", spec);
      const content = await readText(expected);
      assert.ok(content.includes("SECOND"), "overwritten content");
      assert.ok(!content.includes("FIRST"), "old content gone");
    } finally {
      await rmTmp(registryDir);
      await rmTmp(installDir);
    }
  });

  test(`${spec.label}: install with dry-run writes nothing to disk`, async () => {
    const registryDir = await mkTmp("skills-reg-");
    const installDir = await mkTmp("skills-inst-");
    try {
      await seedRegistry(registryDir, { skillName: "demo" });
      const sourceDir = path.join(registryDir, "skills", "demo");
      await spec.adapter.install({ installDir, skillName: "demo", sourceDir, force: false, dryRun: true });
      const expected = targetPath(installDir, "demo", spec);
      assert.equal(await pathExists(expected), false, "no file written");
      const entries = await fs.readdir(installDir);
      assert.equal(entries.length, 0, "install dir is empty");
    } finally {
      await rmTmp(registryDir);
      await rmTmp(installDir);
    }
  });

  test(`${spec.label}: remove deletes the installed target`, async () => {
    const registryDir = await mkTmp("skills-reg-");
    const installDir = await mkTmp("skills-inst-");
    try {
      await seedRegistry(registryDir, { skillName: "demo" });
      const sourceDir = path.join(registryDir, "skills", "demo");
      await spec.adapter.install({ installDir, skillName: "demo", sourceDir, force: false, dryRun: false });
      await spec.adapter.remove({ installDir, skillName: "demo", dryRun: false });
      const expected = targetPath(installDir, "demo", spec);
      assert.equal(await pathExists(expected), false, "target file is gone");
      if (spec.isFolder) {
        assert.equal(await pathExists(path.join(installDir, "demo")), false, "folder is gone");
      }
    } finally {
      await rmTmp(registryDir);
      await rmTmp(installDir);
    }
  });

  test(`${spec.label}: remove throws when nothing installed`, async () => {
    const installDir = await mkTmp("skills-inst-");
    try {
      await assert.rejects(
        spec.adapter.remove({ installDir, skillName: "ghost", dryRun: false }),
        /no installed/,
      );
    } finally {
      await rmTmp(installDir);
    }
  });

  test(`${spec.label}: remove with dry-run keeps the target`, async () => {
    const registryDir = await mkTmp("skills-reg-");
    const installDir = await mkTmp("skills-inst-");
    try {
      await seedRegistry(registryDir, { skillName: "demo" });
      const sourceDir = path.join(registryDir, "skills", "demo");
      await spec.adapter.install({ installDir, skillName: "demo", sourceDir, force: false, dryRun: false });
      await spec.adapter.remove({ installDir, skillName: "demo", dryRun: true });
      const expected = targetPath(installDir, "demo", spec);
      assert.ok(await pathExists(expected), "target survived dry-run remove");
    } finally {
      await rmTmp(registryDir);
      await rmTmp(installDir);
    }
  });
}

test("file-style adapters reject sources missing SKILL.md", async () => {
  const installDir = await mkTmp("skills-inst-");
  const emptySource = await mkTmp("skills-empty-src-");
  try {
    for (const spec of ADAPTERS) {
      if (spec.isFolder) continue;
      await assert.rejects(
        spec.adapter.install({
          installDir,
          skillName: "x",
          sourceDir: emptySource,
          force: false,
          dryRun: false,
        }),
        /missing required SKILL\.md/,
        `${spec.label} should reject empty source`,
      );
    }
  } finally {
    await rmTmp(installDir);
    await rmTmp(emptySource);
  }
});
