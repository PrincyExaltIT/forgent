# Changelog

All notable changes to forgent are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the major version is 0.x, breaking changes may land in minor releases.

## [Unreleased]

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
