import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import {
  file as reviewFile,
  klass as reviewClass,
  routeOf,
  wait as reviewWait,
} from '../kotlin/review-rules/test-support/facts.mjs';
import {
  readJavaFindings,
  rootReports,
  reportBaseOf,
  projectWithKotlinReports,
  removeTemporaryProjects,
  temporaryProjectRoot,
} from './test-support/kotlin-report-project.mjs';

afterEach(removeTemporaryProjects);

describe('readJavaFindings with the kotlin preset: metrics and errors', () => {
  const bad = 'src/main/kotlin/demo/Bad.kt';
  it('turns the Kotlin metrics and clones into structure, CRAP and duplicate findings', () => {
    const root = projectWithKotlinReports();
    const reports = rootReports(root);
    writeFileSync(
      path.join(reports, 'kotlin-metrics.json'),
      JSON.stringify({
        functions: [
          {
            file: bad,
            name: 'Bad.compute',
            start: 6,
            end: 10,
            lines: 5,
            statements: 3,
            maxControlNesting: 1,
            parameters: 4,
            complexity: 3,
          },
        ],
        files: [{ file: bad, package: 'demo', classes: ['demo.Bad'] }],
      }),
    );
    writeFileSync(
      path.join(reportBaseOf(root), 'kotlin-duplicates.json'),
      JSON.stringify({
        runs: [
          {
            root: 'src/main/kotlin',
            report: {
              duplicates: [
                {
                  firstFile: { name: 'demo/Bad.kt', start: 3 },
                  secondFile: { name: 'demo/Other.kt', start: 3 },
                  fragment: 'x',
                  lines: 8,
                  tokens: 90,
                },
              ],
            },
          },
        ],
      }),
    );

    const { findings } = readJavaFindings(root, { preset: 'kotlin' });
    const enforceable = findings.filter(
      ({ tool, classification }) =>
        ['structure', 'crap', 'duplicates'].includes(tool) && classification === 'enforceable',
    );

    expect(enforceable.map(({ tool, rule, path: file }) => [tool, rule, file])).toEqual([
      ['structure', 'function-parameters-limit', bad],
      ['crap', 'crap-score-limit', bad],
      ['duplicates', 'duplicate-clone', bad],
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'kotlin')).not.toThrow();
  });
  it('reads no Kotlin metrics or clones from a report without them, as the java preset does', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });

    expect(
      findings.filter(({ tool }) => ['structure', 'crap', 'duplicates'].includes(tool)),
    ).toEqual([]);
  });
  it('turns the Kotlin review facts into findings with the rules of the Java preset', () => {
    const root = projectWithKotlinReports();
    const reports = rootReports(root);
    const testFile = 'src/test/kotlin/demo/WaitTest.kt';
    writeFileSync(
      path.join(reports, 'kotlin-facts.json'),
      JSON.stringify({
        files: [
          reviewFile({
            file: testFile,
            test: true,
            classes: [reviewClass('WaitTest')],
            waits: [reviewWait('sleep')],
          }),
        ],
      }),
    );

    const { findings } = readJavaFindings(root, { preset: 'kotlin' });
    const review = findings.filter(({ tool }) => tool === 'pmd');

    expect(review.map(({ rule, path: file }) => [rule, file])).toEqual([
      ['FixedSleepInTest', testFile],
    ]);
    expect(routeOf(review[0].message)).toBe(
      'add an exception for pmd/FixedSleepInTest in nitpicker.config.json.',
    );
    expect(() => parseAnalyzerReport({ findings }, 'kotlin')).not.toThrow();
  });
  it('fails when the project does not apply the Kotlin plugin', () => {
    const root = projectWithKotlinReports({ manifest: { kotlin: undefined } });

    expect(() => readJavaFindings(root, { preset: 'kotlin' })).toThrow(
      'The kotlin preset needs a project that applies the Kotlin plugin (org.jetbrains.kotlin.jvm for Gradle, kotlin-maven-plugin for Maven); this one does not',
    );
  });
  it.each(['kotlin', 'java'])(
    'fails with a clear error when the root project wrote no reports (preset %s)',
    (preset) => {
      const root = temporaryProjectRoot();

      expect(() => readJavaFindings(root, { preset })).toThrow(
        `The ${preset} preset found no Gradle project that applies the`,
      );
    },
  );
});
