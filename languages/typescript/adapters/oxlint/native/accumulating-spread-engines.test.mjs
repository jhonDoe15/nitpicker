import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { createFindingsCache } from '../../../../../core/diff/cache/findings-cache.mjs';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { importClosure } from '../../../../../shared/import-closure.mjs';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { resolveAnalyzerVersion } from '../../../preset/analyzer-versions.mjs';
import { hashFiles } from '../../../preset/checks/hash.mjs';
import { configuredAnalyzers } from '../../../preset/diff/configured-analyzers.mjs';
import { accumulatingSpreadMessages } from '../../../preset/eslint-plugin/rules/collections/accumulating-spread-messages.mjs';
import { normalizeEslintResults } from '../../eslint/normalize.mjs';
import { spawnJson } from '../oxlint-process.mjs';
import { lintWithOxlint } from '../oxlint-runner.mjs';
import { nativeRuleIndex, PARITY_BRIDGED_RULES, translatePlan } from '../oxlint-translation.mjs';
import { createProject } from '../test-support/oxlint-project.mjs';

const RULE = 'nitpicker/no-accumulating-spread';
const NATIVE = 'oxc/no-accumulating-spread';
const PATTERNS = ['src/**/*.{ts,mjs}'];
const OWNED_ENGINE_FILES = [
  'languages/typescript/adapters/lint-engine/overlapping-reports.mjs',
  'languages/typescript/adapters/oxlint/native/accumulating-spread-check.mjs',
  'languages/typescript/adapters/oxlint/native/owned-native-rules.mjs',
  'languages/typescript/adapters/oxlint/oxlint-diagnostics.mjs',
  'languages/typescript/preset/eslint-plugin/rules/collections/accumulating-spread-messages.mjs',
  'languages/typescript/preset/eslint-plugin/rules/collections/no-accumulating-spread.mjs',
];

function presetUrl(file) {
  return JSON.stringify(import.meta.resolve(`../../../preset/${file}`));
}

function policy({ javascript }) {
  return `import { productionPolicyConfigFor } from ${presetUrl('eslint-config/policy/production-policy.mjs')};
import { strictSyntaxConfigFor } from ${presetUrl('eslint-config/strict.mjs')};
import { strictTestConfigFor } from ${presetUrl('eslint-config/strict-tests.mjs')};
import { applyRuleExceptions } from ${presetUrl('eslint-config/exceptions.mjs')};
import { resolveLayout } from ${presetUrl('layout.mjs')};
import { applyJavascriptDialect } from ${JSON.stringify(import.meta.resolve('../../../../javascript/preset/eslint-dialect.mjs'))};

const layout = resolveLayout({}, [], { javascript: ${String(javascript)} });
const entries = [
  ...productionPolicyConfigFor(layout),
  ...strictSyntaxConfigFor(layout),
  ...strictTestConfigFor(layout),
];
export default applyJavascriptDialect(
  applyRuleExceptions(entries, [{ rule: '${RULE}', paths: ['src/main/legacy/**'], reason: 'r' }]),
  { preset: ${javascript ? "'javascript'" : "'typescript'"} },
);
`;
}

const DOMAIN = 'src/main/features/billing/domain/totals.ts';
const ADAPTER = 'src/main/features/billing/adapters/ledger.ts';

const SOURCES = {
  [DOMAIN]: [
    'export type Row = { readonly id: string };',
    'export function byId(rows: readonly Row[]): Readonly<Record<string, Row>> {',
    '  return rows.reduce((index, row) => ({ ...index, [row.id]: row }), {});',
    '}',
    'export function byIdInOnePass(rows: readonly Row[]): Readonly<Record<string, Row>> {',
    '  return Object.fromEntries(rows.map((row) => [row.id, row]));',
    '}',
    'export function ids(rows: readonly Row[]): readonly string[] {',
    '  let collected: readonly string[] = [];',
    '  for (const row of rows) {',
    '    collected = [...collected, row.id];',
    '  }',
    '  return collected;',
    '}',
  ].join('\n'),
  [ADAPTER]: [
    'export function lines(pages: readonly (readonly string[])[]): readonly string[] {',
    '  return pages.reduce((all, page) => [...all, ...page], []);',
    '}',
    'export function merge(parts: readonly object[]): object {',
    '  let merged = {};',
    '  for (const part of parts) {',
    '    merged = { ...merged, ...part };',
    '  }',
    '  return merged;',
    '}',
    'export function collect(pages: readonly (readonly string[])[]): readonly string[] {',
    '  const all: string[] = [];',
    '  for (const page of pages) {',
    '    all.push(...page);',
    '  }',
    '  return all;',
    '}',
    'export function width(rows: readonly (readonly number[])[]): number {',
    '  return rows.map((row, index) => [...row, index]).reduce((sum, row) => sum + row.length, 0);',
    '}',
    'export const totals = (xs: readonly { readonly v: number }[]) =>',
    '  xs.reduce((acc, x) => ({ ...acc, paid: acc.paid + x.v }), { paid: 0, open: 0 });',
    'export const recent = (xs: readonly number[]) =>',
    '  xs.reduce<readonly number[]>((acc, x) => [...acc, x].slice(-3), []);',
    'export function window(xs: readonly number[]): readonly number[] {',
    '  let last: readonly number[] = [];',
    '  for (const x of xs) {',
    '    last = [...last, x].slice(-3);',
    '  }',
    '  return last;',
    '}',
  ].join('\n'),
  'src/main/legacy/old.ts': [
    'export function lines(pages: readonly (readonly string[])[]): readonly string[] {',
    '  return pages.reduce((all, page) => [...all, ...page], []);',
    '}',
  ].join('\n'),
  'src/main/features/billing/billing.test.ts': [
    "import { expect, it } from 'vitest';",
    "it('joins', () => {",
    '  expect([[1], [2]].reduce((all, page) => [...all, ...page], [])).toEqual([1, 2]);',
    '});',
  ].join('\n'),
};

