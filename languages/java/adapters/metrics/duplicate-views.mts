import { existsSync } from 'node:fs';
import path from 'node:path';
import { evaluateDuplicates as untypedEvaluateDuplicates } from '../../../../shared/rules/duplicates.mjs';
import {
  renamedClones as untypedRenamedClones,
  renamedFindings as untypedRenamedFindings,
  withoutRenamedCopies as untypedWithoutRenamedCopies,
} from '../../../../shared/renamed-clones/findings.mjs';
import { sourceFilesUnder as untypedSourceFilesUnder } from '../../../../shared/renamed-clones/files.mjs';
import { withoutImportOnlyClones as untypedWithoutImportOnlyClones } from '../../../../core/tooling/jscpd/import-only.mjs';
import { jscpdClones as untypedJscpdClones } from '../../../../core/tooling/jscpd/jscpd-clones.mjs';
import {
  insideReportRoot as untypedInsideReportRoot,
  renamedReportFile as untypedRenamedReportFile,
} from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import { skippedFolderGlobs as untypedSkippedFolderGlobs } from '../../../../core/tooling/jscpd/skipped-folders.mjs';
import type { DuplicateClone } from '../../../../core/tooling/jscpd/duplicate-scan.mts';
import type { Finding } from '../../../../shared/values/findings.mts';

export type Clone = DuplicateClone;

export const evaluateDuplicates: (clones: Clone[], analyzerName: string) => Finding[] =
  untypedEvaluateDuplicates;
export const renamedClones: (
  clones: Clone[],
  options: { projectRoot: string; syntax: string },
) => Clone[] = untypedRenamedClones;
export const renamedFindings: (clones: Clone[], analyzerName: string) => Finding[] =
  untypedRenamedFindings;
export const withoutRenamedCopies: (plain: Clone[], renamed: Clone[]) => Clone[] =
  untypedWithoutRenamedCopies;
export const sourceFilesUnder: (
  projectRoot: string,
  roots: string[],
  extensions: string[],
) => string[] = untypedSourceFilesUnder;
export const withoutImportOnlyClones: (clones: Clone[], format: string) => Clone[] =
  untypedWithoutImportOnlyClones;
export const jscpdClones: (report: unknown, configuredPaths: string[]) => Clone[] =
  untypedJscpdClones;
export const insideReportRoot: (reportRoot: string, file: string) => string =
  untypedInsideReportRoot;
export const renamedReportFile: (reportFile: string) => string = untypedRenamedReportFile;
export const skippedFolderGlobs: (folders: readonly string[]) => string[] =
  untypedSkippedFolderGlobs;

export function existingRoot(projectRoot: string, root: string): boolean {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, root);
  if (full === base) {
    return existsSync(base);
  }
  if (!full.startsWith(base + path.sep)) {
    return false;
  }
  return existsSync(full);
}
