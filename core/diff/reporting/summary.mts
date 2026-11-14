import { isPolicyFinding } from './review/policy-findings.mjs';
import { consolePolicySummary } from './review/policy-changes.mts';
import { heldSummaryLines } from './format/held-findings.mts';
import { foldMutants } from './format/mutants.mts';
import { noteSummaryLines } from './format/notes.mts';
import { singleLine } from './format/text.mjs';
import { designNoteLines } from './format/design-notes.mts';
import { areaCountLine } from './format/rule-groups/finding-areas.mts';
import { byFixOrder, ruleGroupLines } from './format/rule-groups/rule-groups.mts';
import { reviewSummaryLines } from './review/notices.mts';
import { quickLines } from '../../quick/summary.mjs';
import { scopeLine } from '../../scope/scope-findings.mjs';
import { partialRunLines } from './partial-run/partial-run.mts';
import { skippedLines, unaffectedLine } from '../skipping/lines.mts';
import { snapshotToolLines } from './console/snapshot-tools.mts';
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
  readonly projectRoot?: string | undefined;
};

type GateOptions = {
  readonly color: boolean;
  readonly diagnosticsPath: string;
  readonly snapshot: boolean;
};

type ViolationSummary = {
  readonly violations: readonly ReportEntry[];
  readonly incomplete: boolean;
  readonly testsFail: boolean;
  readonly policyCount: number;
  readonly snapshot: boolean;
};

const isPolicyEntry: (finding: ReportEntry) => boolean = isPolicyFinding;
const oneLine: (value: unknown) => string = singleLine;
const quickLinesOf: (summary: unknown) => readonly string[] = quickLines;
const scopeLinesOf: (summary: unknown) => readonly string[] = scopeLine;
const skippedLinesOf: (summary: unknown) => readonly string[] = skippedLines;
const unaffected: (summary: unknown, names: unknown) => string = unaffectedLine;
const analyzerLines: (tools: unknown) => readonly string[] = snapshotToolLines;

const SHORT_SHA_LENGTH = 12;
const FINDING = 'finding';

export function renderSnapshotConsole(
  report: Pick<ReportData, 'summary' | 'toolErrors'> & {
    readonly findings: readonly ReportEntry[];
  },
  options: ConsoleOptions,
): string {
  const { findings, summary, toolErrors } = report;
  return renderGateSummary(
    {
      summary,
      toolErrors,
      newFindings: findings,
      unchangedFindings: [],
      resolvedFindings: [],
      changedMetrics: [],
      notes: [],
    },
    { ...options, snapshot: true },
  );
}

export function renderConsoleSummary(report: ReportData, options: ConsoleOptions): string {
  const skippedAll = fieldOf(report.summary, 'skippedAll') === true;
  if (fieldOf(report.summary, 'noChanges') !== true && !skippedAll) {
    return renderGateSummary(report, { ...options, snapshot: false });
  }
  const { requestedBaseRef, mergeBaseSha, skippedAnalyzers } = report.summary;
  const line = skippedAll
    ? `${unaffected(report.summary, skippedAnalyzers)}\n`
    : `No changes since ${textOf(requestedBaseRef)} (${textOf(mergeBaseSha).slice(0, SHORT_SHA_LENGTH)}); nothing to check.\n`;
  return report.toolErrors.length === 0
    ? line
    : `${line}${renderGateSummary(report, { ...options, snapshot: false })}`;
}

function gateHead(
  report: ReportData,
  { color, diagnosticsPath, snapshot }: GateOptions,
  failingTests: readonly ReportEntry[],
): string[] {
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const hasFailures = violations.length > 0 || report.toolErrors.length > 0;
  return [
    '',
    style(
      snapshot ? 'Quality snapshot summary' : 'Quality gate summary',
      hasFailures ? [ANSI.bold, ANSI.red] : [ANSI.bold, ANSI.green],
      { color },
    ),
    ...scopeLinesOf(report.summary),
    ...failingTestLines(failingTests, {
      headline: (text) => failing(text, color),
      label: (tool) => style(textOf(tool), [ANSI.yellow], { color }),
      diagnosticsPath,
    }),
  ];
}

