import { rmSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mts';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mjs';
import { createProject } from '../../../adapters/oxlint/test-support/oxlint-project.mjs';
import { logicRuleHints, logicRuleIds } from './logic-rules.mjs';

const PATTERNS = ['src/**/*.{ts,mjs}', 'test/**/*.{ts,mjs}'];

function policy({ javascript }) {
  return `import { logicConfigFor } from ${JSON.stringify(import.meta.resolve('./logic-rules.mjs'))};
import { resolveLayout } from ${JSON.stringify(import.meta.resolve('../../layout.mjs'))};
import { applyJavascriptDialect } from ${JSON.stringify(import.meta.resolve('../../../../javascript/preset/eslint-dialect.mjs'))};

const layout = resolveLayout({}, [], { javascript: ${String(javascript)} });
const files = [...layout.sourceGlobs, ...layout.testGlobs];
const parserOptions = { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname };
export default applyJavascriptDialect(logicConfigFor(files, parserOptions), {
  preset: ${javascript ? "'javascript'" : "'typescript'"},
});
`;
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    noEmit: true,
    types: [],
    lib: ['ES2023'],
    strict: true,
    target: 'es2023',
    module: 'nodenext',
    allowJs: true,
    checkJs: true,
  },
  include: ['src', 'test'],
});

const PLACEHOLDER = ['$', '{name}'].join('');

const BANNED = [
  [undefined, 'export const firsts = (values: readonly number[]) =>'],
  ['array-callback-return', '  values.map((value) => {'],
  [undefined, '    if (value > 0) {'],
  [undefined, '      return value;'],
  [undefined, '    }'],
  [undefined, '  });'],
  [undefined, 'export function first(values: readonly number[]): number | undefined {'],
  ['no-unreachable-loop', '  for (const value of values) {'],
  [undefined, '    return value;'],
  [undefined, '  }'],
  [undefined, '  return undefined;'],
  [undefined, '}'],
  [undefined, 'export function drain(queue: readonly number[], limit: number): number {'],
  [undefined, '  let total = 0;'],
  ['no-unmodified-loop-condition', '  while (limit > 0) {'],
  [undefined, '    total += queue.length;'],
  [undefined, '  }'],
  [undefined, '  return total;'],
  [undefined, '}'],
  ['no-template-curly-in-string', `export const greeting = 'Hello ${PLACEHOLDER}';`],
  [undefined, 'export class Box {'],
  [undefined, '  readonly value: number;'],
  [undefined, '  constructor(value: number) {'],
  [undefined, '    this.value = value;'],
  ['no-constructor-return', '    return { value: 0 };'],
  [undefined, '  }'],
  [undefined, '}'],
  [undefined, 'export function log(lines: string[], line: string): void {'],
  [undefined, '  lines.push(line);'],
  ['no-useless-return', '  return;'],
  [undefined, '}'],
  [undefined, 'export class Counter {'],
  ['@typescript-eslint/no-unused-private-class-members', '  #unused = 0;'],
  [undefined, '}'],
  ['no-useless-concat', "export const joined = 'a' + 'b';"],
  [undefined, 'export function apply(run: (value: number) => number): number {'],
  ['no-useless-call', '  return run.call(undefined, 1);'],
  [undefined, '}'],
  [undefined, 'export function ordered(values: readonly number[]): readonly number[] {'],
  ['@typescript-eslint/require-array-sort-compare', '  return [...values].sort();'],
  [undefined, '}'],
];

const ALLOWED = [
  'export const doubled = (values: readonly number[]) => values.map((value) => value * 2);',
  'export function first(values: readonly number[]): number | undefined {',
  '  for (const value of values) {',
  '    if (value > 0) {',
  '      return value;',
  '    }',
  '  }',
  '  return undefined;',
  '}',
  'export function countdown(limit: number): number {',
  '  let left = limit;',
  '  while (left > 0) {',
  '    left -= 1;',
  '  }',
  '  return left;',
  '}',
  `export const greet = (name: string) => \`Hello ${PLACEHOLDER}\`;`,
  'export class Box {',
  '  readonly value: number;',
  '  constructor(value: number) {',
  '    this.value = value;',
  '  }',
  '}',
  'export function log(lines: string[], line: string): void {',
  '  lines.push(line);',
  '}',
  'export class Counter {',
  '  #count = 0;',
  '  read(): number {',
  '    return this.#count;',
  '  }',
  '}',
  "export const joined = (name: string) => 'a' + name;",
  'export const apply = (run: (value: number) => number) => run(1);',
  'export const ordered = (values: readonly number[]) => [...values].sort((l, r) => l - r);',
  'export const names = (values: readonly string[]) => [...values].sort();',
].join('\n');

