import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mts';
import { lintFixture } from '../typed/lint-fixture.mts';
import { defaultResolvedLayout } from '../../layout.mjs';
import { isStrictRule, mustMeetOnEditedLines } from '../../strict-rules.mts';
import { UNUSED_PARAMETER_ADVICE } from './unused-parameters.mts';
import { productionLayoutConfigFor, productionPolicyConfigFor } from './production-policy.mts';

const layout = defaultResolvedLayout;

const BRANCH_STRICT_RULES = [
  '@typescript-eslint/explicit-module-boundary-types',
  'curly',
  'nitpicker/naming-convention',
  'nitpicker/no-disabled-tls-verification',
  'nitpicker/no-in-memory-query',
  'nitpicker/no-magic-numbers',
  'nitpicker/no-module-level-mutable-state',
  'nitpicker/no-multiple-collection-joins',
  'nitpicker/no-orm-query-logging',
  'nitpicker/no-orm-schema-sync',
  'nitpicker/no-process-access-outside-composition-root',
  'nitpicker/no-shell-string-command',
  'nitpicker/no-sql-string-building',
  'nitpicker/no-sync-node-api-in-async',
  'nitpicker/no-unindexed-foreign-key',
  'nitpicker/no-unversioned-orm-entity',
  'nitpicker/no-unsafe-deserialization',
  'nitpicker/no-unsafe-path-join',
  'nitpicker/no-weak-hash',
  'nitpicker/require-http-timeout',
  'nitpicker/unbounded-fan-out',
  'nitpicker/unbounded-reactive-fan-out',
  'no-duplicate-imports',
  'no-eval',
  'no-param-reassign',
  'no-restricted-globals',
  'no-restricted-properties',
  'regexp/no-super-linear-backtracking',
];

const UNUSED_RULE = '@typescript-eslint/no-unused-vars';
const PARAMETER_FINDING = { message: UNUSED_PARAMETER_ADVICE };
const temporaryRoots: string[] = [];

type ComparedFindings = {
  readonly newFindings: readonly { readonly rule: string }[];
  readonly unchangedFindings: readonly { readonly rule: string }[];
};

const compare: (input: {
  readonly baseFindings: readonly unknown[];
  readonly headFindings: readonly unknown[];
  readonly touchedCode: object;
  readonly unknownOnBase: undefined;
}) => Readonly<Record<string, unknown>> = compareFindings;

function compareTouched(
  baseFindings: readonly unknown[],
  headFindings: readonly unknown[],
  touchedCode: object,
): ComparedFindings {
  const result = compare({ baseFindings, headFindings, touchedCode, unknownOnBase: undefined });
  const rulesOf = (key: string) =>
    listOf(result[key]).map((finding) => ({ rule: textOf(fieldOf(finding, 'rule')) }));
  return { newFindings: rulesOf('newFindings'), unchangedFindings: rulesOf('unchangedFindings') };
}

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function ruleIdsOf(configs: readonly object[]) {
  return [...new Set(configs.flatMap((config) => Object.keys(fieldsOf(fieldOf(config, 'rules')))))];
}

function findingsFor(relativePath: string, code: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-classification-'));
  temporaryRoots.push(root);
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, code);
  const config = [...productionPolicyConfigFor(layout), ...productionLayoutConfigFor(layout)];
  const messages = lintFixture({ config, filename: relativePath, code });
  return normalizeEslintResults({
    value: [{ filePath: absolutePath, messages }],
    projectRoot: root,
    analyzerName: 'eslint-lint',
  });
}

function touchedLineOne(relativePath: string) {
  return {
    isStrictRule,
    mustMeetOnEditedLines,
    changedLines: new Map([[relativePath, { added: false, ranges: [[1, 1]], inserted: [] }]]),
  };
}

