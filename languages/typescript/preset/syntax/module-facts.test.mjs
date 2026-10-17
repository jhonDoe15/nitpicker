import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { exportLine, fileAliasReads, fileDynamicImports, fileExports } from './module-facts.mjs';

function parse(text) {
  return ts.createSourceFile('a.ts', text, ts.ScriptTarget.Latest, true);
}

describe('module facts', () => {
  it('lists the string specifiers of import() and require() calls', () => {
    const file = parse(
      "const a = () => import('./a'); const b = require('./b'); const c = import(name); load('./c');",
    );

    expect(fileDynamicImports(file)).toEqual(['./a', './b']);
  });

  it('lists export default of an identifier and export * as namespaces with their names', () => {
    const file = parse("const a = 1;\nexport default a;\nexport * as ns from './n';\n");

    expect(fileExports(file)).toEqual({
      aliases: [],
      locals: [{ local: 'a', exported: 'default' }],
      namespaces: [{ specifier: './n', name: 'ns' }],
      reexports: [],
    });
  });

  it('lists the consts that are exported as another name of an identifier', () => {
    const file = parse(
      'import { a } from "./a";\nexport const b = a, c = 1, d = a.e;\nconst f = a;\nexport { f };\n',
    );

    expect(fileExports(file).aliases).toEqual([{ local: 'a', exported: 'b' }]);
    expect(fileAliasReads(file).map(({ text }) => text)).toEqual(['a']);
  });

  it('finds the line an export is declared on, whatever the form', () => {
    const file = parse(`export function fn() {}
export const { first, second: [third] } = source;
export default class {}
const local = 1;
export { local as renamed };
export type Shape = { a: 1 };
export interface Face {}
export enum Kind {}
export { other } from './other';
`);
    const lines = ['fn', 'first', 'third', 'default', 'renamed', 'Shape', 'Face', 'Kind', 'other'];

    expect(lines.map((name) => exportLine(file, name))).toEqual([
      1,
      2,
      2,
      3,
      5,
      6,
      7,
      8,
      undefined,
    ]);
  });
});
