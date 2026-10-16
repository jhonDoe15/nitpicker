import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

describe('tool precedence of the formatters and detekt', () => {
  it('names ruff and black with the python preset, and the formatters with the kotlin preset', () => {
    const python = {
      ruff: { precedence: ['project', 'nitpicker'] },
      black: { precedence: ['project'] },
    };
    const kotlin = {
      ktlint: { precedence: ['project', 'nitpicker'] },
      ktfmt: { precedence: ['nitpicker', 'project'] },
      detekt: { precedence: ['project'] },
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

  it('asks for the project first with ktlint, which reads .editorconfig itself', () => {
    expect(() =>
      validateConfig({
        preset: 'kotlin',
        tools: { ktlint: { precedence: ['nitpicker', 'project'] } },
      }),
    ).toThrow('"tools.ktlint.precedence" must list "project" first');
    expect(
      validateConfig({ preset: 'kotlin', tools: { ktlint: { precedence: ['nitpicker'] } } }),
    ).toBeDefined();
  });
});
