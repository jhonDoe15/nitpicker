import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mjs';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { isStrictRule, mustMeetOnEditedLines } from '../../strict-rules.mjs';
import { UNUSED_PARAMETER_ADVICE } from './unused-parameters.mjs';
import { productionLayoutConfigFor, productionPolicyConfigFor } from './production-policy.mjs';

const layout = defaultResolvedLayout;

const BRANCH_STRICT_RULES = [
  '@typescript-eslint/explicit-module-boundary-types',
  'curly',
  'nitpicker/naming-convention',
  'nitpicker/no-disabled-tls-verification',
  'nitpicker/no-magic-numbers',
  'nitpicker/no-module-level-mutable-state',
  'nitpicker/no-process-access-outside-composition-root',
  'nitpicker/no-shell-string-command',
  'nitpicker/no-sql-string-building',
  'nitpicker/no-sync-node-api-in-async',
  'nitpicker/no-unsafe-deserialization',
  'nitpicker/no-unsafe-path-join',
  'nitpicker/no-weak-hash',
  'nitpicker/require-http-timeout',
  'nitpicker/unbounded-fan-out',
  'no-duplicate-imports',
  'no-eval',
  'no-param-reassign',
  'no-restricted-globals',
  'no-restricted-properties',
  'regexp/no-super-linear-backtracking',
];

const UNUSED_RULE = '@typescript-eslint/no-unused-vars';
const PARAMETER_FINDING = { message: UNUSED_PARAMETER_ADVICE };
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function ruleIdsOf(configs) {
  return [...new Set(configs.flatMap((config) => Object.keys(config.rules ?? {})))];
}

function findingsFor(relativePath, code) {
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

function touchedLineOne(relativePath) {
  return {
    isStrictRule,
    mustMeetOnEditedLines,
    changedLines: new Map([[relativePath, { added: false, ranges: [[1, 1]], inserted: [] }]]),
  };
}

describe('production rule classification', () => {
  it.each([false, true])('marks every production policy rule strict (react: %s)', (react) => {
    const ruleIds = ruleIdsOf(productionPolicyConfigFor(layout, { react }));

    expect(ruleIds.length).toBeGreaterThan(0);
    expect(ruleIds.filter((rule) => !isStrictRule(rule, PARAMETER_FINDING))).toEqual([]);
  });

  it('marks every rule added on this branch strict', () => {
    expect(BRANCH_STRICT_RULES.filter((rule) => !isStrictRule(rule))).toEqual([]);
  });

  it('keeps the layout rules out of the strict set', () => {
    const ruleIds = ruleIdsOf(productionLayoutConfigFor(layout));

    expect(ruleIds).toEqual(['nitpicker/no-unknown-main-folder']);
    expect(ruleIds.filter((rule) => isStrictRule(rule))).toEqual([]);
  });

  it('does not count an edit to line 1 of a legacy file in an unknown folder as new', () => {
    const file = 'src/main/utils/format.ts';
    const base = findingsFor(file, 'export const label = "a";\n');
    const head = findingsFor(file, 'export const label = "b";\n');

    expect(head.map(({ rule }) => rule)).toEqual(['nitpicker/no-unknown-main-folder']);
    expect(head[0].location.line).toBe(1);
    const result = compareFindings({
      baseFindings: base,
      headFindings: head,
      touchedCode: touchedLineOne(file),
    });
    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });

  it('still counts a strict finding on an edited line 1 as new', () => {
    const file = 'src/main/utils/format.ts';
    const base = findingsFor(file, 'export const label = "a";\n');
    const head = findingsFor(file, 'export const label = eval("a");\n');

    const result = compareFindings({
      baseFindings: base,
      headFindings: head,
      touchedCode: touchedLineOne(file),
    });
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
    const result = compareFindings({
      baseFindings: base,
      headFindings: head,
      touchedCode: touchedLineOne(file),
    });
    expect(result.newFindings.filter(({ rule }) => rule === UNUSED_RULE)).toHaveLength(1);
  });

  it('does not count an unused parameter on a line the change did not touch', () => {
    const file = 'src/main/domain/total.ts';
    const body = (name) =>
      `export function total(a: number, unused: number) {\n  return a;\n}\n\nexport const label = "${name}";\n`;
    const result = compareFindings({
      baseFindings: findingsFor(file, body('a')),
      headFindings: findingsFor(file, body('b')),
      touchedCode: {
        isStrictRule,
        mustMeetOnEditedLines,
        changedLines: new Map([[file, { added: false, ranges: [[5, 5]], inserted: [] }]]),
      },
    });

    expect(result.newFindings).toEqual([]);
  });

  it('does not count an unused local variable on an edited line as new', () => {
    const file = 'src/main/domain/total.ts';
    const body = (value) =>
      `export function total(a: number) {\n  const spare = ${value};\n  return a;\n}\n`;
    const result = compareFindings({
      baseFindings: findingsFor(file, body(1)),
      headFindings: findingsFor(file, body(2)),
      touchedCode: {
        isStrictRule,
        mustMeetOnEditedLines,
        changedLines: new Map([[file, { added: false, ranges: [[2, 2]], inserted: [] }]]),
      },
    });

    expect(result.newFindings.filter(({ rule }) => rule === UNUSED_RULE)).toEqual([]);
  });
});
