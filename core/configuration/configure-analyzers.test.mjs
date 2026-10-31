import { describe, expect, it } from 'vitest';
import { configuredAnalyzers } from '../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { createPythonAnalyzers } from '../../languages/python/adapters/python-analyzer.mjs';
import { createJavaAnalyzer } from '../../languages/java/adapters/java-analyzer.mjs';
import { createGoAnalyzer } from '../../languages/go/adapters/go-analyzer.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';
import { describeConfigOverrides } from './config.mjs';
import { validateConfig } from './validate.mjs';

const packageAnalyzers = configuredAnalyzers();
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
      'mutation',
      'prettier-format',
      'structure',
      'test-console',
      'test-runtime',
      'typescript-typecheck',
    ]);
    expect(configured.find(({ name }) => name === 'coding-standards').legacyInventory).toBe(
      'config/legacy.json',
    );
  });

  it('hands the exclude globs and the snapshot to both Python analyzers', () => {
    const config = { preset: 'python', exclude: ['gen/**'] };
    const context = { projectRoot: '/p', toolRoot: '/t', liveProjectRoot: '/p', snapshot: 'base' };

    const configured = configureAnalyzers(
      createPythonAnalyzers(),
      config,
      resolveHeadPolicy(config),
    );

    expect(configured.map(({ name }) => name)).toEqual(['python', 'mutation']);
    const parts = ['python', 'mutation'];
    expect(configured.map((analyzer) => analyzer.createInvocation(context).args)).toEqual(
      parts.map((part) => [
        expect.stringMatching(/python-runner\.mjs$/),
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
    const mutation = configured.find(({ name }) => name === 'mutation');
    const context = { projectRoot: '/p', policyRoot: '/p', toolRoot: '/t', snapshot: 'head' };

    expect(mutation.createInvocation(context).args).not.toContain('--exclude');
  });

  it('lets a Python project disable mutation testing alone, and python with it', () => {
    const configure = (disable) => {
      const config = { preset: 'python', disable };
      return configureAnalyzers(createPythonAnalyzers(), config, resolveHeadPolicy(config));
    };

    expect(configure(['mutation']).map(({ name }) => name)).toEqual(['python']);
    expect(configure(['python'])).toEqual([]);
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

  function configuredArguments(preset, analyzers, name) {
    const config = { preset };
    const configured = configureAnalyzers(analyzers, config, resolveHeadPolicy(config));
    return configured.find((analyzer) => analyzer.name === name).createInvocation(context).args;
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

  it.each([
    ['java', () => [createJavaAnalyzer()], 'java'],
    ['kotlin', () => [createJavaAnalyzer({ kotlin: true })], 'kotlin'],
  ])('reaches the %s runner, whose sibling-copy-edit reads the base', (preset, analyzers, name) => {
    const args = configuredArguments(preset, analyzers(), name);
    const at = args.indexOf('--baseline-moves-file');

    expect(args.slice(at, at + 2)).toEqual(['--baseline-moves-file', '/tmp/moves.json']);
  });

  it('is not passed to the python runner, which runs no rule that reads it yet', () => {
    expect(configuredArguments('python', createPythonAnalyzers(), 'python')).not.toContain(
      '--baseline-moves-file',
    );
  });
});

describe('analyzer timeouts', () => {
  const MINUTE_MS = 60_000;

  function timeoutsOf(config, analyzers = packageAnalyzers) {
    validateConfig(config);
    const configured = configureAnalyzers(analyzers, config, resolveHeadPolicy(config));
    return Object.fromEntries(configured.map(({ name, timeoutMs }) => [name, timeoutMs]));
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
        { preset: 'python', analyzerTimeoutMinutes: { python: 90 } },
        createPythonAnalyzers(),
      ).python,
    ).toBe(90 * MINUTE_MS);
    expect(
      [
        ['java', createJavaAnalyzer()],
        ['kotlin', createJavaAnalyzer({ kotlin: true })],
        ['go', createGoAnalyzer()],
      ].map(
        ([preset, analyzer]) =>
          timeoutsOf({ preset, analyzerTimeoutMinutes: { [preset]: 120 } }, [analyzer])[preset],
      ),
    ).toEqual([120 * MINUTE_MS, 120 * MINUTE_MS, 120 * MINUTE_MS]);
  });

  it('accepts a disabled analyzer and rejects an unknown one', () => {
    expect(
      timeoutsOf({ disable: ['mutation'], analyzerTimeoutMinutes: { mutation: 90 } }).mutation,
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
