import { describe, expect, it } from 'vitest';
import { designRows, fn, owner } from './support.mts';
import type { DesignType } from '../../go-types.mts';

type Fields = { readonly [field: string]: unknown };
type Site = readonly [string, string, string[]?];

const method = owner('pay/method.go', 'Method', {
  kind: 'enum',
  cases: ['Card', 'Paypal', 'Invoice', 'Cash'],
});
const order = owner('pay/order.go', 'Order', {
  fields: [{ name: 'Status' }, { name: 'Count' }],
});

function decider(file: string, name: string, decision: Fields) {
  return fn(owner(file), name, { decisions: [{ line: 4, otherwise: false, ...decision }] });
}

function run(
  types: readonly DesignType[],
  decisions: readonly (readonly [string, string, Fields])[],
) {
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

  const PASSING: readonly (readonly [string, readonly Site[]])[] = [
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
  ];

  it.each(PASSING)('passes %s', (_, sites) => {
    const decisions = sites.map(
      ([file, name, group = ['Card', 'Paypal']]): [string, string, Fields] => [
        file,
        name,
        { subject: method.id, groups: [group] },
      ],
    );
    expect(run([method], decisions)).toEqual([]);
  });
});

describe('foreign-state-decision on Go facts', () => {
  const account = owner('ledger/account.go', 'Account', {
    kind: 'class',
    fields: [{ name: 'Status' }, { name: 'Tier' }, { name: 'Name' }],
  });

  function reader(file: string, name: string, decided: readonly string[]) {
    return fn(owner(file), name, {
      reads: [{ type: account.id, fields: ['Name', ...decided], decided, line: 5 }],
    });
  }

  function rows(sites: readonly (readonly [string, string, readonly string[]])[]) {
    const callables = sites.map(([file, name, decided]) => reader(file, name, decided));
    const files = [...new Set(callables.map(({ file }) => file))];
    return designRows(
      { types: [account, ...files.map((file) => owner(file))], callables },
      'foreign-state-decision',
      { module: 'shop' },
    ).map(({ identity }) => identity);
  }

  it('reports two files that branch on the same two fields of a struct', () => {
    expect(
      rows([
        ['app/limit.go', 'Limit', ['Status', 'Tier']],
        ['app/quota.go', 'Quota', ['Tier', 'Status']],
      ]),
    ).toEqual(['ledger/account.go#Account|Status,Tier']);
  });

  const UNDECIDED: readonly (readonly [string, readonly (readonly string[])[]])[] = [
    ['one decided field', [['Status'], ['Status']]],
    [
      'different fields',
      [
        ['Status', 'Tier'],
        ['Name', 'Tier'],
      ],
    ],
  ];

  it.each(UNDECIDED)('passes %s', (_, decided) => {
    const [first = [], second = []] = decided;
    expect(
      rows([
        ['app/limit.go', 'Limit', first],
        ['app/quota.go', 'Quota', second],
      ]),
    ).toEqual([]);
  });

  it('passes decisions made inside the struct file', () => {
    expect(
      rows([
        ['ledger/account.go', 'Active', ['Status', 'Tier']],
        ['ledger/account.go', 'Frozen', ['Status', 'Tier']],
      ]),
    ).toEqual([]);
  });
});
