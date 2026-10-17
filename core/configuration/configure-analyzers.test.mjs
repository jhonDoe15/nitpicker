import { describe, expect, it } from 'vitest';
import { configuredAnalyzers } from '../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { createPythonAnalyzers } from '../../languages/python/adapters/python-analyzer.mjs';
import { createJavaAnalyzer } from '../../languages/java/adapters/java-analyzer.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';

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
    for (const [index, part] of ['python', 'mutation'].entries()) {
      expect(configured[index].createInvocation(context).args).toEqual([
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
      ]);
    }
  });

  it('leaves the mutation analyzer of another preset alone', () => {
    const config = { preset: 'typescript', exclude: ['gen/**'] };

    const configured = configureAnalyzers(packageAnalyzers, config, resolveHeadPolicy(config));
    const mutation = configured.find(({ name }) => name === 'mutation');
    const context = { projectRoot: '/p', policyRoot: '/p', toolRoot: '/t', snapshot: 'head' };

    expect(mutation.createInvocation(context).args).not.toContain('--exclude');
  });

  it('lets a Python project disable mutation testing alone, but not the analyzer it depends on', () => {
    const configure = (disable) => {
      const config = { preset: 'python', disable };
      return configureAnalyzers(createPythonAnalyzers(), config, resolveHeadPolicy(config));
    };

    expect(configure(['mutation']).map(({ name }) => name)).toEqual(['python']);
    expect(() => configure(['python'])).toThrow(
      '"disable" cannot disable python because mutation depends on it; add it to "disable" too',
    );
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
    ['python', () => createPythonAnalyzers(), 'python'],
    ['java', () => [createJavaAnalyzer()], 'java'],
    ['kotlin', () => [createJavaAnalyzer({ kotlin: true })], 'kotlin'],
  ])(
    'is not passed to the %s runner, which runs no rule that reads it yet',
    (preset, analyzers, name) => {
      expect(configuredArguments(preset, analyzers(), name)).not.toContain('--baseline-moves-file');
    },
  );
});
