import { describe, expect, it } from 'vitest';
import vitestQualityConfig from '../../preset/defaults/vitest.quality.config.ts';
import { applyThresholds, configuredAnalyzers } from '../../preset/diff/configured-analyzers.mjs';
import { PACKAGE_ROOT, resolveTool } from '../../adapters/tool-resolution.mjs';
import { runQualitySnapshot } from '../snapshot/run-snapshot.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT, hashFiles } from '../../preset/quality-checks.mjs';
import { compareFindings } from './compare.mjs';
import { runAnalyzers, selectAnalyzers } from './run-analyzers.mjs';
import { planAnalyzerShards } from './sharding.mjs';
import {
  formatVitestFailures,
  normalizeBaselineExpansions,
  normalizeCoupling,
  normalizeCoverage,
  normalizeCrap,
  normalizeDeadCode,
  normalizeDuplicates,
  normalizeMutation,
  normalizeStructure,
  normalizeTestRuntime,
  rebaseMutationConfig,
} from '../../adapters/diff/quality-areas-runner.mjs';

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

  it('reports failed Vitest assertions from the JSON report', () => {
    expect(
      formatVitestFailures({
        numFailedTests: 1,
        testResults: [
          {
            name: '/workspace/src/main/example.test.ts',
            assertionResults: [
              {
                fullName: 'example rejects invalid input',
                status: 'failed',
                failureMessages: ['expected 500 to be 400'],
              },
            ],
          },
        ],
      }),
    ).toBe(
      '1 test failed:\n' +
        '/workspace/src/main/example.test.ts > example rejects invalid input\n' +
        'expected 500 to be 400',
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
        projectRoot: import.meta.dirname,
        policyRoot: import.meta.dirname,
        toolRoot: import.meta.dirname,
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
      projectRoot: import.meta.dirname,
      policyRoot: import.meta.dirname,
      toolRoot: import.meta.dirname,
      liveProjectRoot: PACKAGE_ROOT,
      snapshot: 'head',
    });

    expect(invocationCreated).toBe(false);
    expect(result.toolErrors).toEqual([
      expect.objectContaining({
        tool: 'invalid-priority',
        message: expect.stringContaining('executionPriority must be a non-negative safe integer'),
      }),
    ]);
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
          cwd: import.meta.dirname,
        })),
        createAnalyzer('crap', ['coverage'], () => ({
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            'process.stdout.write(JSON.stringify({ findings: [] }))',
          ],
          cwd: import.meta.dirname,
        })),
      ],
      projectRoot: import.meta.dirname,
      policyRoot: import.meta.dirname,
      toolRoot: import.meta.dirname,
      liveProjectRoot: PACKAGE_ROOT,
      snapshot: 'head',
    });

    expect(result.reports.size).toBe(0);
    expect(result.toolErrors).toEqual([
      expect.objectContaining({ tool: 'coverage' }),
      expect.objectContaining({
        tool: 'crap',
        message: expect.stringContaining('dependency coverage failed'),
      }),
    ]);
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
    ).toEqual([
      expect.objectContaining({
        tool: 'coding-standards',
        rule: 'baseline-expansion',
        path: 'src/main/example.ts',
        classification: 'enforceable',
      }),
    ]);
    expect(normalizeBaselineExpansions([site], [site], 'coding-standards')).toEqual([]);
  });

  it('enforces new coupling stability-direction reversals', () => {
    const findings = normalizeCoupling(
      {
        stabilityDirection: [{ source: 'stable', target: 'volatile', delta: 0.5 }],
      },
      'coupling',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'stability-direction',
        identity: 'package-edge:stable->volatile',
        classification: 'enforceable',
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'stability-direction-metric',
        metric: { name: 'instabilityDelta', value: 0.5 },
      }),
    );
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

    expect(findings).toContainEqual(
      expect.objectContaining({
        path: 'tests/orphan.test.ts',
        rule: 'no-production-runtime',
        classification: 'enforceable',
      }),
    );
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
    ).toEqual([
      expect.objectContaining({
        path: 'src/main/unused.ts',
        rule: 'files',
        classification: 'enforceable',
      }),
      expect.objectContaining({
        path: 'src/main/unused.ts',
        rule: 'exports',
        classification: 'enforceable',
        location: { line: 4, column: 14 },
      }),
      expect.objectContaining({
        path: 'src/main/unused.ts',
        rule: 'types',
        classification: 'enforceable',
        location: { line: 8, column: 13 },
      }),
    ]);
  });

  it('keys unused exports by their declaration, not by the whole file', () => {
    const report = (sourceHash) => ({
      issues: [{ file: 'src/a.ts', exports: [{ name: 'unused', line: 3, col: 1, sourceHash }] }],
    });
    const [before] = normalizeDeadCode(report('declaration'), 'dead-code');
    const [after] = normalizeDeadCode(report('declaration'), 'dead-code');
    const [edited] = normalizeDeadCode(report('edited-declaration'), 'dead-code');

    expect(after.identity).toBe(before.identity);
    expect(edited.identity).not.toBe(before.identity);
  });

  it('normalizes duplicate clone size as descriptive metrics', () => {
    const findings = normalizeDuplicates(
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
      ['src/main'],
    );

    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'duplicate-clone',
        classification: 'enforceable',
      }),
      expect.objectContaining({
        path: 'src/main/a.ts',
        metric: { name: 'lines', value: 10 },
      }),
      expect.objectContaining({
        path: 'src/main/a.ts',
        metric: { name: 'tokens', value: 30 },
      }),
    ]);
  });

  it('keeps canonical duplicate paths and locations aligned', () => {
    const findings = normalizeDuplicates(
      {
        duplicates: [
          {
            firstFile: { name: 'src/main/z.ts', start: 2 },
            secondFile: { name: 'src/main/a.ts', start: 7 },
            lines: 10,
            tokens: 30,
          },
        ],
      },
      'duplicates',
      ['src/main'],
    );

    expect(findings).toEqual([
      expect.objectContaining({
        path: 'src/main/a.ts',
        location: { line: 7 },
      }),
      expect.objectContaining({
        path: 'src/main/a.ts',
        location: { line: 7 },
      }),
      expect.objectContaining({
        path: 'src/main/a.ts',
        location: { line: 7 },
      }),
    ]);
  });

  it('enforces 95% branch coverage and reports coverage per test', () => {
    const findings = normalizeCoverage(
      {
        '/project/src/main/value.ts': {
          branchSourceHashes: { 0: 'branch-source' },
          b: { 0: [1, 0] },
        },
      },
      'coverage',
      '/project',
      { testCount: 2 },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'changed-branch-coverage',
        classification: 'enforceable',
      }),
    );
    expect(findings.map(({ metric }) => metric).filter(Boolean)).toEqual([
      { name: 'branches', value: 50 },
      { name: 'coveredBranchesPerTest', value: 0.5 },
      { name: 'testCount', value: 2 },
    ]);
  });

  it('accepts exactly 95% branch coverage', () => {
    const findings = normalizeCoverage(
      {
        '/project/src/main/value.ts': {
          branchSourceHashes: { 0: 'branch-source' },
          b: { 0: [...Array(19).fill(1), 0] },
        },
      },
      'coverage',
      '/project',
    );

    expect(findings).not.toContainEqual(
      expect.objectContaining({ rule: 'changed-branch-coverage' }),
    );
  });

  it('reactivates only the below-threshold branch whose source changes', () => {
    function coverageFindingsFor(secondBranchSourceHash) {
      return normalizeCoverage(
        {
          '/project/src/main/value.ts': {
            branchSourceHashes: {
              0: 'unchanged-branch',
              1: secondBranchSourceHash,
            },
            b: {
              0: [1, 0],
              1: [1, 0],
            },
          },
        },
        'coverage',
        '/project',
      );
    }
    const base = coverageFindingsFor('changed-branch-before');

    expect(
      compareFindings({
        baseFindings: base,
        headFindings: coverageFindingsFor('changed-branch-before'),
      }).newFindings,
    ).toEqual([]);
    const comparison = compareFindings({
      baseFindings: base,
      headFindings: coverageFindingsFor('changed-branch-after'),
    });
    expect(comparison.newFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'changed-branch-coverage',
          identity: expect.stringContaining('changed-branch-after'),
          classification: 'enforceable',
        }),
      ]),
    );
    expect(
      comparison.newFindings.filter(({ rule }) => rule === 'changed-branch-coverage'),
    ).toHaveLength(1);
  });

  it('reports surviving mutants and status totals without gating on score', () => {
    const findings = normalizeMutation(
      {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Killed',
                mutatorName: 'ArithmeticOperator',
                replacement: '-',
                location: { start: { line: 2, column: 3 } },
              },
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line: 4, column: 5 } },
              },
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
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        path: 'src/main/value.ts',
        rule: 'mutant-survived',
        classification: 'enforceable',
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ metric: { name: 'Killed', value: 1 } }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ metric: { name: 'Survived', value: 2 } }),
    );
    const survivingMutants = findings.filter(({ rule }) => rule === 'mutant-survived');
    expect(new Set(survivingMutants.map(({ identity }) => identity)).size).toBe(2);
  });

  it('keeps mutant identities stable when source positions move', () => {
    function reportAt(line) {
      return {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line, column: 5 } },
              },
            ],
          },
        },
      };
    }

    const before = normalizeMutation(reportAt(4), 'mutation');
    const after = normalizeMutation(reportAt(40), 'mutation');

    expect(before.find(({ rule }) => rule === 'mutant-survived')?.identity).toBe(
      after.find(({ rule }) => rule === 'mutant-survived')?.identity,
    );
  });

  it('assigns repeated CRAP symbols by source order instead of report rank', () => {
    function functionEntry(line, crap) {
      return {
        source: 'src/main/value.ts',
        function: 'constructor',
        lines: { start: line, end: line + 2 },
        complexity: 1,
        statementCoverage: { percent: 100 },
        branchCoverage: { percent: 100 },
        effectiveCoverage: { percent: 100 },
        crap,
      };
    }

    const first = normalizeCrap(
      { functions: [functionEntry(40, 10), functionEntry(10, 1)] },
      'crap',
    );
    const second = normalizeCrap(
      { functions: [functionEntry(10, 20), functionEntry(40, 2)] },
      'crap',
    );
    function identityAt(findings, line) {
      return findings.find(
        ({ rule, metric, location }) =>
          rule === 'function-crap' && metric.name === 'complexity' && location.line === line,
      )?.identity;
    }

    expect(identityAt(first, 10)).toBe(identityAt(second, 10));
    expect(identityAt(first, 40)).toBe(identityAt(second, 40));
  });

  it('enforces CRAP scores at 9 or higher and unknown coverage', () => {
    function functionEntry(crap, sourceHash) {
      return {
        source: 'src/main/value.ts',
        function: 'value',
        sourceHash,
        lines: { start: 1, end: 3 },
        complexity: 1,
        statementCoverage: { percent: crap === null ? null : 100 },
        branchCoverage: { percent: crap === null ? null : 100 },
        effectiveCoverage: { percent: crap === null ? null : 100 },
        crap,
      };
    }

    expect(normalizeCrap({ functions: [functionEntry(8.99, 'safe')] }, 'crap')).not.toContainEqual(
      expect.objectContaining({ classification: 'enforceable' }),
    );
    expect(normalizeCrap({ functions: [functionEntry(9, 'limit')] }, 'crap')).toContainEqual(
      expect.objectContaining({
        rule: 'crap-score-limit',
        classification: 'enforceable',
      }),
    );
    expect(normalizeCrap({ functions: [functionEntry(null, 'unknown')] }, 'crap')).toContainEqual(
      expect.objectContaining({
        rule: 'crap-coverage-unknown',
        classification: 'enforceable',
      }),
    );
    expect(
      normalizeCrap({ functions: [functionEntry(undefined, 'missing')] }, 'crap'),
    ).toContainEqual(
      expect.objectContaining({
        rule: 'crap-coverage-unknown',
        classification: 'enforceable',
      }),
    );
  });

  it('uses 9 by default and takes an explicit CRAP limit from the config thresholds', () => {
    expect(DEFAULT_CRAP_SCORE_LIMIT).toBe(9);
    const [configured] = applyThresholds(
      configuredAnalyzers.filter(({ name }) => name === 'crap'),
      { crapLimit: 12 },
    );
    const invocation = configured.createInvocation({
      projectRoot: '/project',
      policyRoot: '/policy',
      toolRoot: '/tools',
      snapshot: 'head',
    });
    expect(invocation.args.slice(-2)).toEqual(['--crap-score-limit', '12']);
    const defaultCrap = configuredAnalyzers.find(({ name }) => name === 'crap');
    expect(configured.configurationHash).not.toBe(defaultCrap.configurationHash);
    expect(typeof configured.resolveVersion).toBe('function');
  });

  it('includes the active CRAP limit in the configuration hash', () => {
    expect(hashFiles(['preset/defaults/crap.config.mjs'], ['--crap-score-limit', '9'])).not.toBe(
      hashFiles(['preset/defaults/crap.config.mjs'], ['--crap-score-limit', '12']),
    );
  });

  it('allows CRAP scores to vary below an explicit limit', () => {
    function functionEntry(crap) {
      return {
        source: 'src/main/value.ts',
        function: 'value',
        sourceHash: 'changed',
        lines: { start: 1, end: 3 },
        complexity: 2,
        statementCoverage: { percent: 100 },
        branchCoverage: { percent: 100 },
        effectiveCoverage: { percent: 100 },
        crap,
      };
    }

    const baseFindings = normalizeCrap({ functions: [functionEntry(10)] }, 'crap', {
      scoreLimit: 12,
    });
    const headFindings = normalizeCrap({ functions: [functionEntry(11.99)] }, 'crap', {
      scoreLimit: 12,
    });
    expect(compareFindings({ baseFindings, headFindings }).newFindings).toEqual([]);
    expect(
      normalizeCrap({ functions: [functionEntry(12)] }, 'crap', {
        scoreLimit: 12,
      }),
    ).toContainEqual(
      expect.objectContaining({
        rule: 'crap-score-limit',
        classification: 'enforceable',
      }),
    );
  });

  it('reactivates excessive CRAP only when the function source changes', () => {
    function crapFindingsFor(sourceHash) {
      return normalizeCrap(
        {
          functions: [
            {
              source: 'src/main/value.ts',
              function: 'value',
              sourceHash,
              lines: { start: 1, end: 3 },
              complexity: 9,
              statementCoverage: { percent: 100 },
              branchCoverage: { percent: 100 },
              effectiveCoverage: { percent: 100 },
              crap: 9,
            },
          ],
        },
        'crap',
      );
    }
    const base = crapFindingsFor('base');

    expect(
      compareFindings({
        baseFindings: base,
        headFindings: crapFindingsFor('base'),
      }).newFindings,
    ).toEqual([]);
    expect(
      compareFindings({
        baseFindings: base,
        headFindings: crapFindingsFor('changed'),
      }).newFindings,
    ).toContainEqual(
      expect.objectContaining({
        rule: 'crap-score-limit',
        classification: 'enforceable',
      }),
    );
  });

  it('enforces oversized or deeply nested changed functions', () => {
    const findings = normalizeStructure(
      {
        functions: [
          {
            source: 'src/main/value.ts',
            function: 'value',
            sourceHash: 'changed-function',
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
    );

    expect(
      findings
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ rule }) => rule),
    ).toEqual([
      'function-lines-limit',
      'function-statements-limit',
      'function-control-nesting-limit',
      'function-parameters-limit',
    ]);
  });

  it('keeps anonymous structure identities stable when preceding lines move', () => {
    function findingsAt(start) {
      return normalizeStructure(
        {
          functions: [
            {
              source: 'src/main/callbacks.ts',
              function: '<anonymous>',
              sourceHash: 'unchanged-callback',
              start,
              end: start + 50,
              lines: 51,
              statements: 1,
              maxControlNesting: 0,
              parameters: 0,
            },
          ],
        },
        'structure',
      );
    }

    const comparison = compareFindings({
      baseFindings: findingsAt(10),
      headFindings: findingsAt(11),
    });

    expect(comparison.newFindings).toEqual([]);
    expect(comparison.resolvedFindings).toEqual([]);
  });

  it('rebases mutation companion configs into the analyzed snapshot', () => {
    expect(
      rebaseMutationConfig(
        {
          tsconfigFile: 'tsconfig.stryker.json',
          vitest: { configFile: 'stryker.vitest.config.ts', related: false },
        },
        {
          tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
          vitestConfigFile: '.nitpicker-diff-stryker.vitest.config.ts',
        },
      ),
    ).toEqual({
      tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
      vitest: {
        configFile: '.nitpicker-diff-stryker.vitest.config.ts',
        related: false,
      },
    });
  });
});
