import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { BIN, mkTmp, pathExists, rmTmp } from "./_helpers.js";

function run(args, { env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: cwd || path.dirname(BIN),
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("CLI: `providers` lists all four adapters", async () => {
  const r = await run(["providers"]);
  assert.equal(r.code, 0, r.stderr);
  for (const p of ["claude", "copilot", "codex", "cursor"]) {
    assert.match(r.stdout, new RegExp(`\\b${p}\\b`), `${p} listed`);
  }
});

test("CLI: `list` shows registry skills", async () => {
  const r = await run(["list"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /commit/);
  assert.match(r.stdout, /review/);
});

test("CLI: `add` without --provider exits non-zero with helpful message", async () => {
  const installDir = await mkTmp("skills-cli-noprov-");
  try {
    const r = await run(["add", "commit", "--dest", installDir], {
      env: { SKILLS_PROVIDER: "" },
    });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /--provider is required/);
    assert.match(r.stderr, /claude.*copilot.*codex.*cursor/s);
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: `add --provider claude` writes folder-per-skill", async () => {
  const installDir = await mkTmp("skills-cli-claude-");
  try {
    const r = await run(["add", "--provider", "claude", "commit", "--dest", installDir]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(installDir, "commit", "SKILL.md")));
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: `add --provider copilot` writes <name>.prompt.md", async () => {
  const installDir = await mkTmp("skills-cli-copilot-");
  try {
    const r = await run(["add", "--provider", "copilot", "commit", "--dest", installDir]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(installDir, "commit.prompt.md")));
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: `add --provider cursor` writes <name>.mdc", async () => {
  const installDir = await mkTmp("skills-cli-cursor-");
  try {
    const r = await run(["add", "--provider", "cursor", "commit", "--dest", installDir]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(installDir, "commit.mdc")));
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: `add --provider codex` writes <name>.md", async () => {
  const installDir = await mkTmp("skills-cli-codex-");
  try {
    const r = await run(["add", "--provider", "codex", "commit", "--dest", installDir]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(installDir, "commit.md")));
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: add unknown skill exits non-zero with available list", async () => {
  const installDir = await mkTmp("skills-cli-unknown-");
  try {
    const r = await run([
      "add",
      "--provider",
      "claude",
      "no-such-skill",
      "--dest",
      installDir,
    ]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /skill "no-such-skill" not found/);
    assert.match(r.stderr, /Available:.*commit/);
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: add conflict refuses without --force, succeeds with it", async () => {
  const installDir = await mkTmp("skills-cli-conflict-");
  try {
    const a = await run(["add", "--provider", "claude", "commit", "--dest", installDir]);
    assert.equal(a.code, 0, a.stderr);

    const b = await run(["add", "--provider", "claude", "commit", "--dest", installDir]);
    assert.notEqual(b.code, 0);
    assert.match(b.stderr, /already exists/);

    const c = await run([
      "add",
      "--provider",
      "claude",
      "commit",
      "--dest",
      installDir,
      "--force",
    ]);
    assert.equal(c.code, 0, c.stderr);
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: remove deletes; subsequent remove errors", async () => {
  const installDir = await mkTmp("skills-cli-remove-");
  try {
    await run(["add", "--provider", "claude", "commit", "--dest", installDir]);
    const r = await run(["remove", "--provider", "claude", "commit", "--dest", installDir]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(await pathExists(path.join(installDir, "commit")), false);

    const r2 = await run(["remove", "--provider", "claude", "commit", "--dest", installDir]);
    assert.notEqual(r2.code, 0);
    assert.match(r2.stderr, /no installed skill/);
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: SKILLS_PROVIDER env supplies provider when flag omitted", async () => {
  const installDir = await mkTmp("skills-cli-env-");
  try {
    const r = await run(["add", "commit", "--dest", installDir], {
      env: { SKILLS_PROVIDER: "cursor" },
    });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(installDir, "commit.mdc")));
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: --dry-run writes nothing to disk", async () => {
  const installDir = await mkTmp("skills-cli-dry-");
  try {
    const r = await run([
      "add",
      "--provider",
      "claude",
      "commit",
      "--dest",
      installDir,
      "--dry-run",
    ]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(await pathExists(path.join(installDir, "commit")), false);
  } finally {
    await rmTmp(installDir);
  }
});

test("CLI: help mentions all four providers", async () => {
  const r = await run(["help"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /claude/);
  assert.match(r.stdout, /copilot/);
  assert.match(r.stdout, /codex/);
  assert.match(r.stdout, /cursor/);
});
