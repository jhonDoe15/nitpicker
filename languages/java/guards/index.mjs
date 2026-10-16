import { readCpdFindings } from './cpd-duplicates.mjs';
import { readDependencyFindings } from './dependencies.mjs';
import { readForbiddenApiFindings } from './forbidden-apis.mjs';
import { readLintFindings } from './javac-lint.mjs';
import { liesInProject } from '../builds/module-path.mjs';

export function readGuardFindings({ reportRoot, projectRoot, manifest, module, locate }) {
  const findings = [
    ...readLintFindings(reportRoot, {
      projectRoot,
      sourceRoots: manifest.sourceRoots ?? [],
      module,
    }),
    ...readForbiddenApiFindings(reportRoot, { locate, projectRoot }),
    ...readCpdFindings(reportRoot, {
      projectRoot,
      sourceRoots: manifest.sourceRoots ?? [],
      testRoots: manifest.testSourceRoots ?? [],
      module,
    }),
    ...readDependencyFindings(reportRoot),
  ];
  return findings.filter((finding) => liesInProject(finding.path, module));
}
