import { describe, expect, it } from 'vitest';
import { designRows, fn, owner } from './support.mjs';

const method = owner('pay/method.go', 'Method', {
  kind: 'enum',
  cases: ['Card', 'Paypal', 'Invoice', 'Cash'],
});
const order = owner('pay/order.go', 'Order', {
  fields: [{ name: 'Status' }, { name: 'Count' }],
});

function decider(file, name, decision) {
  return fn(owner(file), name, { decisions: [{ line: 4, otherwise: false, ...decision }] });
}

function run(types, decisions) {
  const callables = decisions.map(([file, name, decision]) => decider(file, name, decision));
  return designRows(
    {
      types: [
        ...types,
        ...[...new Set(callables.map(({ file }) => file))].map((file) => owner(file)),
      ],
      callables,
    },
    'repeated-policy-decision',
    { module: 'shop' },
  );
}

describe('repeated-policy-decision on Go facts', () => {
  it('reports two files that group the constants of one enum the same way', () => {
    const subject = method.id;
    expect(
      run(
        [method],
        [
          ['app/fee.go', 'Fee', { subject, groups: [['Card', 'Paypal'], ['Invoice']] }],
          ['app/audit.go', 'Audit', { subject, groups: [['Paypal', 'Card']] }],
        ],
      ),
    ).toEqual([
      {
        path: 'pay/method.go',
        identity: 'pay/method.go#Method|Card,Paypal',
        classification: 'descriptive',
        line: 1,
      },
    ]);
  });

  it('reports a grouping of the values of a field', () => {
    const subject = `${order.id}.Status`;
    const rows = run(
      [order],
      [
        ['app/open.go', 'Open', { subject, groups: [['open', 'held']] }],
        ['app/close.go', 'Close', { subject, groups: [['held', 'open'], ['done']] }],
      ],
    );
    expect(rows.map(({ identity }) => identity)).toEqual(['pay/order.go#Order.Status|held,open']);
  });

  it.each([
    [
      'one file',
      [
        ['app/fee.go', 'Fee'],
        ['app/fee.go', 'Fee2'],
      ],
    ],
    [
      'groups of one constant',
      [
        ['app/fee.go', 'Fee', ['Card']],
        ['app/audit.go', 'Audit', ['Card']],
      ],
    ],
    [
      'an arm that covers every constant',
      [
        ['app/fee.go', 'Fee', ['Card', 'Paypal', 'Invoice', 'Cash']],
        ['app/audit.go', 'Audit', ['Card', 'Paypal', 'Invoice', 'Cash']],
      ],
    ],
  ])('passes %s', (_, sites) => {
    const decisions = sites.map(([file, name, group = ['Card', 'Paypal']]) => [
      file,
      name,
      { subject: method.id, groups: [group] },
    ]);
    expect(run([method], decisions)).toEqual([]);
  });
});
