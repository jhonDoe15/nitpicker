import { noteSectionLines } from './format/notes.mjs';
import { singleLine } from './format/text.mjs';
import { junitRunProfile } from '../../quick/report-formats.mjs';

function findingCase(finding) {
  const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
  const name = `${finding.tool}/${finding.rule} ${finding.path}${location}`;
  const type = escapeXml(`${finding.tool}/${finding.rule}`);
  const message = escapeXml(singleLine(finding.message));
  return `  <testcase classname="quality.diff.new-findings" name="${escapeXml(name)}" time="0"><failure message="${message}" type="${type}">${escapeXml(finding.message)}</failure></testcase>`;
}

function errorCase(error) {
  return `  <testcase classname="quality.diff" name="${escapeXml(`${error.tool}:${error.snapshot}`)}" time="0"><failure message="${escapeXml(error.message)}">${escapeXml(error.message)}</failure></testcase>`;
}

function testCasesOf(report, violations, profile) {
  const testCases = [
    ...report.summary.tools.map(
      (tool) =>
        `  <testcase classname="quality.diff" name="${escapeXml(tool.name)}" time="${((tool.elapsedMs ?? 0) / 1000).toFixed(3)}"></testcase>`,
    ),
    ...violations.map(findingCase),
    ...report.toolErrors.map(errorCase),
    ...profile.skippedCases,
  ];
  return testCases.length === 0
    ? ['  <testcase classname="quality.diff" name="framework" time="0"></testcase>']
    : testCases;
}

export function renderJunitReport(report) {
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const profile = junitRunProfile(report.summary, 'quality.diff', escapeXml);
  const testCases = testCasesOf(report, violations, profile);
  const failures = violations.length + report.toolErrors.length;
  const counts = `tests="${String(testCases.length)}" failures="${String(failures)}" errors="0"${profile.skippedAttribute}`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.diff" ${counts} time="${(report.summary.elapsedMs / 1000).toFixed(3)}">`,
    ...profile.propertyLines,
    ...testCases,
    ...noteElement(report.notes),
    '</testsuite>',
    '',
  ].join('\n');
}

function noteElement(notes) {
  return notes === undefined || notes.length === 0
    ? []
    : [`  <system-out>${escapeXml(noteSectionLines(notes).slice(1).join('\n'))}</system-out>`];
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
