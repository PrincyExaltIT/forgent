#!/usr/bin/env bash
# Demo script for forgent — drives the recording in demo/demo.yml.
#
# Goal: a ~30 s tour covering list, info, add, lockfile preview, verify.
# Uses a throwaway temp dir so the recording does not depend on the user's
# real install dir. Cleaned up at the end.

set -euo pipefail

DEMO_HOME="$(mktemp -d -t forgent-demo-XXXXXX)"
trap 'rm -rf "$DEMO_HOME"' EXIT
cd "$DEMO_HOME"

# Tiny helper: type a command, pause, then run it.
type_run() {
  local cmd="$*"
  printf '\e[36m$\e[0m '
  printf '%s' "$cmd"
  sleep 0.6
  printf '\n'
  eval "$cmd"
  sleep 0.8
}

clear

type_run "npx -y forgent list"
type_run "npx -y forgent info angular-review"
type_run "npx -y forgent add --provider claude --dest ./.claude/skills angular-review"
type_run "cat forgent.lock.json | head -16"
type_run "npx -y forgent verify --provider claude --dest ./.claude/skills"

sleep 1.2
