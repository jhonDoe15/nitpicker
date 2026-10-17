import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { rule } from '../../preset/eslint-plugin/rules/testing/environment/no-unused-dom-environment.mjs';
import { normalizeEslintResults } from '../eslint/normalize.mjs';
import { lintWithOxlint } from './oxlint-runner.mjs';

const RULE = 'nitpicker/no-unused-dom-environment';
const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { nitpickerRules } from ${JSON.stringify(import.meta.resolve('../../preset/eslint-plugin/index.mjs'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: { '${RULE}': ['error', { environment: 'jsdom' }] },
  },
  {
    files: ['src/node/**/*.ts'],
    rules: { '${RULE}': ['error', { environment: 'node' }] },
  },
];
`;
const directive = ['@vitest', 'environment'].join('-');
const LOGIC = "it('adds', () => { expect(1 + 1).toBe(2); });\n";
const SOURCES = {
  'src/pure.test.ts': LOGIC,
  'src/docblock.test.ts': `/** ${directive} happy-dom */\n${LOGIC}`,
  'src/renders.test.ts': `import { render } from '@testing-library/react';\n${LOGIC}render(null);\n`,
  'src/globals.test.ts': `${LOGIC}document.body.innerHTML = '';\nconst url = new URL('https://example.test');\n`,
  'src/node/pure.test.ts': LOGIC,
  'src/format.ts': 'export const format = String;\n',
};
const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function lintProject(sources) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-dom-environment-')));
  roots.push(root);
  writeFileSync(path.join(root, 'policy.mjs'), POLICY);
  for (const [relativePath, text] of Object.entries(sources)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  const results = lintWithOxlint({
    options: { projectRoot: root, patterns: ['src/**/*.ts'] },
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => {
      throw new Error('no rule needs ESLint here');
    },
  });
  return { root, results };
}

function reportsOf({ root, results }, relativePath) {
  const result = results.find((entry) => entry.filePath === path.join(root, relativePath));
  return (result?.messages ?? []).map(({ ruleId, line, message, messageId }) => ({
    ruleId,
    line,
    message,
    messageId,
  }));
}

const projectMessage = (environment) =>
  rule.meta.messages.unusedProjectEnvironment.replaceAll('{{environment}}', environment);
const directiveMessage = (environment) =>
  rule.meta.messages.unusedDirectiveOverDomProject
    .replace('{{environment}}', environment)
    .replace('{{directive}}', directive);

describe('no-unused-dom-environment under the oxlint engine', () => {
  const linted = lintProject(SOURCES);

  it('reports the full message and message id for a file that never uses the DOM', () => {
    expect(reportsOf(linted, 'src/pure.test.ts')).toEqual([
      {
        ruleId: RULE,
        line: 1,
        message: projectMessage('jsdom'),
        messageId: 'unusedProjectEnvironment',
      },
    ]);
  });

  it('reports on the directive and names the declared environment', () => {
    expect(reportsOf(linted, 'src/docblock.test.ts')).toEqual([
      {
        ruleId: RULE,
        line: 1,
        message: directiveMessage('happy-dom'),
        messageId: 'unusedDirectiveOverDomProject',
      },
    ]);
  });

  it('passes files that import a DOM library or use a DOM global, and node-default files', () => {
    expect(reportsOf(linted, 'src/renders.test.ts')).toEqual([]);
    expect(reportsOf(linted, 'src/globals.test.ts')).toEqual([]);
    expect(reportsOf(linted, 'src/node/pure.test.ts')).toEqual([]);
  });
});

describe('a no-unused-dom-environment finding under the oxlint engine', () => {
  const variants = {
    'src/pure-with-import.test.ts': `import { format } from './format';\n${LOGIC}`,
    'src/pure-with-comment.test.ts': `\n// subject\n${LOGIC}`,
    'src/pure-renamed.test.ts': LOGIC.replace('adds', 'sums'),
    'src/directive.test.ts': `/** ${directive} jsdom */\n${LOGIC}`,
    'src/directive-with-import.test.ts': `import { format } from './format';\n/** ${directive} jsdom */\n${LOGIC}`,
  };
  const linted = lintProject({ ...SOURCES, ...variants });
  const findingOf = (relativePath) =>
    normalizeEslintResults({
      value: linted.results.filter((entry) => entry.filePath.endsWith(relativePath)),
      projectRoot: linted.root,
      analyzerName: 'eslint-lint',
    });
  const movedTo = (findings, relativePath) =>
    findings.map((finding) => ({ ...finding, path: relativePath }));

  it.each([
    ['gains an import above the first line', 'src/pure.test.ts', 'src/pure-with-import.test.ts'],
    ['gains a blank line and a comment above', 'src/pure.test.ts', 'src/pure-with-comment.test.ts'],
    ['has a changed first line', 'src/pure.test.ts', 'src/pure-renamed.test.ts'],
    [
      'has a directive that gains an import above',
      'src/directive.test.ts',
      'src/directive-with-import.test.ts',
    ],
  ])('stays unchanged when the file %s', (_name, basePath, headPath) => {
    const base = findingOf(basePath);
    const result = compareFindings({
      baseFindings: base,
      headFindings: movedTo(findingOf(headPath), basePath),
    });
    expect(base).toHaveLength(1);
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
});
