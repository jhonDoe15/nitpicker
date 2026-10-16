import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mjs';

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { i18nScopeConfigFor } from ${JSON.stringify(import.meta.resolve('./i18n-scope.mjs'))};
import { resolveLayout } from ${JSON.stringify(import.meta.resolve('../../layout.mjs'))};

export default [
  { languageOptions: { parser: tseslint.parser } },
  ...(await i18nScopeConfigFor(resolveLayout())),
];
`;

const SOURCES = {
  'src/spacing.tsx': [
    "export const a = () => <p>{' '}</p>;",
    'export const b = () => <p>&nbsp;</p>;',
    'export const c = () => <p>-</p>;',
    'export const d = () => <p>42</p>;',
    'export const e = () => <p>Save</p>;',
  ].join('\n'),
  'src/sentences.tsx': [
    'export const a = intl.formatMessage({',
    "  defaultMessage: ' Save ',",
    "  description: 'Button',",
    '});',
    'export const b = intl.formatMessage({',
    "  defaultMessage: '{n}\\u4ef6',",
    "  description: 'Count',",
    '}, { n });',
    'export const c = intl.formatMessage({',
    "  defaultMessage: '{n}MB',",
    "  description: 'Size',",
    '}, { n });',
  ].join('\n'),
  'src/values.tsx': [
    "export const a = () => <FormattedMessage defaultMessage='Hi {name}' description='d' values={extra} />;",
    "export const b = () => <FormattedMessage defaultMessage='Hi {name}' description='d' />;",
    "export const c = intl.formatMessage({ defaultMessage: 'a <b>c', description: 'd' }, {}, { ignoreTag: true });",
    "export const d = intl.formatMessage({ defaultMessage: 'a <b>c', description: 'd' });",
  ].join('\n'),
};

function located(messages) {
  return messages.map(({ ruleId, line, column }) => `${ruleId}@${String(line)}:${String(column)}`);
}

function messagesByFile(root, results) {
  return Object.fromEntries(
    Object.keys(SOURCES).map((file) => [
      file,
      located(results.find((entry) => entry.filePath === path.join(root, file))?.messages ?? []),
    ]),
  );
}

function writeProject(root) {
  writeFileSync(path.join(root, 'policy.mjs'), POLICY);
  for (const [relativePath, text] of Object.entries(SOURCES)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
}

const expected = {
  'src/spacing.tsx': ['formatjs/no-literal-string-in-jsx@5:27'],
  'src/sentences.tsx': [
    'formatjs/prefer-full-sentence@2:19',
    'formatjs/prefer-full-sentence@10:19',
  ],
  'src/values.tsx': ['formatjs/enforce-placeholders@2:57', 'formatjs/no-invalid-icu@4:55'],
};

describe('the i18n rules report the same on both lint engines', () => {
  it('in every source, after the filters', async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-i18n-engines-')));
    try {
      writeProject(root);
      const oxlint = lintWithOxlint({
        options: { projectRoot: root, patterns: ['src/**/*.tsx'] },
        environment: {
          ...process.env,
          NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
          NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
        },
        runEslintCli: () => {
          throw new Error('no rule needs ESLint here');
        },
      });
      const eslint = await new ESLint({
        cwd: root,
        overrideConfigFile: path.join(root, 'policy.mjs'),
      }).lintFiles(['src/**/*.tsx']);

      expect(messagesByFile(root, eslint)).toEqual(expected);
      expect(messagesByFile(root, oxlint)).toEqual(expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
