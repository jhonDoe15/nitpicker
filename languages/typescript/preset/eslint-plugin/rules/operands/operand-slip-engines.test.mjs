import { rmSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../../adapters/eslint/normalize.mjs';
import { lintWithOxlint } from '../../../../adapters/oxlint/oxlint-runner.mjs';
import { createProject } from '../../../../adapters/oxlint/test-support/oxlint-project.mjs';

const RULE = 'nitpicker/no-operand-slip';
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
  'export function width(start: boolean, end: boolean): number {',
  '  if (end || end) {',
  '    return 40;',
  '  }',
  '  return start ? 20 : 0;',
  '}',
  'export const inRange = (x: number) => x < 3 && x > 5;',
  'export const isNumber = (x: number) => x === x;',
  'export function add(total: number, price: number): number {',
  '  let sum = total;',
  '  sum += sum + price;',
  '  return sum;',
  '}',
].join('\n');

const BANNED_LINES = [2, 7, 8, 11];

const ALLOWED = [
  'export function width(start: boolean, end: boolean): number {',
  '  if (start || end) {',
  '    return 40;',
  '  }',
  '  return 0;',
  '}',
  'export const inRange = (x: number) => x > 3 && x < 5;',
  'export const isNumber = (x: number) => !Number.isNaN(x);',
  'export function add(total: number, price: number): number {',
  '  let sum = total;',
  '  sum += price;',
  '  return sum;',
  '}',
].join('\n');

const BANNED_JAVASCRIPT = BANNED.replaceAll(': number', '').replaceAll(': boolean', '');
const ALLOWED_JAVASCRIPT = ALLOWED.replaceAll(': number', '').replaceAll(': boolean', '');

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(files, { javascript = false } = {}) {
  const root = createProject('nitpicker-operand-slip-', {
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

async function eslintFindings(root) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'policy.mjs') });
  return findingsOf(root, await eslint.lintFiles(PATTERNS));
}

async function oxlintFindings(root) {
  const results = await lintWithOxlint({
    options: { projectRoot: root, patterns: PATTERNS },
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => [],
  });
  return findingsOf(root, results);
}

function located(findings) {
  return findings
    .filter(({ rule }) => rule === RULE)
    .map(({ path: file, location }) => `${file}:${String(location.line)}`)
    .sort((left, right) => left.localeCompare(right));
}

function expectedIn(files) {
  return files
    .flatMap((file) => BANNED_LINES.map((line) => `${file}:${String(line)}`))
    .sort((left, right) => left.localeCompare(right));
}

describe.each([
  { javascript: false, extension: 'ts', banned: BANNED, allowed: ALLOWED },
  { javascript: true, extension: 'mjs', banned: BANNED_JAVASCRIPT, allowed: ALLOWED_JAVASCRIPT },
])('operand slips (javascript: $javascript)', ({ javascript, extension, banned, allowed }) => {
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

  it('reports each slip in production and test files on both engines', async () => {
    const [fromOxlint, fromEslint] = await Promise.all([
      oxlintFindings(root),
      eslintFindings(root),
    ]);
    expect(located(fromEslint)).toEqual(expectedIn(files));
    expect(located(fromOxlint)).toEqual(expectedIn(files));
  });
});
