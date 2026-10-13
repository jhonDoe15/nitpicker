import { existsSync } from 'node:fs';
import path from 'node:path';
import { readDuplicateFindings, runJavaDuplicates } from './java-duplicates.mjs';

const KOTLIN_DUPLICATES = {
  format: 'kotlin',
  rootsKey: 'kotlinSourceRoots',
  reportFile: 'kotlin-duplicates.json',
};

export function runKotlinDuplicates(projectRoot, skippedFolders) {
  runJavaDuplicates(projectRoot, { ...KOTLIN_DUPLICATES, skippedFolders });
}

export function readKotlinDuplicateFindings(reportRoot) {
  return existsSync(path.join(reportRoot, KOTLIN_DUPLICATES.reportFile))
    ? readDuplicateFindings(reportRoot, KOTLIN_DUPLICATES.reportFile, KOTLIN_DUPLICATES.format)
    : [];
}
