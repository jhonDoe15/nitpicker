import { scopeLine } from '../scope/scope-findings.mjs';
import { renderSnapshotSarifReport } from '../diff/reporting/sarif.mjs';
import { clearLogs, clearReports, json, writeReports } from '../diff/reporting/reporters.mjs';
import { quickLines, stagedLines } from '../quick/summary.mjs';
import { junitRunProfile } from '../quick/report-formats.mjs';
import { toolErrorHelpLine } from '../../shared/messages/troubleshooting.mjs';
import { partialRunLines } from '../diff/reporting/partial-run/partial-run.mjs';
import { ruleReferenceLines } from '../diff/reporting/text.mjs';
import { withHelpUris } from '../../shared/reference/store.mjs';
import {
  CODE_QUALITY_REPORT_FILE_NAME,
  renderCodeQualityReport,
} from '../diff/reporting/format/codequality.mjs';

import { appendFindingSection as untypedAppendFindingSection } from '../diff/reporting/console/finding-lines.mjs';
import {
  cleanLine as untypedCleanLine,
  isActiveSnapshotTool as untypedIsActive,
  splitTools as untypedSplitTools,
} from '../diff/reporting/console/tool-table.mjs';
import { renderSnapshotConsole as untypedConsole } from '../diff/reporting/summary.mjs';

import { textOf } from '../../shared/values/readers.mts';

type ConsoleOptions = {
  readonly diagnosticsPath: string;
  readonly color: boolean;
  readonly projectRoot: string;
};

const consoleOf: (report: SnapshotReport, options: ConsoleOptions) => unknown = untypedConsole;
const appendSection: (
  lines: string[],
  heading: string,
  findings: readonly ReportFinding[],
) => void = untypedAppendFindingSection;
const cleanLineOf: (clean: number) => string = untypedCleanLine;
const isActiveTool: (tool: ToolCount) => boolean = untypedIsActive;
const splitTools: (
  tools: readonly ToolCount[],
  isActive: (tool: ToolCount) => boolean,
) => { readonly active: readonly ToolCount[]; readonly clean: number } = untypedSplitTools;

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

type ReferenceLinks = { index(): unknown; root(): unknown };

type RenderOptions = {
  readonly reference: ReferenceLinks;
  readonly projectPath?: string | undefined;
  readonly repositoryRoot?: string | undefined;
};

type ReportFile = {
  readonly name: string;
  readonly render: (report: SnapshotReport, options: RenderOptions) => unknown;
};

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
const helpLineOf: (messages: readonly unknown[]) => string | undefined = toolErrorHelpLine;
const profileOf: (
  summary: unknown,
  suite: string,
  escape: (value: unknown) => string,
) => JunitProfile = junitRunProfile;
const reportsWriter: (
  outputRoot: string,
  reports: readonly ReportFile[],
  request: { readonly report: unknown; readonly options: object },
) => ReadonlyMap<string, unknown> = writeReports;
const clearReportFiles: (outputRoot: string, names: readonly string[]) => void = clearReports;
const clearLogFiles: (outputRoot: string) => void = clearLogs;
const jsonOf: (value: unknown) => unknown = json;
const sarifOf: (report: SnapshotReport, options: RenderOptions) => unknown =
  renderSnapshotSarifReport;
const codeQualityOf: (findings: unknown, options: RenderOptions) => unknown =
  renderCodeQualityReport;
const helpUrisOf: (findings: unknown, reference: ReferenceLinks) => unknown = withHelpUris;
const codeQualityFile: string = CODE_QUALITY_REPORT_FILE_NAME;

const SNAPSHOT_REPORTS: readonly ReportFile[] = [
  { name: 'summary.json', render: (report) => jsonOf(report.summary) },
  {
    name: 'findings.json',
    render: (report, { reference }) => jsonOf(helpUrisOf(report.findings, reference)),
  },
  { name: 'tool-errors.json', render: (report) => jsonOf(report.toolErrors) },
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
  clearReportFiles(outputRoot, SNAPSHOT_REPORT_FILE_NAMES);
  clearLogFiles(outputRoot);
}

export function writeSnapshotReports(
  outputRoot: string,
  report: SnapshotReport,
  {
    projectPath,
    repositoryRoot,
  }: { readonly projectPath?: string; readonly repositoryRoot?: string } = {},
): unknown {
  return reportsWriter(outputRoot, SNAPSHOT_REPORTS, {
    report,
    options: { projectPath, repositoryRoot },
  }).get('report.txt');
}

export function renderSnapshotConsoleSummary(
  report: SnapshotReport,
  options: ConsoleOptions,
): string {
  return textOf(consoleOf(report, options));
}

function renderTextReport(report: SnapshotReport, reference: ReferenceLinks): string {
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
  appendFindingSection(lines, 'Descriptive findings', descriptive);
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
  const { active, clean } = splitTools(tools, isActiveTool);
  lines.push('', 'Per-tool counts:');
  for (const tool of active) {
    lines.push(
      `${textOf(tool.name)}: total=${textOf(tool.total)} enforceable=${String(tool.enforceable)} ` +
        `descriptive=${textOf(tool.descriptive)}`,
    );
  }
  if (clean > 0) {
    lines.push(cleanLineOf(clean));
  }
}

function appendFindingSection(
  lines: string[],
  heading: string,
  findings: readonly ReportFinding[],
): void {
  appendSection(lines, heading, findings);
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
