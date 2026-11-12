import { describe, expect, it } from 'vitest';
import { between, changesOf } from '../test-support/policy-fixtures.mjs';

const OPT_IN = { precedence: ['project', 'nitpicker'] };
const vitestConfig = { tools: { tests: { ...OPT_IN, runner: 'vitest' } } };
const mochaConfig = { tools: { tests: { ...OPT_IN, runner: 'mocha' } } };
const NONE = { policyLoosenings: [], policyChanges: [] };
const PRESETS = [undefined, 'javascript'];

const at = (files) => ({ 'src/a.ts': 'export const a = 1;\n', ...files });
const retrying = (retry, file = 'vitest.config.mjs') => ({
  [file]: `export default { test: { retry: ${retry} } };\n`,
});
const manifest = (mocha) => ({
  'package.json': JSON.stringify({ name: 'p', version: '1.0.0', mocha }),
});
const rc = (retries) => ({ '.mocharc.json': JSON.stringify({ retries }) });
const loosened = (text) => ({ policyLoosenings: [text], policyChanges: [text] });
const changed = (text) => ({ policyLoosenings: [], policyChanges: [text] });

function judged(base, head, config = vitestConfig) {
  return changesOf(between({ base: at(base), head: at(head), config }));
}

describe('the Vitest retry the project opted into', () => {
  it.each(PRESETS)('lists more retries as a loosening with the %s preset', (preset) => {
    const config = { preset, tools: vitestConfig.tools };

    expect(judged(retrying(0), retrying(2), config)).toEqual(
      loosened('tests vitest.config.mjs retry: 0 -> 2'),
    );
    expect(
      changesOf(between({ base: at(retrying(0)), head: at(retrying(2)), config: { preset } })),
    ).toEqual(NONE);
  });

  it.each([
    [retrying(3), retrying(1), changed('tests vitest.config.mjs retry: 3 -> 1')],
    [retrying(2), retrying(0), changed('tests vitest.config.mjs retry: 2 -> 0')],
    [retrying(0), retrying('{ count: 2 }'), loosened('tests vitest.config.mjs retry: 0 -> 2')],
    [
      retrying('{ count: 2 }'),
      retrying('{ count: 2, delay: 500 }'),
      loosened('tests vitest.config.mjs retry.delay: 0 -> 500'),
    ],
    [
      retrying('{ count: 2, delay: 500 }'),
      retrying('{ count: 2, delay: 100 }'),
      changed('tests vitest.config.mjs retry.delay: 500 -> 100'),
    ],
    [
      retrying('{ count: 2 }'),
      retrying('{ count: 2, condition: /flaky/ }'),
      changed('tests vitest.config.mjs retry.condition: not set -> "/flaky/"'),
    ],
    [
      retrying('{ count: 2, condition: /flaky/ }'),
      retrying('{ count: 2 }'),
      loosened('tests vitest.config.mjs retry.condition: "/flaky/" -> not set'),
    ],
    [
      retrying('{ count: 2, condition: /flaky/ }'),
      retrying('{ count: 2, condition: /./ }'),
      loosened('tests vitest.config.mjs retry.condition: "/flaky/" -> "/./"'),
    ],
  ])('judges each retry value on its own (%#)', (base, head, expected) => {
    expect(judged(base, head)).toEqual(expected);
  });

  it('shows nothing for a comment, a reformat or an edit of anything else', () => {
    const reformatted = '// retries\nexport default {\n  test: { retry: 2, include: ["x"] },\n};\n';

    expect(judged(retrying(2), { 'vitest.config.mjs': reformatted })).toEqual(NONE);
    expect(judged(retrying(2), { ...retrying(2), 'README.md': 'x\n' })).toEqual(NONE);
  });

  it('follows the config that wins when the winning file is deleted', () => {
    expect(
      judged(
        { ...retrying(0, 'vitest.config.ts'), ...retrying(5, 'vite.config.ts') },
        retrying(5, 'vite.config.ts'),
      ),
    ).toEqual(loosened('tests vite.config.ts retry: 0 -> 5'));
  });

  it('follows a value the config imports', () => {
    const shared = (retry) => ({ 'vitest.shared.ts': `export const retry: number = ${retry};\n` });
    const config = {
      'vitest.config.ts':
        "import { retry } from './vitest.shared.ts';\nexport default { test: { retry } };\n",
    };

    expect(judged({ ...config, ...shared(0) }, { ...config, ...shared(5) })).toEqual(
      loosened('tests vitest.config.ts retry: 0 -> 5'),
    );
  });

  it('lists the config file when the change adds the opt-in', () => {
    expect(
      between({
        base: at(retrying(0)),
        head: at(retrying(0)),
        baseConfig: {},
        config: vitestConfig,
      }).policyLoosenings,
    ).toEqual([
      'tests project config changed: vitest.config.mjs',
      'tools.tests.precedence: not set -> ["project","nitpicker"]',
    ]);
  });

  it('falls back to the config file when a side cannot be loaded', () => {
    expect(judged(retrying(0), { 'vitest.config.mjs': 'throw new Error("broken");\n' })).toEqual(
      loosened('tests project config changed: vitest.config.mjs'),
    );
  });

  it('judges nothing, and runs nothing, while nitpicker wins', () => {
    const config = { tools: { tests: { precedence: ['nitpicker', 'project'], runner: 'vitest' } } };
    const throwing = { 'vitest.config.mjs': 'throw new Error("ran");\n' };

    expect(judged(retrying(0), throwing, config)).toEqual(NONE);
  });
});

