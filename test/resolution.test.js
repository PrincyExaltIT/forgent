import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveInstallDir, resolveProviderName, writeConfig } from "../src/config.js";
import { mkTmp, rmTmp } from "./_helpers.js";

function makeCtx(cwd, flags = {}) {
  return { cwd, projectRoot: "/unused", flags: { provider: null, dest: null, ...flags } };
}

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === null) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

const fakeProvider = { name: "fake", defaultInstallDir: () => "/fake/default" };

test("resolveProviderName: --provider flag wins over everything", async () => {
  const cwd = await mkTmp("forgent-cfg-");
  try {
    await writeConfig(cwd, { provider: "fromconfig" });
    await withEnv({ FORGENT_PROVIDER: "fromenv" }, async () => {
      const name = await resolveProviderName(makeCtx(cwd, { provider: "fromflag" }));
      assert.equal(name, "fromflag");
    });
  } finally {
    await rmTmp(cwd);
  }
});

test("resolveProviderName: env beats config", async () => {
  const cwd = await mkTmp("forgent-cfg-");
  try {
    await writeConfig(cwd, { provider: "fromconfig" });
    await withEnv({ FORGENT_PROVIDER: "fromenv" }, async () => {
      const name = await resolveProviderName(makeCtx(cwd));
      assert.equal(name, "fromenv");
    });
  } finally {
    await rmTmp(cwd);
  }
});

test("resolveProviderName: config used when flag and env absent", async () => {
  const cwd = await mkTmp("forgent-cfg-");
  try {
    await writeConfig(cwd, { provider: "fromconfig" });
    await withEnv({ FORGENT_PROVIDER: null }, async () => {
      const name = await resolveProviderName(makeCtx(cwd));
      assert.equal(name, "fromconfig");
    });
  } finally {
    await rmTmp(cwd);
  }
});

test("resolveProviderName: null when nothing set", async () => {
  const cwd = await mkTmp("forgent-cfg-");
  try {
    await withEnv({ FORGENT_PROVIDER: null }, async () => {
      const name = await resolveProviderName(makeCtx(cwd));
      assert.equal(name, null);
    });
  } finally {
    await rmTmp(cwd);
  }
});

test("resolveInstallDir: --dest flag wins over env and config", async () => {
  const cwd = await mkTmp("forgent-cfg-");
  try {
    await writeConfig(cwd, { installDir: "/from/config" });
    await withEnv({ FORGENT_INSTALL_DIR: "/from/env" }, async () => {
      const dir = await resolveInstallDir(
        makeCtx(cwd, { dest: "/from/flag" }),
        fakeProvider,
      );
      assert.equal(dir, path.resolve(cwd, "/from/flag"));
    });
  } finally {
    await rmTmp(cwd);
  }
});

test("resolveInstallDir: env beats config", async () => {
  const cwd = await mkTmp("forgent-cfg-");
  try {
    await writeConfig(cwd, { installDir: "/from/config" });
    await withEnv({ FORGENT_INSTALL_DIR: "/from/env" }, async () => {
      const dir = await resolveInstallDir(makeCtx(cwd), fakeProvider);
      assert.equal(dir, path.resolve(cwd, "/from/env"));
    });
  } finally {
    await rmTmp(cwd);
  }
});

test("resolveInstallDir: config used when flag and env absent", async () => {
  const cwd = await mkTmp("forgent-cfg-");
  try {
    await writeConfig(cwd, { installDir: "/from/config" });
    await withEnv({ FORGENT_INSTALL_DIR: null }, async () => {
      const dir = await resolveInstallDir(makeCtx(cwd), fakeProvider);
      assert.equal(dir, path.resolve(cwd, "/from/config"));
    });
  } finally {
    await rmTmp(cwd);
  }
});

test("resolveInstallDir: provider default when nothing set", async () => {
  const cwd = await mkTmp("forgent-cfg-");
  try {
    await withEnv({ FORGENT_INSTALL_DIR: null }, async () => {
      const dir = await resolveInstallDir(makeCtx(cwd), fakeProvider);
      assert.equal(dir, "/fake/default");
    });
  } finally {
    await rmTmp(cwd);
  }
});

test("getProvider throws with available list on missing/unknown name", async () => {
  const { getProvider } = await import("../src/providers/index.js");
  assert.throws(() => getProvider(null), /--provider is required.*claude.*copilot.*codex.*cursor/s);
  assert.throws(() => getProvider("nope"), /unknown provider "nope".*claude/s);
});
