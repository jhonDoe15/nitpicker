import { isPolicyFinding } from './review/policy-findings.mjs';
import { consolePolicySummary } from './review/policy-changes.mjs';
import { heldFindings, heldLine } from './format/held-findings.mjs';
import { foldMutants } from './format/mutants.mjs';
import { noteSummaryLines } from './format/notes.mjs';
import { singleLine } from './format/text.mjs';
import { designNoteLines } from './format/design-notes.mjs';
import { areaCountLine } from './format/rule-groups/finding-areas.mjs';
import { byFixOrder, ruleGroupLines, withoutRoute } from './format/rule-groups/rule-groups.mjs';
import { appendReviewSummary } from './review/notices.mjs';
import { quickLines } from '../../quick/summary.mjs';
import { scopeLine } from '../../scope/scope-findings.mjs';
import { skippedLines, unaffectedLine } from '../skipping/lines.mjs';
import { partialRunLines } from './partial-run/partial-run.mjs';
import { failingHeadTests, failingTestLines } from './failing-tests/failing-tests.mjs';
import { ANSI, pluralize, style } from './console/style.mjs';
import {
  appendToolErrorSummary,
  errorHeadline,
  withoutSkipNotices,
} from './console/tool-errors.mjs';
import { snapshotToolLines } from './console/snapshot-tools.mjs';

const SHORT_SHA_LENGTH = 12;
const FINDING = 'finding';

export function renderSnapshotConsole(report, options = {}) {
  const { findings, summary, toolErrors } = report;
  return renderGateSummary(
    { summary, toolErrors, newFindings: findings, unchangedFindings: [] },
    { ...options, snapshot: true },
  );
}

export function renderConsoleSummary(report, options = {}) {
  if (report.summary?.noChanges !== true && report.summary?.skippedAll !== true) {
    return renderGateSummary(report, options);
  }
  const { requestedBaseRef, mergeBaseSha, skippedAnalyzers } = report.summary;
  const line =
    report.summary.skippedAll !== true
      ? `No changes since ${requestedBaseRef} (${mergeBaseSha.slice(0, SHORT_SHA_LENGTH)}); nothing to check.\n`
      : `${unaffectedLine(report.summary, skippedAnalyzers)}\n`;
  return report.toolErrors.length === 0 ? line : `${line}${renderGateSummary(report, options)}`;
}

function gateHead(report, { color, diagnosticsPath, snapshot }, { violations, failingTests }) {
  const hasFailures = violations.length > 0 || report.toolErrors.length > 0;
  return [
    '',
    style(
      snapshot ? 'Quality snapshot summary' : 'Quality gate summary',
      hasFailures ? [ANSI.bold, ANSI.red] : [ANSI.bold, ANSI.green],
      color,
    ),
    ...scopeLine(report.summary),
    ...failingTestLines(failingTests, {
      headline: (text) => failing(text, color),
      label: (tool) => style(tool, [ANSI.yellow], color),
      diagnosticsPath,
    }),
  ];
}

function gateTail(lines, report, { color, diagnosticsPath, snapshot }) {
  if (snapshot) {
    lines.push(...snapshotToolLines(report.summary.tools));
  }
  for (const line of footerLines(report.summary)) {
    lines.push(style(line, [ANSI.bold, ANSI.yellow], color));
  }
  lines.push(style(`Full diagnostics: ${diagnosticsPath}`, [ANSI.dim], color));
  return `${lines.join('\n')}\n`;
}

function renderGateSummary(
  report,
  {
    color = true,
    details = false,
    diagnosticsPath = 'reports/quality/diff/combined/report.txt',
    projectRoot,
    snapshot = false,
  } = {},
) {
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const { failingTests, otherErrors } = splitToolErrors(report.toolErrors);
  const lines = gateHead(
    report,
    { color, diagnosticsPath, snapshot },
    { violations, failingTests },
  );
  appendViolationSummary(
    lines,
    {
      violations: violations.filter((finding) => !isPolicyFinding(finding)),
      incomplete: otherErrors.length > 0,
      testsFail: failingTests.length > 0,
      policyCount: violations.filter(isPolicyFinding).length,
      snapshot,
    },
    { color, details },
  );
  appendReviewSummary(lines, consolePolicySummary(report), (text) =>
    style(text, [ANSI.bold, ANSI.yellow], color),
  );
  appendHeldSummary(lines, report.unchangedFindings, { color, details, diagnosticsPath });
  lines.push(...designNoteLines(report.newFindings, diagnosticsPath, { snapshot }));
  appendNoteSummary(lines, report.notes, color);
  appendToolErrorSummary(lines, otherErrors, { color, projectRoot });
  return gateTail(lines, report, { color, diagnosticsPath, snapshot });
}

function footerLines(summary) {
  return [...partialRunLines(summary), ...skippedLines(summary), ...quickLines(summary)];
}

function splitToolErrors(toolErrors) {
  const failingTests = failingHeadTests(toolErrors);
  return {
    failingTests,
    otherErrors: withoutSkipNotices(toolErrors).filter((error) => !failingTests.includes(error)),
  };
}

const MAX_HELD_LINES = 10;

function appendHeldSummary(lines, unchangedFindings, { color, details, diagnosticsPath }) {
  const { metrics, lint } = heldFindings(unchangedFindings);
  if (metrics.length > 0) {
    lines.push(
      style(
        `Note: ${String(metrics.length)} ${pluralize(FINDING, metrics.length)} still over a limit in touched code (not failing, not worse than before):`,
        [ANSI.dim],
        color,
      ),
      ...heldList(metrics, { details, diagnosticsPath }),
    );
  }
  if (lint.length > 0) {
    lines.push(
      style(
        `Note: ${String(lint.length)} existing lint ${pluralize(FINDING, lint.length)} in edited code (not failing, no more than before):`,
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

function violationHeadline({ violations, incomplete, testsFail, policyCount, snapshot }, color) {
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
      : style(`✓ No ${fresh}enforceable ${noun}s`, [ANSI.green], color);
  }
  const total = violations.length + policyCount;
  return failing(
    policyCount === 0
      ? `✖ ${String(total)} ${fresh}enforceable ${pluralize(noun, total)}`
      : `✖ ${String(total)} ${fresh}enforceable ${noun}s: ${code} and ${policy}`,
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
    lines.push(
      ...ruleGroupLines(foldMutants(violations), (label) => style(label, [ANSI.yellow], color)),
    );
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

export { errorHeadline, withoutSkipNotices };
export { pluralize };
