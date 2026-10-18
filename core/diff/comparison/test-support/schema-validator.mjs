import { readFileSync } from 'node:fs';

let schema;
function readSchema() {
  schema ??= JSON.parse(
    readFileSync(new URL('../../../../spec/findings.schema.json', import.meta.url), 'utf8'),
  );
  return schema;
}

const SUPPORTED_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$defs',
  '$ref',
  'title',
  'description',
  'type',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'minItems',
  'enum',
  'const',
  'minLength',
  'minimum',
  'pattern',
  'allOf',
  'not',
  'if',
  'then',
]);

function assertSupportedKeywords(node) {
  for (const keyword of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(`Validator does not support schema keyword: ${keyword}`);
    }
  }
}

function validateReference(value, node, { errors, at }) {
  if (node.$ref === undefined) {
    return;
  }
  const target = node.$ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((current, key) => current[key], readSchema());
  validate(value, target, { errors, at });
}

function checkNumber(value, node, { errors, at }) {
  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) {
    errors.push(`${at} must be >= ${String(node.minimum)}`);
  }
}

function checkAllowedValues(value, node, { errors, at }) {
  if (node.enum !== undefined && !node.enum.includes(value)) {
    errors.push(`${at} must be one of ${node.enum.join(', ')}`);
  }
  if (node.const !== undefined && value !== node.const) {
    errors.push(`${at} must equal ${String(node.const)}`);
  }
}

function checkCombinators(value, node, { errors, at }) {
  for (const part of node.allOf ?? []) {
    validate(value, part, { errors, at });
  }
  if (node.not !== undefined && validate(value, node.not, { errors: [], at }).length === 0) {
    errors.push(`${at} matches a forbidden schema`);
  }
  if (
    node.if !== undefined &&
    validate(value, node.if, { errors: [], at }).length === 0 &&
    node.then
  ) {
    validate(value, node.then, { errors, at });
  }
}

export function validate(value, node = readSchema(), { errors = [], at = '$' } = {}) {
  assertSupportedKeywords(node);
  validateReference(value, node, { errors, at });
  checkType(value, node, { errors, at });
  if (typeof value === 'string') {
    checkString(value, node, { errors, at });
  }
  checkNumber(value, node, { errors, at });
  checkAllowedValues(value, node, { errors, at });
  checkCombinators(value, node, { errors, at });
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    checkObject(value, node, { errors, at });
  }
  if (Array.isArray(value)) {
    checkArray(value, node, { errors, at });
  }
  return errors;
}

function checkArray(items, node, { errors, at }) {
  if (node.minItems !== undefined && items.length < node.minItems) {
    errors.push(`${at} has fewer than ${String(node.minItems)} items`);
  }
  for (const [index, item] of node.items === undefined ? [] : items.entries()) {
    validate(item, node.items, { errors, at: `${at}[${String(index)}]` });
  }
}

function checkType(value, node, { errors, at }) {
  const checks = {
    object: typeof value === 'object' && value !== null && !Array.isArray(value),
    array: Array.isArray(value),
    string: typeof value === 'string',
    number: typeof value === 'number' && Number.isFinite(value),
    integer: Number.isInteger(value),
    boolean: typeof value === 'boolean',
  };
  if (node.type !== undefined && !checks[node.type]) {
    errors.push(`${at} must be ${node.type}`);
  }
}

function checkString(value, node, { errors, at }) {
  if (node.minLength !== undefined && value.length < node.minLength) {
    errors.push(`${at} is shorter than ${String(node.minLength)}`);
  }
  if (node.pattern !== undefined && !new RegExp(node.pattern, 'u').test(value)) {
    errors.push(`${at} does not match ${node.pattern}`);
  }
}

function checkObject(value, node, { errors, at }) {
  for (const key of node.required ?? []) {
    if (!(key in value)) {
      errors.push(`${at}.${key} is required`);
    }
  }
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (key in value) {
      validate(value[key], child, { errors, at: `${at}.${key}` });
    }
  }
  if (node.additionalProperties !== false) return;
  for (const key of Object.keys(value)) {
    if (!(key in (node.properties ?? {}))) {
      errors.push(`${at}.${key} is not allowed`);
    }
  }
}
