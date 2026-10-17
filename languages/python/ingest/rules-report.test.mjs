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
        subject: 'Order',
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
      '`except ValueError` swallows the error: it only logs it or returns a default, and carries on',
      '`contextlib.suppress(Exception)` ignores every error',
    ]);
  });

  it.each([
    [
      'process-env-access',
      'os.getenv',
      '`os.getenv` reads the process environment outside the composition root',
    ],
    [
      'clock-now',
      'datetime.datetime.now',
      '`datetime.datetime.now()` reads the clock in domain code',
    ],
    ['random-in-domain', 'random.random', '`random.random()` draws randomness in domain code'],
    ['io-in-domain', 'requests', '`requests` does input or output in domain code'],
    ['module-level-mutable-state', 'ITEMS', '`ITEMS` changes a module-level collection'],
    [
      'unsafe-path-join',
      'read',
      '`read()` builds a file path from its input without a containment check',
    ],
    [
      'handwritten-boundary-guard',
      'isinstance(data)',
      '`isinstance(data)` checks untrusted data by hand',
    ],
    ['any-in-domain', 'total', '`total` uses `Any` in domain code'],
    ['pydantic-any-field', 'Payload.body', 'The pydantic field `Payload.body` is typed `Any`'],
    ['pydantic-extra-allow', 'Payload', 'The pydantic model `Payload` accepts unknown fields'],
    ['repeated-string-literal', 'pending', 'The string "pending" is repeated three times or more'],
    ['generic-name', 'utils', '`utils` has a generic name'],
    ['hardcoded-secret', 'API_TOKEN', '`API_TOKEN` holds a hardcoded secret'],
    ['credential-shape', 'credential', 'A string has the shape of a credential'],
    ['secret-in-log', 'token', '`token` is a secret and is passed to a log call'],
    ['io-in-loop', 'requests.get()', '`requests.get()` runs once per item of a loop'],
    ['todo-without-issue', 'TODO: later', 'The task marker `TODO: later` has no issue'],
    [
      'skipped-test-without-reason',
      'pytest.mark.skip',
      '`pytest.mark.skip` skips a test without a reason',
    ],
    ['sleep-in-test', 'time.sleep', '`time.sleep` waits for real time in a test'],
    ['tautological-assert', 'assert', '`assert` can never fail'],
    ['real-clock-in-test', 'time.time', '`time.time()` reads the real clock in a test'],
    ['random-in-test', 'random.random', '`random.random()` draws random values in a test'],
    ['network-in-test', 'requests.get', '`requests.get` reaches the network in a unit test'],
    [
      'uncollected-tests',
      'orders_check.py',
      '`orders_check.py` defines tests that the test run does not collect',
    ],
    [
      'test-helper-in-source',
      'testing.py',
      '`testing.py` is test support inside the production source',
    ],
  ])('describes %s by its subject', (rule, subject, message) => {
    expect(ingestRulesReport(JSON.stringify([entry({ rule, subject })]))[0].message).toBe(message);
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
