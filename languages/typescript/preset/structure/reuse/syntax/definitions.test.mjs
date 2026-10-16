import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { fileDefinitions } from './definitions.mjs';

function definitionsOf(text, fileName = 'a.tsx') {
  return fileDefinitions(ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true));
}

function keyOf(text) {
  return definitionsOf(text)[0].text;
}

describe('definition text', () => {
  it('ignore whitespace, comments, doc comments, quote style and the export keyword', () => {
    const plain = keyOf("const LIMIT = ['a', 1];");
    expect(keyOf('/** limit */\nexport const LIMIT = [\n  "a", // first\n  1,\n];')).toBe(plain);
    expect(keyOf("const LIMIT = ['a', 2];")).not.toBe(plain);
  });

  it('compare a function declaration and a function expression by parameters and body', () => {
    const declaration = keyOf('function total(a: number) { return a + 1; }');
    expect(keyOf('export const total = function (a: number) {\n  return a + 1;\n};')).toBe(
      declaration,
    );
    expect(keyOf('function total(a: number) { return a + 2; }')).not.toBe(declaration);
    expect(keyOf('function total(a: string) { return a + 1; }')).not.toBe(declaration);
    expect(keyOf('async function total(a: number) { return a + 1; }')).not.toBe(declaration);
    expect(keyOf('const total = (a: number) => { return a + 1; };')).not.toBe(declaration);
  });

  it('compare type aliases by their type', () => {
    expect(keyOf('export type Id = { value: string };')).toBe(
      keyOf('type Id = {\n  value: string;\n}'),
    );
    expect(keyOf('type Id = { value: number };')).not.toBe(keyOf('type Id = { value: string };'));
  });

  it('ignore semicolons and trailing commas', () => {
    expect(keyOf('const LIMIT = { a: 1, b: [1, 2,], };')).toBe(
      keyOf('const LIMIT = { a: 1, b: [1, 2] }'),
    );
  });

  it('include the overload signatures of a function', () => {
    const body = 'function pick(a: unknown) {\n  return a;\n}';
    const plain = definitionsOf(body)[0].text;
    const overloaded = definitionsOf(`function pick(a: string): string;\n${body}`);

    expect(overloaded).toHaveLength(1);
    expect(overloaded[0].text).not.toBe(plain);
  });
});

describe('free identifiers', () => {
  function freeOf(text) {
    return definitionsOf(text)
      .at(-1)
      .free.map(({ name, binding }) => [name, binding.kind]);
  }

  it('resolve to the import they read, or to a top-level declaration of the file', () => {
    const free = freeOf(
      "import { db } from './db';\nconst limit = 3;\nfunction count() {\n  return db.size + limit;\n}",
    );

    expect(free).toEqual([
      ['db', 'import'],
      ['limit', 'local'],
    ]);
  });

  it('skip names the definition declares, property names and globals', () => {
    expect(
      freeOf(
        [
          "import { item, size } from './db';",
          'function count(item: number) {',
          '  const total = item + Math.max(1, 2);',
          '  return { size: total }.size;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('carry what an import binds: named, default and namespace', () => {
    const [definition] = definitionsOf(
      [
        "import one, * as two from './a';",
        "import { three as four } from './b';",
        'export const f = () => [one, two, four];',
      ].join('\n'),
    ).slice(-1);

    expect(definition.free.map(({ name, binding }) => [name, binding.imported])).toEqual([
      ['four', 'three'],
      ['one', 'default'],
      ['two', '*'],
    ]);
  });
});

describe('definition facts', () => {
  it('count the lines and tokens of a declaration, and mark a default export', () => {
    const [definition] = definitionsOf('export default function Page() {\n  return 1;\n}\n');

    const { name, exported, isDefault, lines, size } = definition;

    expect({ name, exported, isDefault, lines, size }).toEqual({
      name: 'Page',
      exported: true,
      isDefault: true,
      lines: 3,
      size: 5,
    });
    expect(definitionsOf('export function Page() {}')[0].isDefault).toBe(false);
  });
});

describe('definition kinds', () => {
  it('lists functions, consts, types, classes, interfaces and enums with their line and export', () => {
    const definitions = definitionsOf(
      [
        'export function a() {}',
        'const b = () => 1;',
        'export const c = 1;',
        'type D = string;',
        'export class E {}',
        'interface F {}',
        'enum G {}',
        'let h = 1;',
        'function overload(): void;',
        'export default function () {}',
      ].join('\n'),
    );

    expect(
      definitions.map(({ name, kind, exported, line }) => [name, kind, exported, line]),
    ).toEqual([
      ['a', 'function', true, 1],
      ['b', 'function', false, 2],
      ['c', 'const', true, 3],
      ['D', 'type', false, 4],
      ['E', 'class', true, 5],
      ['F', 'interface', false, 6],
      ['G', 'enum', false, 7],
    ]);
  });

  it.each([
    ['1'],
    ["'text'"],
    ['10n'],
    ['true'],
    ['/ab+/u'],
    ['`plain`'],
    ['-1'],
    ["[1, 'a', [true]]"],
    ["{ a: 1, 'b-c': 'x', 2: [3] }"],
    ['{ a: 1 } as const'],
    ['[1, 2] satisfies number[]'],
  ])('treats %s as a literal-only value', (initializer) => {
    expect(definitionsOf(`const X = ${initializer};`)[0].literal).toBe(true);
  });

  it.each([
    ['compute()'],
    ['`a${b}`'],
    ['other'],
    ['[...items]'],
    ['{ a }'],
    ['{ [key]: 1 }'],
    ['{ method() {} }'],
    ['new Date()'],
    ['null'],
  ])('does not treat %s as a literal-only value', (initializer) => {
    expect(definitionsOf(`const X = ${initializer};`)[0].literal).toBe(false);
  });

  it('marks functions and memo or forwardRef wrappers as component candidates', () => {
    const definitions = definitionsOf(
      [
        'const A = memo(function () { return null; });',
        'const B = React.forwardRef((props, ref) => null);',
        'const C = memo(forwardRef(() => null));',
        'const D = other(() => null);',
        'const E = 5;',
      ].join('\n'),
    );

    expect(definitions.map(({ component }) => component)).toEqual([true, true, true, false, false]);
  });
});
