import { describe, expect, it } from 'vitest';
import { ingestRulesReport } from './rules-report.mjs';

const entry = (overrides) => ({
  rule: 'frozen-dataclass',
  path: 'src/order.py',
  subject: 'Order',
  line: 4,
  ...overrides,
});

describe('rules script report', () => {
  it('turns each entry into an enforceable finding identified by its subject', () => {
    expect(ingestRulesReport(JSON.stringify([entry()]))).toEqual([
      {
        tool: 'python-rules',
        rule: 'frozen-dataclass',
        path: 'src/order.py',
        identity: 'Order',
        message: 'Dataclass Order is not frozen',
        classification: 'enforceable',
        location: { line: 4 },
      },
    ]);
  });

  it('describes every rule by its subject', () => {
    const report = [
      entry({ rule: 'pydantic-boundary', subject: 'pydantic' }),
      entry({ rule: 'enum-string-constants', subject: 'STATUS_*' }),
      entry({ rule: 'no-inline-suppression', subject: 'noqa: F401' }),
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ message }) => message)).toEqual([
      'pydantic is imported outside an adapters/ package',
      'STATUS_* are string constants that belong in one enum',
      'Inline suppression `# noqa: F401`',
    ]);
  });

  it('numbers repeats of one subject in a file and keeps the identity when lines move', () => {
    const report = [entry({ line: 1 }), entry({ line: 20 }), entry({ path: 'src/other.py' })];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ identity }) => identity)).toEqual([
      'Order',
      'Order#2',
      'Order',
    ]);
  });

  it('reads an empty report', () => {
    expect(ingestRulesReport('[]')).toEqual([]);
  });
});
