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
    for (const runner of ['ava', '']) {
      expect(() => validateConfig({ tools: { tests: { runner } } })).toThrow(
        '"tools.tests.runner" must be "vitest", "jest", "node" or "mocha"',
      );
    }
    expect(() => validateConfig({ tools: { tests: { engine: 'jest' } } })).toThrow(
      '"tools.tests" has unknown key "engine"',
    );
  });
});
