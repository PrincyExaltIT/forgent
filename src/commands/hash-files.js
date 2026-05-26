import fs from "node:fs/promises";
import { loadRegistry, resolveRegistryBase, sha256OfString } from "../registry.js";
import { safeJoin } from "../path-safety.js";

export async function runHashFiles(ctx) {
  const resolved = resolveRegistryBase(ctx);
  if (resolved.kind !== "fs") {
    console.error(
      `hash-files only works against a local registry path (got: ${resolved.base})`,
    );
    process.exit(1);
  }
  const registry = await loadRegistry(ctx);

  let totalFiles = 0;
  let matches = 0;
  let mismatches = 0;
  let missing = 0;

  for (const item of registry.items) {
    console.log(item.name);
    const files = Array.isArray(item.files) ? item.files : [];
    for (const fileEntry of files) {
      const file = typeof fileEntry === "string" ? { path: fileEntry } : fileEntry;
      totalFiles++;
      const skillRoot = safeJoin(registry.base, `skills/${item.name}`);
      const target = safeJoin(skillRoot, file.path);
      console.log(`  ${file.path}`);
      let body;
      try {
        body = await fs.readFile(target, "utf8");
      } catch (err) {
        console.log(`    manifest: ${file.sha256 || "(none)"}`);
        console.log(`    computed: ERROR (${err.code || err.message})`);
        mismatches++;
        continue;
      }
      const computed = sha256OfString(body);
      const declared = file.sha256;
      console.log(`    manifest: ${declared || "(none)"}`);
      if (!declared) {
        console.log(`    computed: ${computed}   MISSING — add to manifest`);
        missing++;
      } else if (declared === computed) {
        console.log(`    computed: ${computed}`);
        console.log(`    match`);
        matches++;
      } else {
        console.log(`    computed: ${computed}   MISMATCH — update manifest`);
        mismatches++;
      }
    }
  }

  console.log(
    `\n${registry.items.length} items / ${totalFiles} files / ${matches} matches / ${mismatches} mismatches / ${missing} missing-from-manifest`,
  );
  if (mismatches > 0 || missing > 0) process.exit(1);
}
