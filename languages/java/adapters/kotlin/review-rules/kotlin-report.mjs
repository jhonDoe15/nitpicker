import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FACTS_REPORT = 'kotlin-facts.json';

export function readKotlinReport(reportRoot) {
  const report = path.join(reportRoot, FACTS_REPORT);
  return existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : { files: [] };
}

export function readKotlinDesign(reportRoot) {
  return readKotlinReport(reportRoot).design;
}
