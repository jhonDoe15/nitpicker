import { describe, expect, it } from 'vitest';
import { TYPE_IMPORT_CONVENTION, typeImportFixStyle } from './type-import-style.mjs';

const style = (text) => TYPE_IMPORT_CONVENTION.measure(text, 'src/a.ts');

describe('type import style votes', () => {
  it.each([
    ["import type { A } from './a';\n", 'separate'],
    ["import type A from './a';\n", 'separate'],
    ["import type * as Types from './a';\n", 'separate'],
    ["import { type A } from './a';\n", 'inline'],
    ["import { b, type A } from './a';\n", 'inline'],
    ["import B, { type A } from './a';\n", 'inline'],
    ["import {\n  b,\n  type A,\n  type C,\n} from './a';\n", 'inline'],
    [
      "import type { A } from './a';\nimport { type B } from './b';\nimport type C from './c';\n",
      'separate',
    ],
    ["import type { A } from './a';\nimport { type B } from './b';\n", undefined],
    ["import { a, b } from './a';\n", undefined],
    ["import { type, other } from './a';\n", undefined],
    ["import { type as renamed } from './a';\n", undefined],
    ["import type from './a';\n", undefined],
    ["export type { A } from './a';\n", undefined],
    ["// import type { A } from './a';\nimport { a } from './a';\n", undefined],
    ["const text = `\nimport { type A } from './a';\n`;\n", undefined],
  ])('%j votes %s', (text, expected) => {
    expect(style(text)).toBe(expected);
  });

  it('maps the choice to the rule fix style', () => {
    expect(typeImportFixStyle()).toBe('separate-type-imports');
    expect(typeImportFixStyle({ 'typescript.typeImports': 'inline' })).toBe('inline-type-imports');
  });
});
