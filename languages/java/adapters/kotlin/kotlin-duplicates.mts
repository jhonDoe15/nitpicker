import { existsSync } from 'node:fs';
import path from 'node:path';
import { callUntyped } from '../typed/java-values.mts';
import { listOf } from '../../../../shared/values/readers.mts';
import { readDuplicateFindings, runJavaDuplicates } from '../metrics/java-duplicates.mts';

type DuplicateRun = {
  readonly reportRoot: string;
  readonly manifest: unknown;
  readonly skippedFolders: unknown;
};

const KOTLIN_DUPLICATES = {
  format: 'kotlin',
  rootsKey: 'kotlinSourceRoots',
  reportFile: 'kotlin-duplicates.json',
  renamedExtensions: ['.kt', '.kts'],
};

export function runKotlinDuplicates(
  projectRoot: string,
  { reportRoot, manifest, skippedFolders }: DuplicateRun,
): void {
  callUntyped(runJavaDuplicates, projectRoot, {
    ...KOTLIN_DUPLICATES,
    reportRoot,
    manifest,
    skippedFolders,
  });
}

export function readKotlinDuplicateFindings(
  reportRoot: string,
  projectRoot: string,
): readonly unknown[] {
  return existsSync(path.join(reportRoot, KOTLIN_DUPLICATES.reportFile))
    ? listOf(
        callUntyped(readDuplicateFindings, reportRoot, {
          reportFile: KOTLIN_DUPLICATES.reportFile,
          format: KOTLIN_DUPLICATES.format,
          projectRoot,
        }),
      )
    : [];
}

export function readProjectDuplicateFindings(
  reportRoot: string,
  { preset, projectRoot, skip }: { preset: string; projectRoot: string; skip: unknown },
): readonly unknown[] {
  return [
    ...listOf(callUntyped(readDuplicateFindings, reportRoot, { projectRoot, skip })),
    ...(preset === 'kotlin' ? readKotlinDuplicateFindings(reportRoot, projectRoot) : []),
  ];
}
