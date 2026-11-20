import { afterEach, describe, expect, it, vi } from 'vitest';
import { proveSameLogic } from '../../near-duplicates/proof/prove.mjs';
import { COPIES } from '../../near-duplicates/test-support/copies.mjs';
import { javascriptUnits } from '../../near-duplicates/test-support/javascript.mjs';
import { nearDuplicateMatches } from './near-duplicates.mjs';

const FILE = 'src/copies.js';

function failingOnAlignTop(sides) {
  if (sides.some(({ unit }) => unit.name === 'alignTop')) {
    throw new TypeError('cannot read this unit');
  }
  return proveSameLogic(sides);
}

describe('near-duplicate when one pair cannot be compared', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports the other pairs and warns about the skipped one', () => {
    const warnings = [];
    vi.spyOn(process, 'emitWarning').mockImplementation((text) => {
      warnings.push(text);
    });
    const units = javascriptUnits(COPIES, { file: FILE }).map((unit) => ({ ...unit, tokens: 10 }));
    const options = { isExcepted: () => false, proveLogic: failingOnAlignTop };

    expect(nearDuplicateMatches(units, options).map(({ pair: [here] }) => here.name)).toEqual([
      'sumWeights',
      'jwtMiddleware',
      'readUrl',
    ]);
    expect(warnings).toEqual([
      'The near-duplicate check skipped 1 pair(s) it could not compare. ' +
        `The first is ${FILE}#alignBottom and ${FILE}#alignTop: cannot read this unit`,
    ]);
  });
});
