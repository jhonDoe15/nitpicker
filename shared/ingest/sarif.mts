import { createHash } from 'node:crypto';
import { isRecord } from '../rules/facts/checks.mts';
import { fieldOf, listOf, parseJson } from '../values/readers.mts';
import type { Finding } from '../values/findings.mts';
import { IDENTITY_DIGEST_LENGTH } from './report-records.mts';
import { normalizeUri } from './sarif/uri.mts';
import type {
  ResultContext,
  ResultIdentityParts,
  RunInput,
  SarifIngest,
  SarifLocation,
  SarifOptions,
} from './typed/sarif-types.mts';

export { prepareSarif, projectRelative } from './sarif/prepare.mts';
export { normalizeUri } from './sarif/uri.mts';

const ENFORCEABLE_LEVELS = new Set(['error', 'warning']);
const SKIPPED_KINDS = new Set(['pass', 'notApplicable']);
const DEFAULT_LEVEL = 'warning';

export function ingestSarif(log: unknown, options: SarifOptions = {}): SarifIngest {
  if (!(isRecord(log) && Array.isArray(log['runs']))) {
    throw new TypeError('SARIF log must contain a runs array');
  }
  const findings: Finding[] = [];
  const skipped: SarifIngest['skipped'] = [];
  for (const [runIndex, run] of listOf(log['runs']).entries()) {
    ingestRun({
      run,
      context: `runs[${String(runIndex)}]`,
      options,
      findings,
      skipped,
    });
  }
  return { findings, skipped };
}

export function ingestSarifText(text: string, options: SarifOptions = {}): SarifIngest {
  return ingestSarif(parseJson(text), options);
}

function ingestRun({ run, context, options, findings, skipped }: RunInput): void {
  if (!isRecord(run)) {
    throw new TypeError(`${context} must be an object`);
  }
  const driver = fieldOf(run['tool'], 'driver');
  const tool = options.tool ?? nonEmpty(fieldOf(driver, 'name')) ?? 'sarif';
  const rules = listOf(fieldOf(driver, 'rules'));
  const seen = new Map<string, number>();

  for (const [resultIndex, result] of listOf(run['results']).entries()) {
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

function isIgnored(result: Record<string, unknown>): boolean {
  const suppressed = listOf(result['suppressions']).length > 0;
  const kind = result['kind'];
  return suppressed || (typeof kind === 'string' && SKIPPED_KINDS.has(kind));
}

function ruleOf(result: Record<string, unknown>, rules: readonly unknown[]): string | undefined {
  const index = result['ruleIndex'];
  const byIndex =
    typeof index === 'number' && Number.isInteger(index) ? fieldOf(rules[index], 'id') : undefined;
  return nonEmpty(result['ruleId']) ?? nonEmpty(fieldOf(result['rule'], 'id')) ?? nonEmpty(byIndex);
}

function classify(
  result: Record<string, unknown>,
  rule: string,
  rules: readonly unknown[],
): string {
  if (result['kind'] !== undefined && result['kind'] !== 'fail') {
    return 'descriptive';
  }
  const declared = rules.find((candidate) => isRecord(candidate) && candidate['id'] === rule);
  const level =
    result['level'] ?? fieldOf(fieldOf(declared, 'defaultConfiguration'), 'level') ?? DEFAULT_LEVEL;
  return typeof level === 'string' && ENFORCEABLE_LEVELS.has(level) ? 'enforceable' : 'descriptive';
}

function messageOf(result: Record<string, unknown>, rule: string): string {
  const message = result['message'];
  return nonEmpty(fieldOf(message, 'text')) ?? nonEmpty(fieldOf(message, 'markdown')) ?? rule;
}

function primaryLocation(result: Record<string, unknown>): Record<string, unknown> | undefined {
  return listOf(result['locations']).find(isRecord);
}

function resultPath(result: Record<string, unknown>, root: string | undefined): string | undefined {
  const uri = nonEmpty(
    fieldOf(
      fieldOf(fieldOf(primaryLocation(result), 'physicalLocation'), 'artifactLocation'),
      'uri',
    ),
  );
  return uri === undefined ? undefined : normalizeUri(uri, root);
}

function symbolOf(result: Record<string, unknown>): string | undefined {
  const logical = listOf(fieldOf(primaryLocation(result), 'logicalLocations')).find(isRecord);
  return nonEmpty(fieldOf(logical, 'fullyQualifiedName')) ?? nonEmpty(fieldOf(logical, 'name'));
}

function locationOf(result: Record<string, unknown>): SarifLocation | undefined {
  const region = fieldOf(fieldOf(primaryLocation(result), 'physicalLocation'), 'region');
  if (!isRecord(region)) {
    return undefined;
  }
  const startLine = region['startLine'];
  if (typeof startLine !== 'number' || !Number.isInteger(startLine) || startLine < 1) {
    return undefined;
  }
  const location: SarifLocation = { line: startLine };
  const startColumn = region['startColumn'];
  if (typeof startColumn === 'number' && Number.isInteger(startColumn) && startColumn >= 1) {
    location.column = startColumn;
  }
  return location;
}

function compareKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function identityOf({
  result,
  rule,
  filePath,
  symbol,
}: ResultIdentityParts & { readonly result: Record<string, unknown> }): string {
  const partial = result['partialFingerprints'];
  const fingerprints = isRecord(partial) ? partial : {};
  const entries = Object.entries(fingerprints)
    .flatMap(([key, value]): [string, string][] =>
      typeof value === 'string' && value !== '' ? [[key, value]] : [],
    )
    .sort(([left], [right]) => compareKeys(left, right));
  if (entries.length > 0) {
    return `fp:${entries.map(([key, value]) => `${key}=${value}`).join(';')}`;
  }
  const digest = createHash('sha256')
    .update([rule, filePath, symbol ?? ''].join('\0'))
    .digest('hex')
    .slice(0, IDENTITY_DIGEST_LENGTH);
  return `sarif:${digest}`;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function ingestResult(
  result: unknown,
  resultContext: string,
  { tool, rules, options, seen, findings, skipped }: ResultContext,
): void {
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

  const finding: Finding = {
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

function uniqueResultIdentity(
  result: Record<string, unknown>,
  { rule, filePath, symbol }: ResultIdentityParts,
  seen: Map<string, number>,
): string {
  const baseIdentity = identityOf({ result, rule, filePath, symbol });
  const seenKey = JSON.stringify([filePath, baseIdentity]);
  const count = (seen.get(seenKey) ?? 0) + 1;
  seen.set(seenKey, count);

  return count === 1 ? baseIdentity : `${baseIdentity}#${String(count)}`;
}

function resultAttributes(
  result: Record<string, unknown>,
  symbol: string | undefined,
): Record<string, unknown> {
  const location = locationOf(result);
  return {
    ...(symbol === undefined ? {} : { symbol }),
    ...(location === undefined ? {} : { location }),
  };
}
