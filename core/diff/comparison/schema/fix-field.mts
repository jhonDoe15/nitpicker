import type { FixEdit, FixField } from '../model/finding-types.mts';
import { isRecord, nonNegativeInteger, normalizeFindingPath, requiredString } from './values.mts';

type FixFile = {
  path?: string;
  sha256?: string;
  textLength?: number;
  edits?: FixEdit[];
};

const FIX_FIELDS = new Set(['recipe', 'safety', 'path', 'sha256', 'textLength', 'edits']);
const EDIT_FIELDS = new Set(['type', 'path', 'start', 'end', 'text']);
const SHA256 = /^[0-9a-f]{64}$/u;

function onlyFields(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  context: string,
): void {
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra !== undefined) {
    throw new TypeError(`${context}.${extra} is not a supported field`);
  }
}

function editTypeOf(value: unknown): FixEdit['type'] | undefined {
  return value === 'replace' || value === 'write' ? value : undefined;
}

function editHead(
  value: Readonly<Record<string, unknown>>,
  context: string,
): { type: FixEdit['type']; path: string; text: string } {
  onlyFields(value, EDIT_FIELDS, context);
  const { text } = value;
  const type = editTypeOf(value['type']);
  if (type === undefined) {
    throw new TypeError(`${context}.type must be replace or write`);
  }
  if (typeof text !== 'string') {
    throw new TypeError(`${context}.text must be a string`);
  }
  return {
    type,
    path: normalizeFindingPath(requiredString(value['path'], `${context}.path`), `${context}.path`),
    text,
  };
}

function parseEdit(value: unknown, context: string): FixEdit {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  const edit = editHead(value, context);
  const { type } = edit;
  if (type === 'write') {
    return edit;
  }
  const start = nonNegativeInteger(value['start'], `${context}.start`);
  const end = nonNegativeInteger(value['end'], `${context}.end`);
  if (end < start) {
    throw new TypeError(`${context}.end must not be before start`);
  }
  return { ...edit, start, end };
}

function parseEdits(value: unknown, context: string): FixEdit[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty array`);
  }
  return value.map((edit, index) => parseEdit(edit, `${context}[${String(index)}]`));
}

function parseFixFile(value: Readonly<Record<string, unknown>>, context: string): FixFile {
  const fix: FixFile = {};
  if (value['path'] !== undefined) {
    fix.path = normalizeFindingPath(
      requiredString(value['path'], `${context}.path`),
      `${context}.path`,
    );
  }
  const { sha256 } = value;
  if (sha256 !== undefined) {
    if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
      throw new TypeError(`${context}.sha256 must be 64 lowercase hex digits`);
    }
    fix.sha256 = sha256;
  }
  if (value['textLength'] !== undefined) {
    fix.textLength = nonNegativeInteger(value['textLength'], `${context}.textLength`);
  }
  if (value['edits'] !== undefined) {
    fix.edits = parseEdits(value['edits'], `${context}.edits`);
  }
  return fix;
}

export function parseFix(value: unknown, context: string): FixField {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  onlyFields(value, FIX_FIELDS, context);
  const { safety } = value;
  if (safety !== 'safe' && safety !== 'review') {
    throw new TypeError(`${context}.safety must be safe or review`);
  }
  return {
    recipe: requiredString(value['recipe'], `${context}.recipe`),
    safety,
    ...parseFixFile(value, context),
  };
}
