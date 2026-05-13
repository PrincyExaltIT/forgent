#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runInit } from "../src/commands/init.js";
import { runList } from "../src/commands/list.js";
import { runInfo } from "../src/commands/info.js";
import { runAdd } from "../src/commands/add.js";
import { runRemove } from "../src/commands/remove.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");

const HELP = `skills — shadcn-style installer for Claude Code skills

Usage:
  skills init               Create a skills.config.json in the current dir
  skills list               Show every skill available in the registry
  skills info <name>        Show one skill's description and files
  skills add <name>...      Copy one or more skills into your install dir
  skills remove <name>      Delete an installed skill from your install dir
  skills help               Show this help text

Flags:
  --registry <path>         Override the registry directory
                            (default: bundled registry/ in this package)
  --dest <path>             Override the install directory
                            (default: skills.config.json -> "installDir",
                             else ~/.claude/skills)
  --force                   Overwrite an existing skill on add
  --dry-run                 Print what would happen, change nothing

Principle (same as shadcn/ui):
  Skills are not "installed" as dependencies. \`add\` copies the source
  files into your install dir. You own the copy and can edit it freely.
`;

function parseArgs(argv) {
  const flags = { registry: null, dest: null, force: false, dryRun: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--registry") flags.registry = argv[++i];
    else if (a === "--dest") flags.dest = argv[++i];
    else if (a === "--force") flags.force = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "-h" || a === "--help") positional.push("help");
    else positional.push(a);
  }
  return { flags, positional };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseArgs(rest);

  const ctx = {
    projectRoot: PROJECT_ROOT,
    cwd: process.cwd(),
    flags,
  };

  switch (command) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      console.log(HELP);
      return;
    case "init":
      await runInit(ctx);
      return;
    case "list":
      await runList(ctx);
      return;
    case "info":
      if (positional.length === 0) {
        console.error("error: `skills info` needs a skill name");
        process.exit(2);
      }
      await runInfo(ctx, positional[0]);
      return;
    case "add":
      if (positional.length === 0) {
        console.error("error: `skills add` needs at least one skill name");
        process.exit(2);
      }
      await runAdd(ctx, positional);
      return;
    case "remove":
      if (positional.length === 0) {
        console.error("error: `skills remove` needs a skill name");
        process.exit(2);
      }
      await runRemove(ctx, positional[0]);
      return;
    default:
      console.error(`error: unknown command "${command}"`);
      console.error(HELP);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(`skills: ${err.message}`);
  process.exit(1);
});
