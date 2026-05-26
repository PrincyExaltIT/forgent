// Minimal JSON Schema validator. Hand-rolled, zero-dep. Covers the subset
// of JSON Schema we actually use in skill example schemas:
//   type (string|integer|number|array|object|boolean|null)
//   required, properties, additionalProperties: false
//   enum, pattern, minLength, minimum
//   items (single subschema)
//   $ref → "#/$defs/<name>" (local only)
// Unsupported keywords emit a WARN once per keyword and are skipped.

const SUPPORTED = new Set([
  "type",
  "required",
  "properties",
  "additionalProperties",
  "enum",
  "pattern",
  "minLength",
  "minimum",
  "items",
  "$ref",
  "$schema",
  "$id",
  "$defs",
  "title",
  "description",
  "examples",
]);

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  if (typeof v === "number") return "number";
  return typeof v;
}

function typeMatches(expected, value) {
  const t = typeOf(value);
  if (expected === "number") return t === "number" || t === "integer";
  return t === expected;
}

function resolveRef(root, ref) {
  if (typeof ref !== "string") throw new Error(`$ref must be a string`);
  if (!ref.startsWith("#/")) {
    throw new Error(`only local $ref starting with "#/" is supported, got ${ref}`);
  }
  const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node = root;
  for (const p of parts) {
    if (node == null || typeof node !== "object") {
      throw new Error(`cannot resolve $ref ${ref}: path missing at "${p}"`);
    }
    node = node[p];
  }
  if (node === undefined) throw new Error(`$ref ${ref} resolves to undefined`);
  return node;
}

export function validate(schema, data, { warn = () => {} } = {}) {
  const root = schema;
  const errors = [];
  const warned = new Set();
  let properties = 0;

  function maybeWarn(keyword) {
    if (warned.has(keyword)) return;
    warned.add(keyword);
    warn(`unsupported JSON Schema keyword ignored: "${keyword}"`);
  }

  function walk(subSchema, value, jsonPath) {
    if (subSchema == null || typeof subSchema !== "object") return;

    let effective = subSchema;
    if (effective.$ref !== undefined) {
      try {
        effective = resolveRef(root, effective.$ref);
      } catch (err) {
        errors.push(`${jsonPath || "(root)"}: ${err.message}`);
        return;
      }
    }

    for (const key of Object.keys(effective)) {
      if (!SUPPORTED.has(key)) maybeWarn(key);
    }

    if (effective.type !== undefined) {
      const types = Array.isArray(effective.type) ? effective.type : [effective.type];
      if (!types.some((t) => typeMatches(t, value))) {
        errors.push(
          `${jsonPath || "(root)"}: expected type ${types.join("|")}, got ${typeOf(value)}`,
        );
        return;
      }
    }

    if (effective.enum !== undefined && Array.isArray(effective.enum)) {
      const ok = effective.enum.some((e) => JSON.stringify(e) === JSON.stringify(value));
      if (!ok) {
        errors.push(
          `${jsonPath || "(root)"}: value ${JSON.stringify(value)} not in enum [${effective.enum.map((e) => JSON.stringify(e)).join(", ")}]`,
        );
      }
    }

    if (effective.pattern !== undefined && typeof value === "string") {
      let re;
      try {
        re = new RegExp(effective.pattern);
      } catch (err) {
        errors.push(`${jsonPath || "(root)"}: invalid pattern in schema: ${err.message}`);
        re = null;
      }
      if (re && !re.test(value)) {
        errors.push(
          `${jsonPath || "(root)"}: value ${JSON.stringify(value)} does not match pattern ${effective.pattern}`,
        );
      }
    }

    if (effective.minLength !== undefined && typeof value === "string") {
      if (value.length < effective.minLength) {
        errors.push(
          `${jsonPath || "(root)"}: string length ${value.length} < minLength ${effective.minLength}`,
        );
      }
    }

    if (effective.minimum !== undefined && typeof value === "number") {
      if (value < effective.minimum) {
        errors.push(
          `${jsonPath || "(root)"}: value ${value} < minimum ${effective.minimum}`,
        );
      }
    }

    if (typeOf(value) === "object") {
      if (Array.isArray(effective.required)) {
        for (const r of effective.required) {
          if (!Object.prototype.hasOwnProperty.call(value, r)) {
            errors.push(`${jsonPath || "(root)"}: missing required property "${r}"`);
          }
        }
      }
      if (effective.properties && typeof effective.properties === "object") {
        for (const [propName, propSchema] of Object.entries(effective.properties)) {
          if (Object.prototype.hasOwnProperty.call(value, propName)) {
            properties++;
            walk(propSchema, value[propName], `${jsonPath}.${propName}`);
          }
        }
      }
      if (effective.additionalProperties === false) {
        const allowed = new Set(
          effective.properties ? Object.keys(effective.properties) : [],
        );
        for (const k of Object.keys(value)) {
          if (!allowed.has(k)) {
            errors.push(`${jsonPath || "(root)"}: additional property "${k}" not allowed`);
          }
        }
      }
    }

    if (typeOf(value) === "array" && effective.items) {
      for (let i = 0; i < value.length; i++) {
        walk(effective.items, value[i], `${jsonPath}[${i}]`);
      }
    }
  }

  walk(schema, data, "");
  return { errors, propertiesChecked: properties };
}
