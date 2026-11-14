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
