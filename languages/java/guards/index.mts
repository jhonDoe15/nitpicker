import { readCpdFindings } from './cpd-duplicates.mjs';
import { readDependencyFindings } from './dependencies.mjs';
import { readForbiddenApiFindings } from './forbidden-apis.mjs';
import { readLintFindings } from './javac-lint.mjs';
import { liesInProject } from '../builds/module-path.mjs';
import { fieldOf, listOf, textsOf } from '../../../shared/values/readers.mts';
import { callUntyped } from '../adapters/typed/java-values.mts';

type GuardReports = Readonly<Record<string, unknown>> & {
  readonly reportRoot: string;
  readonly projectRoot: string;
  readonly manifest: unknown;
  readonly module?: unknown;
  readonly locate: unknown;
};

export function readGuardFindings(reports: GuardReports): unknown[] {
  const { reportRoot, projectRoot, manifest, module, locate } = reports;
  const sourceRoots = textsOf(fieldOf(manifest, 'sourceRoots'));
  const findings: readonly unknown[] = [
    ...listOf(callUntyped(readLintFindings, reportRoot, { projectRoot, sourceRoots, module })),
    ...listOf(readForbiddenApiFindings(reportRoot, { locate, projectRoot })),
    ...listOf(
      callUntyped(readCpdFindings, reportRoot, {
        projectRoot,
        sourceRoots,
        testRoots: textsOf(fieldOf(manifest, 'testSourceRoots')),
        module,
      }),
    ),
    ...listOf(readDependencyFindings(reportRoot)),
  ];
  return findings.filter(
    (finding) => callUntyped(liesInProject, fieldOf(finding, 'path'), module) === true,
  );
}
