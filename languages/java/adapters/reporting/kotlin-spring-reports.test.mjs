import { cpSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  kotlinFindings,
  projectWithKotlinReports,
  removeTemporaryProjects,
  rootReports,
} from './test-support/kotlin-report-project.mjs';

afterEach(removeTemporaryProjects);

const fixture = path.resolve(import.meta.dirname, '../fixtures/kotlin-spring');

function projectWithSyntax(manifest) {
  const root = projectWithKotlinReports({
    manifest: { kotlinSourceRoots: ['src/main/kotlin'], ...manifest },
  });
  cpSync(path.join(fixture, 'src'), path.join(root, 'src'), { recursive: true });
  cpSync(
    path.join(fixture, 'report/kotlin-syntax.json'),
    path.join(rootReports(root), 'kotlin-syntax.json'),
  );
  return root;
}

function countsByRule(findings) {
  const counts = {};
  for (const { rule } of findings) {
    counts[rule] = (counts[rule] ?? 0) + 1;
  }
  return counts;
}

describe('readJavaFindings with the kotlin preset: Spring rules', () => {
  it('reads the syntax report of a Spring project into enforceable spring findings', () => {
    const findings = kotlinFindings(projectWithSyntax({ spring: true }), 'spring');

    expect(countsByRule(findings)).toEqual({
      SpringConstructorInjection: 6,
      SpringImmutableBeans: 5,
      SpringNoServiceLocator: 5,
      SpringNoLazyInjection: 2,
      SpringLiteConfiguration: 2,
      SpringNoComponentScan: 2,
      SpringTypedConfiguration: 4,
      SpringProfileOnConfiguration: 2,
      SpringDataDerivedQuery: 2,
      SpringDataNativeQuery: 1,
      SpringDataModifyingQuery: 1,
      SpringDataNamedParameters: 1,
      SpringDataQueryTextBlock: 1,
      SpringDataNoSaveInLoop: 4,
      SpringDataNoFlush: 3,
      JpaLazyFetching: 2,
      JpaEntityClass: 2,
      JpaManyToManyCascade: 1,
      JpaManyToManySet: 1,
      JpaVersion: 2,
      JpaSequenceIds: 1,
      SpringProxyMethodVisibility: 4,
      SpringProxySelfCall: 2,
      SpringTransactionalAnnotation: 1,
      SpringNoTransactionalController: 2,
      SpringNoRequiresNew: 1,
      SpringNoSwallowedTransactionException: 1,
      SpringAsyncExecutor: 3,
      SpringScheduledFixedDelay: 1,
      SpringComposedMapping: 1,
      SpringRestController: 2,
      SpringValidRequestBody: 2,
      SpringNoCrossOrigin: 1,
      SpringPasswordEncoder: 2,
    });
    expect(new Set(findings.map(({ classification }) => classification))).toEqual(
      new Set(['enforceable']),
    );
  });

  it('reads no Spring rules when the build did not see Spring on the classpath', () => {
    expect(kotlinFindings(projectWithSyntax({}), 'spring')).toEqual([]);
  });
});
