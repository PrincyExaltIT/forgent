# forgent

> Forge your agent's skills.

A shadcn/ui-style installer for **AI agent skills**. Pick a skill from a
remote registry, copy the source into your agent's local skills directory,
and own the copy. Supports Claude Code, GitHub Copilot, OpenAI Codex CLI,
and Cursor.

```bash
npx forgent add --provider claude angular-review
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
npx forgent add --provider claude angular-review
```

Or install globally:

```bash
npm install -g forgent
forgent add --provider claude angular-review
```

Requires Node 18+ (uses the global `fetch`).

## Quick tour

```console
$ npx forgent list
angular-review                        Multi-reviewer Angular code audit (security, architecture, performance, a11y/errors, optional project-compliance) on the current branch or a specified diff, with optional empirical DOM validation via the Playwright MCP server.
angular-review-kata-rendering-events  Variant of angular-review pre-wired for the R-KATA Rendering Events brief: embeds R-KATA-001..013 rules (positioning time-to-pixels, overlap, responsiveness). Otherwise identical to angular-review.

$ npx forgent add --provider claude angular-review
added angular-review (claude) -> ~/.claude/skills/angular-review

$ cat forgent.lock.json
{
  "lockfileVersion": 1,
  "skills": {
    "angular-review": {
      "registry": { "name": "agent-skill", "version": "0.3.1", "source": "https://raw.../main" },
      "skillVersion": "0.1.2",
      "provider": "claude",
      "installedAt": "2026-05-26T10:46:33.021Z",
      "files": [{ "path": "SKILL.md", "sha256": "d095f575..." }, ...]
    }
  }
}

$ npx forgent verify --provider claude
OK   angular-review/SKILL.md
OK   angular-review/ORCHESTRATION.md
...
verified 1 skill(s)
```

