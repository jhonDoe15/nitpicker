import { describe, expect, it } from 'vitest';
import { configureAnalyzers } from '../configuration/configure-analyzers.mjs';
import { presetAnalyzers } from '../configuration/preset-analyzers.mjs';
import { applyRunProfile } from './profile.mjs';

function namedAnalyzers(...names) {
  return names.map((name) => ({
    name,
    configurationHash: `${name}-hash`,
    createInvocation: () => ({ command: 'node', args: ['runner.mjs'], cwd: '.' }),
  }));
}

function quickRun(preset) {
  const analyzers = presetAnalyzers({ preset, python: {} });
  return applyRunProfile(analyzers, { quick: true, analyzerNames: [] });
}

describe('quick profile analyzer selection per preset', () => {
  const FAST_TYPESCRIPT = [
    'eslint-lint',
    'eslint-errors',
    'eslint-logging',
    'eslint-module-effects',
    'entry-points',
    'prettier-format',
    'typescript-typecheck',
    'dependency-architecture',
    'coding-standards',
    'coupling',
    'test-runtime',
    'structure',
    'duplicates',
    'dead-code',
    'repository-hygiene',
  ];

  it.each(['typescript', 'javascript'])(
    'keeps the static analyzers and drops the test-driven ones for %s',
    (preset) => {
      const { analyzers, quick } = quickRun(preset);

      expect(analyzers.map(({ name }) => name)).toEqual(FAST_TYPESCRIPT);
      expect(quick.skipped).toEqual(['coverage', 'test-console', 'crap', 'mutation']);
    },
  );

  it('drops the Python mutation analyzer and lists the test tools inside the python analyzer', () => {
    const { analyzers, quick } = quickRun('python');

    expect(analyzers.map(({ name }) => name)).toEqual(['python', 'repository-hygiene']);
    expect(quick.skipped).toEqual(['mutation', 'tests', 'coverage', 'crap', 'test-runtime']);
  });

  it.each([
    [
      { preset: 'python', python: {}, disable: ['mutation'] },
      ['tests', 'coverage', 'crap', 'test-runtime'],
    ],
    [{ preset: 'typescript', disable: ['coverage', 'mutation'] }, []],
  ])('lists only the checks the configuration turns on for %j', (config, skipped) => {
    const analyzers = configureAnalyzers(presetAnalyzers(config), config, {});

    expect(applyRunProfile(analyzers, { quick: true, analyzerNames: [] }).quick.skipped).toEqual(
      skipped,
    );
  });

  it('lists only the checks of the analyzers that --analyzer selects', () => {
    const analyzers = presetAnalyzers({ preset: 'python', python: {} });

    expect(
      applyRunProfile(analyzers, { quick: true, analyzerNames: ['python'] }).quick.skipped,
    ).toEqual(['tests', 'coverage', 'crap', 'test-runtime']);
  });

  it('lists the checks of the analyzers a selected analyzer depends on', () => {
    const [java, structure] = namedAnalyzers('java', 'structure');
    const analyzers = [java, { ...structure, dependencies: ['java', 'missing'] }];

    expect(
      applyRunProfile(analyzers, { quick: true, analyzerNames: ['structure'] }).quick.skipped,
    ).toEqual(['tests', 'jacoco', 'crap', 'pit', 'test-runtime']);
  });

  it.each(['java', 'kotlin'])('lists the test tools inside the %s analyzer', (preset) => {
    const { analyzers, quick } = quickRun(preset);

    expect(analyzers.map(({ name }) => name)).toEqual([preset, 'repository-hygiene']);
    expect(quick.skipped).toEqual(['tests', 'jacoco', 'crap', 'pit', 'test-runtime']);
  });
});

describe('quick profile', () => {
  it('leaves the analyzers alone without --quick', () => {
    const analyzers = namedAnalyzers('coverage', 'structure');

    expect(applyRunProfile(analyzers, { quick: false })).toEqual({
      analyzers,
      quick: undefined,
    });
  });

  it('says so when this configuration has nothing to skip', () => {
    const { analyzers, quick } = applyRunProfile(namedAnalyzers('structure'), {
      quick: true,
      analyzerNames: [],
    });

    expect(analyzers.map(({ name }) => name)).toEqual(['structure']);
    expect(quick).toEqual({
      skipped: [],
      message:
        'Quick run: no checks to skip in this configuration. Run nitpicker without --quick before you finish.',
    });
  });

  it('names the skipped checks in the message', () => {
    const { quick } = applyRunProfile(namedAnalyzers('coverage', 'crap', 'structure'), {
      quick: true,
      analyzerNames: [],
    });

    expect(quick.message).toBe(
      'Quick run: skipped coverage, crap. Run nitpicker without --quick before you finish.',
    );
  });

  it('refuses an --analyzer that quick mode skips', () => {
    expect(() =>
      applyRunProfile(namedAnalyzers('coverage', 'structure'), {
        quick: true,
        analyzerNames: ['structure', 'coverage'],
      }),
    ).toThrow('--analyzer coverage is skipped by --quick. Run it without --quick.');
  });

  it('keeps a custom analyzer named like a skipped check and tells it the run is quick', () => {
    const custom = {
      ...namedAnalyzers('coverage')[0],
      custom: true,
      createInvocation: () => ({ command: 'node', args: [], cwd: '.', env: { A: '1' } }),
    };

    const { analyzers, quick } = applyRunProfile([custom], { quick: true, analyzerNames: [] });

    expect(quick.skipped).toEqual([]);
    expect(analyzers[0].createInvocation({}).env).toEqual({ A: '1', NITPICKER_QUICK: '1' });
    expect(analyzers[0].configurationHash).not.toBe(custom.configurationHash);
  });

  it('lists no runner tools for a custom analyzer named like a language analyzer', () => {
    const custom = { ...namedAnalyzers('python')[0], custom: true };

    const { analyzers, quick } = applyRunProfile([custom], { quick: true, analyzerNames: [] });

    expect(quick.skipped).toEqual([]);
    expect(analyzers[0].createInvocation({}).args).toEqual(['runner.mjs']);
  });

  it('adds the quick mode to a language runner and keys it apart from the full run', () => {
    const [full] = namedAnalyzers('java');
    const withResolved = {
      ...full,
      resolveConfigurationHash: (root) => `${root}-resolved`,
    };

    const [quick] = applyRunProfile([withResolved], { quick: true, analyzerNames: [] }).analyzers;

    expect(quick.quick).toBe(true);
    expect(quick.createInvocation({}).args).toEqual(['runner.mjs', '--mode', 'quick']);
    expect(quick.configurationHash).not.toBe(full.configurationHash);
    expect(quick.resolveConfigurationHash('/policy')).not.toBe(
      withResolved.resolveConfigurationHash('/policy'),
    );
    expect(full.createInvocation({}).args).toEqual(['runner.mjs']);
  });
});
