import { noteSectionLines as noteLines } from './format/notes.mts';
import { singleLine } from './format/text.mjs';
import { junitRunProfile } from '../../quick/report-formats.mjs';
import type { ReportData, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';

type JunitProfile = {
  readonly skippedCases: readonly string[];
  readonly skippedAttribute: string;
  readonly propertyLines: readonly string[];
};

const oneLine: (value: unknown) => string = singleLine;
const profileOf: (
  summary: unknown,
  classname: string,
  escape: (value: unknown) => string,
) => JunitProfile = junitRunProfile;

function findingCase(finding: ReportEntry): string {
  const location =
    finding['location'] === undefined ? '' : `:${String(fieldOf(finding['location'], 'line'))}`;
  const name = `${textOf(finding.tool)}/${textOf(finding.rule)} ${textOf(finding.path)}${location}`;
  const type = escapeXml(`${textOf(finding.tool)}/${textOf(finding.rule)}`);
  const message = escapeXml(oneLine(finding.message));
  return `  <testcase classname="quality.diff.new-findings" name="${escapeXml(name)}" time="0"><failure message="${message}" type="${type}">${escapeXml(finding.message)}</failure></testcase>`;
}

function errorCase(error: ReportEntry): string {
  return `  <testcase classname="quality.diff" name="${escapeXml(`${textOf(error.tool)}:${textOf(error.snapshot)}`)}" time="0"><failure message="${escapeXml(error.message)}">${escapeXml(error.message)}</failure></testcase>`;
}

function toolCase(tool: unknown): string {
  const seconds = (Number(fieldOf(tool, 'elapsedMs') ?? 0) / 1000).toFixed(3);
  return `  <testcase classname="quality.diff" name="${escapeXml(fieldOf(tool, 'name'))}" time="${seconds}"></testcase>`;
}

function testCasesOf(
  report: ReportData,
  violations: readonly ReportEntry[],
  profile: JunitProfile,
): readonly string[] {
  const testCases = [
    ...listOf(report.summary['tools']).map(toolCase),
    ...violations.map(findingCase),
    ...report.toolErrors.map(errorCase),
    ...profile.skippedCases,
  ];
  return testCases.length === 0
    ? ['  <testcase classname="quality.diff" name="framework" time="0"></testcase>']
    : testCases;
}

export function renderJunitReport(report: ReportData): string {
  const violations = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  const profile = profileOf(report.summary, 'quality.diff', escapeXml);
  const testCases = testCasesOf(report, violations, profile);
  const failures = violations.length + report.toolErrors.length;
  const counts = `tests="${String(testCases.length)}" failures="${String(failures)}" errors="0"${profile.skippedAttribute}`;
  const seconds = (Number(report.summary['elapsedMs']) / 1000).toFixed(3);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality.diff" ${counts} time="${seconds}">`,
    ...profile.propertyLines,
    ...testCases,
    ...noteElement(report.notes),
    '</testsuite>',
    '',
  ].join('\n');
}

function noteElement(notes: readonly ReportEntry[] | undefined): string[] {
  return notes === undefined || notes.length === 0
    ? []
    : [
        `  <system-out>${escapeXml(
          noteLines([...notes])
            .slice(1)
            .join('\n'),
        )}</system-out>`,
      ];
}

function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll(/[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu, '�')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
