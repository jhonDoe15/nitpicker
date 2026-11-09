# Tests

Part of the [nitpicker-python](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Tests: use the project's runner (pytest, unittest, Django or nose2). Every test asserts something. Every branch you add needs a test, and a
  surviving mutant fails: assert the exact value, so a changed line breaks a test. A test you add
  or edit takes at most 5 s (`slow-test`), or 30 s under an `integration` or `e2e` folder or with
  `@pytest.mark.integration` (registered when the project uses `--strict-markers`): patch the clock
  instead of `time.sleep` and fake network, database and disk access. A test over budget is run
  again alone without coverage and fails only if it is still over. Lift a legitimate one in the
  top-level `exceptions` with `{ "rule": "slow-test", "paths": [...], "reason": "..." }`.
- Never patch the module a test is named after (`mocked-subject-in-test`): in `test_cart.py`, no
  `patch("shop.cart.total")`, no `patch.object(cart, "helper")` on a `Cart`, no `Mock(spec=Cart)`.
  Pass the collaborators in and fake them, test a helper through the public function that calls
  it, and patch only what the module imports (`patch("shop.cart.requests.get")`).
- Tests put back what they change for the whole process (`global-state-leak-in-test`): set environment
  variables and attributes with `monkeypatch.setenv`/`monkeypatch.setattr` or `mock.patch.dict(os.environ, ...)`,
  not `os.environ[...] =`, `settings.DEBUG = True`, `time.tzset()` or `locale.setlocale(...)`; or restore the old
  value in `finally`, after `yield` in a fixture, or in `tearDown`.
- Start a container, server, process or git repository once, not for each test
  (`server-or-container-per-test`): a fixture that starts one and serves several tests takes
  `scope="session"` or `scope="module"` and resets its state between tests; `setup_method`,
  `setUp` and `setup_function` do not start one; two tests do not make the same start.
- Tests do not change state that other tests of the module see (`shared-test-state`): no `append`, `update`,
  `add`, item assignment or `global` rebinding of a module-level list, dict or set, and no change to a class
  attribute from a test method. Build the state in the test or in a function-scoped fixture, or reset it in an
  `autouse` fixture or `setup_method`.
- Test each public inverse pair on its own output (`untested-round-trip`): for `encode_token`/
  `decode_token` or `Order.to_dict`/`Order.from_dict`, one test calls both,
  `assert Order.from_dict(order.to_dict()) == order`.
