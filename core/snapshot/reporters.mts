import { scopeLine } from '../scope/scope-findings.mjs';
import { renderSnapshotSarifReport } from '../diff/reporting/sarif.mts';
import {
  type ReferenceLinks,
  type RenderOptions,
  type ReportFile,
  clearLogs,
  clearReports,
  json,
  writeReports,
} from '../diff/reporting/reporters.mts';
import { quickLines, stagedLines } from '../quick/summary.mjs';
import { junitRunProfile } from '../quick/report-formats.mjs';
import { toolErrorHelpLine } from '../../shared/messages/troubleshooting.mjs';
import { designNoteLines } from '../diff/reporting/format/design-notes.mjs';
import { partialRunLines } from '../diff/reporting/partial-run/partial-run.mjs';
import { ruleReferenceLines } from '../diff/reporting/text.mjs';
import { referenceLinks, withHelpUris } from '../../shared/reference/store.mjs';
import {
  CODE_QUALITY_REPORT_FILE_NAME,
  renderCodeQualityReport,
} from '../diff/reporting/format/codequality.mjs';

import { textOf } from '../../shared/values/readers.mts';

type ReportFinding = {
  readonly tool?: unknown;
  readonly rule?: unknown;
  readonly path?: unknown;
  readonly message?: unknown;
  readonly snapshot?: unknown;
  readonly classification?: unknown;
  readonly location?: { readonly line?: unknown } | undefined;
};

type ToolCount = {
  readonly name: unknown;
  readonly total: unknown;
  readonly enforceable: number;
  readonly descriptive: unknown;
};

type SnapshotSummary = {
  readonly overallStatus: unknown;
  readonly tools: readonly ToolCount[];
  readonly elapsedMs: number;
};

export type SnapshotReport = {
  readonly summary: SnapshotSummary;
  readonly findings: readonly ReportFinding[];
  readonly toolErrors: readonly ReportFinding[];
};

type SnapshotFile = ReportFile<SnapshotReport>;

type JunitProfile = {
  readonly skippedCases: readonly string[];
  readonly skippedAttribute: string;
  readonly propertyLines: readonly string[];
};

const linesOf: (summary: unknown) => readonly string[] = stagedLines;
const quickLinesOf: (summary: unknown) => readonly string[] = quickLines;
const scopeLinesOf: (summary: unknown) => readonly string[] = scopeLine;
const partialLinesOf: (summary: unknown) => readonly string[] = partialRunLines;
const referenceLinesOf: (findings: unknown, reference: ReferenceLinks) => readonly string[] =
  ruleReferenceLines;
const designNotesOf: (
  findings: unknown,
  diagnosticsPath: string,
  options: { readonly snapshot: boolean },
) => readonly string[] = designNoteLines;
const helpLineOf: (messages: readonly unknown[]) => string | undefined = toolErrorHelpLine;
const profileOf: (
  summary: unknown,
  suite: string,
  escape: (value: unknown) => string,
) => JunitProfile = junitRunProfile;
const sarifOf: (report: SnapshotReport, options: RenderOptions) => string =
  renderSnapshotSarifReport;
const codeQualityOf: (findings: unknown, options: RenderOptions) => string =
  renderCodeQualityReport;
const helpUrisOf: (findings: unknown, reference: ReferenceLinks) => unknown = withHelpUris;
const linksOf: () => ReferenceLinks = referenceLinks;
const codeQualityFile: string = CODE_QUALITY_REPORT_FILE_NAME;

const SNAPSHOT_REPORTS: readonly SnapshotFile[] = [
  { name: 'summary.json', render: (report) => json(report.summary) },
  {
    name: 'findings.json',
    render: (report, { reference }) => json(helpUrisOf(report.findings, reference)),
  },
  { name: 'tool-errors.json', render: (report) => json(report.toolErrors) },
  { name: 'report.txt', render: (report, { reference }) => renderTextReport(report, reference) },
  { name: 'report.junit.xml', render: (report) => renderJunitReport(report) },
  { name: 'report.sarif', render: sarifOf },
  {
    name: codeQualityFile,
    render: (report, options) => codeQualityOf(report.findings, options),
  },
];

export const SNAPSHOT_REPORT_FILE_NAMES = SNAPSHOT_REPORTS.map(({ name }) => name);

export function clearSnapshotReports(outputRoot: string): void {
  clearReports(outputRoot, SNAPSHOT_REPORT_FILE_NAMES);
  clearLogs(outputRoot);
}

export function writeSnapshotReports(
  outputRoot: string,
  report: SnapshotReport,
  {
    projectPath,
    repositoryRoot,
  }: { readonly projectPath?: string; readonly repositoryRoot?: string } = {},
): unknown {
  return writeReports(outputRoot, SNAPSHOT_REPORTS, {
    report,
    options: { projectPath, repositoryRoot },
  }).get('report.txt');
}

