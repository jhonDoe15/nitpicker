import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { staleFiles } from '../scripts/gen-checks.mjs';
import { applyGeneratedBlock, renderCustomRulesTable } from './checks-catalog.mjs';
import {
  DEFAULT_CRAP_SCORE_LIMIT,
  DUPLICATES_MODE,
  FUNCTION_STRUCTURE_LIMITS,
  LANGUAGES,
  MESSAGES,
  MINIMUM_BRANCH_COVERAGE,
  RULES,
  RULE_IDS,
  mutantRuleId,
  renderMessage,
} from './policy.mjs';

const sharedRoot = import.meta.dirname;

describe('shared policy', () => {
  it('holds the documented defaults', () => {
    expect(DEFAULT_CRAP_SCORE_LIMIT).toBe(9);
    expect(MINIMUM_BRANCH_COVERAGE).toBe(95);
    expect(DUPLICATES_MODE).toBe('mild');
    expect(
      Object.fromEntries(
        Object.entries(FUNCTION_STRUCTURE_LIMITS).map(([metric, { limit }]) => [metric, limit]),
      ),
    ).toEqual({ lines: 50, statements: 15, maxControlNesting: 2, parameters: 3 });
  });

  it('names mutant rules after the status', () => {
    expect(mutantRuleId('Survived')).toBe(RULE_IDS.mutantSurvived);
    expect(mutantRuleId('NoCoverage')).toBe(RULE_IDS.mutantNoCoverage);
  });

  it('renders message templates', () => {
    expect(
      renderMessage(MESSAGES.functionStructure, {
        name: 'f',
        value: 60,
        metric: 'lines',
        limit: 50,
      }),
    ).toBe('f has 60 lines; limit is 50');
    expect(
      renderMessage(MESSAGES.functionStatements, { name: 'validate', value: 16, limit: 15 }),
    ).toBe(
      'validate has 16 statements; limit is 15. Split by responsibility and name each part for what it checks or does.',
    );
    expect(
      renderMessage(MESSAGES.functionControlNesting, { name: 'shippingFor', value: 3, limit: 2 }),
    ).toBe('shippingFor nests control flow 3 deep (limit 2). Return early instead of nesting.');
    expect(renderMessage(MESSAGES.changedBranchCoverage, { percent: '50.00', minimum: 95 })).toBe(
      'Branch coverage is 50.00%; minimum is 95%',
    );
  });

  it('catalogs each rule id once and says per language whether it is enforced', () => {
    const ids = RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RULES.map((rule) => [rule.id, Object.keys(rule.enforcedBy).sort()])).toEqual(
      RULES.map((rule) => [rule.id, [...LANGUAGES].sort()]),
    );
  });

  it('gives a reason only for languages that do not enforce the rule', () => {
    const misplaced = RULES.flatMap((rule) =>
      Object.entries(rule.notApplicable ?? {})
        .filter(([language, reason]) => rule.enforcedBy[language] !== false || reason === '')
        .map(([language]) => `${rule.id}: ${language}`),
    );
    expect(misplaced).toEqual([]);
  });
});

describe('generated files', () => {
  it('spec/checks.md matches the policy (run npm run gen:checks)', () => {
    const text = readFileSync(path.join(sharedRoot, '../spec/checks.md'), 'utf8');
    expect(applyGeneratedBlock(text)).toBe(text);
    expect(text).toContain(renderCustomRulesTable());
  });

  it('no generated file is stale', () => {
    expect(staleFiles()).toEqual([]);
  });
});
