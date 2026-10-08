import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TEXT_REPORT_FILE_NAME = 'report.txt';

export const REPORT_FILE_NAMES = [
  'summary.json',
  'new-findings.json',
  'resolved-findings.json',
  'changed-metrics.json',
  'tool-errors.json',
  TEXT_REPORT_FILE_NAME,
  'report.junit.xml',
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
  writeJson(path.join(outputRoot, 'tool-errors.json'), report.toolErrors);

  const text = renderTextReport(report);
  writeFileSync(path.join(outputRoot, TEXT_REPORT_FILE_NAME), text);
  writeFileSync(path.join(outputRoot, 'report.junit.xml'), renderJunitReport(report));
  return text;
}

export function relativeTextReportPath(projectRoot, outputRoot) {
  return path.relative(projectRoot, path.join(outputRoot, TEXT_REPORT_FILE_NAME));
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

  if (report.summary.tools.length === 0) {
    lines.push('Analyzers: none configured');
  } else {
    lines.push('', 'Per-tool counts:');
    for (const tool of report.summary.tools) {
      lines.push(
        `${tool.name}: base=${String(tool.base)} head=${String(tool.head)} new=${String(tool.new)} resolved=${String(tool.resolved)} unchanged=${String(tool.unchanged)} changed-metrics=${String(tool.changedMetrics)} elapsed=${formatSeconds(tool.elapsedMs ?? 0)}`,
      );
    }
  }

  appendFindingSection(lines, 'New findings', report.newFindings);
  appendFindingSection(lines, 'Resolved findings', report.resolvedFindings);
  appendMetricSection(lines, report.changedMetrics);
  appendToolErrorSection(lines, report.toolErrors);
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

  appendViolationSummary(lines, violations, color);
  appendToolErrorSummary(lines, report.toolErrors, color);
  lines.push(style(`Full diagnostics: ${diagnosticsPath}`, [ANSI.dim], color));
  return `${lines.join('\n')}\n`;
}

/** Drill-down view: findings whose `tool/rule` contains any of the given substrings. */
export function renderRuleFilterSection(report, ruleFilters) {
  if (ruleFilters.length === 0) {
    return '';
  }
  const matches = (finding) =>
    ruleFilters.some((filter) => `${finding.tool}/${finding.rule}`.includes(filter));
  const lines = ['', `Findings matching --rule ${ruleFilters.join(', ')}:`];
  appendFindingSection(lines, '  New', report.newFindings.filter(matches));
  appendFindingSection(lines, '  Unchanged', report.unchangedFindings.filter(matches));
  appendFindingSection(lines, '  Resolved', report.resolvedFindings.filter(matches));
  return `${lines.join('\n')}\n`;
}

export function renderJunitReport(report) {
  const failures = report.toolErrors.length;
  const testCases = report.summary.tools.map(
    (tool) =>
      `  <testcase classname="quality.diff" name="${escapeXml(tool.name)}" time="${((tool.elapsedMs ?? 0) / 1000).toFixed(3)}"></testcase>`,
  );
  for (const error of report.toolErrors) {
    testCases.push(
      `  <testcase classname="quality.diff" name="${escapeXml(`${error.tool}:${error.snapshot}`)}" time="0"><failure message="${escapeXml(error.message)}">${escapeXml(error.message)}</failure></testcase>`,
    );
  }
  if (testCases.length === 0) {
    testCases.push('  <testcase classname="quality.diff" name="framework" time="0"></testcase>');
  }
  const tests = testCases.length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.diff" tests="${String(tests)}" failures="${String(failures)}" errors="0" time="${(report.summary.elapsedMs / 1000).toFixed(3)}">`,
    ...testCases,
    '</testsuite>',
    '',
  ].join('\n');
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

function appendViolationSummary(lines, violations, color) {
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
  for (const finding of violations) {
    const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
    lines.push(
      `  ${style(`${finding.tool}/${finding.rule}`, [ANSI.yellow], color)} ${finding.path}${location}`,
      `    ${singleLine(finding.message)}`,
    );
  }
}

function appendToolErrorSummary(lines, toolErrors, color) {
  if (toolErrors.length === 0) {
    return;
  }
  lines.push(
    style(
      `✖ ${String(toolErrors.length)} ${pluralize('tool error', toolErrors.length)}`,
      [ANSI.bold, ANSI.red],
      color,
    ),
  );
  for (const error of toolErrors) {
    lines.push(`  ${style(error.tool, [ANSI.yellow], color)}: ${singleLine(error.message)}`);
  }
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

function singleLine(value) {
  return String(value).replaceAll(/\s+/g, ' ').trim();
}

function pluralize(noun, count) {
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

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
