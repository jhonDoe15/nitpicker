import {
  expectedOutput237_21,
  expectedOutput334_31,
  expectedOutput379_31,
  expectedOutput410_7,
  expectedOutput429_22,
  expectedOutput436_22,
  expectedOutput459_22,
  expectedOutput483_7,
} from '../../fixtures/expected-output/core-diff-quality-areas-diff-policy.mjs';
import { describe, expect, it } from 'vitest';
import vitestQualityConfig from '../../../../languages/typescript/preset/defaults/vitest.quality.config.ts';
import { configuredAnalyzers } from '../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { PACKAGE_ROOT, resolveTool } from '../../../tooling/tool-resolution.mjs';
import { runQualitySnapshot } from '../../../snapshot/run-snapshot.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../shared/policy.mjs';
import { runAnalyzers, selectAnalyzers } from '../../execution/run-analyzers.mjs';
import { planAnalyzerShards } from '../../sharding/sharding.mjs';
import {
  coverageFailureFindings,
  formatVitestFailures,
} from '../../../../languages/typescript/adapters/quality-areas/reporting/vitest.mjs';
import {
  normalizeBaselineExpansions,
  normalizeCoupling,
  normalizeDeadCode,
  normalizeTestRuntime,
} from '../../../../languages/typescript/adapters/quality-areas/reporting/repository.mjs';

const EXPECTED_ANALYZER_NAMES = [
  'eslint-lint',
  'eslint-errors',
  'eslint-logging',
  'eslint-module-effects',
  'entry-points',
  'prettier-format',
  'typescript-typecheck',
  'dependency-architecture',
  'policy-tests',
  'coding-standards',
  'coupling',
  'test-runtime',
  'structure',
  'duplicates',
  'dead-code',
  'coverage',
  'crap',
  'mutation',
];

