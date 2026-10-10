import { normalizeGitPath } from './git.mjs';

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

  return fields;
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

function parseRatchet(value, context) {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    throw new TypeError(`${context}.value must be a finite number`);
  }
  return { key: requiredString(value.key, `${context}.key`), value: value.value };
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
