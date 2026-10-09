import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { comparisonKey } from './fingerprint.mjs';

const TEXT_REPORT_FILE_NAME = 'report.txt';
const JUNIT_REPORT_FILE_NAME = 'report.junit.xml';
const SARIF_REPORT_FILE_NAME = 'report.sarif';

export const REPORT_FILE_NAMES = [
  'summary.json',
  'new-findings.json',
  'resolved-findings.json',
  'changed-metrics.json',
  'tool-errors.json',
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
  writeJson(path.join(outputRoot, 'tool-errors.json'), report.toolErrors);

  const text = renderTextReport(report);
  writeFileSync(path.join(outputRoot, TEXT_REPORT_FILE_NAME), text);
  writeFileSync(path.join(outputRoot, JUNIT_REPORT_FILE_NAME), renderJunitReport(report));
  writeFileSync(path.join(outputRoot, SARIF_REPORT_FILE_NAME), renderSarifReport(report));
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

  appendViolationSummary(lines, { violations, incomplete: report.toolErrors.length > 0 }, color);
  appendToolErrorSummary(lines, report.toolErrors, color);
  lines.push(style(`Full diagnostics: ${diagnosticsPath}`, [ANSI.dim], color));
  return `${lines.join('\n')}\n`;
}

/** Drill-down view: findings whose `tool/rule` contains any of the given substrings. */
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

export function renderJunitReport(report) {
  const testCases = report.summary.tools.map(
    (tool) =>
      `  <testcase classname="quality.diff" name="${escapeXml(tool.name)}" time="${((tool.elapsedMs ?? 0) / 1000).toFixed(3)}"></testcase>`,
  );
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  for (const finding of violations) {
    const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
    const name = `${finding.tool}/${finding.rule} ${finding.path}${location}`;
    testCases.push(
      `  <testcase classname="quality.diff.new-findings" name="${escapeXml(name)}" time="0"><failure message="${escapeXml(singleLine(finding.message))}" type="${escapeXml(`${finding.tool}/${finding.rule}`)}">${escapeXml(finding.message)}</failure></testcase>`,
    );
  }
  for (const error of report.toolErrors) {
    testCases.push(
      `  <testcase classname="quality.diff" name="${escapeXml(`${error.tool}:${error.snapshot}`)}" time="0"><failure message="${escapeXml(error.message)}">${escapeXml(error.message)}</failure></testcase>`,
    );
  }
  if (testCases.length === 0) {
    testCases.push('  <testcase classname="quality.diff" name="framework" time="0"></testcase>');
  }
  const failures = violations.length + report.toolErrors.length;
  const tests = testCases.length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.diff" tests="${String(tests)}" failures="${String(failures)}" errors="0" time="${(report.summary.elapsedMs / 1000).toFixed(3)}">`,
    ...testCases,
    '</testsuite>',
    '',
  ].join('\n');
}

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_FINGERPRINT_KEY = 'nitpickerIdentity/v1';

/**
 * SARIF 2.1.0 log with one result per new finding (the findings the gate is about). The finding's
 * comparison key, hashed, is `partialFingerprints["nitpickerIdentity/v1"]`, so consumers can match
 * the same finding across runs even when its line moves. Tool errors become unsuccessful
 * tool-execution notifications.
 */
export function renderSarifReport(report) {
  const rules = new Map();
  const results = report.newFindings.map((finding) => {
    const ruleId = `${finding.tool}/${finding.rule}`;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, { id: ruleId, name: finding.rule });
    }
    const physicalLocation = { artifactLocation: { uri: finding.path } };
    if (finding.location !== undefined) {
      physicalLocation.region = {
        startLine: finding.location.line,
        ...(finding.location.column === undefined ? {} : { startColumn: finding.location.column }),
      };
    }
    return {
      ruleId,
      level: finding.classification === 'enforceable' ? 'error' : 'note',
      message: { text: finding.message },
      locations: [{ physicalLocation }],
      partialFingerprints: {
        [SARIF_FINGERPRINT_KEY]: createHash('sha256').update(comparisonKey(finding)).digest('hex'),
      },
    };
  });
  const log = {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'nitpicker',
            informationUri: 'https://github.com/jhonDoe15/nitpicker',
            rules: [...rules.values()],
          },
        },
        invocations: [
          {
            executionSuccessful: report.toolErrors.length === 0,
            toolExecutionNotifications: report.toolErrors.map((error) => ({
              level: 'error',
              message: { text: `${error.tool} (${error.snapshot}): ${error.message}` },
            })),
          },
        ],
        results,
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
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
    const label = error.snapshot === undefined ? error.tool : `${error.tool} (${error.snapshot})`;
    lines.push(`  ${style(label, [ANSI.yellow], color)}: ${errorHeadline(error.message)}`);
  }
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
    .replaceAll(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '�')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
