import { RULES_TOOL } from './tool.mjs';

function aliasParts(subject) {
  return subject.split(' -> ');
}

function visibility(name) {
  if (name.startsWith('__')) {
    return 2;
  }
  return name.startsWith('_') ? 1 : 0;
}

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

export const SMELL_HINTS = [
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
    rules: ['hardcoded-secret'],
    describe: (subject) => `\`${subject}\` holds a hardcoded secret`,
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
      'Batch it: fetch or write all items in one call, or run the calls together with `asyncio.gather` or a `ThreadPoolExecutor.map` when there is no batch API.',
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
      'Control the clock instead of waiting: inject a fake clock, patch `time.sleep` with `monkeypatch`, or poll a condition with a bounded retry helper.',
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
      'Freeze or inject the time: pass a fixed `datetime` in, use `freezegun` or `time_machine`, or patch the clock with `monkeypatch`.',
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
    rules: ['network-in-test'],
    describe: (subject) => `\`${subject}\` reaches the network in a unit test`,
    allowed:
      'Replace the network with a fake: patch the client with `monkeypatch`, use `responses` or `respx`, or move the test to an `integration/` folder.',
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
  {
    tool: RULES_TOOL,
    rules: ['forwarding-method-alias'],
    describe: (subject = '') => {
      const [name, target] = aliasParts(subject);
      return `\`${name}\` only forwards its parameters to \`${target}\` and has the same signature`;
    },
    allowed: (subject = '') => {
      const [name, target] = aliasParts(subject);
      if (target === undefined) {
        return 'Call the target method directly and delete the alias.';
      }
      return visibility(name) < visibility(target)
        ? `Rename \`${target}\` to \`${name}\` and delete the alias.`
        : `Call \`${target}\` directly and delete the alias.`;
    },
  },
];
