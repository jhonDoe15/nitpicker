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
      entry({ rule: 'swallowed-exception', subject: 'except ValueError' }),
      entry({ rule: 'blind-suppress', subject: 'contextlib.suppress(Exception)' }),
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ message }) => message)).toEqual([
      'pydantic is imported outside an adapters/ package',
      'STATUS_* are string constants that belong in one enum',
      'Inline suppression `# noqa: F401`',
      '`Parser.parse` is excluded from type checking by `@no_type_check`',
      '`if not TYPE_CHECKING` hides code from the type checkers',
      '`mod.pyi` sits beside its source and replaces it for the checkers',
      '`except ValueError` swallows the error',
      '`contextlib.suppress(Exception)` ignores every error',
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

  it('turns a check skipped for a too deep expression into a descriptive note', () => {
    const report = [
      entry({ rule: 'rules-skipped', path: 'src/sums.py', subject: 'file', line: 1 }),
      entry({ rule: 'rules-skipped', path: '.', subject: 'unused-option', line: 1 }),
      entry({ rule: 'rules-skipped', path: 'src/deep.py', subject: 'all', line: 1 }),
    ];

    expect(ingestRulesReport(JSON.stringify(report))).toEqual([
      {
        tool: 'python-rules',
        rule: 'rules-skipped',
        path: 'src/sums.py',
        identity: 'file',
        message:
          "python-rules skipped the per-file checks here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.",
        classification: 'descriptive',
        location: { line: 1 },
      },
      {
        tool: 'python-rules',
        rule: 'rules-skipped',
        path: '.',
        identity: 'unused-option',
        message:
          "python-rules skipped the unused-option checks here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.",
        classification: 'descriptive',
        location: { line: 1 },
      },
      {
        tool: 'python-rules',
        rule: 'rules-skipped',
        path: 'src/deep.py',
        identity: 'all',
        message:
          "python-rules skipped every check here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.",
        classification: 'descriptive',
        location: { line: 1 },
      },
    ]);
  });

  it('turns a project file that cannot be read into a tool error naming the problem', () => {
    const report = [
      entry({
        rule: 'project-file-invalid',
        path: 'setup.cfg',
        subject: 'setup.cfg',
        line: 3,
        data: { problem: 'ParsingError: bad line' },
      }),
    ];

    expect(ingestRulesReport(JSON.stringify(report))).toEqual([
      {
        tool: 'python-rules',
        rule: 'project-file-invalid',
        path: 'setup.cfg',
        identity: 'setup.cfg',
        message:
          'setup.cfg could not be read (ParsingError: bad line), so python-rules took the package as unpublished with no entry points from it, and unused-option may name a parameter an entry point passes. Fix the file.',
        classification: 'tool-error',
        location: { line: 3 },
      },
    ]);
  });

  it('names an unused parameter with a default, and which calls count', () => {
    const report = [
      entry({ rule: 'unused-option', subject: 'total.rate', data: { scope: 'private' } }),
      entry({ rule: 'unused-option', subject: 'total.cents', data: { scope: 'published' } }),
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ message }) => message)).toEqual([
      'Optional parameter `total.rate` is never passed by a call outside the tests',
      "Optional parameter `total.cents` is never passed by any call, this package's own tests included",
    ]);
  });
});
