import { describe, expect, it } from 'vitest';
import { ingestRulesReport } from './rules-report.mjs';

const entry = (overrides) => ({
  rule: 'frozen-dataclass',
  path: 'src/order.py',
  subject: 'Order',
  line: 4,
  ...overrides,
});

describe('effect rules report', () => {
  it.each([
    [
      'io-in-loop',
      'requests.get()|remote',
      '`requests.get()` sends a remote request once per item of a loop',
    ],
    [
      'io-in-loop',
      'load_order() > repo.find_by_id()|database|concurrent',
      '`load_order()` (which calls `repo.find_by_id()`) sends a database query once per item of a loop, started concurrently',
    ],
    [
      'accumulator-copy',
      'acc|acc + [...]|reduce',
      '`acc` is replaced by a copy of itself (`acc + [...]`) on every step of the `reduce`, so the work grows with the square of the list',
    ],
    [
      'lazy-relation-in-loop',
      'Order.customer|django|Order.objects.all()',
      '`Order.customer` is a lazy relationship: `Order.objects.all()` fetches the `Order` rows without it, so each item of the loop runs one more query',
    ],
    [
      'lazy-relation-in-loop',
      'Order.customer|django|Order.objects.all()|to_dto()',
      '`to_dto()` receives each item of the loop and reads its lazy relationship `Order.customer`: `Order.objects.all()` fetches the `Order` rows without it, so each item of the loop runs one more query',
    ],
  ])('describes %s by its subject', (rule, subject, message) => {
    expect(ingestRulesReport(JSON.stringify([entry({ rule, subject })]))[0].message).toBe(message);
  });
});

describe('io-in-loop identity', () => {
  it('keeps the callee as the identity whatever the kind and path', () => {
    const report = [
      { rule: 'io-in-loop', path: 'a.py', subject: 'load() > requests.get()|remote', line: 3 },
      { rule: 'io-in-loop', path: 'a.py', subject: 'repo.get()|database|concurrent', line: 5 },
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ identity }) => identity)).toEqual([
      'load()',
      'repo.get()',
    ]);
  });

  it('drops the call boundaries of the message text from the identity', () => {
    const report = [
      { rule: 'io-in-loop', path: 'a.py', subject: 'requests.get(...).json()|remote', line: 3 },
      { rule: 'io-in-loop', path: 'a.py', subject: 'clients[...].get()|remote', line: 5 },
      { rule: 'io-in-loop', path: 'a.py', subject: 'Client().fetch_all()|remote', line: 7 },
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ identity }) => identity)).toEqual([
      'requests.get.json()',
      'clients.get()',
      'Client.fetch_all()',
    ]);
  });
});

describe('accumulator-copy identity', () => {
  it('keeps a subject that is not a call as it is', () => {
    const report = [
      { rule: 'accumulator-copy', path: 'a.py', subject: 'acc|acc + [...]|loop', line: 3 },
      { rule: 'lazy-relation-in-loop', path: 'a.py', subject: 'Order.items|django|x', line: 5 },
      {
        rule: 'lazy-relation-in-loop',
        path: 'b.py',
        subject: 'Order.items|django|x|to_dto()',
        line: 7,
      },
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ identity }) => identity)).toEqual([
      'acc',
      'Order.items',
      'Order.items',
    ]);
  });
});
