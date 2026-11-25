import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProveLogic } from '../../near-duplicates/engine.mts';
import { proveSameLogic } from '../../near-duplicates/proof/prove.mts';
import { COPIES } from '../../near-duplicates/test-support/copies.mts';
import { javascriptUnits } from '../../near-duplicates/test-support/javascript.mts';
import type { FactUnit } from '../facts/typed/fact-types.mts';
import { nearDuplicateMatches } from './near-duplicates.mts';

const FILE = 'src/copies.js';

const failingOnAlignTop: ProveLogic = (sides) => {
  if (sides.some(({ unit }) => 'name' in unit && unit.name === 'alignTop')) {
    throw new TypeError('cannot read this unit');
  }
  return proveSameLogic(sides);
};

describe('near-duplicate when one pair cannot be compared', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports the other pairs and warns about the skipped one', () => {
    const warnings: string[] = [];
    vi.spyOn(process, 'emitWarning').mockImplementation((text) => {
      warnings.push(String(text));
    });
    const units: FactUnit[] = javascriptUnits(COPIES, { file: FILE }).map(
      ({ file, name, start, end, tree }) => ({
        file,
        name,
        start,
        end,
        tokens: 10,
        final: false,
        tree,
      }),
    );
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
