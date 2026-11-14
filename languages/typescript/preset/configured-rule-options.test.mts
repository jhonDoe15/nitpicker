import vitest from '@vitest/eslint-plugin';
import { Linter } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';
import { checkoutModulePath } from '../../../shared/paths/checkout-module.mjs';
import presetConfig from './defaults/eslint.config.mts';

type Plugins = NonNullable<Linter.Config['plugins']>;

const sourcePath: (file: string) => string = checkoutModulePath;
const presetConfigUrl = pathToFileURL(
  sourcePath(path.join(import.meta.dirname, 'defaults/eslint.config.mjs')),
);
const temporaryRoots: string[] = [];
let importCount = 0;

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function ruleSetting(entry: Linter.Config | undefined, ruleId: string): Linter.RuleEntry {
  const setting = entry?.rules?.[ruleId];
  if (setting === undefined) {
    throw new Error(`No configured entry for ${ruleId}`);
  }
  return setting;
}

function configured(ruleId: string): Linter.RuleEntry {
  return ruleSetting(
    presetConfig.findLast((entry) => entry.rules?.[ruleId] !== undefined),
    ruleId,
  );
}

function singleRuleEntries(ruleId: string, plugins: Plugins): Linter.Config[] {
  return presetConfig
    .filter((entry) => entry.rules?.[ruleId] !== undefined)
    .map((entry) => ({
      ...(entry.files === undefined ? {} : { files: entry.files }),
      ...(entry.ignores === undefined ? {} : { ignores: entry.ignores }),
      plugins,
      languageOptions: { parser: tseslint.parser },
      rules: { [ruleId]: ruleSetting(entry, ruleId) },
    }));
}

function messages(ruleId: string, plugins: Plugins, code: string) {
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

function vitestMessages(ruleId: string, code: string) {
  return messages(ruleId, { vitest }, code);
}

function tsCommentMessages(code: string) {
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

  it('is not applied to the files Vitest runs as type tests', () => {
    const code = "it('compiles', () => { const value: number = 1; });\n";
    const entries = singleRuleEntries('vitest/expect-expect', { vitest });
    const reported = (name: string) =>
      new Linter().verify(code, entries, name).map(({ ruleId }) => ruleId);
    expect(reported('test/api.test.ts')).toEqual(['vitest/expect-expect']);
    expect(reported('test/api.spec.tsx')).toEqual(['vitest/expect-expect']);
    expect(reported('test/api.test-d.ts')).toEqual([]);
    expect(reported('test/types/api.spec-d.tsx')).toEqual([]);
    expect(reported('test/api.test-d.mts')).toEqual([]);
  });

  it('still reports a test without any assertion', () => {
    expect(
      vitestMessages('vitest/expect-expect', "it('runs', () => { greet('a'); });\n"),
    ).toHaveLength(1);
  });
});

describe('@typescript-eslint/no-unused-vars', () => {
  const code = 'export const two = (_state: unknown, _props: unknown, other: unknown) => 2;\n';
  const entries = singleRuleEntries('@typescript-eslint/no-unused-vars', {
    '@typescript-eslint': tseslint.plugin,
  });
  const reported = (name: string) =>
    new Linter().verify(code, entries, name).map(({ message }) => message.split(' ')[0]);

  it('accepts a leading underscore on a parameter in test files as in production code', () => {
    expect(reported('test/arity.test.ts')).toEqual(["'other'"]);
    expect(reported('src/main/arity.ts')).toEqual(["'other'"]);
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

async function ruleSettings(policy?: object) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-convention-rules-'));
  temporaryRoots.push(root);
  if (policy !== undefined) {
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(policy));
    vi.stubEnv('NITPICKER_POLICY', policyFile);
  }
  importCount += 1;
  const { default: config } = await import(
    `${presetConfigUrl.href}?conventions=${String(importCount)}`
  );
  const settingOf = (ruleId: string): unknown =>
    listOf(config)
      .map((entry) => fieldOf(fieldOf(entry, 'rules'), ruleId))
      .findLast((setting) => setting !== undefined);
  const optionsOf = (ruleId: string): unknown => listOf(settingOf(ruleId))[1];
  return {
    typeImports: settingOf('@typescript-eslint/consistent-type-imports'),
    fileNames: settingOf('nitpicker/file-name-casing'),
    assertFunctionNames: fieldOf(optionsOf('vitest/expect-expect'), 'assertFunctionNames'),
    detachedWorkRunners: fieldOf(optionsOf('nitpicker/no-unhandled-void-promise'), 'runners'),
  };
}

describe('rules configured from the followed conventions', () => {
  it('keeps separate type imports and kebab-case file names by default', async () => {
    expect(await ruleSettings()).toEqual({
      typeImports: ['error', { disallowTypeAnnotations: false, fixStyle: 'separate-type-imports' }],
      fileNames: ['error', { casing: 'kebab-case' }],
      assertFunctionNames: ['expect', 'assert', 'expectTypeOf', 'assertType'],
      detachedWorkRunners: [],
    });
  });

  it('follows inline type imports, the file name casing, helpers and runners', async () => {
    expect(
      await ruleSettings({
        conventions: {
          'typescript.typeImports': 'inline',
          'typescript.fileNames': 'snake_case',
          'typescript.assertionHelpers': ['assertOk', 'verifyCalled'],
          'typescript.detachedWorkRunners': ['runDetached'],
        },
      }),
    ).toEqual({
      typeImports: ['error', { disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' }],
      fileNames: ['error', { casing: 'snake_case' }],
      assertFunctionNames: [
        'expect',
        'assert',
        'expectTypeOf',
        'assertType',
        'assertOk',
        'verifyCalled',
      ],
      detachedWorkRunners: ['runDetached'],
    });
  });

  it('marks a pinned file name casing so the folder majority does not apply', async () => {
    const { fileNames } = await ruleSettings({
      conventionPins: { 'typescript.fileNames': 'kebab-case' },
    });

    expect(fileNames).toEqual(['error', { casing: 'kebab-case', pinned: true }]);
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
