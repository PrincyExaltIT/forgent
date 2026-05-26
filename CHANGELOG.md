# Changelog

All notable changes to forgent are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
