import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../languages/typescript/adapters/eslint/normalize.mts';
import { makeTemporaryRoot } from '../../../languages/typescript/adapters/eslint/test-support/finding-for.mjs';
import { nitpickerRules } from '../../../languages/typescript/preset/eslint-plugin/index.mjs';
import { withoutCrossToolOverlaps } from './cross-tool.mjs';

const CODE = [
  'export function silent() {',
  '  try {',
  '    return String(1);',
  '  } catch (e) {',
  '    return undefined;',
  '  }',
  '}',
  'export function emptyCatch() {',
  '  try {',
  '    return String(1);',
  '  } catch (e) {}',
  '  return undefined;',
  '}',
  'export function emptyTry() {',
  '  try {} catch (e) { return null; }',
  '}',
  '',
].join('\n');

const PRESETS = {
  typescript: {
    file: 'src/catches.ts',
    unused: '@typescript-eslint/no-unused-vars',
    parser: tseslint.parser,
  },
  javascript: { file: 'src/catches.js', unused: 'no-unused-vars', parser: undefined },
};

function lintMessages({ unused, parser }, file) {
  const languageOptions = {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ...(parser === undefined ? {} : { parser }),
  };
  const messages = new Linter().verify(
    CODE,
    [
      {
        files: ['**/*.ts', '**/*.js'],
        languageOptions,
        plugins: { nitpicker: nitpickerRules, '@typescript-eslint': tseslint.plugin },
        rules: {
          'nitpicker/no-silent-catch': 'error',
          'no-empty': 'error',
          [unused]: ['error', { caughtErrors: 'all' }],
        },
      },
    ],
    { filename: file },
  );
  return messages;
}

function reportedRules(preset) {
  const { file } = preset;
  const root = makeTemporaryRoot('nitpicker-one-finding-');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, file), CODE);
  const messages = lintMessages(preset, file);
  const reports = new Map(
    ['eslint-errors', 'eslint-lint'].map((tool) => [
      tool,
      {
        findings: normalizeEslintResults({
          value: [
            {
              filePath: path.join(root, file),
              messages: messages.filter(
                ({ ruleId }) =>
                  (ruleId === 'nitpicker/no-silent-catch') === (tool === 'eslint-errors'),
              ),
            },
          ],
          projectRoot: root,
          analyzerName: tool,
        }),
      },
    ]),
  );
  const run = withoutCrossToolOverlaps({ reports, toolErrors: [] });
  const byLine = {};
  for (const { tool, rule, location } of [...run.reports.values()].flatMap(
    ({ findings }) => findings,
  )) {
    byLine[location.line] = [...(byLine[location.line] ?? []), `${tool}/${rule}`].toSorted(
      (left, right) => left.localeCompare(right),
    );
  }
  return byLine;
}

describe('one finding per mistake with the real rules', () => {
  it.each(Object.entries(PRESETS))(
    'reports a catch that discards its error once, in the %s preset',
    (_name, preset) => {
      expect(reportedRules(preset)).toEqual({
        4: ['eslint-errors/nitpicker/no-silent-catch'],
        11: ['eslint-errors/nitpicker/no-silent-catch'],
        15: ['eslint-errors/nitpicker/no-silent-catch', 'eslint-lint/no-empty'],
      });
    },
  );
});
