import { existsSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { sourceFilesUnder } from '../../../../shared/renamed-clones/files.mjs';
import { JSCPD_IGNORE, readDuplicateFindings, runJscpd } from '../metrics/java-duplicates.mjs';

const KOTLIN_DUPLICATES = {
  format: 'kotlin',
  rootsKey: 'kotlinSourceRoots',
  reportFile: 'kotlin-duplicates.json',
};
const KOTLIN_EXTENSIONS = ['.kt', '.kts'];

export function runKotlinDuplicates(projectRoot, { reportRoot, manifest }) {
  const roots = (manifest[KOTLIN_DUPLICATES.rootsKey] ?? []).filter((root) =>
    existsSync(path.resolve(projectRoot, root)),
  );
  runJscpd({
    cwd: projectRoot,
    roots,
    format: KOTLIN_DUPLICATES.format,
    ignore: JSCPD_IGNORE,
    reportRoot,
    reportFile: KOTLIN_DUPLICATES.reportFile,
    renamed: {
      syntax: 'kotlin',
      files: sourceFilesUnder(projectRoot, roots, KOTLIN_EXTENSIONS),
    },
  });
}

function withExceptionRoute(finding) {
  return finding.classification === 'enforceable'
    ? {
        ...finding,
        message: `${finding.message} ${exceptionHint(`${finding.tool}/${finding.rule}`, finding.path)}`,
      }
    : finding;
}

export function readKotlinDuplicateFindings(reportRoot, projectRoot) {
  return existsSync(path.resolve(reportRoot, KOTLIN_DUPLICATES.reportFile))
    ? readDuplicateFindings(reportRoot, KOTLIN_DUPLICATES.reportFile, {
        projectRoot,
        syntax: 'kotlin',
      }).map(withExceptionRoute)
    : [];
}
