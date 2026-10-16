import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

describe('tool settings in the config file', () => {
  it.each([
    ['eslint', ['oxlint', 'eslint'], 'biome'],
    ['typescript', ['native', 'project'], 'tsgo'],
  ])('accepts only the known %s engines', (tool, engines, unknown) => {
    for (const engine of [...engines, undefined]) {
      expect(validateConfig({ tools: { [tool]: { engine } } })).toBeDefined();
    }
    for (const engine of [unknown, '']) {
      expect(() => validateConfig({ tools: { [tool]: { engine } } })).toThrow(
        `"tools.${tool}.engine" must be "${engines[0]}" or "${engines[1]}"`,
      );
    }
    expect(() => validateConfig({ tools: { [tool]: { precedence: ['project'] } } })).toThrow(
      `"tools.${tool}" has unknown key "precedence"`,
    );
  });

  it('accepts only the known test runners', () => {
    for (const runner of ['vitest', 'jest', 'node', 'mocha', undefined]) {
      expect(validateConfig({ tools: { tests: { runner } } })).toBeDefined();
    }
    for (const runner of ['ava', '', 'node:test', 7]) {
      expect(() => validateConfig({ tools: { tests: { runner } } })).toThrow(
        new Error(
          'nitpicker.config.json: "tools.tests.runner" must be "vitest", "jest", "node" or "mocha". ' +
            "It names the runner that runs the project's tests; without it nitpicker follows the " +
            "project's test scripts, runner config files, test-file imports and runner dependencies, " +
            'and stops when they name several runners',
        ),
      );
    }
    expect(() => validateConfig({ tools: { tests: { engine: 'jest' } } })).toThrow(
      '"tools.tests" has unknown key "engine"',
    );
  });

  it.each(['java', 'kotlin'])('rejects the test runner tool under the %s preset', (preset) => {
    expect(() => validateConfig({ preset, tools: { tests: { runner: 'jest' } } })).toThrow(
      new Error(
        'nitpicker.config.json: "tools" names unknown tool "tests". Supported tools with this preset: pmd, checkstyle',
      ),
    );
  });

  it('rejects the test runner tool under the Python preset', () => {
    expect(() =>
      validateConfig({ preset: 'python', tools: { tests: { runner: 'jest' } } }),
    ).toThrow(
      new Error(
        'nitpicker.config.json: "tools" is not supported with "preset": "python": it describes the TypeScript source layout and ESLint rules, which the Python preset does not have. Not supported with python: layout, exceptions, react, i18n, tools, except exceptions for file-lines-limit, line-length-limit, folder-files-limit. Shared by all presets: thresholds, exclude, legacyInventory',
      ),
    );
  });
});
