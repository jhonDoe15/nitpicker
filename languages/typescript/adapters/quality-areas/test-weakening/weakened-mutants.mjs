import { createHash } from 'node:crypto';
import { mutantRuleId } from '../../../../../shared/policy.mjs';
import { baseLineOf } from './line-shifts.mjs';

const CAUGHT_STATUSES = new Set(['Killed', 'Timeout']);
const ESCAPED_STATUSES = new Set(['Survived', 'NoCoverage']);
const CODE_LIMIT = 80;

function startLine(mutant) {
  return mutant.location?.start?.line;
}

function onChangedLine(mutant, ranges) {
  const line = startLine(mutant);
  return ranges.some(([first, last]) => line >= first && line <= last);
}

function rangesByFile(targets) {
  const ranges = new Map();
  for (const target of targets) {
    const match = /^(.*):(\d+)-(\d+)$/u.exec(target);
    if (match !== null) {
      ranges.set(match[1], [...(ranges.get(match[1]) ?? []), [Number(match[2]), Number(match[3])]]);
    }
  }
  return ranges;
}

function withMutants(report, selectMutants) {
  return {
    ...report,
    files: Object.fromEntries(
      Object.entries(report.files ?? {}).map(([filePath, file]) => [
        filePath,
        { ...file, mutants: selectMutants(filePath, file.mutants ?? []) },
      ]),
    ),
  };
}

export function mutationTargetsWithTestedModules(targets, testedModules) {
  const tested = new Set(testedModules);
  return [
    ...targets.filter((target) => !tested.has(target.replace(/:\d+-\d+$/u, ''))),
    ...testedModules,
  ];
}

function scopeOf({ targets, testedModules, lineShifts = new Map() }) {
  return { tested: new Set(testedModules), ranges: rangesByFile(targets), lineShifts };
}

function isOnChangedCode(scope, filePath, mutant) {
  return !scope.tested.has(filePath) || onChangedLine(mutant, scope.ranges.get(filePath) ?? []);
}

export function changedCodeMutants(report, mutationScope) {
  const scope = scopeOf(mutationScope);
  return withMutants(report, (filePath, mutants) =>
    mutants.filter((mutant) => isOnChangedCode(scope, filePath, mutant)),
  );
}

function escapedMutants(report, scope) {
  return Object.entries(report.files ?? {})
    .filter(([filePath]) => scope.tested.has(filePath))
    .map(([filePath, file]) => ({
      filePath,
      escaped: (file.mutants ?? []).filter(
        (mutant) =>
          !isOnChangedCode(scope, filePath, mutant) && ESCAPED_STATUSES.has(mutant.status),
      ),
    }));
}

export function hasWeakeningCandidates(report, mutationScope) {
  return escapedMutants(report, scopeOf(mutationScope)).some(({ escaped }) => escaped.length > 0);
}

function baseLineMapper(scope, filePath) {
  const hunks = scope.lineShifts.get(filePath) ?? [];
  return (line) => (typeof line === 'number' ? baseLineOf(hunks, line) : undefined);
}

function keyedMutants(mutants, baseLine) {
  return mutants.flatMap((mutant) => {
    const line = baseLine(startLine(mutant));
    if (line === undefined) return [];
    const column = String(mutant.location?.start?.column);
    const key = [mutant.mutatorName, mutant.replacement ?? '', `${String(line)}:${column}`];
    return [{ mutant, key: key.join('\0') }];
  });
}

function baseRange(baseLine, mutant) {
  const first = baseLine(startLine(mutant));
  const last = baseLine(mutant.location?.end?.line ?? startLine(mutant));
  return first === undefined || last === undefined ? [] : [`${String(first)}-${String(last)}`];
}

export function baseMutationTargets(headReport, mutationScope) {
  const scope = scopeOf(mutationScope);
  const targets = escapedMutants(headReport, scope).flatMap(({ filePath, escaped }) => {
    const baseLine = baseLineMapper(scope, filePath);
    return escaped.flatMap((mutant) =>
      baseRange(baseLine, mutant).map((range) => `${filePath}:${range}`),
    );
  });
  return [...new Set(targets)];
}

function caughtKeys(baseFile) {
  const caught = (baseFile?.mutants ?? []).filter((mutant) => CAUGHT_STATUSES.has(mutant.status));
  return new Set(keyedMutants(caught, (line) => line).map(({ key }) => key));
}

function inlineCode(value) {
  const text = String(value).replaceAll(/\s+/gu, ' ').trim();
  return `\`${text.length > CODE_LIMIT ? `${text.slice(0, CODE_LIMIT)}…` : text}\``;
}

function weakenedMessage(filePath, mutant) {
  const change =
    mutant.original === undefined || mutant.replacement === undefined
      ? `${mutant.mutatorName} mutant`
      : `${mutant.mutatorName} mutant (${inlineCode(mutant.original)} replaced with ${inlineCode(mutant.replacement)})`;
  const outcome = mutant.status === 'NoCoverage' ? 'no test runs it now' : 'it survives now';
  return `This change weakened the tests of ${filePath}: the base tests caught this ${change}, but ${outcome}. Restore the assertion that caught it, or add one. If the tests are weaker on purpose, add an exception for ${mutantRuleId(mutant.status)} with this path in nitpicker.config.json.`;
}

function weakenedFinding(analyzerName, filePath, { mutant, key }) {
  const line = startLine(mutant);
  const column = mutant.location?.start?.column;
  return {
    tool: analyzerName,
    rule: mutantRuleId(mutant.status),
    path: filePath,
    identity: `weakened|${createHash('sha256').update(key).digest('hex').slice(0, 24)}`,
    message: weakenedMessage(filePath, mutant),
    classification: 'enforceable',
    ...(typeof line === 'number'
      ? { location: { line, ...(typeof column === 'number' ? { column } : {}) } }
      : {}),
  };
}

export function weakenedTestFindings({ headReport, baseReport, mutationScope, analyzerName }) {
  const scope = scopeOf(mutationScope);
  return escapedMutants(headReport, scope).flatMap(({ filePath, escaped }) => {
    const caught = caughtKeys(baseReport.files?.[filePath]);
    return keyedMutants(escaped, baseLineMapper(scope, filePath))
      .filter(({ key }) => caught.has(key))
      .map((entry) => weakenedFinding(analyzerName, filePath, entry));
  });
}
