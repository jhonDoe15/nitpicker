import { describe, expect, it } from 'vitest';
import vitestQualityConfig from '../../../../../languages/typescript/preset/defaults/vitest.quality.config.ts';
import { configuredAnalyzers } from '../../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { PACKAGE_ROOT, resolveTool } from '../../../../tooling/tool-resolution.mjs';
import { runQualitySnapshot } from '../../../../snapshot/run-snapshot.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../../shared/policy.mjs';
import { runAnalyzers, selectAnalyzers } from '../../../execution/run-analyzers.mjs';
import { planAnalyzerShards } from '../../../sharding/sharding.mjs';
import { fileURLToPath } from 'node:url';

const packageAnalyzers = configuredAnalyzers();
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
  'test-console',
  'crap',
  'mutation',
];

describe('quality-area analyzer catalog', () => {
  it('runs the supported quality areas in the single-command catalog', () => {
    expect(packageAnalyzers.map(({ name }) => name)).toEqual(
      EXPECTED_ANALYZER_NAMES.filter((name) => name !== 'policy-tests'),
    );
  });
  it('reports a resolved tool version for the single-command analyzers', () => {
    const prettier = packageAnalyzers.find(({ name }) => name === 'prettier-format');
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
    for (const analyzer of packageAnalyzers) {
      expect(analyzer.resolveVersion(PACKAGE_ROOT), analyzer.name).not.toBe('unresolved');
    }
  });
  it.each([['single-command', packageAnalyzers]])(
    'runs coverage before CRAP when CRAP alone is selected in the %s dial',
    (_dial, analyzers) => {
      expect(selectAnalyzers(analyzers, ['crap']).map(({ name }) => name)).toEqual([
        'coverage',
        'crap',
      ]);
    },
  );
  it.each([['differential', packageAnalyzers]])(
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
  it('plans three balanced CI shards with heavy dependency chains separated', () => {
    const shards = planAnalyzerShards(packageAnalyzers, 3);
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
    const evenShare = weights.reduce((total, weight) => total + weight, 0) / weights.length;
    expect(Math.max(...weights)).toBeLessThanOrEqual(evenShare * 1.5);
  });
  it('requires a live project root before running analyzers', () => {
    expect(() =>
      runAnalyzers({
        analyzers: [],
        projectRoot: fileURLToPath(new URL('../../../', import.meta.url)),
        policyRoot: fileURLToPath(new URL('../../../', import.meta.url)),
        toolRoot: fileURLToPath(new URL('../../../', import.meta.url)),
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
      projectRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      policyRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      toolRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      liveProjectRoot: PACKAGE_ROOT,
      snapshot: 'head',
    });

    expect(invocationCreated).toBe(false);
    expect(result.toolErrors).toEqual([
      {
        tool: 'invalid-priority',
        snapshot: 'head',
        message: 'invalid-priority executionPriority must be a non-negative safe integer',
      },
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
          cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        })),
        createAnalyzer('crap', ['coverage'], () => ({
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            'process.stdout.write(JSON.stringify({ findings: [] }))',
          ],
          cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        })),
      ],
      projectRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      policyRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      toolRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      liveProjectRoot: PACKAGE_ROOT,
      snapshot: 'head',
    });

    expect(result.reports.size).toBe(0);
    expect(result.toolErrors).toEqual([
      {
        tool: 'coverage',
        snapshot: 'head',
        message: 'coverage crashed with exit 2: no diagnostic output',
      },
    ]);
  });
  it.each([['differential', packageAnalyzers]])(
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
});
