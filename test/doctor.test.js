import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { BIN, FIXTURE_REGISTRY, mkTmp, rmTmp } from "./_helpers.js";

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, ...env, FORGENT_PROVIDER: env.FORGENT_PROVIDER ?? "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("doctor: against fixture registry without provider exits 0 with WARN", async () => {
  const r = await run(["doctor", "--registry", FIXTURE_REGISTRY]);
  assert.equal(r.code, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /OK: node/);
  assert.match(r.stdout, /OK: platform/);
  assert.match(r.stdout, /WARN: no provider resolved/);
  assert.match(r.stdout, /OK: registry/);
});

test("doctor: --provider claude shows OK on provider and install dir", async () => {
  const installDir = await mkTmp("forgent-doctor-claude-");
  try {
    const r = await run([
      "doctor",
      "--provider",
      "claude",
      "--registry",
      FIXTURE_REGISTRY,
      "--dest",
      installDir,
    ]);
    assert.equal(r.code, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /OK: provider claude/);
    assert.match(r.stdout, /OK: install dir/);
    assert.doesNotMatch(r.stdout, /WARN: Codex/);
  } finally {
    await rmTmp(installDir);
  }
});

test("doctor: --provider codex emits the non-native warning", async () => {
  const installDir = await mkTmp("forgent-doctor-codex-");
  try {
    const r = await run([
      "doctor",
      "--provider",
      "codex",
      "--registry",
      FIXTURE_REGISTRY,
      "--dest",
      installDir,
    ]);
    assert.equal(r.code, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /OK: provider codex/);
    assert.match(r.stdout, /WARN: Codex CLI has no native skill format/);
  } finally {
    await rmTmp(installDir);
  }
});

test("doctor: unreachable registry exits 1 with FAIL", async () => {
  const r = await run(["doctor", "--registry", "http://127.0.0.1:1"]);
  assert.notEqual(r.code, 0);
  assert.match(r.stdout, /FAIL: registry/);
});
