import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createProject,
  lintProject,
} from '../../../adapters/oxlint/test-support/oxlint-project.mjs';
import { regexpRules } from './regexp-rules.mjs';
import { regexpRuleCases } from './test-support/regexp-cases.mjs';

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import regexp from ${JSON.stringify(import.meta.resolve('eslint-plugin-regexp'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { regexp },
    rules: ${JSON.stringify(regexpRules())},
  },
];
`;

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function sourceFile(rule) {
  return `src/${rule}.ts`;
}

describe('regular expression rules under oxlint', () => {
  it('reports every banned form through the plugin bridge', async () => {
    const sources = Object.fromEntries(
      regexpRuleCases.map(([rule, banned]) => [sourceFile(rule), `${banned}\n`]),
    );
    const root = createProject('nitpicker-regexp-oxlint-', { 'policy.mjs': POLICY, ...sources });
    roots.push(root);

    const results = await lintProject({ root, patterns: ['src/**/*.ts'] });

    const reported = regexpRuleCases.map(([rule]) => {
      const entry = results.find(({ filePath }) => filePath === path.join(root, sourceFile(rule)));
      return [rule, [...new Set((entry?.messages ?? []).map(({ ruleId }) => ruleId))]];
    });
    expect(reported).toEqual(regexpRuleCases.map(([rule]) => [rule, [`regexp/${rule}`]]));
  });
});
