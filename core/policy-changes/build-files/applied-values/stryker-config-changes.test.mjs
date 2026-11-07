import { describe, expect, it } from 'vitest';
import { between, changesOf, without } from '../test-support/policy-fixtures.mjs';

const PROJECT = { precedence: ['project', 'nitpicker'] };

describe('what an edit of the Stryker config changes', () => {
  const NONE = { policyLoosenings: [], policyChanges: [] };
  const OPTED_IN = { tools: { stryker: PROJECT } };
  const strykerAt = (file, config) => ({
    [file]: JSON.stringify(config),
    'src/a.ts': 'export const a = 1;\n',
  });
  const at = (config) => strykerAt('stryker.config.json', config);
  const excluding = (...names) => ({ mutator: { excludedMutations: names } });

  it.each([undefined, 'javascript'])(
    'lists a loosened exclusion list with the %s preset',
    (preset) => {
      const config = { preset, ...OPTED_IN };
      const { policyLoosenings } = between({
        base: at(excluding()),
        head: at(excluding('StringLiteral')),
        config,
      });

      expect(policyLoosenings).toEqual([
        'stryker stryker.config.json mutator.excludedMutations: [] -> ["StringLiteral"]',
      ]);
      expect(
        between({ base: at(excluding()), head: at(excluding('StringLiteral')), config: { preset } })
          .policyLoosenings,
      ).toEqual([]);
    },
  );

  it('follows the values a config imports, not its text', () => {
    const module = (list) => ({
      'stryker.config.mjs':
        "import excluded from './excluded.mjs';\nexport default { mutator: { excludedMutations: excluded } };\n",
      'excluded.mjs': `export default ${JSON.stringify(list)};\n`,
      'src/a.ts': 'export const a = 1;\n',
    });

    expect(
      between({
        base: module([]),
        head: module(['StringLiteral', 'ArrowFunction']),
        config: OPTED_IN,
      }).policyLoosenings,
    ).toEqual([
      'stryker stryker.config.mjs mutator.excludedMutations: [] -> ["StringLiteral","ArrowFunction"]',
    ]);
    expect(
      changesOf(
        between({ base: module([]), head: { ...module([]), 'notes.md': 'x\n' }, config: OPTED_IN }),
      ),
    ).toEqual(NONE);
  });

  it('counts a deleted winning config as loosening when a weaker one takes over', () => {
    const base = {
      ...strykerAt('stryker.conf.json', excluding()),
      ...strykerAt('.stryker.conf.json', excluding('StringLiteral')),
    };
    const head = without(base, 'stryker.conf.json');

    expect(between({ base, head, config: OPTED_IN }).policyLoosenings).toEqual([
      'stryker .stryker.conf.json mutator.excludedMutations: [] -> ["StringLiteral"]',
    ]);
    expect(
      changesOf(
        between({ base: at(excluding('A')), head: { 'src/a.ts': 'x\n' }, config: OPTED_IN }),
      ),
    ).toEqual({
      policyLoosenings: [],
      policyChanges: ['stryker stryker.config.json mutator.excludedMutations: ["A"] -> not set'],
    });
  });

  it('ignores edits to keys nitpicker does not read, comments and layout', () => {
    const base = at({ concurrency: 2, mutate: ['src/**'], reporters: ['json'] });
    const head = {
      'stryker.config.json':
        '{\n  "concurrency": 2,\n  "mutate": ["lib/**"],\n  "reporters": ["html"],\n  "thresholds": { "break": 0 }\n}\n',
      'src/a.ts': 'export const a = 1;\n',
    };

    expect(changesOf(between({ base, head, config: OPTED_IN }))).toEqual(NONE);
  });

  it.each([
    [{ ignoreStatic: true }, { ignoreStatic: false }, 'ignoreStatic: true -> false'],
    [excluding('A', 'B'), excluding('A'), 'mutator.excludedMutations: ["A","B"] -> ["A"]'],
    [
      { ignorePatterns: ['a', 'b'] },
      { ignorePatterns: ['a'] },
      'ignorePatterns: ["a","b"] -> ["a"]',
    ],
    [{ timeoutMS: 1000 }, { timeoutMS: 90_000 }, 'timeoutMS: 1000 -> 90000'],
  ])('reads %j -> %j as a plain change', (base, head, text) => {
    expect(changesOf(between({ base: at(base), head: at(head), config: OPTED_IN }))).toEqual({
      policyLoosenings: [],
      policyChanges: [`stryker stryker.config.json ${text}`],
    });
  });

  it.each([
    [{}, { ignoreStatic: true }, 'ignoreStatic: not set -> true'],
    [{}, { ignorePatterns: ['src'] }, 'ignorePatterns: not set -> ["src"]'],
    [
      { testRunnerNodeArgs: ['a'] },
      { testRunnerNodeArgs: ['a', 'b'] },
      'testRunnerNodeArgs: ["a"] -> ["a","b"]',
    ],
    [{}, { checkerNodeArgs: ['--x'] }, 'checkerNodeArgs: not set -> ["--x"]'],
    [{}, { mutator: { plugins: ['p'] } }, 'mutator.plugins: not set -> ["p"]'],
  ])('reads %j -> %j as loosening', (base, head, text) => {
    expect(between({ base: at(base), head: at(head), config: OPTED_IN }).policyLoosenings).toEqual([
      `stryker stryker.config.json ${text}`,
    ]);
  });

  it('lists the values the config starts to apply when the change opts in', () => {
    const files = at({ ignoreStatic: true, concurrency: 2, reporters: ['html'] });
    const result = between({ base: files, head: files, baseConfig: {}, config: OPTED_IN });

    expect(changesOf(result)).toEqual({
      policyLoosenings: [
        'stryker stryker.config.json ignoreStatic: not set -> true',
        'tools.stryker.precedence: not set -> ["project","nitpicker"]',
      ],
      policyChanges: [
        'stryker stryker.config.json ignoreStatic: not set -> true',
        'tools.stryker.precedence: not set -> ["project","nitpicker"]',
        'stryker stryker.config.json concurrency: not set -> 2',
      ],
    });
  });

  it('does not read the config once the change removes the opt-in', () => {
    const files = at({ ignoreStatic: true });
    const result = between({
      base: files,
      head: at({ ignoreStatic: false }),
      baseConfig: OPTED_IN,
      config: {},
    });

    expect(changesOf(result)).toEqual({
      policyLoosenings: [],
      policyChanges: ['tools.stryker.precedence: ["project","nitpicker"] -> not set'],
    });
  });

  it('falls back to the file text when a side cannot be loaded', () => {
    const broken = { 'stryker.config.mjs': "throw new Error('boom');\n", 'src/a.ts': 'x\n' };
    const edited = { 'stryker.config.mjs': "throw new Error('bang');\n", 'src/a.ts': 'x\n' };

    expect(between({ base: broken, head: edited, config: OPTED_IN }).policyLoosenings).toEqual([
      'stryker project config changed: stryker.config.mjs',
    ]);
    expect(between({ base: broken, head: broken, config: OPTED_IN }).policyLoosenings).toEqual([]);
  });
});
