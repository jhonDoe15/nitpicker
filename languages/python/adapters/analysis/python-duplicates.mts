import { textsOf } from '../../../../shared/values/readers.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type { ScanContext } from './typed/coupling-types.mts';

type DuplicatesContext = ScanContext & { readonly duplicateSkippedFolders?: unknown };
import { DUPLICATES_REPORT } from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import { duplicateFindings } from './typed/shared-views.mts';
import {
  readDuplicateClones,
  runDuplicateScan,
} from '../../../../core/tooling/jscpd/duplicate-scan.mts';
import { isGeneratedPython } from '../../libraries/generated-files.mts';
import { existingSourceRoots, nonProductionGlobs, pythonSourceFiles } from './python-sources.mts';

const PYTHON = 'python';
const DUPLICATES_FAILED_RULE = 'duplicates-failed';

function skippedFolders(setting: unknown): string[] | undefined {
  return Array.isArray(setting) ? textsOf(setting) : undefined;
}

export function runDuplicates(context: DuplicatesContext): void {
  runDuplicateScan(
    {
      cwd: context.projectRoot,
      roots: existingSourceRoots(context.projectRoot, context.project.sourceRoots),
      format: PYTHON,
      ignore: nonProductionGlobs(
        context.project.sourceRoots,
        context.projectRoot,
        skippedFolders(context.duplicateSkippedFolders),
      ),
      reportRoot: context.reportRoot,
      together: true,
      renamed: {
        syntax: PYTHON,
        files: pythonSourceFiles(context.projectRoot, context.project.sourceRoots).filter(
          (file) => !isGeneratedPython(context.projectRoot, file),
        ),
      },
    },
    DUPLICATES_FAILED_RULE,
  );
}

export function readDuplicateFindings(reportRoot: string, projectRoot: string): IngestedFinding[] {
  return duplicateFindings(readDuplicateClones(reportRoot, PYTHON), {
    reportRoot,
    reportFile: DUPLICATES_REPORT,
    projectRoot,
    syntax: PYTHON,
  });
}
