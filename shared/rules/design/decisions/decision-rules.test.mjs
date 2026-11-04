import { describe, expect, it } from 'vitest';
import { designFacts, designRun, fn, owner, summaries } from '../test-support/design-facts.mjs';

const method = owner('src/pay/method.ts', 'PaymentMethod', {
  kind: 'enum',
  cases: ['card', 'paypal', 'invoice'],
});

function decider(file, groups, extra = {}) {
  return fn(owner(file), 'decide', {
    decisions: [{ subject: method.id, groups, line: 7, ...extra }],
  });
}

function decisions(sites) {
  return designFacts({
    types: [method, ...sites.map(({ file }) => owner(file))],
    callables: sites,
  });
}

describe('repeated-policy-decision', () => {
  it('reports two modules that group the same constants into one case', () => {
    const facts = decisions([
      decider('src/checkout/fees.ts', [['card', 'paypal'], ['invoice']]),
      decider('src/receipts/text.ts', [['paypal', 'card']], { otherwise: true }),
    ]);
    const findings = designRun(facts, 'repeated-policy-decision');
    expect(summaries(findings)).toEqual([
      {
        rule: 'repeated-policy-decision',
        path: 'src/pay/method.ts',
        identity: 'src/pay/method.ts#PaymentMethod|card,paypal',
        classification: 'descriptive',
        line: 1,
      },
    ]);
    expect(findings[0].message.split(' If this')[0]).toBe(
      '2 decisions over PaymentMethod treat `card` and `paypal` as one case: src/checkout/fees.ts:7, src/receipts/text.ts:7. That grouping is a rule of its own: give PaymentMethod one function that answers it, and call it from each place.',
    );
  });

  it.each([
    ['one case per arm', [['card'], ['paypal'], ['invoice']], [['card'], ['paypal']]],
    ['different groupings', [['card', 'paypal']], [['card', 'invoice']]],
    ['groups of every case', [['card', 'paypal', 'invoice']], [['invoice', 'paypal', 'card']]],
  ])('passes %s', (_, first, second) => {
    const facts = decisions([decider('src/a.ts', first), decider('src/b.ts', second)]);
    expect(designRun(facts, 'repeated-policy-decision')).toEqual([]);
  });

  it('names the decision next to the type that already answers it', () => {
    const facts = decisions([
      decider('src/pay/method.ts', [['card', 'paypal']]),
      decider('src/receipts/text.ts', [['paypal', 'card']]),
    ]);
    const [finding] = designRun(facts, 'repeated-policy-decision');
    expect(finding.message.split(': ').at(-1).split('. If this')[0]).toBe(
      'decide already answers it next to PaymentMethod; call it from the other places',
    );
  });

  it('passes the same grouping twice in one module', () => {
    const facts = decisions([decider('src/a.ts', [['card', 'paypal']])]);
    const twice = {
      ...facts.callables[0],
      decisions: [...facts.callables[0].decisions, ...facts.callables[0].decisions],
    };
    expect(designRun({ ...facts, callables: [twice] }, 'repeated-policy-decision')).toEqual([]);
  });
});

const order = owner('src/orders/order.ts', 'Order', {
  fields: ['status', 'paidAt', 'total'].map((name) => ({ name })),
});

function reader(file, decided, extra = {}) {
  return fn(owner(file), 'check', {
    reads: [{ type: order.id, fields: ['status', 'paidAt', 'total'], decided, line: 5 }],
    ...extra,
  });
}

function readers(sites, type = order) {
  return designFacts({ types: [type, ...sites.map(({ file }) => owner(file))], callables: sites });
}

describe('foreign-state-decision', () => {
  it('reports two functions outside a class that branch on the same fields of it', () => {
    const facts = readers([
      reader('src/ship/ship.ts', ['paidAt', 'status']),
      reader('src/refund/refund.ts', ['status', 'paidAt', 'total']),
    ]);
    const findings = designRun(facts, 'foreign-state-decision');
    expect(summaries(findings)).toEqual([
      {
        rule: 'foreign-state-decision',
        path: 'src/orders/order.ts',
        identity: 'src/orders/order.ts#Order|paidAt,status',
        classification: 'descriptive',
        line: 1,
      },
    ]);
    expect(findings[0].message.split(' If this')[0]).toBe(
      '2 functions outside Order decide on its `paidAt` and `status`: check (src/refund/refund.ts:2), check (src/ship/ship.ts:2). Order already has behaviour; give it a method that answers this question and call that, so the rule lives with the state it reads.',
    );
  });

  it('joins the fields one function decides on across its reads', () => {
    const split = fn(owner('src/ship/ship.ts'), 'check', {
      reads: [
        { type: order.id, fields: ['status'], decided: ['status', 'total'], line: 5 },
        { type: order.id, fields: ['paidAt'], decided: ['paidAt', 'status'], line: 9 },
      ],
    });
    const facts = readers([split, reader('src/refund/refund.ts', ['status', 'paidAt', 'total'])]);
    const identities = designRun(facts, 'foreign-state-decision').map(({ identity }) => identity);
    expect(identities).toEqual(['src/orders/order.ts#Order|paidAt,status,total']);
  });

  it.each([
    [
      'a data type',
      readers(
        [reader('src/a.ts', ['paidAt', 'status']), reader('src/b.ts', ['paidAt', 'status'])],
        { ...order, kind: 'data' },
      ),
    ],
    ['one field each', readers([reader('src/a.ts', ['status']), reader('src/b.ts', ['status'])])],
    ['a single function', readers([reader('src/a.ts', ['paidAt', 'status'])])],
    [
      'entries',
      readers([
        reader('src/a.ts', ['paidAt', 'status'], { entry: true }),
        reader('src/b.ts', ['paidAt', 'status']),
      ]),
    ],
  ])('passes %s', (_, facts) => {
    expect(designRun(facts, 'foreign-state-decision')).toEqual([]);
  });
});
