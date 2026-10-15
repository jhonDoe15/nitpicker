import { describe, expect, it } from 'vitest';
import { PRETTIER_CONVENTIONS } from './prettier-conventions.mjs';

const measures = Object.fromEntries(PRETTIER_CONVENTIONS.map(({ id, measure }) => [id, measure]));
const statements = Array.from({ length: 12 }, (_, index) => `const value${String(index)} = read()`);
const shortLines = Array.from(
  { length: 6 },
  () => `  const total = compute(first, second, third, fourth, fifth);`,
);

describe('per-file measures on code that gives no evidence or misleading evidence', () => {
  it.each([
    ['prettier.quotes', `throw new Error('Cannot import from "x"');\n`, undefined],
    ['prettier.quotes', `// import a from "a"\nconst a = require('a');\n`, 'single'],
    ['prettier.semicolons', `${statements.join('\n')}\n`, 'never'],
    [
      'prettier.semicolons',
      `${statements.join('\n')}\nfor (\n  let i = 0;\n  i < n;\n  i++\n) {}\n${statements.join('\n')}\n`,
      undefined,
    ],
    ['prettier.indentation', 'const a = b\n  ? {\n      c: 1,\n    }\n  : d;\n', undefined],
    ['prettier.printWidth', `function f() {\n${shortLines.join('\n')}\n}\n`, undefined],
    [
      'prettier.printWidth',
      'run(\n  firstArgumentValue,\n  secondArgumentValue,\n  thirdArgumentValue,\n  fourthArgument,\n);\n',
      '80',
    ],
    [
      'prettier.trailingCommas',
      'function f(\n  a: string,\n  ...rest: string[]\n) {}\nf(\n  a,\n  b,\n);\n',
      'all',
    ],
    ['prettier.trailingCommas', 'const a = {\n  b: 1,\n  c: 2, // two\n};\n', undefined],
    [
      'prettier.trailingCommas',
      'expect(a).toMatchInlineSnapshot(`\n  {\n    "a": 1\n  }\n`);\n',
      undefined,
    ],
    ['prettier.trailingCommas', 'return (\n  a &&\n  b\n);\n', undefined],
    ['prettier.arrowParens', '/** source.map(x => x) */\nconst f = (a: A): B => a;\n', undefined],
    ['prettier.endOfLine', 'a;\r\nb;\r\nc;\n', 'crlf'],
  ])('%s on %j', (id, text, expected) => {
    expect(measures[id](text)).toBe(expected);
  });
});
