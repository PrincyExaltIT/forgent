// forgent 1.1: the Agent Skills folder provider, project/user scope, several providers at once,
// installs recorded in the lockfile, and the legacy single-file providers' warning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { BIN, mkTmp, pathExists, rmTmp, sha256Hex, writeText } from "./_helpers.js";

function runCLI(args, { env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, ...env }, cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

/** A registry with one folder skill: SKILL.md plus a script, a reference, an asset, a config and an eval. */
async function seedFolderSkill(root, skillName = "folder-skill") {
  const files = {
    "SKILL.md": `---\nname: ${skillName}\ndescription: Folder skill ${skillName}\n---\n\nRun scripts/run.mjs.\n`,
    "scripts/run.mjs": "console.log('ok');\n",
    "references/RULES.md": "# Rules\n",
    "assets/template.md": "# Template\n",
    "agents/openai.yaml": "policy:\n  allow_implicit_invocation: true\n",
    "evals/triggers.json": "{\"should_trigger\": []}\n",
  };
  const types = {
    "SKILL.md": "skill:main",
    "scripts/run.mjs": "skill:script",
    "references/RULES.md": "skill:reference",
    "assets/template.md": "skill:asset",
    "agents/openai.yaml": "skill:config",
    "evals/triggers.json": "skill:eval",
  };
  for (const [p, body] of Object.entries(files)) await writeText(path.join(root, "skills", skillName, p), body);
  const manifest = {
    name: "test",
    version: "0.0.0",
    items: [{
      name: skillName,
      version: "1.0.0",
      description: `Folder skill ${skillName}`,
      files: Object.entries(files).map(([p, body]) => ({ path: p, type: types[p], sha256: sha256Hex(body) })),
    }],
  };
  await writeText(path.join(root, "registry.json"), JSON.stringify(manifest, null, 2));
  return { skillName, files };
}

async function withTmp(fn) {
  const registry = await mkTmp("forgent-as-reg-");
  const cwd = await mkTmp("forgent-as-cwd-");
  const home = await mkTmp("forgent-as-home-");
  // HOME and USERPROFILE point to a scratch home, so user-scope installs never touch the real one.
  const env = { HOME: home, USERPROFILE: home, FORGENT_REGISTRY: registry };
  try {
    await fn({ registry, cwd, home, env });
  } finally {
    await rmTmp(registry);
    await rmTmp(cwd);
    await rmTmp(home);
  }
}

test("agents: installs the whole folder in the project's .agents/skills by default", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    const { skillName, files } = await seedFolderSkill(registry);
    const r = await runCLI(["add", "--provider", "agents", skillName], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    for (const p of Object.keys(files)) {
      assert.ok(await pathExists(path.join(cwd, ".agents", "skills", skillName, p)), `${p} installed`);
    }
    const lock = await readJson(path.join(cwd, "forgent.lock.json"));
    assert.equal(lock.lockfileVersion, 1);
    assert.equal(lock.skills[skillName].provider, "agents");
    assert.deepEqual(lock.skills[skillName].installs.map((i) => i.path), [`.agents/skills/${skillName}`]);
    assert.equal(lock.skills[skillName].installs[0].files.length, Object.keys(files).length);
  });
});

test("agents --user installs in ~/.agents/skills and records a ~/ path", async () => {
  await withTmp(async ({ registry, cwd, home, env }) => {
    const { skillName } = await seedFolderSkill(registry);
    const r = await runCLI(["add", "--provider", "agents", "--user", skillName], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(home, ".agents", "skills", skillName, "SKILL.md")));
    const lock = await readJson(path.join(cwd, "forgent.lock.json"));
    assert.equal(lock.skills[skillName].installs[0].path, `~/.agents/skills/${skillName}`);
  });
});

test("claude --project installs in the project's .claude/skills", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    const { skillName } = await seedFolderSkill(registry);
    const r = await runCLI(["add", "--provider", "claude", "--project", skillName], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(cwd, ".claude", "skills", skillName, "scripts", "run.mjs")));
  });
});

test("agents,claude --project: one fetch, two installs, both in the lockfile, verify checks both", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    const { skillName } = await seedFolderSkill(registry);
    const r = await runCLI(["add", "--provider", "agents,claude", "--project", skillName], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /added folder-skill \(agents\)/);
    assert.match(r.stdout, /added folder-skill \(claude\)/);
    const lock = await readJson(path.join(cwd, "forgent.lock.json"));
    assert.deepEqual(
      lock.skills[skillName].installs.map((i) => `${i.provider}:${i.path}`),
      [`agents:.agents/skills/${skillName}`, `claude:.claude/skills/${skillName}`],
    );

    const ok = await runCLI(["verify"], { cwd, env });
    assert.equal(ok.code, 0, ok.stdout);
    assert.match(ok.stdout, /verified 1 skill\(s\), 2 install\(s\)/);

    // Tamper with the Claude copy only.
    await fs.writeFile(path.join(cwd, ".claude", "skills", skillName, "scripts", "run.mjs"), "process.exit(1)\n");
    const bad = await runCLI(["verify"], { cwd, env });
    assert.equal(bad.code, 1);
    assert.match(bad.stdout, /FAIL folder-skill\/scripts\/run\.mjs/);

    // --provider narrows the check: the agents copy is still clean.
    const onlyAgents = await runCLI(["verify", "--provider", "agents"], { cwd, env });
    assert.equal(onlyAgents.code, 0, onlyAgents.stdout);
    assert.match(onlyAgents.stdout, /1 install\(s\)/);
  });
});

