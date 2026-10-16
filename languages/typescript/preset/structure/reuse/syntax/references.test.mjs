import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { fileDynamicImports, fileExports } from './module-facts.mjs';
import { declaredNames, jsxTagNames, referencePositions, referencedNames } from './references.mjs';

function parse(text, fileName = 'a.tsx') {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
}

describe('referenced names', () => {
  it('count reads, calls, types, JSX tags and shorthand properties', () => {
    const file = parse(
      'const a = b + c(); type T = D; const e = <F g={h} />; const i = { j }; k.l.m;',
    );

    expect([...referencedNames([file])].toSorted()).toEqual(['D', 'F', 'b', 'c', 'h', 'j', 'k']);
  });

  it('leave out declarations, property names, qualified names, labels and import or export names', () => {
    const file = parse(
      [
        "import { x as y } from 'm';",
        'export { y as z };',
        'export default y;',
        'const { p: q } = o;',
        'const obj = { key: 1, method() {} };',
        'type U = Ns.Inner;',
        'outer: for (const n of []) { break outer; }',
      ].join('\n'),
    );

    expect([...referencedNames([file])].toSorted()).toEqual(['Ns', 'o']);
  });

  it('list where each name is read in the file', () => {
    const file = parse('const a = 1;\nexport const b = [a, a];\n');

    expect(referencePositions(file).get('a')).toHaveLength(2);
  });
});

describe('declared names', () => {
  it('cover parameters, variables, patterns, functions, classes and type parameters', () => {
    const file = parse(
      'function f<T>(a: T, { b }: { b: number }) { const [c] = [a]; class D {} return function e() { return c; }; }',
    );

    expect([...declaredNames([file])].toSorted()).toEqual(['D', 'T', 'a', 'b', 'c', 'e', 'f']);
  });
});

describe('JSX tag names and dynamic imports', () => {
  it('lists every element tag, namespaced tags included', () => {
    const file = parse('const a = <div><UI.Card /><Chip>text</Chip></div>;');

    expect([...jsxTagNames(file)].toSorted()).toEqual(['Chip', 'UI.Card', 'div']);
  });

  it('lists the string specifiers of import() and require() calls', () => {
    const file = parse(
      "const a = () => import('./a'); const b = require('./b'); const c = import(name); load('./c');",
      'a.ts',
    );

    expect(fileDynamicImports(file)).toEqual(['./a', './b']);
  });

  it('lists export default of an identifier and export * as namespaces', () => {
    const file = parse("const a = 1;\nexport default a;\nexport * as ns from './n';\n", 'a.ts');

    expect(fileExports(file)).toEqual({
      locals: [{ local: 'a', exported: 'default' }],
      namespaces: ['./n'],
      reexports: [],
    });
  });
});
