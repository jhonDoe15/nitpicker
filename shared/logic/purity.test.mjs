import { describe, expect, it } from 'vitest';
import { normalize, REWRITE_NAMES } from './normalize.mjs';
import { cannotThrow, isSideEffectFree, pureCallKind } from './purity.mjs';
import { term, withRange } from './terms.mjs';
import { binary, call, member, name, not, number, text } from './test-support/build.mjs';

const math = (method, ...args) => call(member(name('Math'), method), ...args);

describe('side-effect-free operands', () => {
  it.each([
    ['a local', name('count'), true, true],
    ['a literal', text('a'), true, true],
    [
      'arithmetic on locals, which throws when it mixes BigInt and number',
      binary('*', name('a'), number(2)),
      true,
      false,
    ],
    ['a strict equality of locals', binary('===', name('a'), name('b')), true, true],
    ['a negated local', not(name('done')), true, true],
    ['a field read', member(name('user'), 'name'), true, false],
    ['a pure library call', math('abs', name('a')), true, false],
    ['a string read', call(member(name('label'), 'startsWith'), text('x')), true, false],
    ['a random number', math('random'), false, false],
    ['a call to own code', call(name('load')), false, false],
    [
      'a division, which can throw on zero in Java',
      binary('/', name('a'), name('b')),
      false,
      false,
    ],
    ['an assignment the producer could not model', term('opaque', 'a = 1'), false, false],
  ])('classifies %s', (_case, node, sideEffectFree, safeToDrop) => {
    expect({ sideEffectFree: isSideEffectFree(node), safeToDrop: cannotThrow(node) }).toEqual({
      sideEffectFree,
      safeToDrop,
    });
  });
});

describe('kinds of pure library calls', () => {
  it.each([
    ['a static math call', member(name('Math'), 'abs'), 'static'],
    [
      'a string read, which can throw on a missing receiver',
      member(name('label'), 'startsWith'),
      'read',
    ],
    ['a random number', member(name('Math'), 'random'), undefined],
    ['a call to own code', name('load'), undefined],
  ])('classifies %s', (_case, callee, kind) => {
    expect(pureCallKind(callee)).toBe(kind);
  });
});

describe('language-neutral normal form', () => {
  it('names every rewrite once', () => {
    expect(REWRITE_NAMES).toEqual([
      'double-negation',
      'de-morgan',
      'flipped-equality',
      'negated-boolean-literal',
      'constant-boolean-operand',
      'boolean-literal-ternary',
      'negated-condition',
      'comparison-orientation',
      'logical-grouping',
      'commutative-order',
      'boolean-literal-return',
      'nested-if-merge',
      'else-after-return',
    ]);
  });

  it('drops a double negation of a value the producer typed as boolean', () => {
    const flag = { ...name('flag'), boolean: true };

    expect(normalize(not(not(flag))).term).toEqual(flag);
  });

  it('records the span of both statements a boolean return replaces', () => {
    const test = withRange(binary('<', name('a'), name('b')), [4, 9]);
    const returns = (value, range) =>
      withRange(term('return', undefined, [term('literal', value)]), range);
    const consequent = term('block', undefined, [returns('true', [11, 23])]);
    const guard = withRange(term('if', undefined, [test, consequent]), [0, 23]);
    const body = withRange(term('block', undefined, [guard, returns('false', [24, 37])]), [0, 37]);

    expect(normalize(body).rewrites).toEqual([
      { rewrite: 'boolean-literal-return', range: [0, 37] },
    ]);
  });

  it('gives the same key to conditions that differ only in rewrites', () => {
    const left = normalize(not(binary('!==', name('a'), name('b'))), { booleanContext: true });
    const right = normalize(binary('===', name('b'), name('a')), { booleanContext: true });

    expect(left.key).toBe(right.key);
  });
});
