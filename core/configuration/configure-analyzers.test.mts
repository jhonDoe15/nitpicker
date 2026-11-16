import { describe, expect, it } from 'vitest';
import { configuredAnalyzers } from '../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import {
  MUTATION_ANALYZER_NAME,
  PYTHON_ANALYZER_NAME,
  createPythonAnalyzers,
} from '../../languages/python/adapters/python-analyzer.mts';
import { createJavaAnalyzer } from '../../languages/java/adapters/java-analyzer.mts';
import { createGoAnalyzers } from '../../languages/go/adapters/go-analyzer.mts';
import { configureAnalyzers } from './configure-analyzers.mts';
import { analyzersOf, type Analyzer } from '../../shared/values/analyzers.mts';
import { fieldOf } from '../../shared/values/readers.mts';
import { analyzerNamed } from './test-support/analyzer-access.mts';
import type { NitpickerConfig } from '../../shared/values/config-types.mts';
import { describeConfigOverrides } from './config.mts';
import { validateConfig } from './validate.mts';

const packageAnalyzers = analyzersOf(configuredAnalyzers());

function pythonAnalyzers(): Analyzer[] {
  return analyzersOf(createPythonAnalyzers());
}

function javaAnalyzers(kotlin?: true): Analyzer[] {
  return analyzersOf([
    kotlin === undefined ? createJavaAnalyzer() : createJavaAnalyzer({ kotlin }),
  ]);
}

function goAnalyzers(): Analyzer[] {
  return analyzersOf(createGoAnalyzers());
}

describe('configureAnalyzers', () => {
  it('applies disable, custom analyzers and the legacy inventory in one place', () => {
    const config = {
      disable: ['duplicates'],
      analyzers: [{ name: 'house-rules', command: './check.sh' }],
      legacyInventory: 'config/legacy.json',
    };

    const configured = configureAnalyzers(packageAnalyzers, config, resolveHeadPolicy(config));
    const names = configured.map(({ name }) => name);

    expect(names).not.toContain('duplicates');
    expect([...new Set(names)].sort()).toEqual([
      'coding-standards',
      'coupling',
      'coverage',
      'crap',
      'dead-code',
      'dependency-architecture',
      'entry-points',
      'eslint-errors',
      'eslint-lint',
      'eslint-logging',
      'eslint-module-effects',
      'house-rules',
      MUTATION_ANALYZER_NAME,
      'prettier-format',
      'structure',
      'test-console',
      'test-runtime',
      'typescript-typecheck',
    ]);
    expect(fieldOf(analyzerNamed(configured, 'coding-standards'), 'legacyInventory')).toBe(
      'config/legacy.json',
    );
  });

  it('hands the exclude globs and the snapshot to both Python analyzers', () => {
    const config = { preset: PYTHON_ANALYZER_NAME, exclude: ['gen/**'] };
    const context = { projectRoot: '/p', toolRoot: '/t', liveProjectRoot: '/p', snapshot: 'base' };

    const configured = configureAnalyzers(pythonAnalyzers(), config, resolveHeadPolicy(config));

    expect(configured.map(({ name }) => name)).toEqual([
      PYTHON_ANALYZER_NAME,
      MUTATION_ANALYZER_NAME,
    ]);
    const parts = [PYTHON_ANALYZER_NAME, MUTATION_ANALYZER_NAME];
    expect(configured.map((analyzer) => analyzer.createInvocation(context).args)).toEqual(
      parts.map((part): unknown[] => [
        expect.stringMatching(/python-runner\.m[jt]s$/),
        '--part',
        part,
        '--project-root',
        '/p',
        '--live-root',
        '/p',
        '--exclude',
        'gen/**',
        '--snapshot',
        'base',
        '--legacy-inventory',
        'nitpicker.legacy.json',
      ]),
    );
  });

  it('leaves the mutation analyzer of another preset alone', () => {
    const config = { preset: 'typescript', exclude: ['gen/**'] };

    const configured = configureAnalyzers(packageAnalyzers, config, resolveHeadPolicy(config));
    const mutation = analyzerNamed(configured, MUTATION_ANALYZER_NAME);
    const context = { projectRoot: '/p', policyRoot: '/p', toolRoot: '/t', snapshot: 'head' };

    expect(mutation.createInvocation(context).args).not.toContain('--exclude');
  });

  it('lets a Python project disable mutation testing alone, and python with it', () => {
    const configure = (disable: readonly string[]) => {
      const config = { preset: PYTHON_ANALYZER_NAME, disable };
      return configureAnalyzers(pythonAnalyzers(), config, resolveHeadPolicy(config));
    };

    expect(configure([MUTATION_ANALYZER_NAME]).map(({ name }) => name)).toEqual([
      PYTHON_ANALYZER_NAME,
    ]);
    expect(configure([PYTHON_ANALYZER_NAME])).toEqual([]);
  });
});

