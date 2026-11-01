# Python: nitpicker rules

The Python rules nitpicker's own script checks (`python-rules/*`), the coupling and import-cycle findings, the ruff format check and the finding for a run in which no tests ran. This page lists 62 rules. [All pages](README.md).

The guide for these rules: [docs/python-preset.md](../python-preset.md).

Unless an entry says otherwise:

- **Presets:** Python
- **Analyzers:** `python`
- **Why it is on:** One of the checks of nitpicker's own Python script. It runs on the Python source and tests and names one allowed form.

<a id="coupling-no-import-outside-roots"></a>

### `coupling/no-import-outside-roots`

Production code imports a project module outside `python.sourceRoots`.

- **Why it is on:** Code outside the source roots is not checked by the gate, so production code must not depend on it.
- **Allowed form:** Move the imported code under a source root, or add its folder to `python.sourceRoots` so the gate checks it.
- **Exception:** It has no exception: set `python.sourceRoots`.

<a id="coupling-no-production-cycles"></a>

### `coupling/no-production-cycles`

A module that is in an import cycle with other modules of its package.

- **Why it is on:** A cycle makes modules impossible to load, test or replace one at a time.
- **Allowed form:** Move what they share into a module both import, or pass it in instead of importing it back.
- **Exception:** If this is intended, add `{"rule":"no-production-cycles","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="coupling-package-cycle"></a>

### `coupling/package-cycle`

A package that is in a dependency cycle with other packages.

- **Why it is on:** A cycle makes packages impossible to load, test or replace one at a time.
- **Allowed form:** Move the shared types down into one of them, or invert one dependency behind an interface.
- **Exception:** If this is intended, add `{"rule":"package-cycle","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-any-in-domain"></a>

### `python-rules/any-in-domain`

`<name>` uses `Any` in domain code.

- **Allowed form:** Use the real type, a `Protocol`, a `TypeVar` or a frozen dataclass; parse untrusted data at the boundary so the domain only sees typed values.
- **Exception:** If this is intended, add `{"rule":"any-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-atomic-update-across-await"></a>

### `python-rules/atomic-update-across-await`

`<name>` is updated from a value read before an `await`: another task can change it while this one is suspended, and the write then overwrites that change.

- **Allowed form:** Await the new value into a local first and read and write the shared state in one step with no `await` between them (`delta = await fetch()` then `self.total += delta`), or serialize the whole update with one lock that every task shares (`self.lock = asyncio.Lock()` in `__init__`, then `async with self.lock:`); a lock or semaphore built in the method, a semaphore of more than one slot and a lock passed in are not proof.
- **Exception:** If this is intended, add `{"rule":"atomic-update-across-await","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-blind-suppress"></a>

### `python-rules/blind-suppress`

`<name>` ignores every error.

- **Allowed form:** Name the expected exception: `contextlib.suppress(KeyError)`; or handle it or re-raise it with its cause. In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).
- **Exception:** If this is intended, add `{"rule":"blind-suppress","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-boolean-flag-parameter"></a>

### `python-rules/boolean-flag-parameter`

`<name>` switches a public function between two behaviors.

- **Allowed form:** Make the flag keyword-only, `def send(message, *, urgent=False)`, split the function into two named for each behavior, or pass an enum. click, typer and FastAPI pass options by keyword, so `def command(*, verbose: bool)` works there. A method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12), which lifts the rule.
- **Exception:** If this is intended, add `{"rule":"boolean-flag-parameter","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-cancellation-not-propagated"></a>

### `python-rules/cancellation-not-propagated`

`<name>` has a path that consumes cancellation or replaces it with another error.

- **Allowed form:** After cleanup, use a bare `raise` or re-raise the unchanged caught cancellation. Keep intentional cancellation boundaries in the backend's timeout or cancellation scope; returning a failure result or chaining another error does not propagate cancellation.
- **Exception:** If this is intended, add `{"rule":"cancellation-not-propagated","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-catch-log-without-exception"></a>

### `python-rules/catch-log-without-exception`

`<name>` logs a caught error without its traceback.

- **Allowed form:** Keep the traceback: `logger.exception("message")` or `logger.error("message", exc_info=True)`; the exception as an argument drops it. Re-raising after the log also passes.
- **Exception:** If this is intended, add `{"rule":"catch-log-without-exception","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-clock-now"></a>

### `python-rules/clock-now`

`<name>()` reads the clock in domain code.

- **Allowed form:** Take the time as a parameter or a `Callable[[], datetime]` and call `datetime.now(tz=UTC)` in the composition root.
- **Exception:** If this is intended, add `{"rule":"clock-now","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-compatibility-shim"></a>

### `python-rules/compatibility-shim`

`<name>` keeps an old name working.

- **Allowed form:** When code moves or is renamed, change every caller in the same change and delete the old name: keep no alias, forwarding function, module `__getattr__`, `@deprecated` marker or deprecation warning. A published library keeps the deprecation of its public names, and that path takes an exception.
- **Exception:** If this is intended, add `{"rule":"compatibility-shim","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-credential-shape"></a>

### `python-rules/credential-shape`

A string has the shape of a credential.

- **Allowed form:** Read the credential from the environment in the composition root and pass it in; never commit a key, token, private key or URL with a password.
- **Exception:** If this is intended, add `{"rule":"credential-shape","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-enum-string-constants"></a>

### `python-rules/enum-string-constants`

\<name> are string constants that belong in one enum.

- **Allowed form:** Declare an enum: `class Status(enum.StrEnum): ACTIVE = "active"` on Python 3.11+, otherwise `class Status(str, enum.Enum)`.
- **Exception:** If this is intended, add `{"rule":"enum-string-constants","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-falsy-default"></a>

### `python-rules/falsy-default`

`<name>` replaces a falsy argument with a default, so `0`, `""`, `[]` and `False` count as not given.

- **Allowed form:** Test for `None` only: `limit if limit is not None else DEFAULT_LIMIT`, or `if limit is None: limit = DEFAULT_LIMIT`.
- **Exception:** If this is intended, add `{"rule":"falsy-default","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-frozen-dataclass"></a>

### `python-rules/frozen-dataclass`

Dataclass \<name> is not frozen.

- **Allowed form:** Declare records as `@dataclass(frozen=True)` and build a changed copy with `dataclasses.replace`.
- **Exception:** If this is intended, add `{"rule":"frozen-dataclass","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-generic-name"></a>

### `python-rules/generic-name`

`<name>` has a generic name.

- **Allowed form:** Name it for its job (`price_rounding.py`, `OrderRepository`); shared logic that belongs to no feature lives in `shared/` under a name that says what it does.
- **Exception:** If this is intended, add `{"rule":"generic-name","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-handwritten-boundary-guard"></a>

### `python-rules/handwritten-boundary-guard`

`<name>` checks untrusted data by hand.

- **Allowed form:** Parse untrusted input once at the boundary with pydantic (`Model.model_validate(data)`) in an `adapters/` package, not with `isinstance` checks or a `TypeGuard`.
- **Exception:** If this is intended, add `{"rule":"handwritten-boundary-guard","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-hardcoded-secret"></a>

### `python-rules/hardcoded-secret`

`<name>` holds a hardcoded secret.

- **Allowed form:** Read the secret from the environment in the composition root (`os.environ["API_TOKEN"]`) and pass it in; keep placeholders such as `"changeme"` out of production code.
- **Exception:** If this is intended, add `{"rule":"hardcoded-secret","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-http-without-timeout"></a>

### `python-rules/http-without-timeout`

`<name>` can wait forever: it has no timeout.

- **Allowed form:** Pass a timeout in seconds: `urllib.request.urlopen(url, timeout=10)`, `session.get(url, timeout=10)`, or set `socket.setdefaulttimeout(10)` once at startup for `urllib`; an `httpx` client keeps its 5 second default unless you pass another number (`httpx.Client(timeout=10)`), never `timeout=None`.
- **Exception:** If this is intended, add `{"rule":"http-without-timeout","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-import-time-effect"></a>

### `python-rules/import-time-effect`

`<name>()` runs when the module is imported, so every import, tests included, performs it.

- **Allowed form:** Move the call into a function and call that from the composition root (`main.py`, a `create_app` factory) or under `if __name__ == "__main__":`, passing the result in.
- **Exception:** If this is intended, add `{"rule":"import-time-effect","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-inconsistent-attribute-locking"></a>

### `python-rules/inconsistent-attribute-locking`

\<name>: a thread or task that writes here races with the locked writer, so an update is lost or another reader sees a stale value.

- **Allowed form:** Hold the same lock for every write of the attribute (`with self.lock:` or `async with self.lock:`), or keep the state where only the lock holder changes it (a method that takes the lock and returns the new value). `__init__`, `__new__`, `__post_init__`, a write in a nested function or lambda, a method the class calls while it holds a lock, a decorated method and a method that calls `acquire()` are not reported.
- **Exception:** If this is intended, add `{"rule":"inconsistent-attribute-locking","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-io-in-domain"></a>

### `python-rules/io-in-domain`

`<name>` does input or output in domain code.

- **Allowed form:** Keep `domain/` pure: define a `Protocol` in the domain and implement it in `adapters/`, then pass the adapter in.
- **Exception:** If this is intended, add `{"rule":"io-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-io-in-loop"></a>

### `python-rules/io-in-loop`

`<name>` runs once per item of a loop.

- **Allowed form:** Batch it: fetch or write all items in one call, or run the calls together with a bounded `asyncio.gather` (a shared `asyncio.Semaphore` acquired in the task) or a `ThreadPoolExecutor.map` when there is no batch API.
- **Exception:** If this is intended, add `{"rule":"io-in-loop","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-lock-order-inversion"></a>

### `python-rules/lock-order-inversion`

\<name>: two threads or tasks that run both can each hold one lock and wait forever for the other, a deadlock that no test reliably shows.

- **Allowed form:** Take nested locks in one order everywhere in the class (if any path takes `self.a` and then `self.b`, no path takes `self.b` and then `self.a`), or guard the state with one lock. Only locks held in attributes of the class or the module (`self.lock`, `Registry.LOCK`) are compared, when they are built there from `threading.Lock`, `threading.RLock`, `threading.Condition`, a one-slot `threading.Semaphore` or an `asyncio`, AnyIO or Trio lock, or are named like a lock where the build is out of sight; a lock passed in, held in a local or taken in a called method is not followed.
- **Exception:** If this is intended, add `{"rule":"lock-order-inversion","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-logger-in-domain"></a>

### `python-rules/logger-in-domain`

`<name>` is imported into domain code.

- **Allowed form:** Return a result that says what happened, or raise a domain error, and let `adapters/` or the composition root log it.
- **Exception:** If this is intended, add `{"rule":"logger-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-module-level-mutable-state"></a>

### `python-rules/module-level-mutable-state`

`<name>` changes a module-level collection.

- **Allowed form:** Keep the state in an object that is created in the composition root and passed in, or build a new immutable value and return it. A registry filled once at import time (a decorator that adds the function to a table) is not run-time state; the exception route below covers its path.
- **Exception:** If this is intended, add `{"rule":"module-level-mutable-state","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-module-state-in-domain"></a>

### `python-rules/module-state-in-domain`

Domain code uses the module state `<name>`.

- **Allowed form:** Receive the state as a parameter and return the new value; the composition root creates the object and passes it in.
- **Exception:** If this is intended, add `{"rule":"module-state-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-network-in-test"></a>

### `python-rules/network-in-test`

`<name>` reaches the network in a unit test.

- **Allowed form:** Replace the network with a fake: patch the client with `monkeypatch`, use `responses` or `respx`, or move the test to an `integration/` folder.
- **Exception:** If this is intended, add `{"rule":"network-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-no-inline-suppression"></a>

### `python-rules/no-inline-suppression`

Inline suppression `# <name>`.

- **Allowed form:** Remove the comment and fix the code.
- **Exception:** If this is intended, add `{"rule":"no-inline-suppression","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-no-type-check"></a>

### `python-rules/no-type-check`

`<name>` is excluded from type checking by `@no_type_check`.

- **Allowed form:** Remove the decorator and annotate the code so the checker can verify it.
- **Exception:** If this is intended, add `{"rule":"no-type-check","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-not-type-checking"></a>

### `python-rules/not-type-checking`

`<name>` hides code from the type checkers.

- **Allowed form:** Put the code in the normal flow; `if TYPE_CHECKING:` is only for imports that annotations need.
- **Exception:** If this is intended, add `{"rule":"not-type-checking","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-parameter-mutation"></a>

### `python-rules/parameter-mutation`

`<name>` changes the argument the caller passed in.

- **Allowed form:** Build and return a new value (`[*items, item]`, `{**table, key: value}`), or copy the argument first (`items = [*items]`) when the function needs a working copy; do not hand a result back through a parameter.
- **Exception:** If this is intended, add `{"rule":"parameter-mutation","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-process-env-access"></a>

### `python-rules/process-env-access`

`<name>` reads the process environment outside the composition root.

- **Allowed form:** Read the environment once in the composition root (`main.py`, `settings.py`, a `composition_root/` package) and pass the values in as arguments or a frozen settings dataclass.
- **Exception:** If this is intended, add `{"rule":"process-env-access","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-pydantic-any-field"></a>

### `python-rules/pydantic-any-field`

The pydantic field `<name>` is typed `Any`.

- **Allowed form:** Give the field its real type (`str`, `int`, a nested model, `Literal[...]`) or constrain it with `Field(min_length=1)` so the model validates it.
- **Exception:** If this is intended, add `{"rule":"pydantic-any-field","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-pydantic-boundary"></a>

### `python-rules/pydantic-boundary`

\<name> is imported outside an adapters/ package.

- **Allowed form:** Use pydantic only in an `adapters/` package to parse untrusted input (`Model.model_validate(data)`), and pass frozen dataclasses on from there.
- **Exception:** If this is intended, add `{"rule":"pydantic-boundary","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-pydantic-extra-allow"></a>

### `python-rules/pydantic-extra-allow`

The pydantic model `<name>` accepts unknown fields.

- **Allowed form:** Set `model_config = ConfigDict(extra="forbid")` (or leave the default `ignore`) and declare every field the model needs.
- **Exception:** If this is intended, add `{"rule":"pydantic-extra-allow","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-random-in-domain"></a>

### `python-rules/random-in-domain`

`<name>()` draws randomness in domain code.

- **Allowed form:** Take the value, a `random.Random` or an id factory as a parameter and create it in the composition root.
- **Exception:** If this is intended, add `{"rule":"random-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-random-in-test"></a>

### `python-rules/random-in-test`

`<name>()` draws random values in a test.

- **Allowed form:** Use fixed values, or seed the generator (`random.Random(42)`) and pass it in, so a failure reproduces.
- **Exception:** If this is intended, add `{"rule":"random-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-real-clock-in-test"></a>

### `python-rules/real-clock-in-test`

`<name>()` reads the real clock in a test.

- **Allowed form:** Freeze or inject the time: pass a fixed `datetime` in, use `freezegun` or `time_machine`, or patch the clock with `monkeypatch`.
- **Exception:** If this is intended, add `{"rule":"real-clock-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-repeated-string-literal"></a>

### `python-rules/repeated-string-literal`

The string "\<name>" is repeated three times or more.

- **Allowed form:** Name it once as a constant (`PENDING = "pending"`), or as a member of an enum when the strings form a set of states.
- **Exception:** If this is intended, add `{"rule":"repeated-string-literal","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-secret-in-log"></a>

### `python-rules/secret-in-log`

`<name>` is a secret and is passed to a log call.

- **Allowed form:** Log that it is set (`logger.info("token set: %s", token is not None)`) or a masked tail, never the value.
- **Exception:** If this is intended, add `{"rule":"secret-in-log","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-shell-command"></a>

### `python-rules/shell-command`

`<name>` runs a command through a shell.

- **Allowed form:** Run the program directly with the arguments as a list and leave the shell out: `subprocess.run(["git", "status"], check=True)`; `shell=False` is the default.
- **Exception:** If this is intended, add `{"rule":"shell-command","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-skipped-test-without-reason"></a>

### `python-rules/skipped-test-without-reason`

`<name>` skips a test without a reason.

- **Allowed form:** Give the reason: `@pytest.mark.skip(reason="needs the staging database")`, `pytest.skip("...")`; or fix or delete the test.
- **Exception:** If this is intended, add `{"rule":"skipped-test-without-reason","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-sleep-in-test"></a>

### `python-rules/sleep-in-test`

`<name>` waits for real time in a test.

- **Allowed form:** Control the clock instead of waiting: inject a fake clock, patch `time.sleep` with `monkeypatch`, or poll a condition with a bounded retry helper.
- **Exception:** If this is intended, add `{"rule":"sleep-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-sql-string-formatting"></a>

### `python-rules/sql-string-formatting`

`<name>` runs a query built by formatting a string.

- **Allowed form:** Pass the values as query parameters: `cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))`, `session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})` in SQLAlchemy, `Model.objects.raw("... WHERE id = %s", [user_id])` in Django. Build placeholder lists from placeholders alone (`", ".join(["%s"] * len(ids))`) and optional filters as `conditions.append("name = %s")` joined with `" AND "`. A table or column name comes from a fixed lookup (`COLUMNS[key]` over a dict of constant names), a check against a constant set that stops otherwise (`if column not in ALLOWED: raise ValueError(column)`), a `Literal[...]` or `Enum` value, the schema (`table.name`, `model._meta.db_table`), or a quoting call (`psycopg.sql.Identifier(name)`, `dialect.identifier_preparer.quote(name)`).
- **Exception:** If this is intended, add `{"rule":"sql-string-formatting","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-stub-beside-source"></a>

### `python-rules/stub-beside-source`

`<name>` sits beside its source and replaces it for the checkers.

- **Allowed form:** Delete the `.pyi` file and annotate the `.py` file itself.
- **Exception:** If this is intended, add `{"rule":"stub-beside-source","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-swallowed-exception"></a>

### `python-rules/swallowed-exception`

`<name>` swallows the error: it only logs it or returns a default, and carries on.

- **Allowed form:** Re-raise it with its cause (`raise DomainError(...) from error`), return a failure result that carries the error (`return Rejected(str(error))`), or return the errors the function builds along with its result (`return results, errors`); logging alone is not handling. `contextlib.suppress(SpecificError)` ignores one expected error. In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).
- **Exception:** If this is intended, add `{"rule":"swallowed-exception","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-task-outlives-resource"></a>

### `python-rules/task-outlives-resource`

`<name>`: the resource closes when its `with` block ends, while the child task can still use it.

- **Allowed form:** Open the resource around the whole task group, or inside the child task.
- **Exception:** If this is intended, add `{"rule":"task-outlives-resource","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-tautological-assert"></a>

### `python-rules/tautological-assert`

`<name>` can never fail.

- **Allowed form:** Assert on the result of the code under test: `assert total(order) == Decimal("12.50")`.
- **Exception:** If this is intended, add `{"rule":"tautological-assert","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-test-helper-in-source"></a>

### `python-rules/test-helper-in-source`

`<name>` is test support inside the production source.

- **Allowed form:** Move test helpers and fixtures into the tests folder (`tests/support/`, `conftest.py`) so they do not ship with the package. A library's public `testing` module is allowed when the package `__init__.py` imports it or lists it in `__all__`.
- **Exception:** If this is intended, add `{"rule":"test-helper-in-source","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-test-without-assertion"></a>

### `python-rules/test-without-assertion`

Test `<name>` has no assertion.

- **Allowed form:** Assert the outcome: `assert result == expected`, `with pytest.raises(SomeError):`, or call one of the assertion helpers the project tests use.
- **Exception:** If this is intended, add `{"rule":"test-without-assertion","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-tls-verification-off"></a>

### `python-rules/tls-verification-off`

`<name>` turns off TLS certificate verification, or lets the environment turn it off.

- **Allowed form:** Keep verification on in every environment and trust the certificate authority instead: `requests.get(url, verify="/etc/ssl/private-ca.pem", timeout=10)`, `ssl.create_default_context(cafile=ca_path)`, `tlsCAFile=ca_path` for MongoDB, or `REQUESTS_CA_BUNDLE` and `SSL_CERT_FILE` pointing at the bundle. A server that asks for optional client certificates uses `ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)` with `verify_mode = ssl.CERT_OPTIONAL`; a server context that loads its own certificate needs no `verify_mode = ssl.CERT_NONE` line: delete it.
- **Exception:** If this is intended, add `{"rule":"tls-verification-off","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-todo-without-issue"></a>

### `python-rules/todo-without-issue`

The task marker `<name>` has no issue.

- **Allowed form:** Name the issue right after the marker (`# TODO(#123): ...`, `# TODO PROJ-123: ...` or a link), or delete the comment and track the work in the issue tracker.
- **Exception:** If this is intended, add `{"rule":"todo-without-issue","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-tri-state-boolean"></a>

### `python-rules/tri-state-boolean`

`<name>` is a boolean that can also be `None`, a third state.

- **Allowed form:** Name the three states with an enum (`class Consent(Enum)` with `GRANTED`, `DENIED` and `UNKNOWN`), or take a keyword-only `bool` with a default (`*, urgent: bool = False`) when `None` only means false. A method that overrides a base class takes `@typing.override` and keeps the base signature.
- **Exception:** If this is intended, add `{"rule":"tri-state-boolean","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unbounded-fan-out"></a>

### `python-rules/unbounded-fan-out`

`<name>` starts `<call>` for every element of `<collection>` at once.

- **Allowed form:** A large collection exhausts the remote service's connections or rate limit. Hold one `asyncio.Semaphore(8)` created outside the tasks with `async with limit:` around each call, gather fixed-size slices (`items[i : i + 20]`), or make one batch call when the API has one.
- **Exception:** If this is intended, add `{"rule":"unbounded-fan-out","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-uncollected-tests"></a>

### `python-rules/uncollected-tests`

`<name>` defines tests that the test run does not collect.

- **Allowed form:** Name the file so pytest collects it (`test_*.py` or `*_test.py`), or add its pattern to `python_files` in the pytest configuration.
- **Exception:** If this is intended, add `{"rule":"uncollected-tests","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unsafe-deserialization"></a>

### `python-rules/unsafe-deserialization`

`<name>` can build arbitrary Python objects from the document.

- **Allowed form:** Load YAML with `yaml.safe_load(text)`, `yaml.safe_load_all(text)` for several documents, or `Loader=yaml.SafeLoader` (or a subclass of it).
- **Exception:** If this is intended, add `{"rule":"unsafe-deserialization","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unsafe-path-join"></a>

### `python-rules/unsafe-path-join`

`<name>()` builds a file path from its input without a containment check.

- **Allowed form:** Resolve the path and check it stays inside the base before using it: `target = (base / name).resolve()`, then `if not target.is_relative_to(base.resolve()): raise ValueError(...)`.
- **Exception:** If this is intended, add `{"rule":"unsafe-path-join","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unshielded-cleanup-await"></a>

### `python-rules/unshielded-cleanup-await`

`<name>` can be cancelled before the cleanup finishes, so the resource may stay open.

- **Allowed form:** Run the cleanup in a shielded scope with a deadline: `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True): await resource.aclose()` (`anyio.CancelScope(deadline=anyio.current_time() + 5, shield=True)` in AnyIO; `move_on_after(5, shield=True)` needs Trio 0.27 or later). A shield without a deadline can hang shutdown.
- **Exception:** If this is intended, add `{"rule":"unshielded-cleanup-await","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-weak-hmac"></a>

### `python-rules/weak-hmac`

`<name>` signs with HMAC-MD5, which is no longer approved for message authentication.

- **Allowed form:** Sign with `hmac.new(key, message, hashlib.sha256)` and compare with `hmac.compare_digest`; HMAC-SHA1 is accepted where a protocol fixes it (TOTP, OAuth 1.0a).
- **Exception:** If this is intended, add `{"rule":"weak-hmac","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-no-tests-ran"></a>

### `python/no-tests-ran`

The test run collected no tests.

- **Why it is on:** Coverage, CRAP and mutation results mean nothing when no test ran.
- **Allowed form:** Keep the project tests, or restore the ones the change removed.
- **Exception:** It has no exception: restore the tests.

<a id="ruff-format-format"></a>

### `ruff-format/format`

A file is not formatted with the formatter of the project.

- **Printed as:** `ruff-format/format` and `black/format`
- **Why it is on:** One layout for every file, so that reviews are about the code and not its formatting.
- **Allowed form:** Format the file with the formatter (`python.formatter`: ruff or black).
- **Exception:** It has no exception: format the file.
