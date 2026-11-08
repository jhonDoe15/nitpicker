import { RULES_TOOL } from './tool.mjs';

const EXPECTED_FAILURES = /xfail|expectedFailure/u;

function skipDescription(subject = '') {
  if (subject.startsWith('return in ')) {
    return `\`${subject}\` skips the rest of a test without saying so`;
  }
  return EXPECTED_FAILURES.test(subject)
    ? `\`${subject}\` marks a test as expected to fail without a reason`
    : `\`${subject}\` skips a test without a reason`;
}

function skipAllowed(subject = '') {
  if (subject.startsWith('return in ')) {
    return 'Skip visibly: `@pytest.mark.skipif(sys.platform == "win32", reason="posix only")` or `pytest.skip("...")` (`self.skipTest("...")` in unittest).';
  }
  if (EXPECTED_FAILURES.test(subject)) {
    return 'Give the reason and the expected error: `@pytest.mark.xfail(reason="bug 123", raises=ZeroDivisionError, strict=True)`; or fix or delete the test.';
  }
  if (subject.startsWith('unittest.') || subject === 'skipTest()' || subject === 'SkipTest') {
    return 'Give the reason: `@unittest.skip("needs the staging database")`, `self.skipTest("...")`; or fix or delete the test.';
  }
  return 'Give the reason: `@pytest.mark.skip(reason="needs the staging database")`, `pytest.skip("...")`; or fix or delete the test.';
}

const UNCOLLECTED_ADVICE = [
  [
    '(norecursedirs)',
    'Move the tests out of the directory `norecursedirs` skips, or remove that directory from `norecursedirs`.',
  ],
  [
    '(testpaths)',
    'Add its folder to `testpaths` in the pytest configuration, or move the tests into a folder listed there.',
  ],
  [
    '(--ignore)',
    'Remove the `--ignore` or `--ignore-glob` option that hides the file, or delete the tests.',
  ],
  [
    '(collect_ignore)',
    'Remove the `collect_ignore` entry in `conftest.py` that hides the file, or delete the tests.',
  ],
  [
    '(--deselect)',
    'Remove the `--deselect` option, or mark the test `@pytest.mark.skip(reason="...")` so the skip is visible; delete a test you no longer want.',
  ],
  [
    '(-k)',
    'Remove the `-k` expression in `addopts` that hides the test, or mark it `@pytest.mark.skip(reason="...")` so the skip is visible.',
  ],
  [
    '(-m)',
    'Remove the `-m` marker expression in `addopts` that hides the test, or mark it `@pytest.mark.skip(reason="...")` so the skip is visible.',
  ],
  [
    '(python_classes)',
    'Name the class the way `python_classes` collects it (`Test*` by default), or derive it from `unittest.TestCase`.',
  ],
  [
    '(__init__)',
    'Remove the `__init__`: pytest does not collect a test class that has one. Build the state in a fixture.',
  ],
  ['(unittest)', 'Name the file `test*.py` so `python -m unittest discover` finds it.'],
];

function uncollectedAllowed(subject = '') {
  const advice = UNCOLLECTED_ADVICE.find(([marker]) => subject.endsWith(marker));
  return (
    advice?.[1] ??
    'Name the file so pytest collects it (`test_*.py` or `*_test.py`), or add its pattern to `python_files` in the pytest configuration.'
  );
}

export const FAN_OUT_SEPARATOR = '\u001f';

function fanOutParts(subject = '') {
  const [combinator = '', collection = '<collection>', operation = '<call>', via = '', kind = ''] =
    subject.split(FAN_OUT_SEPARATOR);
  return { combinator, collection, operation, via, kind };
}

function fanOutDescription(subject) {
  const { combinator, collection, operation, via, kind } = fanOutParts(subject);
  const verb = kind === 'message' ? 'publishes through' : 'calls';
  const through = via === '' ? '' : ` (which ${verb} \`${via}\`)`;
  return `\`${combinator}\` starts \`${operation}\`${through} for every element of \`${collection}\` at once`;
}

function fanOutAllowed(subject) {
  const { kind } = fanOutParts(subject);
  const target = kind === 'message' ? "the broker's" : "the remote service's";
  return `A large collection exhausts ${target} connections or rate limit. Hold one \`asyncio.Semaphore(8)\` created outside the tasks with \`async with limit:\` around each call, gather fixed-size slices (\`items[i : i + 20]\`), or make one batch call when the API has one.`;
}

