import { afterEach, describe, expect, it } from 'vitest';
import {
  PICK_JS_SOURCE,
  PICK_SOURCE,
  createRunnerProjects,
  newConsoleOutput,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const TYPESCRIPT = {
  extension: 'ts',
  source: PICK_SOURCE,
  jest: { preset: 'ts-jest', testEnvironment: 'node', verbose: true, silent: true },
  import: "import { pick } from '../src/main/pick';",
};

const JAVASCRIPT = {
  extension: 'js',
  source: PICK_JS_SOURCE.replace('export function', 'function').concat(
    'module.exports = { pick };\n',
  ),
  jest: { testEnvironment: 'node', verbose: true, silent: true },
  import: "const { pick } = require('../src/main/pick');",
};

function jestProject(language, warning) {
  const call = warning === undefined ? '' : `  console.warn('${warning}');\n`;
  return projects.project({
    'package.json': {
      name: 'p',
      private: true,
      scripts: { test: 'jest' },
      jest: language.jest,
    },
    'tsconfig.json': { compilerOptions: { strict: true, types: ['jest', 'node'] } },
    [`src/main/pick.${language.extension}`]: language.source,
    [`test/pick.test.${language.extension}`]: `${language.import}\nit('says yes', () => {\n${call}  expect(pick(true)).toBe('yes');\n});\n`,
  });
}

afterEach(() => {
  projects.remove();
});

describe('test console output on a Jest project', () => {
  it.each([TYPESCRIPT, JAVASCRIPT])(
    'reports a $extension warning the head prints and the base does not, by file',
    async (language) => {
      expect(await newConsoleOutput(jestProject(language, undefined))).toEqual([]);
      expect(await newConsoleOutput(jestProject(language, 'Warning: leaked timer'))).toEqual([
        ['test-console-output', `test/pick.test.${language.extension}`, '"Warning: leaked timer"'],
      ]);
    },
  );
});
