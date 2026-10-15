import { createHash } from 'node:crypto';
import { mutantRuleId } from '../../../../shared/policy.mjs';

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

function scopeOf({ targets, testedModules }) {
  return { tested: new Set(testedModules), ranges: rangesByFile(targets) };
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

function isPositional(scope, filePath) {
  return !scope.ranges.has(filePath);
}

function escapedMutants(report, scope) {
  return Object.entries(report.files ?? {})
    .filter(([filePath]) => scope.tested.has(filePath))
    .map(([filePath, file]) => ({
      filePath,
      escaped: keyedMutants(file.mutants ?? [], isPositional(scope, filePath)).filter(
        ({ mutant }) =>
          !isOnChangedCode(scope, filePath, mutant) && ESCAPED_STATUSES.has(mutant.status),
      ),
    }));
}

export function hasWeakeningCandidates(report, mutationScope) {
  return escapedMutants(report, scopeOf(mutationScope)).some(({ escaped }) => escaped.length > 0);
}

function mutantKey(mutant, positional) {
  const start = mutant.location?.start;
  const anchor = positional ? `${String(start?.line)}:${String(start?.column)}` : mutant.sourceHash;
  return [mutant.mutatorName, mutant.replacement ?? '', anchor ?? ''].join('\0');
}

function keyedMutants(mutants, positional) {
  const seen = new Map();
  return mutants.map((mutant) => {
    const key = mutantKey(mutant, positional);
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return { mutant, key: `${key}\0${String(occurrence)}` };
  });
}

export function baseMutationTargets(headReport, mutationScope) {
  const scope = scopeOf(mutationScope);
  return escapedMutants(headReport, scope)
    .filter(({ escaped }) => escaped.length > 0)
    .flatMap(({ filePath, escaped }) =>
      isPositional(scope, filePath)
        ? escaped.map(
            ({ mutant }) =>
              `${filePath}:${String(startLine(mutant))}-${String(mutant.location?.end?.line ?? startLine(mutant))}`,
          )
        : [filePath],
    )
    .filter((target, index, targets) => targets.indexOf(target) === index);
}

function caughtKeys(baseFile, positional) {
  return new Set(
    keyedMutants(baseFile?.mutants ?? [], positional)
      .filter(({ mutant }) => CAUGHT_STATUSES.has(mutant.status))
      .map(({ key }) => key),
  );
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
  return `This change weakened the tests of ${filePath}: the base tests caught this ${change}, but ${outcome}. Restore the assertion that caught it, or add one.`;
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
    const caught = caughtKeys(baseReport.files?.[filePath], isPositional(scope, filePath));
    return escaped
      .filter(({ key }) => caught.has(key))
      .map((entry) => weakenedFinding(analyzerName, filePath, entry));
  });
}
