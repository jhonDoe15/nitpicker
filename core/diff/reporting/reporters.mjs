import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderTextReport } from './text.mjs';
import { renderJunitReport } from './junit.mjs';
import { renderBaselineSarifReport, renderSarifReport } from './sarif.mjs';
import { heldFindingsOf } from './report-model.mjs';
import { referenceLinks, withHelpUris } from '../../../shared/reference/store.mjs';
import { CODE_QUALITY_REPORT_FILE_NAME, renderCodeQualityReport } from './format/codequality.mjs';

const TEXT_REPORT_FILE_NAME = 'report.txt';

export function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const DIFF_REPORTS = [
  { name: 'summary.json', render: (report) => json(report.summary) },
  {
    name: 'new-findings.json',
    render: (report, { reference }) => json(withHelpUris(report.newFindings, reference)),
  },
  {
    name: 'resolved-findings.json',
    render: (report, { reference }) => json(withHelpUris(report.resolvedFindings, reference)),
  },
  { name: 'changed-metrics.json', render: (report) => json(report.changedMetrics) },
  {
    name: 'held-findings.json',
    render: (report, { reference }) => json(withHelpUris(heldFindingsOf(report), reference)),
  },
  { name: 'tool-errors.json', render: (report) => json(report.toolErrors) },
  { name: 'notes.json', render: (report) => json(report.notes ?? []) },
  { name: TEXT_REPORT_FILE_NAME, render: renderTextReport },
  { name: 'report.junit.xml', render: renderJunitReport },
  { name: 'report.sarif', render: renderSarifReport },
  { name: 'report-baseline.sarif', render: renderBaselineSarifReport },
  {
    name: CODE_QUALITY_REPORT_FILE_NAME,
    render: (report, options) => renderCodeQualityReport(report.newFindings, options),
  },
];

export const REPORT_FILE_NAMES = DIFF_REPORTS.map(({ name }) => name);

function reportPath(outputRoot, name) {
  const root = path.resolve(outputRoot);
  const full = path.resolve(root, name);
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Report file ${name} is outside ${root}`);
  }
  return full;
}

export function clearReports(outputRoot, names) {
  for (const reportFileName of names) {
    rmSync(reportPath(outputRoot, reportFileName), { force: true });
  }
}

/** Writes each of `reports`, rendered from `report`, with one rule reference for all of them. */
export function writeReports(outputRoot, reports, { report, options }) {
  mkdirSync(outputRoot, { recursive: true });
  const rendering = { ...options, reference: referenceLinks() };
  const written = new Map(reports.map(({ name, render }) => [name, render(report, rendering)]));
  for (const [name, contents] of written) {
    writeFileSync(reportPath(outputRoot, name), contents);
  }
  return written;
}

export const LOG_DIRECTORY = 'logs';

const OWN_LOG = /^[\w-]+-(?:base|head)-gradle\.log$/u;

export function clearLogs(outputRoot) {
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

export function clearDiffReports(outputRoot) {
  clearReports(outputRoot, REPORT_FILE_NAMES);
  clearLogs(outputRoot);
}

export function outputRootFor(projectRoot, outputOption, kind) {
  return outputOption === undefined
    ? path.join(projectRoot, 'reports/quality', kind)
    : path.resolve(projectRoot, outputOption);
}

export function writeDiffReports(outputRoot, report, { projectPath, repositoryRoot } = {}) {
  return writeReports(outputRoot, DIFF_REPORTS, {
    report,
    options: { projectPath, repositoryRoot },
  }).get(TEXT_REPORT_FILE_NAME);
}

export function absoluteTextReportPath(outputRoot) {
  return path.resolve(outputRoot, TEXT_REPORT_FILE_NAME);
}
