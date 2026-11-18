import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import {
  evaluateDuplicates,
  existingRoot,
  renamedClones,
  renamedFindings,
  withoutRenamedCopies,
  sourceFilesUnder,
  withoutImportOnlyClones,
  jscpdClones,
  insideReportRoot,
  renamedReportFile,
  skippedFolderGlobs,
  type Clone,
} from './duplicate-views.mts';
import {
  DUPLICATES_REPORT,
  DUPLICATES_TOOL,
  runJscpd,
} from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import { JVM_SKIPPED_FOLDERS } from '../../../../core/tooling/jscpd/skipped-folders.mjs';
import type { Finding } from '../../../../shared/values/findings.mts';
import { fieldOf, listOf, parseJson, textOf, textsOf } from '../../../../shared/values/readers.mts';

type DuplicatesRun = {
  reportRoot: string;
  manifest: unknown;
  format?: string;
  rootsKey?: string;
  reportFile?: string;
  skippedFolders?: readonly string[];
  renamedExtensions?: string[];
};

type DuplicateRead = {
  reportRoot: string;
  reportFile: string;
  projectRoot?: string | undefined;
  syntax: string;
  skip?: ((clone: Clone) => boolean) | undefined;
};

const GLOB_SYNTAX = /[*?[\]{}()!@+]/gu;

function literalGlob(file: string): string {
  return `**/${file.replaceAll(GLOB_SYNTAX, String.raw`\$&`)}`;
}

export function runJavaDuplicates(
  projectRoot: string,
  {
    reportRoot,
    manifest,
    format = 'java',
    rootsKey = 'sourceRoots',
    reportFile = DUPLICATES_REPORT,
    skippedFolders = JVM_SKIPPED_FOLDERS,
    renamedExtensions = ['.java'],
  }: DuplicatesRun,
): void {
  const roots = textsOf(fieldOf(manifest, rootsKey)).filter((root) =>
    existingRoot(projectRoot, root),
  );
  const excluded = textsOf(fieldOf(manifest, 'kotlinExcludedFiles'));
  mkdirSync(reportRoot, { recursive: true });
  runJscpd({
    cwd: projectRoot,
    roots,
    format,
    ignore: [...skippedFolderGlobs(skippedFolders), ...excluded.map(literalGlob)],
    reportRoot,
    reportFile,
    renamed: {
      syntax: format,
      files: sourceFilesUnder(projectRoot, roots, renamedExtensions).filter(
        (file) => !excluded.includes(file),
      ),
    },
  });
}

function readRuns(reportRoot: string, reportFile: string): Clone[] {
  const runs = listOf(
    fieldOf(parseJson(readFileSync(insideReportRoot(reportRoot, reportFile), 'utf8')), 'runs'),
  );
  return runs.flatMap((run) => jscpdClones(fieldOf(run, 'report'), [textOf(fieldOf(run, 'root'))]));
}

export function duplicateFindings(
  plain: Clone[],
  { reportRoot, reportFile, projectRoot, syntax, skip = () => false }: DuplicateRead,
): Finding[] {
  const renamedFile = renamedReportFile(reportFile);
  const renamed =
    projectRoot !== undefined && existsSync(insideReportRoot(reportRoot, renamedFile))
      ? renamedClones(readRuns(reportRoot, renamedFile), { projectRoot, syntax })
      : [];
  function kept(clones: Clone[]): Clone[] {
    return clones.filter((clone) => !skip(clone));
  }
  return [
    ...evaluateDuplicates(kept(withoutRenamedCopies(plain, renamed)), DUPLICATES_TOOL),
    ...renamedFindings(kept(renamed), DUPLICATES_TOOL),
  ];
}

export function readDuplicateFindings(
  reportRoot: string,
  {
    reportFile = DUPLICATES_REPORT,
    format = 'java',
    projectRoot,
    skip,
  }: Partial<Pick<DuplicateRead, 'reportFile' | 'projectRoot' | 'skip'>> & { format?: string } = {},
): Finding[] {
  return duplicateFindings(withoutImportOnlyClones(readRuns(reportRoot, reportFile), format), {
    reportRoot,
    reportFile,
    projectRoot,
    syntax: format,
    skip,
  });
}
