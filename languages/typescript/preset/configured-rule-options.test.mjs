import vitest from '@vitest/eslint-plugin';
import { Linter } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import presetConfig from './defaults/eslint.config.mjs';

const presetConfigUrl = pathToFileURL(path.join(import.meta.dirname, 'defaults/eslint.config.mjs'));
const temporaryRoots = [];
let importCount = 0;

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

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

async function ruleSettings(conventions) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-convention-rules-'));
  temporaryRoots.push(root);
  if (conventions !== undefined) {
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, JSON.stringify({ conventions }));
    vi.stubEnv('NITPICKER_POLICY', policyFile);
  }
  importCount += 1;
  const { default: config } = await import(
    `${presetConfigUrl.href}?conventions=${String(importCount)}`
  );
  const settingOf = (ruleId) =>
    config.findLast((entry) => entry.rules?.[ruleId] !== undefined).rules[ruleId];
  return {
    typeImports: settingOf('@typescript-eslint/consistent-type-imports'),
    fileNames: settingOf('nitpicker/file-name-casing'),
  };
}

describe('rules configured from the followed conventions', () => {
  it('keeps separate type imports and kebab-case file names by default', async () => {
    expect(await ruleSettings()).toEqual({
      typeImports: ['error', { disallowTypeAnnotations: false, fixStyle: 'separate-type-imports' }],
      fileNames: ['error', { casing: 'kebab-case' }],
    });
  });

  it('follows inline type imports and the project file name casing', async () => {
    expect(
      await ruleSettings({
        'typescript.typeImports': 'inline',
        'typescript.fileNames': 'snake_case',
      }),
    ).toEqual({
      typeImports: ['error', { disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' }],
      fileNames: ['error', { casing: 'snake_case' }],
    });
  });
});
