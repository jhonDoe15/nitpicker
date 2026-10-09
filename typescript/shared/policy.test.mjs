import { readFileSync, readdirSync, statSync } from 'node:fs';
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
    expect(renderMessage(MESSAGES.changedBranchCoverage, { percent: '50.00', minimum: 95 })).toBe(
      'Branch coverage is 50.00%; minimum is 95%',
    );
  });

  it('catalogs each rule id once and says per language whether it is enforced', () => {
    const ids = RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of RULES) {
      expect(Object.keys(rule.enforcedBy).sort()).toEqual([...LANGUAGES].sort());
    }
  });
});

describe('generated files', () => {
  it('spec/checks.md matches the policy (run npm run gen:checks)', () => {
    const text = readFileSync(path.join(sharedRoot, '../../spec/checks.md'), 'utf8');
    expect(applyGeneratedBlock(text)).toBe(text);
    expect(text).toContain(renderCustomRulesTable());
  });

  it('no generated file is stale', () => {
    expect(staleFiles()).toEqual([]);
  });
});

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return name.endsWith('.mjs') && !name.endsWith('.test.mjs') ? [full] : [];
  });
}

describe('shared layer import direction', () => {
  it('imports nothing from preset/, adapters/, core/ or a tool package', () => {
    for (const file of sourceFiles(sharedRoot)) {
      const specifiers = [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map(
        (match) => match[1],
      );
      for (const specifier of specifiers) {
        const staysInShared =
          specifier.startsWith('.') &&
          path.resolve(path.dirname(file), specifier).startsWith(`${sharedRoot}${path.sep}`);
        expect(staysInShared || specifier.startsWith('node:'), `${file} imports ${specifier}`).toBe(
          true,
        );
      }
    }
  });
});