describe('the Mocha retries the project opted into', () => {
  const judgedMocha = (base, head) => judged(base, head, mochaConfig);

  it.each(PRESETS)('lists more retries as a loosening with the %s preset', (preset) => {
    const config = { preset, tools: mochaConfig.tools };

    expect(judged(rc(0), rc(3), config)).toEqual(loosened('tests .mocharc.json retry: 0 -> 3'));
    expect(changesOf(between({ base: at(rc(0)), head: at(rc(3)), config: { preset } }))).toEqual(
      NONE,
    );
  });

  it('judges the mocha key of package.json and shows nothing for other edits', () => {
    expect(judgedMocha(manifest({ retries: 0 }), manifest({ retries: 3 }))).toEqual(
      loosened('tests package.json "mocha" retry: 0 -> 3'),
    );
    expect(judgedMocha(manifest({ retries: 3 }), manifest({ retries: 0 }))).toEqual(
      changed('tests package.json "mocha" retry: 3 -> 0'),
    );
    expect(
      judgedMocha(manifest({ retries: 0 }), {
        'package.json': JSON.stringify({ name: 'p', version: '1.1.0', mocha: { retries: 0 } }),
      }),
    ).toEqual(NONE);
    expect(judgedMocha(rc(2), { '.mocharc.json': '// flaky\n{ "retries": 2 }\n' })).toEqual(NONE);
  });

  it.each([
    [
      'a .mocharc.json that replaces a .mocharc.cjs',
      { '.mocharc.cjs': 'module.exports = { retries: 0 };\n', ...rc(5) },
      rc(5),
      'tests .mocharc.json retry: 0 -> 5',
    ],
    [
      'a .mocharc.mjs that appears',
      rc(0),
      { ...rc(0), '.mocharc.mjs': 'export default { retries: 4 };\n' },
      'tests .mocharc.mjs retry: 0 -> 4',
    ],
    [
      'a .mocharc.cjs that appears',
      rc(0),
      { ...rc(0), '.mocharc.cjs': 'module.exports = { retries: 4 };\n' },
      'tests .mocharc.cjs retry: 0 -> 4',
    ],
  ])('follows the rc file that wins: %s', (_name, base, head, text) => {
    expect(judgedMocha(base, head)).toEqual(loosened(text));
  });

  it('judges a removed rc file as the retries it no longer sets', () => {
    expect(
      judgedMocha({ ...rc(2), ...manifest({ retries: 0 }) }, manifest({ retries: 0 })),
    ).toEqual(changed('tests package.json "mocha" retry: 2 -> 0'));
    expect(
      judgedMocha({ ...rc(0), ...manifest({ retries: 3 }) }, manifest({ retries: 3 })),
    ).toEqual(loosened('tests package.json "mocha" retry: 0 -> 3'));
  });

  it('reads the config the test script names', () => {
    const script = (config) => ({
      'package.json': JSON.stringify({ name: 'p', scripts: { test: `mocha --config ${config}` } }),
    });
    const files = (retries) => ({
      ...script('config/mocha.json'),
      'config/mocha.json': JSON.stringify({ retries }),
      ...rc(0),
    });

    expect(judgedMocha(files(0), files(4))).toEqual(
      loosened('tests config/mocha.json retry: 0 -> 4'),
    );
  });

  it('lists the rc file when the change adds the opt-in', () => {
    expect(
      between({ base: at(rc(2)), head: at(rc(2)), baseConfig: {}, config: mochaConfig })
        .policyLoosenings,
    ).toEqual([
      'tests project config changed: .mocharc.json',
      'tools.tests.precedence: not set -> ["project","nitpicker"]',
    ]);
  });

  it('falls back to the files when the rc file cannot be loaded', () => {
    expect(judgedMocha(rc(0), { ...rc(0), '.mocharc.cjs': 'process.exit(0);\n' })).toEqual(
      loosened('tests project config changed: .mocharc.cjs'),
    );
  });
});
