import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { boundaryGuardRule as untypedBoundaryGuardRule } from '../eslint-plugin/rules/boundaries/no-handwritten-boundary-guard.mjs';
import { useTemporaryProjects } from '../test-support/temporary-projects.mts';

const boundaryGuardRule: (options: { validation: string[] }) => unknown = untypedBoundaryGuardRule;

const linterClass: new (options: { cwd: string }) => {
  verify(code: string, config: unknown, options: { filename: string }): Linter.LintMessage[];
} = Linter;

const { projectWith } = useTemporaryProjects('nitpicker-typed-schema-');

function project() {
  return projectWith({
    'node_modules/joi/package.json': '{"name":"joi","types":"index.d.ts"}',
    'node_modules/joi/index.d.ts':
      'export interface Schema { validate(value: unknown): unknown }\n',
    'tsconfig.json':
      '{"compilerOptions":{"strict":true,"module":"esnext","moduleResolution":"bundler","target":"es2022"},"include":["src"]}',
    'src/shared.ts':
      "import type { Schema } from 'joi';\nexport const thing: Schema = {} as Schema;\nexport const other = { validate(value: unknown) { return value; } };\n",
  });
}

function lint(root: string, code: string) {
  const file = path.join(root, 'src/a.ts');
  writeFileSync(file, code);
  const linter = new linterClass({ cwd: root });
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