export const SMELL_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['unclosed-inline-resource'],
    describe: (subject) =>
      `\`${subject}\` opens a file, socket or connection and uses it in the same expression, so nothing closes it`,
    allowed: (subject) =>
      subject === 'connect()'
        ? 'Close the connection with `with contextlib.closing(sqlite3.connect(path)) as connection:`; `with sqlite3.connect(path)` alone only commits or rolls back and leaves the connection open.'
        : 'Open it in a `with` block (`with open(path, encoding="utf-8") as handle: data = json.load(handle)`), or read the whole file with `Path(path).read_text(encoding="utf-8")` or `read_bytes()`. Without `with`, only the garbage collector closes the handle: CPython does it when the last reference goes, PyPy later, an exception that keeps the frame alive holds it open, and Python warns with `ResourceWarning` when warnings are on (`-X dev`, pytest). `contextlib.closing(...)` and `ExitStack.enter_context(...)` also pass.',
  },
  {
    tool: RULES_TOOL,
    rules: ['regex-unescaped-value'],
    describe: (subject) =>
      `\`${subject}\` is built into a regex pattern unescaped, so a \`.\`, \`|\`, \`$\` or other metacharacter in it changes what matches`,
    allowed:
      'Escape the value first (`re.compile(rf"^/{re.escape(name)}/\\d+$")`), compare plain text with `in`, `startswith` or `==`, or pass a value that is meant as a whole pattern to `re.compile(pattern)` on its own.',
  },
  {
    tool: RULES_TOOL,
    rules: ['shell-command'],
    describe: (subject) => `\`${subject}\` runs a command through a shell`,
    allowed:
      'Run the program directly with the arguments as a list and leave the shell out: `subprocess.run(["git", "status"], check=True)`; `shell=False` is the default.',
  },
  {
    tool: RULES_TOOL,
    rules: ['repeated-string-literal'],
    describe: (subject) => `The string "${subject}" is repeated three times or more`,
    allowed:
      'Name it once as a constant (`PENDING = "pending"`), or as a member of an enum when the strings form a set of states.',
  },
  {
    tool: RULES_TOOL,
    rules: ['generic-name'],
    describe: (subject) => `\`${subject}\` has a generic name`,
    allowed:
      'Name it for its job (`price_rounding.py`, `OrderRepository`); shared logic that belongs to no feature lives in `shared/` under a name that says what it does.',
  },
  {
    tool: RULES_TOOL,
    rules: ['boolean-flag-parameter'],
    describe: (subject) => `\`${subject}\` switches a public function between two behaviors`,
    allowed:
      'Make the flag keyword-only, `def send(message, *, urgent=False)`, split the function into two named for each behavior, or pass an enum. click, typer and FastAPI pass options by keyword, so `def command(*, verbose: bool)` works there. A method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12), which lifts the rule.',
  },
  {
    tool: RULES_TOOL,
    rules: ['hardcoded-secret'],
    describe: (subject) => `The value of \`${subject}\` is a hardcoded secret`,
    allowed:
      'Read the secret from the environment in the composition root (`os.environ["API_TOKEN"]`) and pass it in; keep placeholders such as `"changeme"` out of production code.',
  },
  {
    tool: RULES_TOOL,
    rules: ['credential-shape'],
    describe: () => 'A string has the shape of a credential',
    allowed:
      'Read the credential from the environment in the composition root and pass it in; never commit a key, token, private key or URL with a password.',
  },
  {
    tool: RULES_TOOL,
    rules: ['secret-in-log'],
    describe: (subject) => `\`${subject}\` is a secret and is passed to a log call`,
    allowed:
      'Log that it is set (`logger.info("token set: %s", token is not None)`) or a masked tail, never the value.',
  },
  {
    tool: RULES_TOOL,
    rules: ['io-in-loop'],
    describe: (subject) => `\`${subject}\` runs once per item of a loop`,
    allowed:
      'Batch it: fetch or write all items in one call, or run the calls together with a bounded `asyncio.gather` (a shared `asyncio.Semaphore` acquired in the task) or a `ThreadPoolExecutor.map` when there is no batch API.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unbounded-fan-out'],
    describe: fanOutDescription,
    allowed: fanOutAllowed,
  },
  {
    tool: RULES_TOOL,
    rules: ['skipped-test-without-reason'],
    describe: (subject) => skipDescription(subject),
    allowed: (subject) => skipAllowed(subject),
  },
  {
    tool: RULES_TOOL,
    rules: ['sleep-in-test'],
    describe: (subject) => `\`${subject}\` waits for real time in a test`,
    allowed:
      "Control the clock instead of waiting: inject a fake clock or patch `time.sleep` with `monkeypatch`. To wait for a condition, poll it in a loop until a deadline (`while not ready():` with a `time.monotonic()` check and a short sleep) or use the library's wait helper, such as Playwright's `expect(locator).to_be_visible()`.",
  },
  {
    tool: RULES_TOOL,
    rules: ['retry-in-test'],
    describe: (subject) => `\`${subject}\` runs a failing test again`,
    allowed:
      'Remove the retry: a test that passes on a later attempt hides a flaky or racy test. Fix the cause, such as waiting on the condition instead of a fixed delay or isolating shared state.',
  },
  {
    tool: RULES_TOOL,
    rules: ['mocked-subject-in-test'],
    describe: (subject) =>
      `\`${subject}\` is part of the module this test is named after, so the test replaces the code it should check`,
    allowed:
      'Run the real code: pass its collaborators in (a parameter, a constructor argument or a fixture) and give the test a fake of them, test a helper through the public function that calls it, and patch only what the module imports (`patch("shop.cart.requests.get")`).',
  },
  {
    tool: RULES_TOOL,
    rules: ['negative-wait-in-test'],
    describe: (subject) =>
      `\`${subject}\` proves that nothing happens by waiting out its timeout, so the test is slow and depends on the delay`,
    allowed:
      'Check the state at once (`assert not event.is_set()`, `assert queue.empty()`), or control the clock or scheduler the code waits on, move it past the delay and assert right away.',
  },
  {
    tool: RULES_TOOL,
    rules: ['tautological-assert'],
    describe: (subject) => `\`${subject}\` can never fail`,
    allowed:
      'Assert on the result of the code under test: `assert total(order) == Decimal("12.50")`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['test-without-assertion'],
    describe: (subject) => `Test \`${subject}\` has no assertion`,
    allowed:
      'Assert the outcome: `assert result == expected`, `with pytest.raises(SomeError):`, or call one of the assertion helpers the project tests use.',
  },
  {
    tool: RULES_TOOL,
    rules: ['real-clock-in-test'],
    describe: (subject) => `\`${subject}()\` reads the real clock in a test`,
    allowed:
      'Freeze or inject the time: pass a fixed aware `datetime` in (`datetime(2026, 1, 1, tzinfo=timezone.utc)`), use `freezegun` or `time_machine`, or patch the clock with `monkeypatch`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['random-in-test'],
    describe: (subject) => `\`${subject}()\` draws random values in a test`,
    allowed:
      'Use fixed values, or seed the generator (`random.Random(42)`) and pass it in, so a failure reproduces.',
  },
  {
    tool: RULES_TOOL,
    rules: ['global-state-leak-in-test'],
    describe: (subject) =>
      `\`${subject}\` changes process-wide state in a test and nothing puts it back, so the tests after it depend on the order they run in`,
    allowed:
      'Let pytest undo it: `monkeypatch.setenv`, `monkeypatch.setattr` or `mock.patch.dict(os.environ, ...)`, or save the old value and restore it in `finally`, after `yield` in a fixture, or in `tearDown`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['network-in-test'],
    describe: (subject) => `\`${subject}\` reaches the network in a unit test`,
    allowed:
      'Replace the network with a fake: patch the client with `monkeypatch`, use `responses` or `respx`, or move the test to an `integration/` folder.',
  },
  {
    tool: RULES_TOOL,
    rules: ['server-or-container-per-test'],
    describe: (subject) =>
      `\`${subject}()\` starts a container, server, process or git repository for each test`,
    allowed:
      'Start it once: a `scope="session"` or `scope="module"` fixture that resets its state between tests, or `setup_class`/`setUpClass`. Or test the logic against an in-memory implementation and keep the real transport for transport tests. An exception fits only when each test needs a fresh instance.',
  },
  {
    tool: RULES_TOOL,
    rules: ['uncollected-tests'],
    describe: (subject) => `\`${subject}\` defines tests that the test run does not collect`,
    allowed: (subject) => uncollectedAllowed(subject),
  },
  {
    tool: RULES_TOOL,
    rules: ['test-helper-in-source'],
    describe: (subject) => `\`${subject}\` is test support inside the production source`,
    allowed:
      "Move test helpers and fixtures into the tests folder (`tests/support/`, `conftest.py`) so they do not ship with the package. A library's public `testing` module is allowed when the package `__init__.py` imports it or lists it in `__all__`.",
  },
];
