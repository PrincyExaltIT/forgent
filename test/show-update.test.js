// forgent 1.2: read a skill before installing it (show), confirm skills that ship scripts,
// compare installs with the registry (outdated) and update them without clobbering local edits (update).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { BIN, mkTmp, pathExists, rmTmp, sha256Hex, writeText } from "./_helpers.js";

function runCLI(args, { env = {}, cwd, input = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, ...env }, cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

/** (Re)write a registry with one skill at `version`; `scriptBody` changes the script's content. */
async function seedSkill(root, { version = "1.0.0", scriptBody = "console.log('v1');\n", skillName = "tool" } = {}) {
  const files = {
    "SKILL.md": `---\nname: ${skillName}\ndescription: Tool skill\n---\n\nRun scripts/run.mjs.\n`,
    "scripts/run.mjs": scriptBody,
    "references/RULES.md": "# Rules\n",
  };
  await fs.rm(path.join(root, "skills", skillName), { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) await writeText(path.join(root, "skills", skillName, p), body);
  const manifest = {
    name: "test",
    version: "0.0.0",
    items: [{
      name: skillName,
      version,
      description: "Tool skill",
      files: Object.entries(files).map(([p, body]) => ({ path: p, sha256: sha256Hex(body) })),
    }],
  };
  await writeText(path.join(root, "registry.json"), JSON.stringify(manifest, null, 2));
  return { skillName };
}

async function withTmp(fn) {
  const registry = await mkTmp("forgent-12-reg-");
  const cwd = await mkTmp("forgent-12-cwd-");
  const home = await mkTmp("forgent-12-home-");
  const env = { HOME: home, USERPROFILE: home, FORGENT_REGISTRY: registry, FORGENT_INTERACTIVE: "0" };
  try {
    await fn({ registry, cwd, home, env });
  } finally {
    await rmTmp(registry);
    await rmTmp(cwd);
    await rmTmp(home);
  }
}

test("show: prints SKILL.md and flags scripts, installs nothing", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    const r = await runCLI(["show", "tool"], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /name\s+tool@1\.0\.0/);
    assert.match(r.stdout, /files\s+3, of which 1 script\(s\)/);
    assert.match(r.stdout, /! scripts\/run\.mjs/);
    assert.match(r.stdout, /Run scripts\/run\.mjs\./);
    assert.doesNotMatch(r.stdout, /console\.log\('v1'\)/, "script body only with --all");
    assert.equal(await pathExists(path.join(cwd, "forgent.lock.json")), false);
    assert.equal(await pathExists(path.join(cwd, ".agents")), false);
  });
});

test("show --all prints every file, scripts included", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    const r = await runCLI(["show", "tool", "--all"], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /scripts\/run\.mjs {2}\(script\)/);
    assert.match(r.stdout, /console\.log\('v1'\)/);
  });
});

test("add: a skill with scripts is confirmed interactively; « n » installs nothing", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    const r = await runCLI(["add", "--provider", "agents", "tool"], { cwd, env: { ...env, FORGENT_INTERACTIVE: "1" }, input: "n\n" });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /tool ships 1 script\(s\) your agent can run on your machine: scripts\/run\.mjs/);
    assert.match(r.stdout, /skipped tool: not installed/);
    assert.equal(await pathExists(path.join(cwd, ".agents", "skills", "tool")), false);
  });
});

test("add: « y » installs, and --yes skips the question", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    const yes = await runCLI(["add", "--provider", "agents", "tool"], { cwd, env: { ...env, FORGENT_INTERACTIVE: "1" }, input: "y\n" });
    assert.equal(yes.code, 0, yes.stderr);
    assert.ok(await pathExists(path.join(cwd, ".agents", "skills", "tool", "scripts", "run.mjs")));
    const flag = await runCLI(["add", "--provider", "claude", "--project", "--yes", "tool"], { cwd, env: { ...env, FORGENT_INTERACTIVE: "1" } });
    assert.equal(flag.code, 0, flag.stderr);
    assert.doesNotMatch(flag.stderr, /anyway\?/);
    assert.ok(await pathExists(path.join(cwd, ".claude", "skills", "tool", "SKILL.md")));
  });
});

