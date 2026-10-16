import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { fileDynamicImports, fileExports } from './module-facts.mjs';

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
      locals: [{ local: 'a', exported: 'default' }],
      namespaces: [{ specifier: './n', name: 'ns' }],
      reexports: [],
    });
  });
});
