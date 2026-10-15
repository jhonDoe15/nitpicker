import { TEST_RESULT_RULES } from '../../../shared/policy.mjs';
import { TESTS_FAILED_RULES } from '../../../shared/rules/finding-helpers.mjs';

export function isTestResultFinding(finding) {
  return TEST_RESULT_RULES.includes(finding.rule) || finding.rule.startsWith('mutant-');
}

export function changedByDiff(finding, touchedCode) {
  const changed = touchedCode?.changedLines.get(finding.path);
  if (changed === undefined) {
    return false;
  }
  const line = finding.location?.line;
  const endLine = finding.location?.endLine ?? line;
  return (
    changed.added ||
    (line !== undefined && changed.ranges.some(([start, end]) => start <= endLine && line <= end))
  );
}

function isToolError(finding) {
  return finding.classification === 'tool-error';
}

export function testFailuresOf(report) {
  const errors = (report?.findings ?? []).filter(isToolError);
  return errors.length > 0 && errors.every(({ rule }) => TESTS_FAILED_RULES.includes(rule))
    ? errors
    : [];
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
  return red;
}

export function isBaseUnknown({ name, baseRun, headRun, redBase }) {
  return (
    redBase.has(name) ||
    (baseRun.reports.get(name) === undefined &&
      redBase.has(baseRun.skipped?.get(name)) &&
      isCleanHead(headRun, name))
  );
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
