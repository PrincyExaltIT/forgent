export const FILE_TYPES = Object.freeze([
  "skill:main",
  "skill:doc",
  "skill:codex",
  "skill:copilot",
  "skill:example",
  "skill:reference",
  "skill:template",
]);

export const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const SHA256_RE = /^[a-f0-9]{64}$/;

export function assertOptionalString(v, kind = "value") {
  if (v === undefined) return;
  if (typeof v !== "string") {
    throw new Error(
      `invalid ${kind}: must be a string when present, got ${typeof v}`,
    );
  }
}

export function assertOptionalStringArray(v, kind = "value", eachAssert = null) {
  if (v === undefined) return;
  if (!Array.isArray(v)) {
    throw new Error(`invalid ${kind}: must be an array when present`);
  }
  for (const item of v) {
    if (typeof item !== "string") {
      throw new Error(
        `invalid ${kind}: every entry must be a string, got ${typeof item}`,
      );
    }
    if (eachAssert) eachAssert(item);
  }
}

export function assertSemver(v, kind = "version") {
  if (typeof v !== "string" || !SEMVER_RE.test(v)) {
    throw new Error(
      `invalid ${kind}: ${JSON.stringify(v)} — must be a semver string (e.g. "0.1.0")`,
    );
  }
}

export function assertOptionalSemver(v, kind = "version") {
  if (v === undefined) return;
  assertSemver(v, kind);
}

export function assertSha256(v, kind = "sha256") {
  if (v === undefined) return;
  if (typeof v !== "string" || !SHA256_RE.test(v)) {
    throw new Error(
      `invalid ${kind}: ${JSON.stringify(v)} — must be 64 lowercase hex chars (sha256 of UTF-8 file content)`,
    );
  }
}

export function assertFileType(v, kind = "file.type") {
  if (v === undefined) return;
  if (typeof v !== "string" || !FILE_TYPES.includes(v)) {
    throw new Error(
      `invalid ${kind}: ${JSON.stringify(v)} — must be one of ${FILE_TYPES.join(", ")}`,
    );
  }
}
