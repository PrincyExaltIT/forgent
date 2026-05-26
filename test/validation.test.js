import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  BIN,
  FIXTURE_REGISTRY,
  mkTmp,
  rmTmp,
  seedRegistry,
  writeText,
} from "./_helpers.js";

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

async function withSeededRegistry(manifest, fn) {
  const dir = await mkTmp("forgent-val-");
  try {
    await writeText(path.join(dir, "registry.json"), JSON.stringify(manifest));
    return await fn(dir);
  } finally {
    await rmTmp(dir);
  }
}

// -------- happy path --------

test("validation: valid manifest with all fields passes", async () => {
  await withSeededRegistry(
    {
      $schema:
        "https://raw.githubusercontent.com/PrincyExaltIT/forgent/main/schema/registry.schema.json",
      name: "valid",
      version: "1.2.3",
      homepage: "https://example.com",
      items: [
        {
          name: "demo",
          description: "A demo skill",
          tags: ["a", "b.c", "d-e"],
          files: [
            { path: "SKILL.md", type: "skill:main" },
            { path: "references/x.md", type: "skill:reference" },
          ],
        },
      ],
    },
    async (dir) => {
      const r = await runCLI(["validate-registry", "--registry", dir]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /^ok /m);
      assert.match(r.stdout, /name\s+valid/);
      assert.match(r.stdout, /version\s+1\.2\.3/);
      assert.match(r.stdout, /items\s+1/);
    },
  );
});

test("validation: validate-registry against the bundled fixture passes", async () => {
  const r = await runCLI(["validate-registry", "--registry", FIXTURE_REGISTRY]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /version\s+0\.0\.0/);
});

// -------- registry-level rejections --------

test("validation: missing top-level version is rejected", async () => {
  await withSeededRegistry(
    {
      name: "x",
      items: [{ name: "y", files: [{ path: "a.md" }] }],
    },
    async (dir) => {
      const r = await runCLI(["validate-registry", "--registry", dir]);
      assert.notEqual(r.code, 0);
      assert.match(r.stderr, /registry\.version/);
    },
  );
});

test("validation: malformed version strings are rejected", async () => {
  for (const bad of ["1.0", "v1.0.0", "latest", "1.0.0.0"]) {
    await withSeededRegistry(
      {
        name: "x",
        version: bad,
        items: [{ name: "y", files: [{ path: "a.md" }] }],
      },
      async (dir) => {
        const r = await runCLI(["validate-registry", "--registry", dir]);
        assert.notEqual(r.code, 0, `expected ${JSON.stringify(bad)} to be rejected`);
        assert.match(r.stderr, /semver|version/i);
      },
    );
  }
});

test("validation: missing top-level name is rejected (no silent default)", async () => {
  await withSeededRegistry(
    {
      version: "0.1.0",
      items: [{ name: "y", files: [{ path: "a.md" }] }],
    },
    async (dir) => {
      const r = await runCLI(["validate-registry", "--registry", dir]);
      assert.notEqual(r.code, 0);
      assert.match(r.stderr, /registry\.name/);
    },
  );
});

// -------- per-item rejections --------

test("validation: tag with whitespace is rejected", async () => {
  await withSeededRegistry(
    {
      name: "x",
      version: "0.1.0",
      items: [
        {
          name: "y",
          tags: ["ok", "has space"],
          files: [{ path: "a.md" }],
        },
      ],
    },
    async (dir) => {
      const r = await runCLI(["validate-registry", "--registry", dir]);
      assert.notEqual(r.code, 0);
      assert.match(r.stderr, /tag|invalid name/i);
    },
  );
});

test("validation: description must be a string", async () => {
  await withSeededRegistry(
    {
      name: "x",
      version: "0.1.0",
      items: [
        {
          name: "y",
          description: 42,
          files: [{ path: "a.md" }],
        },
      ],
    },
    async (dir) => {
      const r = await runCLI(["validate-registry", "--registry", dir]);
      assert.notEqual(r.code, 0);
      assert.match(r.stderr, /description/);
    },
  );
});

// -------- per-file rejections --------

test("validation: unknown files[].type is rejected", async () => {
  await withSeededRegistry(
    {
      name: "x",
      version: "0.1.0",
      items: [
        {
          name: "y",
          files: [{ path: "a.md", type: "skill:typo" }],
        },
      ],
    },
    async (dir) => {
      const r = await runCLI(["validate-registry", "--registry", dir]);
      assert.notEqual(r.code, 0);
      assert.match(r.stderr, /file\.type/);
    },
  );
});

// -------- forward-compat lenient --------

test("validation: unknown top-level keys are tolerated at runtime", async () => {
  await withSeededRegistry(
    {
      name: "x",
      version: "0.1.0",
      banana: true,
      futureField: { complex: [1, 2, 3] },
      items: [{ name: "y", files: [{ path: "a.md" }] }],
    },
    async (dir) => {
      const r = await runCLI(["validate-registry", "--registry", dir]);
      // Schema flags this in editors; runtime tolerates for forward-compat.
      assert.equal(r.code, 0, r.stderr);
    },
  );
});

// -------- info displays registry@version --------

test("validation: `info` displays registry name@version", async () => {
  const r = await runCLI([
    "info",
    "commit",
    "--registry",
    FIXTURE_REGISTRY,
  ]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /registry\s+default@0\.0\.0/);
});

// -------- unreachable registry --------

test("validation: validate-registry against nonexistent path errors clearly", async () => {
  const ghost = path.join(await mkTmp("forgent-ghost-"), "does-not-exist");
  const r = await runCLI(["validate-registry", "--registry", ghost]);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /cannot read|ENOENT/i);
});

// -------- regression: existing seedRegistry path still works --------

test("validation: default seedRegistry manifest validates clean", async () => {
  const dir = await mkTmp("forgent-seed-");
  try {
    await seedRegistry(dir, { skillName: "seedtest" });
    const r = await runCLI(["validate-registry", "--registry", dir]);
    assert.equal(r.code, 0, r.stderr);
  } finally {
    await rmTmp(dir);
  }
});
