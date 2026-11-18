import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, listOf, parseJson } from '../../../../../../shared/values/readers.mts';
import { KOTLIN_REPORTS } from '../../report-names/kotlin-report-names.mts';
import type { KotlinFile } from '../typed/kotlin-fact-types.mts';
import type { KotlinFacts } from '../typed/review-context-types.mts';

function readKotlinReport(reportRoot: string): unknown {
  const report = path.join(reportRoot, KOTLIN_REPORTS.facts);
  return existsSync(report) ? parseJson(readFileSync(report, 'utf8')) : { files: [] };
}

export function readKotlinDesign(reportRoot: string): unknown {
  return fieldOf(readKotlinReport(reportRoot), 'design');
}

function isKotlinFile(value: unknown): value is KotlinFile {
  return typeof fieldOf(value, 'file') === 'string';
}

export function readKotlinFacts(reportRoot: string): KotlinFacts {
  const files = listOf(fieldOf(readKotlinReport(reportRoot), 'files')).filter(isKotlinFile);
  return {
    files: files.filter(({ skipped }) => skipped !== true),
    skipped: files
      .filter(({ skipped }) => skipped === true)
      .map(({ file, test }) => ({ file, test })),
  };
}
