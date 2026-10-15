import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../shared/rules/finding-helpers.mjs';
import { appendNoteSection, appendNoteSummary } from './render/notes.mjs';
import { renderJunitReport, renderSarifReport } from './render/machine-reports.mjs';
import { ANSI, pluralize, singleLine, style } from './render/text-format.mjs';

export { renderJunitReport, renderSarifReport };

const TEXT_REPORT_FILE_NAME = 'report.txt';
const JUNIT_REPORT_FILE_NAME = 'report.junit.xml';
const SARIF_REPORT_FILE_NAME = 'report.sarif';

export const REPORT_FILE_NAMES = [
  'summary.json',
  'new-findings.json',
  'resolved-findings.json',
  'changed-metrics.json',
  'held-findings.json',
  'tool-errors.json',
  'notes.json',
  TEXT_REPORT_FILE_NAME,
  JUNIT_REPORT_FILE_NAME,
  SARIF_REPORT_FILE_NAME,
];

export function clearDiffReports(outputRoot) {
  for (const reportFileName of REPORT_FILE_NAMES) {
    rmSync(path.join(outputRoot, reportFileName), { force: true });
  }
}

export function writeDiffReports(outputRoot, report) {
  mkdirSync(outputRoot, { recursive: true });
  writeJson(path.join(outputRoot, 'summary.json'), report.summary);
  writeJson(path.join(outputRoot, 'new-findings.json'), report.newFindings);
  writeJson(path.join(outputRoot, 'resolved-findings.json'), report.resolvedFindings);
  writeJson(path.join(outputRoot, 'changed-metrics.json'), report.changedMetrics);
  writeJson(
    path.join(outputRoot, 'held-findings.json'),
    report.unchangedFindings.filter((finding) => finding.heldAtBase !== undefined),
  );
  writeJson(path.join(outputRoot, 'tool-errors.json'), report.toolErrors);
  writeJson(path.join(outputRoot, 'notes.json'), report.notes ?? []);

  const text = renderTextReport(report);
  writeFileSync(path.join(outputRoot, TEXT_REPORT_FILE_NAME), text);
  writeFileSync(path.join(outputRoot, JUNIT_REPORT_FILE_NAME), renderJunitReport(report));
  writeFileSync(path.join(outputRoot, SARIF_REPORT_FILE_NAME), renderSarifReport(report));
  return text;
}

export function absoluteTextReportPath(outputRoot) {
  return path.resolve(outputRoot, TEXT_REPORT_FILE_NAME);
}

function toolCountLine(tool) {
  const counts = [
    ['base', tool.base],
    ['head', tool.head],
    ['new', tool.new],
    ['resolved', tool.resolved],
    ['unchanged', tool.unchanged],
    ['changed-metrics', tool.changedMetrics],
  ].map(([name, count]) => `${name}=${String(count)}`);
  const skipped =
    tool.skippedBecause === undefined ? '' : ` skipped (${tool.skippedBecause} failed)`;
  return `${tool.name}: ${counts.join(' ')} elapsed=${formatSeconds(tool.elapsedMs ?? 0)}${skipped}`;
}

function appendToolCounts(lines, tools) {
  if (tools.length === 0) {
    lines.push('Analyzers: none configured');
    return;
  }
  lines.push('', 'Per-tool counts:', ...tools.map((tool) => toolCountLine(tool)));
}

export function renderTextReport(report) {
  const lines = [
    'Nitpicker quality diff',
    `Base ref: ${report.summary.requestedBaseRef}`,
    `Merge base: ${report.summary.mergeBaseSha}`,
    `Head: ${report.summary.headSha}`,
    `Status: ${report.summary.overallStatus}`,
    `New enforceable findings: ${String(report.summary.newEnforceableFindings)}`,
    `New findings: ${String(report.newFindings.length)}`,
    `Resolved findings: ${String(report.resolvedFindings.length)}`,
    `Unchanged findings: ${String(sumToolCount(report.summary.tools, 'unchanged'))}`,
    `Changed metrics: ${String(report.changedMetrics.length)}`,
    `Tool errors: ${String(report.toolErrors.length)}`,
  ];

  const configOverrides = report.summary.configOverrides ?? [];
  if (configOverrides.length > 0) {
    lines.push('', 'Config overrides:', ...configOverrides.map((override) => `  ${override}`));
  }

  appendToolCounts(lines, report.summary.tools);

  appendFindingSection(lines, 'New findings', report.newFindings);
  appendHeldSection(lines, report.unchangedFindings);
  appendFindingSection(lines, 'Resolved findings', report.resolvedFindings);
  appendMetricSection(lines, report.changedMetrics);
  appendToolErrorSection(lines, report.toolErrors);
  appendNoteSection(lines, report.notes);
  return `${lines.join('\n')}\n`;
}

export function renderConsoleSummary(
  report,
  { color = true, diagnosticsPath = 'reports/quality/diff/combined/report.txt' } = {},
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

  appendViolationSummary(lines, { violations, incomplete: report.toolErrors.length > 0 }, color);
  appendHeldSummary(lines, report.unchangedFindings, color);
  appendNoteSummary(lines, report.notes, color);
  appendToolErrorSummary(lines, report.toolErrors, color);
  lines.push(style(`Full diagnostics: ${diagnosticsPath}`, [ANSI.dim], color));
  return `${lines.join('\n')}\n`;
}