test("remove of one provider keeps the other install in the lockfile", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    const { skillName } = await seedFolderSkill(registry);
    assert.equal((await runCLI(["add", "--provider", "agents,claude", "--project", skillName], { cwd, env })).code, 0);
    const r = await runCLI(["remove", "--provider", "claude", "--project", skillName], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(await pathExists(path.join(cwd, ".claude", "skills", skillName)), false);
    const lock = await readJson(path.join(cwd, "forgent.lock.json"));
    assert.equal(lock.skills[skillName].provider, "agents");
    assert.deepEqual(lock.skills[skillName].installs.map((i) => i.provider), ["agents"]);
    const v = await runCLI(["verify"], { cwd, env });
    assert.equal(v.code, 0, v.stdout);

    // Removing the last install forgets the skill.
    assert.equal((await runCLI(["remove", "--provider", "agents", skillName], { cwd, env })).code, 0);
    const after = await readJson(path.join(cwd, "forgent.lock.json"));
    assert.equal(after.skills[skillName], undefined);
  });
});

test("--dest with several providers is refused", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    const { skillName } = await seedFolderSkill(registry);
    const r = await runCLI(["add", "--provider", "agents,claude", "--dest", "skills", skillName], { cwd, env });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--dest sets one directory, but 2 providers were given/);
  });
});

test("legacy single-file provider: --project is refused with a pointer to agents", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    const { skillName } = await seedFolderSkill(registry);
    const r = await runCLI(["add", "--provider", "cursor", "--project", skillName], { cwd, env });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /not supported by this legacy single-file provider/);
    assert.match(r.stderr, /--provider agents/);
  });
});

test("legacy single-file provider warns when the skill ships more than one file", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    const { skillName } = await seedFolderSkill(registry);
    const dest = path.join(cwd, "rules");
    const r = await runCLI(["add", "--provider", "cursor", "--dest", dest, skillName], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /cursor installs a single file; folder-skill also ships 5 other file\(s\)/);
    assert.match(r.stderr, /will NOT be installed/);
    assert.ok(await pathExists(path.join(dest, `${skillName}.mdc`)));
  });
});

test("new file types (script, asset, config, eval) pass validate-registry", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    await seedFolderSkill(registry);
    const r = await runCLI(["validate-registry", "--registry", registry], { cwd, env });
    assert.equal(r.code, 0, r.stderr || r.stdout);
  });
});

test("a forgent 1.0 lockfile (no installs) still verifies with --provider/--dest", async () => {
  await withTmp(async ({ cwd, env }) => {
    const dest = path.join(cwd, "skills");
    const body = "---\nname: old\ndescription: Old\n---\n";
    await writeText(path.join(dest, "old", "SKILL.md"), body);
    const lock = {
      lockfileVersion: 1,
      skills: {
        old: {
          registry: { name: "test", version: "0.0.0", source: "x" },
          skillVersion: null,
          provider: "claude",
          installedAt: "2026-05-26T00:00:00.000Z",
          files: [{ path: "SKILL.md", sha256: sha256Hex(body) }],
        },
      },
    };
    await writeText(path.join(cwd, "forgent.lock.json"), JSON.stringify(lock, null, 2));
    const r = await runCLI(["verify", "--provider", "claude", "--dest", dest], { cwd, env });
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /OK\s+old\/SKILL\.md/);
  });
});

test("a provider list separated by a space works (PowerShell passes agents,claude as \"agents claude\")", async () => {
  await withTmp(async ({ registry, cwd, env }) => {
    const { skillName } = await seedFolderSkill(registry);
    const r = await runCLI(["add", "--provider", "agents claude", "--project", skillName], { cwd, env });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(cwd, ".agents", "skills", skillName, "SKILL.md")));
    assert.ok(await pathExists(path.join(cwd, ".claude", "skills", skillName, "SKILL.md")));
    const v = await runCLI(["verify", "--provider", "agents claude"], { cwd, env });
    assert.equal(v.code, 0, v.stdout);
    assert.match(v.stdout, /2 install\(s\)/);
  });
});
