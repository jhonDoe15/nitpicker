import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderTextReport } from './text.mjs';
import { renderJunitReport } from './junit.mjs';
import { renderSarifReport } from './sarif.mjs';

const TEXT_REPORT_FILE_NAME = 'report.txt';

const JUNIT_REPORT_FILE_NAME = 'report.junit.xml';

const SARIF_REPORT_FILE_NAME = 'report.sarif';

export const REPORT_FILE_NAMES = [
  'summary.json',
  'new-findings.json',
  'resolved-findings.json',
  'changed-metrics.json',
  'held-findings.json',
  'tool-errors.json',
  'notes.json',
  TEXT_REPORT_FILE_NAME,
  JUNIT_REPORT_FILE_NAME,
  SARIF_REPORT_FILE_NAME,
];

export function clearDiffReports(outputRoot) {
  for (const reportFileName of REPORT_FILE_NAMES) {
    rmSync(path.join(outputRoot, reportFileName), { force: true });
  }
}

export function writeDiffReports(outputRoot, report) {
  mkdirSync(outputRoot, { recursive: true });
  writeJson(path.join(outputRoot, 'summary.json'), report.summary);
  writeJson(path.join(outputRoot, 'new-findings.json'), report.newFindings);
  writeJson(path.join(outputRoot, 'resolved-findings.json'), report.resolvedFindings);
  writeJson(path.join(outputRoot, 'changed-metrics.json'), report.changedMetrics);
  writeJson(
    path.join(outputRoot, 'held-findings.json'),
    report.unchangedFindings.filter((finding) => finding.heldAtBase !== undefined),
  );
  writeJson(path.join(outputRoot, 'tool-errors.json'), report.toolErrors);
  writeJson(path.join(outputRoot, 'notes.json'), report.notes ?? []);

  const text = renderTextReport(report);
  writeFileSync(path.join(outputRoot, TEXT_REPORT_FILE_NAME), text);
  writeFileSync(path.join(outputRoot, JUNIT_REPORT_FILE_NAME), renderJunitReport(report));
  writeFileSync(path.join(outputRoot, SARIF_REPORT_FILE_NAME), renderSarifReport(report));
  return text;
}

export function absoluteTextReportPath(outputRoot) {
  return path.resolve(outputRoot, TEXT_REPORT_FILE_NAME);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
