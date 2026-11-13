import { isPolicyFinding } from './review/policy-findings.mjs';
import { consolePolicySummary } from './review/policy-changes.mts';
import { heldFindings, heldLine } from './format/held-findings.mts';
import { foldMutants } from './format/mutants.mts';
import { noteSummaryLines } from './format/notes.mts';
import { singleLine } from './format/text.mjs';
import { designNoteLines } from './format/design-notes.mts';
import { areaCountLine } from './format/rule-groups/finding-areas.mts';
import { byFixOrder, ruleGroupLines, withoutRoute } from './format/rule-groups/rule-groups.mts';
import { reviewSummaryLines } from './review/notices.mts';
import { quickLines } from '../../quick/summary.mjs';
import { scopeLine } from '../../scope/scope-findings.mjs';
import { partialRunLines } from './partial-run/partial-run.mts';
import { failingTestLines } from './failing-tests/failing-tests.mts';
import {
  ANSI,
  pluralize,
  splitToolErrors,
  style,
  toolErrorSummaryLines,
} from './console/tool-errors.mts';

export { errorHeadline, pluralize, withoutSkipNotices } from './console/tool-errors.mts';
import type { ReportData, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

type ConsoleOptions = {
  readonly color: boolean;
  readonly details: boolean;
  readonly diagnosticsPath?: unknown;
};

type HeldOptions = {
  readonly color: boolean;
  readonly details: boolean;
  readonly diagnosticsPath: string;
};

type ViolationSummary = {
  readonly violations: readonly ReportEntry[];
  readonly incomplete: boolean;
  readonly testsFail: boolean;
  readonly policyCount: number;
};

const isPolicyEntry: (finding: ReportEntry) => boolean = isPolicyFinding;
const oneLine: (value: unknown) => string = singleLine;
const quickLinesOf: (summary: unknown) => readonly string[] = quickLines;
const scopeLinesOf: (summary: unknown) => readonly string[] = scopeLine;

const SHORT_SHA_LENGTH = 12;

export function renderConsoleSummary(report: ReportData, options: ConsoleOptions): string {
  if (fieldOf(report.summary, 'noChanges') !== true) {
    return renderGateSummary(report, options);
  }
  const { requestedBaseRef, mergeBaseSha } = report.summary;
  const line = `No changes since ${textOf(requestedBaseRef)} (${textOf(mergeBaseSha).slice(0, SHORT_SHA_LENGTH)}); nothing to check.\n`;
  return report.toolErrors.length === 0 ? line : `${line}${renderGateSummary(report, options)}`;
}

function renderGateSummary(
  report: ReportData,
  {
    color,
    details,
    diagnosticsPath: givenPath = 'reports/quality/diff/combined/report.txt',
  }: ConsoleOptions,
): string {
  const diagnosticsPath = textOf(givenPath);
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const hasFailures = violations.length > 0 || report.toolErrors.length > 0;
  const { failingTests, otherErrors } = splitToolErrors(report.toolErrors);
  const lines = [
    '',
    style(
      'Quality gate summary',
      hasFailures ? [ANSI.bold, ANSI.red] : [ANSI.bold, ANSI.green],
      color,
    ),
    ...scopeLinesOf(report.summary),
    ...failingTestLines(failingTests, {
      headline: (text) => failing(text, color),
      label: (tool) => style(textOf(tool), [ANSI.yellow], color),
      diagnosticsPath,
    }),
  ];
  appendViolationSummary(
    lines,
    {
      violations: violations.filter((finding) => !isPolicyEntry(finding)),
      incomplete: otherErrors.length > 0,
      testsFail: failingTests.length > 0,
      policyCount: violations.filter(isPolicyEntry).length,
    },
    { color, details },
  );
  lines.push(
    ...reviewSummaryLines(consolePolicySummary(report), (text) =>
      style(text, [ANSI.bold, ANSI.yellow], color),
    ),
  );
  appendHeldSummary(lines, report.unchangedFindings, { color, details, diagnosticsPath });
  lines.push(...designNoteLines(report.newFindings, diagnosticsPath, { snapshot: false }));
  appendNoteSummary(lines, report.notes, color);
  lines.push(...closingLines(report, { color, diagnosticsPath, otherErrors }));
  return `${lines.join('\n')}\n`;
}

type ClosingOptions = {
  readonly color: boolean;
  readonly diagnosticsPath: string;
  readonly otherErrors: readonly ReportEntry[];
};

function closingLines(
  report: ReportData,
  { color, diagnosticsPath, otherErrors }: ClosingOptions,
): string[] {
  return [
    ...toolErrorSummaryLines(otherErrors, color),
    ...[...partialRunLines(report.summary), ...quickLinesOf(report.summary)].map((line) =>
      style(line, [ANSI.bold, ANSI.yellow], color),
    ),
    style(`Full diagnostics: ${diagnosticsPath}`, [ANSI.dim], color),
  ];
}

const MAX_HELD_LINES = 10;

function appendHeldSummary(
  lines: string[],
  unchangedFindings: readonly ReportEntry[],
  { color, details, diagnosticsPath }: HeldOptions,
): void {
  const { metrics, lint } = heldFindings(unchangedFindings);
  if (metrics.length > 0) {
    lines.push(
      style(
        `Note: ${String(metrics.length)} ${pluralize('finding', metrics.length)} still over a limit in touched code (not failing, not worse than before):`,
        [ANSI.dim],
        color,
      ),
      ...heldList(metrics, { details, diagnosticsPath }),
    );
  }
  if (lint.length > 0) {
    lines.push(
      style(
        `Note: ${String(lint.length)} existing lint ${pluralize('finding', lint.length)} in edited code (not failing, no more than before):`,
        [ANSI.dim],
        color,
      ),
      ...heldList(lint, { details, diagnosticsPath }),
    );
  }
}

function heldList(
  findings: readonly ReportEntry[],
  { details, diagnosticsPath }: Omit<HeldOptions, 'color'>,
): string[] {
  const shown = details ? findings : findings.slice(0, MAX_HELD_LINES);
  const rest = findings.length - shown.length;
  return [
    ...shown.map((finding) => `  ${heldLine(details ? finding : withoutRoute(finding))}`),
    ...(rest === 0 ? [] : [`  … ${String(rest)} more; see ${diagnosticsPath}`]),
  ];
}

function appendNoteSummary(
  lines: string[],
  notes: readonly ReportEntry[] | undefined,
  color: boolean,
): void {
  for (const line of noteSummaryLines(notes)) {
    lines.push(style(line, [ANSI.dim], color));
  }
}

function violationHeadline(
  { violations, incomplete, testsFail, policyCount }: ViolationSummary,
  color: boolean,
): string {
  const policy = `${String(policyCount)} unapproved policy ${pluralize('change', policyCount)}`;
  const code = `${String(violations.length)} code ${pluralize('violation', violations.length)}`;
  if (violations.length === 0 && policyCount > 0) {
    const verb = policyCount === 1 ? 'fails' : 'fail';
    const tail = incomplete ? ' and the run is incomplete:' : '';
    return failing(`✖ No new code violations, but ${policy} ${verb} the gate${tail}`, color);
  }
  if (violations.length === 0 && incomplete) {
    return 'No new enforceable violations, but the run is incomplete:';
  }
  if (violations.length === 0) {
    return testsFail
      ? 'No new enforceable violations in the checks that ran.'
      : style('✓ No new enforceable violations', [ANSI.green], color);
  }
  const total = violations.length + policyCount;
  return failing(
    policyCount === 0
      ? `✖ ${String(total)} new enforceable ${pluralize('violation', total)}`
      : `✖ ${String(total)} new enforceable violations: ${code} and ${policy}`,
    color,
  );
}

function failing(text: string, color: boolean): string {
  return style(text, [ANSI.bold, ANSI.red], color);
}

function appendViolationSummary(
  lines: string[],
  summary: ViolationSummary,
  { color, details }: { readonly color: boolean; readonly details: boolean },
): void {
  const { violations } = summary;
  lines.push(violationHeadline(summary, color));
  const counts = areaCountLine(violations);
  if (counts !== undefined) {
    lines.push(`  by area: ${counts}`);
  }
  if (!details) {
    lines.push(
      ...ruleGroupLines(foldMutants(violations), (label) => style(label, [ANSI.yellow], color)),
    );
    return;
  }
  for (const group of groupRepeatedFindings(violations.toSorted(byFixOrder))) {
    const [finding] = group;
    if (finding === undefined) {
      continue;
    }
    lines.push(
      `  ${style(`${textOf(finding.tool)}/${textOf(finding.rule)}`, [ANSI.yellow], color)} ${textOf(finding.path)}${describeLocations(group)}`,
      `    ${oneLine(finding.message)}`,
    );
  }
}

function groupRepeatedFindings(findings: readonly ReportEntry[]): ReportEntry[][] {
  const groups = new Map<string, ReportEntry[]>();
  for (const finding of findings) {
    const key = [finding.tool, finding.rule, finding.path, finding.message].join('\0');
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return [...groups.values()];
}

function describeLocations(group: readonly ReportEntry[]): string {
  const lineNumbers = group.flatMap(({ location }) =>
    location === undefined ? [] : [fieldOf(location, 'line')],
  );
  if (group.length === 1) {
    return lineNumbers.length === 0 ? '' : `:${String(lineNumbers[0])}`;
  }
  const lineList = lineNumbers.length === group.length ? `, lines ${lineNumbers.join(', ')}` : '';
  return ` (${String(group.length)} times${lineList})`;
}
