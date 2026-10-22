import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { boundaryGuardRule } from '../eslint-plugin/rules/boundaries/no-handwritten-boundary-guard.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-typed-schema-'));
  roots.push(root);
  mkdirSync(path.join(root, 'node_modules/joi'), { recursive: true });
  mkdirSync(path.join(root, 'src'));
  writeFileSync(
    path.join(root, 'node_modules/joi/package.json'),
    '{"name":"joi","types":"index.d.ts"}',
  );
  writeFileSync(
    path.join(root, 'node_modules/joi/index.d.ts'),
    'export interface Schema { validate(value: unknown): unknown }\n',
  );
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    '{"compilerOptions":{"strict":true,"module":"esnext","moduleResolution":"bundler","target":"es2022"},"include":["src"]}',
  );
  writeFileSync(
    path.join(root, 'src/shared.ts'),
    "import type { Schema } from 'joi';\nexport const thing: Schema = {} as Schema;\nexport const other = { validate(value: unknown) { return value; } };\n",
  );
  return root;
}

function lint(root, code) {
  const file = path.join(root, 'src/a.ts');
  writeFileSync(file, code);
  const linter = new Linter({ cwd: root });
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          sourceType: 'module',
          parserOptions: { project: path.join(root, 'tsconfig.json'), tsconfigRootDir: root },
        },
        plugins: { p: { rules: { g: boundaryGuardRule({ validation: ['joi'] }) } } },
        rules: { 'p/g': 'error' },
      },
    ],
    { filename: file },
  );
}

describe('schema receivers with type information', () => {
  it('accepts a receiver whose type comes from the library, whatever its name', () => {
    const root = project();
    const code =
      "import { thing } from './shared';\nexport const a = thing.validate(JSON.parse('1'));\n";

    expect(lint(root, code)).toEqual([]);
  });

  it('flags a receiver with a local type and a name that does not look like a schema', () => {
    const root = project();
    const code =
      "import { other } from './shared';\nexport const a = other.validate(JSON.parse('1'));\n";

    expect(lint(root, code).map(({ line, ruleId }) => [line, ruleId])).toEqual([[2, 'p/g']]);
  });
});
