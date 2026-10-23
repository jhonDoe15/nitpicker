import { describe, expect, it } from 'vitest';
import { validateFacts } from '../../facts/schema.mjs';
import { designFacts, fn, owner } from '../test-support/design-facts.mjs';

const cart = owner('src/cart.ts', 'Cart', {
  fields: [{ name: 'items', mutable: true, private: true }],
});
const status = owner('src/status.ts', 'Status', { kind: 'enum', cases: ['open', 'closed'] });
const lines = fn(cart, 'lines', {
  params: [{ name: 'limit', type: 'number' }],
  returnsField: 'items',
});

function withCallable(extra) {
  return designFacts({
    types: [cart, status],
    callables: [lines, { ...fn(cart, 'other'), ...extra }],
  });
}

describe('design facts schema', () => {
  it('accepts every field of the contract', () => {
    const facts = withCallable({
      entry: false,
      published: true,
      references: [lines.id],
      returns: 'number',
      forward: { target: lines.id, arguments: [0, -1], returned: true },
      calls: [{ target: lines.id, line: 3, receiver: 'this', cleanup: true, mutation: 'push' }],
      paramUses: [
        {
          param: 0,
          fields: ['items'],
          forwards: [{ target: lines.id, position: 0 }],
          opaque: false,
        },
      ],
      ownFields: ['items'],
      decisions: [
        { subject: status.id, groups: [['open'], ['closed']], line: 4, otherwise: false },
        { subject: `${cart.id}.items`, groups: [['0']], line: 5 },
      ],
      reads: [{ type: cart.id, fields: ['items'], decided: ['items'], line: 6 }],
    });
    expect(validateFacts(facts)).toBe(facts);
  });

  it.each([
    [{ kind: 'lambda' }, 'facts.callables[1].kind is "lambda"'],
    [{ calls: [{ target: lines.id, line: 0 }] }, 'facts.callables[1].calls[0].line is 0'],
    [{ params: [{ type: 'number' }] }, 'facts.callables[1].params[0].name is missing'],
    [
      { forward: { target: lines.id, arguments: [-2], returned: true } },
      'facts.callables[1].forward.arguments is [-2]',
    ],
    [
      { paramUses: [{ param: 0, fields: [], forwards: [{ target: lines.id }] }] },
      'facts.callables[1].paramUses[0].forwards[0].position is missing',
    ],
    [
      { reads: [{ type: cart.id, fields: [], decided: 'x', line: 1 }] },
      'facts.callables[1].reads[0].decided is "x"',
    ],
    [
      { calls: [{ target: 'src/cart.ts#Cart.gone', line: 3 }] },
      'facts.callables[1].calls[0].target is "src/cart.ts#Cart.gone", which is not an id in facts.callables',
    ],
    [
      { owner: 'src/none.ts#None' },
      'facts.callables[1].owner is "src/none.ts#None", which is not an id in facts.types',
    ],
    [
      { decisions: [{ subject: 'Status', groups: [], line: 1 }] },
      'facts.callables[1].decisions[0].subject is "Status", which is neither a type id nor "<type id>.<field>"',
    ],
    [{ id: lines.id }, `facts.callables[1].id "${lines.id}" is used twice`],
    [
      { references: ['src/cart.ts#Cart.gone'] },
      'facts.callables[1].references[0] is "src/cart.ts#Cart.gone", which is not an id in facts.callables',
    ],
  ])('rejects %j', (extra, message) => {
    expect(() => validateFacts(withCallable(extra))).toThrow(message);
  });

  it('rejects a type reference that is not a callable id', () => {
    const facts = designFacts({
      types: [{ ...cart, references: ['src/cart.ts#nope'] }],
      callables: [],
    });
    expect(() => validateFacts(facts)).toThrow(
      'facts.types[0].references[0] is "src/cart.ts#nope", which is not an id in facts.callables',
    );
  });

  it('rejects a type in a file that modules do not list', () => {
    const facts = designFacts({ types: [cart], callables: [] });
    expect(() => validateFacts({ ...facts, modules: [] })).toThrow(
      'facts.types[0].file is "src/cart.ts", which is not in facts.modules',
    );
  });
});
