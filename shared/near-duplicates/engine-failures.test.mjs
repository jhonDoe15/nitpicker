import { describe, expect, it, vi } from 'vitest';
import { findNearDuplicates } from './engine.mjs';
import { COPIES } from './test-support/copies.mjs';
import { javascriptUnits } from './test-support/javascript.mjs';

const UNREADABLE = 'copies.js#alignTop';

vi.mock(import('./proof/prove.mjs'), async (original) => {
  const { proveSameLogic } = await original();
  return {
    proveSameLogic: (sides) => {
      if (sides.some(({ unit }) => unit.id === 'copies.js#alignTop')) {
        throw new TypeError('cannot read this unit');
      }
      return proveSameLogic(sides);
    },
  };
});

describe('a pair of functions that cannot be compared', () => {
  it('costs that pair and keeps every other finding', () => {
    const failed = [];
    const findings = findNearDuplicates(javascriptUnits(COPIES, { file: 'copies.js' }), { failed });

    expect(findings.map(({ units }) => units)).toEqual([
      ['copies.js#addWeights', 'copies.js#sumWeights'],
      ['copies.js#jwkMiddleware', 'copies.js#jwtMiddleware'],
      ['copies.js#readUri', 'copies.js#readUrl'],
    ]);
    expect(failed).toEqual([
      { units: ['copies.js#alignBottom', UNREADABLE], reason: 'cannot read this unit' },
    ]);
  });
});
