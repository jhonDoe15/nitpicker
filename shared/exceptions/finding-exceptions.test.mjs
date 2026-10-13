import { describe, expect, it } from 'vitest';
import {
  applyFindingExceptions,
  applyFunctionRuleExceptions,
  functionMatches,
} from './finding-exceptions.mjs';

const finding = (overrides) => ({
  rule: 'changed-branch-coverage',
  path: 'src/a.ts',
  symbol: 'Store.save',
  ...overrides,
});

describe('functionMatches', () => {
  it.each([
    ['save', 'Store.save', true],
    ['Store.save', 'Store.save', true],
    ['Store::save', 'Store.save', true],
    ['save', 'Calc::save( int a , int b)', true],
    ['Calc.save', 'Calc::save( int a , int b)', true],
    ['ave', 'Store.save', false],
    ['Store', 'Store.save', false],
    ['save', undefined, false],
    ['save', '', false],
  ])('%s against %s is %s', (wanted, symbol, expected) => {
    expect(functionMatches(wanted, symbol)).toBe(expected);
  });
});

describe('applyFindingExceptions', () => {
  const lifted = { rule: 'changed-branch-coverage', paths: ['src/**'], function: 'save' };

  it('drops only the findings of that rule, path and function', () => {
    const kept = [
      finding({ symbol: 'Store.load' }),
      finding({ path: 'lib/a.ts' }),
      finding({ rule: 'crap-score-limit' }),
      finding({ symbol: undefined }),
    ];
    expect(applyFindingExceptions([finding(), ...kept], [lifted])).toEqual(kept);
  });

  it('drops every function of the path when the entry names no function', () => {
    expect(
      applyFindingExceptions(
        [finding(), finding({ symbol: 'load' })],
        [{ rule: 'changed-branch-coverage', paths: ['src/a.ts'] }],
      ),
    ).toEqual([]);
  });

  it('returns the findings untouched without exceptions', () => {
    const findings = [finding()];
    expect(applyFindingExceptions(findings, [])).toBe(findings);
  });
});

describe('applyFunctionRuleExceptions', () => {
  it('ignores entries for rules that are not structure, CRAP or coverage rules', () => {
    const findings = [finding({ rule: 'files', path: 'src/a.ts', symbol: undefined }), finding()];

    expect(
      applyFunctionRuleExceptions(findings, [
        { rule: 'files', paths: ['**'], reason: 'because' },
        { rule: 'changed-branch-coverage', paths: ['src/**'], function: 'save', reason: 'because' },
      ]),
    ).toEqual([findings[0]]);
  });
});