describe('production rule classification', () => {
  it.each([false, true])('marks every production policy rule strict (react: %s)', (react) => {
    const ruleIds = ruleIdsOf(
      productionPolicyConfigFor(layout, { react: react ? true : undefined }),
    );

    expect(ruleIds.length).toBeGreaterThan(0);
    expect(ruleIds.filter((rule) => !isStrictRule(rule, PARAMETER_FINDING))).toEqual([]);
  });

  it('marks every rule added on this branch strict', () => {
    expect(BRANCH_STRICT_RULES.filter((rule) => !isStrictRule(rule))).toEqual([]);
  });

  it('keeps the layout rules out of the strict set', () => {
    const ruleIds = ruleIdsOf(productionLayoutConfigFor(layout));

    expect(ruleIds).toEqual(['nitpicker/no-generic-name', 'nitpicker/no-unknown-main-folder']);
    expect(ruleIds.filter((rule) => isStrictRule(rule))).toEqual([]);
  });

  it('does not count an edit to line 1 of a legacy file in an unknown folder as new', () => {
    const file = 'src/main/billing/format.ts';
    const base = findingsFor(file, 'export const label = "a";\n');
    const head = findingsFor(file, 'export const label = "b";\n');

    expect(head.map(({ rule }) => rule)).toEqual(['nitpicker/no-unknown-main-folder']);
    expect(head[0]?.location?.line).toBe(1);
    const result = compareTouched(base, head, touchedLineOne(file));
    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });

  it('still counts a strict finding on an edited line 1 as new', () => {
    const file = 'src/main/billing/format.ts';
    const base = findingsFor(file, 'export const label = "a";\n');
    const head = findingsFor(file, 'export const label = eval("a");\n');

    const result = compareTouched(base, head, touchedLineOne(file));
    expect(result.newFindings.map(({ rule }) => rule)).toEqual(['no-eval']);
    expect(result.unchangedFindings.map(({ rule }) => rule)).toEqual([
      'nitpicker/no-unknown-main-folder',
    ]);
  });

  it('marks an unused parameter strict and leaves other unused names to the ratchet', () => {
    const unused = UNUSED_RULE;

    expect(isStrictRule(unused, PARAMETER_FINDING)).toBe(true);
    expect(mustMeetOnEditedLines(unused, PARAMETER_FINDING)).toBe(true);
    expect(isStrictRule(unused, { message: "'total' is assigned a value but never used." })).toBe(
      false,
    );
    expect(isStrictRule(unused)).toBe(false);
    expect(mustMeetOnEditedLines(unused)).toBe(false);
  });

  it('counts an unused parameter added to an edited signature as new beside one at base', () => {
    const file = 'src/main/domain/total.ts';
    const base = findingsFor(
      file,
      'export function total(a: number, unused: number) {\n  return a;\n}\n',
    );
    const head = findingsFor(
      file,
      'export function total(a: number, other: number) {\n  return a;\n}\n',
    );

    expect(head.filter(({ rule }) => rule === UNUSED_RULE)).toHaveLength(1);
    const result = compareTouched(base, head, touchedLineOne(file));
    expect(result.newFindings.filter(({ rule }) => rule === UNUSED_RULE)).toHaveLength(1);
  });

  it('does not count an unused parameter on a line the change did not touch', () => {
    const file = 'src/main/domain/total.ts';
    const body = (name: string) =>
      `export function total(a: number, unused: number) {\n  return a;\n}\n\nexport const label = "${name}";\n`;
    const result = compareTouched(findingsFor(file, body('a')), findingsFor(file, body('b')), {
      isStrictRule,
      mustMeetOnEditedLines,
      changedLines: new Map([[file, { added: false, ranges: [[5, 5]], inserted: [] }]]),
    });

    expect(result.newFindings).toEqual([]);
  });

  it('does not count an unused local variable on an edited line as new', () => {
    const file = 'src/main/domain/total.ts';
    const body = (value: number) =>
      `export function total(a: number) {\n  const spare = ${String(value)};\n  return a;\n}\n`;
    const result = compareTouched(findingsFor(file, body(1)), findingsFor(file, body(2)), {
      isStrictRule,
      mustMeetOnEditedLines,
      changedLines: new Map([[file, { added: false, ranges: [[2, 2]], inserted: [] }]]),
    });

    expect(result.newFindings.filter(({ rule }) => rule === UNUSED_RULE)).toEqual([]);
  });
});
