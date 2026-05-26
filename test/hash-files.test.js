import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { BIN, mkTmp, rmTmp, sha256Hex, writeText } from "./_helpers.js";

const RUN_TMP = fsSync.mkdtempSync(path.join(os.tmpdir(), "forgent-hashfiles-cwd-"));

function runCLI(args, { env = {}, cwd = RUN_TMP } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function buildRegistry(root, items) {
  const manifestItems = [];
  for (const it of items) {
    const files = [];
    for (const f of it.files) {
      await writeText(path.join(root, "skills", it.name, f.path), f.body);
      const entry = { path: f.path, type: f.type || "skill:main" };
      if (f.declaredSha256 !== null && f.declaredSha256 !== undefined) {
        entry.sha256 = f.declaredSha256;
      }
      files.push(entry);
    }
    manifestItems.push({ name: it.name, description: `Test ${it.name}`, files });
  }
  await writeText(
    path.join(root, "registry.json"),
    JSON.stringify({ name: "test", version: "0.0.0", items: manifestItems }, null, 2),
  );
}

test("hash-files: clean match (all hashes equal manifest) exits 0", async () => {
  const dir = await mkTmp("forgent-hf-ok-");
  try {
    const body = "# hello\n";
    await buildRegistry(dir, [
      { name: "alpha", files: [{ path: "SKILL.md", body, declaredSha256: sha256Hex(body) }] },
    ]);
    const r = await runCLI(["hash-files", "--registry", dir]);
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /alpha/);
    assert.match(r.stdout, /match/);
    assert.match(r.stdout, /1 items \/ 1 files \/ 1 matches \/ 0 mismatches \/ 0 missing-from-manifest/);
  } finally {
    await rmTmp(dir);
  }
});

test("hash-files: tampered file body causes MISMATCH and exit 1", async () => {
  const dir = await mkTmp("forgent-hf-mismatch-");
  try {
    const declaredBody = "# original\n";
    const actualBody = "# tampered\n";
    // Manifest declares hash of "original" but file on disk is "tampered"
    await writeText(path.join(dir, "skills", "alpha", "SKILL.md"), actualBody);
    await writeText(
      path.join(dir, "registry.json"),
      JSON.stringify({
        name: "test",
        version: "0.0.0",
        items: [
          {
            name: "alpha",
            description: "x",
            files: [{ path: "SKILL.md", type: "skill:main", sha256: sha256Hex(declaredBody) }],
          },
        ],
      }),
    );
    const r = await runCLI(["hash-files", "--registry", dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /MISMATCH/);
    assert.match(r.stdout, /1 mismatches/);
  } finally {
    await rmTmp(dir);
  }
});

test("hash-files: manifest entry without sha256 is reported MISSING and exits 1", async () => {
  const dir = await mkTmp("forgent-hf-missing-");
  try {
    const body = "# hello\n";
    await buildRegistry(dir, [
      { name: "alpha", files: [{ path: "SKILL.md", body, declaredSha256: null }] },
    ]);
    const r = await runCLI(["hash-files", "--registry", dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /MISSING/);
    assert.match(r.stdout, /1 missing-from-manifest/);
  } finally {
    await rmTmp(dir);
  }
});

test("hash-files: rejects http registry with clear error", async () => {
  const r = await runCLI(["hash-files", "--registry", "https://example.com/repo/main"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /hash-files only works against a local registry/);
});

test("hash-files: registry with zero items returns exit 0 summary", async () => {
  const dir = await mkTmp("forgent-hf-empty-");
  try {
    await writeText(
      path.join(dir, "registry.json"),
      JSON.stringify({ name: "test", version: "0.0.0", items: [] }),
    );
    const r = await runCLI(["hash-files", "--registry", dir]);
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /0 items \/ 0 files \/ 0 matches \/ 0 mismatches \/ 0 missing-from-manifest/);
  } finally {
    await rmTmp(dir);
  }
});
