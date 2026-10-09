#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";

import { runInit } from "../src/commands/init.js";
import { runList } from "../src/commands/list.js";
import { runInfo } from "../src/commands/info.js";
import { runAdd } from "../src/commands/add.js";
import { runRemove } from "../src/commands/remove.js";
import { runProviders } from "../src/commands/providers.js";
import { runRegistry } from "../src/commands/registry.js";
import { runValidateRegistry } from "../src/commands/validate-registry.js";
import { runDoctor } from "../src/commands/doctor.js";
import { runVerify } from "../src/commands/verify.js";
import { runHashFiles } from "../src/commands/hash-files.js";
import { runValidateSkill } from "../src/commands/validate-skill.js";
import { VERSION } from "../src/version.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");

const HELP = `forgent — shadcn-style installer for AI agent skills
              (any Agent Skills harness: Codex, GitHub Copilot, Cursor, Gemini CLI,
               OpenCode, Kilo Code, Claude Code, and many others)

Usage:
  forgent providers                          List supported providers
  forgent list                               List skills in the registry
  forgent info <name>                        Show one skill's metadata + files
  forgent add --provider <p> <name>[@v]...   Copy skills into <p>'s install dir
                                             e.g. --provider agents,claude --project
  forgent remove --provider <p> <name>       Delete an installed skill
  forgent init [--provider <p>] [--dest <d>] Persist defaults in forgent.config.json
  forgent registry <verb> [args]             Manage named registries (see below)
  forgent validate-registry                  Validate the registry manifest
  forgent verify                             Re-hash every install recorded in forgent.lock.json
  forgent hash-files [--registry <path>]     Diff manifest sha256 vs computed (local registry)
  forgent validate-skill <name>              Validate a skill's JSON examples against their $schema
  forgent doctor                             Diagnose the local install + registry
  forgent --version | -V | version           Print the forgent version
  forgent help                               Show this help text

Registries:
  forgent registry list                      Print configured registries (* = default)
  forgent registry add <name> <url|path>     Append; name = kebab-case
                          [--default] [--force]
  forgent registry remove <name>             Drop one (clears default if it was)
  forgent registry set-default <name>        Mark one as default

  Resolution order for the active registry:
    1. --registry <value>      (name match in config, else literal url/path)
    2. FORGENT_REGISTRY env    (name match in config, else literal url/path)
    3. forgent.config.json defaultRegistry (by name)
    4. built-in default URL

Flags:
  --provider <names>    Target provider(s), comma-separated:
                          agents   the Agent Skills folder (.agents/skills), read by
                                   Codex, Copilot, Cursor, Gemini CLI, OpenCode, Kilo Code…
                          claude   Claude Code's folder (.claude/skills), also Continue
                          copilot | codex | cursor   legacy single file (drops scripts)
                        "agents,claude" covers every harness. Required for add/remove
                        unless persisted via forgent.config.json or FORGENT_PROVIDER.
                        On verify, narrows the check to those providers.
  --project             Install inside the project (commit it for the team):
                        agents -> .agents/skills (its default), claude -> .claude/skills.
  --user                Install in your home directory: claude -> ~/.claude/skills
                        (its default), agents -> ~/.agents/skills.
  --registry <url|path> Override the registry source. Accepts a configured
                        registry name, an HTTPS URL, or a local filesystem
                        path. Default: forgent.config.json defaultRegistry,
                        or the bundled community registry hosted on GitHub.
  --dest <path>         Override the install directory (one provider at a time).
                        Default: FORGENT_INSTALL_DIR / forgent.config.json, else
                        the provider's folder for the chosen scope.
                        On verify, narrows the check to installs in that directory.
  --force               Overwrite an existing skill on add, or an existing
                        registry entry on \`registry add\`.
  --default             On \`registry add\`, also mark the new entry default.
  --dry-run             Print what would happen, change nothing.
  --strict-sha256       (Default since 1.0.) Refuse to install any file whose
                        manifest entry does not declare a sha256. Kept as an
                        explicit no-op for scripts that pin pre-1.0 behaviour.
  --no-strict-sha256    Opt out of strict mode: install with a one-time WARN
                        when the manifest omits a sha256. Same as
                        FORGENT_STRICT_SHA256=0. Use only as a migration crutch
                        for registries that have not adopted sha256 yet.

Versioning:
  \`forgent add foo@1.2.3\` pins to that exact version. The registry must
  declare items[].version for the skill; otherwise the install errors.
  Without a pin, forgent installs whatever the registry currently serves.

Principle (same as shadcn/ui):
  Skills are not "installed" as dependencies. \`add\` copies the source files
  into your provider's install dir. You own the copy and can edit it freely.
  forgent.lock.json records each install (where, which version, sha256 of every
  file): commit it with a project install, and run \`forgent verify\` in CI.
`;

function parseArgs(argv) {
  const flags = {
    provider: null,
    registry: null,
    dest: null,
    force: false,
    dryRun: false,
    // null = no CLI opinion (strict is the default; FORGENT_STRICT_SHA256=0
    // can still opt out). true = explicit opt-in (kept as a no-op since
    // strict is the default). false = explicit opt-out via --no-strict-sha256.
    strictSha256: null,
    makeDefault: false,
    // "project" | "user" | null (each provider has its own default).
    scope: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider") flags.provider = argv[++i];
    else if (a === "--registry") flags.registry = argv[++i];
    else if (a === "--dest") flags.dest = argv[++i];
    else if (a === "--project") flags.scope = "project";
    else if (a === "--user") flags.scope = "user";
    else if (a === "--force") flags.force = true;
    else if (a === "--default") flags.makeDefault = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--strict-sha256") flags.strictSha256 = true;
    else if (a === "--no-strict-sha256") flags.strictSha256 = false;
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
    case "version":
    case "--version":
    case "-V":
      console.log(VERSION);
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
        console.error("error: `forgent info` needs a skill name");
        process.exit(2);
      }
      await runInfo(ctx, positional[0]);
      return;
    case "add":
      if (positional.length === 0) {
        console.error("error: `forgent add` needs at least one skill name");
        process.exit(2);
      }
      await runAdd(ctx, positional);
      return;
    case "remove":
      if (positional.length === 0) {
        console.error("error: `forgent remove` needs a skill name");
        process.exit(2);
      }
      await runRemove(ctx, positional[0]);
      return;
    case "registry":
      await runRegistry(ctx, positional);
      return;
    case "validate-registry":
      await runValidateRegistry(ctx);
      return;
    case "verify":
      await runVerify(ctx);
      return;
    case "hash-files":
      await runHashFiles(ctx);
      return;
    case "validate-skill":
      if (positional.length === 0) {
        console.error("error: `forgent validate-skill` needs a skill name");
        process.exit(2);
      }
      await runValidateSkill(ctx, positional[0]);
      return;
    case "doctor":
      await runDoctor(ctx);
      return;
    default:
      console.error(`error: unknown command "${command}"`);
      console.error(HELP);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(`forgent: ${err.message}`);
  process.exit(1);
});