function renderGateSummary(
  report: ReportData,
  {
    color,
    details,
    diagnosticsPath: givenPath = 'reports/quality/diff/combined/report.txt',
    projectRoot,
    snapshot,
  }: ConsoleOptions & { readonly snapshot: boolean },
): string {
  const diagnosticsPath = textOf(givenPath);
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const { failingTests, otherErrors } = splitToolErrors(report.toolErrors);
  const lines = gateHead(report, { color, diagnosticsPath, snapshot }, failingTests);
  appendViolationSummary(
    lines,
    {
      violations: violations.filter((finding) => !isPolicyEntry(finding)),
      incomplete: otherErrors.length > 0,
      testsFail: failingTests.length > 0,
      policyCount: violations.filter(isPolicyEntry).length,
      snapshot,
    },
    { color, details },
  );
  lines.push(
    ...reviewSummaryLines(consolePolicySummary(report), (text) =>
      style(text, [ANSI.bold, ANSI.yellow], { color }),
    ),
  );
  lines.push(...heldSummaryLines(report.unchangedFindings, { color, details, diagnosticsPath }));
  lines.push(...designNoteLines(report.newFindings, diagnosticsPath, { snapshot }));
  appendNoteSummary(lines, report.notes, color);
  lines.push(...toolErrorSummaryLines(otherErrors, { color, projectRoot }));
  lines.push(...closingLines(report, { color, diagnosticsPath, snapshot }));
  return `${lines.join('\n')}\n`;
}

function closingLines(
  report: ReportData,
  { color, diagnosticsPath, snapshot }: GateOptions,
): string[] {
  const footer = [
    ...partialRunLines(report.summary),
    ...skippedLinesOf(report.summary),
    ...quickLinesOf(report.summary),
  ];
  return [
    ...(snapshot ? analyzerLines(report.summary['tools']) : []),
    ...footer.map((line) => style(line, [ANSI.bold, ANSI.yellow], { color })),
    style(`Full diagnostics: ${diagnosticsPath}`, [ANSI.dim], { color }),
  ];
}

function appendNoteSummary(
  lines: string[],
  notes: readonly ReportEntry[] | undefined,
  color: boolean,
): void {
  for (const line of noteSummaryLines(notes)) {
    lines.push(style(line, [ANSI.dim], { color }));
  }
}

function violationHeadline(
  { violations, incomplete, testsFail, policyCount, snapshot }: ViolationSummary,
  color: boolean,
): string {
  const fresh = snapshot ? '' : 'new ';
  const noun = snapshot ? FINDING : 'violation';
  const policy = `${String(policyCount)} unapproved policy ${pluralize('change', policyCount)}`;
  const code = `${String(violations.length)} code ${pluralize('violation', violations.length)}`;
  if (violations.length === 0 && policyCount > 0) {
    const verb = policyCount === 1 ? 'fails' : 'fail';
    const tail = incomplete ? ' and the run is incomplete:' : '';
    return failing(`✖ No new code violations, but ${policy} ${verb} the gate${tail}`, color);
  }
  if (violations.length === 0 && incomplete) {
    return `No ${fresh}enforceable ${noun}s, but the run is incomplete:`;
  }
  if (violations.length === 0) {
    return testsFail
      ? `No ${fresh}enforceable ${noun}s in the checks that ran.`
      : style(`✓ No ${fresh}enforceable ${noun}s`, [ANSI.green], { color });
  }
  const total = violations.length + policyCount;
  return failing(
    policyCount === 0
      ? `✖ ${String(total)} ${fresh}enforceable ${pluralize(noun, total)}`
      : `✖ ${String(total)} ${fresh}enforceable ${noun}s: ${code} and ${policy}`,
    color,
  );
}

function failing(text: string, color: boolean): string {
  return style(text, [ANSI.bold, ANSI.red], { color });
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
      ...ruleGroupLines(foldMutants(violations), (label) => style(label, [ANSI.yellow], { color })),
    );
    return;
  }
  for (const group of groupRepeatedFindings(violations.toSorted(byFixOrder))) {
    const [finding] = group;
    if (finding === undefined) {
      continue;
    }
    lines.push(
      `  ${style(`${textOf(finding.tool)}/${textOf(finding.rule)}`, [ANSI.yellow], { color })} ${textOf(finding.path)}${describeLocations(group)}`,
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
