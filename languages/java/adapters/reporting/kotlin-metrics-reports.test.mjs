import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { readJavaFindings } from './java-reports.mjs';
import {
  projectWithKotlinReports,
  removeTemporaryProjects,
  temporaryProjectRoot,
} from './kotlin-report-project.mjs';

afterEach(removeTemporaryProjects);

describe('readJavaFindings with the kotlin preset: metrics and errors', () => {
  const bad = 'src/main/kotlin/demo/Bad.kt';
  it('turns the Kotlin metrics and clones into structure, CRAP and duplicate findings', () => {
    const root = projectWithKotlinReports();
    const reports = path.join(root, 'build/nitpicker');
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
      path.join(reports, 'kotlin-duplicates.json'),
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
  it('fails when the project does not apply the Kotlin plugin', () => {
    const root = projectWithKotlinReports({ manifest: { kotlin: undefined } });

    expect(() => readJavaFindings(root, { preset: 'kotlin' })).toThrow(
      'applies org.jetbrains.kotlin.jvm',
    );
  });
  it.each(['kotlin', 'java'])(
    'fails with a clear error when the root project wrote no reports (preset %s)',
    (preset) => {
      const root = temporaryProjectRoot();

      expect(() => readJavaFindings(root, { preset })).toThrow(
        `The ${preset} preset found no Gradle reports in build/nitpicker: the root project must apply the`,
      );
    },
  );
});
