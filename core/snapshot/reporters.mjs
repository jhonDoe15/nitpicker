import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { quickLines, stagedLines } from '../quick/summary.mjs';
import { junitRunProfile } from '../quick/report-formats.mjs';

const REPORT_FILE_NAMES = [
  'summary.json',
  'findings.json',
  'tool-errors.json',
  'report.txt',
  'report.junit.xml',
];

export function clearSnapshotReports(outputRoot) {
  for (const reportFileName of REPORT_FILE_NAMES) {
    rmSync(path.join(outputRoot, reportFileName), { force: true });
  }
}

export function writeSnapshotReports(outputRoot, report) {
  mkdirSync(outputRoot, { recursive: true });
  writeJson(path.join(outputRoot, 'summary.json'), report.summary);
  writeJson(path.join(outputRoot, 'findings.json'), report.findings);
  writeJson(path.join(outputRoot, 'tool-errors.json'), report.toolErrors);

  const text = renderTextReport(report);
  writeFileSync(path.join(outputRoot, 'report.txt'), text);
  writeFileSync(path.join(outputRoot, 'report.junit.xml'), renderJunitReport(report));
  return text;
}

function renderTextReport(report) {
  const enforceable = report.findings.filter((finding) => finding.classification === 'enforceable');
  const descriptive = report.findings.filter((finding) => finding.classification === 'descriptive');
  const lines = [
    'Nitpicker quality snapshot',
    ...stagedLines(report.summary),
    `Status: ${report.summary.overallStatus}`,
    `Enforceable findings: ${String(enforceable.length)}`,
    `Descriptive findings: ${String(descriptive.length)}`,
    `Tool errors: ${String(report.toolErrors.length)}`,
    ...quickLines(report.summary),
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
  const profile = junitRunProfile(report.summary, 'quality.snapshot', escapeXml);
  testCases.push(...profile.skippedCases);
  if (testCases.length === 0) {
    testCases.push(
      '  <testcase classname="quality.snapshot" name="framework" time="0"></testcase>',
    );
  }
  const tests = testCases.length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.snapshot" tests="${String(tests)}" failures="${String(failures)}" errors="0"${profile.skippedAttribute} time="${(report.summary.elapsedMs / 1000).toFixed(3)}">`,
    ...profile.propertyLines,
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
