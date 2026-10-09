import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInstallDir } from "../config.js";
import { getProvider } from "../providers/index.js";
import { decodeInstallPath, readLockfile, lockfilePath } from "../lockfile.js";

async function sha256OfFile(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

// Paths compare case-insensitively on Windows.
const samePath = (p) => (process.platform === "win32" ? path.normalize(p).toLowerCase() : path.normalize(p));

/** Re-hash one install target against its recorded files. Returns the number of failures. */
async function verifyTarget(skillName, target, files) {
  let fails = 0;
  let stat;
  try {
    stat = await fs.stat(target);
  } catch (err) {
    console.log(`FAIL ${skillName}: install target missing at ${target} (${err.code || err.message})`);
    return 1;
  }

  if (stat.isDirectory()) {
    for (const file of files) {
      const onDisk = path.join(target, file.path);
      try {
        const actual = await sha256OfFile(onDisk);
        if (actual === file.sha256) {
          console.log(`OK   ${skillName}/${file.path}`);
        } else {
          console.log(`FAIL ${skillName}/${file.path}: expected ${file.sha256}, got ${actual}`);
          fails++;
        }
      } catch (err) {
        console.log(`FAIL ${skillName}/${file.path}: ${err.code || err.message}`);
        fails++;
      }
    }
    return fails;
  }

  if (files.length !== 1) {
    console.log(
      `FAIL ${skillName}: lockfile records ${files.length} files but install target is a single file (${target})`,
    );
    return 1;
  }
  const actual = await sha256OfFile(target);
  if (actual === files[0].sha256) {
    console.log(`OK   ${skillName} (${path.basename(target)})`);
    return 0;
  }
  console.log(`FAIL ${skillName} (${path.basename(target)}): expected ${files[0].sha256}, got ${actual}`);
  return 1;
}

export async function runVerify(ctx) {
  const lock = await readLockfile(ctx.cwd);
  const skillNames = Object.keys(lock.skills);
  if (skillNames.length === 0) {
    console.log(`no lockfile to verify (${lockfilePath(ctx.cwd)} is empty or absent)`);
    return;
  }

  // --provider (one or a comma list) and --dest narrow the check to matching installs.
  const providerFilter = ctx.flags.provider
    ? new Set(String(ctx.flags.provider).split(",").map((p) => p.trim()).filter(Boolean))
    : null;
  const destFilter = ctx.flags.dest ? samePath(path.resolve(ctx.cwd, ctx.flags.dest)) : null;

  let fails = 0;
  let installsChecked = 0;
  for (const skillName of skillNames.sort()) {
    const entry = lock.skills[skillName];

    if (Array.isArray(entry.installs) && entry.installs.length > 0) {
      // forgent >= 1.1: every install records where it lives.
      const installs = entry.installs.filter((install) => {
        const target = decodeInstallPath(ctx.cwd, install.path);
        if (providerFilter && !providerFilter.has(install.provider)) return false;
        if (destFilter && samePath(path.dirname(target)) !== destFilter) return false;
        return true;
      });
      for (const install of installs) {
        const target = decodeInstallPath(ctx.cwd, install.path);
        if (entry.installs.length > 1) console.log(`--   ${skillName} (${install.provider}) ${install.path}`);
        fails += await verifyTarget(skillName, target, install.files);
        installsChecked++;
      }
      continue;
    }

    // forgent 1.0 lockfile: the location comes from the flags, env or config.
    const provider = getProvider(entry.provider);
    const installDir = await resolveInstallDir({ ...ctx, flags: { ...ctx.flags } }, provider);
    fails += await verifyTarget(skillName, provider.targetPath(installDir, skillName), entry.files);
    installsChecked++;
  }

  if (installsChecked === 0) {
    console.log(
      `no install in ${lockfilePath(ctx.cwd)} matches --provider ${ctx.flags.provider ?? "*"} --dest ${ctx.flags.dest ?? "*"}`,
    );
    process.exit(1);
  }
  if (fails > 0) {
    console.log(`\n${fails} failure(s)`);
    process.exit(1);
  }
  console.log(`\nverified ${skillNames.length} skill(s), ${installsChecked} install(s)`);
}
