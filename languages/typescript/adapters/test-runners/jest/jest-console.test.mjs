import { afterEach, describe, expect, it } from 'vitest';
import {
  JAVASCRIPT_PRESET,
  PICK_JS_SOURCE,
  PICK_SOURCE,
  consoleOutput,
  createRunnerProjects,
  newConsoleOutput,
  runArea,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const COMMON_JS_PICK = PICK_JS_SOURCE.replace('export function', 'function').concat(
  'module.exports = { pick };\n',
);

const TYPESCRIPT = {
  extension: 'ts',
  source: PICK_SOURCE,
  jest: { preset: 'ts-jest', testEnvironment: 'node', verbose: true, silent: true },
  import: "import { pick } from '../src/main/pick';",
  config: {},
};

const JAVASCRIPT = {
  extension: 'js',
  source: COMMON_JS_PICK,
  jest: { testEnvironment: 'node', verbose: true, silent: true },
  import: "const { pick } = require('../src/main/pick');",
  config: { 'nitpicker.config.json': JAVASCRIPT_PRESET },
};

function jestProject(language, tests, script = 'jest') {
  return projects.project({
    'package.json': { name: 'p', private: true, scripts: { test: script }, jest: language.jest },
    'tsconfig.json': { compilerOptions: { strict: true, types: ['jest', 'node'] } },
    [`src/main/pick.${language.extension}`]: language.source,
    ...language.config,
    ...Object.fromEntries(
      Object.entries(tests).map(([name, body]) => [
        `test/${name}.test.${language.extension}`,
        `${language.import}\n${body}\n`,
      ]),
    ),
  });
}

function pickTest(language, [first, second]) {
  return jestProject(language, {
    pick: [
      `it('one', () => {\n${first}  expect(pick(true)).toBe('yes');\n});`,
      `it('two', () => {\n${second}  expect(pick(false)).toBe('no');\n});`,
    ].join('\n'),
  });
}

afterEach(() => {
  projects.remove();
});

describe('test console output on a Jest project', () => {
  it.each([TYPESCRIPT, JAVASCRIPT])(
    'reports only the $extension output the head prints and the base does not, by file',
    async (language) => {
      const old = "  console.warn('old warning about the cart');\n";
      const base = pickTest(language, [old, '']);
      const head = pickTest(language, ['', `${old}  console.error('brand new error');\n`]);

      expect(await newConsoleOutput({ base, head })).toEqual([
        ['test-console-output', `test/pick.test.${language.extension}`, '"brand new error"'],
      ]);
    },
  );

  it.each([
    { jest: { testEnvironment: 'node', silent: true }, script: 'jest -i', files: ['a', 'b'] },
    { jest: { testEnvironment: 'node' }, script: 'jest', files: ['a'] },
  ])(
    'passes a run in band whose timer logs after its file, and does not see that log ($script)',
    async ({ jest, script, files }) => {
      const body = [
        "it('leaves a timer', () => {",
        "  setTimeout(() => console.warn('after the file'), 100);",
        "  expect(pick(true) + pick(false)).toBe('yesno');",
        '});',
      ].join('\n');
      const project = jestProject(
        { ...JAVASCRIPT, jest },
        Object.fromEntries(files.map((file) => [file, body])),
        script,
      );

      expect(await consoleOutput(project)).toEqual([]);
    },
  );

  it('still fails a run whose timer logs late when Jest also exits 1 for an obsolete snapshot', async () => {
    const project = projects.project({
      'package.json': { name: 'p', private: true, scripts: { test: 'jest' } },
      'src/main/pick.js': COMMON_JS_PICK,
      'nitpicker.config.json': JAVASCRIPT_PRESET,
      'test/pick.test.js': [
        "const { pick } = require('../src/main/pick');",
        "it('says yes', () => {",
        "  setTimeout(() => console.warn('late'), 100);",
        "  expect(pick(true) + pick(false)).toBe('yesno');",
        '});',
        '',
      ].join('\n'),
      'test/__snapshots__/pick.test.js.snap': [
        '// Jest Snapshot v1, https://jestjs.io/docs/snapshot-testing',
        '',
        'exports[`removed test 1`] = `"old"`;',
        '',
      ].join('\n'),
    });

    await expect(runArea('coverage', project)).rejects.toThrow(
      /^Jest exited 1 although no test failed\n[^]*1 snapshot obsolete/u,
    );
  });

  it('words a failed assert as the other runners do and reads a grouped call whole', async () => {
    const project = jestProject(JAVASCRIPT, {
      pick: [
        "it('asserts', () => {",
        "  console.assert(pick(true) === 'no', 'expected no');",
        "  console.group('door');",
        "  console.warn('at the door');",
        '  console.groupEnd();',
        "  expect(pick(false)).toBe('no');",
        '});',
      ].join('\n'),
    });

    expect(await consoleOutput(project)).toEqual([
      ['test-console-output', 'test/pick.test.js', '"Assertion failed: expected no"'],
      ['test-console-output', 'test/pick.test.js', '"at the door"'],
    ]);
  });
});
