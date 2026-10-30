import { isPolicyFinding } from './review/policy-findings.mjs';
import { consolePolicySummary } from './review/policy-changes.mjs';
import { heldFindings, heldLine } from './format/held-findings.mjs';
import { noteSummaryLines } from './format/notes.mjs';
import { singleLine } from './format/text.mjs';
import { areaCountLine } from './format/finding-areas.mjs';
import { byFixOrder, ruleGroupLines, withoutRoute } from './format/rule-groups.mjs';
import { appendReviewSummary } from './review/notices.mjs';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../shared/rules/finding-helpers.mjs';

export function renderConsoleSummary(
  report,
  {
    color = true,
    details = false,
    diagnosticsPath = 'reports/quality/diff/combined/report.txt',
  } = {},
) {
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const hasFailures = violations.length > 0 || report.toolErrors.length > 0;
  const lines = [
    '',
    style(
      'Quality gate summary',
      hasFailures ? [ANSI.bold, ANSI.red] : [ANSI.bold, ANSI.green],
      color,
    ),
  ];

  appendViolationSummary(
    lines,
    {
      violations: violations.filter((finding) => !isPolicyFinding(finding)),
      incomplete: report.toolErrors.length > 0,
      policyCount: violations.filter(isPolicyFinding).length,
    },
    { color, details },
  );
  appendReviewSummary(lines, consolePolicySummary(report), (text) =>
    style(text, [ANSI.bold, ANSI.yellow], color),
  );
  appendHeldSummary(lines, report.unchangedFindings, { color, details, diagnosticsPath });
  appendNoteSummary(lines, report.notes, color);
  appendToolErrorSummary(lines, report.toolErrors, color);
  lines.push(style(`Full diagnostics: ${diagnosticsPath}`, [ANSI.dim], color));
  return `${lines.join('\n')}\n`;
}

const MAX_HELD_LINES = 10;

function appendHeldSummary(lines, unchangedFindings, { color, details, diagnosticsPath }) {
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

function heldList(findings, { details, diagnosticsPath }) {
  const shown = details ? findings : findings.slice(0, MAX_HELD_LINES);
  const rest = findings.length - shown.length;
  return [
    ...shown.map((finding) => `  ${heldLine(details ? finding : withoutRoute(finding))}`),
    ...(rest === 0 ? [] : [`  … ${String(rest)} more; see ${diagnosticsPath}`]),
  ];
}

function appendNoteSummary(lines, notes, color) {
  for (const line of noteSummaryLines(notes)) {
    lines.push(style(line, [ANSI.dim], color));
  }
}

function violationHeadline({ violations, incomplete, policyCount }, color) {
  const policy = `${String(policyCount)} unapproved policy ${pluralize('change', policyCount)}`;
  const code = `${String(violations.length)} code ${pluralize('violation', violations.length)}`;
  if (violations.length === 0 && policyCount > 0) {
    const verb = policyCount === 1 ? 'fails' : 'fail';
    const tail = incomplete ? ' and the run is incomplete:' : '';
    return failing(`✖ No new code violations, but ${policy} ${verb} the gate${tail}`, color);
  }
  if (violations.length === 0) {
    return incomplete
      ? 'No new enforceable violations, but the run is incomplete:'
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

function failing(text, color) {
  return style(text, [ANSI.bold, ANSI.red], color);
}

function appendViolationSummary(lines, summary, { color, details }) {
  const { violations } = summary;
  lines.push(violationHeadline(summary, color));
  const counts = areaCountLine(violations);
  if (counts !== undefined) {
    lines.push(`  by area: ${counts}`);
  }
  if (!details) {
    lines.push(...ruleGroupLines(violations, (label) => style(label, [ANSI.yellow], color)));
    return;
  }
  for (const group of groupRepeatedFindings(violations.toSorted(byFixOrder))) {
    const [finding] = group;
    lines.push(
      `  ${style(`${finding.tool}/${finding.rule}`, [ANSI.yellow], color)} ${finding.path}${describeLocations(group)}`,
      `    ${singleLine(finding.message)}`,
    );
  }
}

function groupRepeatedFindings(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = [finding.tool, finding.rule, finding.path, finding.message].join('\0');
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return [...groups.values()];
}

function describeLocations(group) {
  const lineNumbers = group.flatMap(({ location }) =>
    location === undefined ? [] : [location.line],
  );
  if (group.length === 1) {
    return lineNumbers.length === 0 ? '' : `:${String(lineNumbers[0])}`;
  }
  const lineList = lineNumbers.length === group.length ? `, lines ${lineNumbers.join(', ')}` : '';
  return ` (${String(group.length)} times${lineList})`;
}

function appendToolErrorSummary(lines, toolErrors, color) {
  const shown = withoutSkipNotices(toolErrors);
  if (shown.length === 0) {
    return;
  }
  lines.push(
    style(
      `✖ ${String(shown.length)} ${pluralize('tool error', shown.length)}`,
      [ANSI.bold, ANSI.red],
      color,
    ),
  );
  for (const error of shown) {
    const label = error.snapshot === undefined ? error.tool : `${error.tool} (${error.snapshot})`;
    if (error.rule === undefined) {
      lines.push(`  ${style(label, [ANSI.yellow], color)}: ${errorHeadline(error.message)}`);
      continue;
    }
    const [first, ...rest] = String(error.message).split('\n');
    lines.push(
      `  ${style(label, [ANSI.yellow], color)}: ${first}`,
      ...rest.map((line) => `  ${line}`),
    );
  }
}

export function withoutSkipNotices(toolErrors) {
  const listedSnapshots = new Set(
    toolErrors.filter(({ rule }) => rule === TESTS_FAILED_RULE).map(({ snapshot }) => snapshot),
  );
  return toolErrors.filter(
    ({ rule, snapshot }) => rule !== TESTS_FAILED_SKIPPED_RULE || !listedSnapshots.has(snapshot),
  );
}

const ERROR_HEADLINE_LIMIT = 300;

const ERROR_LINE_PATTERN = /error TS\d+|Error:|ERR_|Cannot find|not found|ENOENT/u;

function errorHeadline(message) {
  const text = singleLine(message);
  const start = Math.max(text.search(ERROR_LINE_PATTERN), 0);
  const headline = text.slice(start, start + ERROR_HEADLINE_LIMIT);
  return headline.length < text.length - start
    ? `${headline}… (full text in the diagnostics file)`
    : headline;
}

export function pluralize(noun, count) {
  return count === 1 ? noun : `${noun}s`;
}

function style(value, codes, color) {
  return color ? `${codes.join('')}${value}${ANSI.reset}` : value;
}

const ANSI = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
};
