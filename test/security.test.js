import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertSafeName,
  assertSafeRelativePath,
  safeJoin,
} from "../src/path-safety.js";
import {
  BIN,
  mkTmp,
  pathExists,
  rmTmp,
  seedRegistry,
  writeText,
} from "./_helpers.js";

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

function runCLI(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

// -------- Unit tests for path-safety primitives --------

test("security: assertSafeName accepts realistic skill names", () => {
  for (const name of [
    "angular-review",
    "angular-review-kata-rendering-events",
    "foo.bar",
    "foo_bar",
    "X1",
    "a",
  ]) {
    assertSafeName(name); // does not throw
  }
});

test("security: assertSafeName rejects traversal / separators / control", () => {
  for (const bad of [
    "../foo",
    "foo/bar",
    "foo bar",
    ".hidden",
    "",
    "/abs",
    "C:\\evil",
    "foo\\bar",
  ]) {
    assert.throws(() => assertSafeName(bad), /invalid name/);
  }
});

test("security: assertSafeName rejects non-string", () => {
  assert.throws(() => assertSafeName(null), /invalid name/);
  assert.throws(() => assertSafeName(123), /invalid name/);
  assert.throws(() => assertSafeName(undefined), /invalid name/);
});

test("security: assertSafeRelativePath accepts realistic file paths", () => {
  for (const p of [
    "SKILL.md",
    "references/SECURITY.md",
    "examples/sample.json",
    "deeply/nested/path/file.md",
  ]) {
    assertSafeRelativePath(p);
  }
});

test("security: assertSafeRelativePath rejects traversal and absolute paths", () => {
  for (const bad of [
    "../evil",
    "foo/../bar",
    "foo/./bar",
    "/etc/passwd",
    "C:\\Windows\\x",
    "foo\\bar",
    "foo//bar",
    "",
  ]) {
    assert.throws(() => assertSafeRelativePath(bad), /invalid path/);
  }
});

test("security: assertSafeRelativePath rejects non-string", () => {
  assert.throws(() => assertSafeRelativePath(null), /invalid path/);
  assert.throws(() => assertSafeRelativePath(undefined), /invalid path/);
});

test("security: safeJoin returns a path inside base for safe inputs", () => {
  const base = path.resolve("/tmp/base");
  const joined = safeJoin(base, "sub/file.md");
  assert.ok(joined.startsWith(base + path.sep), `expected ${joined} under ${base}`);
  assert.ok(joined.endsWith(path.join("sub", "file.md")));
});

test("security: safeJoin throws on traversal escape", () => {
  assert.throws(
    () => safeJoin("/tmp/base", "../escape.md"),
    /invalid path|unsafe path/,
  );
});

// -------- Integration: malicious manifest --------

test("security: registry with traversal file.path is rejected at load", async () => {
  const registryDir = await mkTmp("forgent-mal-reg-");
  const installDir = await mkTmp("forgent-mal-inst-");
  try {
    await seedRegistry(registryDir, {
      skillName: "evil",
      filesOverride: [{ path: "../escape.md", type: "skill:main" }],
    });
    const r = await runCLI([
      "add",
      "--provider",
      "claude",
      "evil",
      "--dest",
      installDir,
      "--registry",
      registryDir,
    ]);
    assert.notEqual(r.code, 0, "CLI must exit non-zero for malicious manifest");
    assert.match(r.stderr, /file\.path|invalid path|unsafe/i);
    // No file written outside install dir
    const escape = path.join(path.dirname(installDir), "escape.md");
    assert.ok(
      !(await pathExists(escape)),
      `traversal target must not exist: ${escape}`,
    );
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
  }
});

test("security: registry with absolute file.path is rejected at load", async () => {
  const registryDir = await mkTmp("forgent-mal-reg-");
  const installDir = await mkTmp("forgent-mal-inst-");
  try {
    await seedRegistry(registryDir, {
      skillName: "evil",
      filesOverride: [{ path: "/etc/passwd", type: "skill:main" }],
    });
    const r = await runCLI([
      "add",
      "--provider",
      "claude",
      "evil",
      "--dest",
      installDir,
      "--registry",
      registryDir,
    ]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /absolute|invalid path/i);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
  }
});

test("security: registry with traversal skill.name is rejected at load", async () => {
  const registryDir = await mkTmp("forgent-mal-reg-");
  const installDir = await mkTmp("forgent-mal-inst-");
  try {
    const manifest = {
      name: "evil",
      items: [
        {
          name: "../evil",
          description: "bad",
          files: [{ path: "SKILL.md" }],
        },
      ],
    };
    await writeText(
      path.join(registryDir, "registry.json"),
      JSON.stringify(manifest),
    );
    const r = await runCLI([
      "list",
      "--registry",
      registryDir,
    ]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /skill\.name|invalid name/i);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
  }
});

test("security: valid manifest still installs (regression)", async () => {
  const registryDir = await mkTmp("forgent-ok-reg-");
  const installDir = await mkTmp("forgent-ok-inst-");
  try {
    await seedRegistry(registryDir, { skillName: "good", body: "valid\n" });
    const r = await runCLI([
      "add",
      "--provider",
      "claude",
      "good",
      "--dest",
      installDir,
      "--registry",
      registryDir,
    ]);
    assert.equal(r.code, 0, r.stderr);
    const installed = path.join(installDir, "good", "SKILL.md");
    assert.ok(await pathExists(installed));
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
  }
});

// -------- Network hardening --------

test("security: fetch times out per FORGENT_TIMEOUT_MS against hanging server", async () => {
  const { server, url } = await startServer(() => {
    /* never respond */
  });
  try {
    const t0 = Date.now();
    const r = await runCLI(["list", "--registry", url], {
      FORGENT_TIMEOUT_MS: "300",
    });
    const elapsed = Date.now() - t0;
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /timeout/i);
    assert.ok(
      elapsed < 5000,
      `expected timeout to fire well under 5s, took ${elapsed}ms`,
    );
  } finally {
    await stop(server);
  }
});

test("security: fetch sends a forgent User-Agent header", async () => {
  let capturedUA = null;
  const { server, url } = await startServer((req, res) => {
    capturedUA = req.headers["user-agent"] ?? null;
    if (req.url === "/registry.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ name: "ua-test", items: [] }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  try {
    const r = await runCLI(["list", "--registry", url]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(capturedUA, "server should have observed a User-Agent");
    assert.match(capturedUA, /^forgent\//);
  } finally {
    await stop(server);
  }
});

test("security: FORGENT_TIMEOUT_MS=non-integer errors clearly", async () => {
  // Use a reachable server so we'd succeed in absence of the bad env var
  const { server, url } = await startServer((req, res) => {
    res.end(JSON.stringify({ name: "x", items: [] }));
  });
  try {
    const r = await runCLI(["list", "--registry", url], {
      FORGENT_TIMEOUT_MS: "abc",
    });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /FORGENT_TIMEOUT_MS/);
  } finally {
    await stop(server);
  }
});
