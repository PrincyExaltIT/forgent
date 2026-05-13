# skills-cli

A shadcn/ui-style installer for Claude Code skills.

## The principle (same as shadcn/ui)

shadcn/ui is not an npm package you depend on — it is a **registry of components**
plus a CLI that **copies the source** into your project. Once it's there, you own
the code and you can edit it however you want. There is no runtime dependency
on the registry.

`skills-cli` brings the same model to Claude Code skills:

| shadcn/ui                                       | skills-cli                                  |
| ----------------------------------------------- | ------------------------------------------- |
| `components.json` config in the project         | `skills.config.json` in your cwd            |
| Registry of components (`/registry/...`)        | Registry of skills (`/registry/skills/...`) |
| `npx shadcn-ui@latest add button`               | `skills add commit`                         |
| Source is copied into `src/components/ui`       | Source is copied into `~/.claude/skills`    |
| You own the file and can modify it              | Same — your `SKILL.md` is yours to edit     |

Crucially: after `skills add commit`, the skill lives at
`~/.claude/skills/commit/SKILL.md`. It is **your file now**. Edit it; the CLI
does not own it anymore and will refuse to overwrite without `--force`.

## Usage

```bash
# from this repo, no install needed
node bin/skills.js list
node bin/skills.js info commit
node bin/skills.js add commit review
node bin/skills.js remove commit

# create a per-project config that overrides the install dir
node bin/skills.js init --dest ./.claude/skills
```

## Commands

- `skills init` — write a `skills.config.json` in the current dir. Stores the
  `installDir`. With no config the default is `~/.claude/skills`.
- `skills list` — list every skill in the registry with its description.
- `skills info <name>` — print one skill's metadata and the files that would be
  copied.
- `skills add <name>...` — copy one or more skills' source into the install
  dir. Refuses to overwrite unless `--force`.
- `skills remove <name>` — delete an installed skill from the install dir.
  Does not touch the registry.

## Flags

- `--registry <path>` — point at a different registry directory (defaults to the
  bundled `registry/` next to the CLI). This is how you would later swap in a
  remote-fetched registry.
- `--dest <path>` — override the install directory.
- `--force` — overwrite an existing install on `add`.
- `--dry-run` — print what would happen without writing anything.

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

A skill folder can contain anything (multiple files, helper scripts, examples) —
`add` copies the whole directory.

## What this is not

- Not a runtime. After `add`, the CLI is uninvolved. Claude Code reads
  `~/.claude/skills/<name>/SKILL.md` directly.
- Not a package manager. There is no lockfile, no version resolution, no
  update command. Re-run `skills add <name> --force` if you want the latest
  registry version, knowing it will overwrite your local edits.
