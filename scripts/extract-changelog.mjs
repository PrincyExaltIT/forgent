#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHANGELOG = path.resolve(HERE, "..", "CHANGELOG.md");

const rawInput = process.argv[2];
if (!rawInput) {
  console.error("usage: extract-changelog.mjs <version>");
  process.exit(2);
}
const version = rawInput.replace(/^v/, "");

const content = readFileSync(CHANGELOG, "utf8");
const lines = content.split(/\r?\n/);

const start = lines.findIndex((l) => new RegExp(`^##\\s*\\[${version.replace(/\./g, "\\.")}\\]`).test(l));
if (start === -1) {
  console.error(`no section found for version "${version}" in CHANGELOG.md`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s*\[/.test(lines[i])) {
    end = i;
    break;
  }
}

process.stdout.write(lines.slice(start, end).join("\n").trimEnd() + "\n");