describe('the baseline moves file', () => {
  const context = {
    projectRoot: '/p',
    policyRoot: '/p',
    toolRoot: '/t',
    liveProjectRoot: '/p',
    snapshot: 'head',
    baselineRoot: '/base',
    baselineMovesFile: '/tmp/moves.json',
  };

  function configuredArguments(
    preset: string,
    analyzers: readonly Analyzer[],
    name: string,
  ): readonly string[] {
    const config = { preset };
    const configured = configureAnalyzers(analyzers, config, resolveHeadPolicy(config));
    return analyzerNamed(configured, name).createInvocation(context).args;
  }

  it('reaches the TypeScript structure analyzer, whose sibling-copy-edit reads the base', () => {
    const args = configuredArguments('typescript', packageAnalyzers, 'structure');

    expect(args.slice(-4)).toEqual([
      '--baseline-root',
      '/base',
      '--baseline-moves-file',
      '/tmp/moves.json',
    ]);
  });

  it('reaches the python runner, whose sibling-copy-edit reads the base facts', () => {
    const args = configuredArguments(PYTHON_ANALYZER_NAME, pythonAnalyzers(), PYTHON_ANALYZER_NAME);
    const at = args.indexOf('--baseline-moves-file');

    expect(args.slice(at, at + 2)).toEqual(['--baseline-moves-file', '/tmp/moves.json']);
    expect(
      configuredArguments(PYTHON_ANALYZER_NAME, pythonAnalyzers(), MUTATION_ANALYZER_NAME),
    ).not.toContain('--baseline-moves-file');
  });

  it.each<[string, () => Analyzer[], string]>([
    ['java', () => javaAnalyzers(), 'java'],
    ['kotlin', () => javaAnalyzers(true), 'kotlin'],
  ])('reaches the %s runner, whose sibling-copy-edit reads the base', (preset, analyzers, name) => {
    const args = configuredArguments(preset, analyzers(), name);
    const at = args.indexOf('--baseline-moves-file');

    expect(args.slice(at, at + 2)).toEqual(['--baseline-moves-file', '/tmp/moves.json']);
  });
});

describe('analyzer timeouts', () => {
  const MINUTE_MS = 60_000;

  function timeoutsOf(
    config: NitpickerConfig,
    analyzers: readonly Analyzer[] = packageAnalyzers,
  ): Record<string, unknown> {
    validateConfig(config);
    const configured = configureAnalyzers(analyzers, config, resolveHeadPolicy(config));
    return Object.fromEntries(
      configured.map((analyzer) => [analyzer.name, fieldOf(analyzer, 'timeoutMs')]),
    );
  }

  it('sets the deadline of a built-in and a custom analyzer, in every preset', () => {
    const custom = [{ name: 'house-rules', command: './check.sh' }];
    const timeouts = timeoutsOf({
      analyzers: custom,
      analyzerTimeoutMinutes: { 'eslint-lint': 20, 'house-rules': 3 },
    });

    expect(timeouts['eslint-lint']).toBe(20 * MINUTE_MS);
    expect(timeouts['house-rules']).toBe(3 * MINUTE_MS);
    expect(timeouts['prettier-format']).toBe(timeoutsOf({})['prettier-format']);
    expect(
      timeoutsOf(
        { preset: 'python', analyzerTimeoutMinutes: { [PYTHON_ANALYZER_NAME]: 90 } },
        pythonAnalyzers(),
      )['python'],
    ).toBe(90 * MINUTE_MS);
    expect(
      (
        [
          ['java', javaAnalyzers()],
          ['kotlin', javaAnalyzers(true)],
          ['go', goAnalyzers().slice(0, 1)],
        ] as const
      ).map(
        ([preset, analyzers]) =>
          timeoutsOf({ preset, analyzerTimeoutMinutes: { [preset]: 120 } }, analyzers)[preset],
      ),
    ).toEqual([120 * MINUTE_MS, 120 * MINUTE_MS, 120 * MINUTE_MS]);
    expect(
      timeoutsOf(
        { preset: 'go', analyzerTimeoutMinutes: { [MUTATION_ANALYZER_NAME]: 90 } },
        goAnalyzers(),
      )[MUTATION_ANALYZER_NAME],
    ).toBe(90 * MINUTE_MS);
  });

  it('accepts a disabled analyzer and rejects an unknown one', () => {
    expect(
      timeoutsOf({
        disable: ['mutation'],
        analyzerTimeoutMinutes: { [MUTATION_ANALYZER_NAME]: 90 },
      })[MUTATION_ANALYZER_NAME],
    ).toBeUndefined();
    expect(() => timeoutsOf({ analyzerTimeoutMinutes: { eslnt: 5 } })).toThrow(
      /"analyzerTimeoutMinutes" names unknown analyzers: eslnt\. Known analyzers: .*eslint-lint/,
    );
  });

  it('is left out of the overrides that make up the policy hash', () => {
    expect(
      describeConfigOverrides({ analyzerTimeoutMinutes: { java: 60 }, disable: ['crap'] }),
    ).toEqual(['disable: ["crap"]']);
  });
});
