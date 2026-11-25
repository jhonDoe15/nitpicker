import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { textReportLines } from './text.mts';
import { renderJunitReport } from './junit.mts';
import { renderBaselineSarifReport, renderSarifReport } from './sarif.mts';
import { heldFindingsOf as heldFindings, helpLinkedEntries } from './report-model.mts';
import { referenceLinks } from '../../../shared/reference/store.mts';
import { pathInside } from '../../../shared/filesystem.mts';
import {
  CODE_QUALITY_REPORT_FILE_NAME as CODE_QUALITY_FILE,
  eachCodeQualityIssue,
} from './format/codequality.mts';
import {
  prettyJsonItems,
  prettyJsonPieces,
  writePieces,
} from '../../../shared/report-output/pieces/json-pieces.mts';
import type { ReportData } from '../../../shared/values/findings.mts';
import type { ReferenceLinks } from '../../../shared/reference/typed/entry-types.mts';

export type { ReferenceLinks };

type RenderOptions = {
  readonly reference: ReferenceLinks;
  readonly projectPath?: string | undefined;
  readonly repositoryRoot?: string | undefined;
};

export type ReportFile<R> = {
  readonly name: string;
  readonly render: (report: R, options: RenderOptions) => string | Iterable<string>;
};

type ReportLocation = {
  readonly projectPath?: string | undefined;
  readonly repositoryRoot?: string | undefined;
};

const TEXT_REPORT_FILE_NAME = 'report.txt';

export function* json(value: unknown): Generator<string> {
  yield* prettyJsonPieces(value);
  yield '\n';
}

export function* jsonItems(items: Iterable<unknown>): Generator<string> {
  yield* prettyJsonItems(items);
  yield '\n';
}

function lineText(line: unknown): string {
  if (line === null || line === undefined) {
    return '';
  }
  return typeof line === 'string' ? line : JSON.stringify(line);
}

export function* linePieces(lines: readonly unknown[]): Generator<string> {
  for (const line of lines) {
    yield `${lineText(line)}\n`;
  }
}

const DIFF_REPORTS: readonly ReportFile<ReportData>[] = [
  { name: 'summary.json', render: (report) => json(report.summary) },
  {
    name: 'new-findings.json',
    render: (report, { reference }) => jsonItems(helpLinkedEntries(report.newFindings, reference)),
  },
  {
    name: 'resolved-findings.json',
    render: (report, { reference }) =>
      jsonItems(helpLinkedEntries(report.resolvedFindings, reference)),
  },
  { name: 'changed-metrics.json', render: (report) => json(report.changedMetrics) },
  {
    name: 'held-findings.json',
    render: (report, { reference }) =>
      jsonItems(helpLinkedEntries(heldFindings(report), reference)),
  },
  { name: 'tool-errors.json', render: (report) => json(report.toolErrors) },
  { name: 'notes.json', render: (report) => json(report.notes ?? []) },
  {
    name: TEXT_REPORT_FILE_NAME,
    render: (report, { reference }) => linePieces(textReportLines(report, { reference })),
  },
  { name: 'report.junit.xml', render: renderJunitReport },
  { name: 'report.sarif', render: renderSarifReport },
  { name: 'report-baseline.sarif', render: renderBaselineSarifReport },
  {
    name: CODE_QUALITY_FILE,
    render: (report, options) => jsonItems(eachCodeQualityIssue(report.newFindings, options)),
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
): void {
  mkdirSync(outputRoot, { recursive: true });
  const rendering = { ...options, reference: referenceLinks() };
  for (const { name, render } of reports) {
    writeReportFile(reportPath(outputRoot, name), render(report, rendering));
  }
}

function writeReportFile(file: string, contents: string | Iterable<string>): void {
  const descriptor = openSync(file, 'w');
  try {
    writePieces(typeof contents === 'string' ? [contents] : contents, (text) => {
      writeSync(descriptor, text);
    });
  } finally {
    closeSync(descriptor);
  }
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
): void {
  writeReports(outputRoot, DIFF_REPORTS, { report, options: { projectPath, repositoryRoot } });
}

export function absoluteTextReportPath(outputRoot: string): string {
  return path.resolve(outputRoot, TEXT_REPORT_FILE_NAME);
}
