# Changelog

All notable changes to forgent are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-10-09

### Fixed
- `--provider agents,claude` typed unquoted in PowerShell: PowerShell turns the
  comma into an array and passes "agents claude", which forgent rejected as an
  unknown provider. Spaces now separate providers too, on `add`, `remove`,
  `init` and `verify`.

## [1.2.0] - 2026-10-09

Read before you install, and keep skills up to date without losing your edits.
Additive: the 1.x CLI, manifest schema, lockfile shape and exit codes keep working.

### Added
- **`forgent show <name>[@v] [--all]`**: fetch a skill into a temporary folder
  (sha256 checked), print `SKILL.md` and its files with scripts flagged; `--all`
  prints every file. Nothing is installed.
- **Scripts notice on `add`**: forgent lists the scripts a skill ships. In a
  terminal it asks `[y/N]` before installing; `--yes` / `-y` skips the question;
  without a terminal (CI, pipes) it only prints the notice, as in 1.1.
- **`forgent outdated`**: compares `forgent.lock.json` with the registry —
  `outdated`, `changed` (same version, other published files), `up to date`,
  `not in registry`. Exits 1 when something is behind.
- **`forgent update [<name>...]`**: updates every recorded install, shows the
  files added, changed and removed, and leaves an install with local edits alone
  unless `--force`. `--dry-run` prints the plan.

### Changed
- Hashing of installed files is shared by add, verify, outdated and update
  (`src/hash-tree.js`).

## [1.1.0] - 2026-10-09

Follow the Agent Skills standard: install the whole skill folder where today's
harnesses look for it. Everything is additive — the 1.x CLI, manifest schema,
lockfile shape and exit codes keep working unchanged.

### Added
- **`agents` provider**: the Agent Skills standard folder, `.agents/skills/<name>/`
  in the project by default (`--user`: `~/.agents/skills`). Read by Codex,
  GitHub Copilot, Cursor, Gemini CLI, OpenCode, Kilo Code and most Agent Skills
  harnesses. The whole folder is copied: `SKILL.md`, `references/`, `scripts/`,
  `assets/`…
- **`--project` / `--user`** pick the install scope. `claude --project` installs
  in `.claude/skills` (also read by Continue). `scope` can be persisted with
  `forgent init`.
- **Several providers at once**: `--provider agents,claude` fetches and checks
  each skill once, then copies it into every provider's folder. Works for
  `add`, `remove` and `init`, and as a filter on `verify`.
- **Lockfile `installs`**: each skill entry lists every place it is installed
  (provider, path, version, files). Paths are project-relative when inside the
  project (`~/…` under home), so a committed lockfile works on every machine.
  The top-level fields still describe the latest install, as in 1.0.
- **`verify` checks every recorded install** without flags; `--provider` and
  `--dest` narrow the check. It exits 1 when no install matches the filters.
  1.0 lockfiles are verified exactly as before.
- **File types** `skill:script`, `skill:asset`, `skill:config`, `skill:eval`
  in the manifest schema (types stay optional).
- A warning when a single-file provider (`copilot`, `codex`, `cursor`) would
  drop part of a skill (scripts, references, assets).

### Changed
- `copilot`, `codex` and `cursor` are documented as **legacy single-file**
  providers. They behave as in 1.0, refuse `--project` with a pointer to
  `--provider agents`, and `doctor` warns about them. The README no longer
  claims that Codex cannot load skills: it reads `.agents/skills`.
- `--dest` (or an `installDir` from env/config) with several providers is
  refused: one directory cannot hold several providers' copies.
- `providers` lists `agents` first, with each provider's default scope.

### Fixed
- `forgent init` messages named `skills.config.json` instead of
  `forgent.config.json`.

## [1.0.0] - 2026-05-26

The 1.0 line. Stability promise applies from this release onward (see README
*Stability* section): CLI flag surface, manifest schema, lockfile shape, and
exit codes are the public API.

