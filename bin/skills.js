#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runInit } from "../src/commands/init.js";
import { runList } from "../src/commands/list.js";
import { runInfo } from "../src/commands/info.js";
import { runAdd } from "../src/commands/add.js";
import { runRemove } from "../src/commands/remove.js";
import { runProviders } from "../src/commands/providers.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");

const HELP = `skills — shadcn-style installer for AI agent skills
              (Claude Code, GitHub Copilot, OpenAI Codex CLI, Cursor)

Usage:
  skills providers                          List supported providers
  skills list                               List skills in the registry
  skills info <name>                        Show one skill's metadata + files
  skills add --provider <p> <name>...       Copy skills into <p>'s install dir
  skills remove --provider <p> <name>       Delete an installed skill
  skills init [--provider <p>] [--dest <d>] Persist defaults in skills.config.json
  skills help                               Show this help text

Flags:
  --provider <name>     Target provider: claude | copilot | codex | cursor.
                        Required for add/remove unless persisted via
                        skills.config.json or SKILLS_PROVIDER env var.
  --registry <path>     Override the registry directory.
                        Default: bundled registry/ next to the CLI.
  --dest <path>         Override the install directory.
                        Default: provider's own default location, or value
                        from SKILLS_INSTALL_DIR / skills.config.json.
  --force               Overwrite an existing skill on add.
  --dry-run             Print what would happen, change nothing.

Principle (same as shadcn/ui):
  Skills are not "installed" as dependencies. \`add\` copies the source files
  into your provider's install dir. You own the copy and can edit it freely.
`;

function parseArgs(argv) {
  const flags = {
    provider: null,
    registry: null,
    dest: null,
    force: false,
    dryRun: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider") flags.provider = argv[++i];
    else if (a === "--registry") flags.registry = argv[++i];
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
    case "providers":
      await runProviders();
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
