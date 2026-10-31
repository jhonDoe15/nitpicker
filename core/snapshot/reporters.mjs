import { renderSnapshotSarifReport } from '../diff/reporting/sarif.mjs';
import { clearReports, json, writeReports } from '../diff/reporting/reporters.mjs';
import { partialRunLines } from '../diff/reporting/partial-run/partial-run.mjs';
import {
  CODE_QUALITY_REPORT_FILE_NAME,
  renderCodeQualityReport,
} from '../diff/reporting/format/codequality.mjs';

const SNAPSHOT_REPORTS = [
  { name: 'summary.json', render: (report) => json(report.summary) },
  { name: 'findings.json', render: (report) => json(report.findings) },
  { name: 'tool-errors.json', render: (report) => json(report.toolErrors) },
  { name: 'report.txt', render: (report) => renderTextReport(report) },
  { name: 'report.junit.xml', render: (report) => renderJunitReport(report) },
  { name: 'report.sarif', render: renderSnapshotSarifReport },
  {
    name: CODE_QUALITY_REPORT_FILE_NAME,
    render: (report, options) => renderCodeQualityReport(report.findings, options),
  },
];

export const SNAPSHOT_REPORT_FILE_NAMES = SNAPSHOT_REPORTS.map(({ name }) => name);

export function clearSnapshotReports(outputRoot) {
  clearReports(outputRoot, SNAPSHOT_REPORT_FILE_NAMES);
}

export function writeSnapshotReports(outputRoot, report, { projectPath, repositoryRoot } = {}) {
  return writeReports(outputRoot, SNAPSHOT_REPORTS, {
    report,
    options: { projectPath, repositoryRoot },
  }).get('report.txt');
}

function renderTextReport(report) {
  const enforceable = report.findings.filter((finding) => finding.classification === 'enforceable');
  const descriptive = report.findings.filter((finding) => finding.classification === 'descriptive');
  const lines = [
    'Nitpicker quality snapshot',
    `Status: ${report.summary.overallStatus}`,
    `Enforceable findings: ${String(enforceable.length)}`,
    `Descriptive findings: ${String(descriptive.length)}`,
    `Tool errors: ${String(report.toolErrors.length)}`,
    ...partialRunLines(report.summary),
  ];

  if (report.summary.tools.length === 0) {
    lines.push('Analyzers: none configured');
  } else {
    lines.push('', 'Per-tool counts:');
    for (const tool of report.summary.tools) {
      lines.push(
        `${tool.name}: total=${String(tool.total)} enforceable=${String(tool.enforceable)} descriptive=${String(tool.descriptive)}`,
      );
    }
  }

  appendFindingSection(lines, 'Enforceable findings', enforceable);
  appendFindingSection(lines, 'Descriptive findings', descriptive);
  appendToolErrorSection(lines, report.toolErrors);
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
  appendFindingSection(lines, '  Matching', report.findings.filter(matches));
  return `${lines.join('\n')}\n`;
}

function renderJunitReport(report) {
  const failures =
    report.summary.tools.filter((tool) => tool.enforceable > 0).length + report.toolErrors.length;
  const testCases = report.summary.tools.map((tool) =>
    tool.enforceable > 0
      ? `  <testcase classname="quality.snapshot" name="${escapeXml(tool.name)}" time="0"><failure message="${String(tool.enforceable)} enforceable findings"></failure></testcase>`
      : `  <testcase classname="quality.snapshot" name="${escapeXml(tool.name)}" time="0"></testcase>`,
  );
  for (const error of report.toolErrors) {
    testCases.push(
      `  <testcase classname="quality.snapshot" name="${escapeXml(`${error.tool}:${error.snapshot}`)}" time="0"><failure message="${escapeXml(error.message)}">${escapeXml(error.message)}</failure></testcase>`,
    );
  }
  if (testCases.length === 0) {
    testCases.push(
      '  <testcase classname="quality.snapshot" name="framework" time="0"></testcase>',
    );
  }
  const tests = testCases.length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.snapshot" tests="${String(tests)}" failures="${String(failures)}" errors="0" time="${(report.summary.elapsedMs / 1000).toFixed(3)}">`,
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

function appendToolErrorSection(lines, toolErrors) {
  if (toolErrors.length === 0) {
    return;
  }
  lines.push('', 'Tool errors:');
  for (const error of toolErrors) {
    lines.push(`${error.tool} (${error.snapshot}): ${error.message}`);
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
