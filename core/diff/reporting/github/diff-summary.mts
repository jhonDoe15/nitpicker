import {
  type LinkContext,
  LISTED_NOTES,
  cappedList,
  code,
  exceptionExample,
  exceptionRoute,
  findingList,
  inlineText,
  pluralize,
  ruleTable,
  toolErrorList,
} from './markdown.mts';
import { scopeLine } from '../../../scope/scope-findings.mjs';
import { partialRunLines as partialLinesOf } from '../partial-run/partial-run.mts';
import { failingHeadTests as failingTests } from '../failing-tests/failing-tests.mts';
import type { ReportData } from '../../../../shared/values/findings.mts';
import { listOf } from '../../../../shared/values/readers.mts';

type Summary = ReportData['summary'];

const scopeLinesOf: (summary: unknown) => readonly string[] = scopeLine;

function failingTestsHeadline(report: ReportData): string | undefined {
  const [firstFailing, ...otherFailing] = failingTests(report.toolErrors);
  if (firstFailing === undefined) {
    return undefined;
  }
  const [first = ''] = String(firstFailing.message).split('\n');
  return otherFailing.length === 0
    ? first.replace(/:$/u, '')
    : 'Tests fail in more than one test run';
}

function headline(report: ReportData): string {
  if (report.summary['noChanges'] === true && report.toolErrors.length === 0) {
    return '✓ No changes since the merge base; nothing to check';
  }
  const enforceable = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const tests = failingTestsHeadline(report);
  if (enforceable.length > 0) {
    const findings = pluralize(enforceable.length, 'new enforceable finding');
    return tests === undefined ? `✖ ${findings}` : `✖ ${findings}, and tests fail`;
  }
  if (tests !== undefined) {
    return `✖ ${tests}`;
  }
  return report.toolErrors.length > 0
    ? '✖ Incomplete: no new enforceable findings, but a tool failed'
    : '✓ No new enforceable findings';
}

const SHORT_SHA_LENGTH = 12;

function shortSha(sha: unknown): string {
  return String(sha).slice(0, SHORT_SHA_LENGTH);
}

function comparisonLine(report: ReportData): string[] {
  const { summary } = report;
  const base = `Base ${code(summary['requestedBaseRef'])} (merge base ${code(shortSha(summary['mergeBaseSha']))})`;
  const metrics = pluralize(report.changedMetrics.length, 'changed metric');
  const counts = [
    pluralize(report.newFindings.length, 'new finding'),
    `${String(report.resolvedFindings.length)} resolved`,
    metrics,
  ];
  return [`${base}, head ${code(shortSha(summary['headSha']))}.`, `${counts.join(', ')}.`];
}

function policySection(summary: Summary): string[] {
  const changes = listOf(summary['policyChanges']);
  if (changes.length === 0) {
    return [];
  }
  const accepted = summary['policyChangeAccepted'] === true;
  return [
    `### Policy changed in this change${accepted ? ' (loosening accepted)' : ''}`,
    '',
    ...cappedList(changes, inlineText, LISTED_NOTES),
  ];
}

function noticeSection(summary: Summary): string[] {
  const notices = listOf(summary['notices']);
  if (notices.length === 0) {
    return [];
  }
  return ['### Notices (not failing)', '', ...cappedList(notices, inlineText, LISTED_NOTES)];
}

function heldLine(report: ReportData): string[] {
  const held = report.unchangedFindings.filter((finding) => finding['heldAtBase'] !== undefined);
  if (held.length === 0) {
    return [];
  }
  const verb = held.length === 1 ? 'is' : 'are';
  return [
    `${pluralize(held.length, 'finding')} in touched code ${verb} still over a limit or lint rule`,
    'but no worse than at the base (not failing; listed in `report.txt`).',
    '',
  ];
}

function pendingLoosening(summary: Summary): unknown {
  const loosened = listOf(summary['policyLoosenings']).length > 0;
  return loosened && summary['policyChangeAccepted'] !== true ? summary['policyDigest'] : undefined;
}

export function renderDiffSummary(report: ReportData, context: LinkContext): string {
  const enforceable = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  return [
    `## nitpicker${context.projectPrefix === '' ? '' : ` ${code(context.projectPrefix)}`}`,
    '',
    `**${headline(report)}**`,
    '',
    ...scopeLinesOf(report.summary).flatMap((line) => [line, '']),
    ...partialLinesOf(report.summary).flatMap((line) => [`> ${line}`, '']),
    ...comparisonLine(report),
    '',
    ...policySection(report.summary),
    ...(report.newFindings.length === 0
      ? []
      : ['### New findings by tool and rule', '', ...ruleTable(report.newFindings)]),
    ...findingList(enforceable, context, `New enforceable findings`),
    ...toolErrorList(report.toolErrors),
    ...noticeSection(report.summary),
    ...heldLine(report),
    ...exceptionRoute({
      hasFindings: enforceable.length > 0,
      example: exceptionExample(enforceable),
      loosening: pendingLoosening(report.summary),
    }),
  ].join('\n');
}
