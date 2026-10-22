import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateDuplicates } from '../../../../shared/rules/duplicates.mjs';
import {
  renamedClones,
  renamedFindings,
  withoutRenamedCopies,
} from '../../../../shared/renamed-clones/findings.mjs';
import { sourceFilesUnder } from '../../../../shared/renamed-clones/files.mjs';
import { withoutImportOnlyClones } from '../../../../core/tooling/jscpd/import-only.mjs';
import { jscpdClones } from '../../../../core/tooling/jscpd/jscpd-clones.mjs';
import {
  DUPLICATES_REPORT,
  DUPLICATES_TOOL,
  insideReportRoot,
  renamedReportFile,
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
    renamedExtensions = ['.java'],
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
    renamed: { syntax: format, files: sourceFilesUnder(projectRoot, roots, renamedExtensions) },
  });
}

function readRuns(reportRoot, reportFile) {
  const { runs } = JSON.parse(readFileSync(insideReportRoot(reportRoot, reportFile), 'utf8'));
  return runs.flatMap(({ root, report }) => jscpdClones(report, [root]));
}

export function duplicateFindings(
  plain,
  { reportRoot, reportFile, projectRoot, syntax, skip = () => false },
) {
  const renamedFile = renamedReportFile(reportFile);
  const renamed =
    projectRoot !== undefined && existsSync(insideReportRoot(reportRoot, renamedFile))
      ? renamedClones(readRuns(reportRoot, renamedFile), { projectRoot, syntax })
      : [];
  function kept(clones) {
    return clones.filter((clone) => !skip(clone));
  }
  return [
    ...evaluateDuplicates(kept(withoutRenamedCopies(plain, renamed)), DUPLICATES_TOOL),
    ...renamedFindings(kept(renamed), DUPLICATES_TOOL),
  ];
}

export function readDuplicateFindings(
  reportRoot,
  { reportFile = DUPLICATES_REPORT, format = 'java', projectRoot, skip } = {},
) {
  return duplicateFindings(withoutImportOnlyClones(readRuns(reportRoot, reportFile), format), {
    reportRoot,
    reportFile,
    projectRoot,
    syntax: format,
    skip,
  });
}
