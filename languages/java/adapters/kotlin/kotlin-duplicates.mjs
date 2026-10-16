import { existsSync } from 'node:fs';
import path from 'node:path';
import { readDuplicateFindings, runJavaDuplicates } from '../metrics/java-duplicates.mjs';

const KOTLIN_DUPLICATES = {
  format: 'kotlin',
  rootsKey: 'kotlinSourceRoots',
  reportFile: 'kotlin-duplicates.json',
};

export function runKotlinDuplicates(projectRoot, { reportRoot, manifest, skippedFolders }) {
  runJavaDuplicates(projectRoot, { ...KOTLIN_DUPLICATES, reportRoot, manifest, skippedFolders });
}

export function readKotlinDuplicateFindings(reportRoot) {
  return existsSync(path.join(reportRoot, KOTLIN_DUPLICATES.reportFile))
    ? readDuplicateFindings(reportRoot, KOTLIN_DUPLICATES.reportFile, KOTLIN_DUPLICATES.format)
    : [];
}