const EXPECTED = [
  [ADAPTER, 2, 39, 'reduceArray'],
  [ADAPTER, 5, 7, 'loopObject'],
  [DOMAIN, 3, 41, 'domainReduceObject'],
];

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(files, { javascript = false } = {}) {
  const root = createProject('nitpicker-accumulating-spread-', {
    'policy.mjs': policy({ javascript }),
    ...files,
  });
  roots.push(root);
  return root;
}

async function eslintResults(root) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'policy.mjs') });
  return eslint.lintFiles(PATTERNS);
}

function findingsOf(root, results) {
  return normalizeEslintResults({ value: results, projectRoot: root, analyzerName: 'eslint-lint' });
}

function ruleFindings(findings) {
  return findings.filter((finding) => finding.rule === RULE);
}

function located(findings) {
  return ruleFindings(findings)
    .map(({ path: file, location, identity }) => [
      file,
      location.line,
      location.column,
      identity.split('|')[0].replace('message:', ''),
    ])
    .sort((left, right) => left.join().localeCompare(right.join()));
}

function environmentOf(root) {
  return {
    ...process.env,
    NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
    NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
  };
}

function oxlintResults(root) {
  return lintWithOxlint({
    options: { projectRoot: root, patterns: PATTERNS },
    environment: environmentOf(root),
    runEslintCli: () => [],
  });
}

function lintPlan(root) {
  return spawnJson([path.join(import.meta.dirname, '..', 'oxlint-plan.mjs'), root, ...PATTERNS], {
    cwd: root,
    env: environmentOf(root),
    context: 'oxlint planning',
  });
}

function nativeRulesByFile(plan, bridgedRules) {
  const translated = translatePlan(plan, {
    nativeRules: nativeRuleIndex(plan.nativeRules),
    bridgedRules,
  });
  return Object.fromEntries(
    translated.partitions
      .flatMap(({ overrides }) => overrides)
      .flatMap(({ files, rules }) =>
        files.map((file) => [file, Object.keys(rules).filter((name) => name.startsWith('oxc/'))]),
      ),
  );
}

