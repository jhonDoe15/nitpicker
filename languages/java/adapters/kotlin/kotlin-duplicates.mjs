import { existsSync } from 'node:fs';
import path from 'node:path';
import { readDuplicateFindings, runJavaDuplicates } from '../metrics/java-duplicates.mjs';

const KOTLIN_DUPLICATES = {
  format: 'kotlin',
  rootsKey: 'kotlinSourceRoots',
  reportFile: 'kotlin-duplicates.json',
};

export function runKotlinDuplicates(projectRoot, { reportRoot, manifest }) {
  runJavaDuplicates(projectRoot, { ...KOTLIN_DUPLICATES, reportRoot, manifest });
}

export function readKotlinDuplicateFindings(reportRoot) {
  return existsSync(path.join(reportRoot, KOTLIN_DUPLICATES.reportFile))
    ? readDuplicateFindings(reportRoot, KOTLIN_DUPLICATES.reportFile)
    : [];
}
