import { RULE_IDS } from '../../../../shared/policy.mjs';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_RULES,
  TESTS_FAILED_SCOPE_SEPARATOR,
} from '../../../../shared/rules/finding-helpers.mjs';

const TEST_RESULT_RULES = [
  RULE_IDS.crapScoreLimit,
  RULE_IDS.crapCoverageUnknown,
  RULE_IDS.changedBranchCoverage,
  RULE_IDS.mutantSurvived,
  RULE_IDS.mutantNoCoverage,
  RULE_IDS.slowTest,
  RULE_IDS.testConsoleOutput,
  'uncovered-function',
  'uncovered-method',
  'line-coverage',
  'test-efficiency',
];

export function isTestResultFinding(finding) {
  return TEST_RESULT_RULES.includes(finding.rule) || finding.rule.startsWith('mutant-');
}

function isUnder(directory, file) {
  return directory === '.' || file === directory || file.startsWith(`${directory}/`);
}

export function unknownOnBaseFor(failures, touchedCode) {
  if (touchedCode?.testsRemoved === true || failures.length === 0) {
    return undefined;
  }
  const modules = failures.flatMap(({ symbol }) =>
    (symbol ?? '.').split(TESTS_FAILED_SCOPE_SEPARATOR),
  );
  return (finding) =>
    isTestResultFinding(finding) && modules.some((module) => isUnder(module, finding.path));
}

export function changedByDiff(finding, touchedCode) {
  const changed = touchedCode?.changedLines.get(finding.path);
  if (changed === undefined) {
    return false;
  }
  const line = finding.location?.line;
  const endLine = finding.location?.endLine ?? line;
  if (changed.added) {
    return true;
  }
  if (line === undefined) {
    return false;
  }
  const edited = changed.ranges.some(([start, end]) => start <= endLine && line <= end);
  const trimmed = (changed.deletions ?? []).some((after) => line <= after && after < endLine);
  return edited || trimmed;
}

function isToolError(finding) {
  return finding.classification === 'tool-error';
}

export function testFailuresOf(report) {
  const errors = (report?.findings ?? []).filter(isToolError);
  const redBase =
    errors.length > 0 && errors.every(({ rule }) => TESTS_FAILED_RULES.includes(rule));
  return redBase ? errors : [];
}

function isCleanHead(headRun, name) {
  const report = headRun.reports.get(name);
  return (
    report !== undefined &&
    !report.findings.some(isToolError) &&
    !headRun.toolErrors.some(({ tool }) => tool === name)
  );
}

export function redBaseAnalyzers({ names, baseRun, headRun }) {
  const red = new Map();
  for (const name of names) {
    const failures = baseRun.toolErrors.some(({ tool }) => tool === name)
      ? []
      : testFailuresOf(baseRun.reports.get(name));
    if (failures.length > 0 && isCleanHead(headRun, name)) {
      red.set(name, failures);
    }
  }
  const anyTestFailed = [...red.values()].some((failures) =>
    failures.some(({ rule }) => rule === TESTS_FAILED_RULE),
  );
  return anyTestFailed ? red : new Map();
}

export function baseFailuresOf({ name, baseRun, headRun, redBase }) {
  if (redBase.has(name)) {
    return redBase.get(name);
  }
  const skippedBecause = baseRun.skipped?.get(name);
  return baseRun.reports.get(name) === undefined &&
    redBase.has(skippedBecause) &&
    isCleanHead(headRun, name)
    ? redBase.get(skippedBecause)
    : undefined;
}

export function baseNoteOf(name, finding) {
  return {
    tool: name,
    snapshot: 'base',
    rule: finding.rule,
    path: finding.path,
    message: finding.message,
  };
}
