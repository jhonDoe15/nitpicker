import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../comparison/compare.mjs';

function clone(identity, value, { pair = 'a.java|b.java', divisible = true } = {}) {
  return {
    tool: 'duplicates',
    rule: 'duplicate-clone',
    path: pair.split('|')[0],
    identity,
    message: 'This code repeats b.java:3. Keep one copy and call it from both places.',
    classification: 'enforceable',
    location: { line: 3 },
    ratchet: { key: `pair:${pair}:clone`, value, ...(divisible ? { divisible } : {}) },
  };
}

const touched = {
  changedLines: new Map([['a.java', { added: false, ranges: [[3, 9]], inserted: [[5, 5]] }]]),
  isStrictRule: () => false,
};

function compared(baseFindings, headFindings) {
  const result = compareFindings({ baseFindings, headFindings, touchedCode: touched });
  return {
    newIdentities: result.newFindings.map((finding) => finding.identity),
    held: result.unchangedFindings.map((finding) => [finding.identity, finding.heldAtBase]),
    resolved: result.resolvedFindings.map((finding) => finding.identity),
  };
}

describe('duplicate clones held at the size of a legacy clone of the same files', () => {
  it('holds a legacy clone that shrank and so changed its identity', () => {
    expect(compared([clone('old', 100)], [clone('shrunk', 80)])).toEqual({
      newIdentities: [],
      held: [['shrunk', 100]],
      resolved: [],
    });
  });

  it('holds the pieces of a split clone while together they are not larger', () => {
    expect(compared([clone('old', 100)], [clone('left', 60), clone('right', 30)]).held).toEqual([
      ['left', 100],
      ['right', 100],
    ]);
    expect(
      compared([clone('old', 100)], [clone('left', 60), clone('right', 50)]).newIdentities,
    ).toEqual(['right']);
  });

  it('fails a clone that grew or that sits between other files', () => {
    expect(compared([clone('old', 100)], [clone('grown', 120)]).newIdentities).toEqual(['grown']);
    expect(compared([clone('old', 100)], [clone('other', 50, { pair: 'a.java|c.java' })])).toEqual({
      newIdentities: ['other'],
      held: [],
      resolved: ['old'],
    });
  });

  it('holds only one finding per base finding when the value is not divisible', () => {
    const plain = (identity, value) => clone(identity, value, { divisible: false });

    expect(compared([plain('old', 100)], [plain('left', 60), plain('right', 30)])).toEqual({
      newIdentities: ['right'],
      held: [['left', 100]],
      resolved: [],
    });
  });
});
