import { normalizeGitPath } from '../git/normalize.mjs';

const CLASSIFICATIONS = new Set(['enforceable', 'descriptive', 'tool-error']);

export function parseAnalyzerReport(value, analyzerName) {
  if (!isRecord(value) || !Array.isArray(value.findings)) {
    throw new TypeError(`${analyzerName} output must contain a findings array`);
  }

  return {
    findings: value.findings.map((finding, index) =>
      parseFinding(finding, `${analyzerName} findings[${String(index)}]`),
    ),
  };
}

export function parseFinding(value, context = 'finding') {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }

  const tool = requiredString(value.tool, `${context}.tool`);
  const rule = requiredString(value.rule, `${context}.rule`);
  const findingPath = normalizeFindingPath(
    requiredString(value.path, `${context}.path`),
    `${context}.path`,
  );
  const identity = requiredString(value.identity, `${context}.identity`);
  const message = requiredString(value.message, `${context}.message`);
  const classification = requiredString(value.classification, `${context}.classification`);
  if (!CLASSIFICATIONS.has(classification)) {
    throw new TypeError(`${context}.classification is not supported: ${classification}`);
  }

  const finding = {
    tool,
    rule,
    path: findingPath,
    identity,
    message,
    classification,
  };

  return { ...finding, ...parseOptionalFields(value, classification, context) };
}

function parseOptionalFields(value, classification, context) {
  const fields = {};
  if (value.symbol !== undefined) {
    fields.symbol = requiredString(value.symbol, `${context}.symbol`);
  }
  if (value.location !== undefined) {
    fields.location = parseLocation(value.location, `${context}.location`);
  }
  if (value.metric !== undefined) {
    if (classification !== 'descriptive') {
      throw new TypeError(`${context}.metric requires descriptive classification`);
    }
    fields.metric = parseMetric(value.metric, `${context}.metric`);
  }
  if (value.ratchet !== undefined) {
    fields.ratchet = parseRatchet(value.ratchet, `${context}.ratchet`);
  }

  return { ...fields, ...parseNotRunFields(value, classification, context) };
}

function parseNotRunFields(value, classification, context) {
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

function parseLocation(value, context) {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  const line = positiveInteger(value.line, `${context}.line`);
  const location = { line };
  if (value.column !== undefined) {
    location.column = positiveInteger(value.column, `${context}.column`);
  }
  if (value.endLine !== undefined) {
    location.endLine = positiveInteger(value.endLine, `${context}.endLine`);
  }
  return location;
}

function parseMetric(value, context) {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  const metricValue = value.value;
  if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
    throw new TypeError(`${context}.value must be a finite number`);
  }
  return {
    name: requiredString(value.name, `${context}.name`),
    value: metricValue,
  };
}

const RATCHET_TEXT_FIELDS = ['worseMessage', 'growthAdvice', 'heldMessage'];
const RATCHET_FLAGS = ['existingCodeOnly', 'pathIsFolder', 'divisible'];

function parseRatchet(value, context) {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    throw new TypeError(`${context}.value must be a finite number`);
  }
  return {
    key: requiredString(value.key, `${context}.key`),
    value: value.value,
    ...parseRatchetOptions(value, context),
  };
}

function parseRatchetOptions(value, context) {
  const ratchet = {};
  if (value.folderFiles !== undefined) {
    ratchet.folderFiles = positiveInteger(value.folderFiles, `${context}.folderFiles`);
  }
  for (const name of RATCHET_TEXT_FIELDS) {
    if (value[name] !== undefined) {
      ratchet[name] = requiredString(value[name], `${context}.${name}`);
    }
  }
  for (const name of RATCHET_FLAGS.filter((flag) => value[flag] !== undefined)) {
    if (typeof value[name] !== 'boolean') {
      throw new TypeError(`${context}.${name} must be a boolean`);
    }
    ratchet[name] = value[name];
  }
  if (value.mustKeepUnchangedLines !== undefined) {
    ratchet.mustKeepUnchangedLines = parseLineRanges(
      value.mustKeepUnchangedLines,
      `${context}.mustKeepUnchangedLines`,
    );
  }
  return ratchet;
}

function parseLineRanges(value, context) {
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

function positiveInteger(value, context) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${context} must be a positive integer`);
  }
  return value;
}

function requiredString(value, context) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}

function normalizeFindingPath(value, context) {
  const normalizedPath = normalizeGitPath(value);
  if (
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    normalizedPath.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new TypeError(`${context} must stay within the analyzed project`);
  }
  return normalizedPath;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
