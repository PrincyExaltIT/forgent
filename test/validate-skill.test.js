import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { BIN, mkTmp, rmTmp, writeText } from "./_helpers.js";

const RUN_TMP = fsSync.mkdtempSync(path.join(os.tmpdir(), "forgent-vskill-cwd-"));

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

const FIXTURE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["status", "findings"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    status: { type: "string", enum: ["OK", "FAIL"] },
    findings: {
      type: "array",
      items: { $ref: "#/$defs/finding" },
    },
  },
  $defs: {
    finding: {
      type: "object",
      required: ["severity", "message"],
      additionalProperties: false,
      properties: {
        severity: { type: "string", enum: ["BLOCKER", "MAJOR", "MINOR", "INFO"] },
        message: { type: "string", minLength: 1 },
      },
    },
  },
};

async function buildRegistryWithExample(root, exampleObj, schemaUrl) {
  const examplePath = "examples/out.json";
  // example may not include $schema — caller decides
  const text = JSON.stringify(exampleObj, null, 2);
  await writeText(path.join(root, "skills", "demo", examplePath), text);
  await writeText(path.join(root, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n\nx\n");
  const files = [
    { path: "SKILL.md", type: "skill:main" },
    { path: examplePath, type: "skill:example" },
  ];
  await writeText(
    path.join(root, "registry.json"),
    JSON.stringify({
      name: "test",
      version: "0.0.0",
      items: [{ name: "demo", description: "d", files }],
    }),
  );
  return { schemaUrl };
}

function schemaServer(schemaObj) {
  return startServer((req, res) => {
    if (req.url === "/schema.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(schemaObj));
    } else {
      res.statusCode = 404;
      res.end("not found");
    }
  });
}

test("validate-skill: valid example against schema passes (OK)", async () => {
  const { server, url } = await schemaServer(FIXTURE_SCHEMA);
  const dir = await mkTmp("forgent-vs-ok-");
  try {
    const example = {
      $schema: `${url}/schema.json`,
      status: "OK",
      findings: [{ severity: "INFO", message: "all good" }],
    };
    await buildRegistryWithExample(dir, example);
    const r = await runCLI(["validate-skill", "demo", "--registry", dir]);
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /OK/);
  } finally {
    await rmTmp(dir);
    await stop(server);
  }
});

test("validate-skill: example with bad enum value fails", async () => {
  const { server, url } = await schemaServer(FIXTURE_SCHEMA);
  const dir = await mkTmp("forgent-vs-enum-");
  try {
    const example = {
      $schema: `${url}/schema.json`,
      status: "OK",
      findings: [{ severity: "WARNING", message: "nope" }],
    };
    await buildRegistryWithExample(dir, example);
    const r = await runCLI(["validate-skill", "demo", "--registry", dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /FAIL/);
    assert.match(r.stdout, /not in enum/);
  } finally {
    await rmTmp(dir);
    await stop(server);
  }
});

test("validate-skill: example missing required field fails", async () => {
  const { server, url } = await schemaServer(FIXTURE_SCHEMA);
  const dir = await mkTmp("forgent-vs-req-");
  try {
    const example = {
      $schema: `${url}/schema.json`,
      status: "OK",
      findings: [{ severity: "INFO" }], // missing "message"
    };
    await buildRegistryWithExample(dir, example);
    const r = await runCLI(["validate-skill", "demo", "--registry", dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /missing required property "message"/);
  } finally {
    await rmTmp(dir);
    await stop(server);
  }
});

test("validate-skill: example without $schema is skipped (exit 0)", async () => {
  const dir = await mkTmp("forgent-vs-noschema-");
  try {
    const example = { status: "OK", findings: [] };
    await buildRegistryWithExample(dir, example);
    const r = await runCLI(["validate-skill", "demo", "--registry", dir]);
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /no \$schema field, skipped/);
  } finally {
    await rmTmp(dir);
  }
});

test("validate-skill: unknown $schema URL → fetch fails with clean error (no crash)", async () => {
  const dir = await mkTmp("forgent-vs-badurl-");
  try {
    const example = {
      $schema: "http://127.0.0.1:1/does-not-exist.json",
      status: "OK",
      findings: [],
    };
    await buildRegistryWithExample(dir, example);
    const r = await runCLI(["validate-skill", "demo", "--registry", dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /could not fetch schema/);
  } finally {
    await rmTmp(dir);
  }
});

test("validate-skill: skill with no JSON examples exits 0 with friendly message", async () => {
  const dir = await mkTmp("forgent-vs-noex-");
  try {
    await writeText(path.join(dir, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n\nx\n");
    await writeText(
      path.join(dir, "registry.json"),
      JSON.stringify({
        name: "test",
        version: "0.0.0",
        items: [{ name: "demo", description: "d", files: [{ path: "SKILL.md", type: "skill:main" }] }],
      }),
    );
    const r = await runCLI(["validate-skill", "demo", "--registry", dir]);
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /no JSON examples to validate/);
  } finally {
    await rmTmp(dir);
  }
});