A scripted version of this tour lives in [`demo/`](./demo/) — `demo/demo-script.sh`
plus a [terminalizer](https://github.com/faressoft/terminalizer) config to
regenerate the GIF when commands change. The `demo/` folder is git-only; it does
not ship to npm.

## Supported providers

| Provider   | Default install dir (per OS)                                           | File layout                          |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------ |
| `claude`   | `~/.claude/skills/<name>/SKILL.md`                                     | folder per skill, whole source copied |
| `copilot`  | `<VS Code user dir>/prompts/<name>.prompt.md`                          | single file, source `SKILL.md` renamed |
| `codex`    | `~/.codex/skills/<name>.md` *(see caveat below)*                       | single file                           |
| `cursor`   | `~/.cursor/rules/<name>.mdc`                                           | single file                           |

`copilot` install dir per OS:
- **Windows**: `%APPDATA%\Code\User\prompts`
- **macOS**: `~/Library/Application Support/Code/User/prompts`
- **Linux**: `~/.config/Code/User/prompts`

### Caveat: Codex

OpenAI Codex CLI does not have a native **named-skill loader** the way Claude
does. The `codex` provider writes files to `~/.codex/skills/<name>.md` as a
convention so they live in a predictable place — Codex will not auto-load them.
You include them by referencing the file from your `AGENTS.md`. If you want
auto-included global rules instead, paste the content into `~/.codex/AGENTS.md`
yourself; this CLI deliberately does not mutate that shared file.

### Caveat: frontmatter

Each provider expects slightly different frontmatter on its skill/prompt/rule
file. The registry ships skills with Claude-style frontmatter (`name`,
`description`, `user_invocable`). After `add`, you may need to adjust
frontmatter for Copilot (`mode`, `tools`), Codex (none required), or Cursor
(`globs`, `alwaysApply`). Since you own the copy, edit it freely.

### Pre-rendered provider variants

If a skill's source folder ships a `<name>.prompt.md` (Copilot) or
`<name>.codex.md` (Codex) alongside `SKILL.md`, forgent installs that variant
instead of `SKILL.md` for the matching provider. Use this when you want to
ship hand-tuned content per provider — frontmatter, prompt style, tool list —
without asking users to edit after install. The `claude` provider copies the
whole skill folder, so it always has access to every file. `cursor` currently
has no variant convention and always uses `SKILL.md`.

## Usage

```bash
# inspect what's available
npx forgent providers
npx forgent list
npx forgent info angular-review

# install for a specific provider
npx forgent add --provider claude angular-review angular-review-kata-rendering-events
npx forgent add --provider copilot angular-review

# pin to an exact version (registry must declare items[].version)
npx forgent add --provider claude angular-review@0.1.0

# verify installed files match the lockfile (no network)
npx forgent verify --provider claude

# uninstall
npx forgent remove --provider claude angular-review

# persist a default provider for this directory
npx forgent init --provider claude
# subsequent calls don't need --provider
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
writing — a mismatch aborts with both hashes in the error. When absent, you
get one `WARN` per skill and the install proceeds. To refuse any install
without a sha256, pass `--strict-sha256` (or set `FORGENT_STRICT_SHA256=1`).

`forgent add foo@1.2.3` pins to an exact version. The registry must declare
`items[].version`; otherwise the install errors with a clear message. Use
this when you want the same skill version across machines or CI runs.

Each successful `add` records what was installed in `forgent.lock.json`
next to `forgent.config.json`. Shape:

```json
{
  "lockfileVersion": 1,
  "skills": {
    "angular-review": {
      "registry": { "name": "agent-skill", "version": "0.1.0", "source": "https://raw.../main" },
      "skillVersion": "0.1.0",
      "provider": "claude",
      "installedAt": "2026-05-26T14:32:11.000Z",
      "files": [{ "path": "SKILL.md", "sha256": "..." }]
    }
  }
}
```

Commit the lockfile to your repo and run `forgent verify` in CI to confirm
nobody (and nothing) has touched the installed skill files since `add`.
`verify` re-hashes each installed file against the lockfile and exits 1 on
any mismatch — no network, purely local.

`forgent remove` deletes the matching entry. `--dry-run` skips the write.

> **fs-mode caveat:** when `--registry` is a local path, the install is a
> whole-directory copy and per-file fetch verification is skipped. The
> lockfile is still written and `verify` still works against installed files.

## Commands

- `forgent providers` — list supported providers and their default install dirs.
- `forgent list` — list every skill in the registry with its description.
- `forgent info <name>` — show one skill's metadata and the files that would be copied.
- `forgent add --provider <p> <name>[@<version>]...` — copy one or more skills into provider `<p>`'s install dir. Refuses to overwrite unless `--force`. Pinning to `@<version>` requires the registry to declare `items[].version`.
- `forgent remove --provider <p> <name>` — delete an installed skill from provider `<p>`'s install dir.
- `forgent init [--provider <p>] [--dest <d>]` — persist defaults in `forgent.config.json` so future commands don't need the flag.
- `forgent validate-registry` — load and validate the registry manifest (fail-fast for CI). Honors `--registry`.
- `forgent verify` — re-hash installed files against `forgent.lock.json` and report any drift. Exits 1 on FAIL. No network.
- `forgent hash-files [--registry <path>]` — walk a local registry, compare each manifest `sha256` against the on-disk file, and exit 1 on any MISMATCH or MISSING entry. Local-only utility for registry authors keeping `sha256` fields in sync. HTTP registries are rejected.
- `forgent validate-skill <name>` — read each `skill:example` `.json` file declared by the skill, fetch its `$schema` (when present), and validate. Hand-rolled minimal validator covers `type`, `required`, `properties`, `additionalProperties:false`, `enum`, `pattern`, `minLength`, `minimum`, `items`, and local `$ref` (`#/$defs/...`). Unknown keywords emit one `WARN` and are skipped. Examples without `$schema` are skipped (info, not failure).
- `forgent doctor` — diagnose the local install: Node version, OS/arch, provider, install dir writability, registry reachability.

## Flags

- `--provider <name>` — required for `add` / `remove` unless persisted via `forgent.config.json` or the `FORGENT_PROVIDER` env var.
- `--registry <url|path>` — override the registry source. Accepts an HTTPS URL (e.g. your own GitHub raw URL) or a local filesystem path. Default: the bundled community registry hosted on GitHub.
- `--dest <path>` — override the install directory (otherwise: provider default, or `FORGENT_INSTALL_DIR`, or `forgent.config.json`).
- `--force` — overwrite an existing install on `add`.
- `--dry-run` — print what would happen, write nothing.
- `--strict-sha256` — refuse to install any file whose manifest entry omits a sha256. Same as `FORGENT_STRICT_SHA256=1`.

## Resolution order

For provider: `--provider` flag → `FORGENT_PROVIDER` env → `forgent.config.json` → error.
For install dir: `--dest` flag → `FORGENT_INSTALL_DIR` env → `forgent.config.json` → provider's default.
For registry: `--registry` flag → `FORGENT_REGISTRY` env → built-in default URL.

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
are relative to `<base>/skills/<item.name>/`. `files[].type` is a closed enum
(`skill:main`, `skill:doc`, `skill:codex`, `skill:copilot`, `skill:example`,
`skill:reference`, `skill:template`). The full JSON Schema is at
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

## License

MIT
