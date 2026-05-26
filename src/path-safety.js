import path from "node:path";

const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeName(name, kind = "name") {
  if (typeof name !== "string" || !SAFE_NAME_RE.test(name)) {
    throw new Error(
      `invalid ${kind}: ${JSON.stringify(name)} — must match ${SAFE_NAME_RE}`,
    );
  }
}

export function assertSafeRelativePath(p, kind = "path") {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error(`invalid ${kind}: must be a non-empty string`);
  }
  if (p.includes("\\")) {
    throw new Error(
      `invalid ${kind}: backslashes not allowed (use POSIX /): ${JSON.stringify(p)}`,
    );
  }
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) {
    throw new Error(
      `invalid ${kind}: must not be absolute: ${JSON.stringify(p)}`,
    );
  }
  for (const seg of p.split("/")) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new Error(
        `invalid ${kind}: contains empty / "." / ".." segment: ${JSON.stringify(p)}`,
      );
    }
  }
}

export function safeJoin(base, untrustedRel) {
  assertSafeRelativePath(untrustedRel);
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, untrustedRel);
  if (target !== resolvedBase && !target.startsWith(resolvedBase + path.sep)) {
    throw new Error(`unsafe path escapes base: ${JSON.stringify(untrustedRel)}`);
  }
  return target;
}