describe('complete quality-area analyzer catalog', () => {
  it('runs the supported quality areas in the single-command catalog', () => {
    expect(configuredAnalyzers.map(({ name }) => name)).toEqual(
      EXPECTED_ANALYZER_NAMES.filter((name) => name !== 'policy-tests'),
    );
  });
  it('reports a resolved tool version for the single-command analyzers', () => {
    const prettier = configuredAnalyzers.find(({ name }) => name === 'prettier-format');
    const report = runQualitySnapshot({
      analyzers: [
        {
          ...prettier,
          createInvocation: () => ({
            command: process.execPath,
            args: ['-e', 'process.stdout.write(JSON.stringify({ findings: [] }))'],
            cwd: PACKAGE_ROOT,
          }),
        },
      ],
      projectRoot: PACKAGE_ROOT,
      liveProjectRoot: PACKAGE_ROOT,
    });

    expect(report.toolErrors).toEqual([]);
    expect(report.summary.tools[0].version).toBe(resolveTool('prettier').version);
    expect(report.summary.tools[0].version).not.toBe('unresolved');
  });
  it('resolves a real version for every analyzer', () => {
    for (const analyzer of configuredAnalyzers) {
      expect(analyzer.resolveVersion(PACKAGE_ROOT), analyzer.name).not.toBe('unresolved');
    }
  });
  it.each([['single-command', configuredAnalyzers]])(
    'runs coverage before CRAP when CRAP alone is selected in the %s dial',
    (_dial, analyzers) => {
      expect(selectAnalyzers(analyzers, ['crap']).map(({ name }) => name)).toEqual([
        'coverage',
        'crap',
      ]);
    },
  );
  it('skips CRAP, without a tool error of its own, when coverage reports failing tests', () => {
    const analyzer = (name, dependencies, report) => ({
      name,
      dependencies,
      version: '1.0.0',
      configurationHash: 'test',
      exclusions: [],
      createInvocation: () => ({
        command: process.execPath,
        args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(report))})`],
        cwd: new URL('../../', import.meta.url).pathname,
      }),
    });
    const testsFailed = {
      tool: 'coverage',
      rule: 'tests-failed',
      path: 'test/a.test.ts',
      identity: 'tests-failed',
      message: '1 test fails',
      classification: 'tool-error',
    };
    const result = runAnalyzers({
      analyzers: [
        analyzer('coverage', [], { findings: [testsFailed] }),
        analyzer('crap', ['coverage'], { findings: [] }),
      ],
      projectRoot: new URL('../../', import.meta.url).pathname,
      policyRoot: new URL('../../', import.meta.url).pathname,
      toolRoot: new URL('../../', import.meta.url).pathname,
      liveProjectRoot: PACKAGE_ROOT,
      snapshot: 'head',
    });

    expect([...result.reports.keys()]).toEqual(['coverage']);
    expect(result.toolErrors).toEqual([]);
    expect(result.skipped.get('crap')).toBe('coverage');
  });
  it.each([['differential', configuredAnalyzers]])(
    'configures expensive analyzer scheduling metadata in the %s dial',
    (dial, analyzers) => {
      const weights = Object.fromEntries(
        analyzers.map(({ name, concurrencyWeight = 1 }) => [name, concurrencyWeight]),
      );
      const priorities = Object.fromEntries(
        analyzers.map(({ name, executionPriority = 0 }) => [name, executionPriority]),
      );
      const eslintConcurrencyGroup =
        dial === 'differential' ? 'eslint-snapshot-dependencies' : undefined;

      expect(weights.coverage).toBe(2);
      expect(weights.mutation).toBe(2);
      expect(weights.crap).toBe(1);
      expect(weights['eslint-lint']).toBe(1);
      expect(priorities.coverage).toBe(1);
      expect(priorities.mutation).toBe(1);
      expect(
        Object.entries(priorities).filter(([, executionPriority]) => executionPriority !== 0),
      ).toEqual([
        ['coverage', 1],
        ['mutation', 1],
      ]);
      expect(
        analyzers
          .filter(({ name }) => name === 'coverage' || name === 'mutation')
          .map(({ concurrencyGroup }) => concurrencyGroup),
      ).toEqual(['test-execution', 'test-execution']);
      expect(
        analyzers
          .filter(({ name }) => name.startsWith('eslint-'))
          .map(({ concurrencyGroup }) => concurrencyGroup),
      ).toEqual(Array(4).fill(eslintConcurrencyGroup));
    },
  );
  it('bounds coverage worker processes independently of host CPU visibility', async () => {
    const config = await vitestQualityConfig({ command: 'serve', mode: 'test' });
    expect(config.test.maxWorkers).toBe(4);
  });
  it('names each failing test with its file and first assertion line', () => {
    const message = formatVitestFailures(
      {
        numFailedTests: 2,
        testResults: [
          {
            name: '/workspace/test/example.test.ts',
            assertionResults: [
              {
                fullName: 'example rejects invalid input',
                status: 'failed',
                failureMessages: ['AssertionError: expected 500 to be 400\n    at run (x.js:1:1)'],
              },
              { fullName: 'example passes', status: 'passed', failureMessages: [] },
              {
                fullName: 'example other',
                status: 'failed',
                failureMessages: ['\u001B[31mexpected [] to have a length of 1\u001B[39m'],
              },
            ],
          },
        ],
      },
      '/workspace',
    );

    expect(message).toBe(
      '2 tests fail, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
        '  test/example.test.ts > example rejects invalid input: AssertionError: expected 500 to be 400\n' +
        '  test/example.test.ts > example other: expected [] to have a length of 1',
    );
  });
  it('keeps the process output when Vitest fails without naming a test', () => {
    expect(() =>
      coverageFailureFindings(
        { analyzerName: 'coverage', projectRoot: '/p' },
        { numFailedTests: 0, testResults: [] },
        { status: 1, stdout: '', stderr: 'Unhandled Rejection: boom' },
      ),
    ).toThrow(
      /exited 1 without naming a failing test\nProcess output:\nUnhandled Rejection: boom/u,
    );
  });
  it('anchors the tool error inside the project even for a test file Vitest reports elsewhere', () => {
    const [finding] = coverageFailureFindings(
      { analyzerName: 'coverage', projectRoot: '/p' },
      {
        numFailedTests: 1,
        testResults: [
          {
            name: '/elsewhere/test/a.test.ts',
            assertionResults: [{ fullName: 'adds', status: 'failed', failureMessages: ['no'] }],
          },
        ],
      },
      { status: 1, stdout: '', stderr: '' },
    );

    expect(finding).toEqual(expectedOutput237_21());
    expect(finding.message).toBe(
      '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  /elsewhere/test/a.test.ts > adds: no',
    );
  });
  it('lists at most five failing tests and a test file that could not run', () => {
    const failing = (index) => ({
      fullName: `case ${String(index)}`,
      status: 'failed',
      failureMessages: ['boom'],
    });
    const message = formatVitestFailures(
      {
        numFailedTests: 7,
        testResults: [
          { name: '/p/test/a.test.ts', assertionResults: [1, 2, 3, 4, 5, 6].map(failing) },
          {
            name: '/p/test/broken.test.ts',
            status: 'failed',
            message: 'Failed to resolve import "./missing"',
            assertionResults: [],
          },
        ],
      },
      '/p',
    );

    expect(message).toBe(
      [
        '7 tests fail, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
        '  test/a.test.ts > case 1: boom',
        '  test/a.test.ts > case 2: boom',
        '  test/a.test.ts > case 3: boom',
        '  test/a.test.ts > case 4: boom',
        '  test/a.test.ts > case 5: boom',
        '  … and 2 more',
      ].join('\n'),
    );
  });
  it('plans three balanced CI shards with heavy dependency chains separated', () => {
    const shards = planAnalyzerShards(configuredAnalyzers, 3);
    const names = shards.map((shard) => shard.map(({ name }) => name));
    const weights = shards.map((shard) =>
      shard.reduce((total, { shardWeight }) => total + shardWeight, 0),
    );

    expect(names.findIndex((shard) => shard.includes('coverage'))).toBe(
      names.findIndex((shard) => shard.includes('crap')),
    );
    expect(names.findIndex((shard) => shard.includes('coverage'))).not.toBe(
      names.findIndex((shard) => shard.includes('mutation')),
    );
    // Balanced enough that no shard carries much more than its even share.
    const evenShare = weights.reduce((total, weight) => total + weight, 0) / weights.length;
    expect(Math.max(...weights)).toBeLessThanOrEqual(evenShare * 1.5);
  });
  it('requires a live project root before running analyzers', () => {
    expect(() =>
      runAnalyzers({
        analyzers: [],
        projectRoot: new URL('../../', import.meta.url).pathname,
        policyRoot: new URL('../../', import.meta.url).pathname,
        toolRoot: new URL('../../', import.meta.url).pathname,
        snapshot: 'head',
      }),
    ).toThrow('liveProjectRoot is required');
  });
  it('rejects invalid analyzer execution priority before invocation creation', () => {
    let invocationCreated = false;
    const result = runAnalyzers({
      analyzers: [
        {
          name: 'invalid-priority',
          version: '1.0.0',
          configurationHash: 'test',
          exclusions: [],
          executionPriority: -1,
          createInvocation() {
            invocationCreated = true;
            return { command: process.execPath, args: [] };
          },
        },
      ],
      projectRoot: new URL('../../', import.meta.url).pathname,
      policyRoot: new URL('../../', import.meta.url).pathname,
      toolRoot: new URL('../../', import.meta.url).pathname,
      liveProjectRoot: PACKAGE_ROOT,
      snapshot: 'head',
    });

    expect(invocationCreated).toBe(false);
    expect(result.toolErrors).toEqual(expectedOutput334_31());
  });
  it('does not run an analyzer after its dependency fails', () => {
    function createAnalyzer(name, dependencies, createInvocation) {
      return {
        name,
        dependencies,
        version: '1.0.0',
        configurationHash: 'test',
        exclusions: [],
        createInvocation,
      };
    }

    const result = runAnalyzers({
      analyzers: [
        createAnalyzer('coverage', [], () => ({
          command: process.execPath,
          args: ['--input-type=module', '-e', 'process.exit(2)'],
          cwd: new URL('../../', import.meta.url).pathname,
        })),
        createAnalyzer('crap', ['coverage'], () => ({
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            'process.stdout.write(JSON.stringify({ findings: [] }))',
          ],
          cwd: new URL('../../', import.meta.url).pathname,
        })),
      ],
      projectRoot: new URL('../../', import.meta.url).pathname,
      policyRoot: new URL('../../', import.meta.url).pathname,
      toolRoot: new URL('../../', import.meta.url).pathname,
      liveProjectRoot: PACKAGE_ROOT,
      snapshot: 'head',
    });

    expect(result.reports.size).toBe(0);
    expect(result.toolErrors).toEqual(expectedOutput379_31());
  });
  it.each([['differential', configuredAnalyzers]])(
    'passes the active CRAP limit to the %s dial',
    (_dial, analyzers) => {
      const analyzer = analyzers.find(({ name }) => name === 'crap');
      const invocation = analyzer.createInvocation({
        projectRoot: '/project',
        policyRoot: '/policy',
        toolRoot: '/tools',
        snapshot: 'head',
      });

      expect(invocation.args.slice(-2)).toEqual([
        '--crap-score-limit',
        String(DEFAULT_CRAP_SCORE_LIMIT),
      ]);
    },
  );
  it('reports coding-standard baseline growth as enforceable', () => {
    const site = {
      file: 'src/main/example.ts',
      rule: 'example-rule',
      source: 'example()',
      count: 2,
    };

    expect(
      normalizeBaselineExpansions([{ ...site, count: 1 }], [site], 'coding-standards'),
    ).toEqual(expectedOutput410_7());
    expect(normalizeBaselineExpansions([site], [site], 'coding-standards')).toEqual([]);
  });
  it('enforces new coupling stability-direction reversals', () => {
    const findings = normalizeCoupling(
      {
        stabilityDirection: [{ source: 'stable', target: 'volatile', delta: 0.5 }],
      },
      'coupling',
    );

    expect(findings).toEqual(expectedOutput429_22());
    expect(findings).toEqual(expectedOutput436_22());
  });
  it('enforces tests without a production runtime', () => {
    const findings = normalizeTestRuntime(
      {
        summary: {
          discoveredTests: 1,
          analyzedTests: 1,
          excludedTests: 0,
          findings: 1,
          categories: { 'no-production-runtime': 1 },
        },
        findings: [{ category: 'no-production-runtime', test: 'tests/orphan.test.ts' }],
      },
      'test-runtime',
    );

    expect(findings).toEqual(expectedOutput459_22());
  });
  it('enforces new unused files, exports, and types', () => {
    expect(
      normalizeDeadCode(
        {
          files: ['src/main/unused.ts'],
          issues: [
            {
              file: 'src/main/unused.ts',
              exports: [{ name: 'unusedValue', line: 4, col: 14 }],
              types: [{ name: 'UnusedType', line: 8, col: 13 }],
            },
          ],
        },
        'dead-code',
      ),
    ).toEqual(expectedOutput483_7());
  });
  it('tells which export to drop and why', () => {
    const messages = normalizeDeadCode(
      {
        files: ['src/main/orphan.ts'],
        issues: [
          {
            file: 'src/main/a.ts',
            types: [
              { name: 'Rejection', line: 1, col: 13 },
              { name: 'Local', line: 2, col: 13, usedInFile: true },
            ],
            exports: [{ name: 'helper', line: 5, col: 17 }],
            dependencies: [{ name: 'left-pad' }],
          },
        ],
      },
      'dead-code',
    ).map(({ message }) => message);

    expect(messages).toEqual([
      'Unused file: src/main/orphan.ts. Nothing imports it: delete it, or import it where it is needed.',
      'Exported type Rejection is never imported. Remove `export`, or the type if nothing uses it.',
      'Exported type Local is only used in its own file. Remove `export`.',
      'Export helper is never imported. Remove `export`, or the declaration if nothing uses it.',
      'dependencies: left-pad',
    ]);
  });
});