### Changed
- **BREAKING**: `--strict-sha256` is now the default. `forgent add` against
  a registry whose manifest omits per-file `sha256` now errors (exit 1)
  instead of warning. Pass `--no-strict-sha256` (new flag) or set
  `FORGENT_STRICT_SHA256=0` to restore 0.x behaviour during migration.
  The existing `--strict-sha256` flag and `FORGENT_STRICT_SHA256=1` env
  var still work as explicit opt-ins (now no-ops matching the default).
  Rationale: this was the planned 1.0 behaviour. The 0.x soft default
  existed as a migration window for third-party registries to add hashes.
- `resolveRegistryBase` is now `async`. Internal API change — does not
  affect CLI users. Programmatic importers should `await` the call.

### Added
- **`forgent registry` subcommand** for multi-registry workflows:
  - `registry list` — print configured registries (`*` marks default).
  - `registry add <name> <url-or-path> [--default] [--force]` — persist
    a named registry in `forgent.config.json`. Name validated via
    `assertSafeName` (kebab-case).
  - `registry remove <name>` — drop one; clears `defaultRegistry` if it
    was the default.
  - `registry set-default <name>` — switch the default.

  Resolution order for the active registry is now:
  1. `--registry <value>` (name match in config, else literal url/path).
  2. `FORGENT_REGISTRY` env (same name-or-literal interpretation).
  3. `forgent.config.json` `defaultRegistry` (by name).
  4. Built-in default URL.

  `forgent.config.json` gains optional `registries[]` + `defaultRegistry`
  fields. Existing configs without these fields keep working (treated as
  zero configured registries).

- **`forgent hash-files [--registry <path>]`** — walk every `items[].files[]`
  entry, compute sha256, diff against the manifest-declared hash. Prints
  per-file `match` / `MISMATCH` / `MISSING — add to manifest`, plus a summary.
  Exits 1 on any mismatch or missing-from-manifest. Local-registry only —
  HTTP URLs are rejected. For third-party registry authors keeping their
  manifest in sync.

- **`forgent validate-skill <name>`** — read every `skill:example` JSON file
  declared by `<name>`, follow its `$schema` URL, and validate the example
  against that schema. Built-in hand-rolled validator covers the keywords
  emitted by `agent-skill/schema/subagent-output.schema.json`: `type`,
  `required`, `properties`, `additionalProperties: false`, `enum`, `pattern`,
  `minLength`, `minimum`, `items` (single subschema), local `$ref`
  (`#/$defs/...`). Unsupported keywords (`maxLength`, `oneOf`, `allOf`, …)
  emit a single WARN per keyword then skip the constraint. Exits 1 on FAIL.

- **Stability promise** documented in README §Stability. forgent ≥ 1.0
  follows semver. Internal `src/*.js` modules are not public — pin to a
  major if you import them programmatically. The default registry URL is
  stable but may move to a CDN domain post-1.0 without a major bump.

## [0.3.0] - 2026-05-26

Supply chain integrity: registries can now ship per-file SHA256 checksums,
skill consumers can pin a version, and every install is recorded in a
`forgent.lock.json` that a new `forgent verify` command re-checks.

### Added
- **SHA256 file verification.** Manifests may declare `files[].sha256`
  (lowercase hex). When present, forgent verifies the fetched body matches
  before writing — a mismatch aborts the install with both hashes in the
  error. When absent, forgent emits a one-time `WARN` per skill and proceeds.
- `--strict-sha256` flag (and `FORGENT_STRICT_SHA256=1` env var) to refuse
  any install whose manifest entry omits a sha256. For orgs that want to
  enforce integrity across all registries.
