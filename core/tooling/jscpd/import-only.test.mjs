import { describe, expect, it } from 'vitest';
import { importsOnly, withoutImportOnlyClones } from './import-only.mjs';

describe('import-only fragments in Python', () => {
  it.each([
    ['plain imports', 'import os\nfrom a import b'],
    ['a parenthesized import', 'from a import (\n    b,\n    c as d,\n)'],
    ['the tail of a parenthesized import', '    b,\n    c,\n)\nimport os'],
    ['a re-export list', '__all__ = [\n    "a",\n    "b",\n]'],
    ['imports with blank lines and comments', 'import os\n\n# kept\nimport sys'],
    ['imports and the line where the clone ends', 'import os\nimport sys\n\nclass Alpha:'],
    ['imports and a decorator where the clone ends', 'import os\nimport sys\n\n@cache'],
    ['imports and an async function where the clone ends', 'import os\n\nasync def run():'],
    ['imports followed by trailing blank lines', 'import os\nimport sys\n\nclass Alpha:\n\n'],
    ['aliases and several names on one line', 'import os, sys as system\nfrom a import b as c, d'],
    ['relative imports', 'from . import a\nfrom .b import c'],
  ])('treats %s as imports only', (_, fragment) => {
    expect(importsOnly(fragment, 'python')).toBe(true);
  });

  it.each([
    ['a function', 'import os\n\ndef f():\n    return os.getcwd()'],
    ['an assignment', 'import os\nVALUE = os.sep\nOTHER = os.linesep'],
    ['a bare statement', 'pass\npass'],
    ['one real line after the imports', 'import os\nimport sys\nx = compute(1, 2, 3)'],
    ['a statement on the import line', "import os; os.system('x')\nimport sys"],
    [
      'a table of numbers',
      `${Array.from({ length: 40 }, (_, index) => `    ${1000 + index},`).join('\n')}\n)`,
    ],
    ['a name list with no import', '    alpha,\n    beta,\n)'],
  ])('treats %s as code', (_, fragment) => {
    expect(importsOnly(fragment, 'python')).toBe(false);
  });
});

describe.each(['java', 'kotlin'])('import-only fragments in %s', (format) => {
  it.each([
    ['imports', 'import a.b.C;\nimport a.b.D;\nimport static a.b.E.f;'],
    ['a package line and imports', 'package a.b;\n\nimport a.b.C;\nimport a.b.*;'],
    ['imports without semicolons', 'import a.b.C\nimport a.b.D as E\nimport a.b.*'],
    ['imports with comments', '// header\nimport a.b.C;\n/* kept\n   here */\nimport a.b.D;'],
    ['imports starting mid-name', 'b.C;\nimport a.b.D;\nimport a.b.E'],
    [
      'imports and the line where the clone ends',
      'import a.b.C;\nimport a.b.D;\n\npublic final class Alpha {',
    ],
    [
      'Kotlin imports and the line where the clone ends',
      'import a.b.C\nimport a.b.D\n\nfun alpha() = 1',
    ],
    [
      'imports and an annotation where the clone ends',
      'import a.b.C;\nimport a.b.D;\n\n@Deprecated',
    ],
    ['imports and a comment where the clone ends', 'import a.b.C;\nimport a.b.D;\n\n/**'],
    [
      'imports and a modified declaration where the clone ends',
      'import a.b.C;\nimport a.b.D;\n\nabstract class Alpha {',
    ],
  ])('treats %s as imports only', (_, fragment) => {
    expect(importsOnly(fragment, format)).toBe(true);
  });

  it.each([
    ['a class after the imports', 'import a.b.C;\n\nclass A {\n  int x;\n}'],
    ['statements', 'import a.b.C;\nint x = 1;\nint y = 2;'],
    ['an annotation', 'import a.b.C;\n@Deprecated\nclass A {'],
    ['one real line after the imports', 'import a.b.C;\nimport a.b.D;\nSystem.out.println(1);'],
    ['a bare name', 'x'],
    ['a keyword line between imports', 'import a.b.C;\nclass\nimport a.b.D;\nimport a.b.E;'],
  ])('treats %s as code', (_, fragment) => {
    expect(importsOnly(fragment, format)).toBe(false);
  });
});

describe.each(['typescript', 'tsx', 'javascript'])('import-only fragments in %s', (format) => {
  it.each([
    ['imports', "import a from 'a';\nimport { b, c } from \"b\";\nimport * as d from 'd';"],
    ['a side-effect import', "import './polyfill';\nimport type { T } from './types';"],
    ['a multi-line import', "import {\n  a,\n  b,\n} from 'x';\nimport c from 'c'"],
    ['the tail of a multi-line import', "  b,\n  c,\n} from 'x';\nimport d from 'd';"],
    [
      'an import cut before its module name',
      "import a from 'a';\nimport b from 'b';\nimport { c, d } from",
    ],
    [
      'imports and the line where the clone ends',
      "import a from 'a';\nimport b from 'b';\n\nexport const alpha = 'a';",
    ],
    ['re-exports', "export * from './a';\nexport { b, c } from './b';\nexport * as d from './d';"],
    ['type re-exports', "export type { T } from './types';\nexport type * from './more';"],
    [
      're-exports and the export where the clone ends',
      "export * from './a';\nexport * from './b';\n\nexport const registry = build();",
    ],
    ['require lines', 'const fs = require(\'fs\');\nconst { a, b } = require("x");'],
    ['imports with comments', "// header\nimport a from 'a'; /* kept */\nimport b from 'b';"],
  ])('treats %s as imports only', (_, fragment) => {
    expect(importsOnly(fragment, format)).toBe(true);
  });

  it.each([
    ['a function after the imports', "import a from 'a';\nexport function f() {\n  return a;\n}"],
    ['constants', "import a from 'a';\nconst x = 1;\nconst y = 'b';"],
    ['calls with a string', "console.log('a');\nconsole.log('b');\nconsole.log('c');"],
    [
      'one real line after the imports',
      "import a from 'a';\nimport b from 'b';\nregistry.add(a, b);",
    ],
    ['a default export of a string', "export default 'a';\nexport default 'b';"],
    ['exported constants', "export const a = 'x';\nexport const b = 'y';"],
    ['a dynamic import', "const m = await import('x');\nconst n = 1;"],
  ])('treats %s as code', (_, fragment) => {
    expect(importsOnly(fragment, format)).toBe(false);
  });
});

describe('importsOnly with an unknown format', () => {
  it('names the format', () => {
    expect(() => importsOnly('x', 'ruby')).toThrow('No import detection for jscpd format "ruby"');
  });
});

describe('withoutImportOnlyClones', () => {
  it('drops the clones made only of imports and keeps the rest, also those without a fragment', () => {
    const imports = { fragment: 'import a.b.C;\nimport a.b.D;' };
    const code = { fragment: 'class A {\n}' };
    const bare = {};

    expect(withoutImportOnlyClones([imports, code, bare], 'java')).toEqual([code, bare]);
  });
});
