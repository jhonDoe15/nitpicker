# Tests

Part of the [nitpicker-python](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Tests: use the project's runner (pytest, unittest, Django or nose2). Every test asserts something. Every branch you add needs a test, and a
  surviving mutant fails: assert the exact value, so a changed line breaks a test. A test you add
  or edit takes at most 5 s (`slow-test`), or 30 s under an `integration` or `e2e` folder or with
  `@pytest.mark.integration` (registered when the project uses `--strict-markers`): patch the clock
  instead of `time.sleep` and fake network, database and disk access. A test over budget is run
  again alone without coverage and fails only if it is still over. Lift a legitimate one in the
  top-level `exceptions` with `{ "rule": "slow-test", "paths": [...], "reason": "..." }`.
- Assert the value, not that something is there (`weak-assertion`): no `assert x`, `assert x is not None`
  or `assert len(x) > 0` as the whole check, and no `m.assert_called()` or `assert_called_with(ANY)`; assert
  the exact value, contents or length and the call's arguments. A not-null check is fine when the test uses `x` afterwards.
- Tests put back what they change for the whole process (`global-state-leak-in-test`): set environment
  variables and attributes with `monkeypatch.setenv`/`monkeypatch.setattr` or `mock.patch.dict(os.environ, ...)`,
  not `os.environ[...] =`, `settings.DEBUG = True`, `time.tzset()` or `locale.setlocale(...)`; or restore the old
  value in `finally`, after `yield` in a fixture, or in `tearDown`.
- Start a container, server, process or git repository once, not for each test
  (`server-or-container-per-test`): a fixture that starts one and serves several tests takes
  `scope="session"` or `scope="module"` and resets its state between tests; `setup_method`,
  `setUp` and `setup_function` do not start one; two tests do not make the same start.
