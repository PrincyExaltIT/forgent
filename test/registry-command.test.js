import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BIN, FIXTURE_REGISTRY, mkTmp, rmTmp, seedRegistry } from "./_helpers.js";

// Per-module tmp cwd so config writes never pollute the repo. Each test that
// writes its own forgent.config.json uses its own mkTmp() cwd.
const RUN_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "forgent-regcmd-cwd-"));

function runCLI(args, { cwd = RUN_TMP, env = {} } = {}) {
  return new Promise((resolve) => {
    // Strip FORGENT_REGISTRY by default so tests exercise the real resolver.
    const baseEnv = { ...process.env };
    delete baseEnv.FORGENT_REGISTRY;
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      env: { ...baseEnv, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function readConfig(cwd) {
  const raw = await fsp.readFile(path.join(cwd, "forgent.config.json"), "utf8");
  return JSON.parse(raw);
}

test("registry list: empty config prints built-in default notice", async () => {
  const cwd = await mkTmp("forgent-reg-empty-");
  try {
    const r = await runCLI(["registry", "list"], { cwd });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /no registries configured/);
    assert.match(r.stdout, /built-in default/);
    assert.match(r.stdout, /raw\.githubusercontent\.com\/PrincyExaltIT\/agent-skill/);
  } finally {
    await rmTmp(cwd);
  }
});

test("registry add: writes config, list shows the entry", async () => {
  const cwd = await mkTmp("forgent-reg-add-");
  try {
    const a = await runCLI(["registry", "add", "foo", "https://example/"], { cwd });
    assert.equal(a.code, 0, a.stderr);
    assert.match(a.stdout, /added registry "foo"/);

    const cfg = await readConfig(cwd);
    assert.deepEqual(cfg.registries, [{ name: "foo", url: "https://example/" }]);
    assert.equal(cfg.defaultRegistry, undefined);

    const l = await runCLI(["registry", "list"], { cwd });
    assert.equal(l.code, 0, l.stderr);
    assert.match(l.stdout, /foo\s+https:\/\/example\//);
    // No default marker on the line yet.
    assert.doesNotMatch(l.stdout, /^\*\s+foo/m);
  } finally {
    await rmTmp(cwd);
  }
});

test("registry add: name collision refused without --force, overwrites with --force", async () => {
  const cwd = await mkTmp("forgent-reg-collide-");
  try {
    await runCLI(["registry", "add", "foo", "https://one/"], { cwd });

    const dup = await runCLI(["registry", "add", "foo", "https://two/"], { cwd });
    assert.notEqual(dup.code, 0);
    assert.match(dup.stderr, /already configured/);
    assert.match(dup.stderr, /--force/);

    // Unchanged after refused collision.
    let cfg = await readConfig(cwd);
    assert.equal(cfg.registries[0].url, "https://one/");

    const force = await runCLI(
      ["registry", "add", "foo", "https://two/", "--force"],
      { cwd },
    );
    assert.equal(force.code, 0, force.stderr);
    cfg = await readConfig(cwd);
    assert.equal(cfg.registries.length, 1);
    assert.equal(cfg.registries[0].url, "https://two/");
  } finally {
    await rmTmp(cwd);
  }
});

test("registry add --default sets the new entry as default", async () => {
  const cwd = await mkTmp("forgent-reg-adddef-");
  try {
    const r = await runCLI(
      ["registry", "add", "main", "https://main/", "--default"],
      { cwd },
    );
    assert.equal(r.code, 0, r.stderr);
    const cfg = await readConfig(cwd);
    assert.equal(cfg.defaultRegistry, "main");

    const l = await runCLI(["registry", "list"], { cwd });
    assert.match(l.stdout, /^\*\s+main\s+https:\/\/main\//m);
  } finally {
    await rmTmp(cwd);
  }
});

test("registry remove: deletes entry and clears default if it was the default", async () => {
  const cwd = await mkTmp("forgent-reg-rm-");
  try {
    await runCLI(["registry", "add", "alpha", "https://a/", "--default"], { cwd });
    await runCLI(["registry", "add", "beta", "https://b/"], { cwd });

    let cfg = await readConfig(cwd);
    assert.equal(cfg.defaultRegistry, "alpha");
    assert.equal(cfg.registries.length, 2);

    const r = await runCLI(["registry", "remove", "alpha"], { cwd });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /removed registry "alpha"/);
    assert.match(r.stdout, /no default registry set/);

    cfg = await readConfig(cwd);
    assert.equal(cfg.registries.length, 1);
    assert.equal(cfg.registries[0].name, "beta");
    assert.equal(cfg.defaultRegistry, undefined);

    // Removing an unknown name errors.
    const miss = await runCLI(["registry", "remove", "ghost"], { cwd });
    assert.notEqual(miss.code, 0);
    assert.match(miss.stderr, /not configured/);
  } finally {
    await rmTmp(cwd);
  }
});

test("registry set-default: switches default, list moves the *", async () => {
  const cwd = await mkTmp("forgent-reg-setdef-");
  try {
    await runCLI(["registry", "add", "alpha", "https://a/", "--default"], { cwd });
    await runCLI(["registry", "add", "beta", "https://b/"], { cwd });

    let l = await runCLI(["registry", "list"], { cwd });
    assert.match(l.stdout, /^\*\s+alpha/m);
    assert.doesNotMatch(l.stdout, /^\*\s+beta/m);

    const sw = await runCLI(["registry", "set-default", "beta"], { cwd });
    assert.equal(sw.code, 0, sw.stderr);

    l = await runCLI(["registry", "list"], { cwd });
    assert.match(l.stdout, /^\*\s+beta/m);
    assert.doesNotMatch(l.stdout, /^\*\s+alpha/m);

    // Unknown name errors.
    const err = await runCLI(["registry", "set-default", "ghost"], { cwd });
    assert.notEqual(err.code, 0);
    assert.match(err.stderr, /not configured/);
    assert.match(err.stderr, /Available:.*alpha.*beta/);
  } finally {
    await rmTmp(cwd);
  }
});

test("registry add: invalid name rejected", async () => {
  const cwd = await mkTmp("forgent-reg-badname-");
  try {
    const r = await runCLI(
      ["registry", "add", "../evil", "https://x/"],
      { cwd },
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /invalid registry name/);
    // No config file written.
    await assert.rejects(
      () => fsp.access(path.join(cwd, "forgent.config.json")),
    );
  } finally {
    await rmTmp(cwd);
  }
});

test("registry: missing verb errors with usage", async () => {
  const cwd = await mkTmp("forgent-reg-noverb-");
  try {
    const r = await runCLI(["registry"], { cwd });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /needs a verb/);
    assert.match(r.stderr, /list.*add.*remove.*set-default/);
  } finally {
    await rmTmp(cwd);
  }
});

// --- Resolution tests: prove --registry/env take precedence in name-or-url forms.

test("resolution: --registry <name> resolves to configured url", async () => {
  // Stage two on-disk fixture registries with distinct skill names so we can
  // tell which one was hit by inspecting `list` output.
  const cwd = await mkTmp("forgent-reg-resname-");
  const regA = await mkTmp("forgent-reg-A-");
  const regB = await mkTmp("forgent-reg-B-");
  try {
    await seedRegistry(regA, { skillName: "alpha-skill" });
    await seedRegistry(regB, { skillName: "beta-skill" });

    await runCLI(["registry", "add", "alpha", regA], { cwd });
    await runCLI(["registry", "add", "beta", regB, "--default"], { cwd });

    // Default (beta) hit when no --registry.
    const def = await runCLI(["list"], { cwd });
    assert.equal(def.code, 0, def.stderr);
    assert.match(def.stdout, /beta-skill/);
    assert.doesNotMatch(def.stdout, /alpha-skill/);

    // --registry alpha (name) → resolves to alpha url.
    const named = await runCLI(["list", "--registry", "alpha"], { cwd });
    assert.equal(named.code, 0, named.stderr);
    assert.match(named.stdout, /alpha-skill/);
    assert.doesNotMatch(named.stdout, /beta-skill/);
  } finally {
    await rmTmp(cwd);
    await rmTmp(regA);
    await rmTmp(regB);
  }
});

test("resolution: --registry <raw-path> bypasses config lookup", async () => {
  const cwd = await mkTmp("forgent-reg-resraw-");
  const regCfg = await mkTmp("forgent-reg-cfg-");
  try {
    await seedRegistry(regCfg, { skillName: "cfg-skill" });
    await runCLI(["registry", "add", "configured", regCfg, "--default"], { cwd });

    // Pass a raw filesystem path that isn't in config — should be used as-is.
    const r = await runCLI(["list", "--registry", FIXTURE_REGISTRY], { cwd });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /commit/);
    assert.doesNotMatch(r.stdout, /cfg-skill/);
  } finally {
    await rmTmp(cwd);
    await rmTmp(regCfg);
  }
});

test("resolution: FORGENT_REGISTRY <name> resolves to configured url", async () => {
  const cwd = await mkTmp("forgent-reg-resenv-");
  const regA = await mkTmp("forgent-reg-envA-");
  try {
    await seedRegistry(regA, { skillName: "env-skill" });
    await runCLI(["registry", "add", "from-env", regA], { cwd });

    const r = await runCLI(["list"], {
      cwd,
      env: { FORGENT_REGISTRY: "from-env" },
    });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /env-skill/);
  } finally {
    await rmTmp(cwd);
    await rmTmp(regA);
  }
});

test("resolution: FORGENT_REGISTRY raw path bypasses config", async () => {
  const cwd = await mkTmp("forgent-reg-resenvraw-");
  try {
    // Config has a named registry but the env passes a raw fixture path that
    // is NOT a configured name — must be treated as literal.
    await runCLI(
      ["registry", "add", "fixture", "https://unused.example/", "--default"],
      { cwd },
    );
    const r = await runCLI(["list"], {
      cwd,
      env: { FORGENT_REGISTRY: FIXTURE_REGISTRY },
    });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /commit/);
  } finally {
    await rmTmp(cwd);
  }
});

test("backward-compat: legacy config with only {provider} keeps working", async () => {
  const cwd = await mkTmp("forgent-reg-legacy-");
  try {
    await fsp.writeFile(
      path.join(cwd, "forgent.config.json"),
      JSON.stringify({ provider: "claude" }, null, 2) + "\n",
      "utf8",
    );

    // list against a legacy config should say "no registries configured".
    const l = await runCLI(["registry", "list"], { cwd });
    assert.equal(l.code, 0, l.stderr);
    assert.match(l.stdout, /no registries configured/);

    // Any registry-aware operation should still fall through to the built-in
    // default URL. Use --registry to point at the local fixture for a real run.
    const r = await runCLI(["list", "--registry", FIXTURE_REGISTRY], { cwd });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /commit/);

    // The config file must not have been rewritten — original keys only.
    const cfg = await readConfig(cwd);
    assert.deepEqual(Object.keys(cfg), ["provider"]);
  } finally {
    await rmTmp(cwd);
  }
});
