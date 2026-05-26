import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { BIN, mkTmp, pathExists, rmTmp } from "./_helpers.js";

const RUN_TMP = fsSync.mkdtempSync(path.join(os.tmpdir(), "forgent-reg-cwd-"));

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
      cwd: RUN_TMP,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("registry: `add` fetches skill files over HTTP", async () => {
  const manifest = {
    name: "remote-test",
    version: "0.0.0",
    items: [
      { name: "hello", description: "Hello from HTTP", files: [{ path: "SKILL.md" }] },
    ],
  };
  const body = "---\nname: hello\n---\n\nHello from HTTP fixture\n";
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
  const installDir = await mkTmp("forgent-http-");
  try {
    // This test predates the strict-sha256 default and is about HTTP fetch
    // mechanics, not integrity policy. Opt out of strict mode so the
    // hash-less fixture still installs.
    const r = await runCLI([
      "add",
      "--provider",
      "claude",
      "hello",
      "--dest",
      installDir,
      "--registry",
      url,
      "--no-strict-sha256",
    ]);
    assert.equal(r.code, 0, r.stderr);
    const file = path.join(installDir, "hello", "SKILL.md");
    assert.ok(await pathExists(file), `expected file at ${file}`);
    const content = await fs.readFile(file, "utf8");
    assert.match(content, /Hello from HTTP fixture/);
  } finally {
    await rmTmp(installDir);
    await stop(server);
  }
});

test("registry: `list` reads the remote manifest", async () => {
  const manifest = {
    name: "remote-test",
    version: "0.0.0",
    items: [
      { name: "alpha", description: "first", files: [{ path: "SKILL.md" }] },
      { name: "beta", description: "second", files: [{ path: "SKILL.md" }] },
    ],
  };
  const { server, url } = await startServer((req, res) => {
    if (req.url === "/registry.json") res.end(JSON.stringify(manifest));
    else {
      res.statusCode = 404;
      res.end();
    }
  });
  try {
    const r = await runCLI(["list", "--registry", url]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /alpha/);
    assert.match(r.stdout, /beta/);
  } finally {
    await stop(server);
  }
});

test("registry: clear error when the URL is unreachable", async () => {
  const r = await runCLI(["list", "--registry", "http://127.0.0.1:1"]);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /network error|fetch.*failed/i);
});

test("registry: FORGENT_REGISTRY env var is honored when --registry is absent", async () => {
  const manifest = {
    name: "remote-test",
    version: "0.0.0",
    items: [{ name: "envskill", description: "via env", files: [{ path: "SKILL.md" }] }],
  };
  const { server, url } = await startServer((req, res) => {
    if (req.url === "/registry.json") res.end(JSON.stringify(manifest));
    else {
      res.statusCode = 404;
      res.end();
    }
  });
  try {
    const r = await runCLI(["list"], { FORGENT_REGISTRY: url });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /envskill/);
  } finally {
    await stop(server);
  }
});
