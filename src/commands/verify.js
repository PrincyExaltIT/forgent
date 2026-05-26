import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInstallDir } from "../config.js";
import { getProvider } from "../providers/index.js";
import { readLockfile, lockfilePath } from "../lockfile.js";

async function sha256OfFile(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export async function runVerify(ctx) {
  const lock = await readLockfile(ctx.cwd);
  const skillNames = Object.keys(lock.skills);
  if (skillNames.length === 0) {
    console.log(`no lockfile to verify (${lockfilePath(ctx.cwd)} is empty or absent)`);
    return;
  }

  let fails = 0;
  for (const skillName of skillNames.sort()) {
    const entry = lock.skills[skillName];
    const provider = getProvider(entry.provider);
    const installDir = await resolveInstallDir({ ...ctx, flags: { ...ctx.flags } }, provider);
    const target = provider.targetPath(installDir, skillName);

    let stat;
    try {
      stat = await fs.stat(target);
    } catch (err) {
      console.log(`FAIL ${skillName}: install target missing at ${target} (${err.code || err.message})`);
      fails++;
      continue;
    }

    if (stat.isDirectory()) {
      for (const file of entry.files) {
        const onDisk = path.join(target, file.path);
        try {
          const actual = await sha256OfFile(onDisk);
          if (actual === file.sha256) {
            console.log(`OK   ${skillName}/${file.path}`);
          } else {
            console.log(
              `FAIL ${skillName}/${file.path}: expected ${file.sha256}, got ${actual}`,
            );
            fails++;
          }
        } catch (err) {
          console.log(`FAIL ${skillName}/${file.path}: ${err.code || err.message}`);
          fails++;
        }
      }
    } else {
      if (entry.files.length !== 1) {
        console.log(
          `FAIL ${skillName}: lockfile records ${entry.files.length} files but install target is a single file (${target})`,
        );
        fails++;
        continue;
      }
      const file = entry.files[0];
      const actual = await sha256OfFile(target);
      if (actual === file.sha256) {
        console.log(`OK   ${skillName} (${path.basename(target)})`);
      } else {
        console.log(
          `FAIL ${skillName} (${path.basename(target)}): expected ${file.sha256}, got ${actual}`,
        );
        fails++;
      }
    }
  }

  if (fails > 0) {
    console.log(`\n${fails} failure(s)`);
    process.exit(1);
  }
  console.log(`\nverified ${skillNames.length} skill(s)`);
}