const BANNED_SOURCE = BANNED.map(([, line]) => line).join('\n');

const BANNED_JAVASCRIPT = [
  'export const firsts = (values) =>',
  '  values.map((value) => {',
  '    if (value > 0) {',
  '      return value;',
  '    }',
  '  });',
  `export const greeting = 'Hello ${PLACEHOLDER}';`,
  '/** @param {readonly number[]} values */',
  'export const ordered = (values) => [...values].sort();',
].join('\n');

function expectedOf(file) {
  return BANNED.flatMap(([rule], index) => (rule === undefined ? [] : [[file, index + 1, rule]]));
}

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(files, { javascript = false } = {}) {
  const root = createProject('nitpicker-logic-rules-', {
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
    .filter(({ rule }) => logicRuleIds.includes(rule))
    .map(({ path: file, location, rule }) => [file, location.line, rule])
    .sort((left, right) => left.join().localeCompare(right.join()));
}

const sorted = (rows) => [...rows].sort((left, right) => left.join().localeCompare(right.join()));

describe('logic rules on both lint engines', () => {
  const root = project({
    'src/main/banned.ts': BANNED_SOURCE,
    'src/main/allowed.ts': ALLOWED,
    'test/banned.test.ts': BANNED_SOURCE,
    'test/allowed.test.ts': ALLOWED,
  });
  const expected = sorted([
    ...expectedOf('src/main/banned.ts'),
    ...expectedOf('test/banned.test.ts'),
  ]);
  let fromOxlint;
  let fromEslint;

  beforeAll(async () => {
    [fromOxlint, fromEslint] = await Promise.all([oxlintFindings(root), eslintFindings(root)]);
  });

  it('reports each banned form in production and test files with ESLint', () => {
    expect(located(fromEslint)).toEqual(expected);
  });

  it('reports each banned form in production and test files with oxlint', () => {
    expect(located(fromOxlint)).toEqual(expected);
  });

  it('ends every message with the allowed form on both engines', () => {
    const hinted = [...fromEslint, ...fromOxlint].filter(({ rule }) => logicRuleIds.includes(rule));
    expect(hinted.filter(({ rule, message }) => !message.includes(logicRuleHints[rule]))).toEqual(
      [],
    );
    expect(
      hinted.filter(({ rule, allowedForm }) => allowedForm !== logicRuleHints[rule].trimStart()),
    ).toEqual([]);
  });

  it('covers every logic rule with a banned form', () => {
    expect(new Set(expected.map(([, , rule]) => rule))).toEqual(new Set(logicRuleIds));
  });
});

describe('logic rules in the JavaScript preset', () => {
  it('reports the banned forms in JavaScript sources on both engines', async () => {
    const root = project(
      { 'src/main/banned.mjs': BANNED_JAVASCRIPT, 'test/banned.test.mjs': BANNED_JAVASCRIPT },
      { javascript: true },
    );
    const expected = sorted(
      ['src/main/banned.mjs', 'test/banned.test.mjs'].flatMap((file) => [
        [file, 2, 'array-callback-return'],
        [file, 7, 'no-template-curly-in-string'],
        [file, 9, '@typescript-eslint/require-array-sort-compare'],
      ]),
    );
    const [fromOxlint, fromEslint] = await Promise.all([
      oxlintFindings(root),
      eslintFindings(root),
    ]);
    expect(located(fromEslint)).toEqual(expected);
    expect(located(fromOxlint)).toEqual(expected);
  });
});
