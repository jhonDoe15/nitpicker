import { ESLint } from 'eslint';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createProject,
  lintProject,
} from '../../../adapters/oxlint/test-support/oxlint-project.mjs';

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

function messagesIn(root, results, file) {
  const entry = results.find((candidate) => candidate.filePath === path.join(root, file));
  return located(entry?.messages ?? []);
}

const expected = {
  'src/spacing.tsx': ['formatjs/no-literal-string-in-jsx@5:27'],
  'src/sentences.tsx': [
    'formatjs/prefer-full-sentence@2:19',
    'formatjs/prefer-full-sentence@10:19',
  ],
  'src/values.tsx': ['formatjs/enforce-placeholders@2:57', 'formatjs/no-invalid-icu@4:55'],
};

const patterns = ['src/**/*.tsx'];
const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('the i18n rules report the same on both lint engines', () => {
  it('checks every source', () => {
    expect(Object.keys(expected)).toEqual(Object.keys(SOURCES));
  });

  it('reports the expected findings in each source, after the filters', async () => {
    const root = createProject('nitpicker-i18n-engines-', { 'policy.mjs': POLICY, ...SOURCES });
    roots.push(root);
    const oxlint = lintProject({ root, patterns });
    const eslint = await new ESLint({
      cwd: root,
      overrideConfigFile: path.join(root, 'policy.mjs'),
    }).lintFiles(patterns);
    for (const file of Object.keys(expected)) {
      expect({ file, eslint: messagesIn(root, eslint, file) }).toEqual({
        file,
        eslint: expected[file],
      });
      expect({ file, oxlint: messagesIn(root, oxlint, file) }).toEqual({
        file,
        oxlint: expected[file],
      });
    }
  });
});
