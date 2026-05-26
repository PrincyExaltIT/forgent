import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { BIN, mkTmp, rmTmp, seedRegistry } from "./_helpers.js";

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

test("skill-version: add foo (no pin) works against versionless registry", async () => {
  const registryDir = await mkTmp("forgent-sv-noPin-");
  const installDir = await mkTmp("forgent-sv-noPin-inst-");
  const cwd = await mkTmp("forgent-sv-noPin-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo" });
    const r = await runCLI(
      ["add", "--provider", "claude", "foo", "--dest", installDir, "--registry", registryDir],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("skill-version: add foo@1.2.3 succeeds when registry pins to 1.2.3", async () => {
  const registryDir = await mkTmp("forgent-sv-match-");
  const installDir = await mkTmp("forgent-sv-match-inst-");
  const cwd = await mkTmp("forgent-sv-match-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo", itemVersion: "1.2.3" });
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo@1.2.3",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /added foo/);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("skill-version: add foo@1.2.3 errors when registry pins to a different version", async () => {
  const registryDir = await mkTmp("forgent-sv-mismatch-");
  const installDir = await mkTmp("forgent-sv-mismatch-inst-");
  const cwd = await mkTmp("forgent-sv-mismatch-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo", itemVersion: "2.0.0" });
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo@1.2.3",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /asked for @1\.2\.3/);
    assert.match(r.stderr, /at 2\.0\.0/);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("skill-version: add foo@1.2.3 errors when registry has no item.version", async () => {
  const registryDir = await mkTmp("forgent-sv-nopin-");
  const installDir = await mkTmp("forgent-sv-nopin-inst-");
  const cwd = await mkTmp("forgent-sv-nopin-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo" });
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo@1.2.3",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /does not declare a version/);
    assert.match(r.stderr, /remove the @1\.2\.3 pin/);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("skill-version: add foo@not-a-version errors at parse", async () => {
  const registryDir = await mkTmp("forgent-sv-parse-");
  const installDir = await mkTmp("forgent-sv-parse-inst-");
  const cwd = await mkTmp("forgent-sv-parse-cwd-");
  try {
    await seedRegistry(registryDir, { skillName: "foo" });
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "foo@not-a-version",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /semver/);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});

test("skill-version: manifest with malformed items[].version is rejected at load", async () => {
  const registryDir = await mkTmp("forgent-sv-badmanifest-");
  try {
    await seedRegistry(registryDir, {
      manifestOverride: {
        name: "x",
        version: "0.1.0",
        items: [
          {
            name: "foo",
            version: "1.0",
            files: [{ path: "SKILL.md", type: "skill:main" }],
          },
        ],
      },
    });
    const r = await runCLI(["validate-registry", "--registry", registryDir]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /version/);
  } finally {
    await rmTmp(registryDir);
  }
});
