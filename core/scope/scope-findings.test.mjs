import { describe, expect, it } from 'vitest';
import { isInScope, scopeLine, scopeNotes, scopeOutcomes } from './scope-findings.mjs';

const scope = { paths: ['src/orders', 'src/billing/bill.ts'] };

describe('scope', () => {
  it.each([
    ['src/orders', true],
    ['src/orders/order.ts', true],
    ['src/billing/bill.ts', true],
    ['src/ordersX/order.ts', false],
    ['src/billing/bill.tsx', false],
    ['src', false],
    ['.', false],
    [undefined, false],
  ])('puts %s in scope: %s', (findingPath, expected) => {
    expect(isInScope(findingPath, scope)).toBe(expected);
  });

  it('keeps everything without a scope', () => {
    expect(isInScope('.', undefined)).toBe(true);
    const outcomes = [{ tool: { name: 'tool' }, result: { newFindings: [{ path: 'a' }] } }];
    expect(scopeOutcomes(outcomes, undefined)).toBe(outcomes);
  });

  it('narrows each analyzer outcome and recounts it', () => {
    const [outcome] = scopeOutcomes(
      [
        {
          tool: { name: 'tool', base: 7, new: 2, resolved: 2, unchanged: 2, changedMetrics: 2 },
          result: {
            newFindings: [{ path: 'src/orders/a.ts' }, { path: 'lib/b.ts' }],
            resolvedFindings: [{ path: 'lib/c.ts' }, { path: 'src/orders/c.ts' }],
            unchangedFindings: [{ path: 'lib/d.ts' }, { path: '.' }],
            changedMetrics: [{ path: 'src/billing/bill.ts' }, { path: 'src/billing/e.ts' }],
          },
        },
      ],
      scope,
    );

    expect(outcome).toEqual({
      tool: { name: 'tool', base: 7, new: 1, resolved: 1, unchanged: 0, changedMetrics: 1 },
      result: {
        newFindings: [{ path: 'src/orders/a.ts' }],
        resolvedFindings: [{ path: 'src/orders/c.ts' }],
        unchangedFindings: [],
        changedMetrics: [{ path: 'src/billing/bill.ts' }],
      },
      outside: 1,
    });
  });

  it('keeps notes about the whole run and drops notes about files outside the scope', () => {
    const notes = [
      { rule: 'run' },
      { path: '.' },
      { path: 'src/orders/a.ts' },
      { path: 'lib/b.ts' },
    ];
    expect(scopeNotes(notes, scope)).toEqual(notes.slice(0, 3));
  });

  it.each([
    [0, 'Scope: src/orders, src/billing/bill.ts'],
    [1, 'Scope: src/orders, src/billing/bill.ts (1 finding outside it not shown)'],
    [3, 'Scope: src/orders, src/billing/bill.ts (3 findings outside it not shown)'],
  ])('names the scope and %i findings left out', (outside, line) => {
    expect(scopeLine({ scope: { paths: scope.paths, outside } })).toEqual([line]);
  });

  it('prints no scope line for a whole-project run', () => {
    expect(scopeLine({})).toEqual([]);
    expect(scopeLine(undefined)).toEqual([]);
  });
});
