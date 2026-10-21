import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mjs';
import { applyJavascriptDialect } from '../../../../javascript/preset/eslint-dialect.mjs';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { applyRuleExceptions } from '../exceptions.mjs';
import { productionPolicyConfigFor } from './production-policy.mjs';

const RULE = 'nitpicker/no-repeated-string-literal';
const FILE = 'src/main/features/orders/domain/labels.ts';
const CODE = 'export const labels = ["pending", "pending", "pending"];\n';
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function messagesFor(filename, code = CODE, exceptions = []) {
  const config = applyJavascriptDialect(
    applyRuleExceptions(productionPolicyConfigFor(defaultResolvedLayout), exceptions),
    { preset: 'javascript' },
  );
  return lintFixture({ config, filename, code }).filter(({ ruleId }) => ruleId === RULE);
}

function findingsFor(code) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-repeated-strings-'));
  temporaryRoots.push(root);
  const file = path.join(root, FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, code);
  return normalizeEslintResults({
    value: [{ filePath: file, messages: messagesFor(FILE, code) }],
    projectRoot: root,
    analyzerName: 'eslint-lint',
  });
}

describe('repeated strings in production policy', () => {
  it.each(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'])('enforces the rule for %s', (extension) => {
    const messages = messagesFor(FILE.replace(/ts$/, extension));

    expect(
      messages.map(({ ruleId, severity, message }) => ({ ruleId, severity, message })),
    ).toEqual([
      {
        ruleId: RULE,
        severity: 2,
        message:
          'This string is repeated three times or more in this file. Name a constant and reuse it so changes stay consistent. If the literals represent different concepts, add an exception for nitpicker/no-repeated-string-literal in nitpicker.config.json.',
      },
    ]);
  });

  it.each([
    'test/labels.ts',
    'src/main/features/orders/labels.test.ts',
    'src/main/__tests__/labels.ts',
  ])('excludes test scope %s', (filename) => {
    expect(messagesFor(filename)).toEqual([]);
  });

  it('lifts only the reviewed path', () => {
    const exceptions = [{ rule: RULE, paths: [FILE], reason: 'These labels are independent.' }];

    expect(messagesFor(FILE, CODE, exceptions)).toEqual([]);
    expect(messagesFor(FILE.replace('labels', 'states'), CODE, exceptions)).toHaveLength(1);
  });

  it('keeps line movement stable and detects a new third occurrence', () => {
    const baseFindings = findingsFor(CODE);
    const headFindings = findingsFor(`\n\n${CODE}`);
    const moved = compareFindings({ baseFindings, headFindings });

    expect(moved.newFindings).toEqual([]);
    expect(moved.unchangedFindings).toHaveLength(1);
    expect(headFindings[0].location.line).toBe(3);
    expect(
      compareFindings({
        baseFindings: findingsFor(CODE.replace(', "pending"', '')),
        headFindings,
      }).newFindings.map(({ rule }) => rule),
    ).toEqual([RULE]);
  });
});
