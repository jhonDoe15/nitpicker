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
  it('shows the helper chain in the message and keeps it out of the identity', () => {
    const via = 'quote -> shop.prices.fetch -> requests.get';
    const report = [entry({ rule: 'io-in-domain', subject: 'shop.prices.fetch', via })];

    expect(ingestRulesReport(JSON.stringify(report))).toEqual([
      {
        tool: 'python-rules',
        rule: 'io-in-domain',
        path: 'src/order.py',
        identity: 'shop.prices.fetch',
        subject: via,
        message: `\`${via}\` does input or output through a project helper called from domain code`,
        classification: 'enforceable',
        location: { line: 4 },
      },
    ]);
  });

  it('keeps two helpers with the same name apart by their qualified names', () => {
    const report = ['shop.shared.a.fetch', 'shop.shared.c.fetch'].map((subject) =>
      entry({ rule: 'io-in-domain', subject, via: `quote -> ${subject} -> requests.get` }),
    );

    expect(ingestRulesReport(JSON.stringify(report)).map(({ identity }) => identity)).toEqual([
      'shop.shared.a.fetch',
      'shop.shared.c.fetch',
    ]);
  });

  it.each([
    [
      'clock-now',
      'when -> shop.clock.now -> datetime.datetime.now',
      '`when -> shop.clock.now -> datetime.datetime.now` reads the clock through a project helper called from domain code',
    ],
    [
      'random-in-domain',
      'ident -> shop.ids.new -> uuid.uuid4',
      '`ident -> shop.ids.new -> uuid.uuid4` draws randomness through a project helper called from domain code',
    ],
    [
      'import-time-effect',
      'shop.db.connect -> sqlite3.connect',
      '`shop.db.connect -> sqlite3.connect` runs an external effect when the module is imported, so every import, tests included, performs it',
    ],
  ])('words the %s helper chain', (rule, via, message) => {
    const [found] = ingestRulesReport(JSON.stringify([entry({ rule, subject: 'x', via })]));

    expect(found.message).toBe(message);
  });

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
    [
      'random-in-domain',
      'import faker',
      '`import faker` brings an id or random-data library into domain code',
    ],
    ['logger-in-domain', 'logging', '`logging` is imported into domain code'],
    [
      'module-state-in-domain',
      'shop.cache.PRICES',
      'Domain code uses the module state `shop.cache.PRICES`',
    ],
    [
      'import-time-effect',
      'sqlite3.connect',
      '`sqlite3.connect()` runs when the module is imported, so every import, tests included, performs it',
    ],
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
    [
      'task-outlives-resource',
      'stream passed to nursery.start_soon',
      '`stream passed to nursery.start_soon`: the resource closes when its `with` block ends, while the child task can still use it',
    ],
    [
      'unshielded-cleanup-await',
      'await stream.aclose() in finally',
      '`await stream.aclose() in finally` can be cancelled before the cleanup finishes, so the resource may stay open',
    ],
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
    [
      'tls-verification-off',
      'session.verify',
      '`session.verify` turns off TLS certificate verification, or lets the environment turn it off',
    ],
    [
      'weak-hmac',
      'hmac.new(md5)',
      '`hmac.new(md5)` signs with HMAC-MD5, which is no longer approved for message authentication',
    ],
    [
      'http-without-timeout',
      'urllib.request.urlopen',
      '`urllib.request.urlopen` can wait forever: it has no timeout',
    ],
    [
      'unsafe-deserialization',
      'torch.load',
      '`torch.load` unpickles arbitrary objects from the file on torch below 2.6, or with `weights_only=False`',
    ],
    [
      'unsafe-deserialization',
      'joblib.load',
      '`joblib.load` unpickles arbitrary objects from the file',
    ],
    [
      'unsafe-deserialization',
      'keras.models.load_model',
      '`keras.models.load_model` with `safe_mode=False` runs arbitrary code stored in the model file',
    ],
    [
      'unsafe-deserialization',
      'lxml.etree.XMLParser',
      '`lxml.etree.XMLParser` expands external entities or fetches them from the network',
    ],
    [
      'unsafe-deserialization',
      'yaml.full_load',
      '`yaml.full_load` can build arbitrary Python objects from the document',
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

  it('keeps every finding the script reports, test support is decided by the script', () => {
    const report = [
      entry({ rule: 'tls-verification-off', path: 'src/shop/testing/ab_variants.py' }),
      entry({ rule: 'sql-string-formatting', path: 'src/league/fixtures/repository.py' }),
      entry({ rule: 'sql-string-formatting', path: 'src/league/fixtures.py' }),
      entry({ rule: 'http-without-timeout', path: 'src/payments/mocks/sandbox_gateway.py' }),
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ path }) => path)).toEqual([
      'src/shop/testing/ab_variants.py',
      'src/league/fixtures/repository.py',
      'src/league/fixtures.py',
      'src/payments/mocks/sandbox_gateway.py',
    ]);
  });

  it('turns a failed check into a tool error for that file and keeps the other findings', () => {
    const report = [
      entry(),
      {
        rule: 'rules-check-failed',
        path: 'src/app/db.py',
        subject: 'sql-string-formatting',
        line: 1,
        error: 'IndexError: list index out of range',
      },
    ];

    const [kept, failed] = ingestRulesReport(JSON.stringify(report));

    expect([kept.rule, kept.classification]).toEqual(['frozen-dataclass', 'enforceable']);
    expect([failed]).toEqual([
      {
        tool: 'python-rules',
        rule: 'rules-check-failed',
        path: 'src/app/db.py',
        identity: 'rules-check-failed:sql-string-formatting',
        message:
          'The python-rules check sql-string-formatting failed on src/app/db.py (IndexError: list index out of range), so that file has no sql-string-formatting findings; the other checks and files ran. Report it as a nitpicker bug with the file.',
        classification: 'tool-error',
      },
    ]);
  });

  it('turns a skipped run on an old Python into one tool error naming the required version', () => {
    const report = [{ rule: 'rules-skipped', path: '.', subject: '3.9.18', line: 1 }];

    expect(ingestRulesReport(JSON.stringify(report))).toEqual([
      {
        tool: 'python-rules',
        rule: 'rules-skipped',
        path: '.',
        identity: 'rules-skipped',
        message:
          'The python-rules checks did not run: they need Python 3.10 or newer, and the project environment runs Python 3.9.18. Point "python.environment" at a Python 3.10 or newer environment.',
        classification: 'tool-error',
      },
    ]);
  });

  it('reads an empty report', () => {
    expect(ingestRulesReport('[]')).toEqual([]);
  });

  it('turns a check skipped for a too deep expression into a descriptive note', () => {
    const report = [
      entry({ rule: 'rules-too-deep', path: 'src/sums.py', subject: 'file', line: 1 }),
      entry({ rule: 'rules-too-deep', path: '.', subject: 'unused-option', line: 1 }),
      entry({ rule: 'rules-too-deep', path: 'src/deep.py', subject: 'all', line: 1 }),
    ];

    expect(ingestRulesReport(JSON.stringify(report))).toEqual([
      {
        tool: 'python-rules',
        rule: 'rules-too-deep',
        path: 'src/sums.py',
        identity: 'file',
        subject: 'file',
        message:
          "python-rules skipped some of the per-file checks here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.",
        classification: 'descriptive',
        location: { line: 1 },
      },
      {
        tool: 'python-rules',
        rule: 'rules-too-deep',
        path: '.',
        identity: 'unused-option',
        subject: 'unused-option',
        message:
          "python-rules skipped the unused-option checks here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.",
        classification: 'descriptive',
        location: { line: 1 },
      },
      {
        tool: 'python-rules',
        rule: 'rules-too-deep',
        path: 'src/deep.py',
        identity: 'all',
        subject: 'all',
        message:
          "python-rules skipped every check here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.",
        classification: 'descriptive',
        location: { line: 1 },
      },
    ]);
  });

  it('names an unused parameter with a default, and which calls count', () => {
    const report = [
      entry({ rule: 'unused-option', subject: 'total.rate', data: { scope: 'private' } }),
      entry({ rule: 'unused-option', subject: 'total.cents', data: { scope: 'published' } }),
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ message }) => message)).toEqual([
      'Option total.rate is never set. Remove it, or set it from a real call (tests do not count).',
      "Option total.cents is never set. Remove it, or set it from a real call (this package's own tests count).",
    ]);
  });
});
