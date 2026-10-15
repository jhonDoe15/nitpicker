import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/compare.mjs';
import { normalizeEslintResults } from '../../../adapters/eslint-runner.mjs';
import { lintFixture } from '../../failure-messages/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { isStrictRule, mustMeetOnEditedLines } from '../../strict-rules.mjs';
import { productionLayoutConfigFor, productionPolicyConfigFor } from './production-policy.mjs';

const layout = defaultResolvedLayout;

const BRANCH_STRICT_RULES = [
  '@typescript-eslint/explicit-module-boundary-types',
  'curly',
  'nitpicker/naming-convention',
  'nitpicker/no-magic-numbers',
  'nitpicker/no-module-level-mutable-state',
  'nitpicker/no-process-access-outside-composition-root',
  'nitpicker/no-shell-string-command',
  'nitpicker/no-unsafe-path-join',
  'no-duplicate-imports',
  'no-eval',
  'no-param-reassign',
  'no-restricted-globals',
  'no-restricted-properties',
  'regexp/no-super-linear-backtracking',
];

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
    expect(ruleIds.filter((rule) => !isStrictRule(rule))).toEqual([]);
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
    expect(result.newFindings.map(({ rule }) => rule)).toContain('no-eval');
    expect(result.newFindings.map(({ rule }) => rule)).not.toContain(
      'nitpicker/no-unknown-main-folder',
    );
  });
});
