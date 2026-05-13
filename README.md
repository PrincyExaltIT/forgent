# skills-cli

A shadcn/ui-style installer for **AI agent skills**, supporting Claude Code,
GitHub Copilot, OpenAI Codex CLI, and Cursor.

## The principle (same as shadcn/ui)

shadcn/ui is not an npm dependency — it is a **registry of components** plus a
CLI that **copies the source** into your project. You own the code afterwards.

`skills-cli` brings the same model to AI agent skills. Pick a skill from the
registry, run `skills add --provider <name> <skill>`, and the source markdown
is copied into your agent's local skills directory under a provider-appropriate
filename. The CLI then steps out — your copy is yours to edit.

| shadcn/ui                                       | skills-cli                                                |
| ----------------------------------------------- | --------------------------------------------------------- |
| `components.json` config in the project         | `skills.config.json` in your cwd (optional)               |
| Registry of components                          | Registry of skills under `registry/skills/<name>/`        |
| `npx shadcn-ui@latest add button`               | `skills add --provider claude commit`                     |
| Source copied into `src/components/ui`          | Source copied into your provider's skills/prompts/rules dir |
| You own the file                                | Same — your copy is yours                                 |

## Supported providers

| Provider   | Default install dir (per OS, see notes)                                | File layout                          |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------ |
| `claude`   | `~/.claude/skills/<name>/SKILL.md`                                     | folder per skill, whole source copied |
| `copilot`  | `<VS Code user dir>/prompts/<name>.prompt.md`                          | single file, source `SKILL.md` renamed |
| `codex`    | `~/.codex/skills/<name>.md` *(custom — see caveat below)*              | single file                           |
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

## Usage

```bash
# inspect what's available
node bin/skills.js providers
node bin/skills.js list
node bin/skills.js info commit

# install for a specific provider
node bin/skills.js add --provider claude commit review
node bin/skills.js add --provider copilot commit
node bin/skills.js add --provider cursor commit

# uninstall
node bin/skills.js remove --provider claude commit

# persist a default provider for this directory
node bin/skills.js init --provider claude
# subsequent calls don't need --provider
node bin/skills.js add commit
```

Or, after `npm link` once, replace `node bin/skills.js` with `skills` globally.

## Commands

- `skills providers` — list supported providers and their default install dirs.
- `skills list` — list every skill in the registry with its description.
- `skills info <name>` — show one skill's metadata and the files that would be copied.
- `skills add --provider <p> <name>...` — copy one or more skills into provider `<p>`'s install dir. Refuses to overwrite unless `--force`.
- `skills remove --provider <p> <name>` — delete an installed skill from provider `<p>`'s install dir.
- `skills init [--provider <p>] [--dest <d>]` — persist defaults in `skills.config.json` so future commands don't need the flag.

## Flags

- `--provider <name>` — required for `add` / `remove` unless persisted via `skills.config.json` or the `SKILLS_PROVIDER` env var.
- `--registry <path>` — point at a different registry directory (default: bundled `registry/`).
- `--dest <path>` — override the install directory (otherwise: provider default, or `SKILLS_INSTALL_DIR`, or `skills.config.json`).
- `--force` — overwrite an existing install on `add`.
- `--dry-run` — print what would happen, write nothing.

## Resolution order

For provider: `--provider` flag → `SKILLS_PROVIDER` env → `skills.config.json` → error.
For install dir: `--dest` flag → `SKILLS_INSTALL_DIR` env → `skills.config.json` → provider's default.

## Registry layout

```
registry/
  index.json                   # { name, skills: [{ name, description, tags? }] }
  skills/
    commit/
      SKILL.md
    review/
      SKILL.md
    plan-mode/
      SKILL.md
```

A skill folder can contain anything. For `claude`, the whole directory is
copied as-is. For `copilot` / `codex` / `cursor`, only `SKILL.md` is copied and
renamed to the provider's expected extension.

## What this is not

- **Not a runtime.** After `add`, the CLI is uninvolved. Your agent reads the installed file directly.
- **Not a frontmatter translator.** The registry's frontmatter is Claude-shaped; you adjust per provider after install.
- **Not a package manager.** No lockfile, no version resolution, no update command. Re-run `add --force` to fetch the latest registry version, knowing it will overwrite your local edits.
