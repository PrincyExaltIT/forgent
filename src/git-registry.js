import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Git registries: `git+https://host/group/registry.git[#ref]`.
 *
 * forgent fetches the registry repository with git into its cache, then reads
 * registry.json and the skill files from that checkout. Authentication is git's
 * own: the user's credential helper (asked once, stored by the OS), or, for CI,
 * FORGENT_GIT_USER + FORGENT_GIT_TOKEN, handed to git through an inline helper
 * that reads them from the environment (the token never appears in argv, in
 * forgent.config.json or in forgent.lock.json). Credentials inside the URL are
 * refused for the same reason.
 */

const GIT_PREFIX = /^git\+/i;
const MIN_GIT_TIMEOUT_MS = 120_000;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;

export function isGitRegistry(value) {
  return typeof value === "string" && GIT_PREFIX.test(value);
}

export function parseGitRegistry(raw) {
  const spec = raw.replace(GIT_PREFIX, "");
  const hashAt = spec.indexOf("#");
  const url = hashAt === -1 ? spec : spec.slice(0, hashAt);
  const ref = hashAt === -1 ? null : spec.slice(hashAt + 1) || null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`invalid git registry URL: ${raw}`);
  }
  if (!["https:", "http:", "ssh:", "file:"].includes(parsed.protocol)) {
    throw new Error(
      `git registry URL must use https, http, ssh or file, got "${parsed.protocol}" in ${raw}`,
    );
  }
  if (parsed.password || (parsed.username && parsed.protocol !== "ssh:")) {
    throw new Error(
      "git registry URL must not contain credentials (they would end up in forgent.config.json " +
        "and forgent.lock.json). Let git's credential helper ask once, or set FORGENT_GIT_USER " +
        "and FORGENT_GIT_TOKEN.",
    );
  }
  if (ref !== null && (!SAFE_REF.test(ref) || ref.startsWith("-") || ref.includes(".."))) {
    throw new Error(`invalid git ref "${ref}" in ${raw}`);
  }
  return { url, ref };
}

/** The URL as it may be written down: no credentials, `git+` prefix, optional ref. */
export function gitRegistryLabel(url, ref) {
  return `git+${url}${ref ? `#${ref}` : ""}`;
}

export function forgentCacheRoot() {
  if (process.env.FORGENT_CACHE_DIR) return path.resolve(process.env.FORGENT_CACHE_DIR);
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "forgent", "cache");
  }
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(base, "forgent");
}

function gitTimeoutMs() {
  const raw = Number.parseInt(process.env.FORGENT_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? Math.max(raw, MIN_GIT_TIMEOUT_MS) : MIN_GIT_TIMEOUT_MS;
}

function credentialArgs() {
  if (!process.env.FORGENT_GIT_TOKEN) return [];
  // The helper body only names the variables: git's shell expands them, so the
  // token stays in the environment and never shows in the process list.
  return [
    "-c",
    "credential.helper=",
    "-c",
    'credential.helper=!f() { echo "username=${FORGENT_GIT_USER:-oauth2}"; echo "password=${FORGENT_GIT_TOKEN}"; }; f',
  ];
}

function runGit(args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    // Without a terminal, a credential prompt would hang: fail fast instead.
    if (!process.stdin.isTTY) env.GIT_TERMINAL_PROMPT = "0";
    let child;
    try {
      child = spawn("git", [...credentialArgs(), ...args], {
        env,
        windowsHide: true,
        stdio: ["inherit", capture ? "pipe" : "ignore", "pipe"],
      });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), gitTimeoutMs());
    if (capture) child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new Error("git registries need git on PATH (https://git-scm.com/downloads)"));
      } else reject(err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else if (signal) reject(new Error(`git ${args[0] === "-C" ? args[2] : args[0]} timed out`));
      else reject(new Error(stderr.trim() || `git exited with code ${code}`));
    });
  });
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bring the cached checkout of a git registry to the requested ref (default:
 * the remote HEAD) and return where it is and which commit it is at.
 */
export async function syncGitRegistry(raw) {
  const { url, ref } = parseGitRegistry(raw);
  const key = createHash("sha256").update(`${url}#${ref ?? ""}`).digest("hex").slice(0, 16);
  const dir = path.join(forgentCacheRoot(), "registries", key);
  await fs.mkdir(dir, { recursive: true });
  if (!(await exists(path.join(dir, ".git")))) {
    await runGit(["init", "--quiet", dir]);
  }
  // Byte-exact checkout: the manifest's sha256 are computed on the published
  // bytes. No CRLF conversion (core.autocrlf on Windows), whatever the
  // registry's .gitattributes say (info/attributes takes precedence).
  await runGit(["-C", dir, "config", "core.autocrlf", "false"]);
  await fs.mkdir(path.join(dir, ".git", "info"), { recursive: true });
  await fs.writeFile(path.join(dir, ".git", "info", "attributes"), "* -text\n", "utf8");
  try {
    await runGit(["-C", dir, "fetch", "--quiet", "--depth", "1", "--no-tags", url, ref ?? "HEAD"]);
  } catch (err) {
    throw new Error(
      `cannot fetch git registry ${gitRegistryLabel(url, ref)}: ${err.message}\n` +
        "If the repository is private: let git's credential helper store your username and token " +
        "(run a `git clone` of it once), or set FORGENT_GIT_USER and FORGENT_GIT_TOKEN.",
    );
  }
  await runGit(["-C", dir, "checkout", "--quiet", "--force", "--detach", "FETCH_HEAD"]);
  await runGit(["-C", dir, "clean", "--quiet", "-fdx"]);
  const commit = (await runGit(["-C", dir, "rev-parse", "HEAD"], { capture: true })).trim();
  return { dir, url, ref, commit, source: `git+${url}#${commit}` };
}