export function renderSnapshotConsoleSummary(
  report: SnapshotReport,
  diagnosticsPath: string,
): string {
  return renderTextReport(
    report,
    linksOf(),
    designNotesOf(report.findings, diagnosticsPath, { snapshot: true }),
  );
}

function renderTextReport(
  report: SnapshotReport,
  reference: ReferenceLinks,
  descriptiveLines?: readonly string[],
): string {
  const enforceable = report.findings.filter((finding) => finding.classification === 'enforceable');
  const descriptive = report.findings.filter((finding) => finding.classification === 'descriptive');
  const lines = [
    'Nitpicker quality snapshot',
    ...linesOf(report.summary),
    `Status: ${textOf(report.summary.overallStatus)}`,
    ...scopeLinesOf(report.summary),
    `Enforceable findings: ${String(enforceable.length)}`,
    `Descriptive findings: ${String(descriptive.length)}`,
    `Tool errors: ${String(report.toolErrors.length)}`,
    ...partialLinesOf(report.summary),
    ...quickLinesOf(report.summary),
  ];

  appendToolCountSection(lines, report.summary.tools);
  appendFindingSection(lines, 'Enforceable findings', enforceable);
  if (descriptiveLines === undefined) {
    appendFindingSection(lines, 'Descriptive findings', descriptive);
  } else if (descriptiveLines.length > 0) {
    lines.push('', ...descriptiveLines);
  }
  lines.push(...referenceLinesOf(report.findings, reference));
  appendToolErrorSection(lines, report.toolErrors);
  return `${lines.join('\n')}\n`;
}

export function renderRuleFilterSection(
  report: SnapshotReport,
  ruleFilters: readonly string[],
): string {
  if (ruleFilters.length === 0) {
    return '';
  }
  function matches(finding: ReportFinding): boolean {
    return ruleFilters.some((filter) =>
      `${textOf(finding.tool)}/${textOf(finding.rule)}`.includes(filter),
    );
  }
  const lines = ['', `Findings matching --rule ${ruleFilters.join(', ')}:`];
  appendFindingSection(lines, '  Matching', report.findings.filter(matches));
  return `${lines.join('\n')}\n`;
}

function renderJunitReport(report: SnapshotReport): string {
  const failures =
    report.summary.tools.filter((tool) => tool.enforceable > 0).length + report.toolErrors.length;
  const testCases = report.summary.tools.map((tool) =>
    tool.enforceable > 0
      ? `  <testcase classname="quality.snapshot" name="${escapeXml(tool.name)}" time="0"><failure message="${String(tool.enforceable)} enforceable findings"></failure></testcase>`
      : `  <testcase classname="quality.snapshot" name="${escapeXml(tool.name)}" time="0"></testcase>`,
  );
  for (const error of report.toolErrors) {
    testCases.push(
      `  <testcase classname="quality.snapshot" name="${escapeXml(`${textOf(error.tool)}:${textOf(error.snapshot)}`)}" time="0"><failure message="${escapeXml(error.message)}">${escapeXml(error.message)}</failure></testcase>`,
    );
  }
  const profile = profileOf(report.summary, 'quality.snapshot', escapeXml);
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

function appendToolCountSection(lines: string[], tools: readonly ToolCount[]): void {
  if (tools.length === 0) {
    lines.push('Analyzers: none configured');
    return;
  }
  lines.push('', 'Per-tool counts:');
  for (const tool of tools) {
    lines.push(
      `${textOf(tool.name)}: total=${textOf(tool.total)} enforceable=${String(tool.enforceable)} ` +
        `descriptive=${textOf(tool.descriptive)}`,
    );
  }
}

function appendFindingSection(
  lines: string[],
  heading: string,
  findings: readonly ReportFinding[],
): void {
  if (findings.length === 0) {
    return;
  }
  lines.push('', `${heading}:`);
  for (const finding of findings) {
    const location = finding.location === undefined ? '' : `:${textOf(finding.location.line)}`;
    const rule = `${textOf(finding.tool)}/${textOf(finding.rule)}`;
    lines.push(`${rule} ${textOf(finding.path)}${location} ${textOf(finding.message)}`);
  }
}

function appendToolErrorSection(lines: string[], toolErrors: readonly ReportFinding[]): void {
  if (toolErrors.length === 0) {
    return;
  }
  lines.push('', 'Tool errors:');
  for (const error of toolErrors) {
    lines.push(`${textOf(error.tool)} (${textOf(error.snapshot)}): ${textOf(error.message)}`);
  }
  const help = helpLineOf(toolErrors.map(({ message }) => message));
  if (help !== undefined) {
    lines.push(help);
  }
}

function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
