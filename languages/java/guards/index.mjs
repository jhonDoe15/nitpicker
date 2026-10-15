import { readCpdFindings } from './cpd-duplicates.mjs';
import { readDependencyFindings } from './dependencies.mjs';
import { readForbiddenApiFindings } from './forbidden-apis.mjs';
import { readLintFindings } from './javac-lint.mjs';

export function readGuardFindings({ reportRoot, projectRoot, manifest, locate }) {
  return [
    ...readLintFindings(reportRoot, { projectRoot }),
    ...readForbiddenApiFindings(reportRoot, { locate }),
    ...readCpdFindings(reportRoot, { projectRoot, testRoots: manifest.testSourceRoots ?? [] }),
    ...readDependencyFindings(reportRoot),
  ];
}
