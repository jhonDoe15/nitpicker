import { isRecord, normalizeFindingPath, positiveInteger, requiredString } from './values.mjs';

export function parseNotRunFields(value, classification, context) {
  const fields = {};
  if (value.toolNotRun !== undefined) {
    fields.toolNotRun = parseToolNotRun(value.toolNotRun, classification, context);
  }
  if (value.notRunScope !== undefined) {
    fields.notRunScope = parseNotRunScope(value.notRunScope, fields.toolNotRun, context);
  }
  if (value.notRunIdentityPrefix !== undefined) {
    fields.notRunIdentityPrefix = parseNotRunIdentityPrefix(
      value.notRunIdentityPrefix,
      fields.toolNotRun,
      context,
    );
  }
  return fields;
}

function parseNotRunIdentityPrefix(value, toolNotRun, context) {
  if (toolNotRun !== true || typeof value !== 'string' || value === '') {
    throw new TypeError(
      `${context}.notRunIdentityPrefix must be a non-empty string on a toolNotRun finding`,
    );
  }
  return value;
}

function parseToolNotRun(value, classification, context) {
  if (value !== true || classification !== 'descriptive') {
    throw new TypeError(`${context}.toolNotRun must be true on a descriptive finding`);
  }
  return true;
}

function parseNotRunScope(value, toolNotRun, context) {
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

export function parseLineRanges(value, context) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${context} must be an array`);
  }
  return value.map((range, index) => {
    if (!isRecord(range)) {
      throw new TypeError(`${context}[${String(index)}] must be an object`);
    }
    const startLine = positiveInteger(range.startLine, `${context}[${String(index)}].startLine`);
    const endLine = positiveInteger(range.endLine, `${context}[${String(index)}].endLine`);
    if (endLine < startLine) {
      throw new TypeError(`${context}[${String(index)}].endLine must not be before startLine`);
    }
    return {
      path: requiredString(range.path, `${context}[${String(index)}].path`),
      startLine,
      endLine,
    };
  });
}
