import type { LineSpan } from '../model/finding-types.mts';
import { isRecord, normalizeFindingPath, positiveInteger, requiredString } from './values.mts';

type NotRunFields = {
  toolNotRun?: true;
  notRunScope?: string[];
  notRunIdentityPrefix?: string;
};

export function parseNotRunFields(
  value: Readonly<Record<string, unknown>>,
  classification: string,
  context: string,
): NotRunFields {
  const fields: NotRunFields = {};
  if (value['toolNotRun'] !== undefined) {
    fields.toolNotRun = parseToolNotRun(value['toolNotRun'], classification, context);
  }
  if (value['notRunScope'] !== undefined) {
    fields.notRunScope = parseNotRunScope(value['notRunScope'], fields.toolNotRun, context);
  }
  if (value['notRunIdentityPrefix'] !== undefined) {
    fields.notRunIdentityPrefix = parseNotRunIdentityPrefix(
      value['notRunIdentityPrefix'],
      fields.toolNotRun,
      context,
    );
  }
  return fields;
}

function parseNotRunIdentityPrefix(
  value: unknown,
  toolNotRun: true | undefined,
  context: string,
): string {
  if (toolNotRun !== true || typeof value !== 'string' || value === '') {
    throw new TypeError(
      `${context}.notRunIdentityPrefix must be a non-empty string on a toolNotRun finding`,
    );
  }
  return value;
}

function parseToolNotRun(value: unknown, classification: string, context: string): true {
  if (value !== true || classification !== 'descriptive') {
    throw new TypeError(`${context}.toolNotRun must be true on a descriptive finding`);
  }
  return true;
}

function parseNotRunScope(value: unknown, toolNotRun: true | undefined, context: string): string[] {
  if (toolNotRun !== true || !Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      `${context}.notRunScope must be a non-empty list of project directories on a toolNotRun finding`,
    );
  }
  return value.map((directory, index) => {
    const at = `${context}.notRunScope[${String(index)}]`;
    return normalizeFindingPath(requiredString(directory, at), at).replace(/\/+$/u, '') || '.';
  });
}

export function parseLineRanges(value: unknown, context: string): LineSpan[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${context} must be an array`);
  }
  return value.map((range, index) => {
    if (!isRecord(range)) {
      throw new TypeError(`${context}[${String(index)}] must be an object`);
    }
    const startLine = positiveInteger(range['startLine'], `${context}[${String(index)}].startLine`);
    const endLine = positiveInteger(range['endLine'], `${context}[${String(index)}].endLine`);
    if (endLine < startLine) {
      throw new TypeError(`${context}[${String(index)}].endLine must not be before startLine`);
    }
    return {
      path: requiredString(range['path'], `${context}[${String(index)}].path`),
      startLine,
      endLine,
    };
  });
}
