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
npx forgent add --provider cursor angular-review

# uninstall
npx forgent remove --provider claude angular-review

# persist a default provider for this directory
npx forgent init --provider claude
# subsequent calls don't need --provider
npx forgent add angular-review
```

## Commands

- `forgent providers` — list supported providers and their default install dirs.
- `forgent list` — list every skill in the registry with its description.
- `forgent info <name>` — show one skill's metadata and the files that would be copied.
- `forgent add --provider <p> <name>...` — copy one or more skills into provider `<p>`'s install dir. Refuses to overwrite unless `--force`.
- `forgent remove --provider <p> <name>` — delete an installed skill from provider `<p>`'s install dir.
- `forgent init [--provider <p>] [--dest <d>]` — persist defaults in `forgent.config.json` so future commands don't need the flag.

## Flags

- `--provider <name>` — required for `add` / `remove` unless persisted via `forgent.config.json` or the `FORGENT_PROVIDER` env var.
- `--registry <url|path>` — override the registry source. Accepts an HTTPS URL (e.g. your own GitHub raw URL) or a local filesystem path. Default: the bundled community registry hosted on GitHub.
- `--dest <path>` — override the install directory (otherwise: provider default, or `FORGENT_INSTALL_DIR`, or `forgent.config.json`).
- `--force` — overwrite an existing install on `add`.
- `--dry-run` — print what would happen, write nothing.

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
  "$schema": "https://forgent.dev/schema/registry.json",
  "name": "default",
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

Paths in `files[].path` are relative to `<base>/skills/<item.name>/`. The
shape is intentionally close to [shadcn/ui's registry schema](https://github.com/shadcn-ui/registry-template)
so concepts transfer.

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
- **Not a package manager.** No lockfile, no version resolution, no update command. Re-run `add --force` to fetch the latest registry version, knowing it will overwrite your local edits.

## License

MIT
