import { normalizeArchitectureViolations } from '../../../../languages/typescript/adapters/static-checks-runner.mts';
import {
  normalizeCoupling,
  normalizeStructure,
  normalizeTestRuntime,
} from '../../../../languages/typescript/adapters/quality-areas/reporting/repository.mts';
import { normalizeDeadCode } from '../../../../languages/typescript/adapters/quality-areas/reporting/dead-code.mts';
import {
  normalizeCrap,
  normalizeMutation,
} from '../../../../languages/typescript/adapters/quality-areas/reporting/tests.mts';
import { normalizeDuplicates as normalizeDuplicatesJs } from '../../../../languages/typescript/preset/duplicates/normalize.mjs';
import { toEntryPointDiffFindings as toEntryPointDiffFindingsJs } from '../../../../languages/typescript/adapters/entry-points.mjs';
import type { Finding } from '../../../../shared/values/findings.mts';

const normalizeDuplicates: (
  report: unknown,
  analyzerName: string,
  options: { readonly configuredPaths: string[] },
) => Finding[] = normalizeDuplicatesJs;
const toEntryPointDiffFindings: (report: unknown) => Finding[] = toEntryPointDiffFindingsJs;

const MODULE_A = 'src/main/a.ts';

function crapEntry(crap?: number) {
  return {
    source: 'src/main/value.ts',
    function: 'value',
    sourceHash: 'h',
    lines: { start: 1, end: 3 },
    complexity: 1,
    statementCoverage: { percent: 100 },
    branchCoverage: { percent: 100 },
    effectiveCoverage: { percent: 100 },
    ...(crap === undefined ? {} : { crap }),
  };
}

export function sampleFindings(): Finding[] {
  return [
    ...normalizeCoupling(
      {
        summary: { modules: 2 },
        modules: [{ source: MODULE_A, fanIn: 1, fanOut: 2 }],
        stabilityDirection: [{ source: 'stable', target: 'volatile', delta: 0.5 }],
      },
      'coupling',
      [],
    ),
    ...normalizeTestRuntime(
      {
        summary: { discoveredTests: 1, categories: { 'no-production-runtime': 1 } },
        findings: [{ category: 'no-production-runtime', test: 'tests/orphan.test.ts' }],
      },
      'test-runtime',
    ),
    ...normalizeStructure(
      {
        functions: [
          {
            source: 'src/main/value.ts',
            function: 'value',
            sourceHash: 'f',
            start: 1,
            end: 51,
            lines: 51,
            statements: 16,
            maxControlNesting: 3,
            parameters: 4,
          },
        ],
      },
      'structure',
    ),
    ...normalizeDuplicates(
      {
        duplicates: [
          {
            firstFile: { name: 'a.ts', start: 2 },
            secondFile: { name: 'b.ts', start: 7 },
            lines: 10,
            tokens: 30,
          },
        ],
      },
      'duplicates',
      { configuredPaths: ['src/main'] },
    ),
    ...normalizeDeadCode(
      {
        files: ['src/main/unused.ts'],
        issues: [{ file: 'src/main/unused.ts', exports: [{ name: 'x', line: 4, col: 14 }] }],
      },
      'dead-code',
    ),
    ...normalizeCrap({ functions: [crapEntry(10), crapEntry()] }, 'crap'),
    ...normalizeMutation(
      {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line: 4, column: 5 } },
              },
            ],
          },
        },
      },
      'mutation',
    ),
    ...normalizeArchitectureViolations(
      {
        summary: {
          violations: [
            {
              type: 'cycle',
              from: MODULE_A,
              to: 'src/main/b.ts',
              rule: { name: 'no-production-cycles', severity: 'error' },
              cycle: [{ name: MODULE_A }, { name: 'src/main/b.ts' }],
            },
            {
              from: MODULE_A,
              to: 'src/main/c.ts',
              rule: { name: 'no-orphans', severity: 'warn' },
            },
          ],
        },
      },
      'dependency-architecture',
    ),
    ...toEntryPointDiffFindings({
      publicAlternativeBypasses: [
        {
          source: 'src/main/alpha/consumer.ts',
          target: 'src/main/beta/internal.ts',
          publicEntryPoint: 'src/main/beta/index.ts',
          dependencyKind: 'runtime',
        },
      ],
    }),
  ];
}
