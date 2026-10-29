import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../../shared/head-policy.mjs';
import { baseConfigCoveringHead } from '../../policy-changes/base-coverage.mjs';
import { describeConfigOverrides } from '../config.mjs';
import { configureAnalyzers } from '../configure-analyzers.mjs';
import { presetAnalyzers } from '../preset-analyzers.mjs';
import { validateConfig } from '../validate.mjs';

const ENTRY = fileURLToPath(new URL('../../cli.mjs', import.meta.url));
const PRESETS = ['typescript', 'javascript', 'java', 'kotlin', 'python'];

describe('history config', () => {
  it.each([
    [{ history: {} }],
    [{ history: { coChange: false } }],
    [{ history: { coChange: true } }],
    [{ history: { coChange: true, commits: 2000, minSupport: 2, minConfidence: 1 } }],
    [{ history: { coChange: true, commits: 20, maxCommitFiles: 2, minConfidence: 0.01 } }],
    [{ history: { coChange: true, maxCommitFiles: 100 } }],
    [{ history: { coChange: false, commits: 500, minSupport: 3, minConfidence: 0.5 } }],
    ...PRESETS.map((preset) => [{ preset, history: { coChange: true } }]),
  ])('accepts %j', (config) => {
    expect(validateConfig(config)).toEqual(config);
  });

  it.each([
    [{ history: [] }, /"history" must be an object/],
    [{ history: { coChange: 'yes' } }, /"history.coChange" must be true or false/],
    [{ history: { other: true } }, /unknown history key "other"/],
    [{ history: { commits: 100 } }, /"history.commits" has no effect until "history.coChange"/],
    [
      { history: { coChange: true, commits: 19 } },
      /"history.commits" must be a whole number from 20 to 2000/,
    ],
    [{ history: { coChange: true, commits: 2001 } }, /from 20 to 2000/],
    [{ history: { coChange: true, commits: 30.5 } }, /"history.commits" must be a whole number/],
    [
      { history: { coChange: true, minSupport: 1 } },
      /"history.minSupport" must be a whole number at least 2/,
    ],
    [
      { history: { coChange: true, maxCommitFiles: 1 } },
      /"history.maxCommitFiles" must be a whole number from 2 to 100/,
    ],
    [{ history: { coChange: true, maxCommitFiles: 101 } }, /from 2 to 100/],
    [{ history: { coChange: false, commits: 5 } }, /"history.commits" must be a whole number/],
    [
      { history: { coChange: true, minConfidence: 0 } },
      /"history.minConfidence" must be a number above 0/,
    ],
    [{ history: { coChange: true, minConfidence: 1.5 } }, /"history.minConfidence"/],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it.each(['java', 'kotlin', 'python'])(
    'takes layout.featureRoots with %s once co-change is on, and not before',
    (preset) => {
      const layout = { featureRoots: ['**/modules'] };
      const accepted = { preset, layout, history: { coChange: true } };

      expect(() => validateConfig({ preset, layout })).toThrow(/not supported with "preset"/u);
      expect(() => validateConfig({ preset, layout, history: { coChange: false } })).toThrow(
        /not supported/u,
      );
      expect(validateConfig(accepted)).toEqual(accepted);
    },
  );

  it('keeps layout.sharedRoots out of the presets that do not run its rule', () => {
    expect(() =>
      validateConfig({
        preset: 'java',
        layout: { sharedRoots: ['**/shared'] },
        history: { coChange: true },
      }),
    ).toThrow(/sharedRoots/u);
  });

  it.each(PRESETS)('takes co-change exceptions with %s', (preset) => {
    const exceptions = [{ rule: 'co-change', paths: ['src/billing/**'], reason: 'one release' }];

    expect(validateConfig({ preset, exceptions })).toEqual({ preset, exceptions });
  });

  it('is listed as a config override and reaches the head policy', () => {
    const config = { history: { coChange: true, commits: 500 } };

    expect(describeConfigOverrides(config)).toEqual(['history: {"coChange":true,"commits":500}']);
    expect(resolveHeadPolicy(config).history).toEqual(config.history);
    expect(resolveHeadPolicy({})).toEqual({
      exclude: [],
      layout: {},
      exceptions: [],
      thresholds: {},
    });
  });
});

describe('the change-history analyzer', () => {
  const names = (config) => presetAnalyzers(config).map(({ name }) => name);

  it.each(PRESETS)('is added to %s only when the project opts in', (preset) => {
    const without = names({ preset });

    expect({
      before: without.includes('change-history'),
      off: names({ preset, history: { coChange: false, commits: 500 } }),
      on: names({ preset, history: { coChange: true } }),
    }).toEqual({ before: false, off: without, on: [...without, 'change-history'] });
  });

  it('can be disabled like any analyzer, and does not replace injected analyzers', () => {
    const config = { history: { coChange: true }, disable: ['change-history'] };

    expect(configureAnalyzers(presetAnalyzers(config), config, {}).map(({ name }) => name)).toEqual(
      presetAnalyzers({}).map(({ name }) => name),
    );
    expect(presetAnalyzers(config, [{ name: 'fake' }])).toEqual([{ name: 'fake' }]);
  });

  it('runs the history runner on the snapshot it is given', () => {
    const analyzer = presetAnalyzers({ history: { coChange: true } }).find(
      ({ name }) => name === 'change-history',
    );

    expect(analyzer.createInvocation({ projectRoot: '/head', toolRoot: '/tool' }).args).toEqual([
      ENTRY,
      'history',
      '--check',
      'change-history',
      '--project-root',
      '/head',
    ]);
  });

  it('measures the base with the history settings of the head', () => {
    const history = { coChange: true, commits: 400 };

    expect(baseConfigCoveringHead({ preset: 'java' }, { history })).toEqual({
      preset: 'java',
      history,
    });
    expect(
      baseConfigCoveringHead({ history: { coChange: true, commits: 100 } }, { history }),
    ).toEqual({ history });
    expect(baseConfigCoveringHead({ history }, {})).toEqual({});
  });
});
