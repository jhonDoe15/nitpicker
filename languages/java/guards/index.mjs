import { readCpdFindings } from './cpd-duplicates.mjs';
import { readDependencyFindings } from './dependencies.mjs';
import { readForbiddenApiFindings } from './forbidden-apis.mjs';
import { readLintFindings } from './javac-lint.mjs';

export function readGuardFindings(context) {
  const { reportRoot, jscpdRoot, projectRoot, manifest, moduleDir, locate } = context;
  return [
    ...readLintFindings(reportRoot, {
      projectRoot,
      sourceRoots: manifest.sourceRoots ?? [],
      moduleDir,
    }),
    ...readForbiddenApiFindings(reportRoot, { locate, projectRoot }),
    ...readCpdFindings(reportRoot, {
      projectRoot,
      sourceRoots: manifest.sourceRoots ?? [],
      testRoots: manifest.testSourceRoots ?? [],
      moduleDir,
      jscpdRoot,
    }),
    ...readDependencyFindings(reportRoot),
  ];
}
