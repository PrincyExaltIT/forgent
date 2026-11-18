import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BIN, mkTmp, pathExists, readText, rmTmp, seedRegistry, sha256Hex, writeText } from "./_helpers.js";
import { parseGitRegistry } from "../src/git-registry.js";
import { DEFAULT_REGISTRY } from "../src/registry.js";

let hasGit = true;
try {
  execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
  hasGit = false;
}
const needsGit = { skip: hasGit ? false : "git is not on PATH" };

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=forgent-test", "-c", "user.email=test@forgent", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();
}

/** A registry in a git repository, with sha256 on every file (strict mode). */
async function makeGitRegistry(opts = {}) {
  const repo = await mkTmp("forgent-git-reg-");
  await seedRegistry(repo, { withSha256: true, itemVersion: "1.0.0", ...opts });
  git(repo, "init", "--quiet", "-b", "main");
  git(repo, "add", "-A");
  git(repo, "commit", "--quiet", "-m", "registry 1.0.0");
  return { repo, url: `git+${pathToFileURL(repo).href}` };
}

/** Publish a new version of the skill in the registry repository. */
async function publish(repo, skillName, version, body) {
  const fullBody = `---\nname: ${skillName}\ndescription: Test skill ${skillName}\n---\n\n${body}`;
  await writeText(path.join(repo, "skills", skillName, "SKILL.md"), fullBody);
  const manifest = JSON.parse(await readText(path.join(repo, "registry.json")));
  manifest.items[0].version = version;
  manifest.items[0].files[0].sha256 = sha256Hex(fullBody);
  await writeText(path.join(repo, "registry.json"), JSON.stringify(manifest, null, 2));
  git(repo, "add", "-A");
  git(repo, "commit", "--quiet", "-m", `registry ${version}`);
}

async function setup() {
  const app = await mkTmp("forgent-git-app-");
  const cache = await mkTmp("forgent-git-cache-");
  return { app, cache };
}

