import { describe, expect, it } from 'vitest';
import { configuredAnalyzers } from '../../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { PACKAGE_ROOT, resolveTool } from '../../../../tooling/tool-resolution.mjs';
import { runQualitySnapshot } from '../../../../snapshot/run-snapshot.mts';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../../shared/policy.mjs';
import { runAnalyzers, selectAnalyzers } from '../../../execution/run-analyzers.mts';
import { planAnalyzerShards } from '../../../sharding/sharding.mts';
import { analyzerRequest } from './test-support/analyzer-request.mts';
import { fieldAt } from '../../../../../scripts/json/fields.mts';
import { fileURLToPath } from 'node:url';
import { linkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';

type CatalogAnalyzer = {
  readonly name: string;
  readonly concurrencyWeight?: number;
  readonly executionPriority?: number;
  readonly concurrencyGroup?: string;
  readonly shardWeight: number;
  readonly resolveVersion: (root: string) => unknown;
  readonly createInvocation: (context: {
    readonly projectRoot: string;
    readonly policyRoot: string;
    readonly toolRoot: string;
    readonly snapshot: string;
  }) => { readonly args: readonly string[] };
};

const catalog: () => CatalogAnalyzer[] = configuredAnalyzers;
const packageAnalyzers = catalog();
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
      scope: undefined,
    });

    expect(report.toolErrors).toEqual([]);
    expect(fieldAt(report.summary, 'tools', 0, 'version')).toBe(resolveTool('prettier').version);
    expect(fieldAt(report.summary, 'tools', 0, 'version')).not.toBe('unresolved');
  });
  it('resolves a real version for every analyzer', () => {
    const unresolved = packageAnalyzers.map((analyzer) => [
      analyzer.name,
      analyzer.resolveVersion(PACKAGE_ROOT) === 'unresolved',
    ]);
    expect(unresolved).toEqual(packageAnalyzers.map((analyzer) => [analyzer.name, false]));
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
    (_dial, analyzers) => {
      const weights = Object.fromEntries(
        analyzers.map(({ name, concurrencyWeight = 1 }) => [name, concurrencyWeight]),
      );
      const priorities = Object.fromEntries(
        analyzers.map(({ name, executionPriority = 0 }) => [name, executionPriority]),
      );
      expect(fieldAt(weights, 'coverage')).toBe(2);
      expect(fieldAt(weights, 'mutation')).toBe(2);
      expect(fieldAt(weights, 'crap')).toBe(1);
      expect(fieldAt(weights, 'eslint-lint')).toBe(1);
      expect(fieldAt(priorities, 'coverage')).toBe(1);
      expect(fieldAt(priorities, 'mutation')).toBe(1);
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
      ).toEqual([undefined, undefined, undefined, undefined]);
    },
  );
  it('bounds coverage worker processes independently of host CPU visibility', async () => {
    const qualityConfigPath =
      '../../../../../languages/typescript/preset/defaults/vitest.quality.config.ts';
    const loaded: unknown = await import(qualityConfigPath);
    const factory = fieldAt(loaded, 'default');
    const config: unknown =
      typeof factory === 'function'
        ? await Reflect.apply(factory, undefined, [{ command: 'serve', mode: 'test' }])
        : undefined;
    expect(fieldAt(config, 'test', 'maxWorkers')).toBe(4);
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
        ...analyzerRequest([]),
        liveProjectRoot: '',
      }),
    ).toThrow('liveProjectRoot is required');
  });
  it('rejects invalid analyzer execution priority before invocation creation', () => {
    let invocationCreated = false;
    const result = runAnalyzers(
      analyzerRequest([
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
      ]),
    );

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
    function createAnalyzer(
      name: string,
      dependencies: readonly string[],
      createInvocation: () => {
        readonly command: string;
        readonly args: string[];
        readonly cwd: string;
      },
    ) {
      return {
        name,
        dependencies,
        version: '1.0.0',
        configurationHash: 'test',
        exclusions: [],
        createInvocation,
      };
    }

    const result = runAnalyzers(
      analyzerRequest([
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
      ]),
    );

    expect(result.reports.size).toBe(0);
    expect(result.toolErrors).toEqual([
      {
        tool: 'coverage',
        snapshot: 'head',
        message: `coverage crashed with exit 2: no diagnostic output. ${String(linkSentence('analyzerCrashed'))}`,
      },
    ]);
  });
  it.each([['differential', packageAnalyzers]])(
    'passes the active CRAP limit to the %s dial',
    (_dial, analyzers) => {
      const analyzer = analyzers.find(({ name }) => name === 'crap');
      const invocation = analyzer?.createInvocation({
        projectRoot: '/project',
        policyRoot: '/policy',
        toolRoot: '/tools',
        snapshot: 'head',
      });

      expect(invocation?.args.slice(-2)).toEqual([
        '--crap-score-limit',
        String(DEFAULT_CRAP_SCORE_LIMIT),
      ]);
    },
  );
});
