import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateDuplicates } from '../../../../shared/rules/duplicates.mjs';
import { withoutImportOnlyClones } from '../../../../core/tooling/jscpd/import-only.mjs';
import { jscpdClones } from '../../../../core/tooling/jscpd/jscpd-clones.mjs';
import {
  DUPLICATES_REPORT,
  DUPLICATES_TOOL,
  runJscpd,
} from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import {
  JVM_SKIPPED_FOLDERS,
  skippedFolderGlobs,
} from '../../../../core/tooling/jscpd/skipped-folders.mjs';

export function runJavaDuplicates(
  projectRoot,
  {
    reportRoot,
    manifest,
    format = 'java',
    rootsKey = 'sourceRoots',
    reportFile = DUPLICATES_REPORT,
    skippedFolders = JVM_SKIPPED_FOLDERS,
  },
) {
  const roots = (manifest[rootsKey] ?? []).filter((root) =>
    existsSync(path.join(projectRoot, root)),
  );
  runJscpd({
    cwd: projectRoot,
    roots,
    format,
    ignore: skippedFolderGlobs(skippedFolders),
    reportRoot,
    reportFile,
  });
}

export function readDuplicateFindings(reportRoot, reportFile = DUPLICATES_REPORT, format = 'java') {
  const { runs } = JSON.parse(readFileSync(path.join(reportRoot, reportFile), 'utf8'));
  return runs.flatMap(({ root, report }) =>
    evaluateDuplicates(
      withoutImportOnlyClones(jscpdClones(report, [root]), format),
      DUPLICATES_TOOL,
    ),
  );
}
