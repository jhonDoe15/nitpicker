import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

describe('tool precedence of the formatters and detekt', () => {
  it('names ruff and black with the python preset, and the formatters with the kotlin preset', () => {
    const python = {
      ruff: { precedence: ['nitpicker', 'project'] },
      black: { precedence: ['project'] },
    };
    const kotlin = {
      ktlint: { precedence: ['project', 'nitpicker'] },
      ktfmt: { precedence: ['project'] },
      detekt: { precedence: ['nitpicker', 'project'] },
    };

    expect(validateConfig({ preset: 'python', tools: python }).tools).toEqual(python);
    expect(validateConfig({ preset: 'kotlin', tools: kotlin }).tools).toEqual(kotlin);
    expect(() =>
      validateConfig({ preset: 'java', tools: { ktlint: { precedence: ['project'] } } }),
    ).toThrow(
      '"tools" names unknown tool "ktlint". Supported tools with this preset: pmd, checkstyle',
    );
    expect(() => validateConfig({ preset: 'python', tools: { ruff: { precedence: [] } } })).toThrow(
      '"tools.ruff.precedence" must list "project", "nitpicker" or both, each once',
    );
  });

  it('names the type checkers and mutmut with the python preset, and not basedpyright', () => {
    const tools = {
      pyright: { precedence: ['project', 'nitpicker'] },
      mypy: { precedence: ['project'] },
      mutmut: { precedence: ['nitpicker', 'project'] },
    };

    expect(validateConfig({ preset: 'python', tools }).tools).toEqual(tools);
    expect(() =>
      validateConfig({ preset: 'python', tools: { basedpyright: { precedence: ['project'] } } }),
    ).toThrow(
      '"tools" names unknown tool "basedpyright". Supported tools with this preset: ruff, black, pyright, mypy, mutmut',
    );
  });

  it.each([['ktlint'], ['ktfmt']])(
    'asks for the project first with %s, which reads .editorconfig itself',
    (tool) => {
      expect(() =>
        validateConfig({
          preset: 'kotlin',
          tools: { [tool]: { precedence: ['nitpicker', 'project'] } },
        }),
      ).toThrow(`"tools.${tool}.precedence" must list "project" first`);
      expect(
        validateConfig({ preset: 'kotlin', tools: { [tool]: { precedence: ['nitpicker'] } } }),
      ).toBeDefined();
    },
  );

  it('asks for the project first with black, which cannot switch string normalization on', () => {
    expect(() =>
      validateConfig({
        preset: 'python',
        tools: { black: { precedence: ['nitpicker', 'project'] } },
      }),
    ).toThrow(
      '"tools.black.precedence" must list "project" first: black has no flag that switches string normalization back on',
    );
    expect(
      validateConfig({
        preset: 'python',
        tools: { black: { precedence: ['project', 'nitpicker'] } },
      }),
    ).toBeDefined();
  });
});
