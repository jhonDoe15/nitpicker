import { describe, expect, it } from 'vitest';
import { describeConfigOverrides } from './config.mjs';
import { validateConfig } from './validate.mjs';

describe('tool precedence', () => {
  it.each([[['nitpicker']], [['project']], [['project', 'nitpicker']], [['nitpicker', 'project']]])(
    'accepts the ordering %j of the project and nitpicker configs',
    (precedence) => {
      expect(validateConfig({ tools: { prettier: { precedence } } })).toBeDefined();
      expect(validateConfig({ preset: 'javascript', tools: { eslint: { precedence } } })).toEqual({
        preset: 'javascript',
        tools: { eslint: { precedence } },
      });
    },
  );

  it('takes the ESLint precedence next to its engine and checks both', () => {
    const tools = { eslint: { engine: 'eslint', precedence: ['nitpicker', 'project'] } };
    expect(validateConfig({ tools })).toEqual({ tools });
    expect(() =>
      validateConfig({ tools: { eslint: { engine: 'oxlint', precedence: ['eslint'] } } }),
    ).toThrow(
      new Error(
        'nitpicker.config.json: "tools.eslint.precedence" must list "project", "nitpicker" or both, each once, highest first',
      ),
    );
    expect(() =>
      validateConfig({ tools: { eslint: { engine: 'biome', precedence: ['project'] } } }),
    ).toThrow('"tools.eslint.engine" must be "oxlint" or "eslint"');
  });

  it.each([
    ['eslint', ['oxlint', 'eslint']],
    ['typescript', ['native', 'project']],
  ])('accepts the known %s engines', (tool, engines) => {
    const accepted = [...engines, undefined].map((engine) =>
      validateConfig({ tools: { [tool]: { engine } } }),
    );
    expect(accepted).toEqual(
      [...engines, undefined].map((engine) => ({ tools: { [tool]: { engine } } })),
    );
  });

  it('has no precedence for the TypeScript compiler', () => {
    expect(() => validateConfig({ tools: { typescript: { precedence: ['project'] } } })).toThrow(
      '"tools.typescript" has unknown key "precedence"',
    );
  });

  it.each([
    ['eslint', 'biome', ['oxlint', 'eslint']],
    ['eslint', '', ['oxlint', 'eslint']],
    ['typescript', 'tsgo', ['native', 'project']],
    ['typescript', '', ['native', 'project']],
  ])('rejects the %s engine %j', (tool, unknown, engines) => {
    expect(() => validateConfig({ tools: { [tool]: { engine: unknown } } })).toThrow(
      `"tools.${tool}.engine" must be "${engines[0]}" or "${engines[1]}"`,
    );
  });

  it('rejects unknown tools, unknown keys and malformed precedence lists', () => {
    expect(() => validateConfig({ tools: { stylelint: { precedence: ['project'] } } })).toThrow(
      '"tools" names unknown tool "stylelint". Supported tools with this preset: prettier, jscpd, stryker, eslint, typescript, tests',
    );
    expect(() => validateConfig({ tools: { prettier: { config: 'project' } } })).toThrow(
      '"tools.prettier" has unknown key "config"',
    );
    expect(() => validateConfig({ preset: 'java', tools: { pmd: { precedence: [] } } })).toThrow(
      new Error(
        'nitpicker.config.json: "tools.pmd.precedence" must list "project", "nitpicker" or both, each once',
      ),
    );
    expect(() => validateConfig({ tools: [] })).toThrow('"tools" must be an object');
  });

  it.each([[[]], [['project', 'project']], [['workspace']], ['project'], [undefined]])(
    'rejects the malformed precedence %j',
    (precedence) => {
      expect(() => validateConfig({ tools: { prettier: { precedence } } })).toThrow(
        new Error(
          'nitpicker.config.json: "tools.prettier.precedence" must list "project", "nitpicker" or both, each once, highest first',
        ),
      );
    },
  );

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
        `"tools" names unknown tool "prettier". Supported tools with this preset: pmd, checkstyle${preset === 'kotlin' ? ', ktlint, ktfmt, detekt' : ''}, jscpd`,
      );
      const layered = { preset, tools: { checkstyle: { precedence: ['nitpicker', 'project'] } } };
      expect(validateConfig(layered)).toEqual(layered);
    },
  );

  it('keeps PMD and Checkstyle out of the TypeScript and Python presets', () => {
    const tools = { pmd: { precedence: ['project'] } };
    expect(() => validateConfig({ tools })).toThrow(
      new Error(
        'nitpicker.config.json: "tools" names unknown tool "pmd". Supported tools with this preset: prettier, jscpd, stryker, eslint, typescript, tests',
      ),
    );
    expect(() => validateConfig({ preset: 'python', tools })).toThrow(
      new Error(
        'nitpicker.config.json: "tools" names unknown tool "pmd". Supported tools with this preset: ruff, black, pyright, mypy, mutmut, jscpd',
      ),
    );
  });
  it('accepts the known test runners', () => {
    const accepted = ['vitest', 'jest', 'node', 'mocha', undefined].map((runner) =>
      validateConfig({ tools: { tests: { runner } } }),
    );
    expect(accepted).not.toContain(undefined);
  });

  it.each(['ava', ''])('rejects the test runner %j', (runner) => {
    expect(() => validateConfig({ tools: { tests: { runner } } })).toThrow(
      '"tools.tests.runner" must be "vitest", "jest", "node" or "mocha"',
    );
  });

  it('rejects unknown keys of the tests tool', () => {
    expect(() => validateConfig({ tools: { tests: { engine: 'jest' } } })).toThrow(
      '"tools.tests" has unknown key "engine"',
    );
  });
});

describe('TypeScript project config', () => {
  it('accepts a config path independently of the compiler engine', () => {
    expect(
      validateConfig({
        tools: { typescript: { project: 'config/types.json', engine: 'project' } },
      }),
    ).toBeDefined();
  });
  it.each([
    '',
    42,
    null,
    '/tmp/tsconfig.json',
    '../tsconfig.json',
    'C:\\tsconfig.json',
    'config/../tsconfig.json',
    '*.json',
    'tsconfig',
    'bad\0.json',
  ])('rejects an unsafe or malformed config path %s', (project) => {
    expect(() => validateConfig({ tools: { typescript: { project } } })).toThrow(
      '"tools.typescript.project"',
    );
  });
});