test("add without a terminal (CI) prints the notice and installs, as in 1.1", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    const r = await runCLI(["add", "--provider", "agents", "tool"], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /notice: tool ships 1 script/);
    assert.ok(await pathExists(path.join(cwd, ".agents", "skills", "tool", "SKILL.md")));
  });
});

test("outdated: up to date exits 0, a new registry version exits 1", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    assert.equal((await runCLI(["add", "--provider", "agents", "tool"], { cwd, env })).code, 0);
    const ok = await runCLI(["outdated"], { cwd, env });
    assert.equal(ok.code, 0, ok.stdout);
    assert.match(ok.stdout, /tool\s+1\.0\.0\s+1\.0\.0\s+up to date/);

    await seedSkill(registry, { version: "1.1.0", scriptBody: "console.log('v2');\n" });
    const behind = await runCLI(["outdated"], { cwd, env });
    assert.equal(behind.code, 1);
    assert.match(behind.stdout, /tool\s+1\.0\.0\s+1\.1\.0\s+outdated/);
  });
});

test("outdated: same version but different published files is « changed »", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    assert.equal((await runCLI(["add", "--provider", "agents", "tool"], { cwd, env })).code, 0);
    await seedSkill(registry, { version: "1.0.0", scriptBody: "console.log('silently changed');\n" });
    const r = await runCLI(["outdated"], { cwd, env });
    assert.equal(r.code, 1);
    assert.match(r.stdout, /tool\s+1\.0\.0\s+1\.0\.0\s+changed/);
  });
});

test("update: brings every recorded install to the new version and keeps verify green", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    assert.equal((await runCLI(["add", "--provider", "agents,claude", "--project", "tool"], { cwd, env })).code, 0);
    await seedSkill(registry, { version: "1.1.0", scriptBody: "console.log('v2');\n" });

    const dry = await runCLI(["update", "--dry-run"], { cwd, env });
    assert.equal(dry.code, 0, dry.stdout);
    assert.match(dry.stdout, /tool 1\.0\.0 -> 1\.1\.0: 1 changed/);
    assert.match(dry.stdout, /~ scripts\/run\.mjs/);
    assert.match(await fs.readFile(path.join(cwd, ".agents", "skills", "tool", "scripts", "run.mjs"), "utf8"), /v1/);

    const r = await runCLI(["update"], { cwd, env });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 skill\(s\) updated/);
    for (const dir of [".agents", ".claude"]) {
      assert.match(await fs.readFile(path.join(cwd, dir, "skills", "tool", "scripts", "run.mjs"), "utf8"), /v2/);
    }
    const lock = await readJson(path.join(cwd, "forgent.lock.json"));
    assert.equal(lock.skills.tool.skillVersion, "1.1.0");
    assert.deepEqual(lock.skills.tool.installs.map((i) => i.skillVersion), ["1.1.0", "1.1.0"]);
    const v = await runCLI(["verify"], { cwd, env });
    assert.equal(v.code, 0, v.stdout);
    assert.equal((await runCLI(["outdated"], { cwd, env })).code, 0);
  });
});

test("update: leaves a locally edited install alone unless --force", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    assert.equal((await runCLI(["add", "--provider", "agents", "tool"], { cwd, env })).code, 0);
    const mine = path.join(cwd, ".agents", "skills", "tool", "references", "RULES.md");
    await fs.writeFile(mine, "# Rules\n- my team's rule\n");
    await seedSkill(registry, { version: "1.1.0", scriptBody: "console.log('v2');\n" });

    const r = await runCLI(["update"], { cwd, env });
    assert.equal(r.code, 1);
    assert.match(r.stdout, /tool: local changes, not updated \(--force overwrites them\)/);
    assert.match(r.stdout, /references\/RULES\.md modified/);
    assert.match(await fs.readFile(mine, "utf8"), /my team's rule/);

    const forced = await runCLI(["update", "--force"], { cwd, env });
    assert.equal(forced.code, 0, forced.stdout);
    assert.doesNotMatch(await fs.readFile(mine, "utf8"), /my team's rule/);
  });
});

test("update of a skill that is not installed is an error", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedSkill(registry);
    const r = await runCLI(["update", "tool"], { cwd, env });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /tool is not in forgent\.lock\.json/);
  });
});
