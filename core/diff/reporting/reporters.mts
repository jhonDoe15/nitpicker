import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderTextReport as textReport } from './text.mts';
import { renderJunitReport } from './junit.mts';
import { renderBaselineSarifReport, renderSarifReport } from './sarif.mts';
import { heldFindingsOf as heldFindings } from './report-model.mts';
import { referenceLinks, withHelpUris } from '../../../shared/reference/store.mjs';
import { pathInside } from '../../../shared/filesystem.mjs';
import {
  CODE_QUALITY_REPORT_FILE_NAME as CODE_QUALITY_FILE,
  renderCodeQualityReport as codeQualityReport,
} from './format/codequality.mts';
import type { ReferenceLinks, ReportData } from '../../../shared/values/findings.mts';

export type { ReferenceLinks };

type RenderOptions = {
  readonly reference: ReferenceLinks;
  readonly projectPath?: string | undefined;
  readonly repositoryRoot?: string | undefined;
};

export type ReportFile<R> = {
  readonly name: string;
  readonly render: (report: R, options: RenderOptions) => string;
};

type ReportLocation = {
  readonly projectPath?: string | undefined;
  readonly repositoryRoot?: string | undefined;
};

const helpUris: (findings: readonly unknown[], reference: ReferenceLinks) => unknown = withHelpUris;
const links: () => ReferenceLinks = referenceLinks;

const TEXT_REPORT_FILE_NAME = 'report.txt';

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const DIFF_REPORTS: readonly ReportFile<ReportData>[] = [
  { name: 'summary.json', render: (report) => json(report.summary) },
  {
    name: 'new-findings.json',
    render: (report, { reference }) => json(helpUris(report.newFindings, reference)),
  },
  {
    name: 'resolved-findings.json',
    render: (report, { reference }) => json(helpUris(report.resolvedFindings, reference)),
  },
  { name: 'changed-metrics.json', render: (report) => json(report.changedMetrics) },
  {
    name: 'held-findings.json',
    render: (report, { reference }) => json(helpUris(heldFindings(report), reference)),
  },
  { name: 'tool-errors.json', render: (report) => json(report.toolErrors) },
  { name: 'notes.json', render: (report) => json(report.notes ?? []) },
  { name: TEXT_REPORT_FILE_NAME, render: textReport },
  { name: 'report.junit.xml', render: renderJunitReport },
  { name: 'report.sarif', render: renderSarifReport },
  { name: 'report-baseline.sarif', render: renderBaselineSarifReport },
  {
    name: CODE_QUALITY_FILE,
    render: (report, options) => codeQualityReport(report.newFindings, options),
  },
];

const within: (root: string, relative: string) => string | undefined = pathInside;

export const REPORT_FILE_NAMES = DIFF_REPORTS.map(({ name }) => name);

function outsideOutput(outputRoot: string, name: string): never {
  throw new Error(`Report file ${name} is outside ${path.resolve(outputRoot)}`);
}

function reportPath(outputRoot: string, name: string): string {
  return within(outputRoot, name) ?? outsideOutput(outputRoot, name);
}

export function clearReports(outputRoot: string, names: readonly string[]): void {
  for (const reportFileName of names) {
    rmSync(reportPath(outputRoot, reportFileName), { force: true });
  }
}

export function writeReports<R>(
  outputRoot: string,
  reports: readonly ReportFile<R>[],
  { report, options }: { readonly report: R; readonly options: ReportLocation },
): Map<string, string> {
  mkdirSync(outputRoot, { recursive: true });
  const rendering = { ...options, reference: links() };
  const written = new Map(reports.map(({ name, render }) => [name, render(report, rendering)]));
  for (const [name, contents] of written) {
    writeFileSync(reportPath(outputRoot, name), contents);
  }
  return written;
}

export const LOG_DIRECTORY = 'logs';

const OWN_LOG = /^[\w-]+-(?:base|head)-gradle\.log$/u;

export function clearLogs(outputRoot: string): void {
  const directory = path.join(path.resolve(outputRoot), LOG_DIRECTORY);
  if (!existsSync(directory)) {
    return;
  }
  for (const name of readdirSync(directory).filter((entry) => OWN_LOG.test(entry))) {
    rmSync(reportPath(outputRoot, `${LOG_DIRECTORY}/${name}`), { force: true });
  }
  if (readdirSync(directory).length === 0) {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function clearDiffReports(outputRoot: string): void {
  clearReports(outputRoot, REPORT_FILE_NAMES);
  clearLogs(outputRoot);
}

export function outputRootFor(
  projectRoot: string,
  outputOption: string | undefined,
  kind: string,
): string {
  return outputOption === undefined
    ? path.join(projectRoot, 'reports/quality', kind)
    : path.resolve(projectRoot, outputOption);
}

export function writeDiffReports(
  outputRoot: string,
  report: ReportData,
  { projectPath, repositoryRoot }: ReportLocation = {},
): string | undefined {
  return writeReports(outputRoot, DIFF_REPORTS, {
    report,
    options: { projectPath, repositoryRoot },
  }).get(TEXT_REPORT_FILE_NAME);
}

export function absoluteTextReportPath(outputRoot: string): string {
  return path.resolve(outputRoot, TEXT_REPORT_FILE_NAME);
}
