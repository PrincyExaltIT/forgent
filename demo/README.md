# forgent demo

A scripted terminal tour of `forgent list / info / add / verify`, recorded with
[terminalizer](https://github.com/faressoft/terminalizer) into the GIF embedded
in the project README.

## What is in here

- `demo.yml` — terminalizer config (window size, theme, no recorded frames).
- `demo-script.sh` — the bash script that drives the recording. Uses a throwaway
  `mktemp` dir so the recording does not depend on whoever runs it.
- `forgent-demo.gif` — the rendered GIF (generated, not committed by default).

The GIF is **not shipped to npm** — `package.json#files` is an allowlist that
includes `bin`, `src`, `schema`, `LICENSE`, `README.md`, `CHANGELOG.md`. Anything
under `demo/` stays in git only.

## Regenerate

Requires Node 18+ and a POSIX shell (Git Bash or WSL on Windows).

```bash
cd forgent
npx -y terminalizer record demo \
  --config demo/demo.yml \
  --command "bash demo/demo-script.sh"
npx -y terminalizer render demo \
  --output demo/forgent-demo.gif
```

The recorded frames are written back into `demo/demo.yml` under `records:` —
commit only if the GIF visibly changed (small frame-count diffs are noise).

## Editing the flow

Edit `demo-script.sh`. Keep it short — every extra command adds ~2 s of GIF and
~50 kB of file size. The five-step flow (list → info → add → lockfile → verify)
is intentionally minimal; it covers the post-E1 selling points (lockfile + verify)
without becoming a tutorial.
