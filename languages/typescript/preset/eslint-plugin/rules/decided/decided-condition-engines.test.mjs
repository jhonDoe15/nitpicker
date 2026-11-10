import { rmSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../../adapters/eslint/normalize.mjs';
import { lintWithOxlint } from '../../../../adapters/oxlint/oxlint-runner.mjs';
import { createProject } from '../../../../adapters/oxlint/test-support/oxlint-project.mjs';

const RULE = 'nitpicker/no-decided-condition';
const PATTERNS = ['src/**/*.{ts,mjs}', 'test/**/*.{ts,mjs}'];

function policy({ javascript }) {
  const logic = import.meta.resolve('../../../eslint-config/logic/logic-rules.mjs');
  const layoutModule = import.meta.resolve('../../../layout.mjs');
  const dialect = import.meta.resolve('../../../../../javascript/preset/eslint-dialect.mjs');
  return `import { logicConfigFor } from ${JSON.stringify(logic)};
import { resolveLayout } from ${JSON.stringify(layoutModule)};
import { applyJavascriptDialect } from ${JSON.stringify(dialect)};

const layout = resolveLayout({}, [], { javascript: ${String(javascript)} });
const files = [...layout.sourceGlobs, ...layout.testGlobs];
const parserOptions = { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname };
export default applyJavascriptDialect(logicConfigFor(files, parserOptions), {
  preset: ${javascript ? "'javascript'" : "'typescript'"},
});
`;
}

const TSCONFIG = JSON.stringify({
  compilerOptions: { noEmit: true, types: [], lib: ['ES2023'], strict: true, allowJs: true },
  include: ['src', 'test'],
});

const BANNED = [
  'export function size(count: number): string {',
  '  if (count > 10) {',
  "    return 'many';",
  '  }',
  '  if (count > 20) {',
  "    return 'lots';",
  '  }',
  "  return 'few';",
  '}',
  'export function label(kind: string): string {',
  "  if (kind === 'none') {",
  "    return '';",
  '  }',
  "  return kind === 'none' ? '-' : kind;",
  '}',
].join('\n');

const BANNED_LINES = { ts: [5, 14], mjs: [6, 16] };

const ALLOWED = [
  'export function size(count: number): string {',
  '  if (count > 20) {',
  "    return 'lots';",
  '  }',
  '  if (count > 10) {',
  "    return 'many';",
  '  }',
  "  return 'few';",
  '}',
  'export function label(kind: string): string {',
  "  if (kind === 'none') {",
  "    return '';",
  '  }',
  '  return kind;',
  '}',
].join('\n');

const JSDOC = '/** @param {number} count */\n';
const LABEL_JSDOC = '/** @param {string} kind */\n';

function javascriptOf(source) {
  return source
    .replace('export function size', `${JSDOC}export function size`)
    .replace('export function label', `${LABEL_JSDOC}export function label`)
    .replace('(count: number): string', '(count)')
    .replace('(kind: string): string', '(kind)');
}

const BANNED_JAVASCRIPT = javascriptOf(BANNED);
const ALLOWED_JAVASCRIPT = javascriptOf(ALLOWED);

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(files, { javascript = false } = {}) {
  const root = createProject('nitpicker-decided-condition-', {
    'policy.mjs': policy({ javascript }),
    'tsconfig.json': TSCONFIG,
    ...files,
  });
  roots.push(root);
  return root;
}

function findingsOf(root, results) {
  return normalizeEslintResults({ value: results, projectRoot: root, analyzerName: 'eslint-lint' });
}

function eslintFor(root) {
  return new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'policy.mjs') });
}

async function eslintFindings(root) {
  return findingsOf(root, await eslintFor(root).lintFiles(PATTERNS));
}

async function oxlintFindings(root) {
  const results = await lintWithOxlint({
    options: { projectRoot: root, patterns: PATTERNS },
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: (files) => eslintFor(root).lintFiles(files),
  });
  return findingsOf(root, results);
}

function located(findings) {
  return findings
    .filter(({ rule }) => rule === RULE)
    .map(({ path: file, location }) => `${file}:${String(location.line)}`)
    .sort((left, right) => left.localeCompare(right));
}

function expectedIn(files, extension) {
  return files
    .flatMap((file) => BANNED_LINES[extension].map((line) => `${file}:${String(line)}`))
    .sort((left, right) => left.localeCompare(right));
}

describe.each([
  { javascript: false, extension: 'ts', banned: BANNED, allowed: ALLOWED },
  { javascript: true, extension: 'mjs', banned: BANNED_JAVASCRIPT, allowed: ALLOWED_JAVASCRIPT },
])('decided conditions (javascript: $javascript)', ({ javascript, extension, banned, allowed }) => {
  const files = [`src/main/banned.${extension}`, `test/banned.test.${extension}`];
  const root = project(
    {
      [files[0]]: banned,
      [files[1]]: banned,
      [`src/main/allowed.${extension}`]: allowed,
      [`test/allowed.test.${extension}`]: allowed,
    },
    { javascript },
  );

  it('reports each decided condition on both engines, through the type-aware fallback on oxlint', async () => {
    const [fromOxlint, fromEslint] = await Promise.all([
      oxlintFindings(root),
      eslintFindings(root),
    ]);
    expect(located(fromEslint)).toEqual(expectedIn(files, extension));
    expect(located(fromOxlint)).toEqual(expectedIn(files, extension));
  });
});
