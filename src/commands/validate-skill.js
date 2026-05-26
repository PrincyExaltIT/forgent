import fs from "node:fs/promises";
import { loadRegistry, findSkill } from "../registry.js";
import { safeJoin } from "../path-safety.js";
import { validate } from "../json-schema-validator.js";

const USER_AGENT_HEADERS = { "User-Agent": "forgent (validate-skill)" };

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

function joinUrl(base, rel) {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${b}/${rel.replace(/^\//, "")}`;
}

async function fetchJsonText(url) {
  let res;
  try {
    res = await fetch(url, { headers: USER_AGENT_HEADERS });
  } catch (err) {
    throw new Error(`network error fetching ${url}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: HTTP ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function readExample(registry, skill, file) {
  if (registry.kind === "fs") {
    const target = safeJoin(registry.base, `skills/${skill.name}/${file.path}`);
    return fs.readFile(target, "utf8");
  }
  return fetchJsonText(joinUrl(registry.base, `skills/${skill.name}/${file.path}`));
}

export async function runValidateSkill(ctx, name) {
  const registry = await loadRegistry(ctx);
  const skill = findSkill(registry, name);

  const files = Array.isArray(skill.files) ? skill.files : [];
  const examples = files
    .map((f) => (typeof f === "string" ? { path: f } : f))
    .filter((f) => f.type === "skill:example" && f.path.endsWith(".json"));

  console.log(skill.name);
  if (examples.length === 0) {
    console.log(`  no JSON examples to validate`);
    return;
  }

  let fails = 0;
  for (const file of examples) {
    console.log(`  ${file.path}`);
    let raw;
    try {
      raw = await readExample(registry, skill, file);
    } catch (err) {
      console.log(`    read failed: ${err.message}`);
      fails++;
      continue;
    }
    let example;
    try {
      example = JSON.parse(raw);
    } catch (err) {
      console.log(`    parse failed: ${err.message}`);
      fails++;
      continue;
    }
    const schemaUrl = example && typeof example === "object" ? example.$schema : undefined;
    if (!schemaUrl) {
      console.log(`    no $schema field, skipped`);
      continue;
    }
    if (!isHttpUrl(schemaUrl)) {
      console.log(`    schema: ${schemaUrl}`);
      console.log(`    FAIL`);
      console.log(`      $schema must be an http(s) URL, got: ${schemaUrl}`);
      fails++;
      continue;
    }

    console.log(`    schema: ${schemaUrl}`);
    let schemaRaw;
    try {
      schemaRaw = await fetchJsonText(schemaUrl);
    } catch (err) {
      console.log(`    FAIL`);
      console.log(`      could not fetch schema: ${err.message}`);
      fails++;
      continue;
    }
    let schema;
    try {
      schema = JSON.parse(schemaRaw);
    } catch (err) {
      console.log(`    FAIL`);
      console.log(`      schema is not valid JSON: ${err.message}`);
      fails++;
      continue;
    }

    const warns = [];
    const { errors, propertiesChecked } = validate(schema, example, {
      warn: (m) => warns.push(m),
    });
    for (const w of warns) console.log(`    WARN ${w}`);
    if (errors.length === 0) {
      console.log(`    OK   (${propertiesChecked} properties checked)`);
    } else {
      console.log(`    FAIL`);
      for (const e of errors) console.log(`      ${e}`);
      fails++;
    }
  }

  if (fails > 0) process.exit(1);
}