describe('nitpicker/no-accumulating-spread on both lint engines', () => {
  const root = project(SOURCES);
  const oxlintFindings = findingsOf(root, oxlintResults(root));

  it('runs the native rule only through the owned rule, on production files outside exceptions', () => {
    const plan = lintPlan(root);
    expect(nativeRulesByFile(plan, new Set(PARITY_BRIDGED_RULES))).toEqual({
      [ADAPTER]: [NATIVE],
      [DOMAIN]: [NATIVE],
      'src/main/features/billing/billing.test.ts': [],
      'src/main/legacy/old.ts': [],
    });
    expect(Object.values(nativeRulesByFile(plan, new Set([RULE]))).flat()).toEqual([]);
  });

  it('reports the same findings, identities and messages with ESLint and with oxlint', async () => {
    const eslintFindings = findingsOf(root, await eslintResults(root));
    expect(located(oxlintFindings)).toEqual(EXPECTED);
    expect(ruleFindings(oxlintFindings)).toEqual(ruleFindings(eslintFindings));
  });

  it('names the one-pass form and the exception entry instead of mutating the accumulator', () => {
    const domain = ruleFindings(oxlintFindings).find((finding) => finding.path === DOMAIN);
    expect(domain.message).toBe(
      `${accumulatingSpreadMessages.domainReduceObject} If this is intended, add {"rule":"${RULE}","paths":["${DOMAIN}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
    );
    expect(accumulatingSpreadMessages.domainReduceObject).toBe(
      'Spreading the accumulator copies it on every step, which is quadratic: use Object.fromEntries(xs.map((x) => [x.key, x.value] as const)), new Map(xs.map((x) => [x.key, x] as const)) or Object.fromEntries(parts.flatMap((p) => Object.entries(p))) (drop as const in JavaScript). An exception fits only when the input stays small.',
    );
  });

  it('reports the same findings when the owned rule runs through the bridge', async () => {
    PARITY_BRIDGED_RULES.add(RULE);
    try {
      const bridged = findingsOf(root, oxlintResults(root));
      expect(ruleFindings(bridged)).toEqual(
        ruleFindings(findingsOf(root, await eslintResults(root))),
      );
      expect(located(bridged)).toEqual(EXPECTED);
    } finally {
      PARITY_BRIDGED_RULES.delete(RULE);
    }
  });

  it('leaves the loop accumulator of domain code to the let and loop bans', () => {
    const domainRules = oxlintFindings
      .filter((finding) => finding.path === DOMAIN && finding.location.line >= 9)
      .map(({ rule, location }) => [rule, location.line]);
    expect(domainRules).toEqual([
      ['functional/no-let', 9],
      ['no-restricted-syntax', 10],
    ]);
  });

  it('misses the findings cache once any owned native rule file changes', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-accumulating-cache-'));
    roots.push(directory);
    const { cacheKeyFiles } = configuredAnalyzers().find(({ name }) => name === 'eslint-lint');
    const copy = mkdtempSync(path.join(tmpdir(), 'nitpicker-accumulating-policy-'));
    roots.push(copy);
    for (const [file, contents] of importClosure(cacheKeyFiles, PACKAGE_ROOT)) {
      mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
      writeFileSync(path.join(copy, file), contents);
    }
    const version = resolveAnalyzerVersion('eslint-lint', PACKAGE_ROOT);
    const analyzerOf = (configurationHash) => ({ name: 'eslint-lint', version, configurationHash });
    const cache = createFindingsCache({
      directory,
      mergeBaseSha: 'base',
      projectRelativePath: '.',
    });
    const hashOf = () => hashFiles(cacheKeyFiles, [], { root: copy });
    const before = analyzerOf(hashOf());
    cache.write(before, { findings: oxlintFindings });
    const hashes = OWNED_ENGINE_FILES.map((file) => {
      writeFileSync(path.join(copy, file), `export const changed = ${JSON.stringify(file)};\n`);
      return hashOf();
    });

    expect(version.split(';').at(-1)).toBe('oxlint@1.87.0,oxlint-tsgolint@7.0.2004');
    expect(ruleFindings(cache.read(before).findings)).toEqual(ruleFindings(oxlintFindings));
    expect(new Set([before.configurationHash, ...hashes]).size).toBe(OWNED_ENGINE_FILES.length + 1);
    expect(hashes.map((hash) => cache.read(analyzerOf(hash)))).toEqual(
      OWNED_ENGINE_FILES.map(() => undefined),
    );
  });

  it('fails only the spread a change adds when the base already had others', () => {
    const head = project({
      ...SOURCES,
      [ADAPTER]: `export const keys = (rows: readonly object[]) => rows.reduce((all, row) => [...all, ...Object.keys(row)], []);\n${SOURCES[ADAPTER]}`,
    });
    const comparison = compareFindings({
      baseFindings: ruleFindings(oxlintFindings),
      headFindings: ruleFindings(findingsOf(head, oxlintResults(head))),
    });
    expect(comparison.newFindings.map(({ path: file, location }) => [file, location.line])).toEqual(
      [[ADAPTER, 1]],
    );
    expect(comparison.unchangedFindings).toHaveLength(EXPECTED.length);
    expect(comparison.resolvedFindings).toEqual([]);
  });

  it('applies to JavaScript preset sources the same way', async () => {
    const javascript = project(
      {
        'src/main/features/billing/adapters/ledger.mjs': [
          'export function lines(pages) {',
          '  return pages.reduce((all, page) => [...all, ...page], []);',
          '}',
        ].join('\n'),
      },
      { javascript: true },
    );
    const fromOxlint = findingsOf(javascript, oxlintResults(javascript));
    const fromEslint = findingsOf(javascript, await eslintResults(javascript));
    expect(located(fromOxlint)).toEqual([
      ['src/main/features/billing/adapters/ledger.mjs', 2, 39, 'reduceArray'],
    ]);
    expect(ruleFindings(fromOxlint)).toEqual(ruleFindings(fromEslint));
  });
});
