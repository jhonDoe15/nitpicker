import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../eslint/test-support/finding-comparison.mts';
import type { EslintFinding } from '../eslint/typed/engine.mts';
import { rule } from '../../preset/eslint-plugin/rules/test-runtime/environment/no-unused-dom-environment.mts';
import { normalizeEslintResults } from '../eslint/normalize.mts';
import { lintWithOxlint } from './oxlint-runner.mts';
import type { LintResult } from './plan/oxlint-shapes.mts';
import { oxlintOptions } from './test-support/oxlint-runs.mts';

const RULE = 'nitpicker/no-unused-dom-environment';
const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { nitpickerRules } from ${JSON.stringify(checkoutModuleUrl(new URL('../../preset/eslint-plugin/index.mjs', import.meta.url)).href)};

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
type Linted = { readonly root: string; readonly results: readonly LintResult[] };

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function lintProject(sources: Readonly<Record<string, string>>) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-dom-environment-')));
  roots.push(root);
  writeFileSync(path.join(root, 'policy.mjs'), POLICY);
  for (const [relativePath, text] of Object.entries(sources)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  const results = await lintWithOxlint({
    options: oxlintOptions(root, ['src/**/*.ts']),
    projectConfigPath: undefined,
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

function reportsOf({ root, results }: Linted, relativePath: string) {
  const result = results.find((entry) => entry.filePath === path.join(root, relativePath));
  return (result?.messages ?? []).map(({ ruleId, line, message, messageId }) => ({
    ruleId,
    line,
    message,
    messageId,
  }));
}

const projectMessage = (environment: string) =>
  rule.meta.messages.unusedProjectEnvironment
    .replaceAll('{{environment}}', environment)
    .replaceAll('{{directive}}', directive);
const directiveMessage = (environment: string) =>
  rule.meta.messages.unusedDirectiveOverDomProject
    .replace('{{environment}}', environment)
    .replace('{{directive}}', directive);

describe('no-unused-dom-environment under the oxlint engine', () => {
  let linted: Linted;

  beforeAll(async () => {
    linted = await lintProject(SOURCES);
  });

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
  let linted: Linted;

  beforeAll(async () => {
    linted = await lintProject({ ...SOURCES, ...variants });
  });
  const findingOf = (relativePath: string) =>
    normalizeEslintResults({
      value: linted.results.filter((entry) => entry.filePath.endsWith(relativePath)),
      projectRoot: linted.root,
      analyzerName: 'eslint-lint',
    });
  const movedTo = (findings: readonly EslintFinding[], relativePath: string) =>
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
      touchedCode: undefined,
      unknownOnBase: undefined,
    });
    expect(base).toHaveLength(1);
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
});
