import {
  findSkill,
  listSkillFilePaths,
  loadRegistry,
  skillSourceLocator,
} from "../registry.js";

export async function runInfo(ctx, name) {
  const registry = await loadRegistry(ctx);
  const skill = findSkill(registry, name);

  console.log(`name        ${skill.name}`);
  console.log(`registry    ${registry.name}@${registry.version}`);
  console.log(`description ${skill.description || ""}`);
  if (skill.tags?.length) console.log(`tags        ${skill.tags.join(", ")}`);
  console.log(`source      ${skillSourceLocator(registry, skill)}`);

  let files;
  try {
    files = await listSkillFilePaths(registry, skill);
  } catch (err) {
    throw new Error(`skill source unreachable: ${err.message}`);
  }
  console.log("files:");
  for (const f of files) console.log(`  ${f}`);
}
