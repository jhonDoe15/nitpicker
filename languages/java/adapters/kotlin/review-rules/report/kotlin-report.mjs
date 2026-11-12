import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { KOTLIN_REPORTS } from '../../report-names/kotlin-report-names.mjs';

function readKotlinReport(reportRoot) {
  const report = path.join(reportRoot, KOTLIN_REPORTS.facts);
  return existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : { files: [] };
}

export function readKotlinDesign(reportRoot) {
  return readKotlinReport(reportRoot).design;
}

export function readKotlinFacts(reportRoot) {
  const { files } = readKotlinReport(reportRoot);
  return {
    files: files.filter(({ skipped }) => skipped !== true),
    skipped: files
      .filter(({ skipped }) => skipped === true)
      .map(({ file, test }) => ({ file, test: test === true })),
  };
}
