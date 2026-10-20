import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strykerPlugins } from './plugin.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(source, extra = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-mutation-types-'));
  roots.push(root);
  const files = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true, types: [], lib: ['ES2022'], skipLibCheck: true },
      include: ['src'],
    }),
    'src/main.ts': source,
    ...extra,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  const checker = strykerPlugins[0].factory({ tsconfigFile: path.join(root, 'tsconfig.json') });
  checker.init();
  return { root, checker };
}

function mutant(root, source, { id, from, replacement }) {
  const offset = source.indexOf(from);
  const before = source.slice(0, offset).split('\n');
  const start = { line: before.length - 1, column: before.at(-1).length };
  return {
    id,
    fileName: path.join(root, 'src/main.ts'),
    replacement,
    location: { start, end: { line: start.line, column: start.column + from.length } },
  };
}

describe('mutation checking with existing diagnostics', () => {
  it('passes runnable mutants despite legacy errors and rejects newly invalid mutants', () => {
    const source =
      "export const legacy: number = 'oops';\nexport function add(a: number, b: number): number { return a + b; }\n";
    const { root, checker } = project(source);
    const result = checker.check([
      mutant(root, source, { id: 'valid', from: 'a + b', replacement: 'a - b' }),
      mutant(root, source, { id: 'invalid', from: 'a + b', replacement: "'wrong'" }),
    ]);
    expect(result.valid).toEqual({ status: 'passed' });
    expect(result.invalid).toEqual({
      status: 'compileError',
      reason: "Type 'string' is not assignable to type 'number'.",
    });
  });

  it('counts duplicate diagnostics rather than exempting every occurrence of a legacy error', () => {
    const source =
      "declare function consume(value: number): void;\nexport function old(): number { consume('oops'); return 1; }\n";
    const { root, checker } = project(source);
    const result = checker.check([
      mutant(root, source, {
        id: 'additional',
        from: 'return 1',
        replacement: "consume('oops'); return 1",
      }),
    ]);
    expect(result.additional).toEqual({
      status: 'compileError',
      reason: "Argument of type 'string' is not assignable to parameter of type 'number'.",
    });
  });

  it('keeps unchanged diagnostics baselined when a replacement moves later locations', () => {
    const source = "export const value = 1; export const legacy: number = 'oops';\n";
    const { root, checker } = project(source);
    expect(
      checker.check([mutant(root, source, { id: 'shift', from: '1;', replacement: '1000000;' })]),
    ).toEqual({ shift: { status: 'passed' } });
  });

  it('checks mutants in referenced projects even when the root config has no files', () => {
    const source =
      "export const legacy: number = 'oops';\nexport function add(): number { return 1; }\n";
    const { root, checker } = project(source, {
      'tsconfig.json': JSON.stringify({ files: [], references: [{ path: './project' }] }),
      'project/tsconfig.json': JSON.stringify({
        compilerOptions: {
          strict: true,
          types: [],
          lib: ['ES2022'],
          composite: true,
          skipLibCheck: true,
          rootDir: '..',
        },
        include: ['../src'],
      }),
    });
    expect(
      checker.check([
        mutant(root, source, { id: 'referenced', from: 'return 1', replacement: "return 'wrong'" }),
      ]),
    ).toEqual({
      referenced: {
        status: 'compileError',
        reason: "Type 'string' is not assignable to type 'number'.",
      },
    });
  });

  it.each([
    [
      'js',
      '/** @returns {number} */\nexport function add() { return 1; }\n',
      { allowJs: true, checkJs: true },
    ],
    [
      'tsx',
      'declare global { namespace JSX { interface IntrinsicElements { div: object; } } }\nexport function add(): number { const element = <div/>; return 1; }\n',
      { jsx: 'preserve' },
    ],
  ])(
    'preserves compiler checks for %s projects with existing errors',
    (extension, source, compilerOptions) => {
      const { root, checker } = project("export const legacy: number = 'oops';\n", {
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            strict: true,
            types: [],
            lib: ['ES2022'],
            skipLibCheck: true,
            ...compilerOptions,
          },
          include: ['src'],
        }),
        [`src/extra.${extension}`]: source,
      });
      const candidate = {
        ...mutant(root, source, { id: 'typed', from: 'return 1', replacement: "return 'wrong'" }),
        fileName: path.join(root, `src/extra.${extension}`),
      };
      expect(checker.check([candidate])).toEqual({
        typed: {
          status: 'compileError',
          reason: "Type 'string' is not assignable to type 'number'.",
        },
      });
    },
  );
});
