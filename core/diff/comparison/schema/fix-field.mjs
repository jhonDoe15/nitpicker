import { isRecord, normalizeFindingPath, requiredString } from './values.mjs';

const SAFETIES = new Set(['safe', 'review']);
const FIX_FIELDS = new Set(['recipe', 'safety', 'path', 'sha256', 'textLength', 'edits']);
const EDIT_FIELDS = new Set(['type', 'path', 'start', 'end', 'text']);
const SHA256 = /^[0-9a-f]{64}$/u;

function onlyFields(value, allowed, context) {
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra !== undefined) {
    throw new TypeError(`${context}.${extra} is not a supported field`);
  }
}

function offset(value, context) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${context} must be a non-negative integer`);
  }
  return value;
}

function parseEdit(value, context) {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  onlyFields(value, EDIT_FIELDS, context);
  if (value.type !== 'replace' && value.type !== 'write') {
    throw new TypeError(`${context}.type must be replace or write`);
  }
  if (typeof value.text !== 'string') {
    throw new TypeError(`${context}.text must be a string`);
  }
  const edit = {
    type: value.type,
    path: normalizeFindingPath(requiredString(value.path, `${context}.path`), `${context}.path`),
    text: value.text,
  };
  if (value.type === 'write') {
    return edit;
  }
  const start = offset(value.start, `${context}.start`);
  const end = offset(value.end, `${context}.end`);
  if (end < start) {
    throw new TypeError(`${context}.end must not be before start`);
  }
  return { ...edit, start, end };
}

function parseEdits(value, context) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty array`);
  }
  return value.map((edit, index) => parseEdit(edit, `${context}[${String(index)}]`));
}

function parseFixFile(value, context) {
  const fix = {};
  if (value.path !== undefined) {
    fix.path = normalizeFindingPath(
      requiredString(value.path, `${context}.path`),
      `${context}.path`,
    );
  }
  if (value.sha256 !== undefined) {
    if (typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)) {
      throw new TypeError(`${context}.sha256 must be 64 lowercase hex digits`);
    }
    fix.sha256 = value.sha256;
  }
  if (value.textLength !== undefined) {
    fix.textLength = offset(value.textLength, `${context}.textLength`);
  }
  if (value.edits !== undefined) {
    fix.edits = parseEdits(value.edits, `${context}.edits`);
  }
  return fix;
}

export function parseFix(value, context) {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  onlyFields(value, FIX_FIELDS, context);
  if (!SAFETIES.has(value.safety)) {
    throw new TypeError(`${context}.safety must be safe or review`);
  }
  return {
    recipe: requiredString(value.recipe, `${context}.recipe`),
    safety: value.safety,
    ...parseFixFile(value, context),
  };
}