- **`skill@version` syntax.** `forgent add foo@1.2.3` pins to that exact
  version. The registry must declare `items[].version`; otherwise the
  install errors with a clear message ("registry X@Y does not declare a
  version for skill 'foo'; remove the @1.2.3 pin or upgrade the registry").
  Without a pin, behavior is unchanged.
- **`forgent.lock.json`.** Every successful `add` records the installed
  skill's provider, source registry name+version, resolved skill version,
  and per-file sha256 in a lockfile next to `forgent.config.json`. Commit
  it to your repo for reproducible installs. `forgent remove` deletes the
  matching entry. `--dry-run` skips the write.
- **`forgent verify` command.** Re-hashes installed files against
  `forgent.lock.json` and reports `OK`/`FAIL` per file. Exits 1 on any
  mismatch or missing file. No network — local-only check.
- Each provider exports a `targetPath(installDir, skillName)` helper used
  by `verify` to locate installed files without re-implementing per-provider
  install conventions.
- JSON Schema: `$defs/file` accepts `sha256` (64-char lowercase hex);
  `$defs/item.version` reservation is now validated at runtime via
  `assertOptionalSemver` (was schema-only in 0.2.0).

### Changed
- `loadRegistry` now rejects manifests whose `items[].version` is not a
  semver string and whose `files[].sha256` is not a 64-char hex string.
- README has a new "Integrity & lockfile" section and the "What this is
  not" disclaimer no longer claims forgent ships without a lockfile.

### Notes
- Registries without sha256 still install (with WARN). The plan is to flip
  the default in 1.0; until then, registries can roll out sha256
  progressively. Pinning to `forgent@0.3.0` in agent-skill CI is recommended.
- **fs-mode (`--registry <local-path>`) skips per-file fetch verification.**
  Whole-directory copy doesn't iterate per-manifest-file. The lockfile is
  still written and `verify` still works against the installed files.
- Lockfile entries are sorted by skill name, files within each entry sorted
  by path — for stable diffs when committed.

## [0.2.0] - 2026-05-26

First release with the security + validation + industrialization work that
was missing from the initial npm preview.

### Added
- `forgent --version` / `-V` / `version` — print the installed version.
- `forgent doctor` — diagnose the local install: Node version, OS/arch,
  provider resolution, install dir writability, and registry reachability.
  Exit 1 on any FAIL.
- `forgent validate-registry` — fail-fast a manifest. Designed for CI use
  (registry repos pin a forgent version and run this on every PR).
- JSON Schema for registries shipped at `schema/registry.schema.json`
  (draft 2020-12). Editors point at it via the GH-raw `$schema` URL.
- `package-lock.json` for reproducible installs; CI uses `npm ci`.
- GitHub Actions: `ci.yml` (Node 18/20/22 × Linux/macOS/Windows + smoke
  job that installs the packed tarball globally) and `release.yml`
  (workflow_dispatch, npm publish with provenance).
- Optional `forgent.config.json` persistence via `forgent init`.

### Changed
- **BREAKING**: registries must declare top-level `name` (safe identifier)
  and `version` (semver). The previous silent `|| "default"` fallback for
  `name` is gone. Manifests without these fields are rejected at load.
- **BREAKING**: `files[].type` is now a closed enum
  (`skill:main`, `skill:doc`, `skill:codex`, `skill:copilot`,
  `skill:example`, `skill:reference`, `skill:template`). Unknown values
  are rejected.
- **BREAKING**: per-skill `description` must be a string when present;
  `tags[]` entries must match the safe-name pattern.
- `forgent info <name>` now displays the registry `name@version`.
- User-Agent now reports the running forgent version dynamically
  (no more hardcoded `forgent/0.1.0`).
- README cleanup: examples use real registry skills.

### Security
- Path-traversal hardening across every registry-data → filesystem
  touchpoint (`assertSafeName`, `assertSafeRelativePath`, `safeJoin`).
  A malicious manifest with `files[].path: "../../etc/passwd"` is now
  rejected at load with a precise error.
- HTTP fetch hardening: 30s default timeout (configurable via
  `FORGENT_TIMEOUT_MS`), explicit User-Agent, refusal of non-http(s)
  URLs, no silent retry.

### Removed
- The broken `install.sh` / `install.ps1` legacy installers (replaced by
  `npx forgent add`).

## [0.1.0] - 2025-XX-XX

Initial preview release on npm. See git history for details — most users
should upgrade to 0.2.0 for the validation and security work.