export function renderRuleFilterSection(report, ruleFilters) {
  if (ruleFilters.length === 0) {
    return '';
  }
  function matches(finding) {
    return ruleFilters.some((filter) => `${finding.tool}/${finding.rule}`.includes(filter));
  }
  const lines = ['', `Findings matching --rule ${ruleFilters.join(', ')}:`];
  appendFindingSection(lines, '  New', report.newFindings.filter(matches));
  appendFindingSection(lines, '  Unchanged', report.unchangedFindings.filter(matches));
  appendFindingSection(lines, '  Resolved', report.resolvedFindings.filter(matches));
  return `${lines.join('\n')}\n`;
}

function appendFindingSection(lines, heading, findings) {
  if (findings.length === 0) {
    return;
  }
  lines.push('', `${heading}:`);
  for (const finding of findings) {
    const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
    lines.push(`${finding.tool}/${finding.rule} ${finding.path}${location} ${finding.message}`);
  }
}

function heldFindings(unchangedFindings = []) {
  const held = unchangedFindings.filter((finding) => finding.heldAtBase !== undefined);
  return {
    metrics: held.filter((finding) => finding.ratchet?.worseMessage !== undefined),
    lint: held.filter((finding) => finding.ratchet?.worseMessage === undefined),
  };
}

function heldLine(finding) {
  const { ratchet, heldAtBase } = finding;
  const base = String(heldAtBase);
  const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
  const prefix = `${finding.tool}/${finding.rule} ${finding.path}${location}`;
  if (ratchet?.worseMessage === undefined) {
    const counts =
      ratchet.value === heldAtBase
        ? `${base} at base and now`
        : `${base} at base, ${String(ratchet.value)} now`;
    return `${prefix} ${singleLine(finding.message)} (${counts}; any increase fails)`;
  }
  const note =
    ratchet.heldMessage === undefined
      ? `${singleLine(finding.message)} (allowed because base was ${base}; any increase fails)`
      : ratchet.heldMessage.replaceAll('{base}', base);
  return `${prefix} ${note}`;
}

function appendHeldSection(lines, unchangedFindings) {
  const { metrics, lint } = heldFindings(unchangedFindings);
  if (metrics.length > 0) {
    lines.push('', 'Touched, still over limit (not failing):', ...metrics.map(heldLine));
  }
  if (lint.length > 0) {
    lines.push('', 'Existing lint findings in edited code (not failing):', ...lint.map(heldLine));
  }
}

function appendHeldSummary(lines, unchangedFindings, color) {
  const { metrics, lint } = heldFindings(unchangedFindings);
  if (metrics.length > 0) {
    lines.push(
      style(
        `Note: ${String(metrics.length)} ${pluralize('finding', metrics.length)} still over a limit in touched code (not failing, not worse than before):`,
        [ANSI.dim],
        color,
      ),
      ...metrics.map((finding) => `  ${heldLine(finding)}`),
    );
  }
  if (lint.length > 0) {
    lines.push(
      style(
        `Note: ${String(lint.length)} existing lint ${pluralize('finding', lint.length)} in edited code (not failing, no more than before):`,
        [ANSI.dim],
        color,
      ),
      ...lint.map((finding) => `  ${heldLine(finding)}`),
    );
  }
}

function appendViolationSummary(lines, { violations, incomplete }, color) {
  if (violations.length === 0 && incomplete) {
    lines.push('No new enforceable violations, but the run is incomplete:');
    return;
  }
  if (violations.length === 0) {
    lines.push(style('✓ No new enforceable violations', [ANSI.green], color));
    return;
  }
  lines.push(
    style(
      `✖ ${String(violations.length)} new enforceable ${pluralize('violation', violations.length)}`,
      [ANSI.bold, ANSI.red],
      color,
    ),
  );
  for (const group of groupRepeatedFindings(violations)) {
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
  return [...groups.values()].map((group) =>
    group.toSorted((left, right) => (left.location?.line ?? 0) - (right.location?.line ?? 0)),
  );
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

function withoutSkipNotices(toolErrors) {
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

function appendMetricSection(lines, metrics) {
  if (metrics.length === 0) {
    return;
  }
  lines.push('', 'Changed metrics:');
  for (const metric of metrics) {
    lines.push(
      `${metric.tool}/${metric.rule} ${metric.path} ${metric.metric}: ${String(metric.baseValue)} -> ${String(metric.headValue)} (${formatDelta(metric.delta)})`,
    );
  }
}

function appendToolErrorSection(lines, toolErrors) {
  if (toolErrors.length === 0) {
    return;
  }
  lines.push('', 'Tool errors:');
  for (const error of toolErrors) {
    lines.push(`${error.tool} (${error.snapshot}): ${error.message}`);
  }
}

function formatDelta(delta) {
  return delta > 0 ? `+${String(delta)}` : String(delta);
}

function formatSeconds(elapsedMs) {
  return `${(elapsedMs / 1000).toFixed(3)}s`;
}

function sumToolCount(tools, property) {
  return tools.reduce((total, tool) => total + tool[property], 0);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
