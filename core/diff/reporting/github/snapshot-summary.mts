import {
  type LinkContext,
  exceptionExample,
  exceptionRoute,
  code,
  findingList,
  pluralize,
  ruleTable,
  toolErrorList,
} from './markdown.mts';
import { scopeLine } from '../../../scope/scope-findings.mjs';
import { partialRunLines } from '../partial-run/partial-run.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';

export type SnapshotSummaryReport = {
  readonly summary: unknown;
  readonly findings: readonly ReportEntry[];
  readonly toolErrors: readonly ReportEntry[];
};

const scopeLinesOf: (summary: unknown) => readonly string[] = scopeLine;
const partialLinesOf: (summary: unknown) => readonly string[] = partialRunLines;

function headline(enforceable: readonly ReportEntry[], toolErrors: readonly ReportEntry[]): string {
  if (enforceable.length > 0) {
    return `✖ ${pluralize(enforceable.length, 'enforceable finding')} in the checkout`;
  }
  return toolErrors.length > 0
    ? '✖ Incomplete: no enforceable findings, but a tool failed'
    : '✓ No enforceable findings';
}

export function renderSnapshotSummary(report: SnapshotSummaryReport, context: LinkContext): string {
  const enforceable = report.findings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  return [
    `## nitpicker full run${context.projectPrefix === '' ? '' : ` ${code(context.projectPrefix)}`}`,
    '',
    `**${headline(enforceable, report.toolErrors)}**`,
    '',
    ...scopeLinesOf(report.summary).flatMap((line) => [line, '']),
    ...partialLinesOf(report.summary).flatMap((line) => [`> ${line}`, '']),
    `${pluralize(report.findings.length, 'finding')} in all, ` +
      `${String(report.findings.length - enforceable.length)} descriptive.`,
    '',
    ...(report.findings.length === 0
      ? []
      : ['### Findings by tool and rule', '', ...ruleTable(report.findings)]),
    ...findingList(enforceable, context, 'Enforceable findings'),
    ...toolErrorList(report.toolErrors),
    ...exceptionRoute({
      hasFindings: enforceable.length > 0,
      example: exceptionExample(enforceable),
    }),
  ].join('\n');
}
