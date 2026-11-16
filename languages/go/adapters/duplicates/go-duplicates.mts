import {
  readDuplicateClones,
  runDuplicateScan,
} from '../../../../core/tooling/jscpd/duplicate-scan.mts';
import { DUPLICATES_REPORT } from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import {
  GO_DUPLICATE_GLOBS,
  GO_SKIPPED_FOLDERS,
  skippedFolderGlobs as untypedSkippedFolderGlobs,
} from '../../../../core/tooling/jscpd/skipped-folders.mjs';
import { duplicateFindings } from '../../../java/adapters/metrics/java-duplicates.mts';
import { readInspect } from '../structure/go-inspect.mts';
import { isRow } from '../typed/row-readers.mts';
import { listOf } from '../../../../shared/values/readers.mts';
import type { FindingRow, GoContext, InspectReport } from '../go-types.mts';

const SYNTAX = 'go';
const skippedFolderGlobs: (folders: readonly string[]) => string[] = untypedSkippedFolderGlobs;

function goDuplicateIgnores(
  report: InspectReport,
  skippedFolders: readonly string[] = GO_SKIPPED_FOLDERS,
) {
  return [
    ...skippedFolderGlobs(skippedFolders),
    ...GO_DUPLICATE_GLOBS,
    ...(report.skipped ?? []).map((folder) => `${folder}/**`),
    ...report.files.filter(({ generated }) => generated).map(({ path: file }) => file),
  ];
}

export function duplicates(context: GoContext): void {
  const report = readInspect(context.reportRoot);
  const files = report.files.filter(({ test, generated }) => !(test || generated));
  runDuplicateScan(
    {
      cwd: context.projectRoot,
      roots: files.length === 0 ? [] : ['.'],
      format: SYNTAX,
      ignore: goDuplicateIgnores(report, context.duplicateSkippedFolders),
      reportRoot: context.reportRoot,
      together: true,
      renamed: { syntax: SYNTAX, files: files.map(({ path: file }) => file) },
    },
    'duplicates-failed',
  );
}

export function readGoDuplicateFindings(reportRoot: string, projectRoot: string): FindingRow[] {
  return listOf(
    duplicateFindings(readDuplicateClones(reportRoot, SYNTAX), {
      reportRoot,
      reportFile: DUPLICATES_REPORT,
      projectRoot,
      syntax: SYNTAX,
    }),
  ).filter(isRow);
}