function run(app, cache, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: app,
      env: { ...process.env, FORGENT_CACHE_DIR: cache, FORGENT_REGISTRY: "", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function readLock(app) {
  return JSON.parse(await readText(path.join(app, "forgent.lock.json")));
}

test("git registry: add installs from a git+file registry and records the commit", needsGit, async () => {
  const { repo, url } = await makeGitRegistry();
  const { app, cache } = await setup();
  try {
    const r = await run(app, cache, ["add", "--registry", url, "--provider", "agents", "--project", "demo"]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(app, ".agents", "skills", "demo", "SKILL.md")));
    const lock = await readLock(app);
    const head = git(repo, "rev-parse", "HEAD");
    assert.equal(lock.skills.demo.registry.source, `${url}#${head}`);
    assert.equal(lock.skills.demo.skillVersion, "1.0.0");
    const v = await run(app, cache, ["verify"]);
    assert.equal(v.code, 0, v.stderr);
  } finally {
    await Promise.all([rmTmp(repo), rmTmp(app), rmTmp(cache)]);
  }
});

test("git registry: a file whose sha256 does not match the manifest is refused", needsGit, async () => {
  const { repo, url } = await makeGitRegistry();
  const { app, cache } = await setup();
  try {
    await writeText(path.join(repo, "skills", "demo", "SKILL.md"), "tampered\n");
    git(repo, "commit", "--quiet", "-am", "tamper");
    const r = await run(app, cache, ["add", "--registry", url, "--provider", "agents", "--project", "demo"]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /sha256 mismatch/);
  } finally {
    await Promise.all([rmTmp(repo), rmTmp(app), rmTmp(cache)]);
  }
});

test("git registry: outdated and update follow new commits; a #tag stays put", needsGit, async () => {
  const { repo, url } = await makeGitRegistry();
  const { app, cache } = await setup();
  try {
    git(repo, "tag", "v1");
    let r = await run(app, cache, ["add", "--registry", url, "--provider", "agents", "--project", "demo"]);
    assert.equal(r.code, 0, r.stderr);
    await publish(repo, "demo", "1.1.0", "hello again\n");

    r = await run(app, cache, ["outdated", "--registry", `${url}#v1`]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /up to date/);

    r = await run(app, cache, ["outdated", "--registry", url]);
    assert.match(r.stdout, /1\.1\.0/);

    r = await run(app, cache, ["update", "--registry", url]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(await readText(path.join(app, ".agents", "skills", "demo", "SKILL.md")), /hello again/);
    const lock = await readLock(app);
    assert.equal(lock.skills.demo.skillVersion, "1.1.0");
    assert.equal(lock.skills.demo.registry.source, `${url}#${git(repo, "rev-parse", "HEAD")}`);
  } finally {
    await Promise.all([rmTmp(repo), rmTmp(app), rmTmp(cache)]);
  }
});

test("git registry: a configured default git registry serves plain `forgent add`", needsGit, async () => {
  const { repo, url } = await makeGitRegistry();
  const { app, cache } = await setup();
  try {
    let r = await run(app, cache, ["registry", "add", "formation", url, "--default"]);
    assert.equal(r.code, 0, r.stderr);
    const config = JSON.parse(await readText(path.join(app, "forgent.config.json")));
    assert.equal(config.defaultRegistry, "formation");
    r = await run(app, cache, ["add", "--provider", "agents", "--project", "demo"]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(await pathExists(path.join(app, ".agents", "skills", "demo", "SKILL.md")));
  } finally {
    await Promise.all([rmTmp(repo), rmTmp(app), rmTmp(cache)]);
  }
});

test("git registry: credentials in the URL are refused, nothing is written", async () => {
  const { app, cache } = await setup();
  try {
    let r = await run(app, cache, ["registry", "add", "x", "git+https://user:secret@gitlab.example/a/b.git"]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /must not contain credentials/);
    assert.equal(await pathExists(path.join(app, "forgent.config.json")), false);

    r = await run(app, cache, ["registry", "add", "y", "https://user:secret@example.com/registry"]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /must not contain credentials/);

    r = await run(app, cache, ["list", "--registry", "git+https://token@gitlab.example/a/b.git"]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /must not contain credentials/);
  } finally {
    await Promise.all([rmTmp(app), rmTmp(cache)]);
  }
});

test("git registry: an unreachable repository explains how to authenticate", needsGit, async () => {
  const { app, cache } = await setup();
  const missing = pathToFileURL(path.join(app, "no-such-registry")).href;
  try {
    const r = await run(app, cache, ["list", "--registry", `git+${missing}`]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /cannot fetch git registry/);
    assert.match(r.stderr, /FORGENT_GIT_TOKEN/);
  } finally {
    await Promise.all([rmTmp(app), rmTmp(cache)]);
  }
});

test("git registry: URL parsing", () => {
  assert.deepEqual(parseGitRegistry("git+https://gitlab.com/g/r.git#v1.2"), { url: "https://gitlab.com/g/r.git", ref: "v1.2" });
  assert.deepEqual(parseGitRegistry("git+https://gitlab.com/g/r.git"), { url: "https://gitlab.com/g/r.git", ref: null });
  assert.equal(parseGitRegistry("git+ssh://git@gitlab.com/g/r.git").ref, null);
  assert.throws(() => parseGitRegistry("git+https://gitlab.com/g/r.git#--upload-pack=x"), /invalid git ref/);
  assert.throws(() => parseGitRegistry("git+https://gitlab.com/g/r.git#a..b"), /invalid git ref/);
  assert.throws(() => parseGitRegistry("git+ftp://example.com/r.git"), /must use https/);
  assert.throws(() => parseGitRegistry("git+not a url"), /invalid git registry URL/);
});

test("default registry: the private Skill Issue registry, over git, without credentials", () => {
  assert.ok(DEFAULT_REGISTRY.startsWith("git+https://"), DEFAULT_REGISTRY);
  const { url, ref } = parseGitRegistry(DEFAULT_REGISTRY);
  assert.equal(url, "https://gitlab.com/skill-issue-formation/agent-skill.git");
  assert.equal(ref, null);
});
