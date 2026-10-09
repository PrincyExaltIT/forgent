import readline from "node:readline/promises";

// A skill can ship code the agent will run on the user's machine. forgent lists it before installing.

const SCRIPT_EXT = /\.(mjs|cjs|js|ts|mts|cts|py|sh|bash|zsh|ps1|psm1|bat|cmd|rb|pl|php|go|rs)$/i;

/** Paths (relative to the skill root) that look like executable code. */
export function scriptPaths(files) {
  return files
    .map((f) => (typeof f === "string" ? { path: f } : f))
    .filter((f) => f.type === "skill:script" || f.path.startsWith("scripts/") || SCRIPT_EXT.test(f.path))
    .map((f) => f.path)
    .sort();
}

export function describeScripts(skillName, scripts) {
  const shown = scripts.slice(0, 5).join(", ") + (scripts.length > 5 ? ", …" : "");
  return (
    `${skillName} ships ${scripts.length} script(s) your agent can run on your machine: ${shown}. ` +
    `Read them first: forgent show ${skillName} --all`
  );
}

/**
 * Ask before installing a skill that ships scripts. Interactive terminals get a [y/N] prompt
 * (--yes skips it); elsewhere (CI, pipes) the warning is printed and the install goes on, as in 1.1.
 * FORGENT_INTERACTIVE=1 forces the prompt (tests); FORGENT_INTERACTIVE=0 disables it.
 */
export async function confirmScripts(ctx, skillName, scripts) {
  if (scripts.length === 0) return true;
  console.error(`notice: ${describeScripts(skillName, scripts)}`);
  if (ctx.flags.yes || ctx.flags.dryRun) return true;
  const forced = process.env.FORGENT_INTERACTIVE;
  const interactive = forced === "1" || (forced !== "0" && process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(`Install ${skillName} anyway? [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes" || answer === "o" || answer === "oui";
  } finally {
    rl.close();
  }
}
