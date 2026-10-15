import { createHash } from 'node:crypto';

const ENFORCEABLE_LEVELS = new Set(['error', 'warning']);
const SKIPPED_KINDS = new Set(['pass', 'notApplicable']);
const DEFAULT_LEVEL = 'warning';

export function ingestSarif(log, options = {}) {
  if (!isRecord(log) || !Array.isArray(log.runs)) {
    throw new TypeError('SARIF log must contain a runs array');
  }
  const findings = [];
  const skipped = [];
  for (const [runIndex, run] of log.runs.entries()) {
    ingestRun({
      run: run,
      context: `runs[${String(runIndex)}]`,
      options: options,
      findings: findings,
      skipped: skipped,
    });
  }
  return { findings, skipped };
}

export function ingestSarifText(text, options = {}) {
  return ingestSarif(JSON.parse(text), options);
}

function ingestRun({ run, context, options, findings, skipped }) {
  if (!isRecord(run)) {
    throw new TypeError(`${context} must be an object`);
  }
  const driver = run.tool?.driver;
  const tool = options.tool ?? nonEmpty(driver?.name) ?? 'sarif';
  const rules = Array.isArray(driver?.rules) ? driver.rules : [];
  const seen = new Map();

  for (const [resultIndex, result] of (Array.isArray(run.results) ? run.results : []).entries()) {
    ingestResult(result, `${context}.results[${String(resultIndex)}]`, {
      tool,
      rules,
      options,
      seen,
      findings,
      skipped,
    });
  }
}

function isIgnored(result) {
  const suppressed = Array.isArray(result.suppressions) && result.suppressions.length > 0;
  return suppressed || SKIPPED_KINDS.has(result.kind);
}

function ruleOf(result, rules) {
  const byIndex = Number.isInteger(result.ruleIndex) ? rules[result.ruleIndex]?.id : undefined;
  return nonEmpty(result.ruleId) ?? nonEmpty(result.rule?.id) ?? nonEmpty(byIndex);
}

function classify(result, rule, rules) {
  if (result.kind !== undefined && result.kind !== 'fail') {
    return 'descriptive';
  }
  const declared = rules.find((candidate) => isRecord(candidate) && candidate.id === rule);
  const level = result.level ?? declared?.defaultConfiguration?.level ?? DEFAULT_LEVEL;
  return ENFORCEABLE_LEVELS.has(level) ? 'enforceable' : 'descriptive';
}

function messageOf(result, rule) {
  return nonEmpty(result.message?.text) ?? nonEmpty(result.message?.markdown) ?? rule;
}

function primaryLocation(result) {
  return Array.isArray(result.locations) ? result.locations.find(isRecord) : undefined;
}

function resultPath(result, root) {
  const uri = nonEmpty(primaryLocation(result)?.physicalLocation?.artifactLocation?.uri);
  return uri === undefined ? undefined : normalizeUri(uri, root);
}

function decodeOrKeepRawUri(uri) {
  try {
    return decodeURIComponent(uri);
  } catch (error) {
    return error instanceof URIError ? uri : decodeURIComponent(uri);
  }
}

export function normalizeUri(uri, root) {
  let candidate = decodeOrKeepRawUri(uri)
    .replace(/^file:\/\//, '')
    .replaceAll('\\', '/');
  if (/^\/[A-Za-z]:\//.test(candidate)) {
    candidate = candidate.slice(1);
  }
  if (root !== undefined) {
    const prefix = `${root.replaceAll('\\', '/').replace(/\/+$/, '')}/`;
    if (candidate.startsWith(prefix)) {
      candidate = candidate.slice(prefix.length);
    }
  }
  candidate = candidate.replace(/^(\.\/)+/, '');
  if (
    candidate === '' ||
    candidate.includes('\0') ||
    /^(\/|[A-Za-z]:\/|\.\.(\/|$))/.test(candidate)
  ) {
    return undefined;
  }
  return candidate;
}

function symbolOf(result) {
  const logicalLocations = primaryLocation(result)?.logicalLocations;
  const logical = Array.isArray(logicalLocations) ? logicalLocations.find(isRecord) : undefined;
  return nonEmpty(logical?.fullyQualifiedName) ?? nonEmpty(logical?.name);
}

function locationOf(result) {
  const region = primaryLocation(result)?.physicalLocation?.region;
  if (!isRecord(region) || !Number.isInteger(region.startLine) || region.startLine < 1) {
    return undefined;
  }
  const location = { line: region.startLine };
  if (Number.isInteger(region.startColumn) && region.startColumn >= 1) {
    location.column = region.startColumn;
  }
  return location;
}

function compareKeys(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function identityOf({ result, rule, filePath, symbol }) {
  const fingerprints = isRecord(result.partialFingerprints) ? result.partialFingerprints : {};
  const entries = Object.entries(fingerprints)
    .filter(([, value]) => typeof value === 'string' && value !== '')
    .sort(([left], [right]) => compareKeys(left, right));
  if (entries.length > 0) {
    return `fp:${entries.map(([key, value]) => `${key}=${value}`).join(';')}`;
  }
  const digest = createHash('sha256')
    .update([rule, filePath, symbol ?? ''].join('\0'))
    .digest('hex')
    .slice(0, 16);
  return `sarif:${digest}`;
}

function nonEmpty(value) {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ingestResult(result, resultContext, { tool, rules, options, seen, findings, skipped }) {
  if (!isRecord(result) || isIgnored(result)) {
    return;
  }
  const rule = ruleOf(result, rules);
  const filePath = resultPath(result, options.root);
  if (rule === undefined || filePath === undefined) {
    skipped.push({
      context: resultContext,
      reason: rule === undefined ? 'no rule' : 'no usable path',
    });
    return;
  }
  const symbol = symbolOf(result);
  const identity = uniqueResultIdentity(result, { rule, filePath, symbol }, seen);

  const finding = {
    tool,
    rule,
    path: filePath,
    identity,
    message: messageOf(result, rule),
    classification: classify(result, rule, rules),
  };
  Object.assign(finding, resultAttributes(result, symbol));
  findings.push(finding);
}

function uniqueResultIdentity(result, { rule, filePath, symbol }, seen) {
  const baseIdentity = identityOf({
    result: result,
    rule: rule,
    filePath: filePath,
    symbol: symbol,
  });
  const seenKey = `${filePath}\0${baseIdentity}`;
  const count = (seen.get(seenKey) ?? 0) + 1;
  seen.set(seenKey, count);

  return count === 1 ? baseIdentity : `${baseIdentity}#${String(count)}`;
}

function resultAttributes(result, symbol) {
  const location = locationOf(result);
  return {
    ...(symbol === undefined ? {} : { symbol }),
    ...(location === undefined ? {} : { location }),
  };
}
