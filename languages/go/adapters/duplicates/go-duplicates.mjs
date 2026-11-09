import { readFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdClones } from '../../../../core/tooling/jscpd/jscpd-clones.mjs';
import { withoutImportOnlyClones } from '../../../../core/tooling/jscpd/import-only.mjs';
import { DUPLICATES_REPORT, runJscpd } from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import {
  GO_DUPLICATE_GLOBS,
  GO_SKIPPED_FOLDERS,
  skippedFolderGlobs,
} from '../../../../core/tooling/jscpd/skipped-folders.mjs';
import { duplicateFindings } from '../../../java/adapters/metrics/java-duplicates.mjs';
import { readInspect } from '../structure/go-inspect.mjs';

const SYNTAX = 'go';

function goDuplicateIgnores(report, skippedFolders = GO_SKIPPED_FOLDERS) {
  return [
    ...skippedFolderGlobs(skippedFolders),
    ...GO_DUPLICATE_GLOBS,
    ...report.skipped.map((folder) => `${folder}/**`),
    ...report.files.filter(({ generated }) => generated).map(({ path: file }) => file),
  ];
}

export function duplicates(context) {
  const report = readInspect(context.reportRoot);
  const files = report.files.filter(({ test, generated }) => !(test || generated));
  try {
    runJscpd({
      cwd: context.projectRoot,
      roots: files.length === 0 ? [] : ['.'],
      format: SYNTAX,
      ignore: goDuplicateIgnores(report, context.duplicateSkippedFolders),
      reportRoot: context.reportRoot,
      together: true,
      renamed: { syntax: SYNTAX, files: files.map(({ path: file }) => file) },
    });
  } catch (error) {
    throw Object.assign(new Error(error.message, { cause: error }), { rule: 'duplicates-failed' });
  }
}

export function readGoDuplicateFindings(reportRoot, projectRoot) {
  const { runs } = JSON.parse(readFileSync(path.join(reportRoot, DUPLICATES_REPORT), 'utf8'));
  const clones = runs.flatMap(({ root, report }) => jscpdClones(report, [root]));
  return duplicateFindings(withoutImportOnlyClones(clones, SYNTAX), {
    reportRoot,
    reportFile: DUPLICATES_REPORT,
    projectRoot,
    syntax: SYNTAX,
  });
}
