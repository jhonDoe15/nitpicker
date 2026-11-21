import { describe, expect, it } from 'vitest';
import { findNearDuplicates } from './engine.mjs';
import { proveSameLogic } from './proof/prove.mjs';
import { COPIES } from './test-support/copies.mjs';
import { javascriptUnits } from './test-support/javascript.mjs';

const UNREADABLE = 'copies.js#alignTop';

function failingOn(id) {
  return (sides) => {
    if (sides.some(({ unit }) => unit.id === id)) {
      throw new TypeError('cannot read this unit');
    }
    return proveSameLogic(sides);
  };
}

describe('a pair of functions that cannot be compared', () => {
  it('costs that pair and keeps every other finding', () => {
    const failed = [];
    const units = javascriptUnits(COPIES, { file: 'copies.js' });
    const findings = findNearDuplicates(units, { failed, proveLogic: failingOn(UNREADABLE) });

    expect(findings.map(({ units: pair }) => pair)).toEqual([
      ['copies.js#addWeights', 'copies.js#sumWeights'],
      ['copies.js#jwkMiddleware', 'copies.js#jwtMiddleware'],
      ['copies.js#readUri', 'copies.js#readUrl'],
    ]);
    expect(failed).toEqual([
      { units: ['copies.js#alignBottom', UNREADABLE], reason: 'cannot read this unit' },
    ]);
  });
});
