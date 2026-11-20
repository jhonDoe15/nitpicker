import { RULE_IDS } from '../../../../shared/policy.mjs';
import {
  MUTATION_FAILED_PART_RULE,
  TESTS_FAILED_RULES,
  TESTS_FAILED_SCOPE_SEPARATOR,
  TESTS_UNMEASURED_RULES,
  TOOL_SKIPPED_RULE,
} from '../../../../shared/rules/finding-helpers.mjs';
import type { Finding } from '../../../../shared/values/findings.mts';
import type { ChangedLines, TouchedCode } from '../model/finding-types.mts';

type Run = {
  readonly reports: ReadonlyMap<string, { readonly findings: readonly Finding[] }>;
  readonly toolErrors: readonly { readonly tool?: unknown; readonly rule?: unknown }[];
  readonly skipped?: ReadonlyMap<string, unknown> | undefined;
};

type Report = { readonly findings: readonly Finding[] } | undefined;

type FindingTest = (finding: Finding) => boolean;

const testsFailedRules: readonly unknown[] = TESTS_FAILED_RULES;
const testsUnmeasuredRules: readonly unknown[] = TESTS_UNMEASURED_RULES;

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
  'data-race',
];

export function isTestResultFinding(finding: Finding): boolean {
  return TEST_RESULT_RULES.includes(finding.rule) || finding.rule.startsWith('mutant-');
}

function isUnder(directory: string, file: string): boolean {
  return directory === '.' || file === directory || file.startsWith(`${directory}/`);
}

export function unknownOnBaseFor(
  failures: readonly Finding[],
  touchedCode: Pick<TouchedCode, 'testsRemoved'> | undefined,
): FindingTest | undefined {
  if (touchedCode?.testsRemoved === true || failures.length === 0) {
    return undefined;
  }
  const modules = failures.flatMap(({ symbol }) =>
    (symbol ?? '.').split(TESTS_FAILED_SCOPE_SEPARATOR),
  );
  return (finding: Finding) =>
    isTestResultFinding(finding) && modules.some((module) => isUnder(module, finding.path));
}

export function mutationFailuresOf(report: Report): Finding[] {
  return (report?.findings ?? []).filter(
    (finding) => isToolError(finding) && finding.rule === MUTATION_FAILED_PART_RULE,
  );
}

export function unknownMutantsFor(
  failures: readonly Finding[],
  touchedCode?: Pick<TouchedCode, 'testsRemoved'>,
): FindingTest | undefined {
  const unknown = unknownOnBaseFor(failures, touchedCode);
  return unknown && ((finding: Finding) => finding.rule.startsWith('mutant-') && unknown(finding));
}

export function changedByDiff(finding: Finding, touchedCode: ChangedLines | undefined): boolean {
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
  const edited =
    endLine !== undefined && changed.ranges.some(([start, end]) => start <= endLine && line <= end);
  const trimmed =
    endLine !== undefined &&
    (changed.deletions ?? []).some((after) => line <= after && after < endLine);
  return edited || trimmed;
}

function isToolError(finding: Finding): boolean {
  return finding.classification === 'tool-error' && finding.rule !== TOOL_SKIPPED_RULE;
}

export function testFailuresOf(report: Report): Finding[] {
  const errors = (report?.findings ?? []).filter(isToolError);
  const redBase = errors.length > 0 && errors.every(({ rule }) => testsFailedRules.includes(rule));
  return redBase ? errors : [];
}

function isScopedHeadTestFailure(finding: Finding, name: string): boolean {
  return (
    isToolError(finding) &&
    testsUnmeasuredRules.includes(finding.rule) &&
    finding.tool !== name &&
    finding.symbol !== undefined
  );
}

export function headTestFailuresOf(report: Report, name: string): Finding[] {
  return (report?.findings ?? []).filter((finding) => isScopedHeadTestFailure(finding, name));
}

function isCleanHead(headRun: Run, name: string): boolean {
  const report = headRun.reports.get(name);
  return (
    report !== undefined &&
    !report.findings.some(
      (finding) => isToolError(finding) && !isScopedHeadTestFailure(finding, name),
    ) &&
    !headRun.toolErrors.some(({ tool, rule }) => tool === name && rule !== TOOL_SKIPPED_RULE)
  );
}

export function redBaseAnalyzers({
  names,
  baseRun,
  headRun,
}: {
  readonly names: readonly string[];
  readonly baseRun: Run;
  readonly headRun: Run;
}): Map<string, Finding[]> {
  const red = new Map<string, Finding[]>();
  for (const name of names) {
    const failures = baseRun.toolErrors.some(
      ({ tool, rule }) => tool === name && rule !== TOOL_SKIPPED_RULE,
    )
      ? []
      : testFailuresOf(baseRun.reports.get(name));
    if (failures.length > 0 && isCleanHead(headRun, name)) {
      red.set(name, failures);
    }
  }
  const anyTestFailed = [...red.values()].some((failures) =>
    failures.some(({ rule }) => testsUnmeasuredRules.includes(rule)),
  );
  return anyTestFailed ? red : new Map<string, Finding[]>();
}

export function baseFailuresOf({
  name,
  baseRun,
  headRun,
  redBase,
}: {
  readonly name: string;
  readonly baseRun: Run;
  readonly headRun: Run;
  readonly redBase: ReadonlyMap<unknown, readonly Finding[]>;
}): readonly Finding[] | undefined {
  const redFailures = redBase.get(name);
  if (redFailures !== undefined) {
    return redFailures;
  }
  const skippedBecause = baseRun.skipped?.get(name);
  return baseRun.reports.get(name) === undefined &&
    redBase.has(skippedBecause) &&
    isCleanHead(headRun, name)
    ? redBase.get(skippedBecause)
    : undefined;
}

export function baseNoteOf(
  name: string,
  finding: Finding,
): {
  readonly tool: string;
  readonly snapshot: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
} {
  return {
    tool: name,
    snapshot: 'base',
    rule: finding.rule,
    path: finding.path,
    message: finding.message,
  };
}
