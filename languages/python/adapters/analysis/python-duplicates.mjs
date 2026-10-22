import { readFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdClones } from '../../../../core/tooling/jscpd/jscpd-clones.mjs';
import { withoutImportOnlyClones } from '../../../../core/tooling/jscpd/import-only.mjs';
import { DUPLICATES_REPORT, runJscpd } from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import { duplicateFindings } from '../../../java/adapters/metrics/java-duplicates.mjs';
import { isGeneratedPython } from '../../libraries/generated-files.mjs';
import { existingSourceRoots, nonProductionGlobs, pythonSourceFiles } from './python-sources.mjs';

const DUPLICATES_FAILED_RULE = 'duplicates-failed';

export function runDuplicates(context) {
  try {
    runJscpd({
      cwd: context.projectRoot,
      roots: existingSourceRoots(context.projectRoot, context.project.sourceRoots),
      format: 'python',
      ignore: nonProductionGlobs(
        context.project.sourceRoots,
        context.projectRoot,
        context.duplicateSkippedFolders,
      ),
      reportRoot: context.reportRoot,
      together: true,
      renamed: {
        syntax: 'python',
        files: pythonSourceFiles(context.projectRoot, context.project.sourceRoots).filter(
          (file) => !isGeneratedPython(context.projectRoot, file),
        ),
      },
    });
  } catch (error) {
    throw Object.assign(new Error(error.message, { cause: error }), {
      rule: DUPLICATES_FAILED_RULE,
    });
  }
}

export function readDuplicateFindings(reportRoot, projectRoot) {
  const { runs } = JSON.parse(readFileSync(path.join(reportRoot, DUPLICATES_REPORT), 'utf8'));
  const clones = runs.flatMap(({ root, report }) => jscpdClones(report, [root]));
  return duplicateFindings(withoutImportOnlyClones(clones, 'python'), {
    reportRoot,
    reportFile: DUPLICATES_REPORT,
    projectRoot,
    syntax: 'python',
  });
}
