import vitest from '@vitest/eslint-plugin';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import presetConfig from './defaults/eslint.config.mjs';

function configured(ruleId) {
  return presetConfig.findLast((entry) => entry.rules?.[ruleId] !== undefined).rules[ruleId];
}

function messages(ruleId, plugins, code) {
  return new Linter()
    .verify(code, [
      {
        languageOptions: { parser: tseslint.parser },
        plugins,
        rules: { [ruleId]: configured(ruleId) },
      },
    ])
    .map(({ message }) => message);
}

function vitestMessages(ruleId, code) {
  return messages(ruleId, { vitest }, code);
}

function tsCommentMessages(code) {
  return messages(
    '@typescript-eslint/ban-ts-comment',
    { '@typescript-eslint': tseslint.plugin },
    code,
  );
}

describe('vitest/valid-expect', () => {
  it('accepts a message argument', () => {
    expect(vitestMessages('vitest/valid-expect', "expect(1, 'why').toBe(1);\n")).toEqual([]);
  });

  it('rejects a third argument', () => {
    expect(vitestMessages('vitest/valid-expect', "expect(1, 'why', 3).toBe(1);\n")).toHaveLength(1);
  });
});

describe('vitest/expect-expect', () => {
  it('counts a type assertion as an assertion', () => {
    const code =
      "it('rejects', () => { expectTypeOf(greet).parameter(0).not.toExtend<number>(); });\n";
    expect(vitestMessages('vitest/expect-expect', code)).toEqual([]);
  });

  it('still reports a test without any assertion', () => {
    expect(
      vitestMessages('vitest/expect-expect', "it('runs', () => { greet('a'); });\n"),
    ).toHaveLength(1);
  });
});

describe('@typescript-eslint/ban-ts-comment', () => {
  it('bans a described @ts-expect-error too', () => {
    const code = '// @ts-expect-error: the value is deliberately wrong here\nconst value = 1;\n';
    expect(tsCommentMessages(code)).toHaveLength(1);
  });

  it('allows @ts-check', () => {
    expect(tsCommentMessages('// @ts-check\nconst value = 1;\n')).toEqual([]);
  });
});

describe('@typescript-eslint/no-unsafe-assignment', () => {
  it('stays on for JavaScript files that the project tsconfig does not check', () => {
    expect(
      presetConfig.filter(
        (entry) => entry.rules?.['@typescript-eslint/no-unsafe-assignment'] === 'off',
      ),
    ).toEqual([]);
  });
});
