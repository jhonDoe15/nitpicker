import { existsSync } from 'node:fs';
import path from 'node:path';
import { readDuplicateFindings, runJavaDuplicates } from '../metrics/java-duplicates.mjs';

const KOTLIN_DUPLICATES = {
  format: 'kotlin',
  rootsKey: 'kotlinSourceRoots',
  reportFile: 'kotlin-duplicates.json',
  renamedExtensions: ['.kt', '.kts'],
};

export function runKotlinDuplicates(projectRoot, { reportRoot, manifest, skippedFolders }) {
  runJavaDuplicates(projectRoot, { ...KOTLIN_DUPLICATES, reportRoot, manifest, skippedFolders });
}

export function readKotlinDuplicateFindings(reportRoot, projectRoot) {
  return existsSync(path.join(reportRoot, KOTLIN_DUPLICATES.reportFile))
    ? readDuplicateFindings(reportRoot, {
        reportFile: KOTLIN_DUPLICATES.reportFile,
        format: KOTLIN_DUPLICATES.format,
        projectRoot,
      })
    : [];
}
