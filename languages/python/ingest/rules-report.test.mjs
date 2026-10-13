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
      entry({ rule: 'no-type-check', subject: 'Parser.parse' }),
      entry({ rule: 'not-type-checking', subject: 'if not TYPE_CHECKING' }),
      entry({ rule: 'stub-beside-source', subject: 'mod.pyi' }),
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ message }) => message)).toEqual([
      'pydantic is imported outside an adapters/ package',
      'STATUS_* are string constants that belong in one enum',
      'Inline suppression `# noqa: F401`',
      '`Parser.parse` is excluded from type checking by `@no_type_check`',
      '`if not TYPE_CHECKING` hides code from the type checkers',
      '`mod.pyi` sits beside its source and replaces it for the checkers',
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
