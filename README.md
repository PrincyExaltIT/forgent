# forgent

> Forge your agent's skills.

A shadcn/ui-style installer for **AI agent skills**. Pick a skill from a
remote registry, copy the source into your agent's skills folder, and own the
copy. Works with any harness that reads the [Agent Skills](https://agentskills.io)
standard — Codex, GitHub Copilot, Cursor, Gemini CLI, OpenCode, Kilo Code,
Claude Code, and many others, including your team's own tools.

```bash
# in your project: one folder for most harnesses, one for Claude Code
npx forgent add --provider agents,claude --project angular-review
```

## The principle (same as shadcn/ui)

shadcn/ui is not an npm dependency — it is a **registry of components** plus a
CLI that **copies the source** into your project. You own the code afterwards.

`forgent` brings the same model to AI agent skills. Pick a skill from the
registry, run `forgent add --provider <name> <skill>`, and the source markdown
is copied into your agent's local skills directory under a provider-appropriate
filename. The CLI then steps out — your copy is yours to edit.

| shadcn/ui                                       | forgent                                                   |
| ----------------------------------------------- | --------------------------------------------------------- |
| `components.json` config in the project         | `forgent.config.json` in your cwd (optional)              |
| Remote registry served over HTTPS               | Remote registry served over HTTPS                          |
| `npx shadcn add button`                         | `npx forgent add --provider claude angular-review`         |
| Source copied into `src/components/ui`          | Source copied into your provider's skills/prompts/rules dir |
| You own the file                                | Same — your copy is yours                                 |

## Install

No install needed — invoke with `npx`:

```bash
npx forgent add --provider agents,claude --project angular-review
```

Or install globally:

```bash
npm install -g forgent
forgent add --provider agents angular-review
```

Requires Node 18+ (uses the global `fetch`).

## Quick tour

```console
$ npx forgent list
angular-review                        Senior-level review of Angular changes — a branch, a PR/MR, staged files or a commit range …
angular-review-kata-rendering-events  Variant of angular-review pre-wired for the R-KATA Rendering Events brief …

$ npx forgent add --provider agents,claude --project angular-review
added angular-review (agents) -> ./.agents/skills/angular-review
added angular-review (claude) -> ./.claude/skills/angular-review

$ cat forgent.lock.json
{
  "lockfileVersion": 1,
  "skills": {
    "angular-review": {
      "registry": { "name": "agent-skill", "version": "0.5.0", "source": "https://raw.../main" },
      "skillVersion": "2.1.0",
      "provider": "claude",
      "installedAt": "2026-10-09T14:02:11.000Z",
      "files": [{ "path": "SKILL.md", "sha256": "…" }, …],
      "installs": [
        { "provider": "agents", "path": ".agents/skills/angular-review", "skillVersion": "2.1.0", "files": […] },
        { "provider": "claude", "path": ".claude/skills/angular-review", "skillVersion": "2.1.0", "files": […] }
      ]
    }
  }
}

$ npx forgent verify
--   angular-review (agents) .agents/skills/angular-review
OK   angular-review/SKILL.md
OK   angular-review/scripts/scan.mjs
…
verified 1 skill(s), 2 install(s)
```

A scripted version of this tour lives in [`demo/`](./demo/) — `demo/demo-script.sh`
plus a [terminalizer](https://github.com/faressoft/terminalizer) config to
regenerate the GIF when commands change. The `demo/` folder is git-only; it does
not ship to npm.

## Supported providers

| Provider | Project (`--project`) | User (`--user`) | Layout | Read by |
| -------- | --------------------- | --------------- | ------ | ------- |
| `agents` | `.agents/skills/<name>/` **(default)** | `~/.agents/skills/<name>/` | whole skill folder | Codex, GitHub Copilot, Cursor, Gemini CLI, OpenCode, Kilo Code and most Agent Skills harnesses (user level: Codex; check yours) |
| `claude` | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` **(default)** | whole skill folder | Claude Code, Continue |
| `copilot` | — | `<VS Code user dir>/prompts/<name>.prompt.md` | single file *(legacy)* | Copilot prompt files |
| `codex` | — | `~/.codex/skills/<name>.md` | single file *(legacy)* | not loaded by Codex on its own |
| `cursor` | — | `~/.cursor/rules/<name>.mdc` | single file *(legacy)* | Cursor rules |

Pass several providers at once: `--provider agents,claude` fetches each skill
once and copies it into both folders — between them, every harness above.

### Which provider?

- **For a team**: `--provider agents,claude --project`, then commit the two
  folders and `forgent.lock.json`. Everyone gets the skill, whatever their tool.
- **For yourself**: `--provider claude` (Claude Code) or `--provider agents --user`.
- **Your tool is not listed?** If its docs talk about Agent Skills or
  `SKILL.md`, it reads a skills folder — usually `.agents/skills`: use
  `--provider agents`, or `--dest <its folder>`. If it does not know skills,
  point its instructions file (`AGENTS.md` or equivalent) at the installed
  `SKILL.md`.
- **The single-file providers** (`copilot`, `codex`, `cursor`) predate the
  standard and are kept for 1.x compatibility. They copy `SKILL.md` (or a
  pre-rendered variant) only: a skill that ships scripts, references or assets
  loses them, and forgent warns when that happens. Codex, Copilot and Cursor
  now read skill folders: prefer `--provider agents`.

`copilot` install dir per OS:
- **Windows**: `%APPDATA%\Code\User\prompts`
- **macOS**: `~/Library/Application Support/Code/User/prompts`
- **Linux**: `~/.config/Code/User/prompts`

### Caveat: frontmatter

Folder providers install the skill as published: harnesses that read the
Agent Skills standard all understand its frontmatter (`name`, `description`,
plus optional fields they ignore when unknown). For the legacy single-file
providers you may need to adjust frontmatter after `add`: Copilot prompts
(`mode`, `tools`), Cursor rules (`globs`, `alwaysApply`). Since you own the
copy, edit it freely.

### Pre-rendered provider variants

If a skill's source folder ships a `<name>.prompt.md` (Copilot) or
`<name>.codex.md` (Codex) alongside `SKILL.md`, forgent installs that variant
instead of `SKILL.md` for the matching provider. Use this when you want to
ship hand-tuned content per provider — frontmatter, prompt style, tool list —
without asking users to edit after install. The folder providers (`agents`,
`claude`) copy the whole skill folder, so they always have every file. `cursor`
currently has no variant convention and always uses `SKILL.md`.

## Usage

```bash
# inspect what's available
npx forgent providers
npx forgent list
npx forgent info angular-review

# a team install: committed in the project, read by every harness
npx forgent add --provider agents,claude --project angular-review

# a personal install
npx forgent add --provider claude angular-review          # ~/.claude/skills
npx forgent add --provider agents --user angular-review   # ~/.agents/skills

# pin to an exact version (registry must declare items[].version)
npx forgent add --provider agents angular-review@2.1.0

# verify every recorded install still matches the lockfile (no network)
npx forgent verify
npx forgent verify --provider agents      # only the agents installs

# uninstall one install (the other stays in the lockfile)
npx forgent remove --provider claude --project angular-review

# persist defaults for this directory
npx forgent init --provider agents,claude --project
# subsequent calls don't need the flags
npx forgent add angular-review
```

## Integrity & lockfile

Registries can ship a SHA256 for each file:

```json
{
  "files": [
    { "path": "SKILL.md", "type": "skill:main", "sha256": "abc...64-hex-chars..." }
  ]
}
```

When `sha256` is present, forgent verifies the fetched body matches before
writing — a mismatch aborts with both hashes in the error. When absent, the
install errors (strict mode is the default since 1.0). To opt out and fall
back to a one-time `WARN` per skill, pass `--no-strict-sha256` or set
`FORGENT_STRICT_SHA256=0`. Use the opt-out only as a migration crutch for
registries that have not adopted sha256 yet.

`forgent add foo@1.2.3` pins to an exact version. The registry must declare
`items[].version`; otherwise the install errors with a clear message. Use
this when you want the same skill version across machines or CI runs.

Each successful `add` records what was installed in `forgent.lock.json`
next to `forgent.config.json`. Since 1.1, each skill also lists its
`installs` — one per location, with the path relative to the project when it
is inside it (`~/…` under your home), so a committed lockfile works on every
machine. The top-level fields still describe the latest install, as in 1.0.
Shape:

```json
{
  "lockfileVersion": 1,
  "skills": {
    "angular-review": {
      "registry": { "name": "agent-skill", "version": "0.1.0", "source": "https://raw.../main" },
      "skillVersion": "0.1.0",
      "provider": "claude",
      "installedAt": "2026-05-26T14:32:11.000Z",
      "files": [{ "path": "SKILL.md", "sha256": "..." }],
      "installs": [
        { "provider": "agents", "path": ".agents/skills/angular-review", "skillVersion": "0.1.0", "installedAt": "…", "files": [ … ] }
      ]
    }
  }
}
```

Commit the lockfile to your repo and run `forgent verify` in CI to confirm
nobody (and nothing) has touched the installed skill files since `add`.
`verify` re-hashes every recorded install against the lockfile and exits 1 on
any mismatch — no network, purely local. `--provider` and `--dest` narrow the
check; a 1.0 lockfile (no `installs`) is checked at the location the flags,
`FORGENT_INSTALL_DIR` or `forgent.config.json` give, as before.

```yaml
# .github/workflows/skills.yml — fail the PR when an installed skill drifts
- uses: actions/checkout@v4
- run: npx --yes forgent@1 verify
```

`forgent remove` drops that install from the lockfile, and the whole entry
once no install is left. `--dry-run` skips the write.

> **fs-mode caveat:** when `--registry` is a local path, the install is a
> whole-directory copy and per-file fetch verification is skipped. The
> lockfile is still written and `verify` still works against installed files.

## Commands

- `forgent providers` — list supported providers, their default install dir and scope.
- `forgent list` — list every skill in the registry with its description.
- `forgent info <name>` — show one skill's metadata and the files that would be copied.
- `forgent add --provider <p>[,<p>…] <name>[@<version>]...` — copy one or more skills into each provider's install dir (`--project` / `--user` pick the scope). Refuses to overwrite unless `--force`. Pinning to `@<version>` requires the registry to declare `items[].version`. Warns when a single-file provider would drop part of a skill.
- `forgent remove --provider <p>[,<p>…] <name>` — delete an installed skill from each provider's install dir, and drop those installs from the lockfile.
- `forgent init [--provider <p>[,<p>…]] [--project|--user] [--dest <d>]` — persist defaults in `forgent.config.json` so future commands don't need the flags.
- `forgent registry list | add <name> <url> [--default] [--force] | remove <name> | set-default <name>` — manage named registries persisted in `forgent.config.json`. See [Multi-registry](#multi-registry).
- `forgent validate-registry` — load and validate the registry manifest (fail-fast for CI). Honors `--registry`.
- `forgent verify [--provider <p>[,<p>…]] [--dest <d>]` — re-hash every install recorded in `forgent.lock.json` and report any drift. Exits 1 on FAIL, or when no install matches the filters. No network.
- `forgent hash-files [--registry <path>]` — walk a local registry, compare each manifest `sha256` against the on-disk file, and exit 1 on any MISMATCH or MISSING entry. Local-only utility for registry authors keeping `sha256` fields in sync. HTTP registries are rejected.
- `forgent validate-skill <name>` — read each `skill:example` `.json` file declared by the skill, fetch its `$schema` (when present), and validate. Hand-rolled minimal validator covers `type`, `required`, `properties`, `additionalProperties:false`, `enum`, `pattern`, `minLength`, `minimum`, `items`, and local `$ref` (`#/$defs/...`). Unknown keywords emit one `WARN` and are skipped. Examples without `$schema` are skipped (info, not failure).
- `forgent doctor` — diagnose the local install: Node version, OS/arch, provider(s), install dir writability, registry reachability; warns about legacy single-file providers.

## Flags

- `--provider <names>` — one provider or a comma list (`agents,claude`). Required for `add` / `remove` unless persisted via `forgent.config.json` or the `FORGENT_PROVIDER` env var. On `verify`, narrows the check.
- `--project` / `--user` — install inside the project (`agents` default) or in your home directory (`claude` default). The single-file providers only support `--user`.
- `--registry <url|path>` — override the registry source. Accepts an HTTPS URL (e.g. your own GitHub raw URL) or a local filesystem path. Default: the bundled community registry hosted on GitHub.
- `--dest <path>` — override the install directory, one provider at a time (otherwise: `FORGENT_INSTALL_DIR`, `forgent.config.json`, then the provider's folder for the scope). On `verify`, narrows the check to installs in that directory.
- `--force` — overwrite an existing install on `add`.
- `--dry-run` — print what would happen, write nothing.
- `--strict-sha256` — (default since 1.0) refuse to install any file whose manifest entry omits a sha256. Same as `FORGENT_STRICT_SHA256=1`. Kept as an explicit no-op for scripts that want to pin the behaviour.
- `--no-strict-sha256` — opt out of strict mode: install with a one-time `WARN` per skill when the manifest omits a sha256. Same as `FORGENT_STRICT_SHA256=0`.

## Resolution order

For provider: `--provider` flag → `FORGENT_PROVIDER` env → `forgent.config.json` → error.
For install dir: `--dest` flag → `FORGENT_INSTALL_DIR` env → `forgent.config.json` `installDir` → the provider's folder for the scope (`--project` / `--user` → `forgent.config.json` `scope` → the provider's default scope).
For registry: `--registry` flag (configured name or raw URL/path) → `FORGENT_REGISTRY` env (same) → `forgent.config.json` `defaultRegistry` (by name) → built-in default URL. See [Multi-registry](#multi-registry).

## The registry

The default registry is hosted at
`https://raw.githubusercontent.com/PrincyExaltIT/agent-skill` (branch `main`).
forgent fetches `<base>/registry.json` for the manifest, then fetches each
declared skill file at `<base>/skills/<name>/<file>`.

### Manifest shape

```json
{
  "$schema": "https://raw.githubusercontent.com/PrincyExaltIT/forgent/main/schema/registry.schema.json",
  "name": "default",
  "version": "0.1.0",
  "items": [
    {
      "name": "angular-review",
      "description": "Multi-reviewer Angular code audit on the current branch or a specified diff.",
      "tags": ["angular", "code-review"],
      "files": [
        { "path": "SKILL.md", "type": "skill:main" },
        { "path": "ORCHESTRATION.md", "type": "skill:doc" }
      ]
    }
  ]
}
```

Top-level `name` and `version` (semver) are required. Paths in `files[].path`
are relative to `<base>/skills/<item.name>/`. `files[].type` is optional and,
when present, one of `skill:main`, `skill:doc`, `skill:codex`, `skill:copilot`,
`skill:example`, `skill:reference`, `skill:template`, and since 1.1
`skill:script`, `skill:asset`, `skill:config`, `skill:eval` — the rest of an
Agent Skills folder. The full JSON Schema is at
[`schema/registry.schema.json`](./schema/registry.schema.json) — point your
editor at it for autocomplete and validation. The shape is intentionally close
to [shadcn/ui's registry schema](https://github.com/shadcn-ui/registry-template)
so concepts transfer. Run `forgent validate-registry --registry <url|path>`
to fail-fast a manifest in CI.

### Host your own

Any HTTPS URL that serves `registry.json` and the corresponding
`skills/<name>/<file>` paths works as a registry. Point forgent at it:

```bash
npx forgent add --provider claude my-skill \
  --registry https://your-domain.com/registry
```

A local filesystem path also works — useful while authoring a registry
locally:

```bash
npx forgent --registry ./path/to/registry list
```

### Multi-registry

You can persist multiple named registries in `forgent.config.json` and mark
one as the default for this directory:

```bash
# add the public registry under a friendly name
npx forgent registry add official \
  https://raw.githubusercontent.com/PrincyExaltIT/agent-skill/main/ \
  --default

# add an internal one alongside
npx forgent registry add my-internal https://internal.corp/forgent-registry/

# inspect (the * marks the default)
npx forgent registry list
# * official      https://raw.githubusercontent.com/PrincyExaltIT/agent-skill/main/
#   my-internal   https://internal.corp/forgent-registry/

# switch the default
npx forgent registry set-default my-internal

# drop one
npx forgent registry remove my-internal
```

`forgent.config.json` after the two `add` calls:

```json
{
  "provider": "claude",
  "registries": [
    { "name": "official", "url": "https://raw.githubusercontent.com/PrincyExaltIT/agent-skill/main/" },
    { "name": "my-internal", "url": "https://internal.corp/forgent-registry/" }
  ],
  "defaultRegistry": "official"
}
```

`--registry <value>` and `FORGENT_REGISTRY` both accept a configured **name**
in addition to a raw URL or path. The full resolution order is:

1. `--registry <value>` — name match in config, else literal URL/path.
2. `FORGENT_REGISTRY` env — same.
3. `forgent.config.json` `defaultRegistry` (by name).
4. Built-in default URL.

Use `--force` on `registry add` to overwrite an existing entry. `--default`
on `registry add` makes the new entry the default in one step.

### Contribute a skill

Open a PR against
[PrincyExaltIT/agent-skill](https://github.com/PrincyExaltIT/agent-skill).

## Tests

```bash
npm test
```

Uses Node's built-in test runner (`node:test`) — no third-party deps. Covers
each provider adapter's install/remove/conflict/force/dry-run semantics, the
provider and install-dir resolution order, end-to-end CLI invocations against
the test fixture at `test/fixtures/registry/`, and end-to-end HTTP fetches against a local server.

## What this is not

- **Not a runtime.** After `add`, the CLI is uninvolved. Your agent reads the installed file directly.
- **Not a frontmatter translator.** The registry's frontmatter is Claude-shaped; you adjust per provider after install.
- **Not a full package manager.** There is a lockfile and exact-version pinning, but no semver range resolution, no transitive deps, no `update` command. To pull a newer version: re-run `add --force` (it will overwrite your local edits).

## Stability

forgent ≥ 1.0 follows [semver](https://semver.org/spec/v2.0.0.html). The
**public API** is:

- the CLI flag surface (`forgent --help`),
- the registry manifest schema ([`schema/registry.schema.json`](./schema/registry.schema.json)),
- the lockfile shape (`forgent.lock.json`, `lockfileVersion: 1`),
- and the documented exit codes (`0` success, `1` runtime error, `2` usage error).

Breaking changes to any of the above require a major version bump.

**Internal modules under `src/*.js` are NOT public.** If you import them
programmatically, pin to an exact major version — refactors there can land
in a minor.

The default registry URL
(`https://raw.githubusercontent.com/PrincyExaltIT/agent-skill`) is stable but
may move to a CDN domain post-1.0 without a major bump. Rewriting a `$schema`
URL or the default registry endpoint is non-breaking; the data shape at the
endpoint is what's covered by semver.

## License

MIT
