import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { BIN, mkTmp, rmTmp, seedRegistry } from "./_helpers.js";

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

function hash(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function withFixture(body, { withHash = true, hashOverride = null } = {}) {
  const declared = hashOverride !== null ? hashOverride : withHash ? hash(body) : undefined;
  const file = { path: "SKILL.md", type: "skill:main" };
  if (declared !== undefined) file.sha256 = declared;
  const manifest = {
    name: "remote-test",
    version: "0.0.0",
    items: [{ name: "hello", description: "h", files: [file] }],
  };
  const { server, url } = await startServer((req, res) => {
    if (req.url === "/registry.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(manifest));
    } else if (req.url === "/skills/hello/SKILL.md") {
      res.setHeader("Content-Type", "text/markdown");
      res.end(body);
    } else {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  return { server, url };
}

test("sha256: url install with matching hash succeeds", async () => {
  const body = "# matched\n";
  const { server, url } = await withFixture(body);
  const installDir = await mkTmp("forgent-sha-ok-");
  const cwd = await mkTmp("forgent-sha-ok-cwd-");
  try {
    const r = await runCLI(
      ["add", "--provider", "claude", "hello", "--dest", installDir, "--registry", url],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /added hello/);
    assert.doesNotMatch(r.stderr, /WARN/);
  } finally {
    await rmTmp(installDir);
    await rmTmp(cwd);
    await stop(server);
  }
});

test("sha256: url install with mismatching hash errors with both hashes", async () => {
  const body = "# original\n";
  const wrong = "0".repeat(64);
  const { server, url } = await withFixture(body, { hashOverride: wrong });
  const installDir = await mkTmp("forgent-sha-bad-");
  const cwd = await mkTmp("forgent-sha-bad-cwd-");
  try {
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "hello",
        "--dest",
        installDir,
        "--registry",
        url,
      ],
      { cwd },
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /sha256 mismatch/);
    assert.match(r.stderr, new RegExp(wrong));
    assert.match(r.stderr, new RegExp(hash(body)));
  } finally {
    await rmTmp(installDir);
    await rmTmp(cwd);
    await stop(server);
  }
});

test("sha256: url install without manifest hash warns once but succeeds", async () => {
  const body = "# unhashed\n";
  const { server, url } = await withFixture(body, { withHash: false });
  const installDir = await mkTmp("forgent-sha-warn-");
  const cwd = await mkTmp("forgent-sha-warn-cwd-");
  try {
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "hello",
        "--dest",
        installDir,
        "--registry",
        url,
      ],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /WARN.*sha256/);
  } finally {
    await rmTmp(installDir);
    await rmTmp(cwd);
    await stop(server);
  }
});

test("sha256: FORGENT_STRICT_SHA256=1 rejects manifests without hash", async () => {
  const body = "# unhashed\n";
  const { server, url } = await withFixture(body, { withHash: false });
  const installDir = await mkTmp("forgent-sha-strict-env-");
  const cwd = await mkTmp("forgent-sha-strict-env-cwd-");
  try {
    const r = await runCLI(
      ["add", "--provider", "claude", "hello", "--dest", installDir, "--registry", url],
      { cwd, env: { FORGENT_STRICT_SHA256: "1" } },
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /strict-sha256/);
  } finally {
    await rmTmp(installDir);
    await rmTmp(cwd);
    await stop(server);
  }
});

test("sha256: --strict-sha256 flag rejects manifests without hash", async () => {
  const body = "# unhashed\n";
  const { server, url } = await withFixture(body, { withHash: false });
  const installDir = await mkTmp("forgent-sha-strict-flag-");
  const cwd = await mkTmp("forgent-sha-strict-flag-cwd-");
  try {
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "hello",
        "--dest",
        installDir,
        "--registry",
        url,
        "--strict-sha256",
      ],
      { cwd },
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /strict-sha256/);
  } finally {
    await rmTmp(installDir);
    await rmTmp(cwd);
    await stop(server);
  }
});

test("sha256: invalid hash in manifest is rejected at load", async () => {
  const dir = await mkTmp("forgent-sha-loadfail-");
  try {
    await seedRegistry(dir, {
      skillName: "bad",
      filesOverride: [{ path: "SKILL.md", type: "skill:main", sha256: "not-a-hash" }],
    });
    const r = await runCLI(["validate-registry", "--registry", dir]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /sha256/);
  } finally {
    await rmTmp(dir);
  }
});

test("sha256: fs-mode install skips per-file verification (manifest sha256 ignored)", async () => {
  const registryDir = await mkTmp("forgent-sha-fs-");
  const installDir = await mkTmp("forgent-sha-fs-inst-");
  const cwd = await mkTmp("forgent-sha-fs-cwd-");
  try {
    const { writeText } = await import("./_helpers.js");
    await seedRegistry(registryDir, {
      skillName: "fs-hello",
      withSha256: false,
      filesOverride: [
        { path: "SKILL.md", type: "skill:main", sha256: "f".repeat(64) },
      ],
    });
    await writeText(
      `${registryDir}/skills/fs-hello/SKILL.md`,
      "---\nname: fs-hello\n---\n\nbody\n",
    );
    const r = await runCLI(
      [
        "add",
        "--provider",
        "claude",
        "fs-hello",
        "--dest",
        installDir,
        "--registry",
        registryDir,
      ],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
  } finally {
    await rmTmp(registryDir);
    await rmTmp(installDir);
    await rmTmp(cwd);
  }
});
