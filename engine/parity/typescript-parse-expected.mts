// Writes which files of a case list typescript-estree refuses to parse, for comparison with the `!parse` rows of
// `nitpicker-engine typescript-lint`. The parser runs as ESLint runs it: `.cjs` files as CommonJS, the rest as
// modules.
// Usage: node engine/parity/typescript-parse-expected.mts <cases.txt> <out.json>
// A case starts with a line `=== <file name>`; the lines after it, up to the next case, are the file's text.
import { readFileSync, writeFileSync } from 'node:fs';
import * as parser from '@typescript-eslint/parser';

const [cases, out] = process.argv.slice(2);
if (cases === undefined || out === undefined) {
  throw new Error('usage: typescript-parse-expected.mts <cases.txt> <out.json>');
}
const refused: string[] = [];
for (const written of readFileSync(cases, 'utf8').split(/^=== /m).slice(1)) {
  const end = written.indexOf('\n');
  const name = written.slice(0, end);
  try {
    parser.parseForESLint(written.slice(end + 1), {
      filePath: name,
      ecmaVersion: 'latest',
      sourceType: name.endsWith('.cjs') ? 'commonjs' : 'module',
      range: true,
      loc: true,
      tokens: true,
      comment: true,
    });
  } catch {
    refused.push(name);
  }
}
writeFileSync(out, `${JSON.stringify(refused, null, 1)}\n`);
