import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { BIN, mkTmp, pathExists, rmTmp, seedRegistry } from "./_helpers.js";

function runCLI(args, { env = {}, cwd = undefined } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, ...env },
      cwd,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

test("lockfile: `add foo` writes forgent.lock.json with sha256 + registry provenance", async () => {
  const registryDir = await mkTmp("forgent-lock-add-");
  const installDir = await mkTmp("forgent-lock-add-inst-");
  const cwd = await mkTmp("forgent-lock-add-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo" });
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
    const lockfile = path.join(cwd, "forgent.lock.json");
    assert.ok(await pathExists(lockfile), "lockfile must exist");
    const lock = await readJson(lockfile);
    assert.equal(lock.lockfileVersion, 1);
    assert.ok(lock.skills.foo, "lock must have foo entry");
    assert.equal(lock.skills.foo.provider, "claude");
    assert.equal(lock.skills.foo.registry.name, "test");
    assert.equal(lock.skills.foo.registry.version, "0.0.0");
    assert.equal(lock.skills.foo.skillVersion, null);
    assert.equal(lock.skills.foo.files.length, 1);
    assert.equal(lock.skills.foo.files[0].path, "SKILL.md");
    assert.match(lock.skills.foo.files[0].sha256, /^[a-f0-9]{64}$/);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("lockfile: two consecutive adds produce a lock with both entries", async () => {
  const registryDir = await mkTmp("forgent-lock-two-");
  const installDir = await mkTmp("forgent-lock-two-inst-");
  const cwd = await mkTmp("forgent-lock-two-cwd-");
  try {
    await seedRegistry(registryDir, {
      manifestOverride: {
        name: "test",
        version: "0.0.0",
        items: [
          { name: "alpha", files: [{ path: "SKILL.md", type: "skill:main" }] },
          { name: "beta", files: [{ path: "SKILL.md", type: "skill:main" }] },
        ],
      },
    });
    // Materialize source files for both skills.
    await fs.mkdir(path.join(registryDir, "skills", "alpha"), { recursive: true });
    await fs.mkdir(path.join(registryDir, "skills", "beta"), { recursive: true });
    await fs.writeFile(
      path.join(registryDir, "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\n---\nA\n",
    );
    await fs.writeFile(
      path.join(registryDir, "skills", "beta", "SKILL.md"),
      "---\nname: beta\n---\nB\n",
    );
    const r1 = await runCLI(
      ["add", "--provider", "claude", "alpha", "--dest", installDir, "--registry", registryDir],
      { cwd },
    );
    assert.equal(r1.code, 0, r1.stderr);
    const r2 = await runCLI(
      ["add", "--provider", "claude", "beta", "--dest", installDir, "--registry", registryDir],
      { cwd },
    );
    assert.equal(r2.code, 0, r2.stderr);
    const lock = await readJson(path.join(cwd, "forgent.lock.json"));
    assert.deepEqual(Object.keys(lock.skills).sort(), ["alpha", "beta"]);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("lockfile: --dry-run does NOT write the lockfile", async () => {
  const registryDir = await mkTmp("forgent-lock-dry-");
  const installDir = await mkTmp("forgent-lock-dry-inst-");
  const cwd = await mkTmp("forgent-lock-dry-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo" });
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo",
        "--dest",
        installDir,
        "--registry",
        registryDir,
        "--dry-run",
      ],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
    assert.ok(
      !(await pathExists(path.join(cwd, "forgent.lock.json"))),
      "lockfile must not exist after dry-run",
    );
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("lockfile: `remove` deletes the skill entry from the lock", async () => {
  const registryDir = await mkTmp("forgent-lock-rm-");
  const installDir = await mkTmp("forgent-lock-rm-inst-");
  const cwd = await mkTmp("forgent-lock-rm-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo" });
    await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    const r = await runCLI(
      ["remove", "--provider", "claude", "foo", "--dest", installDir],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
    const lock = await readJson(path.join(cwd, "forgent.lock.json"));
    assert.equal(lock.skills.foo, undefined);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("verify: clean install reports OK and exits 0", async () => {
  const registryDir = await mkTmp("forgent-verify-ok-");
  const installDir = await mkTmp("forgent-verify-ok-inst-");
  const cwd = await mkTmp("forgent-verify-ok-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo" });
    const r1 = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    assert.equal(r1.code, 0, r1.stderr);
    const r2 = await runCLI(
      ["verify", "--provider", "claude", "--dest", installDir],
      { cwd },
    );
    assert.equal(r2.code, 0, r2.stderr);
    assert.match(r2.stdout, /OK\s+foo\/SKILL\.md/);
    assert.match(r2.stdout, /verified 1 skill/);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("verify: tampered file reports FAIL and exits 1", async () => {
  const registryDir = await mkTmp("forgent-verify-bad-");
  const installDir = await mkTmp("forgent-verify-bad-inst-");
  const cwd = await mkTmp("forgent-verify-bad-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo" });
    await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    // Tamper with the installed file.
    await fs.writeFile(
      path.join(installDir, "foo", "SKILL.md"),
      "tampered content\n",
    );
    const r = await runCLI(
      ["verify", "--provider", "claude", "--dest", installDir],
      { cwd },
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stdout, /FAIL\s+foo\/SKILL\.md/);
    assert.match(r.stdout, /expected [a-f0-9]{64}/);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("verify: no lockfile reports gracefully and exits 0", async () => {
  const cwd = await mkTmp("forgent-verify-empty-");
  try {
    const r = await runCLI(["verify", "--provider", "claude"], { cwd });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /no lockfile to verify/);
  } finally {
    await rmTmp(cwd);
  }
});
