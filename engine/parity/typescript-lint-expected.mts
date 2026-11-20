// Writes what ESLint reports for a list of files with the testing-library rules of the React preset, for
// comparison with `nitpicker-engine typescript-lint --files <list> --rules <the same rules>`.
// Usage: node engine/parity/typescript-lint-expected.mts <list> <out.json>
// Each line of the list is the path to read, a tab, and the path to report.
import { readFileSync, writeFileSync } from 'node:fs';
import * as parser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import testingLibrary from 'eslint-plugin-testing-library';

const ruleNames = [
  'await-async-events',
  'await-async-queries',
  'await-async-utils',
  'no-debugging-utils',
  'no-manual-cleanup',
  'no-node-access',
  'no-test-id-queries',
  'no-unnecessary-act',
  'prefer-presence-queries',
  'prefer-screen-queries',
  'prefer-user-event',
  'prefer-user-event-setup',
];

const [list, out] = process.argv.slice(2);
if (list === undefined || out === undefined) {
  throw new Error('usage: typescript-lint-expected.mts <list> <out.json>');
}
const files = readFileSync(list, 'utf8')
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => line.split('\t'));
const linter = new Linter();
const rows = [];
for (const [file = '', display = file] of files) {
  const messages = linter.verify(
    readFileSync(file, 'utf8'),
    [
      {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        languageOptions: {
          parser,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        linterOptions: { noInlineConfig: true },
        plugins: { 'testing-library': testingLibrary },
        settings: { 'testing-library/utils-module': 'test-utils' },
        rules: Object.fromEntries(ruleNames.map((name) => [`testing-library/${name}`, 'error'])),
      },
    ],
    { filename: file },
  );
  for (const message of messages) {
    rows.push([
      display,
      message.ruleId,
      message.line,
      message.column,
      message.message,
      ...(message.endLine === undefined ? [] : [message.endLine, message.endColumn]),
    ]);
  }
}
writeFileSync(out, JSON.stringify(rows.toSorted(), undefined, 1));
