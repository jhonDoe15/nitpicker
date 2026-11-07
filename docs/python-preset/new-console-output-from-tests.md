# New console output from tests

Part of the [Python preset guide](../python-preset.md).

- **Rule.** `test-console-output` (as for [TypeScript](../usage.md#console-output-from-tests)) fails a
  change when a pytest test prints a message the base run did not print. The usual cause is work
  that outlives a test or an error a handler now logs and swallows: a thread or task still running,
  a resource closed twice, a deprecated call. A message counts when it is written to standard error,
  logged at `WARNING` or above (through any logger; the exception's type and message are added for
  `logger.exception`), or raised as a warning (`DeprecationWarning: ...`). Standard output
  (`print`) never counts, and neither does a log record of a test that takes the `caplog` fixture,
  because that test asserts on its logs, nor the standard error copy of a `WARNING` or higher
  record `caplog` captured (a project handler from `dictConfig`, or loguru's default sink), as a
  mocked console is silent in TypeScript. One record is one message: a logger with its own handler
  on standard error is reported once, from standard error, also in a test that takes `capsys`, and
  so is a record that reaches standard error a second way (a `QueueListener`, a stream opened on
  `/dev/stderr`, a handler that writes with `click.echo(err=True)`). A standard error line is
  taken for such a copy only when it is the whole line: the record's message, or the line one of
  its handlers formats. Any other line stays, even one that contains the message (`log.warning("failed")`
  hides no `Upload failed: connection refused`), and two identical lines from two sources may count
  once. A log call whose
  message cannot be formatted is left to the project's handlers and `logging.raiseExceptions`; the
  plugin never makes it fail a test. Standard error printed while pytest
  imports and collects a file is given to that file with no test name; a warning raised then is
  given to the file the warning points at (its `location`, which can be the production module that
  warns), or to the project root when that file is outside the project. What a fixture with a
  wider scope than a function (`session`, `package`, `module`, `class`) logs, prints to standard
  error or warns while it sets up or tears down is given to the file that defines it (a
  `conftest.py`, or the test module, with the class name for a fixture defined in a class; a fixture
  a plugin wraps, such as a `pytest-asyncio` one, by the function under `__wrapped__`), not to
  the test that happened to run first, so a new test that uses it adds no message. Its warnings
  stay where pytest recorded them and are only charged to that file: the plugin does not raise
  them again, so `filterwarnings` entries that name a module keep matching. This holds with
  context-aware warnings too (the default of free-threaded Python 3.14, or
  `-X context_aware_warnings=1`), where pytest's record is found through the warnings context. The TypeScript
  preset does the same with Vitest, which gives the output of a `beforeAll` hook to its file or
  suite; Java findings name the module, not the test class, so they do not move either.
- **Logging.** The plugin does not add a handler: it reads each record as a logger hands it to its
  handlers, so `logging.basicConfig` in a `conftest.py` or at import still configures the root
  logger, and `dictConfig` or `basicConfig(force=True)` cannot remove it.
- **Matching.** The same as TypeScript, with the same code: a stderr traceback is one message
  without its frames and source lines, numbers, paths, times and ids are normalized, each message is
  reported once per test file, and a message that differs from a base message by one random-looking
  word matches it. `testConsole.allow` drops a third-party message the project cannot fix
  (`{ "contains": "old client is deprecated", "paths": ["tests/legacy/**"], "reason": "..." }`), and
  an entry for `test-console-output` in the top-level `exceptions`, as with the other presets,
  lifts the rule for some test files.
  The message names `testConsole.allow` and the top-level route.
- **Measurement.** nitpicker's console plugin (`test-runs/pytest_console.py`, which the timed pytest
  run of [slow tests](slow-tests.md) loads) records the messages in the run that measures coverage,
  on both snapshots. Standard error is read from pytest's capture. When the
  project turns capture off (`-s` or `--capture=no` in `addopts` or `PYTEST_ADDOPTS`), the plugin
  switches nitpicker's run back to `--capture=fd` before pytest starts capturing. That is safe for
  the run: nitpicker shows no live test output anyway, and the only change a test can notice is that
  reading standard input raises pytest's "reading from stdin while output is captured" error instead
  of reaching the end of input. `--capture=sys` and `tee-sys` are left as they are. `unittest` runs
  are not checked.
- **Missing report.** The plugin writes `test-console.json` first thing when pytest unconfigures.
  When pytest ran tests but left no report (the process was killed, or ended itself without
  unwinding), the run gets a `test-console/test-console-report-missing` tool error, the id the
  TypeScript preset uses, instead of passing unchecked. A test that calls `os._exit` ends the
  coverage run too, so that run fails on its missing coverage data first.
