import { singleLine } from './format/text.mjs';
import { junitRunProfile } from '../../quick/report-formats.mjs';

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
    const type = escapeXml(`${finding.tool}/${finding.rule}`);
    const message = escapeXml(singleLine(finding.message));
    testCases.push(
      `  <testcase classname="quality.diff.new-findings" name="${escapeXml(name)}" time="0"><failure message="${message}" type="${type}">${escapeXml(finding.message)}</failure></testcase>`,
    );
  }
  for (const error of report.toolErrors) {
    testCases.push(
      `  <testcase classname="quality.diff" name="${escapeXml(`${error.tool}:${error.snapshot}`)}" time="0"><failure message="${escapeXml(error.message)}">${escapeXml(error.message)}</failure></testcase>`,
    );
  }
  const profile = junitRunProfile(report.summary, 'quality.diff', escapeXml);
  testCases.push(...profile.skippedCases);
  if (testCases.length === 0) {
    testCases.push('  <testcase classname="quality.diff" name="framework" time="0"></testcase>');
  }
  const failures = violations.length + report.toolErrors.length;
  const tests = testCases.length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.diff" tests="${String(tests)}" failures="${String(failures)}" errors="0"${profile.skippedAttribute} time="${(report.summary.elapsedMs / 1000).toFixed(3)}">`,
    ...profile.propertyLines,
    ...testCases,
    '</testsuite>',
    '',
  ].join('\n');
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
