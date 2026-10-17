import { describe, expect, it } from 'vitest';
import { describeConfigOverrides } from './config.mjs';
import { validateConfig } from './validate.mjs';

describe('tool precedence', () => {
  it('accepts every ordering of the project and nitpicker configs', () => {
    for (const precedence of [
      ['nitpicker'],
      ['project'],
      ['project', 'nitpicker'],
      ['nitpicker', 'project'],
    ]) {
      expect(validateConfig({ tools: { prettier: { precedence } } })).toBeDefined();
    }
  });

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

  it('rejects unknown tools, unknown keys and malformed precedence lists', () => {
    expect(() => validateConfig({ tools: { stylelint: { precedence: ['project'] } } })).toThrow(
      '"tools" names unknown tool "stylelint". Supported tools with this preset: prettier, eslint, typescript',
    );
    expect(() => validateConfig({ tools: { prettier: { config: 'project' } } })).toThrow(
      '"tools.prettier" has unknown key "config"',
    );
    for (const precedence of [[], ['project', 'project'], ['workspace'], 'project', undefined]) {
      expect(() => validateConfig({ tools: { prettier: { precedence } } })).toThrow(
        new Error(
          'nitpicker.config.json: "tools.prettier.precedence" must list "project", "nitpicker" or both, each once, highest first',
        ),
      );
    }
    expect(() => validateConfig({ preset: 'java', tools: { pmd: { precedence: [] } } })).toThrow(
      new Error(
        'nitpicker.config.json: "tools.pmd.precedence" must list "project", "nitpicker" or both, each once',
      ),
    );
    expect(() => validateConfig({ tools: [] })).toThrow('"tools" must be an object');
  });

  it('lists the tools setting among the config overrides', () => {
    const tools = { prettier: { precedence: ['project', 'nitpicker'] } };
    expect(describeConfigOverrides({ tools })).toEqual([`tools: ${JSON.stringify(tools)}`]);
  });

  it.each(['java', 'kotlin'])(
    'names PMD and Checkstyle with the %s preset and accepts both config layers',
    (preset) => {
      const tools = {
        pmd: { precedence: ['project', 'nitpicker'] },
        checkstyle: { precedence: ['project'] },
      };
      expect(validateConfig({ preset, tools })).toEqual({ preset, tools });
      expect(() =>
        validateConfig({ preset, tools: { prettier: { precedence: ['project'] } } }),
      ).toThrow(
        '"tools" names unknown tool "prettier". Supported tools with this preset: pmd, checkstyle',
      );
      const layered = { preset, tools: { checkstyle: { precedence: ['nitpicker', 'project'] } } };
      expect(validateConfig(layered)).toEqual(layered);
    },
  );

  it('keeps PMD and Checkstyle out of the TypeScript and Python presets', () => {
    const tools = { pmd: { precedence: ['project'] } };
    expect(() => validateConfig({ tools })).toThrow(
      new Error(
        'nitpicker.config.json: "tools" names unknown tool "pmd". Supported tools with this preset: prettier, eslint, typescript',
      ),
    );
    expect(() => validateConfig({ preset: 'python', tools })).toThrow(
      new Error(
        'nitpicker.config.json: "tools" names unknown tool "pmd". Supported tools with this preset: ruff, black, pyright, mypy, mutmut',
      ),
    );
  });
});
